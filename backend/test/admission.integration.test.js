import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import db from '../src/config/db.js';
import env from '../src/config/env.js';
import { installBaseline,syntheticFixture } from '../scripts/episode-sandbox.js';
import { installEpisodeRecordSandbox } from '../scripts/episode-record-sandbox.js';
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

test('014: isolated adult self-admission, exact versions, private projections and concurrent revocation',{
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
    await installBaseline(client);const options=await installEpisodeRecordSandbox(client,name);
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
    let q;
    await t.test('015 HTTP: preparation creates only an empty private record atomically without extending any DTO',async()=>{
      const agreementId=await link('bp22','bq59');
      const before=(await client.query('SELECT count(*)::int n FROM clinical_episodes')).rows[0].n;
      await client.query(`CREATE FUNCTION fail_record_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'controlled_record_failure'; END $$;
        CREATE TRIGGER fail_record_fixture BEFORE INSERT ON episode_private_record_versions FOR EACH ROW EXECUTE FUNCTION fail_record_fixture()`);
      try{
        assert.equal((await http('bp22','/admissions/prepare',{...act(),agreementId})).status,503);
        assert.equal((await client.query('SELECT count(*)::int n FROM clinical_episodes')).rows[0].n,before);
        assert.equal((await client.query('SELECT count(*)::int n FROM admission_preparations')).rows[0].n,0);
        assert.equal((await client.query('SELECT count(*)::int n FROM episode_private_records')).rows[0].n,0);
        assert.equal((await client.query('SELECT count(*)::int n FROM episode_private_record_versions')).rows[0].n,0);
      }finally{await client.query('DROP TRIGGER fail_record_fixture ON episode_private_record_versions; DROP FUNCTION fail_record_fixture()');}
      const response=await http('bp22','/admissions/prepare',{...act(),agreementId});assert.equal(response.status,200);
      assert.deepEqual(Object.keys(response.body.data).sort(),['episodeId','status']);
      const initial=(await client.query('SELECT * FROM episode_private_record_versions WHERE episode_id=$1',[response.body.data.episodeId])).rows[0];
      assert.equal(initial.risk_level,'unevaluated');assert.equal(initial.professional_context,'');assert.equal(initial.technical_author_user_id,null);
      assert.equal(initial.recording_kind,'initial_empty');assert.equal(initial.writer_login,options.admissionClientRole);
      for(const role of [options.admissionClientRole,options.bilateralClientRole,options.accountReaderRole,options.privateNoteCreatorRole]){
        for(const table of ['episode_private_records','episode_private_record_versions']){
          assert.equal((await client.query('SELECT has_table_privilege($1,$2,\'SELECT,INSERT,UPDATE,DELETE\') allowed',[role,table])).rows[0].allowed,false);
        }
      }
      for(const id of ['bp22','bq59','bp2','bq2','bil-admin','bil-support','bil-superadmin']){
        assert.equal((await http(id,'/episodes/'+response.body.data.episodeId+'/clinical-record')).status,404);
      }
    });
    await t.test('fresh 015 preserves SQL 001-014 ledger replay and the separate restricted admission LOGIN',async()=>{
      const hash=await catalogChecksum(client);assert.equal((await migrate(client,options)).status,'already-applied');assert.equal(await catalogChecksum(client),hash);
      await verifyAdmissionContract(client,options.admissionClientRole);
      await assert.rejects(verifyAdmissionContract(client,options.admissionClientRole,{runtime:true}),/Mismatched admission LOGIN/);
      await client.query('GRANT SELECT(answers) ON admission_drafts TO '+options.admissionClientRole);
      await assert.rejects(command(actor('bp1'),'list'),/Unsafe admission LOGIN/);
      await client.query('REVOKE SELECT(answers) ON admission_drafts FROM '+options.admissionClientRole);
      await verifyAdmissionContract(client,options.admissionClientRole);
      for(const sql of ['SELECT * FROM admission_drafts','SELECT * FROM admission_submissions','SELECT * FROM admission_operations','SELECT * FROM patient_intakes','SELECT * FROM patient_clinical_notes','SELECT password_hash FROM users','SELECT bilateral_queue()',"UPDATE users SET is_active=false WHERE id='bq1'","SET session_replication_role='replica'"]){await assert.rejects(restricted.query(sql),e=>e.code==='42501');}
      const bil=new pg.Client({connectionString:process.env.BILATERAL_DATABASE_URL});await bil.connect();try{await assert.rejects(bil.query("SELECT admission_candidates('bp1',0,9999999999)"),e=>e.code==='42501');}finally{await bil.end();}
      q=await propose('bp1','bq1');
    });
    await t.test('PAC titular, unrelated PAC, PSI, backoffice and exact episode are isolated in JSON and errors',async()=>{
      const own=await http(q.pac,'/admissions/'+q.id);assert.equal(own.status,200);assert.equal(own.headers.get('cache-control'),'no-store');
      for(const id of ['bq2','bp2','bil-admin','bil-superadmin','bil-support']){
        const foreign=await http(id,'/admissions/'+q.id),missing=await http(id,'/admissions/'+randomUUID());
        assert.equal(foreign.status,404);assert.deepEqual(foreign.body,missing.body);
        for(const op of ['accept','save','submit','correct','validate','revoke']){
          const input={...act(),expectedVersion:1,...(op==='accept'?{consentVersion:own.body.data.consentVersion,consentHash:own.body.data.consentHash}:op==='save'?{expectedRevision:0,answers}:op==='submit'?{expectedRevision:0}:op==='correct'?{submission:1,episodeId:q.episodeId,message:'Ficticio'}:op==='validate'?{submission:1,episodeId:q.episodeId}:{})};
          assert.equal((await http(id,'/admissions/'+q.id+'/'+op,input)).status,404);
        }
      }
      await assert.rejects(command(actor(q.psy),'draft',{},q.id),/admission_missing/);
      await assert.rejects(command(actor(q.psy),'save',{...act(),expectedVersion:1,expectedRevision:0,answers},q.id),/admission_missing/);
      await assert.rejects(command(actor(q.pac),'validate',{...act(),expectedVersion:1,submission:1,episodeId:q.episodeId},q.id),/admission_missing/);
      await assert.rejects(command(actor(q.pac),'submit',{...act(),expectedVersion:1,expectedRevision:0},q.id),/admission_conflict/);
      const other=await command(actor(q.psy),'prepare',{...act(),agreementId:q.agreementId});
      await assert.rejects(command(actor('bp2'),'assign',{...act(),agreementId:q.agreementId,episodeId:other.episodeId,templateId:'fictional-adult-v1'}),/admission_missing/);
      await assert.rejects(command(actor(q.pac),'accept',{...act(),expectedVersion:1,consentVersion:'fictional-admission-v1',consentHash:'0'.repeat(64)},q.id),/admission_conflict/);
      await accept(q);
    });
    await t.test('private draft and all its metadata are invisible to PSI across saves, lists and writes',async()=>{
      const before=await command(actor(q.psy),'detail',{},q.id),listBefore=await command(actor(q.psy),'list');
      const result=await save(q);assert.deepEqual(result,{revision:1});
      assert.deepEqual(await command(actor(q.psy),'detail',{},q.id),before);assert.deepEqual(await command(actor(q.psy),'list'),listBefore);
      const response=await http(q.pac,'/admissions/'+q.id+'/save',{...act(),expectedVersion:2,expectedRevision:1,answers:{...answers,context:'Otro borrador privado'}});
      assert.equal(response.status,200);assert.deepEqual(response.body.data,{revision:2});
      assert.equal((await command(actor(q.pac),'draft',{},q.id)).answers.context,'Otro borrador privado');
      assert.doesNotMatch(JSON.stringify(await command(actor(q.psy),'list')),/revision|answers|draft|updatedAt|context|reason/);
      await assert.rejects(command(actor(q.pac),'save',{...act(),expectedVersion:2,expectedRevision:1,answers},q.id),/admission_conflict/);
    });
    await t.test('exact immutable submission, correction, new private revision and professional validation',async()=>{
      const first=await submit(q);assert.deepEqual(Object.keys(first).sort(),['id','submission','version']);
      const snapshot=await detail(q);assert.equal(snapshot.submissions.length,1);
      const q2=await propose('bp1','bq1',q.agreementId);await accept(q2);
      assert.deepEqual((await detail(q2)).submissions,[]);
      const parallel=await propose('bp23','bq1');await accept(parallel);
      assert.deepEqual((await command(actor('bp23'),'detail',{},parallel.id)).submissions,[]);
      await assert.rejects(command(actor('bp23'),'detail',{},q.id),/admission_missing/);
      await assert.rejects(command(actor(q.psy),'validate',{...act(),expectedVersion:first.version,submission:1,episodeId:q2.episodeId},q.id),/admission_conflict/);
      await assert.rejects(command(actor(q.psy),'validate',{...act(),expectedVersion:2,submission:1,episodeId:q2.episodeId},q2.id),/admission_conflict/);
      await review(q,'validate');await review(q,'correct',{message:'Aclarar contexto ficticio para el paciente.'});
      const before=await command(actor(q.psy),'detail',{},q.id);await save(q,{reason:'Motivo corregido ficticio',context:'Nuevo contexto privado'});
      assert.deepEqual(await command(actor(q.psy),'detail',{},q.id),before);
      const second=await submit(q);assert.equal(second.submission,2);
      const latest=await detail(q);assert.deepEqual(latest.submissions[0],snapshot.submissions[0]);assert.equal(latest.validations[0].submission,1);assert.equal(latest.reviewState,'submitted');
      await assert.rejects(command(actor(q.psy),'validate',{...act(),expectedVersion:latest.version,submission:1,episodeId:q.episodeId},q.id),/admission_conflict/);
      await review(q,'validate');const final=await detail(q);assert.equal(final.validations.length,2);assert.equal(final.reviewState,'validated');
      for(const sql of ["UPDATE admission_submissions SET answers='{}'",'DELETE FROM admission_submissions','TRUNCATE admission_submissions','DELETE FROM admission_validations','UPDATE admission_templates SET definition=definition'])await assert.rejects(client.query(sql),/admission_immutable|cannot truncate/);
    });
    await t.test('idempotency binds nested answers, exact submission, revalidation and obsolete review replays',async()=>{
      const r=await propose('bp2','bq2');await accept(r);const p={...act(),expectedVersion:2,expectedRevision:0,answers};
      assert.deepEqual(await command(actor(r.pac),'save',p,r.id),await command(actor(r.pac),'save',p,r.id));
      await assert.rejects(command(actor(r.pac),'save',{...p,answers:{...answers,context:'Payload diferente'}},r.id),/admission_conflict/);
      const sent={...act(),expectedVersion:2,expectedRevision:1};const a=await command(actor(r.pac),'submit',sent,r.id);assert.deepEqual(await command(actor(r.pac),'submit',sent,r.id),a);
      const v={...act(),expectedVersion:a.version,submission:1,episodeId:r.episodeId};await command(actor(r.psy),'validate',v,r.id);await review(r,'correct',{message:'Corrección ficticia'});
      await assert.rejects(command(actor(r.psy),'validate',v,r.id),/admission_conflict/);await save(r);await submit(r);
      await assert.rejects(command(actor(r.pac),'submit',sent,r.id),/admission_conflict/);
      const version=(await detail(r)).version;await command(actor(r.pac),'revoke',{...act(),expectedVersion:version},r.id);
      await assert.rejects(command(actor(r.pac),'save',p,r.id),/admission_missing/);
      assert.doesNotMatch(JSON.stringify((await client.query('SELECT * FROM admission_operations')).rows),/Motivo|Contexto|Payload|context|reason|message|consentText/);
    });
    await t.test('competing draft saves and submit versus exact review serialize without lost history',async()=>{
      const r=await propose('bp3','bq3');await accept(r);
      const results=await Promise.allSettled([command(actor(r.pac),'save',{...act(),expectedVersion:2,expectedRevision:0,answers},r.id),command(actor(r.pac),'save',{...act(),expectedVersion:2,expectedRevision:0,answers:{...answers,context:'Competidor'}},r.id)]);
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.message==='admission_conflict').length,1);
      await submit(r);const rev=await detail(r);
      const reviews=await Promise.allSettled([command(actor(r.psy),'validate',{...act(),expectedVersion:rev.version,submission:1,episodeId:r.episodeId},r.id),command(actor(r.psy),'correct',{...act(),expectedVersion:rev.version,submission:1,episodeId:r.episodeId,message:'Corrección concurrente'},r.id)]);
      assert.equal(reviews.filter(r=>r.status==='fulfilled').length,1);assert.equal(reviews.filter(r=>r.status==='rejected').length,1);
    });
    await t.test('every identity, verification, approval, restriction, block and unlink revoker removes operational access permanently',async()=>{
      const cases=[
        "UPDATE users SET is_active=false WHERE id=$1",
        "UPDATE users SET email='changed@admission.invalid' WHERE id=$1",
        "UPDATE patients SET global_birth_date='2010-01-01' WHERE id=$1",
        "UPDATE patients SET phone='+525599999999' WHERE id=$1",
        "DELETE FROM contact_verification_state WHERE user_id=$1 AND channel='email'",
        "UPDATE contact_verification_state SET contact_digest='invalid' WHERE user_id=$1 AND channel='sms'",
      ];
      for(let i=0;i<cases.length;i++){
        const r=await propose('bp'+(i+4),'bq'+(i+4));await accept(r);await save(r);await submit(r);await client.query(cases[i],[r.pac]);
        await assert.rejects(command(actor(r.psy),'detail',{},r.id),/admission_missing/);assert.equal((await command(actor(r.psy),'list')).some(a=>a.id===r.id),false);
      }
      for(const [offset,sql]of [
        [10,"UPDATE psychologist_profiles SET approval_status='suspended' WHERE user_id=$1"],
        [11,"UPDATE bilateral_restrictions SET state='suspended' WHERE psychologist_id=$1"],
        [12,"DELETE FROM bilateral_restrictions WHERE psychologist_id=$1"],
        [13,"UPDATE users SET is_active=false WHERE id=$1"],
      ]){
        const r=await propose('bp'+offset,'bq'+offset);await accept(r);await client.query(sql,[r.psy]);assert.equal((await detail(r)).readOnly,true);await assert.rejects(command(actor(r.psy),'detail',{},r.id),/admission_missing|admission_session/);
        if(offset===11){await client.query("UPDATE bilateral_restrictions SET state='enabled' WHERE psychologist_id=$1",[r.psy]);assert.equal((await detail(r)).readOnly,true);await assert.rejects(command(actor(r.psy),'detail',{},r.id),/admission_missing|admission_session/);}
      }
      const r=await propose('bp14','bq14');await accept(r);
      await bilateral(actor(r.pac),'unlink',{...act(),expectedVersion:1},r.agreementId);assert.equal((await detail(r)).readOnly,true);await assert.rejects(command(actor(r.psy),'detail',{},r.id),/admission_missing|admission_session/);
      const s=await propose('bp15','bq15');await accept(s);
      await client.query('INSERT INTO bilateral_blocks(id,account_id,psychologist_id) VALUES($1,$2,$3)',[randomUUID(),s.pac,s.psy]);assert.equal((await detail(s)).readOnly,true);await assert.rejects(command(actor(s.psy),'detail',{},s.id),/admission_missing|admission_session/);
    });
    await t.test('moving restriction or block keys cannot create a dormant grant that revives after restoration',async()=>{
      const r=await propose('bp18','bq18');await accept(r);
      await client.query("DELETE FROM bilateral_restrictions WHERE psychologist_id='bp24'");
      await client.query("UPDATE bilateral_restrictions SET psychologist_id='bp24' WHERE psychologist_id='bp18'");
      assert.equal((await detail(r)).readOnly,true);await assert.rejects(command(actor(r.psy),'detail',{},r.id),/admission_missing|admission_session/);
      await client.query("UPDATE bilateral_restrictions SET psychologist_id='bp18' WHERE psychologist_id='bp24'");
      assert.equal((await detail(r)).readOnly,true);await assert.rejects(command(actor(r.psy),'detail',{},r.id),/admission_missing|admission_session/);
      const s=await propose('bp19','bq19'),block=randomUUID();await accept(s);
      await client.query("INSERT INTO bilateral_blocks(id,account_id,psychologist_id) VALUES($1,'bq60','bp19')",[block]);
      await client.query("UPDATE bilateral_blocks SET account_id='bq19' WHERE id=$1",[block]);
      assert.equal((await detail(s)).readOnly,true);await assert.rejects(command(actor(s.psy),'detail',{},s.id),/admission_missing|admission_session/);
      await client.query('DELETE FROM bilateral_blocks WHERE id=$1',[block]);
      assert.equal((await detail(s)).readOnly,true);await assert.rejects(command(actor(s.psy),'detail',{},s.id),/admission_missing|admission_session/);
    });
    await t.test('independent connections prove revocation versus read, submit and validation in both commit orders',async()=>{
      const one=new pg.Client({connectionString:process.env.ADMISSION_DATABASE_URL}),two=new pg.Client({...connection,database:name});await one.connect();await two.connect();
      const waitBlocked=async(pid)=>{for(let n=0;n<150;n++){if((await client.query('SELECT cardinality(pg_blocking_pids($1))>0 blocked',[pid])).rows[0].blocked)return;await new Promise(r=>setTimeout(r,10));}assert.fail('Expected actual PostgreSQL lock wait');};
      try{
        let index=0;
        for(const revoker of ['consent','unlink','restriction','account','verification','profile','block'])for(const op of ['detail','submit','validate'])for(const order of ['revoker','operation']){
          const psy='bp_race_'+index,pac='bq_race_'+index++,phone='+525588'+String(index).padStart(6,'0');
          await client.query("INSERT INTO patients(id,first_name,full_name,phone,global_birth_date) VALUES($1,$1,$1,$2,'1990-01-01')",[pac,phone]);
          await client.query("INSERT INTO users(id,first_name,email,password_hash,role,patient_id) SELECT $1,$1,$2,password_hash,'patient',$1 FROM users WHERE id='bp1'",[pac,pac+'@bilateral.invalid']);
          for(const [channel,value]of [['email',pac+'@bilateral.invalid'],['sms',phone]])await client.query('INSERT INTO contact_verification_state VALUES($1,$2,$3,clock_timestamp())',[pac,channel,contactDigest(channel,value)]);
          await client.query("INSERT INTO users(id,first_name,email,password_hash,role) SELECT $1,$2,$3,password_hash,'psychologist' FROM users WHERE id='bp1'",[psy,'Profesional ficticio '+psy,psy+'@bilateral.invalid']);
          await client.query("INSERT INTO psychologist_profiles(user_id,approval_status) VALUES($1,'active')",[psy]);
          await client.query("INSERT INTO bilateral_restrictions(psychologist_id,state,justification) VALUES($1,'enabled','Ensayo de concurrencia ficticio')",[psy]);
          const r=await propose(psy,pac);await accept(r);await save(r);if(op!=='submit')await submit(r);
          const d=await detail(r),own=op==='submit'?r.pac:r.psy;
          const p={id:r.id,sessionExpiresAt:actor(own).sessionExpiresAt,emailDigest:contactDigest('email',pac+'@bilateral.invalid'),phoneDigest:contactDigest('sms',phone),...act(),expectedVersion:d.version,fingerprint:'a'.repeat(64),...(op==='submit'?{expectedRevision:1}:op==='validate'?{submission:1,episodeId:r.episodeId}:{})};
          const operation=()=>one.query('SELECT admission_command($1,0,$2,$3::jsonb) data',[own,op,JSON.stringify(p)]);
          const revoke=()=>{
            if(revoker==='consent')return two.query("SELECT admission_command($1,0,'revoke',$2::jsonb)",[r.pac,JSON.stringify({...p,...act(),fingerprint:'b'.repeat(64)})]);
            if(revoker==='unlink')return two.query("SELECT bilateral_command($1,0,'unlink',$2::jsonb)",[r.pac,JSON.stringify({...act(),id:r.agreementId,expectedVersion:1,fingerprint:'b'.repeat(64)})]);
            if(revoker==='account')return two.query('UPDATE users SET is_active=false WHERE id=$1',[r.pac]);
            if(revoker==='verification')return two.query("DELETE FROM contact_verification_state WHERE user_id=$1 AND channel='email'",[r.pac]);
            if(revoker==='profile')return two.query("UPDATE psychologist_profiles SET approval_status='suspended' WHERE user_id=$1",[r.psy]);
            if(revoker==='block')return two.query('INSERT INTO bilateral_blocks(id,account_id,psychologist_id) VALUES($1,$2,$3)',[randomUUID(),r.pac,r.psy]);
            return two.query("UPDATE bilateral_restrictions SET state='suspended' WHERE psychologist_id=$1",[r.psy]);
          };
          if(order==='revoker'){
            await two.query('BEGIN');await revoke();const pending=operation().then(()=>null,e=>e);await waitBlocked(one.processID);await two.query('COMMIT');assert.ok(['admission_missing','admission_session'].includes((await pending)?.message));
          }else{
            await one.query('BEGIN');await operation();await two.query('BEGIN');const pending=revoke().then(()=>null,e=>e);await waitBlocked(two.processID);await one.query('COMMIT');assert.equal(await pending,null);await two.query('COMMIT');
          }
          await assert.rejects(command(actor(own),op,op==='detail'?{}:op==='submit'?{...act(),expectedVersion:d.version,expectedRevision:1}:{...act(),expectedVersion:d.version,submission:1,episodeId:r.episodeId},r.id),/admission_missing|admission_session/);
          if(revoker==='restriction')await client.query("UPDATE bilateral_restrictions SET state='enabled' WHERE psychologist_id=$1",[r.psy]);
        }
      }finally{await one.query('ROLLBACK');await two.query('ROLLBACK');await one.end();await two.end();}
    });
    await t.test('P2-01 HTTP: owner retains exact draft and submissions after consent unlink restrictions approval and professional inactivity',async()=>{
      for(const revoker of ['consent','unlink','restriction','profile','professional-account']){
        const r=await freshOwnAdmission();await accept(r);await save(r);await submit(r);
        await review(r,'correct',{message:'Mensaje profesional destinado antes de revocación'});
        await save(r,{reason:'Borrador corregido propio',context:'No enviado al profesional'});
        const old=await detail(r),draft=await command(actor(r.pac),'draft',{},r.id);
        const history=async()=>(await client.query('SELECT answers,number,author_id FROM admission_submissions WHERE assignment_id=$1 ORDER BY number',[r.id])).rows;
        const before=await history();
        if(revoker==='consent')assert.equal((await http(r.pac,'/admissions/'+r.id+'/revoke',{...act(),expectedVersion:old.version})).status,200);
        else if(revoker==='unlink')assert.equal((await http(r.pac,'/bilateral-invitations/'+r.agreementId+'/unlink',{...act(),expectedVersion:1})).status,200);
        else if(revoker==='restriction')await client.query("UPDATE bilateral_restrictions SET state='suspended' WHERE psychologist_id=$1",[r.psy]);
        else if(revoker==='profile')await client.query("UPDATE psychologist_profiles SET approval_status='suspended' WHERE user_id=$1",[r.psy]);
        else await client.query('UPDATE users SET is_active=false WHERE id=$1',[r.psy]);
        const stateBefore=(await client.query('SELECT * FROM admission_assignments WHERE id=$1',[r.id])).rows[0];
        assert.equal(stateBefore.state,'revoked');
        const kept=await http(r.pac,'/admissions/'+r.id),keptDraft=await http(r.pac,'/admissions/'+r.id+'/draft'),list=await http(r.pac,'/admissions');
        assert.equal(kept.status,200);assert.equal(kept.headers.get('cache-control'),'no-store');
        assert.equal(kept.body.data.readOnly,true);assert.equal(kept.body.data.state,'revoked');assert.equal(kept.body.data.episodeId,r.episodeId);
        assert.deepEqual(kept.body.data.submissions,old.submissions);assert.deepEqual(kept.body.data.corrections,[]);assert.deepEqual(kept.body.data.validations,[]);
        assert.equal(keptDraft.status,200);assert.deepEqual(keptDraft.body.data,draft);assert.ok(list.body.data.some(i=>i.id===r.id&&i.readOnly));
        const foreignOwn=await freshOwnAdmission();
        for(const stranger of ['bq56','bp21','bil-admin','bil-superadmin','bil-support'])for(const suffix of ['', '/draft']){
          const denied=await http(stranger,'/admissions/'+r.id+suffix),missing=await http(stranger,'/admissions/'+randomUUID()+suffix);
          assert.equal(denied.status,404);assert.deepEqual(denied.body,missing.body);
        }
        assert.equal((await http(r.pac,'/admissions/'+foreignOwn.id)).status,404);
        for(const suffix of ['', '/draft'])assert.ok([401,403,404].includes((await http(r.psy,'/admissions/'+r.id+suffix)).status));
        await assert.rejects(command(actor(r.psy),'detail',{},r.id),/admission_missing|admission_session/);
        for(const [op,input]of [['save',{expectedRevision:draft.revision,answers}],['submit',{expectedRevision:draft.revision}],['accept',{consentVersion:old.consentVersion,consentHash:old.consentHash}]])
          assert.equal((await http(r.pac,'/admissions/'+r.id+'/'+op,{...act(),expectedVersion:old.version,...input})).status,404);
        await assert.rejects(review(r,'validate'),/admission_missing|admission_session/);
        assert.deepEqual((await client.query('SELECT * FROM admission_assignments WHERE id=$1',[r.id])).rows[0],stateBefore);
        assert.deepEqual(await history(),before);
        if(revoker==='restriction')await client.query("UPDATE bilateral_restrictions SET state='enabled' WHERE psychologist_id=$1",[r.psy]);
        if(revoker==='profile')await client.query("UPDATE psychologist_profiles SET approval_status='active' WHERE user_id=$1",[r.psy]);
        if(revoker==='professional-account')await client.query('UPDATE users SET is_active=true WHERE id=$1',[r.psy]);
      }
    });
    await t.test('P2-01 PostgreSQL and HTTP: own reads survive concurrent withdrawal unlink and restrictions in both orders',async()=>{
      const reader=new pg.Client({connectionString:process.env.ADMISSION_DATABASE_URL}),revoker=new pg.Client({...connection,database:name});await reader.connect();await revoker.connect();
      const blocked=async pid=>{for(let n=0;n<150;n++){if((await client.query('SELECT cardinality(pg_blocking_pids($1))>0 AS blocked',[pid])).rows[0].blocked)return;await new Promise(r=>setTimeout(r,10));}assert.fail('Expected real PostgreSQL lock wait');};
      try{
        for(const cause of ['consent','unlink','restriction'])for(const op of ['summary','detail','draft'])for(const first of ['reader','revoker']){
          const r=await freshOwnAdmission();
          await accept(r);await save(r);await submit(r);
          const d=await detail(r),p={id:r.id,sessionExpiresAt:actor(r.pac).sessionExpiresAt};
          const read=()=>reader.query('SELECT admission_command($1,0,$2,$3::jsonb) AS data',[r.pac,op,JSON.stringify(p)]);
          const revoke=()=>cause==='consent'?revoker.query("SELECT admission_command($1,0,'revoke',$2::jsonb)",[r.pac,JSON.stringify({...p,...act(),expectedVersion:d.version,fingerprint:'c'.repeat(64),emailDigest:contactDigest('email',r.pac+'@bilateral.invalid'),phoneDigest:contactDigest('sms',r.phone)})]):cause==='unlink'?revoker.query("SELECT bilateral_command($1,0,'unlink',$2::jsonb)",[r.pac,JSON.stringify({...act(),id:r.agreementId,expectedVersion:1,fingerprint:'d'.repeat(64)})]):revoker.query("UPDATE bilateral_restrictions SET state='suspended' WHERE psychologist_id=$1",[r.psy]);
          if(first==='revoker'){
            await revoker.query('BEGIN');await revoke();const pending=read();await blocked(reader.processID);await revoker.query('COMMIT');const result=(await pending).rows[0].data;
            if(op!=='draft')assert.equal(result.readOnly,true);else assert.deepEqual(result.answers,answers);
          }else{
            await reader.query('BEGIN');await read();await revoker.query('BEGIN');const pending=revoke();await blocked(revoker.processID);await reader.query('COMMIT');await pending;await revoker.query('COMMIT');
          }
          const after=await http(r.pac,'/admissions/'+r.id+(op==='draft'?'/draft':''));assert.equal(after.status,200);
          await assert.rejects(command(actor(r.psy),'detail',{},r.id),/admission_missing/);
          await assert.rejects(submit(r),/admission_missing/);
          if(cause==='restriction')await client.query("UPDATE bilateral_restrictions SET state='enabled' WHERE psychologist_id=$1",[r.psy]);
        }
      }finally{await reader.query('ROLLBACK');await revoker.query('ROLLBACK');await reader.end();await revoker.end();}
    });
    await t.test('P2-01 own archive still requires current account session and exact patient identity after revocation',async()=>{
      const r=await freshOwnAdmission();await accept(r);await save(r);await submit(r);
      await command(actor(r.pac),'revoke',{...act(),expectedVersion:(await detail(r)).version},r.id);
      await client.query('UPDATE users SET session_version=session_version+1 WHERE id=$1',[r.pac]);
      assert.equal((await http(r.pac,'/admissions/'+r.id)).status,401);
      assert.equal((await http(r.pac,'/admissions/'+r.id,undefined,'GET',1)).status,200);
      await client.query("UPDATE users SET role='admin' WHERE id=$1",[r.pac]);
      const adminVersion=(await client.query('SELECT session_version FROM users WHERE id=$1',[r.pac])).rows[0].session_version;
      await assert.rejects(command({...actor(r.pac),sessionVersion:adminVersion},'detail',{},r.id),/admission_missing/);
      await client.query("UPDATE users SET role='patient' WHERE id=$1",[r.pac]);
      await client.query("INSERT INTO patients(id,first_name,full_name) VALUES('own-identity-replacement','Ficticio','Ficticio')");
      await client.query("UPDATE users SET patient_id='own-identity-replacement' WHERE id=$1",[r.pac]);
      const currentVersion=(await client.query('SELECT session_version FROM users WHERE id=$1',[r.pac])).rows[0].session_version;
      await assert.rejects(command({...actor(r.pac),sessionVersion:currentVersion},'detail',{},r.id),/admission_missing/);
      await client.query('UPDATE users SET is_active=false WHERE id=$1',[r.pac]);
      await assert.rejects(command({...actor(r.pac),sessionVersion:1},'draft',{},r.id),/admission_session/);
      await assert.rejects(command({...actor('bq1'),sessionExpiresAt:Date.now()/1000-1},'detail',{},q.id),/admission_session/);
    });
    await t.test('session revocation and expiry after a real lock wait deny without withdrawing other sessions consent',async()=>{
      const r=await propose('bp17','bq50');await accept(r);await client.query('UPDATE users SET session_version=session_version+1 WHERE id=$1',[r.pac]);
      await assert.rejects(detail(r),/admission_session/);
      const fresh={...actor(r.pac),sessionVersion:1};assert.equal((await command(fresh,'detail',{},r.id)).state,'accepted');
      const holder=new pg.Client({...connection,database:name});await holder.connect();
      try{
        await holder.query('BEGIN');await holder.query('SELECT pg_advisory_xact_lock(73013,1)');
        const pending=command({...fresh,sessionExpiresAt:Date.now()/1000+0.15},'detail',{},r.id).then(()=>null,e=>e);
        await new Promise(r=>setTimeout(r,250));await holder.query('COMMIT');assert.equal((await pending)?.message,'admission_session');
      }finally{await holder.query('ROLLBACK');await holder.end();}
    });
    await t.test('malformed input and elevated pool fail closed, and rollback does not poison following requests',async()=>{
      const bad=await fetch(url+'/api/admissions',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"reason":"never-log"'});assert.equal(bad.status,400);assert.doesNotMatch(await bad.text(),/never-log|SyntaxError|stack/);
      assert.equal((await http('bp1','/admissions?patientId=bq2')).status,400);
      await assert.rejects(transaction(async()=>{throw new Error('controlled rollback');}),/controlled rollback/);assert.ok(Array.isArray(await command(actor('bp1'),'list')));
      await closeAdmission();process.env.ADMISSION_DATABASE_URL=`postgres://${env.dbUser}:${env.dbPassword}@db:5432/${name}`;
      await assert.rejects(command(actor('bp1'),'list'),/Unsafe admission LOGIN/);await closeAdmission();process.env.ADMISSION_DATABASE_URL=`postgres://${options.admissionClientRole}:disposable_admission_roles@db:5432/${name}`;
      const off=process.env.ADMISSION_ENABLED;process.env.ADMISSION_ENABLED='false';assert.equal((await http('bp1','/admissions')).status,404);process.env.ADMISSION_ENABLED=off;
    });
    await t.test('015 preparation serializes with all seven admission revokers in both real commit orders',async()=>{
      const reader=new pg.Client({connectionString:process.env.ADMISSION_DATABASE_URL}),revoker=new pg.Client({...connection,database:name});
      await reader.connect();await revoker.connect();
      const blocked=async pid=>{for(let n=0;n<200;n++){
        if((await client.query('SELECT cardinality(pg_blocking_pids($1))>0 blocked',[pid])).rows[0].blocked)return;
        await new Promise(r=>setTimeout(r,10));
      }assert.fail('Expected real preparation lock wait');};
      try{
        for(const cause of ['consent','unlink','restriction','account','verification','profile','block'])for(const first of ['operation','revoker']){
          const r=await freshOwnAdmission();
          const before=(await client.query('SELECT count(*)::int n FROM episode_private_records')).rows[0].n;
          const p={...act(),agreementId:r.agreementId,sessionExpiresAt:actor(r.psy).sessionExpiresAt,fingerprint:'e'.repeat(64),
            emailDigest:contactDigest('email',r.pac+'@bilateral.invalid'),phoneDigest:contactDigest('sms',r.phone)};
          const prepare=()=>reader.query("SELECT admission_command($1,0,'prepare',$2::jsonb) data",[r.psy,JSON.stringify(p)]);
          // Consent withdrawal is assignment-scoped: it must NOT revoke the
          // bilateral agreement or prohibit preparing another independent episode.
          const revoke=()=>cause==='consent'?revoker.query("SELECT admission_command($1,0,'revoke',$2::jsonb)",[r.pac,JSON.stringify({...p,id:r.id,fingerprint:'f'.repeat(64)})]):
            cause==='unlink'?revoker.query("SELECT bilateral_command($1,0,'unlink',$2::jsonb)",[r.pac,JSON.stringify({...p,id:r.agreementId,expectedVersion:1})]):
            cause==='restriction'?revoker.query("UPDATE bilateral_restrictions SET state='suspended' WHERE psychologist_id=$1",[r.psy]):
            cause==='account'?revoker.query('UPDATE users SET is_active=false WHERE id=$1',[r.pac]):
            cause==='verification'?revoker.query("DELETE FROM contact_verification_state WHERE user_id=$1 AND channel='email'",[r.pac]):
            cause==='profile'?revoker.query("UPDATE psychologist_profiles SET approval_status='suspended' WHERE user_id=$1",[r.psy]):
            revoker.query('INSERT INTO bilateral_blocks(id,account_id,psychologist_id) VALUES($1,$2,$3)',[randomUUID(),r.pac,r.psy]);
          if(first==='revoker'){
            await revoker.query('BEGIN');await revoke();const pending=prepare().then(r=>r,e=>e);await blocked(reader.processID);await revoker.query('COMMIT');
            const result=await pending;
            if(cause==='consent')assert.equal(result.rows[0].data.status,'prepared');
            else assert.match(result.message,/admission_missing|admission_session/);
          }else{
            await reader.query('BEGIN');await prepare();await revoker.query('BEGIN');const pending=revoke();await blocked(revoker.processID);
            await reader.query('COMMIT');await pending;await revoker.query('COMMIT');
          }
          const after=(await client.query('SELECT count(*)::int n FROM episode_private_records')).rows[0].n;
          assert.equal(after,before+(first==='operation'||cause==='consent'?1:0));
          assert.equal((await client.query(`SELECT count(*)::int n FROM admission_preparations p LEFT JOIN episode_private_records r USING(episode_id)
            LEFT JOIN episode_private_record_versions v ON v.episode_id=p.episode_id AND v.revision=1 WHERE r.episode_id IS NULL OR v.episode_id IS NULL`)).rows[0].n,0);
        }
      }finally{await reader.query('ROLLBACK');await revoker.query('ROLLBACK');await reader.end();await revoker.end();}
    });
    await t.test('014 provisioning rolls back late DDL failure and refuses populated 013 without adopting data or ledger',async()=>{
      const freshName='psicopanel_episode_admission_'+randomUUID().replaceAll('-','');
      await control.query('CREATE DATABASE "'+freshName+'"');const fresh=new pg.Client({...connection,database:freshName});await fresh.connect();
      try{
        await installBaseline(fresh);const opts=await installBilateralSandbox(fresh,freshName);
        const runtime='ar_'+randomUUID().replaceAll('-','');await fresh.query('CREATE ROLE '+runtime+" LOGIN NOINHERIT PASSWORD 'disposable_admission_roles'");
        const settings={...opts,target:'014',admissionClientRole:runtime},ledger=(await fresh.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows,hash=await catalogChecksum(fresh);
        const broken={query:(sql,args)=>fresh.query(String(sql).includes('CREATE TABLE admission_templates')?sql+' SELECT 1/0;':sql,args)};
        await assert.rejects(migrate(broken,settings),/division by zero/);
        assert.equal(await catalogChecksum(fresh),hash);assert.deepEqual((await fresh.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows,ledger);
        assert.equal((await fresh.query("SELECT count(*)::int n FROM pg_roles WHERE rolname='admission_owner_'||substr(md5(current_database()),1,16)")).rows[0].n,0);
        await fresh.query("INSERT INTO patients(id,first_name,full_name) VALUES('isolated-history','Ficticio','Ficticio')");
        await assert.rejects(migrate(fresh,settings),/empty isolated destination/);
        assert.equal(await catalogChecksum(fresh),hash);assert.deepEqual((await fresh.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows,ledger);
        assert.equal((await fresh.query("SELECT count(*)::int n FROM patients WHERE id='isolated-history'")).rows[0].n,1);
      }finally{await fresh.end();}
    });
    await t.test('no activation, legacy side access, historical rewrite or generic content duplication',async()=>{
      assert.deepEqual((await client.query('SELECT * FROM care_relationships ORDER BY id')).rows,legacyBefore);
      assert.deepEqual((await client.query('SELECT * FROM patient_clinical_notes ORDER BY id')).rows,notesBefore);
      assert.equal((await client.query("SELECT count(*)::int n FROM clinical_episodes WHERE status<>'prepared' OR started_at IS NOT NULL")).rows[0].n,0);
      assert.equal((await client.query('SELECT count(*)::int n FROM patient_intakes')).rows[0].n,0);
      assert.doesNotMatch(JSON.stringify((await client.query('SELECT * FROM clinical_record_history')).rows),/Motivo exclusivamente|Contexto privado|Nuevo contexto/);
      const forbidden=await http('bp1','/patients/bq1');assert.equal(forbidden.status,404);
      const pending=await http('bp1','/auth/care-relationships/request',{patientId:'bq1'});assert.equal(pending.status,403);
      await assert.rejects(client.query("UPDATE clinical_episodes SET status='active'"));
      await assert.rejects(migrate(client,{...options,target:'013'}),/downgrade forbidden/);
    });
  }finally{
    if(server)await new Promise(r=>server.close(r));await closeAdmission();await closeBilateral();if(restricted)await restricted.end();
    db.query=originalQuery;db.getClient=originalGet;if(pool)await pool.end();if(client)await client.end();await control.end();
    for(const key of ['ADMISSION_ENABLED','ADMISSION_SECRET','ADMISSION_DATABASE_URL','BILATERAL_ENABLED','BILATERAL_SECRET','BILATERAL_DATABASE_URL'])delete process.env[key];
  }
});
