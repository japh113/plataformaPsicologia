import db from '../../config/db.js';
import { resolveChange } from './contact-change.service.js';
import { openContact,sealContact,activeContactKeyId } from './contact-change.crypto.js';
import { deliverVerification } from './verification.delivery.js';
// Each lease is a row lock: a crashed process rolls back and another instance resumes.
// Delivery is at least once; a crash after external acceptance may repeat a harmless notice.
export async function processContactChangeMaintenance({deliver=deliverVerification,batchSize=100}={}) {
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
  let processed=0;
  for (let i=0;i<batchSize;i++) {
    const client=await db.getClient();
    try {
      await client.query('BEGIN');
      const row=(await client.query(`SELECT * FROM contact_change_notices WHERE status='pending'
        AND (next_attempt_at<=clock_timestamp() OR retry_until<=clock_timestamp())
        ORDER BY next_attempt_at,id FOR UPDATE SKIP LOCKED LIMIT 1`)).rows[0];
      if (!row) {await client.query('COMMIT');break;}
      const now=(await client.query('SELECT clock_timestamp() AS now')).rows[0].now;
      if (row.retry_until<=now) {
        await client.query("UPDATE contact_change_notices SET status='exhausted',destination_cipher=NULL WHERE id=$1",[row.id]);
      } else {
        try {
          const context='notice:'+row.user_id+':'+row.id;
          const contact=openContact(row.destination_cipher,context);
          await deliver({userId:row.user_id,channel:row.channel,contact,purpose:'contact_change_notice',
            noticeId:row.id,requestId:row.request_id,kind:row.kind,createdAt:row.created_at.toISOString()});
          await client.query("UPDATE contact_change_notices SET status='delivered',destination_cipher=NULL,attempts=attempts+1 WHERE id=$1",[row.id]);
        } catch {
          const delay=Math.min(3600,60*2**Math.min(row.attempts,6));
          await client.query(`UPDATE contact_change_notices SET attempts=attempts+1,
            next_attempt_at=LEAST(retry_until,$2::timestamptz+($3*INTERVAL '1 second')) WHERE id=$1`,[row.id,now,delay]);
        }
      }
      await client.query('COMMIT');processed++;
    } catch(error) {await client.query('ROLLBACK');throw error;}
    finally {client.release();}
  }
  // Rewrap undelivered destinations independently of when their next retry is due.
  let activeKey;
  try {activeKey=activeContactKeyId();} catch {return {processed,keyUnavailable:true};}
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
  return {processed,keyUnavailable};
}
export function startContactChangeProcessor() {
  if (process.env.CONTACT_CHANGE_PROCESSOR!=='true') return;
  let running=false;
  const run=async()=>{
    if(running)return;running=true;
    try {const result=await processContactChangeMaintenance();if(result.keyUnavailable)console.error('Contact change key unavailable; expiry processing continues.');}
    catch {console.error('Contact change maintenance unavailable; retry scheduled.');}
    finally {running=false;}
  };
  const timer=setInterval(run,60000);timer.unref();void run();
  return ()=>clearInterval(timer);
}
