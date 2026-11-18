import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { installBaseline } from '../scripts/episode-sandbox.js';
import { installAdmissionSandbox } from '../scripts/admission-sandbox.js';
import { bilateralFixture } from '../scripts/bilateral-sandbox.js';
import { installEpisodeRecordSandbox,provisionRecordFixtureWriter,appendRecordFixture } from '../scripts/episode-record-sandbox.js';
import { migrate,catalogChecksum } from '../scripts/episode-migration.js';
import { resolveEpisodeContext } from '../src/modules/episodes/episode.context.js';
import { authorizeEpisodeOperation } from '../src/modules/episodes/episode.policy.js';
import { command as bilateral,processQueue,closeBilateral } from '../src/modules/bilateral/bilateral.service.js';
import { conditionsVersion,conditionsText,sha256,declarationVersion } from '../src/modules/bilateral/bilateral.policy.js';

test('015: private individual record persistence integrity privileges and concurrent fixture versions',{
  skip:process.env.RUN_EPISODE_INTEGRATION!=='true',
},async t=>{
  assert.equal(process.env.LOCAL_DEVELOPMENT,'true');assert.equal(process.env.PGHOST,'db');assert.equal(process.env.PGDATABASE,'psicopanel_integrity_test');
  const connection={host:'db',user:'integrity_test',password:'disposable_test_password'};
  const control=new pg.Client({...connection,database:'psicopanel_integrity_test'});await control.connect();
  const clients=[];
  const fresh=async()=>{
    const name='psicopanel_episode_record_'+randomUUID().replaceAll('-','');
    assert.equal((await control.query('SELECT 1 FROM pg_database WHERE datname=$1',[name])).rowCount,0);
    await control.query('CREATE DATABASE "'+name+'"');const client=new pg.Client({...connection,database:name});await client.connect();clients.push(client);
    assert.equal((await client.query("SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace")).rowCount,0);
    await installBaseline(client);return {client,name};
  };
  try{
    const {client,name}=await fresh(),options=await installEpisodeRecordSandbox(client,name);
    await t.test('015 clean installation verified replay historical ledger and unsafe default grants rollback',async()=>{
      const ledger=(await client.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows;
      assert.equal(ledger.length,15);assert.equal((await migrate(client,options)).status,'already-applied');
      assert.deepEqual((await client.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows,ledger);
      const freshDb=await fresh(),prior=await installAdmissionSandbox(freshDb.client,freshDb.name);
      const before=(await freshDb.client.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows,hash=await catalogChecksum(freshDb.client);
      const broken={query:(sql,args)=>freshDb.client.query(String(sql).includes('CREATE TABLE episode_private_records')?sql+' SELECT 1/0;':sql,args)};
      await assert.rejects(migrate(broken,{...prior,target:'015'}),/division by zero/);
      assert.equal(await catalogChecksum(freshDb.client),hash);
      assert.deepEqual((await freshDb.client.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows,before);
      assert.equal((await freshDb.client.query("SELECT count(*)::int n FROM pg_roles WHERE rolname='episode_record_owner_'||substr(md5(current_database()),1,16)")).rows[0].n,0);
      const grantee='record_default_'+randomUUID().replaceAll('-','');await freshDb.client.query('CREATE ROLE '+grantee+' NOLOGIN');
      await freshDb.client.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO '+grantee);
      await assert.rejects(migrate(freshDb.client,{...prior,target:'015'}),/Expanded episode record access/);
      await freshDb.client.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT ON TABLES FROM '+grantee);
      await migrate(freshDb.client,{...prior,target:'015'});
      assert.deepEqual((await freshDb.client.query("SELECT * FROM psicopanel_schema_migrations WHERE version<'015' ORDER BY version")).rows,before);
      await freshDb.client.query('GRANT SELECT(risk_level) ON episode_private_record_versions TO PUBLIC');
      const drift=await catalogChecksum(freshDb.client);await assert.rejects(migrate(freshDb.client,{...prior,target:'015'}),/drift/);
      assert.equal(await catalogChecksum(freshDb.client),drift);
    });
    await bilateralFixture(client);
    process.env.BILATERAL_ENABLED='true';process.env.BILATERAL_SECRET='independent-record-bilateral-fixture-key-32bytes';
    process.env.BILATERAL_DATABASE_URL=`postgres://${options.bilateralClientRole}:disposable_bilateral_roles@db:5432/${name}`;
    const actor=id=>({id,sessionVersion:0,sessionExpiresAt:Math.floor(Date.now()/1000)+3600});
    // Structural fixture evidence, deliberately not an authenticated clinical act.
    const agreements=new Map();
    const prepare=async(professional='bp1',patient='bq1',modality='individual')=>{
      const key=professional+patient;
      if(!agreements.has(key)){
        const professionalReference=(await bilateral(actor(professional),'professional-reference',{operationId:randomUUID()})).reference;
        const recipientReference=(await bilateral(actor(patient),'recipient-reference',{operationId:randomUUID(),confirmed:true,professionalReference})).reference;
        const receipt=await bilateral(actor(professional),'issue',{operationId:randomUUID(),recipientReference,email:patient+'@bilateral.invalid',conditionsVersion,
          conditionsHash:sha256(conditionsText('Profesional ficticio '+professional)),declarationVersion,declared:true,proposed:true});
        await processQueue();const invitation=(await bilateral(actor(patient),'received')).find(i=>i.id===receipt.receiptId);
        const agreement=await bilateral(actor(patient),'accept',{operationId:randomUUID(),confirmed:true,expectedVersion:invitation.version,conditionsVersion,conditionsHash:invitation.conditionsHash},invitation.id);
        agreements.set(key,agreement.agreementId);
      }
      const e=(await client.query(`INSERT INTO clinical_episodes(psychologist_user_id,modality,participant_one_id,participant_two_id,created_by_user_id)
        VALUES($1,$2,$3,$4,$1) RETURNING id::text`,[professional,modality,patient,modality==='couple'?'bq2':null])).rows[0].id;
      await client.query('INSERT INTO admission_preparations(episode_id,agreement_id,created_by) VALUES($1,$2,$3)',[e,agreements.get(key),professional]);return e;
    };
    let first,second,third;
    await t.test('015 only admission individual preparations materialize records without copying globals or admissions',async()=>{
      const plain=(await client.query("INSERT INTO clinical_episodes(psychologist_user_id,modality,participant_one_id,created_by_user_id) VALUES('bp1','individual','bq1','bp1') RETURNING id")).rows[0].id;
      assert.equal((await client.query('SELECT 1 FROM episode_private_records WHERE episode_id=$1',[plain])).rowCount,0);
      await client.query("UPDATE patients SET notes='GLOBAL_MUST_NOT_COPY',risk_level='high',reason_for_consultation='GLOBAL_REASON' WHERE id='bq1'");
      first=await prepare();second=await prepare('bp2');third=await prepare();
      const rows=(await client.query('SELECT * FROM episode_private_record_versions ORDER BY episode_id')).rows;assert.equal(rows.length,3);
      assert.ok(rows.every(r=>r.revision===1&&r.risk_level==='unevaluated'&&r.professional_context===''&&r.technical_author_user_id===null));
      await assert.rejects(prepare('bp1','bq1','couple'),/episode_record_invalid/);
      await assert.rejects(client.query("UPDATE clinical_episodes SET status='active' WHERE id=$1",[first]));
      assert.equal((await migrate(client,options)).status,'already-applied','data alone never changes the installed catalog');
    });
    const role=await provisionRecordFixtureWriter(client,name);
    const connect=async()=>{const c=new pg.Client({...connection,database:name,user:role,password:'disposable_record_fixture'});await c.connect();clients.push(c);return c;};
    const writer=await connect(),other=await connect();
    const write=(c,e,rev=1,context='PRIVATE_A',psy='bp1')=>appendRecordFixture(c,{episodeId:e,patientId:'bq1',professionalId:psy,expectedRevision:rev,riskLevel:'high',context});
    await t.test('015 A B A values and structural resolver remain separate even with a repeated professional',async()=>{
      await write(writer,first);await write(writer,second,1,'PRIVATE_B','bp2');await write(writer,third,1,'PRIVATE_A_RETURN');
      const rows=(await client.query('SELECT episode_id::text,professional_context FROM episode_private_record_versions WHERE revision=2 ORDER BY episode_id')).rows;
      assert.deepEqual(rows.map(r=>r.professional_context),['PRIVATE_A','PRIVATE_B','PRIVATE_A_RETURN']);
      const row=(await client.query('SELECT * FROM episode_private_record_versions WHERE episode_id=$1 AND revision=2',[first])).rows[0];
      assert.equal(row.recording_kind,'sandbox_fixture');assert.equal(row.writer_login,role);assert.equal(row.technical_author_user_id,'bp1');
      const ctx=await resolveEpisodeContext(client,{actor:{id:'bp1',role:'psychologist',isActive:true,psychologistStatus:'active'},episodeId:first,operation:'read',resource:{type:'clinical_record',id:first}});
      assert.equal(ctx.resource.authorUserId,null);assert.equal(ctx.resource.audienceVerified,false);assert.equal(authorizeEpisodeOperation(ctx).allowed,false);
      assert.doesNotMatch(JSON.stringify(ctx),/PRIVATE_|risk_level|professional_context/);
      const crossed=await resolveEpisodeContext(client,{actor:{id:'bp1',role:'psychologist',isActive:true},episodeId:third,resource:{type:'clinical_record',id:first}});assert.equal(crossed.resource,null);
      // Reuse 009's metadata-only LOGIN only in this isolated fixture. Never
      // grant it text or connect it to the application pool.
      await client.query('GRANT SELECT(episode_id,patient_id,professional_user_id) ON episode_private_records TO '+options.accountReaderRole);
      const reader=new pg.Client({...connection,database:name,user:options.accountReaderRole,password:'disposable_bilateral_roles'});await reader.connect();
      try{
        const context=await resolveEpisodeContext(reader,{actor:{id:'bp1',role:'psychologist',isActive:true},episodeId:first,resource:{type:'clinical_record',id:first}});
        assert.equal(context.resource.episodeId,first);assert.equal(context.resource.authorUserId,null);
        await assert.rejects(reader.query('SELECT professional_context FROM episode_private_record_versions'),e=>e.code==='42501');
      }finally{await reader.end();}
    });
    await t.test('015 real restricted writers reject wrong identity author stale revision and metadata spoofing',async()=>{
      for(const [sql,args]of [
        ['SELECT * FROM episode_private_record_versions',[]],['SELECT * FROM episode_private_records',[]],['SELECT * FROM users',[]],
        ['UPDATE episode_private_record_versions SET professional_context=professional_context',[]],
        ['DELETE FROM episode_private_record_versions',[]],['TRUNCATE episode_private_records',[]],
        ['SELECT episode_record_from_preparation()',[]],['SET session_replication_role=replica',[]],
        ["INSERT INTO episode_private_record_versions(episode_id,writer_login) VALUES($1,'forged')",[first]],
      ])await assert.rejects(writer.query(sql,args));
      await assert.rejects(write(writer,first,1),/episode_record_conflict/);
      await assert.rejects(write(writer,first,2,'crossed','bp2'),/foreign key/);
      await assert.rejects(writer.query(`INSERT INTO episode_private_record_versions(episode_id,patient_id,professional_user_id,revision,previous_revision,
        risk_level,professional_context,recording_kind,technical_author_user_id) VALUES($1,'bq1','bp1',3,2,'low','wrong author','sandbox_fixture','bp2')`,[first]),/check constraint/);
      await assert.rejects(appendRecordFixture(writer,{episodeId:first,patientId:'bq2',professionalId:'bp1',expectedRevision:2,riskLevel:'high',context:'crossed'}),/foreign key/);
      for(const sql of ['UPDATE episode_private_records SET episode_id=episode_id','DELETE FROM episode_private_records','TRUNCATE episode_private_records CASCADE',
        'UPDATE episode_private_record_versions SET revision=revision','DELETE FROM episode_private_record_versions','TRUNCATE episode_private_record_versions'])await assert.rejects(client.query(sql),/episode_record_immutable/);
      for(const runtime of [options.admissionClientRole,options.bilateralClientRole,options.accountReaderRole,options.privateNoteCreatorRole]){
        const c=new pg.Client({...connection,database:name,user:runtime,password:runtime===options.admissionClientRole?'disposable_admission_roles':'disposable_bilateral_roles'});await c.connect();
        try{await assert.rejects(c.query('SELECT risk_level,professional_context FROM episode_private_record_versions'),e=>e.code==='42501');
          await assert.rejects(c.query("INSERT INTO episode_private_record_versions(episode_id) VALUES($1)",[first]),e=>e.code==='42501');
        }finally{await c.end();}
      }
      const legacyRole='record_legacy_'+randomUUID().replaceAll('-','');
      await client.query('CREATE ROLE '+legacyRole+" LOGIN NOINHERIT PASSWORD 'disposable_legacy_fixture'");
      await client.query('GRANT USAGE ON SCHEMA public TO '+legacyRole);
      await client.query('GRANT SELECT ON patients,patient_intakes,patient_tasks,patient_clinical_notes,appointments,care_relationships,psychologist_patient_access TO '+legacyRole);
      const legacy=new pg.Client({...connection,database:name,user:legacyRole,password:'disposable_legacy_fixture'});await legacy.connect();
      try{
        assert.ok((await legacy.query('SELECT id FROM patients')).rowCount>0);
        await assert.rejects(legacy.query('SELECT * FROM episode_private_record_versions'),e=>e.code==='42501');
        await assert.rejects(legacy.query('INSERT INTO episode_private_records(episode_id) VALUES($1)',[first]),e=>e.code==='42501');
      }finally{await legacy.end();}
    });
    await t.test('015 concurrent same-version writers wait on PostgreSQL and only one revision commits with rollback safety',async()=>{
      await writer.query('BEGIN');await write(writer,first,2,'WINNER');
      const pending=write(other,first,2,'LOSER').then(()=>null,e=>e);
      let blocked=false;for(let n=0;n<200;n++){
        blocked=(await client.query('SELECT cardinality(pg_blocking_pids($1))>0 blocked',[other.processID])).rows[0].blocked;
        if(blocked)break;await new Promise(r=>setTimeout(r,10));
      }assert.equal(blocked,true);
      await writer.query('COMMIT');assert.equal((await pending).code,'40001');
      await writer.query('BEGIN');await write(writer,first,3,'ROLLED_BACK');await writer.query('ROLLBACK');
      await write(other,first,3,'AFTER_ROLLBACK');
      assert.deepEqual((await client.query('SELECT professional_context FROM episode_private_record_versions WHERE episode_id=$1 ORDER BY revision',[first])).rows.map(r=>r.professional_context),['','PRIVATE_A','WINNER','AFTER_ROLLBACK']);
      await Promise.all([write(writer,second,2,'B_INDEPENDENT','bp2'),write(other,third,2,'A_INDEPENDENT')]);
    });
    await t.test('015 populated 014 refuses installation without changing rows schema ledger or roles',async()=>{
      const db=await fresh(),prior=await installAdmissionSandbox(db.client,db.name);await bilateralFixture(db.client);
      const hash=await catalogChecksum(db.client),ledger=(await db.client.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows;
      await assert.rejects(migrate(db.client,{...prior,target:'015'}),/empty isolated destination/);
      assert.equal(await catalogChecksum(db.client),hash);assert.deepEqual((await db.client.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows,ledger);
    });
  }finally{await closeBilateral();for(const c of clients){await c.query('ROLLBACK');await c.end();}await control.end();
    for(const key of ['BILATERAL_ENABLED','BILATERAL_SECRET','BILATERAL_DATABASE_URL'])delete process.env[key];}
});
