import jwt from 'jsonwebtoken';
import env from '../src/config/env.js';
import {evaluatePrivateNoteRead} from '../src/modules/episodes/episode.note-read.js';

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {loadMigrations,migrate,catalogChecksum} from '../scripts/episode-migration.js';
import {catalogChecksum as historicalChecksum} from './fixtures/catalog-checksum-003-008.js';
import {createSandboxDatabase,installBaseline} from '../scripts/episode-sandbox.js';
import {participantIdentities,preparedEpisode,participantGraph} from '../scripts/episode-participants-fixture.js';

import {resolveEpisodeContext} from '../src/modules/episodes/episode.context.js';
import {authorizeEpisodeOperation,episodeOperations} from '../src/modules/episodes/episode.policy.js';
import {projectEpisodeResource} from '../src/modules/episodes/episode.projections.js';

const noteDenied=Object.freeze({structurallyEligible:false,audience:'unverified',eligible:false,allowed:false});
const noteStructural=Object.freeze({...noteDenied,structurallyEligible:true});
const noteToken=(sub,sv=0)=>jwt.sign({sub,sv,role:'psychologist'},env.jwtSecret,{expiresIn:'1h'});
const noteDatabase=(client,afterQuery=null)=>({async getClient(){return {
  async query(sql,params){const result=await client.query(sql,params);await afterQuery?.(sql);return result;},
  release(){}, // test owns this independent connection; production checks out a fresh one.
};}});
const noteSnapshot=async client=>{
  const tables=(await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
  const result={};
  for(const {tablename} of tables)result[tablename]=(await client.query('SELECT to_jsonb(t) AS data FROM public."'+tablename+'" t ORDER BY 1')).rows;
  return result;
};

const structuralResource=async(client,episodeId,type,id,actor={id:'a',role:'psychologist',isActive:true,psychologistStatus:'active'},claims={})=>{
  const context=await resolveEpisodeContext(client,{actor,episodeId,operation:'read',resource:{...claims,type,id}});
  for(const operation of [...episodeOperations,'unknown']){
    assert.deepEqual(authorizeEpisodeOperation({...context,operation}),{allowed:false});
  }
  assert.throws(()=>projectEpisodeResource(context,new Proxy({},{
    get(){assert.fail('Denied projection touched SQL resource content');},
    ownKeys(){assert.fail('Denied projection enumerated SQL resource content');},
  })),{message:'Forbidden',status:403});
  return context;
};
const connection=name=>({host:'db',database:name,user:'integrity_test',password:'disposable_test_password'});
const connect=async(name,extra={})=>{const c=new pg.Client({...connection(name),...extra});await c.connect();await c.query("SET statement_timeout='8s'");return c;};
const count=async(c,table)=>(await c.query('SELECT count(*)::int AS n FROM public.'+table)).rows[0].n;
const waitForLock=async(control,pid,blocker=null)=>{
  for(let n=0;n<300;n++){
    const row=(await control.query('SELECT wait_event_type,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0];
    if(row?.wait_event_type==='Lock' && row.blockers.length && (blocker===null || row.blockers.includes(blocker)))return;
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
    await installBaseline(client);if(beforeMigration)await beforeMigration(client);
    let readerRole;
    if(target==='009'){
      readerRole='account_reader_'+randomUUID().replaceAll('-','');
      await client.query('CREATE ROLE '+readerRole+" LOGIN NOINHERIT PASSWORD 'disposable_note_reader'");
    }
    if(target)await migrate(client,{expectedDatabase:name,target,accountReaderRole:readerRole});
    if(identities)await participantIdentities(client);
    return {client,name,readerRole};
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

  await t.test('008: column ACL drift is detected without repairing privileges, ledger or clinical data',async()=>{
    const {client,name}=await fresh();
    const episode=await preparedEpisode(client);await participantGraph(client,episode);
    const snapshot=async()=>({
      ledger:(await client.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows,
      records:await Promise.all(['patients','users','clinical_episodes','clinical_episode_participants',
        'appointments','patient_clinical_notes','patient_tasks','appointment_waitlist_entries',
        'clinical_record_history','clinical_episode_history'].map(async table=>
        (await client.query('SELECT to_jsonb(t) AS row FROM public.'+table+' t ORDER BY to_jsonb(t)::text')).rows)),
      acl:(await client.query("SELECT attacl::text FROM pg_attribute WHERE attrelid='clinical_episode_participants'::regclass AND attname='patient_id'")).rows,
    });
    const original=await catalogChecksum(client);
    const tableAcl=(await client.query("SELECT relacl::text FROM pg_class WHERE oid='clinical_episode_participants'::regclass")).rows;
    await client.query('GRANT SELECT(patient_id) ON clinical_episode_participants TO PUBLIC');
    assert.deepEqual((await client.query("SELECT relacl::text FROM pg_class WHERE oid='clinical_episode_participants'::regclass")).rows,tableAcl);
    const drifted=await catalogChecksum(client);assert.notEqual(drifted,original);
    const before=await snapshot();
    await assert.rejects(migrate(client,{expectedDatabase:name,target:'008'}),/Schema drift/);
    assert.equal(await catalogChecksum(client),drifted);assert.deepEqual(await snapshot(),before);
  });
  await t.test('008: ledger recorded with pre-column-ACL algorithm is rejected without adoption',async()=>{
    const {client,name}=await fresh({identities:false});
    // Reproduce the exact old results in a TEST proxy; production exposes no
    // compatibility switch and never rewrites recorded catalog checksums.
    const historicalResults=[];
    const {createHash}=await import('node:crypto');
    const current=await catalogChecksum({query:async(sql,params)=>{
      const result=await client.query(sql,params);
      if(!sql.includes("to_regclass('public.clinical_episode_participants')") && !sql.includes('a.attacl::text'))
        historicalResults.push(result.rows);
      return result;
    }});
    const old=createHash('sha256').update(JSON.stringify(historicalResults)).digest('hex');
    assert.notEqual(current,old);
    await client.query("UPDATE psicopanel_schema_migrations SET catalog_sha256=$1 WHERE version='008'",[old]);
    const ledger=(await client.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows;
    await assert.rejects(migrate(client,{expectedDatabase:name,target:'008'}),/Schema drift/);
    assert.deepEqual((await client.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows,ledger);
    assert.equal(await catalogChecksum(client),current);
    assert.equal(await count(client,'clinical_episodes'),0);
  });
  await t.test('008: internal context resolves real CEP composition but grants no clinical operation',async()=>{
    const {resolveEpisodeContext}=await import('../src/modules/episodes/episode.context.js');
    const {authorizeEpisodeOperation}=await import('../src/modules/episodes/episode.policy.js');
    const {client}=await fresh();
    const first=await preparedEpisode(client),second=await preparedEpisode(client,{professional:'b',creator:'b'});
    const couple=await preparedEpisode(client,{two:'q'});
    for(const [id,participants,professional,creator] of [[first,['p'],'a','p'],[second,['p'],'b','b'],[couple,['p','q'],'a','p']]){
      const context=await resolveEpisodeContext(client,{actor:{id:'p',role:'patient',patientId:'p',isActive:true},
        episodeId:id,operation:'read',resource:{type:'note',id:'1',episodeId:id,subjectPatientId:'p',audience:'professional',state:'draft',authorUserId:professional}});
      assert.deepEqual(context.episode.participants.map(p=>p.patientId),participants);
      assert.equal(context.episode.responsibleUserId,professional);
      assert.equal(context.episode.headerCreatorUserId,creator);
      assert.equal(context.membership.actorIsParticipant,true);
      assert.deepEqual(authorizeEpisodeOperation(context),{allowed:false});
    }
  });
  await t.test('resources: PostgreSQL resolves all five types with column-only privileges and no content reads',async()=>{
    const {client,name}=await fresh(),id=await preparedEpisode(client);
    const graph=await participantGraph(client,id);
    const objective=(await client.query("INSERT INTO patient_tasks(patient_id,episode_id,created_by_user_id,kind,text) VALUES('p',$1,'a','objective','PRIVATE_OBJECTIVE_SENTINEL') RETURNING id",[id])).rows[0].id;
    const role='resource_reader_'+randomUUID().replaceAll('-','');
    await client.query('CREATE ROLE '+role+" LOGIN PASSWORD 'disposable_resource_reader'");
    await client.query('GRANT USAGE ON SCHEMA public TO '+role);
    await client.query('GRANT SELECT ON clinical_episodes,clinical_episode_participants TO '+role);
    const reader=await connect(name,{user:role,password:'disposable_resource_reader'});clients.push(reader);
    // Real ACL refusal: no fallback and no context can escape the failed call.
    await assert.rejects(structuralResource(reader,id,'note',graph.note),error=>error.code==='42501');
    for(const [table,columns] of [
      ['appointments','id,episode_id,patient_id,created_by_user_id,status'],
      ['patient_clinical_notes','id,episode_id,patient_id,created_by_user_id,appointment_id'],
      ['patient_tasks','id,episode_id,patient_id,created_by_user_id,kind,clinical_note_id'],
      ['appointment_waitlist_entries','id,episode_id,patient_id,created_by_user_id'],
    ])await client.query('GRANT SELECT('+columns+') ON '+table+' TO '+role);
    for(const [type,key] of [...Object.entries(graph),['objective',objective]]){
      const context=await structuralResource(reader,id,type,key,undefined,{
        episodeId:'9223372036854775807',subjectPatientId:'q',authorUserId:'b',state:'published',audience:'joint',
      });
      assert.equal(context.resource.id,key);assert.equal(context.resource.episodeId,id);
      assert.equal(context.resource.subjectPatientId,'p');assert.equal(context.resource.authorUserId,'a');
      assert.equal(context.episode.headerCreatorUserId,'p'); // Creator is not author/responsible.
      assert.equal(context.resource.verified,true);assert.equal(context.resource.audienceVerified,false);
      assert.equal(context.resource.audience,null);
      assert.equal(context.resource.appointmentId,type==='note'?graph.appointment:null);
      assert.equal(context.resource.clinicalNoteId,type==='task'?graph.note:null);
      assert.equal(context.resource.kind,['task','objective'].includes(type)?type:null);
      assert.equal(context.resource.state,type==='appointment'?'completed':null);
      assert.equal(Object.isFrozen(context.resource),true);
      assert.doesNotMatch(JSON.stringify(context),/PRIVATE_|Synthetic structural|content|clinical_observations|priority|scheduled_time/);
    }
    for(const sql of ['SELECT content FROM patient_clinical_notes','SELECT text FROM patient_tasks','SELECT notes FROM appointments','SELECT priority_position FROM appointment_waitlist_entries']){
      await assert.rejects(reader.query(sql),error=>error.code==='42501');
    }
  });
  await t.test('resources: same-patient parallel episodes and different professionals cannot reuse resource attribution',async()=>{
    const {client}=await fresh();
    const first=await preparedEpisode(client),second=await preparedEpisode(client,{creator:'a'});
    const third=await preparedEpisode(client,{professional:'b',creator:'b'});
    const graph=await participantGraph(client,first);
    for(const [episode,author] of [[first,'a'],[second,'a'],[third,'b']]){
      const task=(await client.query("INSERT INTO patient_tasks(patient_id,episode_id,created_by_user_id,text) VALUES('p',$1,$2,'Parallel task') RETURNING id",[episode,author])).rows[0].id;
      const own=await structuralResource(client,episode,'task',task);
      assert.equal(own.resource.authorUserId,author);assert.equal(own.resource.episodeId,episode);
      assert.equal(own.membership.actorIsResponsible,author==='a');
      for(const other of [first,second,third].filter(id=>id!==episode)){
        assert.equal((await structuralResource(client,other,'task',task,undefined,{episodeId:other,authorUserId:'a'})).resource,null);
      }
    }
    for(const [type,key] of Object.entries(graph)){
      assert.equal((await structuralResource(client,second,type,key,undefined,{episodeId:second})).resource,null);
    }
  });
  await t.test('resources: couple membership preserves the individual subject without reciprocal audience',async()=>{
    const {client}=await fresh(),id=await preparedEpisode(client,{two:'q'});
    const graph=await participantGraph(client,id);
    const taskQ=(await client.query("INSERT INTO patient_tasks(patient_id,episode_id,created_by_user_id,text) VALUES('q',$1,'a','Private Q instructions') RETURNING id",[id])).rows[0].id;
    for(const patientId of ['p','q']){
      const actor={id:patientId,role:'patient',patientId,isActive:true};
      const context=await structuralResource(client,id,'note',graph.note,actor,{subjectPatientId:patientId,audience:'participant'});
      assert.equal(context.membership.actorIsParticipant,true);
      assert.equal(context.resource.subjectPatientId,'p');
      assert.equal(context.resource.audienceVerified,false);
      const q=await structuralResource(client,id,'task',taskQ,actor,{audience:'joint'});
      assert.equal(q.resource.subjectPatientId,'q');assert.equal(q.resource.audience,null);
    }
    assert.equal((await structuralResource(client,id,'objective',graph.task)).resource,null);
    const foreign=await structuralResource(client,id,'task',taskQ,{id:'outsider',role:'patient',patientId:'r',isActive:true});
    assert.equal(foreign.membership.actorIsParticipant,false);
  });
  await t.test('resources: PostgreSQL composite FKs reject incompatible note-appointment, task-note and authors',async()=>{
    const {client}=await fresh(),first=await preparedEpisode(client),second=await preparedEpisode(client);
    const graph=await participantGraph(client,first);
    // Unused completed appointment: rejection cannot be masked by note uniqueness.
    const appointment=(await client.query("INSERT INTO appointments(patient_id,episode_id,created_by_user_id,scheduled_date,scheduled_time,status) VALUES('p',$1,'a',CURRENT_DATE-4,'11:00','completed') RETURNING id",[first])).rows[0].id;
    await assert.rejects(client.query("INSERT INTO patient_clinical_notes(patient_id,appointment_id,episode_id,created_by_user_id,clinical_note_date) VALUES('p',$1,$2,'a',CURRENT_DATE-4)",[appointment,second]),
      error=>error.code==='23503'&&error.constraint==='notes_appointment_scope_fk');
    await assert.rejects(client.query("INSERT INTO patient_tasks(patient_id,clinical_note_id,episode_id,created_by_user_id,text) VALUES('p',$1,$2,'a','Wrong note scope')",[graph.note,second]),
      error=>error.code==='23503'&&error.constraint==='tasks_note_scope_fk');
    await assert.rejects(client.query("INSERT INTO patient_tasks(patient_id,episode_id,created_by_user_id,text) VALUES('p',$1,'b','Wrong author')",[first]),
      error=>error.code==='23503');
    await assert.rejects(client.query("INSERT INTO appointment_waitlist_entries(patient_id,episode_id,created_by_user_id,scheduled_date,scheduled_time) VALUES('q',$1,'a',CURRENT_DATE+5,'12:00')",[first]),
      error=>error.code==='23503');
    assert.equal((await client.query('SELECT count(*)::int AS n FROM patient_clinical_notes WHERE appointment_id=$1',[appointment])).rows[0].n,0);
    assert.equal((await structuralResource(client,second,'note',graph.note)).resource,null);
  });
  await t.test('resources: legacy NULL attribution, missing rows and invalid identifiers never become episode facts',async()=>{
    const {client}=await fresh(),id=await preparedEpisode(client);
    const appointment=(await client.query("INSERT INTO appointments(patient_id,scheduled_date,scheduled_time,status) VALUES('p',CURRENT_DATE-5,'12:00','completed') RETURNING id")).rows[0].id;
    const note=(await client.query("INSERT INTO patient_clinical_notes(patient_id,appointment_id,clinical_note_date,content) VALUES('p',$1,CURRENT_DATE-5,'LEGACY_PRIVATE') RETURNING id",[appointment])).rows[0].id;
    const task=(await client.query("INSERT INTO patient_tasks(patient_id,clinical_note_id,text) VALUES('p',$1,'Legacy task') RETURNING id",[note])).rows[0].id;
    const objective=(await client.query("INSERT INTO patient_tasks(patient_id,kind,text) VALUES('p','objective','Legacy objective') RETURNING id")).rows[0].id;
    const waitlist=(await client.query("INSERT INTO appointment_waitlist_entries(patient_id,scheduled_date,scheduled_time) VALUES('p',CURRENT_DATE+6,'12:00') RETURNING id")).rows[0].id;
    for(const [type,key] of Object.entries({appointment,note,task,objective,waitlist})){
      const context=await structuralResource(client,id,type,key,undefined,{episodeId:id,subjectPatientId:'p',authorUserId:'a',audience:'professional'});
      assert.equal(context.resource,null);assert.equal(context.membership.subjectIsParticipant,false);
      assert.equal((await structuralResource(client,id,type,'9223372036854775807')).resource,null);
    }
    for(const bad of [null,'0','-1','01','1 OR TRUE','9223372036854775808',9007199254740992]){
      assert.equal((await structuralResource(client,id,'note',bad)).resource,null);
      const context=await structuralResource({query(){assert.fail('Invalid episode key reached PostgreSQL');}},bad,'note',note);
      assert.equal(context.episode,null);assert.equal(context.resource,null);
    }
    assert.equal((await client.query('SELECT episode_id,created_by_user_id FROM patient_clinical_notes WHERE id=$1',[note])).rows[0].episode_id,null);
    assert.equal((await client.query('SELECT episode_id,created_by_user_id FROM patient_tasks WHERE id=$1',[task])).rows[0].created_by_user_id,null);
  });

  await t.test('notes: persisted individual attribution is eligible structurally without audience, writes or operational access',async()=>{
    const {client}=await fresh({target:'009'});
    await client.query("INSERT INTO psychologist_profiles(user_id,approval_status) VALUES('a','active'),('b','active')");
    const first=await preparedEpisode(client),second=await preparedEpisode(client),third=await preparedEpisode(client,{professional:'b',creator:'b'});
    const graph=await participantGraph(client,first);
    const request={token:noteToken('a'),episodeId:first,noteId:graph.note,operation:'read'};
    const before=await noteSnapshot(client);
    assert.deepEqual(await evaluatePrivateNoteRead(noteDatabase(client),request),noteStructural);
    for(const episodeId of [second,third,'9223372036854775807']){
      assert.deepEqual(await evaluatePrivateNoteRead(noteDatabase(client),{...request,episodeId}),noteDenied);
    }
    assert.deepEqual(await evaluatePrivateNoteRead(noteDatabase(client),{...request,token:noteToken('b')}),noteDenied);
    assert.deepEqual(await noteSnapshot(client),before);
    const legacyAppointment=(await client.query("INSERT INTO appointments(patient_id,scheduled_date,scheduled_time,status) VALUES('p',CURRENT_DATE-5,'12:00','completed') RETURNING id")).rows[0].id;
    const legacyNote=(await client.query("INSERT INTO patient_clinical_notes(patient_id,appointment_id,clinical_note_date) VALUES('p',$1,CURRENT_DATE-5) RETURNING id",[legacyAppointment])).rows[0].id;
    const legacyBefore=await noteSnapshot(client);
    assert.deepEqual(await evaluatePrivateNoteRead(noteDatabase(client),{...request,noteId:legacyNote}),noteDenied);
    assert.deepEqual(await noteSnapshot(client),legacyBefore);
    for(const table of ['clinical_record_history','clinical_episode_history','psicopanel_schema_migrations']){
      assert.deepEqual((await noteSnapshot(client))[table],before[table]);
    }
    const context=await structuralResource(client,first,'note',graph.note);
    assert.throws(()=>projectEpisodeResource({...context,...noteStructural},new Proxy({},{
      get(){assert.fail('Eligibility must not read note content, observations, objectives, identifiers, history or derivatives');},
      ownKeys(){assert.fail('Eligibility must not enumerate a row');},
    })),{message:'Forbidden',status:403});
  });
  await t.test('notes: PostgreSQL account, approval and session revalidation overrides signed roles and cached eligibility',async()=>{
    const {client}=await fresh({target:'009'}),id=await preparedEpisode(client),graph=await participantGraph(client,id);
    await client.query("INSERT INTO psychologist_profiles(user_id,approval_status) VALUES('a','active')");
    const request={token:noteToken('a'),episodeId:id,noteId:graph.note,operation:'read'};
    assert.deepEqual(await evaluatePrivateNoteRead(noteDatabase(client),request),noteStructural);
    for(const status of ['suspended','rejected','pending_review']){
      await client.query("UPDATE psychologist_profiles SET approval_status=$1 WHERE user_id='a'",[status]);
      const sv=(await client.query("SELECT session_version FROM users WHERE id='a'")).rows[0].session_version;
      assert.deepEqual(await evaluatePrivateNoteRead(noteDatabase(client),{...request,token:noteToken('a',sv)}),noteDenied);
      await client.query("UPDATE psychologist_profiles SET approval_status='active' WHERE user_id='a'");
      assert.deepEqual(await evaluatePrivateNoteRead(noteDatabase(client),request),noteDenied);
    }
    let sv=(await client.query("SELECT session_version FROM users WHERE id='a'")).rows[0].session_version;
    assert.deepEqual(await evaluatePrivateNoteRead(noteDatabase(client),{...request,token:noteToken('a',sv)}),noteStructural);
    await client.query("UPDATE users SET is_active=FALSE WHERE id='a'");
    sv=(await client.query("SELECT session_version FROM users WHERE id='a'")).rows[0].session_version;
    assert.deepEqual(await evaluatePrivateNoteRead(noteDatabase(client),{...request,token:noteToken('a',sv)}),noteDenied);
    await client.query("UPDATE users SET is_active=TRUE WHERE id='a'");
    for(const [actor,role] of [['extra_support','support'],['extra_superadmin','superadmin']]){
      await client.query("INSERT INTO users(id,first_name,email,password_hash,role) VALUES($1,$1,$2,'synthetic',$3)",[actor,actor+'@notes.invalid',role]);
    }
    for(const actor of ['p','admin','extra_support','extra_superadmin','missing']){
      assert.deepEqual(await evaluatePrivateNoteRead(noteDatabase(client),{...request,token:noteToken(actor)}),noteDenied);
    }
    await client.query("DELETE FROM psychologist_profiles WHERE user_id='a'");
    sv=(await client.query("SELECT session_version FROM users WHERE id='a'")).rows[0].session_version;
    assert.deepEqual(await evaluatePrivateNoteRead(noteDatabase(client),{...request,token:noteToken('a',sv)}),noteDenied);
  });
  await t.test('notes: column privileges enforce locking and metadata-only reads without text or history access',async()=>{
    const {client,name,readerRole}=await fresh({target:'009'}),id=await preparedEpisode(client),graph=await participantGraph(client,id);
    await client.query("INSERT INTO psychologist_profiles(user_id,approval_status) VALUES('a','active')");
    const reader=await connect(name,{user:readerRole,password:'disposable_note_reader'});clients.push(reader);
    const request={token:noteToken('a'),episodeId:id,noteId:graph.note,operation:'read'};
    // EXECUTE coordinates the lock; no users SELECT or UPDATE is granted.
    assert.equal((await client.query("SELECT has_column_privilege($1,'users','session_version','UPDATE') AS allowed",[readerRole])).rows[0].allowed,false);
    await client.query('REVOKE EXECUTE ON FUNCTION public.lock_account_session(text) FROM '+readerRole);
    await assert.rejects(evaluatePrivateNoteRead(noteDatabase(reader),request),e=>e.code==='42501');
    assert.equal((await reader.query('SELECT 1 AS alive')).rows[0].alive,1);
    await client.query('GRANT EXECUTE ON FUNCTION public.lock_account_session(text) TO '+readerRole);
    await client.query('REVOKE SELECT(appointment_id) ON patient_clinical_notes FROM '+readerRole);
    await assert.rejects(evaluatePrivateNoteRead(noteDatabase(reader),request),e=>e.code==='42501');
    await client.query('GRANT SELECT(appointment_id) ON patient_clinical_notes TO '+readerRole);
    const before=await noteSnapshot(client);
    assert.deepEqual(await evaluatePrivateNoteRead(noteDatabase(reader),request),noteStructural);
    assert.deepEqual(await noteSnapshot(client),before);
    for(const sql of ['SELECT content FROM patient_clinical_notes','SELECT clinical_observations FROM patient_clinical_notes','SELECT clinical_note_objective FROM patient_clinical_notes','SELECT previous_record FROM clinical_record_history']){
      await assert.rejects(reader.query(sql),e=>e.code==='42501');
    }
  });
  await t.test('notes: independent user revocations commit before evaluation and invalidate the locked session',async()=>{
    for(const update of ["session_version=session_version+1","is_active=FALSE","password_hash='new-synthetic-hash'"]){
      const {client,name,readerRole}=await fresh({target:'009'}),id=await preparedEpisode(client),graph=await participantGraph(client,id);
      await client.query("INSERT INTO psychologist_profiles(user_id,approval_status) VALUES('a','active')");
      const reader=await connect(name,{user:readerRole,password:'disposable_note_reader'});
      try{
        const pid=(await reader.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        await client.query('BEGIN');
        await client.query("UPDATE users SET "+update+" WHERE id='a'");
        const evaluating=evaluatePrivateNoteRead(noteDatabase(reader),{token:noteToken('a'),episodeId:id,noteId:graph.note,operation:'read'});
        // Attach rejection handling immediately, even if a synchronization assertion fails.
        const checked=evaluating.then(value=>assert.deepEqual(value,noteDenied));checked.catch(()=>{});
        await waitForLock(control,pid);
        await client.query('COMMIT');await checked;
      }finally{await client.query('ROLLBACK');await reader.end();}
    }
  });
  await t.test('notes: profile-first revocations serialize through users without profile lock inversion',async()=>{
    for(const statement of ["UPDATE psychologist_profiles SET approval_status='suspended' WHERE user_id='a'","DELETE FROM psychologist_profiles WHERE user_id='a'"]){
      const {client,name,readerRole}=await fresh({target:'009'}),id=await preparedEpisode(client),graph=await participantGraph(client,id);
      await client.query("INSERT INTO psychologist_profiles(user_id,approval_status) VALUES('a','active')");
      const reader=await connect(name,{user:readerRole,password:'disposable_note_reader'});
      try{
        await client.query('BEGIN');await client.query(statement);
        const pid=(await reader.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        const checked=evaluatePrivateNoteRead(noteDatabase(reader),{token:noteToken('a'),episodeId:id,noteId:graph.note,operation:'read'}).then(value=>assert.deepEqual(value,noteDenied));checked.catch(()=>{});
        await waitForLock(control,pid);await client.query('COMMIT');await checked;
      }finally{await client.query('ROLLBACK');await reader.end();}
    }
  });
  await t.test('notes: evaluator-first blocks profile trigger revocation until diagnostic transaction ends',async()=>{
    const {client,name,readerRole}=await fresh({target:'009'}),id=await preparedEpisode(client),graph=await participantGraph(client,id);
    await client.query("INSERT INTO psychologist_profiles(user_id,approval_status) VALUES('a','active')");
    const writer=await connect(name);
    const reader=await connect(name,{user:readerRole,password:'disposable_note_reader'});
    let unlock;const gate=new Promise(resolve=>{unlock=resolve;});
    let locked;const acquired=new Promise(resolve=>{locked=resolve;});
    const request={token:noteToken('a'),episodeId:id,noteId:graph.note,operation:'read'};
    const database=noteDatabase(reader,async sql=>{
      if(sql.includes('FROM public.lock_account_session')){locked();await gate;}
    });
    const evaluating=evaluatePrivateNoteRead(database,request);evaluating.catch(()=>{});
    let revoking;
    try{
      await Promise.race([acquired,evaluating.then(()=>assert.fail('Evaluation ended before account lock'))]);
      const pid=(await writer.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      revoking=writer.query("UPDATE psychologist_profiles SET approval_status='suspended' WHERE user_id='a'");revoking.catch(()=>{});
      await waitForLock(control,pid);
      unlock();
      // Plain MVCC profile read sees active while trigger is blocked on users.
      // It never waits for the writer's profile lock and no content is read.
      assert.deepEqual(await evaluating,noteStructural);await revoking;
      assert.deepEqual(await evaluatePrivateNoteRead(noteDatabase(client),request),noteDenied);
      assert.equal((await client.query("SELECT session_version FROM users WHERE id='a'")).rows[0].session_version,1);
    }finally{unlock();await Promise.allSettled([evaluating,revoking]);await writer.end();await reader.end();}
  });

  // Previous cases are complete; release their per-database clients before
  // expanding the security matrix. Never increase the cluster connection limit.
  await Promise.all(clients.splice(0).map(client=>client.end()));

  await t.test('009: historical 003-008 fingerprints remain byte-compatible with the frozen main algorithm',async subtest=>{
    const start=clients.length;
    subtest.after(async()=>{await Promise.all(clients.splice(start).map(client=>client.end()));});
    for(const target of ['003','004','005','006','007','008']){
      const {client,name}=await fresh({target,identities:false});
      assert.equal(await catalogChecksum(client),await historicalChecksum(client));
      assert.equal((await migrate(client,{expectedDatabase:name,target})).status,'already-applied');
    }
  });
  await t.test('009: new full-chain install and empty 008 upgrade preserve ledger and replay without downgrade',async subtest=>{
    const start=clients.length;
    subtest.after(async()=>{await Promise.all(clients.splice(start).map(client=>client.end()));});
    for(const upgrade of [false,true]){
      let client,name,readerRole,before=[];
      if(upgrade){
        ({client,name}=await fresh({identities:false}));
        before=(await client.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows;
        readerRole='upgrade_reader_'+randomUUID().replaceAll('-','');
        await client.query('CREATE ROLE '+readerRole+" LOGIN NOINHERIT PASSWORD 'disposable_note_reader'");
        await migrate(client,{expectedDatabase:name,target:'009',accountReaderRole:readerRole});
      }else ({client,name,readerRole}=await fresh({target:'009',identities:false}));
      const ledger=(await client.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows;
      assert.equal(ledger.length,9);
      if(upgrade)assert.deepEqual(ledger.slice(0,8),before);
      assert.equal(ledger.at(-1).catalog_sha256,await catalogChecksum(client));
      assert.notEqual(await catalogChecksum(client),await historicalChecksum(client));
      await participantIdentities(client);await preparedEpisode(client);
      assert.equal((await migrate(client,{expectedDatabase:name,target:'009',accountReaderRole:readerRole})).status,'already-applied');
      assert.deepEqual((await client.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows,ledger);
      await assert.rejects(migrate(client,{expectedDatabase:name,target:'008'}),/downgrade/);
    }
  });
  await t.test('009: unsafe provisioning roles and populated destinations are refused without adoption',async subtest=>{
    const start=clients.length;
    subtest.after(async()=>{await Promise.all(clients.splice(start).map(client=>client.end()));});
    for(const mode of ['missing','superuser','inherit','membership','ownership','column-grant','populated']){
      const {client,name}=await fresh({identities:mode==='populated'});
      const role='unsafe_reader_'+randomUUID().replaceAll('-','');
      if(mode!=='missing'){
        await client.query('CREATE ROLE '+role+' LOGIN NOINHERIT');
        if(mode==='superuser')await client.query('ALTER ROLE '+role+' SUPERUSER');
        if(mode==='inherit')await client.query('ALTER ROLE '+role+' INHERIT');
        if(mode==='membership')await client.query('GRANT pg_read_all_data TO '+role);
        if(mode==='ownership')await client.query('ALTER TABLE users OWNER TO '+role);
        if(mode==='column-grant')await client.query('GRANT UPDATE(session_version) ON users TO '+role);
      }
      const before=await catalogChecksum(client),ledger=(await client.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows;
      await assert.rejects(migrate(client,{expectedDatabase:name,target:'009',accountReaderRole:mode==='missing'?undefined:role}),/009 requires|Schema drift/);
      assert.equal(await catalogChecksum(client),before);
      assert.deepEqual((await client.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows,ledger);
      assert.equal((await client.query("SELECT to_regprocedure('public.lock_account_session(text)') AS f")).rows[0].f,null);
    }
  });
  await t.test('009: function owner ACL column grants and role membership drift reject replay without repairs',async subtest=>{
    const start=clients.length;
    subtest.after(async()=>{await Promise.all(clients.splice(start).map(client=>client.end()));});
    const mutations=[
      ()=>'ALTER FUNCTION public.lock_account_session(text) SECURITY INVOKER',
      ()=>"ALTER FUNCTION public.lock_account_session(text) SET search_path=public,pg_temp",
      ()=>"CREATE OR REPLACE FUNCTION public.lock_account_session(account_id text) RETURNS TABLE(id text,role text,is_active boolean,session_version integer) LANGUAGE sql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$ SELECT u.id,u.role,u.is_active,u.session_version FROM public.users u FOR SHARE $$",
      ()=>'ALTER FUNCTION public.lock_account_session(text) OWNER TO integrity_test',
      ()=>'GRANT EXECUTE ON FUNCTION public.lock_account_session(text) TO PUBLIC',
      ({readerRole})=>'REVOKE EXECUTE ON FUNCTION public.lock_account_session(text) FROM '+readerRole,
      ({readerRole})=>'GRANT EXECUTE ON FUNCTION public.lock_account_session(text) TO '+readerRole+' WITH GRANT OPTION',
      ({readerRole})=>'GRANT UPDATE(session_version) ON users TO '+readerRole,
      ({readerRole})=>'GRANT SELECT(password_hash) ON users TO '+readerRole,
      ({readerRole})=>'ALTER ROLE '+readerRole+' SUPERUSER',
      ({readerRole})=>'GRANT pg_write_all_data TO '+readerRole+' WITH INHERIT TRUE, SET TRUE',
      ({owner})=>'ALTER ROLE '+owner+' LOGIN',
      ({owner})=>'ALTER ROLE '+owner+' CREATEDB',
      ({owner})=>'ALTER ROLE '+owner+' CREATEROLE',
      ({owner})=>'ALTER ROLE '+owner+' BYPASSRLS',
      ({owner})=>'ALTER ROLE '+owner+' REPLICATION',
      ({owner})=>'GRANT pg_read_all_data TO '+owner,
      ({owner})=>'GRANT '+owner+' TO integrity_test',
      ({owner})=>'GRANT UPDATE(password_hash) ON users TO '+owner,
      ()=> 'DROP FUNCTION public.lock_account_session(text)',
    ];
    for(const mutation of mutations){
      const state=await fresh({target:'009',identities:false});
      const {client,name}=state;
      state.owner=(await client.query("SELECT pg_get_userbyid(proowner) AS owner FROM pg_proc WHERE oid='public.lock_account_session(text)'::regprocedure")).rows[0].owner;
      await client.query(mutation(state));
      const before=await catalogChecksum(client),ledger=(await client.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows;
      await assert.rejects(migrate(client,{expectedDatabase:name,target:'009'}),/drift|incompatible/);
      assert.equal(await catalogChecksum(client),before);
      assert.deepEqual((await client.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows,ledger);
    }
  });
  await t.test('009: incompatible ledger and source checksum fail closed without adopting a historical fingerprint',async subtest=>{
    const start=clients.length;
    subtest.after(async()=>{await Promise.all(clients.splice(start).map(client=>client.end()));});
    for(const tamper of ['catalog','source','incomplete']){
      const {client,name}=await fresh({target:'009',identities:false});
      if(tamper==='catalog')await client.query("UPDATE psicopanel_schema_migrations SET catalog_sha256=$1 WHERE version='009'",[await historicalChecksum(client)]);
      if(tamper==='source')await client.query("UPDATE psicopanel_schema_migrations SET file_sha256='invalid' WHERE version='009'");
      if(tamper==='incomplete')await client.query("DELETE FROM psicopanel_schema_migrations WHERE version='008'");
      const before=(await client.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows;
      await assert.rejects(migrate(client,{expectedDatabase:name,target:'009'}),/drift|checksum|incomplete/);
      assert.deepEqual((await client.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows,before);
    }
    const dir=await fs.mkdtemp(os.tmpdir()+'/psicopanel-009-checksum-');
    try{
      for(const file of await fs.readdir(new URL('../sql/migrations/',import.meta.url)))await fs.copyFile(new URL('../sql/migrations/'+file,import.meta.url),dir+'/'+file);
      await fs.appendFile(dir+'/009_minimal_account_lock.sql','\n-- tamper\n');
      await assert.rejects(loadMigrations(new URL('file://'+dir+'/')),/checksum/);
    }finally{await fs.rm(dir,{recursive:true,force:true});}
  });
  await t.test('009: late DDL failure rolls back full installation objects grants owner and ledger then retries',async subtest=>{
    const start=clients.length;
    subtest.after(async()=>{await Promise.all(clients.splice(start).map(client=>client.end()));});
    const {client,name}=await fresh({target:'007',identities:false,beforeMigration:async c=>{
      await c.query(`CREATE FUNCTION fail_account_lock_install() RETURNS event_trigger LANGUAGE plpgsql AS $$
        BEGIN IF current_setting('test.fail009',true)='on' AND to_regprocedure('public.lock_account_session(text)') IS NOT NULL AND has_column_privilege(current_setting('psicopanel.account_reader'),'public.patient_clinical_notes','appointment_id','SELECT') THEN RAISE EXCEPTION 'synthetic late 009 DDL failure'; END IF; END $$;
        CREATE EVENT TRIGGER fail_account_lock_install ON ddl_command_end EXECUTE FUNCTION fail_account_lock_install()`);
    }});
    const role='rollback_reader_'+randomUUID().replaceAll('-','');
    await client.query('CREATE ROLE '+role+' LOGIN NOINHERIT');
    const oid=(await client.query('SELECT oid FROM pg_database WHERE datname=current_database()')).rows[0].oid;
    const before=await catalogChecksum(client),ledger=(await client.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows;
    await client.query("SET test.fail009='on'");
    await assert.rejects(migrate(client,{expectedDatabase:name,target:'009',accountReaderRole:role}),/synthetic late 009 DDL failure/);
    assert.equal(await catalogChecksum(client),before);
    assert.deepEqual((await client.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows,ledger);
    assert.equal((await client.query('SELECT FROM pg_roles WHERE rolname=ANY($1::text[])',[[`psicopanel_account_lock_owner_${oid}`,`psicopanel_cep_owner_${oid}`]])).rowCount,0);
    assert.equal((await client.query("SELECT has_function_privilege($1,'public.materialize_episode_participants()','EXECUTE')",[role]).catch(e=>({code:e.code}))).code,'42883');
    await client.query("SET test.fail009='off'");
    await migrate(client,{expectedDatabase:name,target:'009',accountReaderRole:role});
  });
  await t.test('009: concurrent migrations on a new destination serialize one installation and one verified replay',async subtest=>{
    const start=clients.length;
    subtest.after(async()=>{await Promise.all(clients.splice(start).map(client=>client.end()));});
    const {client,name}=await fresh({target:null,identities:false});
    const role='concurrent_reader_'+randomUUID().replaceAll('-','');
    await client.query('CREATE ROLE '+role+' LOGIN NOINHERIT');
    const other=await connect(name);
    try{
      const options={expectedDatabase:name,target:'009',accountReaderRole:role};
      const results=await Promise.all([migrate(client,options),migrate(other,options)]);
      assert.deepEqual(results.map(r=>r.status).sort(),['already-applied','applied']);
      assert.equal((await client.query('SELECT count(*)::int AS n FROM psicopanel_schema_migrations')).rows[0].n,9);
    }finally{await other.end();}
  });
  await t.test('009: restricted LOGIN can lock but cannot abuse session versions sensitive fields ownership or other definers',async subtest=>{
    const start=clients.length;
    subtest.after(async()=>{await Promise.all(clients.splice(start).map(client=>client.end()));});
    const {client,name,readerRole}=await fresh({target:'009'});
    const owner=(await client.query("SELECT pg_get_userbyid(proowner) AS owner FROM pg_proc WHERE oid='public.lock_account_session(text)'::regprocedure")).rows[0].owner;
    const reader=await connect(name,{user:readerRole,password:'disposable_note_reader'});
    try{
      const before=await noteSnapshot(client);
      const rows=(await reader.query("SELECT id,role,is_active,session_version FROM public.lock_account_session($1::text)",['a'])).rows;
      assert.deepEqual(rows,[{id:'a',role:'psychologist',is_active:true,session_version:0}]);
      for(const id of [null,'missing',"a' OR '1'='1"]){
        assert.equal((await reader.query('SELECT id FROM public.lock_account_session($1::text)',[id])).rowCount,0);
      }
      for(const sql of [
        "UPDATE users SET session_version=2147483647 WHERE id='a'",
        "UPDATE users SET session_version=session_version+1 WHERE id='a'",
        "UPDATE users SET session_version=0 WHERE id='a'",
        "UPDATE users SET session_version=-1 WHERE id='a'",
        "UPDATE users SET password_hash='tampered' WHERE id='a'",
        "UPDATE users SET is_active=FALSE WHERE id='a'",
        "UPDATE users SET role='superadmin' WHERE id='a'",
        'SELECT password_hash FROM users',
        'SELECT session_version FROM users',
        'ALTER TABLE users OWNER TO '+readerRole,
        'ALTER FUNCTION public.lock_account_session(text) OWNER TO '+readerRole,
        "CREATE OR REPLACE FUNCTION public.lock_account_session(account_id text) RETURNS TABLE(id text,role text,is_active boolean,session_version integer) LANGUAGE sql AS $$ SELECT 'x','x',true,0 $$",
        'SET ROLE '+owner,
        'SET SESSION AUTHORIZATION '+owner,
        'GRANT '+owner+' TO '+readerRole,
        'SELECT public.materialize_episode_participants()',
        'SELECT public.check_episode_participant()',
      ])await assert.rejects(reader.query(sql),e=>e.code==='42501',sql);
      for(let n=0;n<3;n++)await assert.rejects(reader.query("UPDATE users SET session_version=session_version+1 WHERE id='a'"),e=>e.code==='42501');
      for(const sql of ["SELECT password_hash FROM public.lock_account_session('a')","SELECT id FROM public.lock_account_session('a','password_hash')"]){
        await assert.rejects(reader.query(sql),e=>['42703','42883'].includes(e.code));
      }
      const effective=(await client.query(`SELECT has_column_privilege($1,'users','session_version','UPDATE') AS direct_update,
        has_any_column_privilege($1,'users','UPDATE') AS any_update,pg_has_role($1,$2,'MEMBER') AS member,
        EXISTS(SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid='public.lock_account_session(text)'::regprocedure AND a.grantee=0) AS public_execute`,[readerRole,owner])).rows[0];
      assert.deepEqual(effective,{direct_update:false,any_update:false,member:false,public_execute:false});
      assert.deepEqual(await noteSnapshot(client),before);
      await reader.query("CREATE TEMP TABLE users(id text,role text,is_active boolean,session_version integer); INSERT INTO users VALUES('a','superadmin',false,2147483647); SET search_path=pg_temp,public");
      assert.deepEqual((await reader.query("SELECT id,role,is_active,session_version FROM public.lock_account_session('a')")).rows,rows);
    }finally{await reader.end();}
  });
  await t.test('009: unrelated and administrative LOGIN roles lack EXECUTE and cannot assume the restricted owner',async subtest=>{
    const start=clients.length;
    subtest.after(async()=>{await Promise.all(clients.splice(start).map(client=>client.end()));});
    const {client,name}=await fresh({target:'009'});
    const owner=(await client.query("SELECT pg_get_userbyid(proowner) AS owner FROM pg_proc WHERE oid='public.lock_account_session(text)'::regprocedure")).rows[0].owner;
    for(const prefix of ['unrelated','administrative']){
      const role=prefix+'_'+randomUUID().replaceAll('-','');
      await client.query('CREATE ROLE '+role+" LOGIN NOINHERIT PASSWORD 'disposable_note_reader'");
      const reader=await connect(name,{user:role,password:'disposable_note_reader'});
      try{
        assert.equal((await reader.query("SELECT has_function_privilege(current_user,'public.lock_account_session(text)','EXECUTE') AS allowed")).rows[0].allowed,false);
        await assert.rejects(reader.query("SELECT id FROM public.lock_account_session('a')"),e=>e.code==='42501');
        await assert.rejects(reader.query('SET ROLE '+owner),e=>e.code==='42501');
      }finally{await reader.end();}
    }
    await assert.rejects(connect(name,{user:owner,password:'disposable_note_reader'}),e=>['28000','28P01'].includes(e.code));
  });
  await t.test('009: function-returned lock survives until caller COMMIT or ROLLBACK with independent blockers',async subtest=>{
    const start=clients.length;
    subtest.after(async()=>{await Promise.all(clients.splice(start).map(client=>client.end()));});
    for(const end of ['COMMIT','ROLLBACK']){
      const {client,name,readerRole}=await fresh({target:'009'});
      const reader=await connect(name,{user:readerRole,password:'disposable_note_reader'}),writer=await connect(name);
      let updating;
      try{
        const pid=(await writer.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        const readerPid=(await reader.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        await reader.query('BEGIN ISOLATION LEVEL READ COMMITTED');
        await reader.query("SELECT id FROM public.lock_account_session('a')");
        // Function has returned. Only its caller's transaction is still open.
        updating=writer.query("UPDATE users SET session_version=session_version+1 WHERE id='a'");updating.catch(()=>{});
        await waitForLock(control,pid,readerPid);
        assert.equal((await client.query("SELECT session_version FROM users WHERE id='a'")).rows[0].session_version,0);
        await reader.query(end);await updating;
        assert.equal((await client.query("SELECT session_version FROM users WHERE id='a'")).rows[0].session_version,1);
      }finally{await reader.query('ROLLBACK');await Promise.allSettled([updating]);await reader.end();await writer.end();}
    }
  });
  await t.test('009: evaluator-first blocks password inactivity version and profile DELETE until protected transaction ends',async subtest=>{
    const start=clients.length;
    subtest.after(async()=>{await Promise.all(clients.splice(start).map(client=>client.end()));});
    for(const statement of ["UPDATE users SET password_hash='new-hash' WHERE id='a'","UPDATE users SET is_active=FALSE WHERE id='a'","UPDATE users SET session_version=session_version+1 WHERE id='a'","DELETE FROM psychologist_profiles WHERE user_id='a'"]){
      const {client,name,readerRole}=await fresh({target:'009'}),id=await preparedEpisode(client),graph=await participantGraph(client,id);
      await client.query("INSERT INTO psychologist_profiles(user_id,approval_status) VALUES('a','active')");
      const reader=await connect(name,{user:readerRole,password:'disposable_note_reader'}),writer=await connect(name);
      let unlock,locked,revoking;
      const gate=new Promise(r=>{unlock=r;}),acquired=new Promise(r=>{locked=r;});
      const request={token:noteToken('a'),episodeId:id,noteId:graph.note,operation:'read'};
      const evaluating=evaluatePrivateNoteRead(noteDatabase(reader,async sql=>{if(sql.includes('FROM public.lock_account_session')){locked();await gate;}}),request);evaluating.catch(()=>{});
      try{
        await Promise.race([acquired,evaluating.then(()=>assert.fail('No account lock acquired'))]);
        const pid=(await writer.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        const readerPid=(await reader.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        revoking=writer.query(statement);revoking.catch(()=>{});
        await waitForLock(control,pid,readerPid);unlock();
        assert.deepEqual(await evaluating,noteStructural);await revoking;
        assert.deepEqual(await evaluatePrivateNoteRead(noteDatabase(reader),request),noteDenied);
      }finally{unlock();await Promise.allSettled([evaluating,revoking]);await reader.end();await writer.end();}
    }
  });
  await t.test('009: revoker ROLLBACK restores current-session evaluation after a verified lock wait',async subtest=>{
    const start=clients.length;
    subtest.after(async()=>{await Promise.all(clients.splice(start).map(client=>client.end()));});
    const {client,name,readerRole}=await fresh({target:'009'}),id=await preparedEpisode(client),graph=await participantGraph(client,id);
    await client.query("INSERT INTO psychologist_profiles(user_id,approval_status) VALUES('a','active')");
    const reader=await connect(name,{user:readerRole,password:'disposable_note_reader'});
    let checked;
    try{
      await client.query('BEGIN');await client.query("UPDATE users SET session_version=session_version+1 WHERE id='a'");
      const pid=(await reader.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      checked=evaluatePrivateNoteRead(noteDatabase(reader),{token:noteToken('a'),episodeId:id,noteId:graph.note,operation:'read'});checked.catch(()=>{});
      await waitForLock(control,pid);await client.query('ROLLBACK');
      assert.deepEqual(await checked,noteStructural);
      assert.equal((await client.query("SELECT session_version FROM users WHERE id='a'")).rows[0].session_version,0);
    }finally{await client.query('ROLLBACK');await Promise.allSettled([checked]);await reader.end();}
  });
  await t.test('009: lock timeout cancellation and post-lock errors rollback release and leave connections reusable',async subtest=>{
    const start=clients.length;
    subtest.after(async()=>{await Promise.all(clients.splice(start).map(client=>client.end()));});
    for(const mode of ['timeout','cancel','after-lock']){
      const {client,name,readerRole}=await fresh({target:'009'}),id=await preparedEpisode(client),graph=await participantGraph(client,id);
      await client.query("INSERT INTO psychologist_profiles(user_id,approval_status) VALUES('a','active')");
      const reader=await connect(name,{user:readerRole,password:'disposable_note_reader'});
      const pid=(await reader.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      let released=false,pending;
      const database={async getClient(){return {async query(sql,params){const result=await reader.query(sql,params);if(mode==='after-lock' && sql.includes('FROM public.lock_account_session'))throw Object.assign(new Error('Synthetic interruption after function return'),{code:'57014'});return result;},release(){released=true;}};}};
      const request={token:noteToken('a'),episodeId:id,noteId:graph.note,operation:'read'};
      try{
        if(mode!=='after-lock'){
          await client.query('BEGIN');await client.query("UPDATE users SET session_version=session_version+1 WHERE id='a'");
          if(mode==='timeout')await reader.query("SET lock_timeout='750ms'");
        }
        pending=evaluatePrivateNoteRead(database,request);pending.catch(()=>{});
        if(mode!=='after-lock'){
          await waitForLock(control,pid);
          if(mode==='cancel')assert.equal((await control.query('SELECT pg_cancel_backend($1) AS cancelled',[pid])).rows[0].cancelled,true);
        }
        await assert.rejects(pending,e=>e.code===(mode==='timeout'?'55P03':'57014'));
        assert.equal(released,true);
        assert.equal((await reader.query('SELECT 1 AS alive')).rows[0].alive,1);
        assert.equal((await control.query('SELECT state FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0].state,'idle');
        await client.query('ROLLBACK');
        await client.query("SET lock_timeout='1s'");
        await client.query("UPDATE users SET session_version=session_version+1 WHERE id='a'");
      }finally{await client.query('ROLLBACK');await Promise.allSettled([pending]);await reader.end();}
    }
  });
}
