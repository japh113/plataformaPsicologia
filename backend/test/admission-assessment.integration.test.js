import { fingerprint } from '../src/modules/admission/admission.policy.js';
import { installEpisodeRecordSandbox } from '../scripts/episode-record-sandbox.js';
import { installAssessmentSandbox } from '../scripts/admission-assessment-sandbox.js';
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
import { verifyAdmissionContract } from '../scripts/admission-contract.js';
import { command as bilateral,processQueue,closeBilateral } from '../src/modules/bilateral/bilateral.service.js';
import { conditionsVersion,conditionsText,sha256,declarationVersion } from '../src/modules/bilateral/bilateral.policy.js';
import { command,closeAdmission,transaction } from '../src/modules/admission/admission.service.js';
import { contactDigest } from '../src/modules/auth/identity.service.js';
const actor=id=>({id,sessionVersion:0,sessionExpiresAt:Math.floor(Date.now()/1000)+3600});
const act=()=>({operationId:randomUUID(),confirmed:true});
const answers={reason:'Motivo exclusivamente ficticio',context:'Contexto privado ficticio'};

test('016: authenticated private admission assessments, isolation, consent and concurrency',{
  skip:process.env.RUN_EPISODE_INTEGRATION!=='true',
},async t=>{
  assert.equal(env.nodeEnv,'test');assert.equal(env.localDevelopment,true);assert.equal(env.databaseUrl,'');assert.equal(env.dbHost,'db');
  assert.match(process.env.EPISODE_TEST_RUN_ID||'',/^[a-f0-9-]{36}$/);
  const connection={host:'db',user:env.dbUser,password:env.dbPassword,database:'psicopanel_integrity_test'};
  const control=new pg.Client(connection);await control.connect();
  const name='psicopanel_episode_admission_'+randomUUID().replaceAll('-','');
  let client,restricted,pool,server;const originalQuery=db.query,originalGet=db.getClient;
  try{
    assert.equal((await control.query('SELECT 1 FROM pg_database WHERE datname=$1',[name])).rowCount,0);
    await control.query('CREATE DATABASE "'+name+'"');client=new pg.Client({...connection,database:name});await client.connect();
    assert.equal((await client.query("SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace")).rowCount,0);
    await installBaseline(client);const options=await installAssessmentSandbox(client,name);
    await bilateralFixture(client);await syntheticFixture(client);
    const legacyBefore=(await client.query('SELECT * FROM care_relationships ORDER BY id')).rows;
    const notesBefore=(await client.query('SELECT * FROM patient_clinical_notes ORDER BY id')).rows;
    pool=new pg.Pool({...connection,database:name,max:10});db.query=(s,p)=>pool.query(s,p);db.getClient=()=>pool.connect();
    process.env.BILATERAL_ENABLED='true';process.env.BILATERAL_SECRET='independent-fictional-bilateral-key-at-least-32-bytes';
    process.env.BILATERAL_DATABASE_URL=`postgres://${options.bilateralClientRole}:disposable_bilateral_roles@db:5432/${name}`;
    process.env.ADMISSION_ENABLED='true';process.env.ADMISSION_SECRET='independent-fictional-admission-key-at-least-32-bytes';
    process.env.ADMISSION_DATABASE_URL=`postgres://${options.admissionClientRole}:disposable_admission_roles@db:5432/${name}`;
    restricted=new pg.Client({connectionString:process.env.ADMISSION_DATABASE_URL});await restricted.connect();
    server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
    const url='http://127.0.0.1:'+server.address().port;
    const http=async(id,path,payload,method=payload?'POST':'GET',sessionVersion=0)=>{
      const token=jwt.sign({sub:id,sv:sessionVersion},env.jwtSecret,{expiresIn:'1h'});
      const r=await fetch(url+'/api'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(payload?{body:JSON.stringify(payload)}:{})});
      return {status:r.status,body:await r.json(),headers:r.headers};
    };
    const refs=new Map();
    const link=async(psy,pac)=>{
      if(!refs.has(psy))refs.set(psy,(await bilateral(actor(psy),'professional-reference',{operationId:randomUUID()})).reference);
      const recipientReference=(await bilateral(actor(pac),'recipient-reference',{...act(),professionalReference:refs.get(psy)})).reference;
      const receipt=await bilateral(actor(psy),'issue',{operationId:randomUUID(),recipientReference,email:pac+'@bilateral.invalid',conditionsVersion,conditionsHash:sha256(conditionsText('Profesional ficticio '+psy)),declarationVersion,declared:true,proposed:true});
      await processQueue();const incoming=(await bilateral(actor(pac),'received')).find(i=>i.id===receipt.receiptId);assert.ok(incoming);
      return (await bilateral(actor(pac),'accept',{...act(),expectedVersion:incoming.version,conditionsVersion,conditionsHash:incoming.conditionsHash},incoming.id)).agreementId;
    };
    const propose=async(psy,pac,agreementId)=>{
      agreementId=agreementId||await link(psy,pac);
      const prepared=await command(actor(psy),'prepare',{...act(),agreementId});
      const assigned=await command(actor(psy),'assign',{...act(),agreementId,episodeId:prepared.episodeId,templateId:'fictional-adult-v1'});
      return {id:assigned.id,episodeId:prepared.episodeId,agreementId,psy,pac};
    };
    const detail=q=>command(actor(q.pac),'detail',{},q.id);
    const accept=async q=>{const d=await detail(q);return command(actor(q.pac),'accept',{...act(),expectedVersion:d.version,consentVersion:d.consentVersion,consentHash:d.consentHash},q.id);};
    const save=async(q,value=answers)=>{const d=await detail(q),draft=await command(actor(q.pac),'draft',{},q.id);return command(actor(q.pac),'save',{...act(),expectedVersion:d.version,expectedRevision:draft.revision,answers:value},q.id);};
    const submit=async q=>{const d=await detail(q),draft=await command(actor(q.pac),'draft',{},q.id);return command(actor(q.pac),'submit',{...act(),expectedVersion:d.version,expectedRevision:draft.revision},q.id);};
    const review=async(q,op,extra={})=>{const d=await detail(q);return command(actor(q.psy),op,{...act(),expectedVersion:d.version,submission:d.latestSubmission,episodeId:q.episodeId,...extra},q.id);};
    let ownFixture=0;
    const freshOwnAdmission=async()=>{
      const n=++ownFixture,psy='bp_own_'+n,pac='bq_own_'+n,phone='+525577'+String(n).padStart(6,'0');
      await client.query("INSERT INTO patients(id,first_name,full_name,phone,global_birth_date) VALUES($1,$1,$1,$2,'1990-01-01')",[pac,phone]);
      await client.query("INSERT INTO users(id,first_name,email,password_hash,role,patient_id) SELECT $1,$1,$2,password_hash,'patient',$1 FROM users WHERE id='bp1'",[pac,pac+'@bilateral.invalid']);
      for(const [channel,value]of [['email',pac+'@bilateral.invalid'],['sms',phone]])await client.query('INSERT INTO contact_verification_state VALUES($1,$2,$3,clock_timestamp())',[pac,channel,contactDigest(channel,value)]);
      await client.query("INSERT INTO users(id,first_name,email,password_hash,role) SELECT $1,$2,$3,password_hash,'psychologist' FROM users WHERE id='bp1'",[psy,'Profesional ficticio '+psy,psy+'@bilateral.invalid']);
      await client.query("INSERT INTO psychologist_profiles(user_id,approval_status) VALUES($1,'active')",[psy]);
      await client.query("INSERT INTO bilateral_restrictions(psychologist_id,state,justification) VALUES($1,'enabled','Regresión ficticia P2-01')",[psy]);
      return {...await propose(psy,pac),phone};
    };
    const ready=async()=>{const q=await freshOwnAdmission();await accept(q);await save(q);await submit(q);return q;};
    const record=q=>command(actor(q.psy),'record',{},q.id);
    const input=async(q,context='PRIVATE_ASSESSMENT',extra={})=>{const r=await record(q);return {...act(),expectedVersion:r.version,expectedRevision:r.expectedRevision,episodeId:q.episodeId,submission:r.submission,riskLevel:'high',context,...extra};};
    const assess=async(q,context,extra)=>command(actor(q.psy),'assess',await input(q,context,extra),q.id);
    const connect=async()=>{const c=new pg.Client({connectionString:process.env.ADMISSION_DATABASE_URL});await c.connect();return c;};
    // Same SQL boundary and exact fingerprint as HTTP, on independently controlled transactions.
    const raw=async(c,q,op,source={},who=q.psy)=>{
      const p={...source,id:q.id,sessionExpiresAt:actor(q.psy).sessionExpiresAt,newId:randomUUID(),fingerprint:fingerprint({op,input:source,id:q.id},process.env.ADMISSION_SECRET)};
      const ctx=(await c.query('SELECT admission_context($1,0,$2,$3::jsonb) data',[who,op,JSON.stringify(p)])).rows[0].data;
      p.emailDigest=contactDigest('email',ctx.email);p.phoneDigest=contactDigest('sms',ctx.phone);
      return (await c.query('SELECT admission_command($1,0,$2,$3::jsonb) data',[who,op,JSON.stringify(p)])).rows[0].data;
    };
    const waitBlocked=async c=>{for(let n=0;n<200;n++){if((await client.query('SELECT cardinality(pg_blocking_pids($1))>0 b',[c.processID])).rows[0].b)return;await new Promise(r=>setTimeout(r,10));}assert.fail('Expected real PostgreSQL lock wait');};
    let q,payload;
    await t.test('016 fresh install and replay preserve 001-015 hashes, ledger and restricted ACL',async()=>{
      assert.equal((await client.query('SELECT * FROM psicopanel_schema_migrations')).rowCount,16);
      const checks=(await client.query("SELECT pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid='episode_private_record_versions'::regclass AND contype='c'")).rows;
      assert.ok(checks.some(c=>c.definition.includes('previous_revision >= 0')&&c.definition.includes('revision - 1')),'016 retains the original previous_revision CHECK');
      const before=(await client.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows;
      assert.equal((await migrate(client,options)).status,'already-applied');assert.deepEqual((await client.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows,before);
      await verifyAdmissionContract(client,options.admissionClientRole);
      for(const sql of ['SELECT * FROM episode_private_records','SELECT * FROM episode_private_record_versions',"INSERT INTO episode_private_record_versions(episode_id) VALUES(1)","SELECT admission_record_command('bp1',0,'record','{}')","UPDATE episode_private_record_versions SET professional_context='forged'"])
        await assert.rejects(restricted.query(sql),e=>e.code==='42501');
    });
    await t.test('016 isolated upgrade rollback and unsafe grants preserve the historical ledger without adoption',async()=>{
      const freshName='psicopanel_episode_a16_'+randomUUID().replaceAll('-','');
      await control.query('CREATE DATABASE "'+freshName+'"');const fresh=new pg.Client({...connection,database:freshName});await fresh.connect();
      try{
        await installBaseline(fresh);const prior=await installEpisodeRecordSandbox(fresh,freshName);
        const before=(await fresh.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows,hash=await catalogChecksum(fresh);
        const broken={query:(sql,args)=>fresh.query(String(sql).includes('-- Authenticated admission assessments')?sql+' SELECT 1/0;':sql,args)};
        await assert.rejects(migrate(broken,{...prior,target:'016'}),/division by zero/);assert.equal(await catalogChecksum(fresh),hash);
        assert.deepEqual((await fresh.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows,before);
        await migrate(fresh,{...prior,target:'016'});
        assert.deepEqual((await fresh.query("SELECT * FROM psicopanel_schema_migrations WHERE version<'016' ORDER BY version")).rows,before);
        await fresh.query('GRANT SELECT(professional_context) ON episode_private_record_versions TO PUBLIC');
        await assert.rejects(migrate(fresh,{...prior,target:'016'}),/drift/);
        await fresh.query('REVOKE SELECT(professional_context) ON episode_private_record_versions FROM PUBLIC');
      }finally{await fresh.end();}
    });
    await t.test('016 complete PAC consent submission PSI record: exact author, time, submission, immutable history and no legacy changes',async()=>{
      q=await ready();const d=await detail(q);assert.equal(d.consentVersion,'fictional-admission-v2');assert.match(d.consentText,/valoraciones privadas/);assert.match(d.consentText,/retirada|retirarla/);
      let r=await record(q);assert.equal(r.current,null);assert.equal(r.expectedRevision,1);assert.deepEqual(r.history,[]);assert.equal(r.canAssess,true);
      payload=await input(q);const written=await http(q.psy,'/admissions/'+q.id+'/assess',payload);assert.equal(written.status,200);assert.deepEqual(written.body.data,{saved:true,revision:2});
      assert.doesNotMatch(JSON.stringify(written.body),/PRIVATE|high|author|recordedAt|submission|episodeId/);
      r=await record(q);assert.equal(r.current.submission,1);assert.equal(r.current.authorId,q.psy);assert.equal(r.current.context,'PRIVATE_ASSESSMENT');assert.ok(Date.parse(r.current.recordedAt));
      assert.equal((await detail(q)).reviewState,'submitted','Assessment does not validate the interview');
      const stored=(await client.query('SELECT * FROM episode_private_record_versions WHERE episode_id=$1 AND revision=2',[q.episodeId])).rows[0];
      assert.equal(stored.recording_kind,'authenticated_admission');assert.equal(stored.authenticated_author_user_id,q.psy);assert.equal(stored.authenticated_session_version,0);assert.equal(stored.technical_author_user_id,null);assert.equal(stored.assignment_id,q.id);assert.equal(stored.submission,1);
      await assess(q,'INDEPENDENT_REVISION',{riskLevel:'low'});r=await record(q);assert.equal(r.history.length,2);assert.equal(r.history[1].context,'PRIVATE_ASSESSMENT');
      for(const sql of ['UPDATE episode_private_record_versions SET professional_context=professional_context','DELETE FROM episode_private_record_versions','TRUNCATE episode_private_record_versions','DELETE FROM episode_private_records'])await assert.rejects(client.query(sql),/episode_record_immutable/);
      assert.deepEqual((await client.query('SELECT * FROM care_relationships ORDER BY id')).rows,legacyBefore);assert.deepEqual((await client.query('SELECT * FROM patient_clinical_notes ORDER BY id')).rows,notesBefore);
    });
    await t.test('016 patient, third parties, backoffice, foreign episodes and malformed payloads cannot disclose assessments or metadata',async()=>{
      for(const id of [q.pac,'bp1','bq1','bil-admin','bil-superadmin','bil-support']){
        const found=await http(id,'/admissions/'+q.id+'/record'),missing=await http(id,'/admissions/'+randomUUID()+'/record');
        assert.equal(found.status,404);assert.deepEqual(found.body,missing.body);
        assert.equal((await http(id,'/admissions/'+q.id+'/assess',await input(q))).status,404);
      }
      for(const op of ['detail','summary'])assert.doesNotMatch(JSON.stringify(await command(actor(q.pac),op,{},q.id)),/PRIVATE_ASSESSMENT|INDEPENDENT_REVISION|riskLevel|authorId|recordedAt|expectedRevision/);
      assert.doesNotMatch(JSON.stringify(await command(actor(q.pac),'list')),/PRIVATE_ASSESSMENT|riskLevel|recordedAt/);
      assert.equal((await http(q.psy,'/admissions/'+q.id+'/assess',{...await input(q),authorId:q.psy})).status,400);
      assert.equal((await http(q.psy,'/admissions/'+q.id+'/assess',await input(q,'wrong',{episodeId:'999999'}))).status,409);
      assert.equal((await http(q.psy,'/admissions/'+q.id+'/assess',await input(q,'wrong',{submission:2}))).status,409);
      assert.equal((await http(q.psy,'/admissions/'+q.id+'/record?private=true')).status,400);
      assert.equal((await http(q.psy,'/admissions/'+q.id+'/record',null,'GET',99)).status,401);
    });
    await t.test('016 old consent is never expanded and explicit v2 consent is mandatory',async()=>{
      const proposed=await freshOwnAdmission();const d=await detail(proposed);
      assert.equal((await http(proposed.pac,'/admissions/'+proposed.id+'/accept',{...act(),expectedVersion:d.version,consentVersion:'fictional-admission-v1',consentHash:d.consentHash})).status,409);
      assert.equal((await http(proposed.psy,'/admissions/'+proposed.id+'/record')).status,404);
      await accept(proposed);assert.equal((await http(proposed.psy,'/admissions/'+proposed.id+'/record')).status,404);
      // Explicit synthetic v1 identity: never upgrade consent or modify an accepted assignment.
      const prepared=await command(actor(proposed.psy),'prepare',{...act(),agreementId:proposed.agreementId});
      const legacy={...proposed,id:randomUUID(),episodeId:prepared.episodeId};
      await client.query(`INSERT INTO admission_assignments(id,agreement_id,episode_id,account_id,patient_id,psychologist_id,template_id,professional_name,consent_version,consent_text,consent_hash)
        SELECT $1,agreement_id,$2,account_id,patient_id,psychologist_id,template_id,professional_name,'fictional-admission-v1','OLD_CONSENT',repeat('0',64) FROM admission_assignments WHERE id=$3`,[legacy.id,legacy.episodeId,proposed.id]);
      await accept(legacy);await save(legacy);await submit(legacy);
      assert.equal((await detail(legacy)).consentVersion,'fictional-admission-v1');
      assert.equal((await http(legacy.psy,'/admissions/'+legacy.id+'/record')).status,404);
      assert.equal((await http(legacy.psy,'/admissions/'+legacy.id+'/assess',{...act(),expectedVersion:3,expectedRevision:1,submission:1,episodeId:legacy.episodeId,riskLevel:'none',context:''})).status,404);
    });
    await t.test('016 idempotency and semantic conflict are distinct from retryable SQL errors',async()=>{
      const a=await ready(),p=await input(a,'REPLAY_PRIVATE');const result=await command(actor(a.psy),'assess',p,a.id);
      assert.deepEqual(await command(actor(a.psy),'assess',p,a.id),result);
      await assert.rejects(command(actor(a.psy),'assess',{...p,context:'DIFFERENT'},a.id),e=>e.message==='admission_conflict'&&e.code==='P0001');
      await assert.rejects(command(actor(a.psy),'assess',{...p,operationId:randomUUID()},a.id),e=>e.message==='admission_conflict'&&e.code==='P0001');
      await assess(a,'NEXT');await assert.rejects(command(actor(a.psy),'assess',p,a.id),/admission_conflict/);
      let attempts=0;assert.equal(await transaction(async tx=>{await tx.query('SELECT 1');if(++attempts===1)throw Object.assign(new Error('retryable'),{code:'40P01'});return 'recovered';}),'recovered');assert.equal(attempts,2);
      attempts=0;await assert.rejects(transaction(async()=>{attempts++;throw Object.assign(new Error('admission_conflict'),{code:'P0001'});}),/admission_conflict/);assert.equal(attempts,1);
      const row=(await client.query('SELECT result FROM admission_operations WHERE actor_id=$1 AND operation_id=$2',[a.psy,p.operationId])).rows[0];assert.deepEqual(row.result,result);
    });
    await t.test('016 correction blocks writes and replays; a new exact submission starts NO EVALUADO while retaining history',async()=>{
      const a=await ready(),p=await input(a,'HISTORY_ONLY');await command(actor(a.psy),'assess',p,a.id);
      await review(a,'correct',{message:'Aclaración ficticia'});assert.equal((await record(a)).current,null);assert.equal((await record(a)).canAssess,false);
      assert.equal((await http(a.psy,'/admissions/'+a.id+'/assess',p)).status,409);
      await save(a,{reason:'Otro envío',context:'Segunda versión'});await submit(a);
      let r=await record(a);assert.equal(r.submission,2);assert.equal(r.current,null);assert.equal(r.history.length,1);
      assert.equal((await http(a.psy,'/admissions/'+a.id+'/assess',p)).status,409);
      await assess(a,'EXACT_SECOND',{riskLevel:'unevaluated'});r=await record(a);assert.equal(r.current.submission,2);assert.equal(r.history.length,2);
      await review(a,'validate');assert.equal((await record(a)).current.context,'EXACT_SECOND');
    });
    await t.test('016 independent episodes A B A for the same patient never share values, consent or versions',async()=>{
      const first=await ready(),second=await propose(first.psy,first.pac,first.agreementId),third=await propose(first.psy,first.pac,first.agreementId);
      for(const a of [second,third]){await accept(a);await save(a);await submit(a);}
      await assess(first,'EPISODE_A');assert.equal((await record(second)).current,null);await assess(second,'EPISODE_B');await assess(third,'EPISODE_A_RETURN');
      assert.deepEqual((await Promise.all([record(first),record(second),record(third)])).map(x=>x.current.context),['EPISODE_A','EPISODE_B','EPISODE_A_RETURN']);
      const p=await input(first);assert.equal((await http(first.psy,'/admissions/'+second.id+'/assess',p)).status,409);
      await command(actor(second.pac),'revoke',{...act(),expectedVersion:1},second.id);
      assert.equal((await http(second.psy,'/admissions/'+second.id+'/record')).status,404);assert.equal((await record(first)).current.context,'EPISODE_A');assert.equal((await record(third)).current.context,'EPISODE_A_RETURN');
    });
    await t.test('016 two real simultaneous writers produce one winner and one 409 without silent overwrite',async()=>{
      const a=await ready(),p=await input(a,'WINNER'),c=await connect(),other=await connect();
      try{await c.query('BEGIN');await raw(c,a,'assess',p);await other.query('BEGIN');
        const pending=raw(other,a,'assess',{...p,operationId:randomUUID(),context:'LOSER'}).then(()=>null,e=>e);await waitBlocked(other);await c.query('COMMIT');
        const failure=await pending;assert.equal(failure.message,'admission_conflict');assert.equal(failure.code,'P0001');await other.query('ROLLBACK');
        assert.equal((await record(a)).current.context,'WINNER');assert.equal((await record(a)).history.length,1);
        assert.equal((await http(a.psy,'/admissions/'+a.id+'/assess',{...p,operationId:randomUUID(),context:'LOSER'})).status,409);
      }finally{await c.query('ROLLBACK');await other.query('ROLLBACK');await c.end();await other.end();}
    });
    await t.test('016 rollback of inserted assessment and idempotency is atomic and connection remains usable',async()=>{
      const a=await ready(),p=await input(a,'ROLLBACK_TEXT'),c=await connect();
      try{await c.query('BEGIN');await raw(c,a,'assess',p);await c.query('ROLLBACK');assert.equal((await record(a)).history.length,0);
        await command(actor(a.psy),'assess',p,a.id);assert.equal((await record(a)).history.length,1);
        const r=await transaction(async tx=>{await tx.query('SELECT 1');return 'recovered';});assert.equal(r,'recovered');
      }finally{await c.end();}
    });
    await t.test('016 database failure returns sanitized 503 and rolls back assessment and receipt before deliberate recovery',async()=>{
      const a=await ready(),p=await input(a,'ATOMIC_PRIVATE');
      await client.query(`CREATE FUNCTION fail_authenticated_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.recording_kind='authenticated_admission' THEN RAISE EXCEPTION 'controlled_private_failure'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER fail_authenticated_fixture AFTER INSERT ON episode_private_record_versions FOR EACH ROW EXECUTE FUNCTION fail_authenticated_fixture()`);
      try{const result=await http(a.psy,'/admissions/'+a.id+'/assess',p);assert.equal(result.status,503);assert.doesNotMatch(JSON.stringify(result.body),/ATOMIC_PRIVATE|controlled_private_failure/);
        assert.equal((await record(a)).history.length,0);assert.equal((await client.query('SELECT 1 FROM admission_operations WHERE actor_id=$1 AND operation_id=$2',[a.psy,p.operationId])).rowCount,0);
      }finally{await client.query('DROP TRIGGER fail_authenticated_fixture ON episode_private_record_versions; DROP FUNCTION fail_authenticated_fixture()');}
      assert.equal((await http(a.psy,'/admissions/'+a.id+'/assess',p)).status,200);assert.equal((await record(a)).history.length,1);
    });
    const revokers={
      withdrawal:async(c,a)=>{await c.query('SELECT pg_advisory_xact_lock(73013,1)');return c.query("UPDATE admission_assignments SET state='revoked',revoked_at=clock_timestamp(),version=version+1 WHERE id=$1",[a.id]);},
      agreement:async(c,a)=>c.query("UPDATE bilateral_agreements SET state='unlinked',unlinked_at=clock_timestamp(),version=version+1 WHERE id=$1",[a.agreementId]),
      restriction:async(c,a)=>c.query("UPDATE bilateral_restrictions SET state='suspended' WHERE psychologist_id=$1",[a.psy]),
      inactive:async(c,a)=>c.query('UPDATE users SET is_active=false WHERE id=$1',[a.pac]),
      identity:async(c,a)=>c.query("UPDATE patients SET global_birth_date='1991-01-01' WHERE id=$1",[a.pac]),
      verification:async(c,a)=>c.query("DELETE FROM contact_verification_state WHERE user_id=$1 AND channel='sms'",[a.pac]),
      approval:async(c,a)=>c.query("UPDATE psychologist_profiles SET approval_status='suspended' WHERE user_id=$1",[a.psy]),
      block:async(c,a)=>c.query('INSERT INTO bilateral_blocks(id,account_id,psychologist_id) VALUES(gen_random_uuid(),$1,$2)',[a.pac,a.psy]),
      session:async(c,a)=>c.query('UPDATE users SET session_version=session_version+1 WHERE id=$1',[a.psy]),
    };
    for(const [cause,revoke] of Object.entries(revokers))for(const op of ['record','assess','replay'])for(const first of ['revoker','consumer']){
      await t.test(`016 race ${cause} ${op} ${first} first: authorization is rechecked after real waits`,async()=>{
        const a=await ready(),p=await input(a,'RACE_PRIVATE');if(op==='replay')await command(actor(a.psy),'assess',p,a.id);
        const c=await connect(),source=new pg.Client({...connection,database:name});await source.connect();
        try{
          await c.query('BEGIN');await source.query('BEGIN');
          if(first==='revoker'){
            await revoke(source,a);const pending=raw(c,a,op==='record'?'record':'assess',op==='record'?{}:p).then(()=>null,e=>e);
            await waitBlocked(c);await source.query('COMMIT');const failure=await pending;assert.ok(['admission_missing','admission_session'].includes(failure?.message),failure?.message);await c.query('ROLLBACK');
          }else{
            await raw(c,a,op==='record'?'record':'assess',op==='record'?{}:p);
            const pending=revoke(source,a);await waitBlocked(source);await c.query('COMMIT');await pending;await source.query('COMMIT');
          }
          const read=await http(a.psy,'/admissions/'+a.id+'/record');assert.ok([401,403,404].includes(read.status));
          const write=await http(a.psy,'/admissions/'+a.id+'/assess',p);assert.ok([401,403,404].includes(write.status));
          assert.doesNotMatch(JSON.stringify([read.body,write.body]),/RACE_PRIVATE|authorId|recordedAt|expectedRevision/);
          const own=await http(a.pac,'/admissions/'+a.id);if(!['inactive'].includes(cause)){assert.equal(own.status,200);assert.doesNotMatch(JSON.stringify(own.body),/RACE_PRIVATE|riskLevel/);}
        }finally{await c.query('ROLLBACK');await source.query('ROLLBACK');await c.end();await source.end();}
      });
    }
    for(const kind of ['correction','new submission'])for(const first of ['change','assessment'])await t.test(`016 ${kind} vs assessment ${first} first preserves exact submission and history`,async()=>{
      const a=await ready(),p=await input(a,'EXACT_RACE'),c=await connect(),other=await connect();
      let change;
      if(kind==='new submission'){
        await command(actor(a.psy),'assess',p,a.id);await review(a,'correct',{message:'Otra versión'});await save(a);
        const d=await detail(a),draft=await command(actor(a.pac),'draft',{},a.id);
        change={...act(),expectedVersion:d.version,expectedRevision:draft.revision};
      }else{change={...act(),expectedVersion:p.expectedVersion,submission:1,episodeId:a.episodeId,message:'Otra versión'};}
      const changeOp=kind==='correction'?'correct':'submit',who=kind==='correction'?a.psy:a.pac;
      try{
        await c.query('BEGIN');await other.query('BEGIN');
        if(first==='change'){
          await raw(other,a,changeOp,change,who);
          const pending=raw(c,a,'assess',p).then(()=>null,e=>e);await waitBlocked(c);await other.query('COMMIT');assert.equal((await pending).message,'admission_conflict');await c.query('ROLLBACK');
        }else if(kind==='correction'){
          await raw(c,a,'assess',p);
          const pending=raw(other,a,changeOp,change,who);await waitBlocked(other);await c.query('COMMIT');await pending;await other.query('COMMIT');
        }else{
          // No assessment may succeed while the old submission is in correction, even if its context acquires locks first.
          await c.query('SELECT admission_context($1,0,$2,$3::jsonb)',[a.psy,'assess',JSON.stringify({id:a.id,sessionExpiresAt:actor(a.psy).sessionExpiresAt})]);
          const pending=raw(other,a,changeOp,change,who);await waitBlocked(other);
          await assert.rejects(raw(c,a,'assess',p),/admission_conflict/);await c.query('ROLLBACK');await pending;await other.query('COMMIT');
        }
        const r=await record(a);assert.equal(r.current,null);assert.equal(r.history.length,kind==='new submission'||first==='assessment'?1:0);
        assert.ok(r.history.every(v=>v.submission===1));if(kind==='new submission')assert.equal(r.submission,2);
      }finally{await c.query('ROLLBACK');await other.query('ROLLBACK');await c.end();await other.end();}
    });
    await t.test('016 session expiration after waiting cannot read or write retained content',async()=>{
      const a=await ready(),c=await connect();try{
        await client.query('BEGIN');await client.query('SELECT id FROM users WHERE id=$1 FOR NO KEY UPDATE',[a.psy]);
        const p={id:a.id,sessionExpiresAt:Date.now()/1000+0.2};
        const pending=c.query('SELECT admission_context($1,0,$2,$3::jsonb)',[a.psy,'record',JSON.stringify(p)]).then(()=>null,e=>e);await waitBlocked(c);await new Promise(r=>setTimeout(r,250));await client.query('COMMIT');assert.equal((await pending).message,'admission_session');
      }finally{await client.query('ROLLBACK');await c.end();}
    });
    assert.deepEqual((await client.query('SELECT * FROM care_relationships ORDER BY id')).rows,legacyBefore);
    assert.deepEqual((await client.query('SELECT * FROM patient_clinical_notes ORDER BY id')).rows,notesBefore);
  }finally{
    if(server)await new Promise(r=>server.close(r));await closeAdmission();await closeBilateral();db.query=originalQuery;db.getClient=originalGet;
    if(pool)await pool.end();if(restricted)await restricted.end();if(client)await client.end();await control.end();
    for(const key of ['ADMISSION_ENABLED','ADMISSION_SECRET','ADMISSION_DATABASE_URL','BILATERAL_ENABLED','BILATERAL_SECRET','BILATERAL_DATABASE_URL'])delete process.env[key];
  }
});
