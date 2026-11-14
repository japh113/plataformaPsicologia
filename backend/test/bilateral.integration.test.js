import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import db from '../src/config/db.js';
import env from '../src/config/env.js';
import { installBaseline,syntheticFixture } from '../scripts/episode-sandbox.js';
import { installBilateralSandbox,bilateralFixture } from '../scripts/bilateral-sandbox.js';
import { migrate,catalogChecksum } from '../scripts/episode-migration.js';
import { command,processQueue,closeBilateral,transaction } from '../src/modules/bilateral/bilateral.service.js';
import { conditionsVersion,conditionsText,sha256,declarationVersion,errorFor } from '../src/modules/bilateral/bilateral.policy.js';
import { contactDigest } from '../src/modules/auth/identity.service.js';

const actor=id=>({id,role:id.startsWith('bp')?'psychologist':'patient',sessionVersion:0});
const proposalHash=psy=>sha256(conditionsText('Profesional ficticio '+psy));
const operation=()=>({operationId:randomUUID()});
const express=()=>({...operation(),confirmed:true});

test('013: isolated bilateral workflow, actual PostgreSQL privileges, revocators and concurrent commands',{
  skip:process.env.RUN_EPISODE_INTEGRATION!=='true'&&process.env.RUN_BILATERAL_INTEGRATION!=='true',
},async t=>{
  assert.equal(env.nodeEnv,'test');assert.equal(env.localDevelopment,true);assert.equal(env.databaseUrl,'');
  assert.match(process.env.EPISODE_TEST_RUN_ID||'',/^[a-f0-9-]{36}$/);
  const native=process.env.RUN_BILATERAL_INTEGRATION==='true';
  assert.equal(env.dbHost,native?'127.0.0.1':'db');
  const connection={host:env.dbHost,port:env.dbPort,user:env.dbUser,password:env.dbPassword,database:native?'postgres':'psicopanel_integrity_test'};
  const control=new pg.Client(connection);await control.connect();
  let client,pool,server,restricted;
  const originalQuery=db.query,originalGet=db.getClient;
  const name='psicopanel_episode_bilateral_'+randomUUID().replaceAll('-','');
  try{
    if(native){
      const directory=(await control.query('SHOW data_directory')).rows[0].data_directory.replaceAll('\\','/');
      assert.equal(directory,process.env.BILATERAL_NATIVE_DATA);
      assert.ok((await control.query("SELECT datname FROM pg_database WHERE NOT datistemplate ORDER BY datname")).rows.every(r=>r.datname==='postgres'||/^psicopanel_episode_bilateral_[a-f0-9]{32}$/.test(r.datname)));
    }
    assert.equal((await control.query('SELECT 1 FROM pg_database WHERE datname=$1',[name])).rowCount,0);
    await control.query('CREATE DATABASE "'+name+'"');
    client=new pg.Client({...connection,database:name});await client.connect();
    assert.equal((await client.query("SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace")).rowCount,0);
    await installBaseline(client);
    const options=await installBilateralSandbox(client,name);
    await bilateralFixture(client);await syntheticFixture(client);
    const catalog=await catalogChecksum(client);
    assert.equal((await migrate(client,options)).status,'already-applied');
    assert.equal(await catalogChecksum(client),catalog);
    pool=new pg.Pool({...connection,database:name,max:10});
    db.query=(sql,p)=>pool.query(sql,p);db.getClient=()=>pool.connect();
    process.env.BILATERAL_ENABLED='true';process.env.BILATERAL_SECRET='independent-fictional-bilateral-key-at-least-32-bytes';
    process.env.BILATERAL_DATABASE_URL=`postgresql://${options.bilateralClientRole}:disposable_bilateral_roles@${env.dbHost}:${env.dbPort}/${name}`;
    restricted=new pg.Client({connectionString:process.env.BILATERAL_DATABASE_URL});await restricted.connect();
    server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
    const url='http://127.0.0.1:'+server.address().port;
    const http=async(id,path,payload,method=payload?'POST':'GET')=>{
      const row=(await client.query('SELECT session_version FROM users WHERE id=$1',[id])).rows[0];
      const token=jwt.sign({sub:id,sv:row?.session_version??0},env.jwtSecret,{expiresIn:'1h'});
      const response=await fetch(url+'/api'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(payload?{body:JSON.stringify(payload)}:{})});
      return {status:response.status,body:await response.json(),headers:response.headers};
    };
    const references=new Map();
    const ref=async(psy,pac)=>{
      let professional=references.get(psy);
      if(!professional){professional=(await command(actor(psy),'professional-reference',operation())).reference;references.set(psy,professional);}
      return (await command(actor(pac),'recipient-reference',{...express(),professionalReference:professional})).reference;
    };
    const issue=async(psy,pac,extra={})=>{
      const recipientReference=await ref(psy,pac);
      const payload={...operation(),email:pac+'@bilateral.invalid',recipientReference,conditionsVersion,conditionsHash:proposalHash(psy),declarationVersion,declared:true,proposed:true,...extra};
      const response=await http(psy,'/bilateral-invitations',payload);
      assert.equal(response.status,202);assert.deepEqual(Object.keys(response.body.data).sort(),['receiptId','status']);
      await processQueue();return response.body.data.receiptId;
    };
    const incoming=async(pac,id)=>(await command(actor(pac),'received')).find(row=>row.id===id);
    const accept=async(pac,id,extra={})=>{
      const i=await incoming(pac,id);return command(actor(pac),'accept',{...express(),expectedVersion:i.version,conditionsVersion:i.conditionsVersion,conditionsHash:i.conditionsHash,...extra},id);
    };
    const legacyBefore=(await client.query('SELECT id,status FROM care_relationships ORDER BY id')).rows;
    const notesBefore=(await client.query('SELECT * FROM patient_clinical_notes ORDER BY id')).rows;
    await t.test('positive HTTP flow fixes exact subjects and texts; acceptance and evidence are atomic without clinical access',async()=>{
      const id=await issue('bp1','bq1');const i=await incoming('bq1',id);
      assert.equal(i.status,'pending');assert.match(i.conditionsText,/Profesional ficticio bp1/);
      assert.equal((await client.query('SELECT digest FROM bilateral_references WHERE id=(SELECT reference_id FROM bilateral_invitations WHERE id=$1)',[id])).rows[0].digest,null);
      const result=await http('bq1','/bilateral-invitations/'+id+'/accept',{...express(),expectedVersion:i.version,conditionsVersion:i.conditionsVersion,conditionsHash:i.conditionsHash});
      assert.equal(result.status,200);assert.equal(result.body.data.admission,'pending');assert.equal(result.body.data.treatment,'not_activated');
      assert.equal((await client.query("SELECT count(*)::int n FROM bilateral_events WHERE invitation_id=$1 AND action='accepted'",[id])).rows[0].n,1);
      assert.equal((await http('bp1','/patients/bq1')).status,404);
      assert.equal((await client.query('SELECT count(*)::int n FROM clinical_episodes')).rows[0].n,0);
      const agreement=result.body.data.agreementId;
      await command(actor('bq1'),'unlink',{...express(),expectedVersion:1},agreement);
      assert.equal((await command(actor('bp1'),'agreements'))[0].status,'unlinked');
      const replay=await accept('bq1',id);assert.equal(replay.status,'unlinked');
    });
    await t.test('actual restricted LOGIN cannot read or mutate source, legacy, professional originals or clinical tables',async()=>{
      for(const sql of ['SELECT password_hash FROM users','SELECT phone FROM patients','SELECT * FROM patient_clinical_notes','SELECT * FROM clinical_note_private_origins','SELECT * FROM bilateral_invitations',"UPDATE users SET session_version=session_version+1 WHERE id='bq1'",'DELETE FROM bilateral_blocks',"SET ROLE bilateral_owner_"+(await client.query("SELECT substr(md5(current_database()),1,16) suffix")).rows[0].suffix])await assert.rejects(restricted.query(sql),{code:'42501'});
      const publicFn=(await client.query("SELECT EXISTS(SELECT 1 FROM pg_proc p,aclexplode(p.proacl) acl WHERE p.oid='bilateral_command(text,integer,text,jsonb)'::regprocedure AND acl.grantee=0 AND privilege_type='EXECUTE') allowed")).rows[0];
      assert.equal(publicFn.allowed,false);
      for(const role of ['admin','superadmin','support'])assert.equal((await http('bil-'+role,'/bilateral-invitations/agreements')).status,403);
    });
    await t.test('crossed accounts, invalid references and unverified recipients have uniform receipts and private DTOs',async()=>{
      const token=await ref('bp2','bq2');
      const bodies=[];
      for(const [email,reference]of [['absent@bilateral.invalid',token],['bq2@bilateral.invalid','unknown']]){
        const r=await http('bp2','/bilateral-invitations',{...operation(),email,recipientReference:reference,conditionsVersion,conditionsHash:proposalHash('bp2'),declarationVersion,declared:true,proposed:true});
        assert.equal(r.status,202);bodies.push(Object.keys(r.body.data).sort());
      }
      assert.deepEqual(bodies[0],bodies[1]);await processQueue();
      assert.equal((await command(actor('bq2'),'received')).length,0);
      const sent=await command(actor('bp2'),'sent');
      assert.ok(sent.every(row=>row.status==='received'&&row.version===1));
      assert.doesNotMatch(JSON.stringify(sent),/email|patient|contact|digest|blocked|delivery|secret/i);
      assert.equal((await http('bq2','/bilateral-invitations/'+randomUUID()+'/accept',{...express(),expectedVersion:1,conditionsVersion,conditionsHash:'a'.repeat(64)})).status,404);
    });
    await t.test('block invalidates pending and directed references permanently; unblock never restores',async()=>{
      const id=await issue('bp3','bq3');await command(actor('bq3'),'block',express(),id);
      assert.equal((await incoming('bq3',id)).status,'invalidated');
      const block=(await command(actor('bq3'),'blocks'))[0],unblock=express();await command(actor('bq3'),'unblock',unblock,block.id);
      assert.equal((await command(actor('bq3'),'unblock',unblock,block.id)).blocked,false);
      assert.equal((await incoming('bq3',id)).status,'invalidated');
      assert.equal((await command(actor('bp3'),'sent'))[0].status,'received');
      await assert.rejects(accept('bq3',id),/bilateral_conflict/);
    });
    await t.test('decline, withdrawal, expiry and resend keep terminal evidence and original TTL',async()=>{
      const id=await issue('bp4','bq4');const i=await incoming('bq4',id);
      await command(actor('bp4'),'resend',express(),id);await processQueue();
      assert.equal((await incoming('bq4',id)).expiresAt,i.expiresAt);
      await command(actor('bq4'),'decline',{...express(),expectedVersion:1},id);
      assert.equal((await incoming('bq4',id)).status,'declined');
      const withdrawn=await issue('bp1','bq5');await command(actor('bp1'),'withdraw',{...express(),expectedVersion:1},withdrawn);
      assert.equal((await incoming('bq5',withdrawn)).status,'withdrawn');
      const expired=await issue('bp2','bq6');
      await client.query("WITH tick AS MATERIALIZED (SELECT clock_timestamp() AS stamp) UPDATE bilateral_invitations SET issued_at=tick.stamp-interval '15 days',expires_at=tick.stamp-interval '24 hours' FROM tick WHERE id=$1",[expired]);
      // DB clock_timestamp calls differ: preserve the exact TTL constraint via one expression.
      await assert.rejects(accept('bq6',expired),/bilateral_conflict/);
    });
    await t.test('contact changed and restored cannot revive a reference or pending invitation',async()=>{
      const id=await issue('bp3','bq7');
      await client.query("UPDATE users SET email='changed@bilateral.invalid' WHERE id='bq7'");
      await client.query("UPDATE users SET email='bq7@bilateral.invalid' WHERE id='bq7'");
      assert.equal((await incoming('bq7',id)).status,'invalidated');
      await assert.rejects(accept('bq7',id),/bilateral_conflict/);
      const sent=(await command(actor('bp3'),'sent')).find(r=>r.id===id);assert.equal(sent.status,'received');assert.equal(sent.version,1);
    });
    await t.test('two independent PostgreSQL connections serialize duplicate acceptance and preserve one agreement',async()=>{
      const id=await issue('bp4','bq8');const i=await incoming('bq8',id);
      const request={...express(),expectedVersion:1,conditionsVersion:i.conditionsVersion,conditionsHash:i.conditionsHash};
      const answers=await Promise.all([command(actor('bq8'),'accept',request,id),command(actor('bq8'),'accept',request,id)]);
      assert.equal(answers[0].agreementId,answers[1].agreementId);
      assert.equal((await client.query('SELECT count(*)::int n FROM bilateral_agreements WHERE invitation_id=$1',[id])).rows[0].n,1);
      await assert.rejects(command(actor('bq8'),'decline',{...express(),expectedVersion:1},id),/bilateral_conflict/);
    });
    await t.test('recipient delivery budgets aggregate independent emitters; invalid references cannot spend victim budget',async()=>{
      const ids=[];
      for(const psy of ['bp5','bp6','bp7','bp8'])ids.push(await issue(psy,'bq9'));
      assert.equal((await command(actor('bq9'),'received')).filter(i=>ids.includes(i.id)).length,3);
      assert.equal((await client.query("SELECT count(*)::int n FROM bilateral_delivery_budget WHERE account_id='bq9'")).rows[0].n,3);
      assert.equal((await command(actor('bp8'),'sent'))[0].status,'received');
      await command(actor('bp8'),'resend',express(),ids[3]);await processQueue();
      assert.equal((await client.query("SELECT count(*)::int n FROM bilateral_delivery_budget WHERE account_id='bq9'")).rows[0].n,3);
    });
    await t.test('suspension preserves TTL; disabled invalidates irreversibly; rehabilitation does not restore',async()=>{
      const id=await issue('bp9','bq10'),original=await incoming('bq10',id);
      await client.query("UPDATE bilateral_restrictions SET state='suspended' WHERE psychologist_id='bp9'");
      assert.equal((await incoming('bq10',id)).expiresAt,original.expiresAt);
      await assert.rejects(accept('bq10',id),/bilateral_conflict/);
      await client.query("UPDATE bilateral_restrictions SET state='enabled' WHERE psychologist_id='bp9'");
      assert.equal((await incoming('bq10',id)).status,'pending');
      await client.query("UPDATE bilateral_restrictions SET state='disabled' WHERE psychologist_id='bp9'");
      await client.query("UPDATE bilateral_restrictions SET state='enabled' WHERE psychologist_id='bp9'");
      assert.equal((await incoming('bq10',id)).status,'invalidated');
      await assert.rejects(accept('bq10',id),/bilateral_conflict/);
      await client.query("DELETE FROM bilateral_restrictions WHERE psychologist_id='bp10'");
      await assert.rejects(command(actor('bp10'),'professional-reference',operation()),/bilateral_forbidden/);
      await client.query("INSERT INTO bilateral_restrictions VALUES('bp10','enabled',clock_timestamp(),'Ensayo ficticio explícito')");
    });
    await t.test('deleting restrictions revokes pending invitations and unused references permanently across rehabilitation',async()=>{
      references.delete('bp9');
      const id=await issue('bp9','bq38'),unused=await ref('bp9','bq39');
      await client.query("DELETE FROM bilateral_restrictions WHERE psychologist_id='bp9'");
      assert.equal((await incoming('bq38',id)).status,'invalidated');
      assert.equal((await client.query("SELECT count(*)::int n FROM bilateral_references WHERE psychologist_id='bp9' AND (digest IS NOT NULL OR binding_digest IS NOT NULL)")).rows[0].n,0);
      await assert.rejects(command(actor('bp9'),'professional-reference',operation()),/bilateral_forbidden/);
      await client.query("INSERT INTO bilateral_restrictions VALUES('bp9','enabled',clock_timestamp(),'Rehabilitación ficticia explícita')");
      references.delete('bp9');
      await assert.rejects(accept('bq38',id),/bilateral_conflict/);
      const response=await command(actor('bp9'),'issue',{...operation(),email:'bq39@bilateral.invalid',recipientReference:unused,conditionsVersion,conditionsHash:proposalHash('bp9'),declarationVersion,declared:true,proposed:true});
      await processQueue();assert.equal(await incoming('bq39',response.receiptId),undefined);
      assert.equal((await client.query("SELECT count(*)::int n FROM bilateral_events WHERE invitation_id=$1 AND action='invalidated'",[id])).rows[0].n,1);
      assert.equal((await client.query('SELECT count(*)::int n FROM bilateral_agreements WHERE invitation_id=$1',[id])).rows[0].n,0);
    });
    await t.test('sender quotas are durable across independent connections and idempotent retries never duplicate receipts',async()=>{
      const payload={...operation(),email:'absent@bilateral.invalid',recipientReference:'invalid',conditionsVersion,conditionsHash:proposalHash('bp10'),declarationVersion,declared:true,proposed:true};
      const a=await command(actor('bp10'),'issue',payload),b=await command(actor('bp10'),'issue',payload);
      assert.equal(a.receiptId,b.receiptId);
      await assert.rejects(command(actor('bp10'),'issue',{...payload,email:'different@bilateral.invalid'}),/bilateral_conflict/);
      const results=await Promise.all(Array.from({length:5},()=>command(actor('bp10'),'issue',{...payload,...operation()}).then(()=>true,e=>{assert.equal(errorFor(e).status,429);return false;})));
      assert.equal(results.filter(Boolean).length,4);
      assert.equal((await client.query("SELECT count(*)::int n FROM bilateral_sender_budget WHERE actor_id='bp10'")).rows[0].n,5);
      await processQueue();
    });
    await t.test('a changed, restored or replaced directed reference cannot be reused or cross the intended professional',async()=>{
      const token=await ref('bp11','bq11');await ref('bp11','bq11');
      const payload={...operation(),email:'bq11@bilateral.invalid',recipientReference:token,conditionsVersion,conditionsHash:proposalHash('bp11'),declarationVersion,declared:true,proposed:true};
      await command(actor('bp11'),'issue',payload);await processQueue();
      assert.equal((await command(actor('bq11'),'received')).length,0);
      const valid=await ref('bp11','bq11');await command(actor('bp12'),'issue',{...payload,...operation(),recipientReference:valid,conditionsHash:proposalHash('bp12')});await processQueue();
      assert.equal((await command(actor('bq11'),'received')).length,0);
      const id=await issue('bp11','bq11');assert.equal((await incoming('bq11',id)).status,'pending');
      await command(actor('bp11'),'issue',{...payload,...operation(),recipientReference:valid});await processQueue();
      assert.equal((await command(actor('bq11'),'received')).length,1);
    });
    await t.test('source revocation wins before acceptance on independent sessions; acceptance winner retains immutable evidence',async()=>{
      const id=await issue('bp13','bq12');const i=await incoming('bq12',id);
      const holder=new pg.Client({...connection,database:name}),contender=new pg.Client({connectionString:process.env.BILATERAL_DATABASE_URL});
      await holder.connect();await contender.connect();
      try{
        await holder.query('BEGIN');await holder.query("UPDATE users SET email='revoked@bilateral.invalid' WHERE id='bq12'");
        const pid=(await contender.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        const input={...express(),id,expectedVersion:1,conditionsVersion:i.conditionsVersion,conditionsHash:i.conditionsHash,agreementId:randomUUID(),fingerprint:randomUUID(),email:'bq12@bilateral.invalid',phone:'+5255000000012',adult:true,emailDigest:contactDigest('email','bq12@bilateral.invalid'),phoneDigest:contactDigest('sms','+5255000000012')};
        const waiting=contender.query('SELECT bilateral_command($1,0,$2,$3::jsonb)',['bq12','accept',JSON.stringify(input)]).then(()=>null,e=>e);
        let blocked=false;
        for(let n=0;n<100;n++){
          blocked=(await client.query("SELECT wait_event_type='Lock' AS blocked FROM pg_stat_activity WHERE pid=$1",[pid])).rows[0]?.blocked;
          if(blocked)break;await new Promise(r=>setTimeout(r,5));
        }
        assert.ok(blocked,'observable independent-session lock barrier');await holder.query('COMMIT');
        assert.equal((await waiting).message,'bilateral_conflict');
        assert.equal((await client.query('SELECT count(*)::int n FROM bilateral_agreements WHERE invitation_id=$1',[id])).rows[0].n,0);
        const accepted=await issue('bp14','bq13');await accept('bq13',accepted);
        await client.query("UPDATE users SET email='changed-after@bilateral.invalid' WHERE id='bq13'");
        assert.equal((await incoming('bq13',accepted)).status,'accepted');
        assert.equal((await client.query('SELECT count(*)::int n FROM bilateral_agreements WHERE invitation_id=$1',[accepted])).rows[0].n,1);
      }finally{await holder.query('ROLLBACK');await holder.end();await contender.end();}
    });
    await t.test('BEGIN and COMMIT uncertainty discard real connections; durable retry recovers one exact agreement',async()=>{
      const originalConnect=pg.Pool.prototype.connect;let disposed=false,once=true;
      pg.Pool.prototype.connect=async function(...args){const c=await originalConnect.apply(this,args);const query=c.query.bind(c),release=c.release.bind(c);c.query=async(sql,...rest)=>{if(sql==='BEGIN'&&once){once=false;throw new Error('transient begin');}return query(sql,...rest);};c.release=bad=>{disposed=!!bad;release(bad);};return c;};
      try{await assert.rejects(transaction(()=>{}),/transient begin/);assert.ok(disposed);}finally{pg.Pool.prototype.connect=originalConnect;}
      const id=await issue('bp15','bq14'),i=await incoming('bq14',id),payload={...express(),expectedVersion:1,conditionsVersion:i.conditionsVersion,conditionsHash:i.conditionsHash};
      once=true;disposed=false;
      pg.Pool.prototype.connect=async function(...args){const c=await originalConnect.apply(this,args);const query=c.query.bind(c),release=c.release.bind(c);c.query=async(sql,...rest)=>{const result=await query(sql,...rest);if(sql==='COMMIT'&&once){once=false;throw new Error('commit response lost');}return result;};c.release=bad=>{disposed=!!bad;release(bad);};return c;};
      try{await assert.rejects(command(actor('bq14'),'accept',payload,id),/commit response lost/);assert.ok(disposed);}finally{pg.Pool.prototype.connect=originalConnect;}
      const recovered=await command(actor('bq14'),'accept',payload,id);assert.equal(recovered.status,'completed');
      assert.equal((await client.query('SELECT count(*)::int n FROM bilateral_agreements WHERE invitation_id=$1',[id])).rows[0].n,1);
    });
    await t.test('both lock orders resolve acceptance against decline, withdrawal, blocking, suspension, expiration and restriction deletion',async()=>{
      const outcomes=['decline','withdraw','block','suspend','expire','delete'];
      for(let n=0;n<outcomes.length;n++)for(const first of ['revoker','accept']){
        const action=outcomes[n],psy='bp'+(16+n),pac='bq'+(15+2*n+(first==='accept'?1:0));
        await client.query("INSERT INTO bilateral_restrictions(psychologist_id,state,justification) VALUES($1,'enabled','Ensayo ficticio explícito') ON CONFLICT(psychologist_id) DO UPDATE SET state='enabled'",[psy]);
        if(action==='delete')references.delete(psy);
        const id=await issue(psy,pac),i=await incoming(pac,id);
        const one=new pg.Client({connectionString:process.env.BILATERAL_DATABASE_URL}),two=new pg.Client({...connection,database:name});
        await one.connect();await two.connect();
        try{
          const waitForLock=async connection=>{
            const pid=(await connection.query('SELECT pg_backend_pid() pid')).rows[0].pid;
            return async()=>{
              for(let n=0;n<100;n++){
                if((await client.query("SELECT wait_event_type='Lock' blocked FROM pg_stat_activity WHERE pid=$1",[pid])).rows[0]?.blocked)return;
                await new Promise(r=>setTimeout(r,5));
              }
              assert.fail('independent-session restriction deletion must reach the lock barrier');
            };
          };
          const observeOne=await waitForLock(one),observeTwo=await waitForLock(two);
          const phone=(await client.query('SELECT phone FROM patients WHERE id=$1',[pac])).rows[0].phone;
          const acceptInput={...express(),id,expectedVersion:1,conditionsVersion:i.conditionsVersion,conditionsHash:i.conditionsHash,agreementId:randomUUID(),fingerprint:randomUUID(),email:pac+'@bilateral.invalid',phone,adult:true,emailDigest:contactDigest('email',pac+'@bilateral.invalid'),phoneDigest:contactDigest('sms',phone)};
          const revoke=async connection=>{
            if(action==='delete')return connection.query('DELETE FROM bilateral_restrictions WHERE psychologist_id=$1',[psy]);
            if(action==='suspend')return connection.query("UPDATE bilateral_restrictions SET state='suspended' WHERE psychologist_id=$1",[psy]);
            if(action==='expire')return connection.query('SELECT bilateral_cleanup()');
            const owner=action==='withdraw'?psy:pac;
            return connection.query('SELECT bilateral_command($1,0,$2,$3::jsonb)',[owner,action,JSON.stringify({...express(),id,expectedVersion:1,fingerprint:randomUUID()})]);
          };
          if(action==='expire')await client.query("WITH tick AS MATERIALIZED (SELECT clock_timestamp() stamp) UPDATE bilateral_invitations SET issued_at=stamp-interval '336 hours'+interval '200 milliseconds',expires_at=stamp+interval '200 milliseconds' FROM tick WHERE id=$1",[id]);
          if(first==='revoker'){
            await two.query('BEGIN');
            if(action==='expire')await new Promise(r=>setTimeout(r,250));
            await revoke(two);
            const waiting=one.query('SELECT bilateral_command($1,0,$2,$3::jsonb)',[pac,'accept',JSON.stringify(acceptInput)]).then(()=>null,e=>e);
            if(action==='delete')await observeOne();
            await two.query('COMMIT');const error=await waiting;assert.equal(error?.message,'bilateral_conflict',action+' revoker first');
            assert.equal((await client.query('SELECT count(*)::int n FROM bilateral_agreements WHERE invitation_id=$1',[id])).rows[0].n,0);
          }else{
            await one.query('BEGIN');await one.query('SELECT bilateral_command($1,0,$2,$3::jsonb)',[pac,'accept',JSON.stringify(acceptInput)]);
            if(action==='expire')await new Promise(r=>setTimeout(r,250));
            const waiting=revoke(two).then(()=>null,e=>e);
            if(action==='delete')await observeTwo();
            await one.query('COMMIT');const error=await waiting;
            if(['decline','withdraw'].includes(action))assert.equal(error?.message,'bilateral_conflict');else assert.equal(error,null);
            assert.equal((await incoming(pac,id)).status,'accepted');
            assert.equal((await client.query('SELECT count(*)::int n FROM bilateral_agreements WHERE invitation_id=$1',[id])).rows[0].n,1);
          }
        }finally{await one.query('ROLLBACK');await two.query('ROLLBACK');await one.end();await two.end();}
        if(action==='delete'){
          await client.query("INSERT INTO bilateral_restrictions(psychologist_id,state,justification) VALUES($1,'enabled','Rehabilitación ficticia')",[psy]);
          references.delete(psy);
          assert.equal((await incoming(pac,id)).status,first==='revoker'?'invalidated':'accepted');
          if(first==='revoker')await assert.rejects(accept(pac,id),/bilateral_conflict/);
        }
      }
    });
    await t.test('exact 20-per-day, 50-pending, 10-per-week, three-resend and seven-day rejection boundaries',async()=>{
      await client.query("UPDATE bilateral_sender_budget SET created_at=clock_timestamp()-interval '11 minutes' WHERE actor_id='bp10'");
      await client.query("INSERT INTO bilateral_sender_budget(actor_id,created_at) SELECT 'bp10',clock_timestamp()-interval '11 minutes' FROM generate_series(1,15)");
      await assert.rejects(command(actor('bp10'),'issue',{...operation(),email:'absent@bilateral.invalid',recipientReference:'invalid',conditionsVersion,conditionsHash:proposalHash('bp10'),declarationVersion,declared:true,proposed:true}),/bilateral_quota/);
      const resent=await issue('bp21','bq30'),ttl=(await incoming('bq30',resent)).expiresAt;
      for(let n=0;n<4;n++){
        await client.query("UPDATE bilateral_delivery_budget SET created_at=clock_timestamp()-interval '2 days' WHERE account_id='bq30'");
        await command(actor('bp21'),'resend',express(),resent);await processQueue();
      }
      assert.equal((await client.query('SELECT resends FROM bilateral_invitations WHERE id=$1',[resent])).rows[0].resends,3);
      assert.equal((await incoming('bq30',resent)).expiresAt,ttl);
      await client.query("INSERT INTO bilateral_delivery_budget(account_id,psychologist_id,created_at) SELECT 'bq31','bp21',clock_timestamp()-interval '2 days' FROM generate_series(1,10)");
      const weekly=await issue('bp22','bq31');assert.equal(await incoming('bq31',weekly),undefined);
      await client.query("WITH tick AS MATERIALIZED (SELECT clock_timestamp() stamp) UPDATE bilateral_invitations SET issued_at=stamp-interval '9 days',expires_at=stamp+interval '5 days',terminal_at=stamp-interval '6 days' FROM tick WHERE psychologist_id='bp4' AND account_id='bq4'");
      const declined=await issue('bp4','bq4');assert.equal(await incoming('bq4',declined),undefined);
      await client.query("UPDATE bilateral_invitations SET terminal_at=clock_timestamp()-interval '8 days' WHERE psychologist_id='bp4' AND account_id='bq4' AND state='declined'");
      const allowed=await issue('bp4','bq4');assert.equal((await incoming('bq4',allowed)).status,'pending');
      // Model accumulated pending invitations from earlier days in this new fictitious DB.
      for(let n=1;n<=50;n++){
        const reference=randomUUID(),receipt=randomUUID();
        await client.query("WITH tick AS MATERIALIZED (SELECT clock_timestamp()-interval '2 days' stamp) INSERT INTO bilateral_references(id,kind,psychologist_id,account_id,patient_id,digest,binding_digest,created_at,expires_at,consumed_at) SELECT $1,'recipient','bp23',$2,$2,NULL,NULL,stamp,stamp+interval '24 hours',stamp FROM tick",[reference,'bq'+n]);
        await client.query("WITH tick AS MATERIALIZED (SELECT clock_timestamp()-interval '2 days' stamp) INSERT INTO bilateral_attempts(id,psychologist_id,operation_id,fingerprint,created_at,expires_at,processed_at,proposal) SELECT $1,'bp23',$2,'fixture',stamp,stamp+interval '336 hours',stamp,'{}'::jsonb FROM tick",[receipt,randomUUID()]);
        await client.query("INSERT INTO bilateral_invitations(id,psychologist_id,account_id,patient_id,reference_id,purpose,state,issued_at,expires_at,professional_name,conditions_version,conditions_text,conditions_hash,declaration_version,declaration_text) SELECT $1,'bp23',$2,$2,$3,'individual_linkage','pending',a.created_at,a.expires_at,'Profesional ficticio bp23',i.conditions_version,i.conditions_text,i.conditions_hash,i.declaration_version,i.declaration_text FROM bilateral_attempts a CROSS JOIN LATERAL(SELECT * FROM bilateral_invitations LIMIT 1)i WHERE a.id=$1",[receipt,'bq'+n,reference]);
      }
      const capped=await issue('bp23','bq60');assert.equal(await incoming('bq60',capped),undefined);
      assert.equal((await client.query("SELECT count(*)::int n FROM bilateral_invitations WHERE psychologist_id='bp23' AND state='pending'")).rows[0].n,50);
    });
    await t.test('adult eligibility, both verified contacts, explicit declarations and current sessions fail closed',async()=>{
      for(const [pac,sql]of [['bq33',"UPDATE patients SET global_birth_date=NULL WHERE id='bq33'"],['bq34',"UPDATE patients SET global_birth_date=CURRENT_DATE-interval '17 years' WHERE id='bq34'"],['bq35',"DELETE FROM contact_verification_state WHERE user_id='bq35' AND channel='sms'"]]){
        await client.query(sql);await assert.rejects(ref('bp24',pac),/bilateral_unavailable/);
      }
      const before32=(await command(actor('bq32'),'received')).length;
      const token=await ref('bp24','bq32');
      await client.query("DELETE FROM contact_verification_state WHERE user_id='bq32' AND channel='email'");
      await client.query("INSERT INTO contact_verification_state VALUES('bq32','email',$1,clock_timestamp())",[contactDigest('email','bq32@bilateral.invalid')]);
      const p={...operation(),email:'bq32@bilateral.invalid',recipientReference:token,conditionsVersion,conditionsHash:proposalHash('bp24'),declarationVersion,declared:true,proposed:true};
      await command(actor('bp24'),'issue',p);await processQueue();assert.equal((await command(actor('bq32'),'received')).length,before32);
      assert.equal((await http('bp24','/bilateral-invitations',{...p,...operation(),declared:false})).status,400);
      const id=await issue('bp24','bq36'),i=await incoming('bq36',id);
      assert.equal((await http('bq36','/bilateral-invitations/'+id+'/accept',{...express(),expectedVersion:1,conditionsVersion,conditionsHash:i.conditionsHash,confirmed:false})).status,400);
      await client.query("UPDATE users SET session_version=session_version+1 WHERE id='bq36'");
      await assert.rejects(command(actor('bq36'),'accept',{...express(),expectedVersion:1,conditionsVersion,conditionsHash:i.conditionsHash},id),/bilateral_session/);
      // Source tuple tampering cannot preserve the contextual MAC, even with a correct secret digest.
      const before37=(await command(actor('bq37'),'received')).length;
      const tampered=await ref('bp24','bq37');
      await client.query("UPDATE bilateral_references SET psychologist_id='bp2' WHERE account_id='bq37' AND digest IS NOT NULL");
      await command(actor('bp2'),'issue',{...p,...operation(),email:'bq37@bilateral.invalid',recipientReference:tampered,conditionsHash:proposalHash('bp2')});await processQueue();
      assert.equal((await command(actor('bq37'),'received')).length,before37);
    });
    await t.test('013 late installation failure rolls back all DDL and owner; independent upgrade retries preserve 001–012',async()=>{
      const freshName='psicopanel_episode_bilateral_'+randomUUID().replaceAll('-','');
      await control.query('CREATE DATABASE '+freshName);const fresh=new pg.Client({...connection,database:freshName});await fresh.connect();
      const suffix=randomUUID().replaceAll('-',''),opts={expectedDatabase:freshName,target:'012',accountReaderRole:'ba_'+suffix,privateNoteCreatorRole:'bn_'+suffix,bilateralClientRole:'br_'+suffix};
      try{
        await installBaseline(fresh);
        for(const role of [opts.accountReaderRole,opts.privateNoteCreatorRole,opts.bilateralClientRole])await fresh.query('CREATE ROLE '+role+" LOGIN NOINHERIT PASSWORD 'disposable_bilateral_roles'");
        await migrate(fresh,opts);const before=(await fresh.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows,checksum=await catalogChecksum(fresh);
        const broken={query:(sql,args)=>fresh.query(String(sql).includes('CREATE TABLE bilateral_restrictions')?sql+' SELECT 1/0;':sql,args)};
        await assert.rejects(migrate(broken,{...opts,target:'013'}),/division by zero/);
        assert.equal(await catalogChecksum(fresh),checksum);assert.equal((await fresh.query("SELECT to_regclass('bilateral_restrictions') relation")).rows[0].relation,null);
        assert.deepEqual((await fresh.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows,before);
        const other=new pg.Client({...connection,database:freshName});await other.connect();
        try{const answers=await Promise.all([migrate(fresh,{...opts,target:'013'}),migrate(other,{...opts,target:'013'})]);assert.deepEqual(answers.map(r=>r.status).sort(),['already-applied','applied']);}finally{await other.end();}
        assert.deepEqual((await fresh.query("SELECT * FROM psicopanel_schema_migrations WHERE version<'013' ORDER BY version")).rows,before);
        await assert.rejects(migrate(fresh,opts),/downgrade/);
      }finally{await fresh.end();}
    });
    await t.test('malformed JSON never reaches the legacy logger or returns a reference in errors',async()=>{
      const logs=[],original=console.error;console.error=(...args)=>logs.push(args);
      try{
        const response=await fetch(url+'/api/bilateral-invitations',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"recipientReference":"private-reference-never-log"'});
        assert.equal(response.status,400);assert.deepEqual(await response.json(),{success:false,message:'Entrada no válida.'});assert.equal(logs.length,0);
      }finally{console.error=original;}
    });
    await t.test('legacy barrier and originals remain unchanged after every bilateral operation',async()=>{
      for(const [path,body]of [['/auth/care-relationships/request',{}],['/auth/care-relationships/invite',{}]])assert.equal((await http('bp1',path,body)).status,403);
      assert.deepEqual((await client.query('SELECT id,status FROM care_relationships ORDER BY id')).rows,legacyBefore);
      assert.deepEqual((await client.query('SELECT * FROM patient_clinical_notes ORDER BY id')).rows,notesBefore);
    });
  }finally{
    if(server)await new Promise(r=>server.close(r));await closeBilateral();if(restricted)await restricted.end();
    db.query=originalQuery;db.getClient=originalGet;if(pool)await pool.end();if(client)await client.end();await control.end();
    delete process.env.BILATERAL_ENABLED;delete process.env.BILATERAL_DATABASE_URL;delete process.env.BILATERAL_SECRET;
  }
});
