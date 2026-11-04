import assert from 'node:assert/strict';
import pg from 'pg';
import {spawnSync} from 'node:child_process';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import env from '../src/config/env.js';
import { loadMigrations,migrate,catalogChecksum } from '../scripts/episode-migration.js';
import { verifyOriginResolverContract } from '../scripts/note-origin-resolver-contract.js';
import { createSandboxDatabase,installBaseline } from '../scripts/episode-sandbox.js';
import { participantIdentities,preparedEpisode,participantGraph } from '../scripts/episode-participants-fixture.js';
import { resolvePrivateNoteOrigin } from '../src/modules/episodes/episode.note-origin.js';
import { resolveEpisodeContext } from '../src/modules/episodes/episode.context.js';
import { evaluatePrivateNoteRead } from '../src/modules/episodes/episode.note-read.js';
import { authorizeEpisodeOperation,episodeOperations } from '../src/modules/episodes/episode.policy.js';
import { projectEpisodeResource } from '../src/modules/episodes/episode.projections.js';

import { catalogChecksum as historical010 } from './fixtures/catalog-checksum-003-010.js';
const ledger = async c => (await c.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows;
const signature = 'public.recognize_private_note_origin_v1(bigint,bigint,text,text)';
export async function runOriginResolverCases(t,control) {
  const fresh = async (subtest,target='011') => {
    const name='psicopanel_episode_'+randomUUID().replaceAll('-','');
    const client=await createSandboxDatabase(control,name);subtest.after(()=>client.end());await installBaseline(client);
    const reader='resolver_reader_'+randomUUID().replaceAll('-',''),creator='resolver_creator_'+randomUUID().replaceAll('-','');
    for(const role of [reader,creator])await client.query('CREATE ROLE '+role+" LOGIN NOINHERIT PASSWORD 'disposable_resolver'");
    const options={expectedDatabase:name,target,accountReaderRole:reader,...(target>='010'?{privateNoteCreatorRole:creator}:{})};
    await migrate(client,options);await participantIdentities(client);
    const owner='psicopanel_origin_resolver_owner_'+(await client.query('SELECT oid FROM pg_database WHERE datname=current_database()')).rows[0].oid;
    const login=async role=>{const c=new pg.Client({host:'db',database:name,user:role,password:'disposable_resolver'});await c.connect();subtest.after(()=>c.end());return c;};
    return {client,name,reader,creator,options,owner,login};
  };
  const make = async (s,episode,{patient='p',author='a',days=3}={}) => {
    const appt=(await s.client.query(`INSERT INTO appointments(episode_id,patient_id,created_by_user_id,scheduled_date,scheduled_time,status)
      VALUES($1,$2,$3,CURRENT_DATE-$4::int,'09:00','completed') RETURNING id`,[episode,patient,author,days])).rows[0].id;
    const c=await s.login(s.creator);
    return (await c.query('SELECT public.create_private_clinical_note_v1($1,$2,$3,$4,$5) AS id',
      [episode,patient,author,appt,'Fictional confidential original'])).rows[0].id;
  };
  const tuple=(note,episode,patient='p',author='a')=>({noteId:note,episodeId:episode,subjectPatientId:patient,authorUserId:author});
  const verify=async s=>verifyOriginResolverContract(s.client,(await loadMigrations())[10],s.reader);
  await t.test('011: fresh install exact restricted LOGIN evidence replay and downgrade denial',async st=>{
    const s=await fresh(st),e=await preparedEpisode(s.client),n=await make(s,e),c=await s.login(s.reader);
    const before=await ledger(s.client);assert.equal(before.length,11);await verify(s);
    const evidence=await resolvePrivateNoteOrigin(c,tuple(n,e));
    assert.deepEqual(evidence,{origin:'professional_private',contractVersion:1,registrationKind:'professional_original',originVerified:true,audienceVerified:false,allowed:false});
    assert.equal(before.at(-1).catalog_sha256,await catalogChecksum(s.client));
    assert.equal((await migrate(s.client,s.options)).status,'already-applied');
    const cli=spawnSync(process.execPath,['scripts/migrate.js','--target=011','--database='+s.name],{encoding:'utf8',env:{...process.env,MIGRATION_DATABASE_URL:'postgres://integrity_test:disposable_test_password@db/'+s.name}});
    assert.equal(cli.status,0,cli.stderr);assert.equal(JSON.parse(cli.stdout).version,'011');
    await assert.rejects(migrate(s.client,{...s.options,target:'010'}),/downgrade/);assert.deepEqual(await ledger(s.client),before);
  });
  await t.test('011: upgrade preserves historical ledger bytes rows and unknown legacy without backfill',async st=>{
    const s=await fresh(st,'009'),e=await preparedEpisode(s.client);
    const prior=await participantGraph(s.client,e);
    await migrate(s.client,{...s.options,target:'010',privateNoteCreatorRole:s.creator});
    assert.equal(await catalogChecksum(s.client),await historical010(s.client));
    const e2=await preparedEpisode(s.client),n=await make(s,e2,{days:4});
    const a=(await s.client.query("INSERT INTO appointments(patient_id,scheduled_date,scheduled_time,status) VALUES('p',CURRENT_DATE-5,'10:00','completed') RETURNING id")).rows[0].id;
    const old=(await s.client.query("INSERT INTO patient_clinical_notes(patient_id,appointment_id,clinical_note_date) VALUES('p',$1,CURRENT_DATE-5) RETURNING id",[a])).rows[0].id;
    const before=await ledger(s.client),notes=(await s.client.query('SELECT * FROM patient_clinical_notes ORDER BY id')).rows;
    await migrate(s.client,{...s.options,target:'011'});assert.deepEqual((await ledger(s.client)).slice(0,10),before);
    assert.deepEqual((await s.client.query('SELECT * FROM patient_clinical_notes ORDER BY id')).rows,notes);
    const c=await s.login(s.reader);assert.equal((await resolvePrivateNoteOrigin(c,tuple(n,e2))).originVerified,true);
    assert.equal((await resolvePrivateNoteOrigin(c,tuple(prior.note,e))).originVerified,false);
    assert.equal((await resolvePrivateNoteOrigin(c,tuple(old,e))).originVerified,false);
  });
  await t.test('011: parallel episodes other authors and couple A B remain exact and clinically denied',async st=>{
    const s=await fresh(st),c=await s.login(s.reader);
    const episodes=[await preparedEpisode(s.client),await preparedEpisode(s.client),await preparedEpisode(s.client,{professional:'b'}),await preparedEpisode(s.client,{two:'q'})];
    const tuples=[];
    for(const [i,e] of episodes.entries()) {
      const author=i===2?'b':'a';tuples.push(tuple(await make(s,e,{author,days:3+i}),e,'p',author));
      if(i===3)tuples.push(tuple(await make(s,e,{patient:'q',days:7}),e,'q','a'));
    }
    for(const input of tuples) {
      assert.equal((await resolvePrivateNoteOrigin(c,input)).originVerified,true);
      for(const change of [{episodeId:'9223372036854775807'},{subjectPatientId:input.subjectPatientId==='p'?'q':'p'},{authorUserId:input.authorUserId==='a'?'b':'a'},
        ...episodes.filter(e=>e!==input.episodeId).map(e=>({episodeId:e}))]) {
        assert.equal((await resolvePrivateNoteOrigin(c,{...input,...change})).originVerified,false);
      }
      const context=await resolveEpisodeContext(c,{actor:{id:input.authorUserId,role:'psychologist',isActive:true,psychologistStatus:'active'},episodeId:input.episodeId,operation:'read',resource:{type:'note',id:input.noteId}});
      assert.equal(context.resource.audienceVerified,false);assert.equal(context.resource.audience,null);
      for(const operation of episodeOperations)assert.deepEqual(authorizeEpisodeOperation({...context,operation}),{allowed:false});
      assert.throws(()=>projectEpisodeResource(context),{status:403});
    }
  });
  await t.test('011: real sessions revoked suspended patients and backoffice never expose evidence or clinical projections',async st=>{
    const s=await fresh(st),e=await preparedEpisode(s.client),n=await make(s,e),c=await s.login(s.reader);
    const database={async getClient(){return {query:(...args)=>c.query(...args),release(){}};}};
    await s.client.query("INSERT INTO psychologist_profiles(user_id,approval_status) VALUES('a','active'),('b','active')");
    for(const role of ['support','superadmin'])await s.client.query("INSERT INTO users(id,first_name,email,password_hash,role) VALUES($1,$1,$2,'fictional',$1)",[role,role+'@resolver.invalid']);
    for(const sub of ['a','b','p','support','admin','superadmin']) {
      const token=jwt.sign({sub,sv:0,role:'psychologist'},env.jwtSecret,{expiresIn:'1h'});
      const result=await evaluatePrivateNoteRead(database,{token,episodeId:e,noteId:n,operation:'read'});
      assert.equal(result.allowed,false);assert.equal(result.eligible,false);assert.doesNotMatch(JSON.stringify(result),/professional_private|Fictional|noteId|author/);
    }
    await s.client.query("UPDATE users SET session_version=session_version+1 WHERE id='a'");
    const token=jwt.sign({sub:'a',sv:0},env.jwtSecret,{expiresIn:'1h'});
    assert.equal((await evaluatePrivateNoteRead(database,{token,episodeId:e,noteId:n,operation:'read'})).structurallyEligible,false);
    await s.client.query("UPDATE users SET is_active=false WHERE id='a'");
    assert.equal((await evaluatePrivateNoteRead(database,{token:jwt.sign({sub:'a',sv:1},env.jwtSecret),episodeId:e,noteId:n,operation:'read'})).allowed,false);
  });
  await t.test('011: actual ACL PUBLIC SET ROLE and owner boundaries deny text history origins and enumeration',async st=>{
    const s=await fresh(st),c=await s.login(s.reader),creator=await s.login(s.creator);
    for(const sql of ['SELECT * FROM clinical_note_private_origins','SELECT content FROM patient_clinical_notes','SELECT * FROM clinical_record_history',
      'SELECT clinical_note_date FROM patient_clinical_notes','SET ROLE '+s.owner,
      'ALTER FUNCTION '+signature+' SECURITY INVOKER'])await assert.rejects(c.query(sql),{code:'42501'});
    await assert.rejects(creator.query('SELECT '+signature.replace('(bigint,bigint,text,text)',"(1,1,'p','a')")),{code:'42501'});
    assert.equal((await s.client.query('SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid=to_regprocedure($1) AND a.grantee=0',[signature])).rowCount,0);
    assert.equal((await s.client.query("SELECT has_table_privilege($1,'clinical_note_private_origins','SELECT') AS yes",[s.reader])).rows[0].yes,false);
    await s.client.query('SET ROLE '+s.owner);
    for(const sql of ['SELECT content FROM patient_clinical_notes','SELECT * FROM clinical_record_history','SELECT registered_at FROM clinical_note_private_origins'])await assert.rejects(s.client.query(sql),{code:'42501'});
    await s.client.query('RESET ROLE');await verify(s);
    await c.query('CREATE TEMP TABLE clinical_note_private_origins(note_id bigint)');
    await c.query("SET search_path=pg_temp,public");
    assert.equal((await resolvePrivateNoteOrigin(c,tuple('9223372036854775807','9223372036854775807'))).originVerified,false);
  });
  await t.test('011: missing crossed invalid and duplicate provenance cannot become recognized evidence',async st=>{
    const s=await fresh(st),e=await preparedEpisode(s.client),n=await make(s,e),c=await s.login(s.reader),input=tuple(n,e);
    // Only privileged fault injection in this disposable database can bypass 010.
    // No runtime path repairs or accepts any malformed constance.
    await s.client.query('ALTER TABLE clinical_note_private_origins DISABLE TRIGGER USER');
    await s.client.query('BEGIN');await s.client.query('DELETE FROM clinical_note_private_origins WHERE note_id=$1',[n]);
    assert.equal((await resolvePrivateNoteOrigin(s.client,input)).originVerified,false);await s.client.query('ROLLBACK');
    await assert.rejects(s.client.query(`INSERT INTO clinical_note_private_origins SELECT * FROM clinical_note_private_origins WHERE note_id=$1`,[n]),{code:'23505'});
    for(const [field,value] of [['contract_version',2],['registration_kind','shared'],['author_user_id','b'],['subject_patient_id','q'],['episode_id','9223372036854775807']]) {
      await assert.rejects(s.client.query('UPDATE clinical_note_private_origins SET '+field+'=$1 WHERE note_id=$2',[value,n]));
    }
    await s.client.query('ALTER TABLE clinical_note_private_origins ENABLE TRIGGER USER');
    // Independently corrupt this fixture as administrator, then evaluate with
    // SET LOCAL ROLE reader. Rollback restores constraints and rows each time.
    for(const mutation of [
      "UPDATE clinical_note_private_origins SET contract_version=2",
      "UPDATE clinical_note_private_origins SET registration_kind='shared'",
      "UPDATE clinical_note_private_origins SET registered_by_user_id='b'",
      "UPDATE clinical_note_private_origins SET author_user_id='b'",
      "UPDATE clinical_note_private_origins SET subject_patient_id='q'",
      "UPDATE clinical_note_private_origins SET episode_id=9223372036854775807",
      "INSERT INTO clinical_note_private_origins SELECT * FROM clinical_note_private_origins",
    ]) {
      await s.client.query('BEGIN');await s.client.query('ALTER TABLE clinical_note_private_origins DISABLE TRIGGER ALL');
      const constraints=(await s.client.query("SELECT conname FROM pg_constraint WHERE conrelid='clinical_note_private_origins'::regclass")).rows;
      for(const {conname} of constraints)await s.client.query('ALTER TABLE clinical_note_private_origins DROP CONSTRAINT "'+conname+'"');
      await s.client.query(mutation);await s.client.query('SET LOCAL ROLE '+s.reader);
      assert.equal((await resolvePrivateNoteOrigin(s.client,input)).originVerified,false);
      await s.client.query('RESET ROLE');await s.client.query('ROLLBACK');
    }

    assert.equal((await resolvePrivateNoteOrigin(c,input)).originVerified,true);
    await s.client.query('REVOKE EXECUTE ON FUNCTION '+signature+' FROM '+s.reader);
    await assert.rejects(resolvePrivateNoteOrigin(c,input),{code:'42501'});
    await assert.rejects(migrate(s.client,s.options),/drift/);
  });
  await t.test('011: privileges memberships SET-only owner function and PUBLIC drift reject without repair',async st=>{
    const s=await fresh(st),before=await ledger(s.client);
    for(const [grant,revoke] of [
      ['GRANT EXECUTE ON FUNCTION '+signature+' TO PUBLIC','REVOKE EXECUTE ON FUNCTION '+signature+' FROM PUBLIC'],
      ['GRANT SELECT ON clinical_note_private_origins TO '+s.reader,'REVOKE SELECT ON clinical_note_private_origins FROM '+s.reader],
      ['GRANT SELECT(content) ON patient_clinical_notes TO '+s.owner,'REVOKE SELECT(content) ON patient_clinical_notes FROM '+s.owner],
      ['GRANT '+s.owner+' TO '+s.reader+' WITH INHERIT FALSE, SET TRUE','REVOKE '+s.owner+' FROM '+s.reader],
      ['GRANT SET ON PARAMETER session_replication_role TO '+s.owner,'REVOKE SET ON PARAMETER session_replication_role FROM '+s.owner],
      ['GRANT ALTER SYSTEM ON PARAMETER session_replication_role TO '+s.reader,'REVOKE ALTER SYSTEM ON PARAMETER session_replication_role FROM '+s.reader],
      ['ALTER FUNCTION '+signature+' SET search_path=public','ALTER FUNCTION '+signature+' SET search_path=pg_catalog,pg_temp'],
      ['GRANT EXECUTE ON FUNCTION '+signature+' TO '+s.reader+' WITH GRANT OPTION','REVOKE GRANT OPTION FOR EXECUTE ON FUNCTION '+signature+' FROM '+s.reader],
    ]) {
      await s.client.query(grant);
      if(grant.includes('SET TRUE')) { const c=await s.login(s.reader);await c.query('SET ROLE '+s.owner);assert.equal((await c.query('SELECT current_user')).rows[0].current_user,s.owner);await c.query('RESET ROLE'); }
      await assert.rejects(verify(s),/011/);await assert.rejects(migrate(s.client,s.options),/drift/);
      assert.deepEqual(await ledger(s.client),before);await s.client.query(revoke);
    }
    await verify(s);assert.equal((await migrate(s.client,s.options)).status,'already-applied');
  });
  await t.test('011: late installation failure rolls back roles grants functions and ledger before retry',async st=>{
    const s=await fresh(st,'010'),before=await ledger(s.client);
    await s.client.query(`CREATE FUNCTION reject_011_ledger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.version='011' THEN RAISE EXCEPTION '011 injected failure'; END IF; RETURN NEW; END $$`);
    await s.client.query('CREATE TRIGGER reject_011_ledger BEFORE INSERT ON psicopanel_schema_migrations FOR EACH ROW EXECUTE FUNCTION reject_011_ledger()');
    // Record fixture catalog drift under 010 only so upgrade reaches the fault.
    await s.client.query("UPDATE psicopanel_schema_migrations SET catalog_sha256=$1 WHERE version='010'",[await catalogChecksum(s.client)]);
    const faultLedger=await ledger(s.client);
    await assert.rejects(migrate(s.client,{...s.options,target:'011'}),/011 injected failure/);
    assert.deepEqual(await ledger(s.client),faultLedger);
    assert.equal((await s.client.query('SELECT to_regprocedure($1) AS fn',[signature])).rows[0].fn,null);
    assert.equal((await s.client.query('SELECT FROM pg_roles WHERE rolname=$1',[s.owner])).rowCount,0);
    await s.client.query('DROP TRIGGER reject_011_ledger ON psicopanel_schema_migrations');await s.client.query('DROP FUNCTION reject_011_ledger()');
    await s.client.query("UPDATE psicopanel_schema_migrations SET catalog_sha256=$1 WHERE version='010'",[before.at(-1).catalog_sha256]);
    await migrate(s.client,{...s.options,target:'011'});await verify(s);
  });
}
