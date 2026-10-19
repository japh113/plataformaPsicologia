import { spawn,spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import app from '../src/app.js';
import db from '../src/config/db.js';
import env from '../src/config/env.js';
import { testDeliveries } from '../src/modules/auth/verification.delivery.js';
import { contactDigest } from '../src/modules/auth/identity.service.js';
import { processContactChangeMaintenance } from '../src/modules/auth/contact-change.processor.js';
import { migrate,catalogChecksum } from '../scripts/episode-migration.js';
import { createSandboxDatabase,installBaseline,syntheticFixture } from '../scripts/episode-sandbox.js';

test('005 secure contact changes: real PostgreSQL, HTTP, races and interrupted delivery',{
 skip:process.env.RUN_EPISODE_INTEGRATION!=='true',
},async t=>{
 assert.equal(env.dbHost,'db');assert.equal(env.dbName,'psicopanel_integrity_test');assert.equal(env.nodeEnv,'test');
 assert.match(process.env.EPISODE_TEST_RUN_ID||'',/^[a-f0-9-]{36}$/);
 const control=await db.getClient(),name='psicopanel_episode_contact_http',client=await createSandboxDatabase(control,name);
 const originalQuery=db.query,originalGetClient=db.getClient;
 let pool,server;
 const password='Disposable-Contact-Only-981!';
 try {
  await installBaseline(client);await syntheticFixture(client);await migrate(client,{expectedDatabase:name,target:'004'});
  const ledger=(await client.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows;
  await t.test('004 to 005 concurrent upgrade/replay preserves ledger, rows and prerequisite functions',async()=>{
   const second=new pg.Client({host:'db',database:name,user:env.dbUser,password:env.dbPassword});await second.connect();
   try {const results=await Promise.all([migrate(client,{expectedDatabase:name,target:'005'}),migrate(second,{expectedDatabase:name,target:'005'})]);assert.deepEqual(results.map(r=>r.status).sort(),['already-applied','applied']);}finally{await second.end();}
   assert.deepEqual((await client.query("SELECT * FROM psicopanel_schema_migrations WHERE version<'005' ORDER BY version")).rows,ledger);
   assert.equal((await client.query('SELECT count(*)::int n FROM contact_change_requests')).rows[0].n,0);
   await assert.rejects(migrate(client,{expectedDatabase:name,target:'004'}),/downgrade/);
  });
  await t.test('fresh installation, partial 005 DDL rollback and drift fail closed',async()=>{
   for(const broken of [false,true]) {
    const nextName='psicopanel_episode_contact_'+(broken?'rollback':'fresh'),next=await createSandboxDatabase(control,nextName);
    try {
     await installBaseline(next);
     if(broken)await next.query('CREATE FUNCTION invalidate_pending_contact_changes() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$');
     await migrate(next,{expectedDatabase:nextName,target:'004'});const before=await catalogChecksum(next);
     if(broken){await assert.rejects(migrate(next,{expectedDatabase:nextName,target:'005'}),/already exists/);assert.equal(await catalogChecksum(next),before);assert.equal((await next.query("SELECT to_regclass('contact_change_requests') n")).rows[0].n,null);}
     else {await migrate(next,{expectedDatabase:nextName,target:'005'});assert.equal((await next.query('SELECT count(*)::int n FROM psicopanel_schema_migrations')).rows[0].n,5);await next.query('ALTER TABLE contact_change_requests ADD COLUMN drift text');await assert.rejects(migrate(next,{expectedDatabase:nextName,target:'005'}),/drift/);}
    }finally{await next.end();}
   }
  });
  pool=new pg.Pool({host:'db',database:name,user:env.dbUser,password:env.dbPassword});db.query=(sql,values)=>pool.query(sql,values);db.getClient=()=>pool.connect();
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const req=async(path,token,body,method=body===undefined?'GET':'POST')=>{
   const res=await fetch('http://127.0.0.1:'+server.address().port+'/api/auth'+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
   return {status:res.status,body:await res.json(),retryAfter:Number(res.headers.get('Retry-After'))};
  };
  const login=async(email,pw=password)=>(await req('/login',null,{email,password:pw})).body.data;
  let n=0;
  const account=async()=>{n++;const email='contact-'+n+'@contact.invalid';await req('/register/patient',null,{firstName:'Ficticia',email,password,birthDate:'1990-01-01',phone:'+525500'+String(n).padStart(6,'0')});return login(email);};
  const start=(a,channel='email',contact='candidate-'+randomUUID()+'@contact.invalid',extra={})=>req('/contact-changes',a.token,{operationId:randomUUID(),channel,contact,password,...extra});
  const op=(a,id,operation,body={})=>req('/contact-changes/'+id+'/'+operation,a.token,body);
  const send=(a,id,operationId=randomUUID())=>op(a,id,'resend',{operationId});
  const last=(a,purpose='contact_change')=>testDeliveries().filter(m=>m.userId===a.user.id&&(m.purpose||'verification')===purpose).at(-1);
  const prepare=async(a,channel='email',contact)=>{const begun=await start(a,channel,contact);assert.equal(begun.status,200);const row=begun.body.data.request;assert.equal((await send(a,row.id)).status,200);assert.equal((await op(a,row.id,'verify',{secret:last(a).secret})).status,200);return row;};
  const verifyEmail=async a=>{
   assert.equal((await req('/verification/email/request',a.token,{})).status,200);
   assert.equal((await req('/verification/email/confirm',a.token,{secret:last(a,'verification').secret})).status,200);
  };
  await t.test('owner-only, password limits persist, no account suspension or secret DTO',async()=>{
   const a=await account(),b=await account();
   assert.equal((await req('/contact-changes')).status,401);
   for(const role of ['support','admin','superadmin']) {
    await client.query("INSERT INTO users(id,first_name,email,password_hash,role) SELECT $1,$1,$2,password_hash,$3 FROM users WHERE id=$4",['contact-'+role,role+'@contact.invalid',role,a.user.id]);
    const operator=await login(role+'@contact.invalid');assert.equal((await start(operator)).status,403);
   }
   const professional=await login('a@episodes.invalid','Episode-Demo-Only-284!');assert.equal((await start(professional)).status,403);
   for(let i=0;i<5;i++)assert.equal((await start(a,'email','wrong@contact.invalid',{password:'Wrong-password'})).status,400);
   const limited=await start(a);assert.equal(limited.status,429);assert.ok(limited.retryAfter>0);
   assert.ok(await login(a.user.email));
   const row=(await start(b)).body.data.request;
   assert.equal((await op(a,row.id,'cancel')).status,404);
   assert.equal((await client.query('SELECT count(*)::int n FROM contact_change_events WHERE user_id=$1 AND action=$2',[a.user.id,'password_failed'])).rows[0].n,5);
   const stored=(await client.query('SELECT candidate_cipher FROM contact_change_requests WHERE id=$1',[row.id])).rows[0];
   assert.equal(JSON.stringify(stored).includes(row.candidate),false);
   const me=await req('/me',b.token);assert.equal(JSON.stringify(me).includes('sessionHash'),false);
  });
  await t.test('idempotent initiation and resend, explicit substitution, cancellation, purpose isolation and shared quotas',async()=>{
   const a=await account(),operationId=randomUUID(),contact='one@contact.invalid';
   const results=await Promise.all([start(a,'email',contact,{operationId}),start(a,'email',contact,{operationId})]);
   assert.deepEqual(results.map(r=>r.status),[200,200]);assert.equal((await client.query('SELECT count(*)::int n FROM contact_change_notices WHERE user_id=$1',[a.user.id])).rows[0].n,1);
   const id=operationId;assert.equal((await start(a)).status,409);
   const sendId=randomUUID();const sent=await Promise.all([send(a,id,sendId),send(a,id,sendId)]);assert.deepEqual(sent.map(r=>r.status),[200,200]);
   const secret=last(a).secret;
   assert.equal((await req('/verification/email/confirm',a.token,{secret})).status,400);
   assert.equal((await send(a,id)).status,429);
   // Ordinary verification may not obtain another account/channel quota slot within 60s.
   assert.equal((await req('/verification/email/request',a.token,{})).status,429);
   await client.query("UPDATE contact_verification_challenges SET created_at=created_at-INTERVAL '61 seconds' WHERE user_id=$1",[a.user.id]);
   assert.equal((await req('/verification/email/request',a.token,{})).status,200);
   assert.equal((await op(a,id,'verify',{secret:last(a,'verification').secret})).status,400);
   const next=await start(a,'email','two@contact.invalid',{replaceRequestId:id});assert.equal(next.status,200);
   assert.equal((await op(a,id,'verify',{secret})).status,409);
   const nextId=next.body.data.request.id;assert.equal((await op(a,nextId,'cancel')).status,200);assert.equal((await op(a,nextId,'cancel')).status,200);
   assert.equal((await client.query("SELECT count(*)::int n FROM contact_verification_challenges WHERE user_id=$1",[a.user.id])).rows[0].n,2);
  });

  await t.test('separate backend processes serialize C starts and share B/C quotas',async()=>{
   const a=await account();
   const child=spawn(process.execPath,['--input-type=module','-e',"import app from './src/app.js';const server=app.listen(0,'127.0.0.1',()=>console.log(server.address().port));"],{env:{...process.env,PGDATABASE:name},stdio:['ignore','pipe','pipe']});
   try {
    const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Second backend unavailable')),5000);child.once('error',reject);child.stdout.once('data',data=>{clearTimeout(timer);resolve(Number(data.toString().trim()));});});
    const remote=async(path,body)=>{const r=await fetch('http://127.0.0.1:'+port+'/api/auth'+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+a.token},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
    const starts=await Promise.all([start(a),remote('/contact-changes',{operationId:randomUUID(),channel:'email',contact:'other-process@contact.invalid',password})]);
    assert.deepEqual(starts.map(r=>r.status).sort(),[200,409]);const id=starts.find(r=>r.status===200).body.data.request.id;
    const sends=await Promise.all([send(a,id),remote('/contact-changes/'+id+'/resend',{operationId:randomUUID()})]);assert.deepEqual(sends.map(r=>r.status).sort(),[200,429]);
   } finally{child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));}
  });
  await t.test('interrupted candidate delivery after commit consumes quota and requires a new challenge',async()=>{
   const a=await account(),row=(await start(a)).body.data.request;
   const previousGet=db.getClient,delivery=env.verificationDelivery,sendId=randomUUID();let interrupt=true;
   db.getClient=async()=>{const c=await pool.connect();return {release:()=>c.release(),query:async(sql,values)=>{const result=await c.query(sql,values);if(sql==='COMMIT'&&interrupt){interrupt=false;env.verificationDelivery='disabled';}return result;}};};
   try{assert.equal((await send(a,row.id,sendId)).status,503);}finally{db.getClient=previousGet;env.verificationDelivery=delivery;}
   const challenge=(await client.query('SELECT * FROM contact_verification_challenges WHERE change_request_id=$1',[row.id])).rows[0];assert.ok(challenge.invalidated_at);
   assert.equal((await send(a,row.id,sendId)).status,409);
   assert.equal((await send(a,row.id)).status,429);assert.equal((await req('/identity',a.token)).body.data.email,a.user.email);
  });
  await t.test('reauthentication expiry, new-session resume, candidate evidence lasts through request and all sessions revoked',async()=>{
   const a=await account(),second=await login(a.user.email);assert.notEqual(a.token,second.token);
   const row=await prepare(a),secret=last(a).secret;
   assert.equal((await op(a,row.id,'verify',{secret})).status,400);
   assert.equal((await op(second,row.id,'confirm')).status,409);
   await client.query("UPDATE contact_change_requests SET reauthenticated_at=clock_timestamp()-INTERVAL '11 minutes' WHERE id=$1",[row.id]);
   assert.equal((await op(a,row.id,'confirm')).status,409);
   assert.equal((await op(second,row.id,'reauthenticate',{password})).status,200);
   assert.equal((await op(a,row.id,'confirm')).status,409);
   const reset=await req('/password-reset/request',null,{email:a.user.email});const resetToken=reset.body.data.preview.resetToken;
   const completed=await op(second,row.id,'confirm');assert.equal(completed.status,200);
   for(const token of [a.token,second.token])assert.equal((await req('/me',token)).status,401);
   assert.equal((await req('/password-reset/confirm',null,{token:resetToken,password:'Changed-Password-Only-312!'})).status,400);
   assert.equal((await req('/login',null,{email:a.user.email,password})).status,401);
   const fresh=await login(row.candidate);assert.ok(fresh.token);
   assert.equal((await req('/identity',fresh.token)).body.data.email,row.candidate);
   assert.ok((await req('/identity',fresh.token)).body.data.emailVerifiedAt);
   assert.equal((await op(fresh,row.id,'confirm')).status,200);
  });
  await t.test('SMS requires current verified email, persists five attempts and preserves verification across expired OTP',async()=>{
   const a=await account();assert.equal((await start(a,'sms','+525500999111')).status,409);await verifyEmail(a);
   const row=(await start(a,'sms','+525500999111')).body.data.request;assert.equal((await send(a,row.id)).status,200);
   const original=last(a),wrong=original.secret==='000000'?'000001':'000000';
   const bad=await Promise.all(Array.from({length:7},()=>op(a,row.id,'verify',{secret:wrong})));
   assert.equal(bad.filter(r=>r.status===400).length,5);assert.equal(bad.filter(r=>r.status===429).length,2);
   await client.query("UPDATE contact_verification_challenges SET created_at=created_at-INTERVAL '61 seconds' WHERE id=$1",[original.challengeId]);
   assert.equal((await send(a,row.id)).status,200);const good=last(a);
   assert.equal((await op(a,row.id,'verify',{secret:original.secret})).status,400);
   assert.equal((await op(a,row.id,'verify',{secret:good.secret})).status,200);
   await client.query("UPDATE contact_verification_challenges SET expires_at=clock_timestamp()-INTERVAL '1 second',created_at=clock_timestamp()-INTERVAL '11 minutes' WHERE id=$1",[good.challengeId]);
   await processContactChangeMaintenance();
   assert.equal((await op(a,row.id,'confirm')).status,200);
   const fresh=await login(a.user.email),identity=(await req('/identity',fresh.token)).body.data;
   assert.ok(identity.emailVerifiedAt);assert.ok(identity.phoneVerifiedAt);assert.equal(identity.phone,'+525500999111');
  });
  await t.test('expiry is checked even with processor stopped; unknown historical contact needs no evidence',async()=>{
   const a=await account(),row=(await start(a)).body.data.request;
   await client.query("UPDATE contact_change_requests SET created_at=clock_timestamp()-INTERVAL '25 hours',expires_at=clock_timestamp()-INTERVAL '1 hour' WHERE id=$1",[row.id]);
   assert.equal((await op(a,row.id,'confirm')).status,409);
   const state=(await req('/contact-changes',a.token)).body.data.request;assert.equal(state.status,'expired');assert.equal(state.candidate,null);
   const stored=(await client.query('SELECT * FROM contact_change_requests WHERE id=$1',[row.id])).rows[0];assert.equal(stored.candidate_cipher,null);
   const historical=await login('p@episodes.invalid','Episode-Demo-Only-284!');assert.ok(historical);
   const hrow=await start({...historical},'email','historical-new@contact.invalid',{password:'Episode-Demo-Only-284!'});assert.equal(hrow.status,200);
  });
  await t.test('email conflict, concurrent confirms and cancel/confirm races have one coherent outcome',async()=>{
   const a=await account(),b=await account();const row=await prepare(a,'email',b.user.email);
   assert.equal((await op(a,row.id,'confirm')).status,409);assert.equal((await req('/identity',a.token)).body.data.email,a.user.email);
   const c=await account(),crow=await prepare(c);
   const both=await Promise.all([op(c,crow.id,'confirm'),op(c,crow.id,'confirm')]);assert.equal(both.filter(r=>r.status===200).length,1);assert.ok(both.some(r=>r.status===401));
   const d=await account(),drow=await prepare(d);const race=await Promise.all([op(d,drow.id,'cancel'),op(d,drow.id,'confirm')]);
   const state=(await client.query('SELECT status FROM contact_change_requests WHERE id=$1',[drow.id])).rows[0].status;
   assert.ok(['cancelled','completed'].includes(state));assert.equal(race.filter(r=>r.status===200).length,1);
  });
  await t.test('start/cancel quotas cannot be reset by replacement; destination quotas span accounts and purposes',async()=>{
   const a=await account();
   for(let i=0;i<5;i++){const row=(await start(a)).body.data.request;assert.ok(row);assert.equal((await op(a,row.id,'cancel')).status,200);}
   assert.equal((await start(a)).status,429);
   const b=await account(),row=(await start(b)).body.data.request;
   for(let i=0;i<10;i++)await client.query("INSERT INTO contact_change_events(user_id,action) VALUES ($1,'cancelled')",[b.user.id]);
   assert.equal((await op(b,row.id,'cancel')).status,429);assert.equal((await start(b,'email','replacement@contact.invalid',{replaceRequestId:row.id})).status,429);
   const target='shared-quota@contact.invalid',digest=contactDigest('email',target),c=await account(),q=(await start(c,'email',target)).body.data.request;
   for(let i=0;i<5;i++)await client.query("INSERT INTO contact_verification_challenges(id,user_id,channel,contact_digest,secret_digest,created_at,expires_at,invalidated_at) VALUES($1,$2,'email',$3,'discarded',clock_timestamp()-INTERVAL '5 minutes',clock_timestamp()+INTERVAL '1 hour',clock_timestamp())",[randomUUID(),a.user.id,digest]);
   assert.equal((await send(c,q.id)).status,429);
  });
  await t.test('reset before confirmation invalidates request; reset request on old email rechecks after acquiring account lock',async()=>{
   const a=await account(),row=await prepare(a);
   const token=(await req('/password-reset/request',null,{email:a.user.email})).body.data.preview.resetToken;
   const race=await Promise.all([req('/password-reset/confirm',null,{token,password:'Fresh-Reset-Password-123!'}),op(a,row.id,'confirm')]);
   assert.equal(race.filter(r=>r.status===200).length,1);
   // Deterministically queue an old-email lookup behind a transaction that commits a contact replacement.
   const b=await account(),brow=await prepare(b),lock=await pool.connect();
   await lock.query('BEGIN');await lock.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[b.user.id]);
   const waiting=req('/password-reset/request',null,{email:b.user.email});
   for(let i=0;i<100;i++){
    const blocked=(await client.query("SELECT count(*)::int n FROM pg_stat_activity WHERE datname=$1 AND wait_event_type='Lock' AND query LIKE '%lower(email)=lower($2)%'",[name])).rows[0].n;
    if(blocked)break;
    await new Promise(resolve=>setTimeout(resolve,10));
    if(i===99)throw Error('Reset did not wait for account lock');
   }
   await lock.query("UPDATE users SET email=$2,session_version=session_version+1 WHERE id=$1",[b.user.id,brow.candidate]);await lock.query('COMMIT');lock.release();
   assert.equal((await waiting).body.data.preview,null);
  });
  await t.test('rollback before commit preserves contact, sessions, notices and clinical data; lost response after commit needs new login',async()=>{
   const a=await account(),row=await prepare(a);
   const previousGet=db.getClient;let inject=true;
   db.getClient=async()=>{const c=await pool.connect();return {release:()=>c.release(),query:(sql,values)=>{if(inject&&String(sql).startsWith('UPDATE patients SET email=')){inject=false;throw Error('Synthetic transaction interruption');}return c.query(sql,values);}};};
   try{assert.equal((await op(a,row.id,'confirm')).status,500);}finally{db.getClient=previousGet;}
   assert.equal((await req('/identity',a.token)).body.data.email,a.user.email);
   assert.equal((await client.query("SELECT count(*)::int n FROM contact_change_notices WHERE request_id=$1 AND kind='completed'",[row.id])).rows[0].n,0);
   assert.equal((await op(a,row.id,'confirm')).status,200);
   // Discard that response: stale bearer is refused, fresh login can read terminal result.
   assert.equal((await req('/contact-changes',a.token)).status,401);
   const fresh=await login(row.candidate);assert.equal((await req('/contact-changes',fresh.token)).body.data.request.status,'completed');
  });
  await t.test('durable notice failure/restart, concurrent processors, 72h exhaustion, immediate payload purge and rotation',async()=>{
   const a=await account(),row=await prepare(a);await op(a,row.id,'confirm');
   await processContactChangeMaintenance({deliver:async()=>{throw Error('Synthetic delivery outage');}});
   const failed=(await client.query('SELECT * FROM contact_change_notices WHERE request_id=$1',[row.id])).rows;assert.equal(failed.length,2);assert.ok(failed.every(n=>n.status==='pending'&&n.attempts===1&&n.destination_cipher));
   await client.query("UPDATE contact_change_notices SET next_attempt_at=clock_timestamp() WHERE request_id=$1",[row.id]);
   const delivered=[];const deliver=async m=>{assert.equal(m.secret,undefined);delivered.push(m.noticeId);};
   await Promise.all([processContactChangeMaintenance({deliver}),processContactChangeMaintenance({deliver})]);
   assert.equal(new Set(delivered).size,delivered.length);
   assert.ok((await client.query('SELECT status,destination_cipher FROM contact_change_notices WHERE request_id=$1',[row.id])).rows.every(n=>n.status==='delivered'&&n.destination_cipher===null));
   const restarted=await account(),restartRow=(await start(restarted)).body.data.request;
   const restart=spawnSync(process.execPath,['--input-type=module','-e',"import db from './src/config/db.js';import {processContactChangeMaintenance} from './src/modules/auth/contact-change.processor.js';try{await processContactChangeMaintenance();}finally{await db.close();}"],{env:{...process.env,PGDATABASE:name},encoding:'utf8'});
   assert.equal(restart.status,0,'Restarted processor must finish without secrets in output');
   assert.equal((await client.query('SELECT status FROM contact_change_notices WHERE request_id=$1',[restartRow.id])).rows[0].status,'delivered');
   const b=await account(),brow=(await start(b)).body.data.request;
   await client.query("UPDATE contact_change_notices SET retry_until=clock_timestamp()-INTERVAL '1 second' WHERE request_id=$1",[brow.id]);
   await processContactChangeMaintenance({deliver:async()=>{throw Error('must not deliver expired');}});
   assert.equal((await client.query('SELECT destination_cipher FROM contact_change_notices WHERE request_id=$1',[brow.id])).rows[0].destination_cipher,null);
   const oldKeys=process.env.CONTACT_CHANGE_KEYS,oldActive=process.env.CONTACT_CHANGE_ACTIVE_KEY_ID;
   try {
    // Rotate active material while preserving the simulator's original decrypting key.
    const {verificationKey}=await import('../src/modules/auth/verification.delivery.js');const {createHash}=await import('node:crypto');
    const original=createHash('sha256').update(verificationKey()).update('contact-change-encryption').digest('base64');
    process.env.CONTACT_CHANGE_KEYS=JSON.stringify({'sandbox-v1':original,next:Buffer.alloc(32,9).toString('base64')});process.env.CONTACT_CHANGE_ACTIVE_KEY_ID='next';
    await processContactChangeMaintenance({deliver:async()=>{throw Error('offline');}});
    assert.equal((await client.query('SELECT candidate_cipher FROM contact_change_requests WHERE id=$1',[brow.id])).rows[0].candidate_cipher.kid,'next');
    await op(b,brow.id,'cancel');
   } finally{process.env.CONTACT_CHANGE_ACTIVE_KEY_ID='sandbox-v1';await processContactChangeMaintenance({deliver:async()=>{throw Error('offline');}});if(oldKeys===undefined)delete process.env.CONTACT_CHANGE_KEYS;else process.env.CONTACT_CHANGE_KEYS=oldKeys;if(oldActive===undefined)delete process.env.CONTACT_CHANGE_ACTIVE_KEY_ID;else process.env.CONTACT_CHANGE_ACTIVE_KEY_ID=oldActive;}
  });

  await t.test('missing retiring key cannot prevent expiry and sensitive payload purge of other accounts',async()=>{
   const a=await account(),row=(await start(a)).body.data.request;
   const b=await account(),expired=(await start(b)).body.data.request;
   await client.query("UPDATE contact_change_requests SET created_at=clock_timestamp()-INTERVAL '25 hours',expires_at=clock_timestamp()-INTERVAL '1 hour' WHERE id=$1",[expired.id]);
   const oldKeys=process.env.CONTACT_CHANGE_KEYS,oldActive=process.env.CONTACT_CHANGE_ACTIVE_KEY_ID;
   try {
    process.env.CONTACT_CHANGE_KEYS=JSON.stringify({unknown:Buffer.alloc(32,11).toString('base64')});process.env.CONTACT_CHANGE_ACTIVE_KEY_ID='unknown';
    const result=await processContactChangeMaintenance({deliver:async()=>{throw Error('offline');}});assert.equal(result.keyUnavailable,true);
    const gone=(await client.query('SELECT status,candidate_cipher FROM contact_change_requests WHERE id=$1',[expired.id])).rows[0];assert.equal(gone.status,'expired');assert.equal(gone.candidate_cipher,null);
   } finally{if(oldKeys===undefined)delete process.env.CONTACT_CHANGE_KEYS;else process.env.CONTACT_CHANGE_KEYS=oldKeys;if(oldActive===undefined)delete process.env.CONTACT_CHANGE_ACTIVE_KEY_ID;else process.env.CONTACT_CHANGE_ACTIVE_KEY_ID=oldActive;}
   assert.equal((await op(a,row.id,'cancel')).status,200);
  });
  await t.test('legacy permissions, histories, episodes and established clinical rows remain intact',async()=>{
   const tables=['clinical_episodes','care_relationships','psychologist_patient_access','appointments','patient_intakes','patient_tasks','patient_clinical_notes'];
   const snapshot=async()=>{const data={};for(const table of tables)data[table]=(await client.query('SELECT to_jsonb(t) AS row FROM '+table+' t ORDER BY to_jsonb(t)::text')).rows;return data;};
   const before=await snapshot(),p=await login('p@episodes.invalid','Episode-Demo-Only-284!');
   const initial=await req('/contact-changes',p.token);if(initial.body.data.request?.status==='pending')await op(p,initial.body.data.request.id,'cancel');
   const row=(await start(p,'email','clinical-continuity@contact.invalid',{password:'Episode-Demo-Only-284!'})).body.data.request;
   await send(p,row.id);await op(p,row.id,'verify',{secret:last(p).secret});assert.equal((await op(p,row.id,'confirm')).status,200);
   assert.deepEqual(await snapshot(),before);
   assert.ok((await client.query("SELECT 1 FROM clinical_record_history WHERE table_name='patients' AND patient_id='p'")).rowCount);
   const fresh=await login(row.candidate,'Episode-Demo-Only-284!');assert.equal((await req('/care-relationships/request',fresh.token,{psychologistUserId:'a'})).status,403);
   assert.equal((await req('/psychologists/available',fresh.token)).status,403);
   const leaks=(await client.query('SELECT metadata FROM audit_logs')).rows;assert.ok(!JSON.stringify(leaks).includes('contact-change:'));
  });
 } finally {
  db.query=originalQuery;db.getClient=originalGetClient;
  if(server)await new Promise(resolve=>server.close(resolve));if(pool)await pool.end();await client.end();control.release();await db.close();
 }
});
