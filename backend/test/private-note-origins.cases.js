// Executes only inside the existing fresh UUID cluster, with real PG logins.
import assert from 'node:assert/strict';
import pg from 'pg';
import fs from 'node:fs/promises';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import jwt from 'jsonwebtoken';
import env from '../src/config/env.js';
import {loadMigrations,migrate,catalogChecksum} from '../scripts/episode-migration.js';
import {verifyPrivateNoteContract} from '../scripts/private-note-contract.js';
import {verifyAccountLockContract} from '../scripts/account-lock-contract.js';
import {catalogChecksum as historicalChecksum} from './fixtures/catalog-checksum-003-009.js';
import {createSandboxDatabase,installBaseline} from '../scripts/episode-sandbox.js';
import {participantIdentities,preparedEpisode,participantGraph} from '../scripts/episode-participants-fixture.js';
import {resolveEpisodeContext} from '../src/modules/episodes/episode.context.js';
import {authorizeEpisodeOperation,episodeOperations} from '../src/modules/episodes/episode.policy.js';
import {projectEpisodeResource} from '../src/modules/episodes/episode.projections.js';
import {evaluatePrivateNoteRead} from '../src/modules/episodes/episode.note-read.js';

const signature='public.create_private_clinical_note_v1(bigint,text,text,bigint,text)';
const connect=async(name,user='integrity_test',password='disposable_test_password')=>{
  const client=new pg.Client({host:'db',database:name,user,password});await client.connect();
  await client.query("SET statement_timeout='10s'");return client;
};
const counts=async client=>(await client.query(`SELECT
  (SELECT count(*)::int FROM patient_clinical_notes) AS notes,
  (SELECT count(*)::int FROM clinical_note_private_origins) AS origins,
  (SELECT count(*)::int FROM clinical_record_history) AS history`)).rows[0];
const ledger=async client=>(await client.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows;
const origins=async client=>(await client.query('SELECT * FROM clinical_note_private_origins ORDER BY note_id')).rows;
const appointment=async(client,episode,{patient='p',author='a',status='completed',days=3}={})=>
  (await client.query(`INSERT INTO appointments(episode_id,patient_id,created_by_user_id,scheduled_date,scheduled_time,status)
    VALUES($1,$2,$3,CURRENT_DATE-$4::int,'09:00',$5) RETURNING id`,[episode,patient,author,days,status])).rows[0].id;
const create=async(client,episode,appointmentId,{patient='p',author='a',content='Fictional private original'}={})=>
  (await client.query('SELECT public.create_private_clinical_note_v1($1,$2,$3,$4,$5) AS id',
    [episode,patient,author,appointmentId,content])).rows[0].id;
const verify=async(client,creator)=>verifyPrivateNoteContract(client,(await loadMigrations())[9],creator);

export async function runPrivateNoteCases(t,control) {
  const fresh=async(subtest,{target='010',identities=true,beforeMigration=null}={})=>{
    const name='psicopanel_episode_'+randomUUID().replaceAll('-','');
    const client=await createSandboxDatabase(control,name);subtest.after(()=>client.end());
    await installBaseline(client);
    const readerRole='origin_reader_'+randomUUID().replaceAll('-','');
    const creatorRole='origin_creator_'+randomUUID().replaceAll('-','');
    await client.query('CREATE ROLE '+readerRole+" LOGIN NOINHERIT PASSWORD 'disposable_origin_reader'");
    await client.query('CREATE ROLE '+creatorRole+" LOGIN NOINHERIT PASSWORD 'disposable_origin_creator'");
    if(beforeMigration)await beforeMigration(client);
    const options={expectedDatabase:name,target,accountReaderRole:readerRole,
      ...(target==='010'?{privateNoteCreatorRole:creatorRole}:{})};
    await migrate(client,options);
    if(identities)await participantIdentities(client);
    const {rows:[db]}=await client.query('SELECT oid FROM pg_database WHERE datname=current_database()');
    return {client,name,readerRole,creatorRole,options,
      creatorOwner:'psicopanel_note_creator_owner_'+db.oid,verifierOwner:'psicopanel_note_verifier_owner_'+db.oid};
  };
  const login=async(subtest,state,kind='creator')=>{
    const client=await connect(state.name,state[kind+'Role'],'disposable_origin_'+kind);
    subtest.after(()=>client.end());return client;
  };
  const graph=async(subtest)=>{
    const state=await fresh(subtest),episode=await preparedEpisode(state.client);
    const appt=await appointment(state.client,episode),creator=await login(subtest,state);
    return {...state,episode,appt,creator};
  };

  await t.test('010: frozen 009 fingerprints and security rules remain valid before upgrade',async subtest=>{
    const {client,name,readerRole}=await fresh(subtest,{target:'009',identities:false});
    assert.equal(await catalogChecksum(client),await historicalChecksum(client));
    const before=await ledger(client);
    assert.equal((await migrate(client,{expectedDatabase:name,target:'009',accountReaderRole:readerRole})).status,'already-applied');
    await verifyAccountLockContract(client,(await loadMigrations())[8],readerRole);
    assert.deepEqual(await ledger(client),before);
  });
  await t.test('010: fresh full-chain installation replay downgrade and metadata-only ledger',async subtest=>{
    const {client,options,creatorRole}=await fresh(subtest,{identities:false});
    assert.equal(await verify(client,creatorRole),creatorRole);
    const before=await ledger(client);assert.equal(before.length,10);
    assert.equal(before.at(-1).catalog_sha256,await catalogChecksum(client));
    assert.equal((await migrate(client,options)).status,'already-applied');
    await assert.rejects(migrate(client,{expectedDatabase:options.expectedDatabase,target:'009'}),/downgrade/);
    assert.deepEqual(await ledger(client),before);
    assert.deepEqual(await counts(client),{notes:0,origins:0,history:0});
    assert.deepEqual(Object.keys(before[0]).sort(),['applied_at','catalog_sha256','file_name','file_sha256','server_major','version']);
    assert.equal((await client.query(`SELECT FROM information_schema.columns WHERE table_schema='public'
      AND table_name='clinical_note_private_origins' AND column_default IS NOT NULL`)).rowCount,0);
  });
  await t.test('010: 009 upgrade preserves unknown legacy and previously attributed rows without backfill',async subtest=>{
    const state=await fresh(subtest,{target:'009'}),{client}=state;
    const episode=await preparedEpisode(client),old=await participantGraph(client,episode);
    const legacyAppt=await appointment(client,null,{author:null});
    const legacy=(await client.query(`INSERT INTO patient_clinical_notes(patient_id,appointment_id,clinical_note_date,content)
      VALUES('p',$1,CURRENT_DATE-3,'Fictional legacy') RETURNING id`,[legacyAppt])).rows[0].id;
    const before=(await client.query('SELECT * FROM patient_clinical_notes ORDER BY id')).rows,oldLedger=await ledger(client);
    await migrate(client,{...state.options,target:'010',privateNoteCreatorRole:state.creatorRole});
    assert.deepEqual((await client.query('SELECT * FROM patient_clinical_notes ORDER BY id')).rows,before);
    assert.deepEqual((await ledger(client)).slice(0,9),oldLedger);assert.deepEqual(await origins(client),[]);
    await client.query("UPDATE patient_clinical_notes SET content='Fictional edited legacy' WHERE id=ANY($1::bigint[])",[ [legacy,old.note] ]);
    assert.equal((await counts(client)).history,2);
    await assert.rejects(client.query('UPDATE patient_clinical_notes SET episode_id=$1 WHERE id=$2',[episode,legacy]),/Retrospective/);
    await assert.rejects(client.query(`INSERT INTO clinical_note_private_origins VALUES($1,$2,'p','a',1,'professional_original','a',clock_timestamp())`,[old.note,episode]),/Registration only/);
  });
  await t.test('010: restricted real LOGIN atomically creates exact private provenance at COMMIT',async subtest=>{
    const {client,creator,episode,appt,creatorRole}=await graph(subtest);
    await creator.query('BEGIN');const note=await create(creator,episode,appt);
    assert.equal((await creator.query('SELECT current_user')).rows[0].current_user,creatorRole);
    await assert.rejects(creator.query('SELECT * FROM clinical_note_private_origins'),{code:'42501'});
    await creator.query('ROLLBACK');assert.deepEqual(await counts(client),{notes:0,origins:0,history:0});
    await creator.query('BEGIN');const committed=await create(creator,episode,appt);await creator.query('COMMIT');
    const [origin]=await origins(client);
    assert.equal(origin.note_id,committed);assert.notEqual(committed,note);
    assert.equal(origin.episode_id,episode);assert.equal(origin.subject_patient_id,'p');
    assert.equal(origin.author_user_id,'a');assert.equal(origin.registered_by_user_id,'a');
    assert.equal(origin.contract_version,1);assert.equal(origin.registration_kind,'professional_original');
    assert.ok(origin.registered_at instanceof Date);
    assert.deepEqual(await counts(client),{notes:1,origins:1,history:0});
  });
  await t.test('010: wrong episode patient author appointment status and future date leave no rows',async subtest=>{
    const {client,creator,episode,appt}=await graph(subtest);
    const other=await preparedEpisode(client,{professional:'b'}),otherAppt=await appointment(client,other,{author:'b'});
    const pending=await appointment(client,episode,{status:'pending'}),future=await appointment(client,episode,{days:-3});
    for(const [ep,ap,patient,author] of [[null,appt,'p','a'],[episode,appt,'q','a'],[episode,appt,'p','b'],
      [other,appt,'p','b'],[episode,otherAppt,'p','a'],[episode,'9223372036854775807','p','a'],
      [episode,pending,'p','a'],[episode,future,'p','a']]) {
      await assert.rejects(create(creator,ep,ap,{patient,author}),/Invalid prepared/);
    }
    assert.deepEqual(await counts(client),{notes:0,origins:0,history:0});
  });
  await t.test('010: direct attributed writers and forged session variables cannot mint provenance',async subtest=>{
    const {client,creator,episode,appt}=await graph(subtest);
    await client.query("SET psicopanel.private_note_writer='trusted'; SET psicopanel.private_note_creator='integrity_test'");
    await assert.rejects(client.query(`INSERT INTO patient_clinical_notes(episode_id,patient_id,created_by_user_id,appointment_id,clinical_note_date)
      VALUES($1,'p','a',$2,CURRENT_DATE-3)`,[episode,appt]),/restricted creator/);
    await creator.query("SET psicopanel.private_note_writer='trusted'");
    await assert.rejects(creator.query(`INSERT INTO patient_clinical_notes(episode_id,patient_id,created_by_user_id,appointment_id,clinical_note_date)
      VALUES($1,'p','a',$2,CURRENT_DATE-3)`,[episode,appt]),{code:'42501'});
    assert.deepEqual(await counts(client),{notes:0,origins:0,history:0});
  });
  await t.test('010: no late duplicate foreign or legacy registration capability is exposed',async subtest=>{
    const state=await graph(subtest),{client,creator,episode,appt}=state;
    const note=await create(creator,episode,appt),reader=await login(subtest,state,'reader');
    for(const c of [creator,reader])await assert.rejects(c.query(`INSERT INTO clinical_note_private_origins
      VALUES($1,$2,'p','a',1,'professional_original','a',clock_timestamp())`,[note,episode]),{code:'42501'});
    await assert.rejects(client.query(`INSERT INTO clinical_note_private_origins
      VALUES($1,$2,'p','a',1,'professional_original','a',clock_timestamp())`,[note,episode]),/Registration only/);
    await assert.rejects(create(creator,episode,appt),{code:'23505'});
    assert.deepEqual(await counts(client),{notes:1,origins:1,history:0});
  });
  await t.test('010: composite FKs unique keys NOT NULL and version checks independently reject forged tuples',async subtest=>{
    const state=await fresh(subtest,{target:'009'}),{client}=state;
    const episode=await preparedEpisode(client),old=await participantGraph(client,episode);
    const other=await preparedEpisode(client,{professional:'b'});
    await migrate(client,{...state.options,target:'010',privateNoteCreatorRole:state.creatorRole});
    const creator=await login(subtest,state),appt=await appointment(client,episode);
    const note=await create(creator,episode,appt);
    // Provisioning admin ONLY: bypass the registration guard inside a rolled-back
    // fault-injection transaction to test independent native constraints.
    await client.query('BEGIN; ALTER TABLE clinical_note_private_origins DISABLE TRIGGER guard_private_note_origin');
    for(const [values,code] of [
      [[note,episode,'p','a',1,'professional_original','a'],'23505'],
      [['9223372036854775807',episode,'p','a',1,'professional_original','a'],'23503'],
      [[old.note,other,'p','a',1,'professional_original','a'],'23503'],
      [[old.note,episode,'q','a',1,'professional_original','a'],'23503'],
      [[old.note,episode,'p','b',1,'professional_original','b'],'23503'],
      [['9223372036854775806',other,'q','b',1,'professional_original','b'],'23503'],
      [[null,episode,'p','a',1,'professional_original','a'],'23502'],
      [['9223372036854775806',episode,'p','a',2,'professional_original','a'],'23514'],
      [['9223372036854775806',episode,'p','a',1,'shared','a'],'23514'],
      [['9223372036854775806',episode,'p','a',1,'professional_original','b'],'23514'],
    ]) {
      await client.query('SAVEPOINT bad_origin');
      await assert.rejects(client.query(`INSERT INTO clinical_note_private_origins VALUES($1,$2,$3,$4,$5,$6,$7,clock_timestamp())`,values),{code});
      await client.query('ROLLBACK TO SAVEPOINT bad_origin');
    }
    await client.query('ROLLBACK');assert.equal((await counts(client)).origins,1);
  });
  await t.test('010: provenance UPDATE DELETE TRUNCATE and all current accredited note edits are blocked',async subtest=>{
    const {client,creator,episode,appt}=await graph(subtest),note=await create(creator,episode,appt),before=await origins(client);
    for(const sql of ["UPDATE clinical_note_private_origins SET registered_at=clock_timestamp()",
      "UPDATE clinical_note_private_origins SET contract_version=2",'DELETE FROM clinical_note_private_origins',
      'TRUNCATE clinical_note_private_origins',"UPDATE patient_clinical_notes SET content='Fictional legacy edit'",
      'UPDATE patient_clinical_notes SET updated_at=NOW()',
      'UPDATE patient_clinical_notes SET episode_id=NULL','DELETE FROM patient_clinical_notes']) {
      await assert.rejects(client.query(sql),/PRIVATE_NOTE_ORIGIN/);
    }
    assert.deepEqual(await origins(client),before);assert.equal(before[0].note_id,note);
    assert.deepEqual(await counts(client),{notes:1,origins:1,history:0});
  });
  await t.test('010: note insertion and origin insertion failures roll back the entire statement',async subtest=>{
    const {client,creator,episode,appt}=await graph(subtest);
    await assert.rejects(create(creator,episode,appt,{content:null}),{code:'23502'});
    assert.deepEqual(await counts(client),{notes:0,origins:0,history:0});
    await client.query('ALTER TABLE clinical_note_private_origins ADD CONSTRAINT synthetic_origin_failure CHECK(false)');
    await assert.rejects(create(creator,episode,appt),{code:'23514'});
    assert.deepEqual(await counts(client),{notes:0,origins:0,history:0});
  });
  await t.test('010: missing materialization fails deferred COMMIT under the dedicated verifier identity',async subtest=>{
    const {client,creator,episode,appt}=await graph(subtest);
    await client.query('ALTER TABLE patient_clinical_notes DISABLE TRIGGER materialize_private_note_origin');
    await creator.query('BEGIN');await create(creator,episode,appt);
    await assert.rejects(creator.query('COMMIT'),/Missing or inconsistent atomic provenance/);
    await creator.query('ROLLBACK');assert.deepEqual(await counts(client),{notes:0,origins:0,history:0});
  });
  await t.test('010: SET CONSTRAINTS after creator return detects missing provenance and rolls back',async subtest=>{
    const {client,creator,episode,appt}=await graph(subtest);
    await client.query('ALTER TABLE patient_clinical_notes DISABLE TRIGGER materialize_private_note_origin');
    await creator.query('BEGIN');await create(creator,episode,appt);
    await assert.rejects(creator.query('SET CONSTRAINTS private_note_origin_required IMMEDIATE'),/Missing or inconsistent atomic provenance/);
    await creator.query('ROLLBACK');assert.deepEqual(await counts(client),{notes:0,origins:0,history:0});
  });
  await t.test('010: IMMEDIATE before insertion and after creator return both validate without reader write grants',async subtest=>{
    for(const before of [true,false]) {
      const {client,creator,episode,appt}=await graph(subtest);
      await creator.query('BEGIN');if(before)await creator.query('SET CONSTRAINTS ALL IMMEDIATE');
      await create(creator,episode,appt);await creator.query('SET CONSTRAINTS private_note_origin_required IMMEDIATE');
      await creator.query('COMMIT');assert.deepEqual(await counts(client),{notes:1,origins:1,history:0});
    }
  });
  await t.test('010: explicit rollback and verifier errors remove both note and provenance',async subtest=>{
    const {client,creator,episode,appt,verifierOwner}=await graph(subtest);
    await creator.query('BEGIN');await create(creator,episode,appt);await creator.query('ROLLBACK');
    assert.deepEqual(await counts(client),{notes:0,origins:0,history:0});
    // An administrator injects a failing body while preserving its exact owner;
    // observing that identity proves COMMIT does not reuse the returned creator.
    await client.query(`CREATE OR REPLACE FUNCTION public.verify_private_note_origin() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$ BEGIN
      IF current_user<>'${verifierOwner}' THEN RAISE EXCEPTION 'wrong verifier identity'; END IF;
      RAISE EXCEPTION 'synthetic verifier error with dedicated identity'; END $$`);
    await creator.query('BEGIN');await create(creator,episode,appt);
    await assert.rejects(creator.query('COMMIT'),/synthetic verifier error with dedicated identity/);
    await creator.query('ROLLBACK');assert.deepEqual(await counts(client),{notes:0,origins:0,history:0});
  });
  await t.test('010: creator reader PUBLIC and restricted owners have only their specified effective capabilities',async subtest=>{
    const state=await graph(subtest),{client,creator,creatorOwner,verifierOwner,episode,appt}=state;
    await verify(client,state.creatorRole);await verifyAccountLockContract(client,(await loadMigrations())[8],state.readerRole);
    const reader=await login(subtest,state,'reader');
    const nobodyRole='origin_nobody_'+randomUUID().replaceAll('-','');
    await client.query('CREATE ROLE '+nobodyRole+" LOGIN NOINHERIT PASSWORD 'disposable_nobody'");
    const nobody=await connect(state.name,nobodyRole,'disposable_nobody');subtest.after(()=>nobody.end());
    for(const c of [creator,reader,nobody]) {
      for(const sql of ['SELECT content FROM patient_clinical_notes','SELECT * FROM clinical_note_private_origins',
        "UPDATE users SET session_version=999 WHERE id='a'",'UPDATE patient_clinical_notes SET content=\'tampered\'',
        'DELETE FROM clinical_note_private_origins','TRUNCATE clinical_note_private_origins',
        'SET ROLE '+creatorOwner,'SET ROLE '+verifierOwner,'SET SESSION AUTHORIZATION '+creatorOwner,
        'GRANT '+creatorOwner+' TO '+state.creatorRole,
        'SELECT public.materialize_private_note_origin()','SELECT public.verify_private_note_origin()']) {
        await assert.rejects(c.query(sql),{code:'42501'});
      }
    }
    for(const c of [reader,nobody])await assert.rejects(create(c,episode,appt),{code:'42501'});
    assert.equal((await client.query('SELECT FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=$1)',[state.creatorRole])).rowCount,0);
    await create(creator,episode,appt);
  });
  await t.test('010: application connections cannot alter owners functions constraints or trigger execution',async subtest=>{
    const state=await graph(subtest),{creator}=state;
    for(const sql of ['ALTER TABLE patient_clinical_notes DISABLE TRIGGER private_note_origin_required',
      'ALTER TABLE patient_clinical_notes DISABLE TRIGGER materialize_private_note_origin',
      'ALTER TABLE clinical_note_private_origins DISABLE TRIGGER ALL',
      'ALTER TABLE clinical_note_private_origins DROP CONSTRAINT clinical_note_private_origins_pkey',
      'ALTER FUNCTION public.verify_private_note_origin() SECURITY INVOKER',
      'ALTER FUNCTION '+signature+' OWNER TO '+state.creatorRole,
      'DROP FUNCTION public.guard_private_note_insert() CASCADE',
      "SET session_replication_role='replica'",'CREATE FUNCTION public.forge() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$']) {
      await assert.rejects(creator.query(sql),{code:'42501'});
    }
    await verify(state.client,state.creatorRole);
  });
  await t.test('010: parallel individuals different professionals and couple A B originals remain separate and denied',async subtest=>{
    const state=await graph(subtest),{client,creator,episode,appt}=state;
    const e2=await preparedEpisode(client),e3=await preparedEpisode(client,{professional:'b'}),couple=await preparedEpisode(client,{two:'q'});
    const tuples=[[episode,appt,'p','a'],[e2,await appointment(client,e2),'p','a'],
      [e3,await appointment(client,e3,{author:'b'}),'p','b'],[couple,await appointment(client,couple),'p','a'],
      [couple,await appointment(client,couple,{patient:'q'}),'q','a']];
    const notes=[];
    for(const [ep,ap,patient,author] of tuples)notes.push(await create(creator,ep,ap,{patient,author}));
    const rows=await origins(client);assert.equal(rows.length,5);
    for(let i=0;i<tuples.length;i++) {
      const [ep,,patient,author]=tuples[i];assert.equal(rows[i].episode_id,ep);
      assert.equal(rows[i].subject_patient_id,patient);assert.equal(rows[i].author_user_id,author);
      const context=await resolveEpisodeContext(client,{actor:{id:author,role:'psychologist',isActive:true,psychologistStatus:'active'},
        episodeId:ep,operation:'read',resource:{type:'note',id:notes[i]}});
      assert.equal(context.resource.audienceVerified,false);assert.equal(context.resource.audience,null);
      for(const operation of episodeOperations)assert.deepEqual(authorizeEpisodeOperation({...context,operation}),{allowed:false});
      assert.throws(()=>projectEpisodeResource(context,new Proxy({},{get(){assert.fail('Clinical content touched');},ownKeys(){assert.fail('Clinical content enumerated');}})),{status:403});
    }
    await client.query("INSERT INTO psychologist_profiles(user_id,approval_status) VALUES('a','active'),('b','active')");
    const reader=await login(subtest,state,'reader'),database={async getClient(){return {query:(sql,args)=>reader.query(sql,args),release(){}};}};
    const token=jwt.sign({sub:'a',sv:0,role:'psychologist'},env.jwtSecret,{expiresIn:'1h'});
    const result=await evaluatePrivateNoteRead(database,{token,episodeId:episode,noteId:notes[0],operation:'read'});
    assert.equal(result.allowed,false);assert.equal(result.audience,'unverified');
    for(const [ep,ap,patient,author] of [[e2,appt,'p','a'],[episode,tuples[2][1],'p','a'],[couple,tuples[4][1],'p','a']])
      await assert.rejects(create(creator,ep,ap,{patient,author}),/Invalid prepared/);
    assert.equal((await counts(client)).notes,5);
  });
  await t.test('010: function owner ACL membership inherited and column drift reject replay without repair',async subtest=>{
    for(const tamper of [
      s=>'ALTER FUNCTION public.verify_private_note_origin() SECURITY INVOKER',
      s=>'ALTER FUNCTION public.verify_private_note_origin() OWNER TO integrity_test',
      s=>'GRANT EXECUTE ON FUNCTION '+signature+' TO PUBLIC',
      s=>'GRANT UPDATE(content) ON patient_clinical_notes TO '+s.creatorRole,
      s=>'GRANT SELECT ON clinical_note_private_origins TO '+s.readerRole,
      s=>'ALTER ROLE '+s.creatorOwner+' CREATEDB',
      s=>'GRANT EXECUTE ON FUNCTION pg_catalog.pg_read_file(text) TO '+s.creatorRole,
      s=>'GRANT EXECUTE ON FUNCTION pg_catalog.pg_read_file(text) TO '+s.verifierOwner,
      s=>'GRANT '+s.creatorOwner+' TO '+s.creatorRole,
      s=>'ALTER TABLE patient_clinical_notes DISABLE TRIGGER private_note_origin_required',
      s=>'GRANT SELECT ON clinical_note_private_origins TO PUBLIC',
    ]) {
      const state=await fresh(subtest,{identities:false}),{client,options}=state;
      await client.query(tamper(state));const before=await catalogChecksum(client),oldLedger=await ledger(client);
      await assert.rejects(migrate(client,options),/drift|incompatible/);
      if(!tamper(state).includes('DISABLE TRIGGER'))await assert.rejects(verify(client,state.creatorRole),/010 private note security contract/);
      assert.equal(await catalogChecksum(client),before);assert.deepEqual(await ledger(client),oldLedger);
    }
  });
  await t.test('010: incompatible ledger is rejected without repairing hashes or privileges',async subtest=>{
    for(const sql of ["UPDATE psicopanel_schema_migrations SET file_sha256='wrong' WHERE version='010'",
      "UPDATE psicopanel_schema_migrations SET catalog_sha256='wrong' WHERE version='010'",
      "DELETE FROM psicopanel_schema_migrations WHERE version='009'"]) {
      const {client,options}=await fresh(subtest,{identities:false});await client.query(sql);
      const before=await ledger(client),fingerprint=await catalogChecksum(client);
      await assert.rejects(migrate(client,options),/checksum|drift|incomplete/);
      assert.deepEqual(await ledger(client),before);assert.equal(await catalogChecksum(client),fingerprint);
    }
  });
  await t.test('010: late migration failure rolls back DDL roles grants and ledger before clean retry',async subtest=>{
    const state=await fresh(subtest,{target:'009',identities:false,beforeMigration:async client=>{
      await client.query(`CREATE FUNCTION fail_private_note_install() RETURNS event_trigger LANGUAGE plpgsql AS $$ BEGIN
        IF current_setting('test.fail010',true)='on' AND to_regclass('public.clinical_note_private_origins') IS NOT NULL
          AND to_regprocedure('${signature}') IS NOT NULL AND
          EXISTS(SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a JOIN pg_roles r ON r.oid=a.grantee
            WHERE p.oid=to_regprocedure('${signature}') AND r.rolname=current_setting('psicopanel.private_note_creator')
              AND a.privilege_type='EXECUTE') THEN
          RAISE EXCEPTION 'synthetic late 010 DDL failure'; END IF; END $$;
        CREATE EVENT TRIGGER fail_private_note_install ON ddl_command_end EXECUTE FUNCTION fail_private_note_install()`);
    }}),{client}=state;
    const before=await catalogChecksum(client),oldLedger=await ledger(client),options={...state.options,target:'010',privateNoteCreatorRole:state.creatorRole};
    await client.query("SET test.fail010='on'");await assert.rejects(migrate(client,options),/synthetic late 010 DDL failure/);
    assert.equal(await catalogChecksum(client),before);assert.deepEqual(await ledger(client),oldLedger);
    assert.equal((await client.query('SELECT FROM pg_roles WHERE rolname=ANY($1::text[])',[[state.creatorOwner,state.verifierOwner]])).rowCount,0);
    assert.equal((await client.query("SELECT to_regclass('public.clinical_note_private_origins') AS name")).rows[0].name,null);
    await client.query("SET test.fail010='off'");await migrate(client,options);await verify(client,state.creatorRole);
  });
  await t.test('010: caller temporary objects cannot shadow legacy appointment checks or origin tables',async subtest=>{
    const {client,creator,episode,appt}=await graph(subtest);
    await creator.query('CREATE TEMP TABLE appointments(id bigint); CREATE TEMP TABLE clinical_note_private_origins(note_id bigint)');
    await create(creator,episode,appt);
    assert.deepEqual(await counts(client),{notes:1,origins:1,history:0});
    assert.equal((await creator.query('SELECT count(*)::int AS n FROM pg_temp.clinical_note_private_origins')).rows[0].n,0);
  });
  await t.test('010: unsafe missing configured or assumable creator roles are rejected without adoption',async subtest=>{
    for(const mode of ['missing','same-reader','admin','configured','membership']) {
      const state=await fresh(subtest,{target:'009',identities:false});
      if(mode==='admin')await state.client.query('ALTER ROLE '+state.creatorRole+' CREATEDB');
      if(mode==='configured')await state.client.query('ALTER ROLE '+state.creatorRole+" SET search_path=public");
      if(mode==='membership')await state.client.query('GRANT pg_read_all_data TO '+state.creatorRole+' WITH INHERIT FALSE, SET TRUE');
      const before=await catalogChecksum(state.client),oldLedger=await ledger(state.client);
      const role=mode==='missing'?undefined:mode==='same-reader'?state.readerRole:state.creatorRole;
      await assert.rejects(migrate(state.client,{...state.options,target:'010',privateNoteCreatorRole:role}),/010 requires/);
      assert.equal(await catalogChecksum(state.client),before);assert.deepEqual(await ledger(state.client),oldLedger);
    }
  });
  await t.test('010: source checksum tampering is rejected before any database operation',async()=>{
    const dir=await fs.mkdtemp(os.tmpdir()+'/psicopanel-010-checksum-');
    try {
      for(const file of await fs.readdir(new URL('../sql/migrations/',import.meta.url)))
        await fs.copyFile(new URL('../sql/migrations/'+file,import.meta.url),dir+'/'+file);
      await fs.appendFile(dir+'/010_private_note_origins.sql','\n-- deliberate checksum mismatch\n');
      await assert.rejects(loadMigrations(pathToFileURL(dir+'/')),/checksum: 010/);
    }finally{await fs.rm(dir,{recursive:true,force:true});}
  });
  await t.test('010: unsafe default table grants fail the new contract and roll back without reinterpreting 009',async subtest=>{
    const state=await fresh(subtest,{target:'009',identities:false,beforeMigration:async client=>{
      const outsider='origin_outsider_'+randomUUID().replaceAll('-','');
      await client.query('CREATE ROLE '+outsider+' NOLOGIN');
      await client.query('ALTER DEFAULT PRIVILEGES GRANT SELECT ON TABLES TO '+outsider);
    }});
    const before=await catalogChecksum(state.client),oldLedger=await ledger(state.client);
    await assert.rejects(migrate(state.client,{...state.options,target:'010',privateNoteCreatorRole:state.creatorRole}),/010 private note security contract/);
    assert.equal(await catalogChecksum(state.client),before);assert.deepEqual(await ledger(state.client),oldLedger);
  });
  await t.test('010: actual CLI requires explicit destination and creator then installs and replays',async subtest=>{
    const state=await fresh(subtest,{target:'009',identities:false});
    const cli=args=>spawnSync(process.execPath,['scripts/migrate.js',...args],{encoding:'utf8',env:{...process.env,
      MIGRATION_DATABASE_URL:'postgres://integrity_test:disposable_test_password@db/'+state.name}});
    const args=['--target=010','--database='+state.name,'--private-note-creator='+state.creatorRole];
    const missing=cli(args.slice(0,2));assert.notEqual(missing.status,0);
    const install=cli(args);assert.equal(install.status,0,install.stderr);assert.equal(JSON.parse(install.stdout).status,'applied');
    const replay=cli(args);assert.equal(replay.status,0,replay.stderr);assert.equal(JSON.parse(replay.stdout).status,'already-applied');
    assert.equal((await ledger(state.client)).length,10);await verify(state.client,state.creatorRole);
  });
  await t.test('010: untracked private-origin footprints are refused before foundation adoption',async subtest=>{
    const name='psicopanel_episode_'+randomUUID().replaceAll('-','');
    const client=await createSandboxDatabase(control,name);subtest.after(()=>client.end());await installBaseline(client);
    await client.query('CREATE TABLE public.clinical_note_private_origins(note_id bigint)');
    await assert.rejects(migrate(client,{expectedDatabase:name,target:'003'}),/Untracked episode schema/);
    assert.equal((await client.query("SELECT to_regclass('public.psicopanel_schema_migrations') AS ledger")).rows[0].ledger,null);
    assert.equal((await client.query('SELECT count(*)::int AS n FROM clinical_note_private_origins')).rows[0].n,0);
  });
  await t.test('010: concurrent independent migration connections serialize installation and verified replay',async subtest=>{
    const state=await fresh(subtest,{target:'009',identities:false}),other=await connect(state.name);subtest.after(()=>other.end());
    const options={...state.options,target:'010',privateNoteCreatorRole:state.creatorRole};
    const result=await Promise.all([migrate(state.client,options),migrate(other,options)]);
    assert.deepEqual(result.map(r=>r.status).sort(),['already-applied','applied']);
    assert.equal((await ledger(state.client)).length,10);await verify(state.client,state.creatorRole);
  });
}
