import { fingerprint } from '../src/modules/admission/admission.policy.js';
import { installEpisodeRecordSandbox } from '../scripts/episode-record-sandbox.js';
import { installDirectedSandbox as installAssessmentSandbox } from '../scripts/admission-directed-sandbox.js';
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

test('017: directed interviews, correction decisions, private assessment and races',{
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
      const assigned=await command(actor(psy),'assign-directed',{...act(),agreementId,episodeId:prepared.episodeId,templateId:'fictional-adult-v1'});
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
    const ready=async()=>{const q=await freshOwnAdmission();await accept(q);await write(q,'directed-attest');await write(q,'directed-document',{expectedDocumentRevision:0,declarations:answers});return q;};
    const write=async(q,op,extra={},who=q.psy)=>{const d=await detail(q);return command(actor(who),op,{...act(),expectedVersion:d.version,...extra},q.id);};
    const record=q=>command(actor(q.psy),'directed-record',{},q.id);
    const input=async(q,context='PRIVATE_ASSESSMENT',extra={})=>{const r=await record(q);return {...act(),expectedVersion:r.version,expectedRevision:r.expectedRevision,episodeId:q.episodeId,documentRevision:r.documentRevision,riskLevel:'high',context,...extra};};
    const assess=async(q,context,extra)=>command(actor(q.psy),'directed-assess',await input(q,context,extra),q.id);
    const connect=async()=>{const c=new pg.Client({connectionString:process.env.ADMISSION_DATABASE_URL});await c.connect();return c;};
    // Same SQL boundary and exact fingerprint as HTTP, on independently controlled transactions.
    const raw=async(c,q,op,source={},who=q.psy)=>{
      const p={...source,id:q.id,sessionExpiresAt:actor(q.psy).sessionExpiresAt,newId:randomUUID(),fingerprint:fingerprint({op,input:source,id:q.id},process.env.ADMISSION_SECRET)};
      const ctx=(await c.query('SELECT admission_context($1,0,$2,$3::jsonb) data',[who,op,JSON.stringify(p)])).rows[0].data;
      p.emailDigest=contactDigest('email',ctx.email);p.phoneDigest=contactDigest('sms',ctx.phone);
      return (await c.query('SELECT admission_command($1,0,$2,$3::jsonb) data',[who,op,JSON.stringify(p)])).rows[0].data;
    };
    const waitBlocked=async c=>{for(let n=0;n<200;n++){if((await client.query('SELECT cardinality(pg_blocking_pids($1))>0 b',[c.processID])).rows[0].b)return;await new Promise(r=>setTimeout(r,10));}assert.fail('Expected real PostgreSQL lock wait');};

    const request=async(q,documentRevision=1)=>write(q,'directed-request',{documentRevision,reason:'Solicito rectificar esta declaración ficticia'},q.pac);
    const resolve=async(q,requestId,decision='accept')=>write(q,'directed-resolve',{expectedDocumentRevision:(await detail(q)).latestDocument,requestId,decision,explanation:'Decisión motivada ficticia',...(decision==='accept'?{declarations:{...answers,reason:'DECLARACION_CORREGIDA'}}:{})});
    const validateDirected=async q=>write(q,'directed-validate',{documentRevision:(await detail(q)).latestDocument,episodeId:q.episodeId});
    await t.test('017 install replay preserves historical ledger hashes and denies direct LOGIN access',async()=>{
      const before=(await client.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows;
      assert.equal(before.length,17);assert.equal((await migrate(client,options)).status,'already-applied');
      assert.deepEqual((await client.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows,before);
      await verifyAdmissionContract(client,options.admissionClientRole);
      for(const table of ['admission_directed_attestations','admission_directed_versions','admission_directed_requests','admission_directed_resolutions','admission_directed_validations','episode_private_record_versions'])
        await assert.rejects(restricted.query('SELECT * FROM '+table),e=>e.code==='42501');
      await assert.rejects(restricted.query("SELECT admission_directed_command('bp1',0,'detail','{}')"),e=>e.code==='42501');
    });
    await t.test('017 failed isolated upgrade rolls back DDL and preserves 001-016 ledger and catalog',async()=>{
      const freshName='psicopanel_episode_d17_'+randomUUID().replaceAll('-','');await control.query('CREATE DATABASE "'+freshName+'"');
      const fresh=new pg.Client({...connection,database:freshName});await fresh.connect();try{
        await installBaseline(fresh);const prior=await installEpisodeRecordSandbox(fresh,freshName);await migrate(fresh,{...prior,target:'016'});
        const before=(await fresh.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows,hash=await catalogChecksum(fresh);
        const broken={query:(sql,args)=>fresh.query(String(sql).includes('-- Directed documents never')?sql+' SELECT 1/0;':sql,args)};
        await assert.rejects(migrate(broken,{...prior,target:'017'}),/division by zero/);assert.equal(await catalogChecksum(fresh),hash);
        assert.deepEqual((await fresh.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows,before);
        await migrate(fresh,{...prior,target:'017'});assert.deepEqual((await fresh.query("SELECT * FROM psicopanel_schema_migrations WHERE version<'017' ORDER BY version")).rows,before);
        await fresh.query('GRANT SELECT ON admission_directed_versions TO PUBLIC');await assert.rejects(migrate(fresh,{...prior,target:'017'}),/drift/);
      }finally{await fresh.end();}
    });
    await t.test('017 exact consent must precede professional attestation and incorporation; v2 never grants directed rights',async()=>{
      const a=await freshOwnAdmission(),d=await detail(a);
      await assert.rejects(write(a,'directed-attest'),/admission_missing/);
      const bad=await http(a.pac,'/admissions/'+a.id+'/accept',{...act(),expectedVersion:d.version,consentVersion:'fictional-admission-v2',consentHash:d.consentHash});assert.equal(bad.status,409);
      await accept(a);await assert.rejects(write(a,'directed-document',{expectedDocumentRevision:0,declarations:answers}),/admission_conflict/);
      await write(a,'directed-attest');await write(a,'directed-document',{expectedDocumentRevision:0,declarations:answers});
      const own=await detail(a);assert.equal(own.mode,'directed');assert.equal(own.documents[0].authorId,a.psy);assert.equal(own.documents[0].subjectId,a.pac);
      assert.equal(own.documents[0].source,'professional_directed_interview');assert.equal(own.documents[0].declarations.reason,answers.reason);
      assert.ok(new Date(own.attestation.recordedAt)<=new Date(own.documents[0].recordedAt));
      assert.equal((await client.query('SELECT * FROM admission_submissions WHERE assignment_id=$1',[a.id])).rowCount,0);
    });
    await t.test('017 complete HTTP professional document PAC history private assessment and explicit validation never activate',async()=>{
      const a=await ready();assert.equal((await record(a)).current,null);
      const p=await input(a,'PRIVATE_RISK_SENTINEL');const saved=await http(a.psy,'/admissions/'+a.id+'/directed/assess',p);assert.equal(saved.status,200);
      assert.deepEqual(Object.keys(saved.body.data).sort(),['revision','saved','version']);
      const r=await record(a);assert.equal(r.current.context,'PRIVATE_RISK_SENTINEL');assert.equal(r.current.documentRevision,1);assert.equal(r.current.authorId,a.psy);
      await validateDirected(a);assert.equal((await detail(a)).reviewState,'validated');
      const own=await http(a.pac,'/admissions/'+a.id);assert.equal(own.status,200);
      assert.doesNotMatch(JSON.stringify(own.body),/PRIVATE_RISK_SENTINEL|riskLevel|expectedRevision|authenticated_session|writer_login/);
      assert.deepEqual((await client.query('SELECT status,started_at FROM clinical_episodes WHERE id=$1',[a.episodeId])).rows,[{status:'prepared',started_at:null}]);
    });
    await t.test('017 accept correction appends linked immutable version and resets sufficiency and risk without mutating previous values',async()=>{
      const a=await ready();await assess(a,'PREVIOUS_PRIVATE');await validateDirected(a);
      const req=await request(a);const pending=await record(a);assert.equal(pending.current.context,'PREVIOUS_PRIVATE');assert.equal(pending.canAssess,false);
      await assert.rejects(validateDirected(a),/admission_conflict/);
      await resolve(a,req.requestId);const d=await detail(a);assert.equal(d.latestDocument,2);assert.equal(d.documents.length,2);assert.equal(d.documents[0].declarations.reason,answers.reason);
      assert.equal(d.requests[0].resolution.decision,'accept');assert.equal(d.requests[0].resolution.documentRevision,2);assert.equal(d.reviewState,'documented');
      const r=await record(a);assert.equal(r.current,null);assert.equal(r.history[0].context,'PREVIOUS_PRIVATE');assert.equal(r.documentRevision,2);
      await assess(a,'NEW_PRIVATE');await validateDirected(a);
    });
    await t.test('017 motivated rejection preserves document and private assessment with traceable decision and explicit revalidation',async()=>{
      const a=await ready();await assess(a,'PRESERVED_PRIVATE');await validateDirected(a);const req=await request(a);
      await resolve(a,req.requestId,'reject');const d=await detail(a);assert.equal(d.documents.length,1);assert.equal(d.latestDocument,1);assert.equal(d.reviewState,'documented');
      assert.equal(d.requests[0].resolution.decision,'reject');assert.equal(d.requests[0].resolution.explanation,'Decisión motivada ficticia');
      assert.equal((await record(a)).current.context,'PRESERVED_PRIVATE');await validateDirected(a);assert.equal((await detail(a)).validations.length,2);
    });
    await t.test('017 actors modes episodes and malformed references fail closed without private metadata or draft endpoints',async()=>{
      const a=await ready(),p=await input(a);
      for(const id of [a.pac,'bp1','bq1','bil-admin','bil-superadmin','bil-support']){
        assert.equal((await http(id,'/admissions/'+a.id+'/directed/record')).status,404);
        assert.equal((await http(id,'/admissions/'+a.id+'/directed/assess',p)).status,404);
      }
      for(const op of ['record','draft'])assert.equal((await http(a.psy,'/admissions/'+a.id+'/'+op)).status,404);
      for(const op of ['save','submit','correct','validate'])await assert.rejects(command(actor(a.pac),op,op==='save'?{...act(),expectedVersion:3,expectedRevision:0,answers}:op==='submit'?{...act(),expectedVersion:3,expectedRevision:0}:op==='correct'?{...act(),expectedVersion:3,submission:1,episodeId:a.episodeId,message:'wrong'}:{...act(),expectedVersion:3,submission:1,episodeId:a.episodeId},a.id),/admission_missing/);
      await assert.rejects(client.query('INSERT INTO admission_directed_validations(id,assignment_id,document_revision,actor_id,session_version) VALUES($1,$2,1,$3,0)',[randomUUID(),a.id,a.pac]),e=>e.code==='23503');
      await assert.rejects(client.query(`INSERT INTO episode_private_record_versions(episode_id,patient_id,professional_user_id,revision,previous_revision,risk_level,professional_context,recording_kind,assignment_id,directed_revision,authenticated_author_user_id,authenticated_session_version)
        VALUES($1,$2,$3,2,1,'low','','authenticated_directed_admission',$4,999,$3,0)`,[a.episodeId,a.pac,a.psy,a.id]),e=>e.code==='23503');
      await assert.rejects(client.query(`INSERT INTO episode_private_record_versions(episode_id,patient_id,professional_user_id,revision,previous_revision,risk_level,professional_context,recording_kind,assignment_id,submission,directed_revision,authenticated_author_user_id,authenticated_session_version)
        VALUES($1,$2,$3,2,1,'low','','authenticated_admission',$4,1,1,$3,0)`,[a.episodeId,a.pac,a.psy,a.id]),e=>e.code==='23514');
      const other=await propose(a.psy,a.pac,a.agreementId);await accept(other);
      assert.equal((await http(a.psy,'/admissions/'+other.id+'/directed/assess',p)).status,404);
      assert.equal((await http(a.psy,'/admissions/'+a.id+'/directed/assess',{...p,episodeId:other.episodeId})).status,409);
      for(const table of ['admission_directed_attestations','admission_directed_versions','admission_directed_requests','admission_directed_resolutions','admission_directed_validations']){
        for(const op of ['DELETE FROM ','TRUNCATE '])await assert.rejects(client.query(op+table),e=>e.message==='admission_immutable'||e.code==='0A000');
      }
      await assert.rejects(client.query('UPDATE admission_directed_versions SET declarations=declarations'),/admission_immutable/);
      const auto=await command(actor(a.psy),'prepare',{...act(),agreementId:a.agreementId});
      const assigned=await command(actor(a.psy),'assign',{...act(),agreementId:a.agreementId,episodeId:auto.episodeId,templateId:'fictional-adult-v1'});
      await assert.rejects(command(actor(a.psy),'directed-attest',{...act(),expectedVersion:1},assigned.id),/admission_missing/);
    });
    await t.test('017 idempotency requires exact payload current authority and revision; semantic conflicts are HTTP 409',async()=>{
      const a=await freshOwnAdmission();await accept(a);await write(a,'directed-attest');const d=await detail(a);
      const p={...act(),expectedVersion:d.version,expectedDocumentRevision:0,declarations:answers};
      const first=await command(actor(a.psy),'directed-document',p,a.id);assert.deepEqual(await command(actor(a.psy),'directed-document',p,a.id),first);
      await assert.rejects(command(actor(a.psy),'directed-document',{...p,declarations:{...answers,reason:'different'}},a.id),/admission_conflict/);
      const risk=await input(a);await command(actor(a.psy),'directed-assess',risk,a.id);assert.deepEqual(await command(actor(a.psy),'directed-assess',risk,a.id),{saved:true,revision:2,version:first.version});
      await request(a);assert.equal((await http(a.psy,'/admissions/'+a.id+'/directed/assess',risk)).status,409);
    });
    await t.test('017 two simultaneous incorporations have one winner and a sanitized 409 without silent overwrite',async()=>{
      const a=await freshOwnAdmission();await accept(a);await write(a,'directed-attest');const d=await detail(a);
      const payload={...act(),expectedVersion:d.version,expectedDocumentRevision:0,declarations:answers};
      const outcomes=await Promise.all([http(a.psy,'/admissions/'+a.id+'/directed/document',payload),http(a.psy,'/admissions/'+a.id+'/directed/document',{...payload,operationId:randomUUID(),declarations:{...answers,reason:'OTHER'}})]);
      assert.deepEqual(outcomes.map(x=>x.status).sort(),[200,409]);assert.equal((await detail(a)).documents.length,1);
    });
    for(const first of ['request','validation'])await t.test(`017 correction versus validation ${first} first serializes and pending request blocks eligibility`,async()=>{
      const a=await ready(),c=await connect(),other=await connect();try{
        const d=await detail(a),req={...act(),expectedVersion:d.version,documentRevision:1,reason:'CORRECTION'},val={...act(),expectedVersion:d.version,documentRevision:1,episodeId:a.episodeId};
        await c.query('BEGIN');await other.query('BEGIN');
        await raw(c,a,first==='request'?'directed-request':'directed-validate',first==='request'?req:val,first==='request'?a.pac:a.psy);
        const pending=raw(other,a,first==='request'?'directed-validate':'directed-request',first==='request'?val:req,first==='request'?a.psy:a.pac).then(()=>null,e=>e);
        await waitBlocked(other);await c.query('COMMIT');assert.equal((await pending).message,'admission_conflict');await other.query('ROLLBACK');
        if(first==='validation')await request(a);assert.equal((await detail(a)).reviewState,'correction_requested');
      }finally{await c.query('ROLLBACK');await other.query('ROLLBACK');await c.end();await other.end();}
    });
    for(const first of ['version','assessment'])await t.test(`017 new version versus private assessment ${first} first preserves exact version`,async()=>{
      const a=await ready();await assess(a,'OLD');const req=await request(a),d=await detail(a),r=await record(a),c=await connect(),other=await connect();try{
        const change={...act(),expectedVersion:d.version,expectedDocumentRevision:1,requestId:req.requestId,decision:'accept',explanation:'corrected',declarations:answers};
        const risk={...act(),expectedVersion:d.version,expectedRevision:r.expectedRevision,documentRevision:1,episodeId:a.episodeId,riskLevel:'low',context:'STALE'};
        await c.query('BEGIN');await other.query('BEGIN');
        if(first==='version'){
          await raw(c,a,'directed-resolve',change);const pending=raw(other,a,'directed-assess',risk).then(()=>null,e=>e);await waitBlocked(other);await c.query('COMMIT');assert.equal((await pending).message,'admission_conflict');await other.query('ROLLBACK');
        }else{
          await c.query('SELECT admission_context($1,0,$2,$3::jsonb)',[a.psy,'directed-assess',JSON.stringify({id:a.id,sessionExpiresAt:actor(a.psy).sessionExpiresAt})]);
          const pending=raw(other,a,'directed-resolve',change);await waitBlocked(other);await assert.rejects(raw(c,a,'directed-assess',risk),/admission_conflict/);await c.query('ROLLBACK');await pending;await other.query('COMMIT');
        }
        const final=await record(a);assert.equal(final.documentRevision,2);assert.equal(final.current,null);assert.equal(final.history.length,1);
      }finally{await c.query('ROLLBACK');await other.query('ROLLBACK');await c.end();await other.end();}
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
      await t.test(`017 directed race ${cause} ${op} ${first} first: authorization is rechecked after real waits`,async()=>{
        const a=await ready(),p=await input(a,'RACE_PRIVATE');if(op==='replay')await command(actor(a.psy),'directed-assess',p,a.id);
        const c=await connect(),source=new pg.Client({...connection,database:name});await source.connect();
        try{
          await c.query('BEGIN');await source.query('BEGIN');
          if(first==='revoker'){
            await revoke(source,a);const pending=raw(c,a,op==='record'?'directed-record':'directed-assess',op==='record'?{}:p).then(()=>null,e=>e);
            await waitBlocked(c);await source.query('COMMIT');const failure=await pending;assert.ok(['admission_missing','admission_session'].includes(failure?.message),failure?.message);await c.query('ROLLBACK');
          }else{
            await raw(c,a,op==='record'?'directed-record':'directed-assess',op==='record'?{}:p);
            const pending=revoke(source,a);await waitBlocked(source);await c.query('COMMIT');await pending;await source.query('COMMIT');
          }
          const read=await http(a.psy,'/admissions/'+a.id+'/directed/record');assert.ok([401,403,404].includes(read.status));
          const write=await http(a.psy,'/admissions/'+a.id+'/directed/assess',p);assert.ok([401,403,404].includes(write.status));
          assert.doesNotMatch(JSON.stringify([read.body,write.body]),/RACE_PRIVATE|authorId|recordedAt|expectedRevision/);
          const own=await http(a.pac,'/admissions/'+a.id);if(!['inactive'].includes(cause)){assert.equal(own.status,200);assert.doesNotMatch(JSON.stringify(own.body),/RACE_PRIVATE|riskLevel/);}
        }finally{await c.query('ROLLBACK');await source.query('ROLLBACK');await c.end();await source.end();}
      });
    }

    await t.test('017 retained own documents survive withdrawal and professional access and replay remain revoked',async()=>{
      const a=await ready(),p=await input(a);await command(actor(a.psy),'directed-assess',p,a.id);const req=await request(a);await resolve(a,req.requestId,'reject');
      await write(a,'revoke',{},a.pac);const d=await detail(a);assert.equal(d.documents.length,1);assert.equal(d.requests[0].resolution.decision,'reject');assert.equal(d.readOnly,true);
      await assert.rejects(record(a),/admission_missing/);await assert.rejects(command(actor(a.psy),'directed-assess',p,a.id),/admission_missing/);
      for(const [op,extra] of [['directed-attest',{}],['directed-document',{expectedDocumentRevision:1,declarations:answers}],['directed-validate',{documentRevision:1,episodeId:a.episodeId}],['directed-resolve',{expectedDocumentRevision:1,requestId:req.requestId,decision:'reject',explanation:'No debe operar tras revocación'}]])
        await assert.rejects(command(actor(a.psy),op,{...act(),expectedVersion:d.version,...extra},a.id),/admission_missing/);

      assert.doesNotMatch(JSON.stringify(d),/PRIVATE_ASSESSMENT|riskLevel|authenticated_author|writer_login/);
      assert.equal((await http(a.pac,'/admissions/'+a.id+'/directed/request',{...act(),expectedVersion:d.version,documentRevision:1,reason:'late'})).status,404);
    });
    await t.test('017 successor preserves autoadministered v2 drafts submissions correction and private assessment contracts',async()=>{
      const d=await freshOwnAdmission(),prepared=await command(actor(d.psy),'prepare',{...act(),agreementId:d.agreementId});
      const assigned=await command(actor(d.psy),'assign',{...act(),agreementId:d.agreementId,episodeId:prepared.episodeId,templateId:'fictional-adult-v1'});
      const q={...d,id:assigned.id,episodeId:prepared.episodeId};await accept(q);await save(q);
      assert.deepEqual((await command(actor(q.psy),'detail',{},q.id)).submissions,[]);await submit(q);
      const r=await command(actor(q.psy),'record',{},q.id);assert.equal(r.current,null);assert.equal(r.submission,1);
      const p={...act(),expectedVersion:r.version,expectedRevision:r.expectedRevision,episodeId:q.episodeId,submission:1,riskLevel:'low',context:'AUTO_PRIVATE_ON_017'};
      await command(actor(q.psy),'assess',p,q.id);assert.equal((await command(actor(q.psy),'record',{},q.id)).current.context,'AUTO_PRIVATE_ON_017');
      assert.doesNotMatch(JSON.stringify(await detail(q)),/AUTO_PRIVATE_ON_017|riskLevel/);await review(q,'correct',{message:'Autoadministrada conservada'});
      assert.equal((await command(actor(q.psy),'record',{},q.id)).current,null);await assert.rejects(command(actor(q.psy),'assess',p,q.id),/admission_conflict/);
      await assert.rejects(command(actor(q.psy),'directed-record',{},q.id),/admission_missing/);
    });
    await t.test('017 retained PAC read rechecks session expiration after an assignment lock wait',async()=>{
      const a=await ready(),c=await connect();try{
        await client.query('BEGIN');await client.query('SELECT id FROM admission_assignments WHERE id=$1 FOR UPDATE',[a.id]);
        const source={id:a.id,sessionExpiresAt:Date.now()/1000+0.3};
        const pending=c.query('SELECT admission_command($1,0,$2,$3::jsonb)',[a.pac,'detail',JSON.stringify(source)]).then(()=>null,e=>e);
        await waitBlocked(c);await new Promise(r=>setTimeout(r,350));await client.query('COMMIT');assert.equal((await pending).message,'admission_session');
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
