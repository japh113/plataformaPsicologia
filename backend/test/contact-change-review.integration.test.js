import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import app from '../src/app.js';
import db from '../src/config/db.js';
import env from '../src/config/env.js';
import {migrate} from '../scripts/episode-migration.js';
import {createSandboxDatabase,installBaseline} from '../scripts/episode-sandbox.js';
import {processContactChangeMaintenance} from '../src/modules/auth/contact-change.processor.js';
const fixture=new URL('./fixtures/contact-notice-worker.js',import.meta.url);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const bounded=async(promise,ms)=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Regression harness deadline exceeded')),ms);})]);}finally{clearTimeout(timer);}};

test('PR12 review P2 regressions on new PostgreSQL and real HTTP',{skip:process.env.RUN_EPISODE_INTEGRATION!=='true'},async t=>{
 assert.equal(env.dbHost,'db');assert.equal(env.dbName,'psicopanel_integrity_test');assert.equal(env.nodeEnv,'test');assert.match(process.env.EPISODE_TEST_RUN_ID||'',/^[a-f0-9-]{36}$/);
 const control=await db.getClient(),name='psicopanel_episode_contact_review',client=await createSandboxDatabase(control,name);
 const originalQuery=db.query,originalGet=db.getClient;
 let server,pool,index=0;
 const password='Review-Fixture-Only-437!';
 try{
  await installBaseline(client);await migrate(client,{expectedDatabase:name,target:'005'});
  pool=new pg.Pool({host:'db',database:name,user:env.dbUser,password:env.dbPassword});db.query=(sql,values)=>pool.query(sql,values);db.getClient=()=>pool.connect();
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const request=async(path,token,body)=>{const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/auth'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,body:await response.json()};};
  const login=async(email,pw=password)=>(await request('/login',null,{email,password:pw})).body.data;
  const account=async()=>{index++;const email='review-'+index+'@review.invalid';assert.equal((await request('/register/patient',null,{firstName:'Review',email,password,birthDate:'1990-01-01',phone:'+525588'+String(index).padStart(6,'0')})).status,202);return login(email);};
  const start=async a=>{const response=await request('/contact-changes',a.token,{operationId:randomUUID(),channel:'email',contact:'candidate-'+randomUUID()+'@review.invalid',password:a.password||password});assert.equal(response.status,200);return response.body.data.request;};
  const drain=()=>processContactChangeMaintenance({deliveryWorker:fixture,deliveryWorkerData:{mode:'success'},deliver:async()=>{}});
  const resetPending=async()=>{await client.query("UPDATE contact_change_requests SET status='cancelled',candidate_cipher=NULL,candidate_digest=NULL,source_digest=NULL,authorized_session_hash=NULL,reauthenticated_at=NULL,authorized_version=NULL WHERE status='pending'");await drain();};
  await t.test('P2-1 password-only reset invalidates pending C, clears authority/challenge/candidate and frees slot',async()=>{
   const a=await account(),row=await start(a);
   assert.equal((await request('/contact-changes/'+row.id+'/resend',a.token,{operationId:randomUUID()})).status,200);
   const token=(await request('/password-reset/request',null,{email:a.user.email})).body.data.preview.resetToken;
   const freshPassword='New-Review-Fixture-Only-438!';
   assert.equal((await request('/password-reset/confirm',null,{token,password:freshPassword})).status,200);
   const stored=(await client.query('SELECT * FROM contact_change_requests WHERE id=$1',[row.id])).rows[0];
   assert.equal(stored.status,'invalidated');
   for(const field of ['candidate_cipher','candidate_digest','source_digest','authorized_session_hash','reauthenticated_at','authorized_version'])assert.equal(stored[field],null,field);
   assert.ok((await client.query('SELECT invalidated_at FROM contact_verification_challenges WHERE change_request_id=$1',[row.id])).rows[0].invalidated_at);
   assert.equal((await request('/me',a.token)).status,401);
   const fresh=await login(a.user.email,freshPassword);fresh.password=freshPassword;assert.ok((await start(fresh)).id);
  });
  await t.test('P2-2 hung delivery releases PostgreSQL locks, permits independent purge and is actually terminated',async()=>{
   await resetPending();const a=await account(),row=await start(a),observation=new SharedArrayBuffer(4),counter=new Int32Array(observation);
   let releaseLegacy;const legacyHang=new Promise(resolve=>{releaseLegacy=resolve;});
   // Legacy injector reproduces the reviewed implementation; the corrected implementation
   // ignores it and runs the exact same non-resolving behavior inside the terminable worker.
   const running=processContactChangeMaintenance({batchSize:1,deliveryWorker:fixture,deliveryWorkerData:{mode:'hang',observation},deliveryTimeoutMs:1500,deliver:async()=>{Atomics.add(counter,0,1);await legacyHang;throw Error('Released red-test fixture');}});
   try{
    for(let i=0;i<100&&Atomics.load(counter,0)===0;i++)await pause(10);
    assert.ok(Atomics.load(counter,0)>0,'delivery began');
    await client.query('BEGIN');
    try{await client.query('SELECT id FROM contact_change_notices WHERE request_id=$1 FOR UPDATE NOWAIT',[row.id]);}finally{await client.query('ROLLBACK');}
    const b=await account(),expired=await start(b);
    await client.query("UPDATE contact_change_requests SET created_at=clock_timestamp()-INTERVAL '25 hours',expires_at=clock_timestamp()-INTERVAL '1 hour' WHERE id=$1",[expired.id]);
    await client.query("UPDATE contact_change_notices SET retry_until=clock_timestamp()-INTERVAL '1 second' WHERE request_id=$1",[expired.id]);
    await bounded(processContactChangeMaintenance({batchSize:0}),800);
    assert.equal((await client.query('SELECT candidate_cipher FROM contact_change_requests WHERE id=$1',[expired.id])).rows[0].candidate_cipher,null);
    const purged=(await client.query('SELECT status,destination_cipher FROM contact_change_notices WHERE request_id=$1',[expired.id])).rows[0];assert.equal(purged.status,'exhausted');assert.equal(purged.destination_cipher,null);
    await bounded(running,3000);
    const stopped=Atomics.load(counter,0);await pause(100);assert.equal(Atomics.load(counter,0),stopped,'underlying delivery worker stopped, not merely raced');
    const failed=(await client.query('SELECT * FROM contact_change_notices WHERE request_id=$1',[row.id])).rows[0];assert.equal(failed.status,'pending');assert.equal(failed.attempts,1);assert.ok(failed.next_attempt_at>Date.now());
   }finally{releaseLegacy();await bounded(running,4000);}
  });

  await t.test('P2-2 expired lease recovers after crash and stale owner cannot overwrite successor delivery',async()=>{
   await resetPending();const a=await account(),row=await start(a),observation=new SharedArrayBuffer(4),counter=new Int32Array(observation);
   const original=processContactChangeMaintenance({batchSize:1,deliveryWorker:fixture,deliveryWorkerData:{mode:'hang',observation},deliveryTimeoutMs:1200});
   for(let i=0;i<100&&Atomics.load(counter,0)===0;i++)await pause(10);
   assert.ok(Atomics.load(counter,0)>0);
   const lease=(await client.query('SELECT lease_token FROM contact_change_notices WHERE request_id=$1',[row.id])).rows[0].lease_token;assert.ok(lease);
   await client.query("UPDATE contact_change_notices SET lease_until=clock_timestamp()-INTERVAL '1 second' WHERE request_id=$1",[row.id]);
   await drain();await bounded(original,3000);
   const final=(await client.query('SELECT * FROM contact_change_notices WHERE request_id=$1',[row.id])).rows[0];
   assert.equal(final.status,'delivered');assert.equal(final.attempts,2);assert.equal(final.destination_cipher,null);assert.equal(final.lease_token,null);
  });
  await t.test('P2-2 expired 72h destination is purged while another worker is still suspended',async()=>{
   await resetPending();const a=await account(),row=await start(a),observation=new SharedArrayBuffer(4),counter=new Int32Array(observation);
   const running=processContactChangeMaintenance({batchSize:1,deliveryWorker:fixture,deliveryWorkerData:{mode:'hang',observation},deliveryTimeoutMs:1000});
   for(let i=0;i<100&&Atomics.load(counter,0)===0;i++)await pause(10);
   await client.query("UPDATE contact_change_notices SET retry_until=clock_timestamp()-INTERVAL '1 second' WHERE request_id=$1",[row.id]);
   await bounded(processContactChangeMaintenance({batchSize:0}),500);
   const purged=(await client.query('SELECT * FROM contact_change_notices WHERE request_id=$1',[row.id])).rows[0];
   assert.equal(purged.status,'exhausted');assert.equal(purged.destination_cipher,null);assert.equal(purged.lease_token,null);
   await bounded(running,2500);
   assert.equal((await client.query('SELECT status FROM contact_change_notices WHERE request_id=$1',[row.id])).rows[0].status,'exhausted');
  });
  await t.test('P2-3 slow two-minute simulated failures schedule exponential wait from fresh failure time, capped at retry_until',async()=>{
   await resetPending();const a=await account(),row=await start(a),get=db.getClient;
   let agedSnapshots=0;
   db.getClient=async()=>{const c=await pool.connect();let ageNext=false;return {release:()=>c.release(),query:async(sql,values)=>{
    const result=await c.query(sql,values);
    if(String(sql).includes('SELECT * FROM contact_change_notices')&&result.rows[0]?.request_id===row.id)ageNext=true;
    else if(ageNext&&String(sql).includes('SELECT clock_timestamp() AS now')){result.rows[0].now=new Date(result.rows[0].now.getTime()-120000);ageNext=false;agedSnapshots++;}
    return result;
   }};};
   try{
    for(const delay of [60,120]){
     const marker=(await client.query('SELECT clock_timestamp() AS now')).rows[0].now;
     await processContactChangeMaintenance({batchSize:1,deliveryWorker:fixture,deliveryWorkerData:{mode:'fail'},deliver:async()=>{throw Error('Two simulated minutes elapsed since captured snapshot');}});
     const notice=(await client.query('SELECT * FROM contact_change_notices WHERE request_id=$1',[row.id])).rows[0];
     assert.ok(notice.next_attempt_at.getTime()>=marker.getTime()+delay*1000-50,'backoff begins after failure, not two minutes earlier');
     assert.ok(notice.next_attempt_at<=notice.retry_until);
     await client.query('UPDATE contact_change_notices SET next_attempt_at=clock_timestamp() WHERE request_id=$1',[row.id]);
    }
    assert.equal(agedSnapshots,2,'both attempts used aged pre-delivery snapshots');
    await client.query("UPDATE contact_change_notices SET retry_until=clock_timestamp()+INTERVAL '30 seconds' WHERE request_id=$1",[row.id]);
    await processContactChangeMaintenance({batchSize:1,deliveryWorker:fixture,deliveryWorkerData:{mode:'fail'},deliver:async()=>{throw Error('fail');}});
    const capped=(await client.query('SELECT next_attempt_at,retry_until FROM contact_change_notices WHERE request_id=$1',[row.id])).rows[0];assert.equal(capped.next_attempt_at.getTime(),capped.retry_until.getTime());
   }finally{db.getClient=get;}
  });
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));db.query=originalQuery;db.getClient=originalGet;
  if(pool)await pool.end();await client.end();control.release();await db.close();
 }
});
