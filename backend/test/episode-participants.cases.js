import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {loadMigrations,migrate,catalogChecksum} from '../scripts/episode-migration.js';
import {createSandboxDatabase,installBaseline} from '../scripts/episode-sandbox.js';
import {participantIdentities,preparedEpisode,participantGraph} from '../scripts/episode-participants-fixture.js';

const connection=name=>({host:'db',database:name,user:'integrity_test',password:'disposable_test_password'});
const connect=async(name,extra={})=>{const c=new pg.Client({...connection(name),...extra});await c.connect();await c.query("SET statement_timeout='8s'");return c;};
const count=async(c,table)=>(await c.query('SELECT count(*)::int AS n FROM public.'+table)).rows[0].n;
const waitForLock=async(control,pid)=>{
  for(let n=0;n<300;n++){
    if((await control.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0]?.wait_event_type==='Lock')return;
    await new Promise(r=>setTimeout(r,10));
  }
  assert.fail('Independent connection did not wait for a PostgreSQL lock');
};

// Called within the existing guarded suite: same newly created cluster, fresh DB
// for each case. No second sandboxControl() bypass and no HTTP fixture reuse.
export async function runParticipantCases(t,control,clients){
  const fresh=async({target='008',identities=true,beforeMigration=null}={})=>{
    const name='psicopanel_episode_'+randomUUID().replaceAll('-','');
    const client=await createSandboxDatabase(control,name);clients.push(client);
    await installBaseline(client);if(beforeMigration)await beforeMigration(client);await migrate(client,{expectedDatabase:name,target});
    if(identities)await participantIdentities(client);
    return {client,name};
  };
  await t.test('008: empty install, historical ledger, replay after fixtures and downgrade rejection',async()=>{
    const {client,name}=await fresh({target:'007',identities:false});
    const before=(await client.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows;
    await migrate(client,{expectedDatabase:name,target:'008'});
    assert.deepEqual((await client.query("SELECT * FROM psicopanel_schema_migrations WHERE version<'008' ORDER BY version")).rows,before);
    await participantIdentities(client);await preparedEpisode(client);
    const ledger=(await client.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows;
    assert.equal(ledger.length,8);
    assert.equal(ledger.at(-1).catalog_sha256,await catalogChecksum(client));
    assert.equal((await migrate(client,{expectedDatabase:name,target:'008'})).status,'already-applied');
    assert.deepEqual((await client.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows,ledger);
    await assert.rejects(migrate(client,{expectedDatabase:name,target:'007'}),/downgrade/);
  });
  await t.test('008: direct full-chain installation on a new empty destination',async()=>{
    const {client}=await fresh({identities:false});
    assert.equal(await count(client,'users'),0);assert.equal(await count(client,'clinical_episode_participants'),0);
  });
  await t.test('008: populated preflight refuses without changing rows, schema, ledger or roles',async()=>{
    const {client,name}=await fresh({target:'007'});
    const before=await catalogChecksum(client), ledger=(await client.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows;
    const rows=(await client.query('SELECT * FROM patients ORDER BY id')).rows;
    await assert.rejects(migrate(client,{expectedDatabase:name,target:'008'}),/empty isolated destination/);
    assert.equal(await catalogChecksum(client),before);
    assert.deepEqual((await client.query('SELECT * FROM patients ORDER BY id')).rows,rows);
    assert.deepEqual((await client.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows,ledger);
    assert.equal((await client.query("SELECT to_regclass('public.clinical_episode_participants') AS n")).rows[0].n,null);
  });
  await t.test('008: exact materialization, parallel composition and independent creation actor',async()=>{
    const {client}=await fresh();
    const ids=[await preparedEpisode(client),await preparedEpisode(client),await preparedEpisode(client,{professional:'b'}),await preparedEpisode(client,{two:'q'})];
    assert.deepEqual((await client.query('SELECT episode_id,count(*)::int AS n FROM clinical_episode_participants GROUP BY episode_id ORDER BY episode_id')).rows.map(r=>r.n),[1,1,1,2]);
    const root=(await client.query('SELECT * FROM clinical_episodes WHERE id=$1',[ids[0]])).rows[0];
    assert.equal(root.created_by_user_id,'p');assert.equal(root.psychologist_user_id,'a');
    assert.equal(root.status,'prepared');assert.equal(root.started_at,null);assert.equal(root.finalized_at,null);
    for(const column of ['participant_one_id','participant_two_id']){
      assert.equal((await client.query("SELECT collation_name FROM information_schema.columns WHERE table_name='clinical_episodes' AND column_name=$1",[column])).rows[0].collation_name,'C');
    }
  });
  await t.test('008: invalid modalities, cardinality, duplicate patients, roles and creators rejected',async()=>{
    const {client}=await fresh();
    for(const input of [{modality:'individual',two:'q'},{modality:'couple'},{two:'p'},{one:'q',two:'p'},{one:'missing'},{professional:'p'},{creator:null},{creator:'missing'},{modality:'group'}]){
      await assert.rejects(preparedEpisode(client,input));
    }
    assert.equal(await count(client,'clinical_episodes'),0);assert.equal(await count(client,'clinical_episode_participants'),0);
    await assert.rejects(client.query("INSERT INTO clinical_episodes(modality,participant_one_id,psychologist_user_id,created_by_user_id) VALUES('individual',NULL,'a','p')"));
  });
  await t.test('008: prepared barrier rejects every operational state and both start dates',async()=>{
    const {client}=await fresh();
    const id=await preparedEpisode(client);
    for(const status of ['active','paused','finalized']){
      await assert.rejects(client.query("INSERT INTO clinical_episodes(modality,participant_one_id,psychologist_user_id,created_by_user_id,status) VALUES('individual','p','a','p',$1)",[status]),/check constraint/);
      await assert.rejects(client.query('UPDATE clinical_episodes SET status=$1 WHERE id=$2',[status,id]),/immutable/);
    }
    for(const column of ['started_at','finalized_at']){
      await assert.rejects(client.query("INSERT INTO clinical_episodes(modality,participant_one_id,psychologist_user_id,created_by_user_id,"+column+") VALUES('individual','p','a','p',NOW())"),/check constraint/);
      await assert.rejects(client.query('UPDATE clinical_episodes SET '+column+'=NOW() WHERE id=$1',[id]),/immutable/);
    }
    for(const column of ['started_at'])assert.equal((await client.query("SELECT column_default FROM information_schema.columns WHERE table_name='clinical_episodes' AND column_name=$1",[column])).rows[0].column_default,null);
  });
  await t.test('008: root identity, participants and creation attribution cannot be altered or removed',async()=>{
    const {client}=await fresh();const id=await preparedEpisode(client,{two:'q'});
    for(const change of ["modality='individual',participant_two_id=NULL","participant_one_id='r'","participant_two_id='r'","psychologist_user_id='b'","created_by_user_id='a'",'id=id+100',"created_at=created_at-INTERVAL '1 day'"]){
      await assert.rejects(client.query('UPDATE clinical_episodes SET '+change+' WHERE id=$1',[id]),/immutable/);
    }
    for(const sql of ['DELETE FROM clinical_episodes','TRUNCATE clinical_episodes CASCADE','UPDATE clinical_episode_participants SET patient_id=patient_id','DELETE FROM clinical_episode_participants','TRUNCATE clinical_episode_participants CASCADE'])await assert.rejects(client.query(sql),/INTEGRITY/);
    for(const values of [[id,'r',1,'a'],[id,'r',3,'a'],[id,'q',2,'b']])await assert.rejects(client.query('INSERT INTO clinical_episode_participants VALUES($1,$2,$3,$4)',values),/INTEGRITY|check constraint/);
    assert.equal(await count(client,'clinical_episode_history'),0);
    for(const sql of ['UPDATE clinical_episode_history SET episode_id=episode_id','DELETE FROM clinical_episode_history','TRUNCATE clinical_episode_history'])await assert.rejects(client.query(sql),/CLINICAL_INTEGRITY/);
    // Account recovery does not rewrite patient identity or creator history.
    await client.query("UPDATE users SET patient_id=NULL WHERE id='p'");
    assert.equal((await client.query('SELECT created_by_user_id FROM clinical_episodes WHERE id=$1',[id])).rows[0].created_by_user_id,'p');
  });
  await t.test('008: materialization failure in second participant rolls back the entire statement',async()=>{
    const {client}=await fresh();
    await client.query(`CREATE FUNCTION fail_second_participant() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.slot=2 THEN RAISE EXCEPTION 'synthetic participant failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER zz_fail_second BEFORE INSERT ON clinical_episode_participants FOR EACH ROW EXECUTE FUNCTION fail_second_participant()`);
    await assert.rejects(preparedEpisode(client,{two:'q'}),/synthetic participant failure/);
    assert.equal(await count(client,'clinical_episodes'),0);assert.equal(await count(client,'clinical_episode_participants'),0);
    await client.query('DROP TRIGGER zz_fail_second ON clinical_episode_participants; DROP FUNCTION fail_second_participant()');
    await preparedEpisode(client,{two:'q'});assert.equal(await count(client,'clinical_episode_participants'),2);
  });
  await t.test('008: effective application connection materializes CEP but has no direct write or definer privilege',async()=>{
    const {client,name}=await fresh();
    const owner=(await client.query("SELECT r.rolname,r.rolsuper,r.rolcanlogin,r.rolcreaterole,r.rolcreatedb,r.rolinherit,r.rolbypassrls FROM pg_roles r JOIN pg_proc p ON p.proowner=r.oid WHERE p.oid='public.materialize_episode_participants()'::regprocedure")).rows[0];
    for(const key of ['rolsuper','rolcanlogin','rolcreaterole','rolcreatedb','rolinherit','rolbypassrls'])assert.equal(owner[key],false);
    const role='participant_app_'+(await client.query('SELECT oid FROM pg_database WHERE datname=current_database()')).rows[0].oid;
    const password=randomUUID();
    await client.query((await client.query("SELECT format('CREATE ROLE %I LOGIN NOINHERIT PASSWORD %L',$1::text,$2::text) AS sql",[role,password])).rows[0].sql);
    await client.query(`GRANT USAGE ON SCHEMA public TO ${role}; GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE ON clinical_episodes TO ${role}; GRANT SELECT ON clinical_episode_participants TO ${role}; GRANT USAGE ON SEQUENCE clinical_episodes_id_seq TO ${role}`);
    const app=await connect(name,{user:role,password});
    try{
      assert.equal((await app.query('SELECT current_user AS role')).rows[0].role,role);
      await app.query('CREATE TEMP TABLE clinical_episode_participants(dummy TEXT); SET search_path=pg_temp,public');
      const id=await preparedEpisode(app,{two:'q'});
      assert.equal((await app.query('SELECT count(*)::int AS n FROM public.clinical_episode_participants WHERE episode_id=$1',[id])).rows[0].n,2);
      assert.equal((await app.query('SELECT count(*)::int AS n FROM pg_temp.clinical_episode_participants')).rows[0].n,0);
      for(const sql of ["INSERT INTO public.clinical_episode_participants VALUES(1,'r',1,'a')",'UPDATE public.clinical_episode_participants SET slot=slot','DELETE FROM public.clinical_episode_participants','TRUNCATE public.clinical_episode_participants','SELECT public.materialize_episode_participants()',`SET ROLE ${owner.rolname}`])await assert.rejects(app.query(sql),e=>e.code==='42501');
      await app.query('CREATE TEMP TABLE malicious(id BIGINT)');
      await assert.rejects(app.query('CREATE TRIGGER malicious AFTER INSERT ON malicious FOR EACH ROW EXECUTE FUNCTION public.materialize_episode_participants()'),e=>e.code==='42501');
      await assert.rejects(app.query("UPDATE public.clinical_episodes SET created_by_user_id='a' WHERE id=$1",[id]),/immutable/);
    }finally{await app.end();}
  });
  await t.test('008: valid individual graph, professional authorship and clinical row history preserved',async()=>{
    const {client}=await fresh();const id=await preparedEpisode(client);const graph=await participantGraph(client,id);
    await client.query("UPDATE patient_tasks SET text='Revised synthetic task' WHERE id=$1",[graph.task]);
    assert.ok(await count(client,'clinical_record_history')>0);
    for(const table of ['appointments','patient_clinical_notes','patient_tasks','appointment_waitlist_entries']){
      for(const change of ['episode_id=NULL',"patient_id='q'","created_by_user_id='b'"])
        await assert.rejects(client.query('UPDATE '+table+' SET '+change+' WHERE episode_id=$1',[id]),/INTEGRITY/);
    }
    await assert.rejects(client.query("UPDATE appointments SET status='cancelled' WHERE id=$1",[graph.appointment]),/CLINICAL_INTEGRITY/);
    await assert.rejects(client.query('DELETE FROM clinical_record_history'),/CLINICAL_INTEGRITY/);
    await client.query("INSERT INTO patient_tasks(patient_id,episode_id,created_by_user_id,kind,text) VALUES('p',$1,'a','objective','Standalone objective')",[id]);
  });
  await t.test('008: crossed patient, episode, author and NULL scopes rejected in both directions',async()=>{
    const {client}=await fresh();const first=await preparedEpisode(client),second=await preparedEpisode(client);const graph=await participantGraph(client,first);
    for(const [scope,patient,author] of [[first,'q','a'],[first,'p','b'],[first,'p','admin'],[first,'p',null]]){
      for(const [table,tail] of [['appointments',",scheduled_date,scheduled_time) VALUES($1,$2,$3,CURRENT_DATE-3,'11:00')"],['patient_tasks',",text) VALUES($1,$2,$3,'Wrong')"],['appointment_waitlist_entries',",scheduled_date,scheduled_time) VALUES($1,$2,$3,CURRENT_DATE+4,'11:00')"]]){
        await assert.rejects(client.query('INSERT INTO '+table+'(patient_id,episode_id,created_by_user_id'+tail,[patient,scope,author]));
      }
    }
    for(const scope of [null,second])await assert.rejects(client.query("INSERT INTO patient_tasks(patient_id,clinical_note_id,episode_id,created_by_user_id,text) VALUES('p',$1,$2,'a','Crossed')",[graph.note,scope]),/foreign key/);
    const legacy=(await client.query("INSERT INTO appointments(patient_id,scheduled_date,scheduled_time,status) VALUES('p',CURRENT_DATE-3,'12:00','completed') RETURNING id")).rows[0].id;
    const note=async(appt,scope,author='a')=>client.query("INSERT INTO patient_clinical_notes(patient_id,appointment_id,clinical_note_date,episode_id,created_by_user_id) VALUES('p',$1,CURRENT_DATE-3,$2,$3)",[appt,scope,author]);
    for(const [appt,scope,author] of [[graph.appointment,second,'a'],[graph.appointment,null,'a'],[legacy,first,'a'],[legacy,first,'p'],[legacy,first,null]])await assert.rejects(note(appt,scope,author));
    await note(legacy,null,null);
    await client.query("INSERT INTO patient_tasks(patient_id,clinical_note_id,text) SELECT 'p',id,'Legacy NULL scope' FROM patient_clinical_notes WHERE appointment_id=$1",[legacy]);
  });
  await t.test('008: independent connections serialize competing parent attribution and child writes',async()=>{
    for(const parentFirst of [true,false]){
      const {client,name}=await fresh();const id=await preparedEpisode(client);
      const appointment=(await client.query("INSERT INTO appointments(patient_id,scheduled_date,scheduled_time,status) VALUES('p',CURRENT_DATE-3,'08:00','completed') RETURNING id")).rows[0].id;
      const other=await connect(name);
      try{
        const authorParent=c=>c.query("UPDATE appointments SET episode_id=$1,created_by_user_id='a' WHERE id=$2",[id,appointment]);
        const child=c=>c.query("INSERT INTO patient_clinical_notes(patient_id,appointment_id,clinical_note_date) VALUES('p',$1,CURRENT_DATE-3)",[appointment]);
        await client.query('BEGIN');await(parentFirst?authorParent(client):child(client));
        const pid=(await other.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        const rejected=assert.rejects(parentFirst?child(other):authorParent(other),/foreign key/);
        await waitForLock(control,pid);await client.query('COMMIT');await rejected;
      }finally{await client.query('ROLLBACK');await other.end();}
    }
  });
  await t.test('008: concurrent migrations produce one install and one verified replay',async()=>{
    const {client,name}=await fresh({target:'007',identities:false});const other=await connect(name);
    try{
      const results=await Promise.all([migrate(client,{expectedDatabase:name,target:'008'}),migrate(other,{expectedDatabase:name,target:'008'})]);
      assert.deepEqual(results.map(x=>x.status).sort(),['already-applied','applied']);
    }finally{await other.end();}
  });
  await t.test('008: owner, membership, function path, privileges and collation drift fail closed',async()=>{
    for(const sql of [
      "ALTER FUNCTION materialize_episode_participants() SECURITY INVOKER",
      "ALTER FUNCTION materialize_episode_participants() SET search_path=public",
      'ALTER FUNCTION materialize_episode_participants() OWNER TO integrity_test',
      'GRANT INSERT ON clinical_episode_participants TO PUBLIC',
      "ALTER TABLE clinical_episodes ALTER COLUMN participant_one_id TYPE TEXT COLLATE \"default\"",
      "DO $$ DECLARE r TEXT; BEGIN SELECT rolname INTO r FROM pg_roles WHERE oid=(SELECT proowner FROM pg_proc WHERE oid='materialize_episode_participants()'::regprocedure); EXECUTE format('ALTER ROLE %I LOGIN',r); END $$",
      "DO $$ DECLARE r TEXT; BEGIN SELECT rolname INTO r FROM pg_roles WHERE oid=(SELECT proowner FROM pg_proc WHERE oid='materialize_episode_participants()'::regprocedure); EXECUTE format('GRANT %I TO integrity_test',r); END $$",
    ]){
      const {client,name}=await fresh({identities:false});await client.query(sql);const before=await catalogChecksum(client);
      await assert.rejects(migrate(client,{expectedDatabase:name,target:'008'}),/drift|incompatible/);
      assert.equal(await catalogChecksum(client),before);
    }
  });
  await t.test('008: checksum and recorded checksum mismatches rejected',async()=>{
    const dir=await fs.mkdtemp(os.tmpdir()+'/participants-manifest-');
    try{
      const root=new URL('../sql/migrations/',import.meta.url);
      for(const file of await fs.readdir(root))await fs.copyFile(new URL(file,root),dir+'/'+file);
      await fs.appendFile(dir+'/008_episode_participants_foundation.sql','\n-- tamper\n');
      await assert.rejects(loadMigrations(new URL('file://'+dir+'/')),/checksum/);
    }finally{await fs.rm(dir,{recursive:true,force:true});}
    const {client,name}=await fresh({identities:false});
    await client.query("UPDATE psicopanel_schema_migrations SET file_sha256='invalid' WHERE version='008'");
    await assert.rejects(migrate(client,{expectedDatabase:name,target:'008'}),/checksum/);
  });
  await t.test('008: late DDL failure rolls back objects, restricted role and ledger then retries',async()=>{
    // Register the injection fixture before 007's fingerprint. A session switch
    // selects failure without changing the catalog or weakening drift checks.
    const {client,name}=await fresh({target:'007',identities:false,beforeMigration:async c=>c.query(`CREATE FUNCTION fail_participants_install() RETURNS event_trigger LANGUAGE plpgsql AS $$
      BEGIN IF current_setting('test.fail008',true)='on' AND EXISTS(SELECT FROM pg_event_trigger_ddl_commands() WHERE object_identity='public.clinical_episode_history') THEN RAISE EXCEPTION 'synthetic late DDL failure'; END IF; END $$;
      CREATE EVENT TRIGGER fail_participants_install ON ddl_command_end EXECUTE FUNCTION fail_participants_install()`)});
    await client.query("SET test.fail008='on'");
    const before=await catalogChecksum(client),ledger=(await client.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows;
    const role='psicopanel_cep_owner_'+(await client.query('SELECT oid FROM pg_database WHERE datname=current_database()')).rows[0].oid;
    await assert.rejects(migrate(client,{expectedDatabase:name,target:'008'}),/synthetic late DDL failure/);
    assert.equal(await catalogChecksum(client),before);assert.equal((await client.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rowCount,0);
    assert.deepEqual((await client.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows,ledger);
    await client.query("SET test.fail008='off'");
    await migrate(client,{expectedDatabase:name,target:'008'});
  });
}
