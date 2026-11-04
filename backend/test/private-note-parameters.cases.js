// Shared parameter ACLs are mutated ONLY inside the existing fresh UUID CLUSTER.
// Every PUBLIC grant is explicitly restored by test cleanup, never by production.
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {loadMigrations,migrate,catalogChecksum} from '../scripts/episode-migration.js';
import {privateNoteSecurityCatalog,verifyPrivateNoteContract} from '../scripts/private-note-contract.js';
import {catalogChecksum as beforeParametersChecksum} from './fixtures/catalog-checksum-010-pre-parameter-acl.js';
import {verifyPrivateNoteContract as beforeParametersVerify} from './fixtures/private-note-contract-pre-parameter-acl.js';
import {rejectedCreationSQL} from './fixtures/private-note-creator-pre-parameter-acl.js';
import {catalogChecksum as historical009Checksum} from './fixtures/catalog-checksum-003-009.js';
import {createSandboxDatabase,installBaseline} from '../scripts/episode-sandbox.js';
import {participantIdentities,preparedEpisode} from '../scripts/episode-participants-fixture.js';

const parameter='session_replication_role';
const creatorExpression=/CREATE FUNCTION public[.]create_private_clinical_note_v1[(][\s\S]*?END [$][$];/;
const ledger=async c=>(await c.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows;
const counts=async c=>(await c.query(`SELECT (SELECT count(*)::int FROM patient_clinical_notes) AS notes,
  (SELECT count(*)::int FROM clinical_note_private_origins) AS origins`)).rows[0];
const privilege=async(c,role,kind='SET')=>(await c.query(
  'SELECT pg_catalog.has_parameter_privilege($1,$2,$3) AS allowed',[role,parameter,kind])).rows[0].allowed;
const verify=async s=>verifyPrivateNoteContract(s.client,(await loadMigrations())[9],s.creatorRole);
const create=async(s,c=s.creator)=>(await c.query(
  'SELECT public.create_private_clinical_note_v1($1,$2,$3,$4,$5) AS id',
  [s.episode,'p','a',s.appt,'Fictional parameter-integrity fixture'])).rows[0].id;

export async function runPrivateNoteParameterCases(t,control) {
  // sandboxControl() has already rejected a reused/ordinary cluster. Reassert
  // its identity before any cluster-wide GRANT, not just the destination DB.
  assert.equal((await control.query('SELECT current_database() AS name')).rows[0].name,'psicopanel_integrity_test');
  const fresh=async(subtest,{target='010',identities=false}={})=>{
    const name='psicopanel_episode_'+randomUUID().replaceAll('-','');
    const client=await createSandboxDatabase(control,name);subtest.after(()=>client.end());await installBaseline(client);
    const readerRole='parameter_reader_'+randomUUID().replaceAll('-','');
    const creatorRole='parameter_creator_'+randomUUID().replaceAll('-','');
    await client.query('CREATE ROLE '+readerRole+' LOGIN NOINHERIT');
    await client.query('CREATE ROLE '+creatorRole+" LOGIN NOINHERIT PASSWORD 'disposable_parameter_creator'");
    const options={expectedDatabase:name,target,accountReaderRole:readerRole,
      ...(target==='010'?{privateNoteCreatorRole:creatorRole}:{})};
    await migrate(client,options);if(identities)await participantIdentities(client);
    const {rows:[db]}=await client.query('SELECT oid FROM pg_database WHERE datname=current_database()');
    return {client,name,creatorRole,readerRole,options,
      creatorOwner:'psicopanel_note_creator_owner_'+db.oid,verifierOwner:'psicopanel_note_verifier_owner_'+db.oid};
  };
  const login=async(subtest,s)=>{
    const c=new pg.Client({host:'db',database:s.name,user:s.creatorRole,password:'disposable_parameter_creator'});
    await c.connect();subtest.after(()=>c.end());await c.query("SET statement_timeout='10s'");return c;
  };
  const graph=async(subtest)=>{
    const s=await fresh(subtest,{identities:true});s.episode=await preparedEpisode(s.client);
    s.appt=(await s.client.query(`INSERT INTO appointments(episode_id,patient_id,created_by_user_id,scheduled_date,scheduled_time,status)
      VALUES($1,'p','a',CURRENT_DATE-3,'09:00','completed') RETURNING id`,[s.episode])).rows[0].id;
    s.creator=await login(subtest,s);return s;
  };
  const rejectWithoutRepair=async s=>{
    const before=await ledger(s.client),drifted=await catalogChecksum(s.client);
    await assert.rejects(verify(s),/010 private note security contract/);
    await assert.rejects(migrate(s.client,s.options),/drift|incompatible/);
    assert.deepEqual(await ledger(s.client),before);assert.equal(await catalogChecksum(s.client),drifted);
  };

  await t.test('010 P2 parameters: rejected creator really commits an orphan under replica and old checks omit the grant',async subtest=>{
    const s=await graph(subtest),migration=(await loadMigrations())[9];
    const rejectedSpecification={sql:migration.sql.replace(creatorExpression,()=>rejectedCreationSQL)};
    // Fault reproduction only: install the exact rejected function under its
    // original restricted owner. Never expose this fixture to HTTP or production.
    await s.client.query(rejectedCreationSQL.replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION'));
    const before=await beforeParametersChecksum(s.client);
    await beforeParametersVerify(s.client,rejectedSpecification,s.creatorRole);
    await s.client.query('GRANT SET ON PARAMETER session_replication_role TO '+s.creatorRole);
    try {
      assert.equal(await privilege(s.client,s.creatorRole),true);
      assert.equal(await beforeParametersChecksum(s.client),before);
      await beforeParametersVerify(s.client,rejectedSpecification,s.creatorRole);
      await s.creator.query("SET session_replication_role='replica'");
      await s.creator.query('BEGIN');const id=await create(s);await s.creator.query('COMMIT');
      assert.deepEqual(await counts(s.client),{notes:1,origins:0});
      assert.equal((await s.client.query('SELECT episode_id FROM patient_clinical_notes WHERE id=$1',[id])).rows[0].episode_id,s.episode);
    } finally {
      await s.creator.query('ROLLBACK');await s.creator.query("SET session_replication_role='origin'");
      await s.client.query('REVOKE SET ON PARAMETER session_replication_role FROM '+s.creatorRole);
    }
    // The intentionally vulnerable row stays ONLY in this disposable fixture DB;
    // no backfill/repair, no clinical readers. The wrapper destroys the cluster.
  });
  await t.test('010 P2 parameters: direct SET grant changes new fingerprint rejects verification and replay without repair',async subtest=>{
    const s=await graph(subtest),before=await catalogChecksum(s.client),old=await beforeParametersChecksum(s.client);
    await s.client.query('GRANT SET ON PARAMETER session_replication_role TO '+s.creatorRole);
    try {
      assert.equal(await privilege(s.client,s.creatorRole),true);
      assert.notEqual(await catalogChecksum(s.client),before);
      assert.equal(await beforeParametersChecksum(s.client),old);
      await beforeParametersVerify(s.client,(await loadMigrations())[9],s.creatorRole);
      await rejectWithoutRepair(s);assert.equal(await privilege(s.client,s.creatorRole),true);
      assert.deepEqual(await counts(s.client),{notes:0,origins:0});
    } finally {await s.client.query('REVOKE SET ON PARAMETER session_replication_role FROM '+s.creatorRole);}
  });
  await t.test('010 P2 parameters: PUBLIC SET or ALTER SYSTEM before install rolls back 010 and preserves historical 009',async subtest=>{
    for(const kind of ['SET','ALTER SYSTEM']) {
      const s=await fresh(subtest,{target:'009'}),before=await catalogChecksum(s.client),oldLedger=await ledger(s.client);
      await s.client.query('GRANT '+kind+' ON PARAMETER session_replication_role TO PUBLIC');
      try {
        assert.equal(await privilege(s.client,s.creatorRole,kind),true);
        assert.equal(await privilege(control,s.creatorRole,kind),true,'parameter ACL is shared across the isolated cluster');
        assert.equal(await catalogChecksum(s.client),before);assert.equal(await historical009Checksum(s.client),before);
        await assert.rejects(migrate(s.client,{...s.options,target:'010',privateNoteCreatorRole:s.creatorRole}),/010 private note security contract/);
        assert.deepEqual(await ledger(s.client),oldLedger);assert.equal(await catalogChecksum(s.client),before);
        assert.equal((await s.client.query("SELECT to_regclass('public.clinical_note_private_origins') AS name")).rows[0].name,null);
        assert.equal((await s.client.query('SELECT FROM pg_roles WHERE rolname=ANY($1::text[])',[[s.creatorOwner,s.verifierOwner]])).rowCount,0);
        assert.equal(await privilege(s.client,s.creatorRole,kind),true,'production verifier does not revoke the grant');
      } finally {await s.client.query('REVOKE '+kind+' ON PARAMETER session_replication_role FROM PUBLIC');}
    }
  });
  await t.test('010 P2 parameters: PUBLIC grants after install expand all three roles and reject replay without revocation',async subtest=>{
    for(const kind of ['SET','ALTER SYSTEM']) {
      const s=await fresh(subtest),before=await catalogChecksum(s.client);
      await s.client.query('GRANT '+kind+' ON PARAMETER session_replication_role TO PUBLIC');
      try {
        for(const role of [s.creatorRole,s.creatorOwner,s.verifierOwner])assert.equal(await privilege(s.client,role,kind),true);
        const catalog=await privateNoteSecurityCatalog(s.client);
        assert.ok(catalog[11].some(r=>r.grantee==='PUBLIC' && r.privilege_type===kind));
        assert.notEqual(await catalogChecksum(s.client),before);await rejectWithoutRepair(s);
        assert.equal(await privilege(s.client,s.creatorOwner,kind),true);
      } finally {await s.client.query('REVOKE '+kind+' ON PARAMETER session_replication_role FROM PUBLIC');}
    }
  });
  await t.test('010 P2 parameters: both NOLOGIN owners reject direct SET and ALTER SYSTEM capabilities',async subtest=>{
    const s=await fresh(subtest);
    for(const role of [s.creatorOwner,s.verifierOwner])for(const kind of ['SET','ALTER SYSTEM']) {
      const before=await catalogChecksum(s.client);
      await s.client.query('GRANT '+kind+' ON PARAMETER session_replication_role TO '+role);
      try {
        assert.equal(await privilege(s.client,role,kind),true);assert.notEqual(await catalogChecksum(s.client),before);
        await rejectWithoutRepair(s);assert.equal(await privilege(s.client,role,kind),true);
      } finally {await s.client.query('REVOKE '+kind+' ON PARAMETER session_replication_role FROM '+role);}
      assert.equal(await catalogChecksum(s.client),before);
    }
  });
  await t.test('010 P2 parameters: inherited effective privilege and SET ROLE membership cannot preserve the contract',async subtest=>{
    const s=await fresh(subtest),parent='parameter_parent_'+randomUUID().replaceAll('-','');
    await s.client.query('CREATE ROLE '+parent+' NOLOGIN');
    await s.client.query('GRANT SET ON PARAMETER session_replication_role TO '+parent);
    await s.client.query('GRANT '+parent+' TO '+s.creatorRole+' WITH INHERIT TRUE, SET TRUE');
    try {
      assert.equal(await privilege(s.client,s.creatorRole),true);
      const catalog=await privateNoteSecurityCatalog(s.client);
      assert.ok(catalog[10].some(r=>r.rolname===s.creatorRole && r.can_set));
      assert.ok(catalog[11].some(r=>r.grantee===parent));await rejectWithoutRepair(s);
      assert.equal(await privilege(s.client,s.creatorRole),true);
    } finally {
      await s.client.query('REVOKE '+parent+' FROM '+s.creatorRole);
      await s.client.query('REVOKE SET ON PARAMETER session_replication_role FROM '+parent);
    }
  });
  await t.test('010 P2 parameters: actual replica session is rejected before INSERT with no normalization or partial rows',async subtest=>{
    const s=await graph(subtest);
    await s.client.query('GRANT SET ON PARAMETER session_replication_role TO '+s.creatorRole);
    try {
      await s.creator.query("SET session_replication_role='replica'");
      await s.creator.query('BEGIN');await assert.rejects(create(s),/Trigger-disabling replication mode/);
      await s.creator.query('ROLLBACK');
      assert.equal((await s.creator.query('SHOW session_replication_role')).rows[0].session_replication_role,'replica');
      assert.deepEqual(await counts(s.client),{notes:0,origins:0});
      await s.creator.query("SET session_replication_role='local'");
      await s.creator.query('BEGIN');await create(s);
      await s.creator.query('SET CONSTRAINTS private_note_origin_required IMMEDIATE');await s.creator.query('COMMIT');
      assert.deepEqual(await counts(s.client),{notes:1,origins:1});
      await assert.rejects(verify(s),/010 private note security contract/,'runtime defense does not bless an unsafe grant');
    } finally {
      await s.creator.query('ROLLBACK');await s.creator.query("SET session_replication_role='origin'");
      await s.client.query('REVOKE SET ON PARAMETER session_replication_role FROM '+s.creatorRole);
    }
  });
  await t.test('010 P2 parameters: effective replica on migration connection invalidates contract and replay',async subtest=>{
    const s=await fresh(subtest),before=await catalogChecksum(s.client),oldLedger=await ledger(s.client);
    await s.client.query("SET session_replication_role='replica'");
    try {await rejectWithoutRepair(s);assert.deepEqual(await ledger(s.client),oldLedger);}
    finally {await s.client.query("SET session_replication_role='origin'");}
    assert.equal(await catalogChecksum(s.client),before);await verify(s);
  });
  await t.test('010 P2 parameters: database default replica is detected and a new LOGIN still cannot create an orphan',async subtest=>{
    const s=await graph(subtest),before=await catalogChecksum(s.client);
    await s.client.query('ALTER DATABASE "'+s.name+'" SET session_replication_role=replica');
    try {
      assert.equal(await privilege(s.client,s.creatorRole),false);
      assert.notEqual(await catalogChecksum(s.client),before);await rejectWithoutRepair(s);
      const newLogin=await login(subtest,s);
      assert.equal((await newLogin.query('SHOW session_replication_role')).rows[0].session_replication_role,'replica');
      await assert.rejects(create(s,newLogin),/Trigger-disabling replication mode/);
      assert.deepEqual(await counts(s.client),{notes:0,origins:0});
    } finally {await s.client.query('ALTER DATABASE "'+s.name+'" RESET session_replication_role');}
    assert.equal(await catalogChecksum(s.client),before);
  });
  await t.test('010 P2 parameters: ordinary parameter grants preserve clean creation COMMIT IMMEDIATE and replay',async subtest=>{
    const s=await graph(subtest),before=await catalogChecksum(s.client);
    assert.ok((await s.client.query('SHOW server_version')).rows[0].server_version.startsWith('17.'));
    await s.client.query('GRANT SET,ALTER SYSTEM ON PARAMETER work_mem TO PUBLIC');
    await s.client.query('GRANT SET,ALTER SYSTEM ON PARAMETER statement_timeout TO '+s.creatorRole);
    try {
      await s.creator.query("SET work_mem='2MB'");
      assert.equal((await s.creator.query("SELECT has_parameter_privilege('work_mem','SET') AS allowed")).rows[0].allowed,true);
      assert.equal(await catalogChecksum(s.client),before);await verify(s);
      await s.creator.query('BEGIN');await create(s);await s.creator.query('COMMIT');
      const ap2=(await s.client.query(`INSERT INTO appointments(episode_id,patient_id,created_by_user_id,scheduled_date,scheduled_time,status)
        VALUES($1,'p','a',CURRENT_DATE-4,'10:00','completed') RETURNING id`,[s.episode])).rows[0].id;
      await s.creator.query('BEGIN');await s.creator.query('SET CONSTRAINTS ALL IMMEDIATE');
      await create({...s,appt:ap2});await s.creator.query('SET CONSTRAINTS private_note_origin_required IMMEDIATE');await s.creator.query('COMMIT');
      assert.deepEqual(await counts(s.client),{notes:2,origins:2});
      assert.equal((await migrate(s.client,s.options)).status,'already-applied');assert.equal(await catalogChecksum(s.client),before);
    } finally {
      await s.client.query('REVOKE SET,ALTER SYSTEM ON PARAMETER work_mem FROM PUBLIC');
      await s.client.query('REVOKE SET,ALTER SYSTEM ON PARAMETER statement_timeout FROM '+s.creatorRole);
    }
  });
  await t.test('010 P2 parameters: unrelated parameter grantees do not change another database contract',async subtest=>{
    const s=await fresh(subtest),before=await catalogChecksum(s.client),outsider='parameter_outsider_'+randomUUID().replaceAll('-','');
    await s.client.query('CREATE ROLE '+outsider+' NOLOGIN');
    await s.client.query('GRANT SET,ALTER SYSTEM ON PARAMETER session_replication_role TO '+outsider);
    try {
      assert.equal(await privilege(s.client,s.creatorRole),false);assert.equal(await catalogChecksum(s.client),before);
      await verify(s);assert.equal((await migrate(s.client,s.options)).status,'already-applied');
    } finally {await s.client.query('REVOKE SET,ALTER SYSTEM ON PARAMETER session_replication_role FROM '+outsider);}
  });
  await t.test('010 P2 parameters: pre-fix 010 fingerprint is rejected without adoption or ledger repair',async subtest=>{
    const s=await fresh(subtest),old=await beforeParametersChecksum(s.client);
    assert.notEqual(old,await catalogChecksum(s.client));
    await s.client.query("UPDATE psicopanel_schema_migrations SET catalog_sha256=$1 WHERE version='010'",[old]);
    const before=await ledger(s.client);await assert.rejects(migrate(s.client,s.options),/drift/);
    assert.deepEqual(await ledger(s.client),before);await verify(s);
  });
}
