import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import app from '../src/app.js';
import db from '../src/config/db.js';
import env from '../src/config/env.js';
import { migrate, loadMigrations, catalogChecksum } from '../scripts/episode-migration.js';
import { createSandboxDatabase, installBaseline, syntheticFixture } from '../scripts/episode-sandbox.js';

const connection = name => ({ host: 'db', database: name, user: 'integrity_test', password: 'disposable_test_password' });
const snapshot = async (client, tables) => {
  const result = {};
  for (const table of tables) result[table] = (await client.query(`SELECT to_jsonb(t) AS row FROM "${table}" t ORDER BY 1`)).rows;
  return result;
};
const profile = (client, owner) => client.query('INSERT INTO professional_publication_profiles(owner_user_id) VALUES ($1) RETURNING *', [owner]);
const version = (client, owner, number) => client.query(`INSERT INTO professional_credential_versions(owner_user_id,version,professional_name)
  VALUES ($1,$2,'Fictional professional')`, [owner,number]);
const decide = (client, owner, number, outcome='approved', reviewer='reviewer', role='admin') => client.query(`
  INSERT INTO professional_credential_decisions(owner_user_id,credential_version,outcome,reviewer_user_id,reviewer_role,owner_message,evidence_reference)
  VALUES ($1,$2,$3,$4,$5,'Communicable fixture reason','Private fictional evidence reference')`, [owner,number,outcome,reviewer,role]);

// No D API or browser flow: these fixtures exercise only the private SQL contract.
test('006 private professional persistence: isolated upgrades, integrity, concurrency and legacy compatibility', {
  skip: process.env.RUN_EPISODE_INTEGRATION !== 'true',
}, async t => {
  assert.equal(env.databaseUrl,''); assert.equal(env.dbHost,'db');
  assert.equal(env.dbName,'psicopanel_integrity_test'); assert.equal(env.nodeEnv,'test');
  assert.equal(env.localDevelopment,true);
  assert.match(process.env.EPISODE_TEST_RUN_ID || '',/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
  const control=await db.getClient(), clients=[];
  const fresh=async ({ from=null, populated=true }={}) => {
    const name='psicopanel_episode_d1_'+randomUUID().replaceAll('-','');
    const client=await createSandboxDatabase(control,name); clients.push(client);
    await installBaseline(client);
    if (populated) await syntheticFixture(client);
    if (from) await migrate(client,{expectedDatabase:name,target:from});
    return {client,name};
  };
  const originalQuery=db.query, originalGetClient=db.getClient;
  let server,pool;
  try {
    await t.test('fresh empty installation and CLI require explicit target and destination',async()=>{
      const {client,name}=await fresh({populated:false});
      const cli=args=>spawnSync(process.execPath,['scripts/migrate.js',...args],{
        encoding:'utf8',env:{...process.env,MIGRATION_DATABASE_URL:'postgres://integrity_test:disposable_test_password@db/'+name}});
      assert.notEqual(cli(['--target=006','--database=wrong']).status,0);
      assert.notEqual(cli(['--target=999','--database='+name]).status,0);
      assert.notEqual(cli(['--target=006']).status,0);
      const applied=cli(['--target=006','--database='+name]); assert.equal(applied.status,0,applied.stderr);
      assert.equal(JSON.parse(applied.stdout).version,'006');
      assert.equal((await client.query('SELECT count(*)::int n FROM psicopanel_schema_migrations')).rows[0].n,6);
      for(const table of ['users','patients','clinical_episodes','professional_publication_profiles','professional_credential_versions','professional_general_approaches'])
        assert.equal((await client.query('SELECT count(*)::int n FROM '+table)).rows[0].n,0);
    });
    await t.test('upgrades from every predecessor preserve all legacy rows and prior ledger entries',async()=>{
      for(const from of ['003','004','005']) {
        const {client,name}=await fresh({from});
        const tables=(await client.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'psicopanel_schema_migrations' ORDER BY tablename`)).rows.map(r=>r.tablename);
        const before=await snapshot(client,tables),ledger=(await client.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows;
        assert.equal((await migrate(client,{expectedDatabase:name,target:'006'})).status,'applied');
        // 004 adds only unknown global DOB; compare all other preexisting row values.
        const after=await snapshot(client,tables);
        if(from==='003') for(const row of after.patients) { assert.equal(row.row.global_birth_date,null); delete row.row.global_birth_date; }
        assert.deepEqual(after,before);
        assert.deepEqual((await client.query('SELECT * FROM psicopanel_schema_migrations WHERE version<$1 ORDER BY version',[from<'005'?(from==='003'?'004':'005'):'006'])).rows,ledger);
        for(const table of ['professional_publication_profiles','professional_credential_versions','professional_credential_decisions','professional_photographs'])
          assert.equal((await client.query('SELECT count(*)::int n FROM '+table)).rows[0].n,0);
      }
    });
    const {client,name}=await fresh({from:'005'});
    const second=new pg.Client(connection(name));await second.connect();clients.push(second);
    await t.test('concurrent upgrade and replay serialize and preserve data and generated identifiers',async()=>{
      const results=await Promise.all([migrate(client,{expectedDatabase:name,target:'006'}),migrate(second,{expectedDatabase:name,target:'006'})]);
      assert.deepEqual(results.map(r=>r.status).sort(),['already-applied','applied']);
      await client.query(`INSERT INTO users(id,first_name,email,password_hash,role) VALUES
        ('reviewer','Fictional reviewer','reviewer@d1.invalid','not-a-login','admin'),
        ('support','Fictional support','support@d1.invalid','not-a-login','support')`);
      const a=(await profile(client,'a')).rows[0],b=(await profile(client,'b')).rows[0];
      assert.equal(a.is_public,false);assert.equal(a.accepts_new_patients,false);
      assert.notEqual(a.public_id,b.public_id);assert.match(a.public_id,/^[a-f0-9-]{14}4[a-f0-9-]{21}$/);
      const tables=(await client.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`)).rows.map(r=>r.tablename);
      const before=await snapshot(client,tables);
      assert.equal((await migrate(client,{expectedDatabase:name,target:'006'})).status,'already-applied');
      assert.deepEqual(await snapshot(client,tables),before);
    });
    await t.test('public identifiers cannot be supplied, changed, deleted, truncated or reused',async()=>{
      const id=(await client.query("SELECT public_id FROM professional_publication_profiles WHERE owner_user_id='a'")).rows[0].public_id;
      await assert.rejects(client.query('INSERT INTO professional_publication_profiles(owner_user_id,public_id) VALUES ($1,$2)',['p',id]),/generated by the database/);
      await assert.rejects(client.query("UPDATE professional_publication_profiles SET public_id=gen_random_uuid(),row_version=row_version+1 WHERE owner_user_id='a'"),/identity is immutable/);
      await assert.rejects(client.query('INSERT INTO professional_public_ids(public_id) VALUES ($1)',[id]),/duplicate/);
      await assert.rejects(client.query('DELETE FROM professional_public_ids WHERE public_id=$1',[id]),/retention policy/);
      await assert.rejects(client.query('TRUNCATE professional_public_ids CASCADE'),/retention policy/);
      await assert.rejects(client.query("DELETE FROM professional_publication_profiles WHERE owner_user_id='a'"),/retention policy/);
      assert.equal((await client.query("SELECT public_id FROM professional_publication_profiles WHERE owner_user_id='a'")).rows[0].public_id,id);
    });
    await t.test('only psychologists own profiles and references cannot exchange credential owners',async()=>{
      await assert.rejects(profile(client,'p'),/foreign key/);
      await assert.rejects(profile(client,'reviewer'),/foreign key/);
      await version(client,'a',1);await version(client,'b',2);
      await assert.rejects(client.query("UPDATE professional_publication_profiles SET pending_credential_version=2,row_version=row_version+1 WHERE owner_user_id='a'"),/foreign key/);
      await assert.rejects(client.query("UPDATE professional_credential_versions SET owner_user_id='b' WHERE owner_user_id='a'"),/immutable/);
      await assert.rejects(client.query("UPDATE professional_publication_profiles SET approved_credential_version=1,row_version=row_version+1 WHERE owner_user_id='a'"),/foreign key/);
      await assert.rejects(client.query("UPDATE professional_publication_profiles SET is_public=true,row_version=row_version+1 WHERE owner_user_id='a'"),/check constraint/);
    });
    await t.test('decisions are exact, terminal, nonclinical and do not automatically promote a version',async()=>{
      const before=(await client.query('SELECT * FROM psychologist_profiles ORDER BY user_id')).rows;
      await assert.rejects(decide(client,'a',1,'approved','support','support'),/check constraint/);
      await assert.rejects(decide(client,'a',1,'approved','a','admin'),/check constraint/);
      await assert.rejects(decide(client,'a',2),/foreign key/);
      const results=await Promise.allSettled([decide(client,'a',1),decide(second,'a',1,'rejected')]);
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
      assert.equal(results.filter(r=>r.status==='rejected').length,1);
      const decision=(await client.query("SELECT * FROM professional_credential_decisions WHERE owner_user_id='a' AND credential_version=1")).rows[0];
      assert.equal((await client.query("SELECT approved_credential_version FROM professional_publication_profiles WHERE owner_user_id='a'")).rows[0].approved_credential_version,null);
      await assert.rejects(client.query("UPDATE professional_credential_decisions SET outcome='rejected' WHERE owner_user_id='a'"),/immutable/);
      assert.deepEqual((await client.query('SELECT * FROM psychologist_profiles ORDER BY user_id')).rows,before);
      // Deterministic approved and rejected versions for the remaining contract tests.
      await version(client,'a',3);await decide(client,'a',3);
      await version(client,'a',4);await decide(client,'a',4,'rejected');
      await client.query("UPDATE professional_publication_profiles SET approved_credential_version=3,row_version=row_version+1 WHERE owner_user_id='a'");
      await assert.rejects(client.query("UPDATE professional_publication_profiles SET approved_credential_version=4,row_version=row_version+1 WHERE owner_user_id='a'"),/foreign key/);
      assert.ok(['approved','rejected'].includes(decision.outcome));
      assert.equal((await client.query("SELECT review_status FROM professional_credential_review_states WHERE owner_user_id='b' AND version=2")).rows[0].review_status,'pending');
    });
    await t.test('pending pointer and decisions remain consistent across explicit transactions and concurrent writers',async()=>{
      await version(client,'a',5);
      await client.query("UPDATE professional_publication_profiles SET pending_credential_version=5,row_version=row_version+1 WHERE owner_user_id='a'");
      await assert.rejects(decide(client,'a',5),/Pending version already decided/);
      await client.query('BEGIN');
      await client.query("UPDATE professional_publication_profiles SET pending_credential_version=NULL,row_version=row_version+1 WHERE owner_user_id='a'");
      await decide(client,'a',5,'rejected');await client.query('COMMIT');
      assert.equal((await client.query("SELECT approved_credential_version FROM professional_publication_profiles WHERE owner_user_id='a'")).rows[0].approved_credential_version,3);
      await version(client,'a',6);
      await client.query('BEGIN');
      await client.query("UPDATE professional_publication_profiles SET pending_credential_version=6,row_version=row_version+1 WHERE owner_user_id='a'");
      const competing=decide(second,'a',6).then(()=>({ok:true}),error=>({error}));
      // Observe the actual PostgreSQL wait; do not infer concurrency from a timer.
      const pid=second.processID;let waiting=false;
      for(let i=0;i<300;i++) {
        const row=(await control.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0];
        if(row?.wait_event_type==='Lock') {waiting=true;break;}
        await new Promise(resolve=>setTimeout(resolve,10));
      }
      assert.equal(waiting,true);await client.query('COMMIT');
      assert.match((await competing).error.message,/Pending version already decided/);
    });
    await t.test('optimistic edits have one winner and flags remain independent',async()=>{
      const expected=(await client.query("SELECT row_version FROM professional_publication_profiles WHERE owner_user_id='a'")).rows[0].row_version;
      const edit=c=>c.query("UPDATE professional_publication_profiles SET description='Fictional direct edit',row_version=row_version+1 WHERE owner_user_id='a' AND row_version=$1",[expected]);
      assert.deepEqual((await Promise.all([edit(client),edit(second)])).map(r=>r.rowCount).sort(),[0,1]);
      await assert.rejects(client.query("UPDATE professional_publication_profiles SET description='Stale edit' WHERE owner_user_id='a'"),/next row version/);
      for(const [visible,accepts] of [[false,true],[true,false],[true,true],[false,false]]) {
        await client.query("UPDATE professional_publication_profiles SET is_public=$1,accepts_new_patients=$2,row_version=row_version+1 WHERE owner_user_id='a'",[visible,accepts]);
        const row=(await client.query("SELECT is_public,accepts_new_patients FROM professional_publication_profiles WHERE owner_user_id='a'")).rows[0];
        assert.deepEqual(row,{is_public:visible,accepts_new_patients:accepts});
      }
      await assert.rejects(client.query("INSERT INTO professional_profile_approaches VALUES ('a','client_claimed_exempt')"),/foreign key/);
      await client.query("INSERT INTO professional_general_approaches VALUES ('fictional_general','Fictional general approach')");
      await client.query("INSERT INTO professional_profile_approaches VALUES ('a','fictional_general')");
    });
    await t.test('credential validity defaults to review and never invents expiry or evidence',async()=>{
      await client.query("INSERT INTO professional_credential_validity(owner_user_id,credential_version) VALUES ('a',3)");
      const initial=(await client.query("SELECT * FROM professional_credential_validity WHERE owner_user_id='a'")).rows[0];
      assert.equal(initial.status,'requires_review');assert.equal(initial.valid_until,null);assert.equal(initial.evidence_reference,null);
      await assert.rejects(client.query("UPDATE professional_credential_validity SET status='supported',row_version=row_version+1 WHERE owner_user_id='a'"),/check constraint/);
      await client.query("UPDATE professional_credential_validity SET status='supported',evidence_reference='Fictional supporting reference',assessed_by_user_id='reviewer',assessed_by_role='admin',assessed_at=clock_timestamp(),row_version=row_version+1 WHERE owner_user_id='a'");
      await client.query("UPDATE professional_credential_validity SET status='requires_review',row_version=row_version+1 WHERE owner_user_id='a'");
      assert.equal((await client.query("SELECT outcome FROM professional_credential_decisions WHERE owner_user_id='a' AND credential_version=3")).rows[0].outcome,'approved');
      await assert.rejects(client.query("UPDATE professional_credential_validity SET valid_from='2030-01-02',valid_until='2030-01-01',row_version=row_version+1 WHERE owner_user_id='a'"),/check constraint/);
      await client.query("INSERT INTO professional_review_internal_notes(owner_user_id,credential_version,reviewer_user_id,reviewer_role,body) VALUES ('a',3,'reviewer','admin','Reserved fictional observation')");
      const columns=(await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='professional_credential_decisions'")).rows.map(r=>r.column_name);
      assert.ok(!columns.includes('body'));assert.ok(columns.includes('owner_message'));
    });
    await t.test('photo metadata has safe types, immutable ownership and terminal retirement without files',async()=>{
      const a=(await client.query("INSERT INTO professional_photographs(owner_user_id,version) VALUES ('a',1) RETURNING *")).rows[0];
      const b=(await client.query("INSERT INTO professional_photographs(owner_user_id,version,processed_mime,byte_size,width,height,status) VALUES ('b',1,'image/png',100,10,10,'ready') RETURNING *")).rows[0];
      await assert.rejects(client.query("UPDATE professional_publication_profiles SET current_photo_id=$1,row_version=row_version+1 WHERE owner_user_id='a'",[b.id]),/foreign key/);
      await assert.rejects(client.query("UPDATE professional_publication_profiles SET current_photo_id=$1,row_version=row_version+1 WHERE owner_user_id='a'",[a.id]),/foreign key/);
      await assert.rejects(client.query('UPDATE professional_photographs SET status=$2 WHERE id=$1',[a.id,'ready']),/check constraint/);
      await assert.rejects(client.query('UPDATE professional_photographs SET processed_mime=$2 WHERE id=$1',[a.id,'image/svg+xml']),/check constraint/);
      await client.query("UPDATE professional_photographs SET processed_mime='image/webp',byte_size=100,width=10,height=10,status='ready' WHERE id=$1",[a.id]);
      await client.query("UPDATE professional_publication_profiles SET current_photo_id=$1,row_version=row_version+1 WHERE owner_user_id='a'",[a.id]);
      await assert.rejects(client.query("UPDATE professional_photographs SET owner_user_id='b' WHERE id=$1",[a.id]),/Immutable photo/);
      await assert.rejects(client.query("UPDATE professional_photographs SET status='staged' WHERE id=$1",[a.id]),/invalid transition/);
      await assert.rejects(client.query("UPDATE professional_photographs SET status='retired' WHERE id=$1",[a.id]),/foreign key/);
      await client.query("UPDATE professional_publication_profiles SET current_photo_id=NULL,row_version=row_version+1 WHERE owner_user_id='a'");
      await client.query("UPDATE professional_photographs SET status='retired' WHERE id=$1",[a.id]);
      await assert.rejects(client.query("UPDATE professional_photographs SET status='ready' WHERE id=$1",[a.id]),/invalid transition/);
    });
    await t.test('private structures grant no PUBLIC privileges or cascading clinical references',async()=>{
      const grants=await client.query(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace,
        LATERAL aclexplode(c.relacl) a
        WHERE n.nspname='public' AND left(c.relname,13)='professional_' AND a.grantee=0`);
      assert.equal(grants.rowCount,0);
      const cascades=await client.query(`SELECT 1 FROM pg_constraint WHERE contype='f' AND conrelid IN
        (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace AND left(relname,13)='professional_') AND confdeltype<>'r'`);
      assert.equal(cascades.rowCount,0);
    });
    await t.test('unknown versions, downgrade, file and ledger checksums and catalog drift fail closed',async()=>{
      for(const target of ['003','004','005']) await assert.rejects(migrate(client,{expectedDatabase:name,target}),/downgrade/);
      await assert.rejects(migrate(client,{expectedDatabase:name,target:'999'}),/Unsupported/);
      const dir=await fs.mkdtemp(os.tmpdir()+'/d1-checksum-');
      try {
        const root=new URL('../sql/migrations/',import.meta.url);
        for(const file of await fs.readdir(root)) await fs.copyFile(new URL(file,root),dir+'/'+file);
        await fs.appendFile(dir+'/006_professional_directory_foundation.sql','\n-- incompatible\n');
        await assert.rejects(loadMigrations(new URL('file://'+dir+'/')),/checksum/);
      } finally {await fs.rm(dir,{recursive:true,force:true});}
      for(const mutation of ["ALTER TABLE professional_publication_profiles ADD COLUMN unexpected text",
        "UPDATE psicopanel_schema_migrations SET file_sha256='wrong' WHERE version='006'",
        "DELETE FROM psicopanel_schema_migrations WHERE version='004'",
        "INSERT INTO psicopanel_schema_migrations(version,file_name,file_sha256,server_major) VALUES ('999','unknown','x','17')"]) {
        const next=await fresh({from:'005'});await migrate(next.client,{expectedDatabase:next.name,target:'006'});
        await next.client.query(mutation);const before=await catalogChecksum(next.client);
        await assert.rejects(migrate(next.client,{expectedDatabase:next.name,target:'006'}),/drift|checksum|Incompatible/);
        assert.equal(await catalogChecksum(next.client),before);
      }
    });
    await t.test('untracked D1 structures are refused and partial DDL failure rolls back atomically',async()=>{
      for(const object of ['CREATE TABLE professional_photographs(id integer)',
        'CREATE VIEW professional_credential_review_states AS SELECT 1 n',
        'CREATE FUNCTION reserve_professional_public_id() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$']) {
        const next=await fresh();await next.client.query(object);const before=await catalogChecksum(next.client);
        await assert.rejects(migrate(next.client,{expectedDatabase:next.name,target:'006'}),/Untracked/);
        assert.equal(await catalogChecksum(next.client),before);
        assert.equal((await next.client.query("SELECT to_regclass('psicopanel_schema_migrations') n")).rows[0].n,null);
      }
      const next=await fresh({from:'005'});
      // A conflict on the last function occurs after D1 tables have been created.
      await next.client.query('CREATE FUNCTION check_professional_pending_version() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$');
      const before=await catalogChecksum(next.client);
      // Deliberately emulate a recorded catalog containing an unrelated collision,
      // solely inside this new synthetic DB, to reach the transactional DDL failure.
      await next.client.query("UPDATE psicopanel_schema_migrations SET catalog_sha256=$1 WHERE version='005'",[before]);
      const ledger=(await next.client.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows;
      await assert.rejects(migrate(next.client,{expectedDatabase:next.name,target:'006'}),/already exists/);
      assert.equal(await catalogChecksum(next.client),before);
      assert.equal((await next.client.query("SELECT to_regclass('professional_publication_profiles') n")).rows[0].n,null);
      assert.deepEqual((await next.client.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows,ledger);
    });
    await t.test('unchanged application on 006 preserves legacy clinical access, auth revocation and all disabled entry points',async()=>{
      pool=new pg.Pool(connection(name));db.query=(sql,values)=>pool.query(sql,values);db.getClient=()=>pool.connect();
      server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
      const req=async(path,token,method='GET',body)=>{
        const response=await fetch('http://127.0.0.1:'+server.address().port+'/api'+path,{method,
          headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
        return {status:response.status,body:await response.json()};
      };
      const login=await req('/auth/login',null,'POST',{email:'a@episodes.invalid',password:'Episode-Demo-Only-284!'});
      assert.equal(login.status,200);const token=login.body.data.token;
      for(const path of ['/auth/me','/patients','/patients/p','/appointments','/reminders/me','/availability/me']) assert.equal((await req(path,token)).status,200,path);
      const tables=['patients','users','care_relationships','psychologist_patient_access','clinical_episodes','patient_clinical_notes','appointments','patient_tasks','audit_logs'];
      const before=await snapshot(client,tables);
      for(const [path,method] of [['/patients','POST'],['/auth/care-relationships/request','POST'],['/auth/care-relationships/invite','POST'],['/auth/care-relationships/1/respond','PATCH'],['/auth/care-relationships/accept-code','POST']])
        assert.equal((await req(path,token,method,{})).status,403,path);
      assert.deepEqual(await snapshot(client,tables),before);
      for(const path of ['/public/professionals','/professional-profiles','/auth/professional-status']) assert.equal((await req(path,null)).status,404);
      await client.query("UPDATE psychologist_profiles SET approval_status='suspended' WHERE user_id='a'");
      assert.ok([401,403].includes((await req('/patients',token)).status));
      assert.equal((await req('/auth/login',null,'POST',{email:'a@episodes.invalid',password:'Episode-Demo-Only-284!'})).status,403);
      await client.query("UPDATE psychologist_profiles SET approval_status='active' WHERE user_id='a'");
      assert.equal((await req('/patients',token)).status,401);
      assert.equal((await client.query('SELECT count(*)::int n FROM clinical_episodes')).rows[0].n,0);
    });
  } finally {
    if(server) await new Promise(resolve=>server.close(resolve));
    db.query=originalQuery;db.getClient=originalGetClient;
    if(pool) await pool.end();
    for(const client of clients) {try {await client.query('ROLLBACK');} finally {await client.end();}}
    control.release();
  }
});
