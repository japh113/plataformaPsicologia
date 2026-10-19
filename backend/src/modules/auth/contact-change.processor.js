import {randomUUID} from 'node:crypto';
import db from '../../config/db.js';
import {resolveChange} from './contact-change.service.js';
import {openContact,sealContact,activeContactKeyId} from './contact-change.crypto.js';
import {deliverContactNotice,NOTICE_DELIVERY_TIMEOUT_MS} from './contact-change.delivery.js';
import {monotonicNow,remainingMilliseconds,deadlineFromDatabase} from './contact-change.deadline.js';

// No external delivery in this path: scheduled independently even while a batch runs.
export async function maintainContactChangeData({batchSize=100}={}) {
  let keyUnavailable=false;
  const users=(await db.query(`SELECT DISTINCT user_id FROM contact_change_requests
    WHERE status='pending' ORDER BY user_id`)).rows;
  for (const {user_id:userId} of users) {
    const client=await db.getClient();
    try {
      await client.query('BEGIN');
      const locked=await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE SKIP LOCKED',[userId]);
      if (locked.rowCount) {
        const now=(await client.query('SELECT clock_timestamp() AS now')).rows[0].now;
        const rows=(await client.query("SELECT * FROM contact_change_requests WHERE user_id=$1 AND status='pending' FOR UPDATE",[userId])).rows;
        for (const row of rows) {
          if (row.expires_at<=now) await resolveChange(client,row.id,'expired',now);
          else {
            // A missing retiring key must not stop expiry/purge for other accounts.
            try {
              if (row.candidate_cipher.kid!==activeContactKeyId()) {
                const context='candidate:'+userId+':'+row.id;
                await client.query('UPDATE contact_change_requests SET candidate_cipher=$2 WHERE id=$1',[row.id,sealContact(openContact(row.candidate_cipher,context),context)]);
              }
            } catch(error) {if(error.status!==503)throw error;keyUnavailable=true;}
          }
        }
      }
      await client.query('COMMIT');
    } catch(error) {await client.query('ROLLBACK');throw error;}
    finally {client.release();}
  }
  // No OTP or recoverable OTP is kept in an outbox. HMAC destinations remain only
  // through the shared 24h quota window; minimal account/action audit has no new retention policy.
  await db.query(`UPDATE contact_verification_challenges SET secret_digest='' WHERE purpose='contact_change'
    AND secret_digest<>'' AND (consumed_at IS NOT NULL OR invalidated_at IS NOT NULL OR expires_at<=clock_timestamp())`);
  await db.query(`DELETE FROM contact_verification_challenges WHERE purpose='contact_change'
    AND created_at<=clock_timestamp()-INTERVAL '24 hours' AND (consumed_at IS NOT NULL OR invalidated_at IS NOT NULL OR expires_at<=clock_timestamp())`);
  await db.query(`UPDATE contact_change_notices SET status='exhausted',destination_cipher=NULL,
    lease_token=NULL,lease_until=NULL WHERE status='pending' AND retry_until<=clock_timestamp()`);
  // Rewrap undelivered destinations independently of when their next retry is due.
  let activeKey;
  try {activeKey=activeContactKeyId();} catch {return {keyUnavailable:true};}
  const pending=(await db.query("SELECT id,user_id FROM contact_change_notices WHERE status='pending' AND destination_cipher->>'kid'<>$1 ORDER BY id LIMIT $2",[activeKey,batchSize])).rows;
  for (const row of pending) {
    const client=await db.getClient();
    try {
      await client.query('BEGIN');
      const current=(await client.query("SELECT destination_cipher FROM contact_change_notices WHERE id=$1 AND status='pending' FOR UPDATE SKIP LOCKED",[row.id])).rows[0];
      if (current?.destination_cipher && current.destination_cipher.kid!==activeContactKeyId()) {
        const context='notice:'+row.user_id+':'+row.id;
        await client.query('UPDATE contact_change_notices SET destination_cipher=$2 WHERE id=$1',[row.id,sealContact(openContact(current.destination_cipher,context),context)]);
      }
      await client.query('COMMIT');
    } catch(error) {await client.query('ROLLBACK');if(error.status!==503)throw error;keyUnavailable=true;}
    finally {client.release();}
  }
  return {keyUnavailable};
}

// Claim in a short transaction; ciphertext stays encrypted until locks are released.
async function claimNotice() {
  const client=await db.getClient();
  try {
    await client.query('BEGIN');
    const row=(await client.query(`SELECT * FROM contact_change_notices WHERE status='pending'
      AND next_attempt_at<=clock_timestamp() AND retry_until>clock_timestamp()
      AND (lease_until IS NULL OR lease_until<=clock_timestamp())
      ORDER BY next_attempt_at,id FOR UPDATE SKIP LOCKED LIMIT 1`)).rows[0];
    if(!row){await client.query('COMMIT');return null;}
    const now=(await client.query('SELECT clock_timestamp() AS now')).rows[0].now;
    if(row.retry_until<=now){
      await client.query("UPDATE contact_change_notices SET status='exhausted',destination_cipher=NULL,lease_token=NULL,lease_until=NULL WHERE id=$1",[row.id]);
      await client.query('COMMIT');return null;
    }
    const token=randomUUID();
    const claimed=(await client.query(`UPDATE contact_change_notices SET lease_token=$2,
      lease_until=LEAST(retry_until,clock_timestamp()+INTERVAL '30 seconds'),attempts=attempts+1
      WHERE id=$1 RETURNING *`,[row.id,token])).rows[0];
    await client.query('COMMIT');return claimed;
  } catch(error){await client.query('ROLLBACK');throw error;}
  finally{client.release();}
}

// An unlocked, fresh PostgreSQL sample AFTER claim COMMIT (and again after worker startup).
async function authorizeNotice(row,maxMs,ceilingNs) {
  const sentNs=monotonicNow();
  const current=(await db.query(`SELECT status,lease_token,lease_until,retry_until,clock_timestamp() AS now,
    EXTRACT(EPOCH FROM (LEAST(lease_until,retry_until)-clock_timestamp()))*1000 AS remaining_ms
    FROM contact_change_notices WHERE id=$1`,[row.id])).rows[0];
  if(!current||current.status!=='pending'||current.lease_token!==row.lease_token||!current.lease_until)return null;
  const deadline=deadlineFromDatabase(current.remaining_ms,sentNs,{maxMs,ceilingNs});
  return deadline!==null&&remainingMilliseconds(deadline)>0?deadline:null;
}

async function settleNotice(row,delivered) {
  const client=await db.getClient();
  try {
    await client.query('BEGIN');
    const current=(await client.query(`SELECT id,retry_until,lease_until,attempts FROM contact_change_notices
      WHERE id=$1 AND status='pending' AND lease_token=$2 FOR UPDATE`,[row.id,row.lease_token])).rows[0];
    if(!current){await client.query('COMMIT');return;}
    // Fresh DB time AFTER the failure and AFTER reacquiring the lock, never claim time.
    const now=(await client.query('SELECT clock_timestamp() AS now')).rows[0].now;
    if(current.retry_until>now&&current.lease_until<=now){await client.query('COMMIT');return;}
    if(delivered || current.retry_until<=now){
      await client.query(`UPDATE contact_change_notices SET status=$2,destination_cipher=NULL,
        lease_token=NULL,lease_until=NULL WHERE id=$1`,[row.id,current.retry_until<=now?'exhausted':'delivered']);
    } else {
      const delay=Math.min(3600,60*2**Math.min(current.attempts-1,6));
      await client.query(`UPDATE contact_change_notices SET next_attempt_at=LEAST(retry_until,
        $2::timestamptz+($3*INTERVAL '1 second')),lease_token=NULL,lease_until=NULL WHERE id=$1`,[row.id,now,delay]);
    }
    await client.query('COMMIT');
  } catch(error){await client.query('ROLLBACK');throw error;}
  finally{client.release();}
}

export async function processContactChangeMaintenance({batchSize=100,deliveryWorker,deliveryWorkerData,deliveryTimeoutMs=NOTICE_DELIVERY_TIMEOUT_MS}={}) {
  const maintenance=await maintainContactChangeData({batchSize});
  let processed=0;
  for(let i=0;i<batchSize;i++){
    // Another account's expired destination is purged even during a slow batch.
    await db.query(`UPDATE contact_change_notices SET status='exhausted',destination_cipher=NULL,
      lease_token=NULL,lease_until=NULL WHERE status='pending' AND retry_until<=clock_timestamp()`);
    const row=await claimNotice();if(!row)break;
    let delivered=false;
    try {
      const deadlineNs=await authorizeNotice(row,Math.min(deliveryTimeoutMs,NOTICE_DELIVERY_TIMEOUT_MS));
      if(deadlineNs!==null){
        const contact=openContact(row.destination_cipher,'notice:'+row.user_id+':'+row.id);
        // Decryption and all subsequent work consume the same budget; never renew it.
        if(remainingMilliseconds(deadlineNs)>0){
          await deliverContactNotice({userId:row.user_id,channel:row.channel,contact,purpose:'contact_change_notice',
            noticeId:row.id,requestId:row.request_id,kind:row.kind,createdAt:row.created_at.toISOString()},
          {workerUrl:deliveryWorker,workerData:deliveryWorkerData,timeoutMs:deliveryTimeoutMs,deadlineNs,
            authorize:()=>authorizeNotice(row,Math.min(deliveryTimeoutMs,NOTICE_DELIVERY_TIMEOUT_MS),deadlineNs)});
          delivered=true;
        }
      }
    } catch { /* Failed or terminated isolate: settle using a fresh database clock. */ }
    await settleNotice(row,delivered);processed++;
  }
  return {processed,keyUnavailable:maintenance.keyUnavailable};
}

export function startContactChangeProcessor(){
  if(process.env.CONTACT_CHANGE_PROCESSOR!=='true')return;
  let cleaning=false,delivering=false;
  const cleanup=async()=>{
    if(cleaning)return;cleaning=true;
    try {const result=await maintainContactChangeData();if(result.keyUnavailable)console.error('Contact change key unavailable; expiry processing continues.');}
    catch {console.error('Contact change cleanup unavailable; retry scheduled.');}
    finally{cleaning=false;}
  };
  const delivery=async()=>{
    if(delivering)return;delivering=true;
    try {await processContactChangeMaintenance();}
    catch {console.error('Contact change delivery unavailable; retry scheduled.');}
    finally{delivering=false;}
  };
  const tick=()=>{void cleanup();void delivery();};
  const timer=setInterval(tick,60000);timer.unref();tick();
  return ()=>clearInterval(timer);
}
