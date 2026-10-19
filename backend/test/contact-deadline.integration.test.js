import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import db from '../src/config/db.js';
import env from '../src/config/env.js';
import {migrate} from '../scripts/episode-migration.js';
import {createSandboxDatabase,installBaseline,syntheticFixture} from '../scripts/episode-sandbox.js';
import {sealContact} from '../src/modules/auth/contact-change.crypto.js';
import {processContactChangeMaintenance,maintainContactChangeData} from '../src/modules/auth/contact-change.processor.js';
const worker=new URL('./fixtures/contact-deadline-worker.js',import.meta.url);

test('P2-4 notification deadline survives delayed COMMIT on isolated PostgreSQL',{skip:process.env.RUN_EPISODE_INTEGRATION!=='true'},async t=>{
 assert.equal(env.dbHost,'db');assert.equal(env.dbName,'psicopanel_integrity_test');assert.equal(env.nodeEnv,'test');assert.match(process.env.EPISODE_TEST_RUN_ID||'',/^[a-f0-9-]{36}$/);
 const control=await db.getClient(),name='psicopanel_episode_contact_deadline',client=await createSandboxDatabase(control,name);
 const originalQuery=db.query,originalGet=db.getClient;let pool;
 try {
  await installBaseline(client);await syntheticFixture(client);await migrate(client,{expectedDatabase:name,target:'005'});
  pool=new pg.Pool({host:'db',database:name,user:env.dbUser,password:env.dbPassword});db.query=(sql,values)=>pool.query(sql,values);
  const reset=()=>{db.query=(sql,values)=>pool.query(sql,values);db.getClient=()=>pool.connect();};
  const fixture=async(initial=1000)=>{
   const request=randomUUID(),notice=randomUUID(),observation=new SharedArrayBuffer(16),counter=new Int32Array(observation);
   await client.query(`INSERT INTO contact_change_requests(id,user_id,patient_id,channel,status,session_version,created_at,expires_at)
     SELECT $1,'p','p','email','cancelled',session_version,clock_timestamp(),clock_timestamp()+INTERVAL '24 hours' FROM users WHERE id='p'`,[request]);
   await client.query(`INSERT INTO contact_change_notices(id,request_id,user_id,channel,kind,destination_cipher,status,created_at,retry_until,next_attempt_at)
     VALUES($1,$2,'p','email','started',$3,'pending',clock_timestamp()-INTERVAL '72 hours',clock_timestamp()+($4*INTERVAL '1 millisecond'),clock_timestamp())`,[notice,request,sealContact('p@deadline.invalid','notice:p:'+notice),initial]);
   return {notice,observation,counter};
  };
  const stored=async notice=>(await client.query('SELECT * FROM contact_change_notices WHERE id=$1',[notice])).rows[0];
  const exhausted=async notice=>{const row=await stored(notice);assert.equal(row.status,'exhausted');assert.equal(row.destination_cipher,null);assert.equal(row.lease_token,null);};
  const onCommit=(notice,hook)=>{
   let commits=0;
   db.getClient=async()=>{const c=await pool.connect();let claimed=false;return {release:()=>c.release(),query:async(sql,values)=>{
    const result=await c.query(sql,values);
    if(String(sql).includes('SET lease_token=$2')&&result.rows[0]?.id===notice)claimed=true;
    if(sql==='COMMIT'&&claimed){claimed=false;commits++;await hook();}
    return result;
   }};};return ()=>commits;
  };
  const waitBoot=async counter=>{for(let i=0;i<100&&Atomics.load(counter,2)===0;i++)await new Promise(r=>setTimeout(r,10));assert.equal(Atomics.load(counter,2),1,'worker booted before its startup gate');};
  const release=gate=>{Atomics.store(new Int32Array(gate),0,1);Atomics.notify(new Int32Array(gate),0);};
  reset();
  for(const [initial,commit] of [[1000,1000],[1000,2000]])await t.test(`P2-4 ${initial}ms remaining, ${commit}ms simulated COMMIT: no adapter, exhausted and purged`,async()=>{
   const {notice,observation,counter}=await fixture(initial);
   const commits=onCommit(notice,()=>client.query("UPDATE contact_change_notices SET retry_until=clock_timestamp()+($2*INTERVAL '1 millisecond') WHERE id=$1",[notice,initial-commit]));
   try {
    await processContactChangeMaintenance({batchSize:1,deliveryWorker:worker,deliveryWorkerData:{observation}});
    assert.equal(commits(),1,'claim COMMIT was delayed at its return boundary');
    assert.equal(Atomics.load(counter,0),0,'adapter must never start after retry_until');
    await exhausted(notice);
   } finally {reset();await client.query("UPDATE contact_change_notices SET status='exhausted',destination_cipher=NULL,lease_token=NULL,lease_until=NULL WHERE id=$1",[notice]);}
  });
  for(const [initial,commit] of [[1000,400],[15000,12000]])await t.test(`P2-4 ${initial}ms minus ${commit}ms COMMIT: worker shares at most ${initial-commit}ms`,async()=>{
   const {notice,observation,counter}=await fixture(initial);
   const commits=onCommit(notice,()=>client.query("UPDATE contact_change_notices SET retry_until=clock_timestamp()+($2*INTERVAL '1 millisecond') WHERE id=$1",[notice,initial-commit]));
   try {
    await processContactChangeMaintenance({batchSize:1,deliveryWorker:worker,deliveryWorkerData:{observation}});
    assert.equal(commits(),1);assert.equal(Atomics.load(counter,0),1);
    assert.ok(Atomics.load(counter,1)>0&&Atomics.load(counter,1)<=initial-commit,'no fresh ten seconds granted at worker startup');
    assert.equal((await stored(notice)).status,'delivered');
   } finally {reset();}
  });
  await t.test('P2-4 expiry during post-COMMIT query charges its entire round trip and purges',async()=>{
   const {notice,observation,counter}=await fixture();let queries=0;
   onCommit(notice,()=>client.query("UPDATE contact_change_notices SET retry_until=clock_timestamp()+INTERVAL '150 milliseconds' WHERE id=$1",[notice]));
   db.query=async(sql,values)=>{const result=await pool.query(sql,values);if(String(sql).includes('AS remaining_ms')&&values[0]===notice){queries++;await pool.query('SELECT pg_sleep(0.20)');}return result;};
   try {await processContactChangeMaintenance({batchSize:1,deliveryWorker:worker,deliveryWorkerData:{observation}});assert.equal(queries,1);assert.equal(Atomics.load(counter,0),0);await exhausted(notice);}finally{reset();}
  });
  await t.test('P2-4 expiry during worker startup invokes no adapter; startup consumes the original budget',async()=>{
   const {notice,observation,counter}=await fixture(500),startupGate=new SharedArrayBuffer(4);
   const running=processContactChangeMaintenance({batchSize:1,deliveryWorker:worker,deliveryWorkerData:{observation,startupGate}});
   try {await waitBoot(counter);await new Promise(r=>setTimeout(r,550));await running;assert.equal(Atomics.load(counter,0),0);await exhausted(notice);}finally{release(startupGate);await running;reset();}
  });
  await t.test('P2-4 replaced lease after COMMIT: old owner neither delivers nor changes successor state',async()=>{
   const {notice,observation,counter}=await fixture(5000),successor=randomUUID();
   onCommit(notice,()=>client.query("UPDATE contact_change_notices SET lease_token=$2,lease_until=clock_timestamp()+INTERVAL '30 seconds' WHERE id=$1",[notice,successor]));
   try {
    await processContactChangeMaintenance({batchSize:1,deliveryWorker:worker,deliveryWorkerData:{observation}});
    const row=await stored(notice);assert.equal(Atomics.load(counter,0),0);assert.equal(row.status,'pending');assert.equal(row.lease_token,successor);assert.ok(row.destination_cipher);
   } finally {reset();await client.query("UPDATE contact_change_notices SET status='exhausted',destination_cipher=NULL,lease_token=NULL,lease_until=NULL WHERE id=$1",[notice]);}
  });
  await t.test('P2-4 lease takeover during startup: post-startup DB grant rejects old worker, no resurrection',async()=>{
   const {notice,observation,counter}=await fixture(5000),startupGate=new SharedArrayBuffer(4),otherObservation=new SharedArrayBuffer(16);
   const running=processContactChangeMaintenance({batchSize:1,deliveryWorker:worker,deliveryWorkerData:{observation,startupGate}});
   try {
    await waitBoot(counter);await client.query("UPDATE contact_change_notices SET lease_until=clock_timestamp()-INTERVAL '1 second' WHERE id=$1",[notice]);
    await processContactChangeMaintenance({batchSize:1,deliveryWorker:worker,deliveryWorkerData:{observation:otherObservation}});
    assert.equal(new Int32Array(otherObservation)[0],1);release(startupGate);await running;
    assert.equal(Atomics.load(counter,0),0);assert.equal((await stored(notice)).status,'delivered');assert.equal((await stored(notice)).destination_cipher,null);
   } finally {release(startupGate);await running;reset();}
  });
  await t.test('P2-4 concurrent 72h purge during startup: old owner cannot deliver or revive exhausted notice',async()=>{
   const {notice,observation,counter}=await fixture(5000),startupGate=new SharedArrayBuffer(4);
   const running=processContactChangeMaintenance({batchSize:1,deliveryWorker:worker,deliveryWorkerData:{observation,startupGate}});
   try {
    await waitBoot(counter);await client.query("UPDATE contact_change_notices SET retry_until=clock_timestamp()-INTERVAL '1 second' WHERE id=$1",[notice]);
    await maintainContactChangeData({batchSize:0});await exhausted(notice);release(startupGate);await running;
    assert.equal(Atomics.load(counter,0),0);await exhausted(notice);
   } finally {release(startupGate);await running;reset();}
  });
 } finally {db.query=originalQuery;db.getClient=originalGet;if(pool)await pool.end();await client.end();control.release();await db.close();}
});
