import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import sharp from 'sharp';
import app from '../src/app.js';
import db from '../src/config/db.js';
import env from '../src/config/env.js';
import {createSandboxDatabase,installBaseline,syntheticFixture} from '../scripts/episode-sandbox.js';
import {migrate,catalogChecksum,loadMigrations} from '../scripts/episode-migration.js';
import {decideCredential} from '../src/modules/professional/professional.service.js';
const connection=name=>({host:'db',database:name,user:'integrity_test',password:'disposable_test_password'});
test('D2 private management on fresh PostgreSQL with real HTTP and independent connections', {skip:process.env.RUN_EPISODE_INTEGRATION!=='true'},async t=>{
  assert.equal(env.dbHost,'db');assert.equal(env.dbName,'psicopanel_integrity_test');assert.equal(env.databaseUrl,'');assert.equal(env.localDevelopment,true);
  assert.match(process.env.EPISODE_TEST_RUN_ID||'',/^[a-f0-9-]{36}$/);
  const control=await db.getClient(),name='psicopanel_episode_d2_'+randomUUID().replaceAll('-',''),client=await createSandboxDatabase(control,name),root=await fs.mkdtemp(path.join(os.tmpdir(),'d2-media-'));
  const original={query:db.query,getClient:db.getClient,enabled:env.d2Enabled,secret:env.restrictedJwtSecret,root:env.professionalMediaRoot};let pool,server;
  const tokens={},password='Episode-Demo-Only-284!';
  try{
    await installBaseline(client);await syntheticFixture(client);
    await t.test('007 upgrades each predecessor, replays and preserves historical SQL and view security',async()=>{
      for(const from of ['003','004','005','006']){const target='psicopanel_episode_d2_upgrade_'+randomUUID().replaceAll('-','');const other=await createSandboxDatabase(control,target);
        try{await installBaseline(other);await migrate(other,{expectedDatabase:target,target:from});const before=(await other.query('SELECT version,file_sha256 FROM psicopanel_schema_migrations ORDER BY version')).rows;
          await migrate(other,{expectedDatabase:target,target:'007'});assert.deepEqual((await other.query('SELECT version,file_sha256 FROM psicopanel_schema_migrations WHERE version<=$1 ORDER BY version',[from])).rows,before);
          assert.equal((await migrate(other,{expectedDatabase:target,target:'007'})).status,'already-applied');
          await other.query('ALTER VIEW professional_credential_review_states SET(security_invoker=false)');await assert.rejects(migrate(other,{expectedDatabase:target,target:'007'}),/drift/);
        }finally{await other.end();}}
      const other=new pg.Client(connection(name));await other.connect();try{const results=await Promise.all([migrate(client,{expectedDatabase:name,target:'007'}),migrate(other,{expectedDatabase:name,target:'007'})]);assert.deepEqual(results.map(r=>r.status).sort(),['already-applied','applied']);}finally{await other.end();}
      const fingerprint=await catalogChecksum(client);assert.equal((await client.query("SELECT catalog_sha256 FROM psicopanel_schema_migrations WHERE version='007'")).rows[0].catalog_sha256,fingerprint);
    });
    await t.test('007 late DDL failure rolls back all new objects and preserves the predecessor ledger',async()=>{
      const target='psicopanel_episode_d2_rollback_'+randomUUID().replaceAll('-',''),other=await createSandboxDatabase(control,target);
      try{await installBaseline(other);await migrate(other,{expectedDatabase:target,target:'006'});const before=(await other.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows;
        await other.query('BEGIN');await other.query("SET LOCAL psicopanel.migration_target='007'");
        await assert.rejects(other.query((await loadMigrations()).find(m=>m.version==='007').sql+'\nSELECT missing_d2_fixture_function();'));await other.query('ROLLBACK');
        assert.equal((await other.query("SELECT to_regclass('public.professional_account_messages') AS relation")).rows[0].relation,null);
        assert.deepEqual((await other.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows,before);
      }finally{await other.end();}
    });
    const hash=await bcrypt.hash(password,4);
    for(const [id,role] of [['admin','admin'],['admin2','superadmin'],['support','support'],['pending','psychologist'],['rejected','psychologist'],['suspended','psychologist']]){
      await client.query("INSERT INTO users(id,first_name,email,password_hash,role) VALUES($1,$1,$2,$3,$4)",[id,id+'@d2.invalid',hash,role]);
      if(role==='psychologist')await client.query('INSERT INTO psychologist_profiles(user_id,approval_status,review_notes) VALUES($1,$2,$3)',[id,id==='pending'?'pending_review':id,'HISTORICAL_INTERNAL_SENTINEL']);}
    pool=new pg.Pool(connection(name));db.query=(...args)=>pool.query(...args);db.getClient=()=>pool.connect();env.d2Enabled=true;env.restrictedJwtSecret='D2-integration-ONLY-separate-19283746-Synthetic!';env.professionalMediaRoot=root;
    server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port+'/api';
    const request=async(route,id,method='GET',body,headers={})=>{const response=await fetch(base+route,{method,headers:{...(tokens[id]?{Authorization:'Bearer '+tokens[id]}:{}),...(body!==undefined&& !Buffer.isBuffer(body)?{'Content-Type':'application/json'}:{}),...headers},...(body===undefined?{}:{body:Buffer.isBuffer(body)?body:JSON.stringify(body)})});return {status:response.status,body:response.headers.get('content-type')?.includes('application/json')?await response.json():Buffer.from(await response.arrayBuffer()),headers:response.headers};};
    const login=async id=>{const result=await request('/auth/login',null,'POST',{email:['a','b'].includes(id)?id+'@episodes.invalid':id+'@d2.invalid',password});if(result.status===200)tokens[id]=result.body.data.token||result.body.data.restrictedToken;return result;};
    for(const id of ['a','b','admin','admin2','support'])assert.equal((await login(id)).status,200);
    await t.test('restricted states receive minimal sessions and cannot cross any protected route',async()=>{
      const routes=[['/patients','GET'],['/patients/p','GET'],['/patients/p/tasks','POST'],['/patients/p/interview','PUT'],['/appointments','GET'],['/appointments/waitlist','GET'],['/availability/me','GET'],['/availability/me/exceptions','GET'],['/reminders/me','GET'],['/auth/me','GET'],['/auth/users','GET'],['/auth/audit-logs','GET'],['/auth/care-relationships','GET'],['/auth/psychologists/pending','GET'],['/auth/psychologists/a/review','PATCH'],['/auth/identity','GET'],['/auth/contact-changes','GET'],['/auth/verification/email/request','POST'],['/professional-profile/me','GET'],['/professional-profile/me','POST'],['/professional-profile/me/photo','GET'],['/professional-profile/me/photo','POST'],['/professional-profile/me/credential-proposals','POST'],['/professional-reviews/pending','GET']];
      for(const[module,prefix]of [['patients','patients'],['appointments','appointments'],['availability','availability'],['reminders','reminders'],['auth','auth']]){
        const source=await fs.readFile(new URL(`../src/modules/${module}/${module}.routes.js`,import.meta.url),'utf8');
        for(const match of source.matchAll(/router\.(get|post|patch|put|delete)\('([^']+)'/g)){
          if(module==='auth'&&/^\/(login|register\/|password-reset\/)/.test(match[2]))continue;
          routes.push(['/'+prefix+(match[2]==='/'?'':match[2].replace(/:[a-zA-Z]+/g,'1')),match[1].toUpperCase()]);
        }
      }
      routes.push(['/professional-profile/me/photo/recover','POST'],['/professional-reviews/a/1/decision','POST']);
      for(const id of ['pending','rejected','suspended']){const result=await login(id);assert.equal(result.body.data.sessionKind,'restricted');assert.equal('user'in result.body.data,false);assert.equal('token'in result.body.data,false);
        const state=await request('/professional-status/me',id);assert.equal(state.status,200);assert.equal(JSON.stringify(state.body).includes('HISTORICAL_INTERNAL_SENTINEL'),false);
        for(const [route,method]of routes)assert.equal((await request(route,id,method,method==='GET'?undefined:{})).status,401,route);}
      assert.equal((await request('/professional-status/me','admin')).status,401);
      await client.query("UPDATE users SET is_active=false WHERE id='pending'");assert.equal((await request('/professional-status/me','pending')).status,401);assert.equal((await login('pending')).status,401);
      await client.query("UPDATE users SET is_active=true WHERE id='pending'");await login('pending');
    });
    let version;
    await t.test('owner profile is lazy, UUID-backed, private and protects fields, ownership and optimistic edits',async()=>{
      assert.equal((await request('/professional-profile/me','a')).body.data.profile,null);
      const created=await request('/professional-profile/me','a','POST',{});assert.equal(created.status,200);version=created.body.data.profile.rowVersion;assert.equal(version,'0');assert.equal(created.body.data.profile.isPublic,false);assert.equal(created.body.data.catalog.length,0);
      for(const payload of [{ownerId:'b'},{is_public:true},{isPublic:true},{acceptsNewPatients:true},{professionalName:'b'},{rowVersion:0}])assert.equal((await request('/professional-profile/me','a','PATCH',{rowVersion:version,...payload})).status,400);
      const edits=await Promise.all(['One','Two'].map(description=>request('/professional-profile/me','a','PATCH',{rowVersion:version,description})));assert.deepEqual(edits.map(r=>r.status).sort(),[200,409]);
      assert.equal((await request('/professional-profile/b','a')).status,404);
      assert.equal((await request('/professional-profile/me','support')).status,403);
      const row=(await request('/professional-profile/me','a')).body.data.profile;version=row.rowVersion;
      assert.equal((await request('/professional-profile/me','a','PATCH',{rowVersion:version,approachCodes:['invented']})).status,400);
    });
    const proposal=()=>({rowVersion:version,professionalName:'Fictional professional',professionalTitle:'Synthetic title',licenseNumber:'Fictional only',academicTraining:[],formalSpecialties:[],certifications:[],credentialedApproaches:[]});
    await t.test('credential snapshots are immutable, one pending and operational approval stays blocked',async()=>{
      const submitted=await request('/professional-profile/me/credential-proposals','a','POST',proposal());assert.equal(submitted.status,200);version=submitted.body.data.rowVersion;
      assert.equal((await request('/professional-profile/me/credential-proposals','a','POST',proposal())).status,409);
      await assert.rejects(client.query("UPDATE professional_credential_versions SET professional_name='changed' WHERE owner_user_id='a'"),/immutable/);
      for(const route of ['/professional-reviews/pending','/professional-reviews/a/1'])assert.equal((await request(route,'support')).status,403);
      const detail=await request('/professional-reviews/a/1','admin');assert.equal(detail.status,200);assert.equal(detail.body.data.approvalEnabled,false);
      assert.equal((await request('/professional-reviews/a/1/decision','admin','POST',{rowVersion:version,outcome:'approved',ownerMessage:'',evidenceReference:'arbitrary',evidenceSupported:true})).status,503);
      assert.equal((await request('/professional-reviews/a/1/decision','admin','POST',{rowVersion:version,outcome:'approved',ownerMessage:'',evidenceReference:'arbitrary',evidenceSupported:false})).status,400);
    });
    await t.test('two reviewers serialize an exact decision, owner sees message and never internal notes',async()=>{
      const body={rowVersion:version,outcome:'rejected',ownerMessage:'Please provide supported evidence.',internalNote:'RESERVED_INTERNAL_SENTINEL'};
      const results=await Promise.all(['admin','admin2'].map(id=>request('/professional-reviews/a/1/decision',id,'POST',body)));assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
      const credentials=await request('/professional-profile/me/credentials','a');assert.equal(credentials.body.data.pending,null);assert.equal(credentials.body.data.decisions[0].ownerMessage,body.ownerMessage);assert.equal(JSON.stringify(credentials.body).includes(body.internalNote),false);
      version=credentials.body.data.rowVersion;assert.equal((await request('/professional-reviews/a/1','admin')).status,409);
      const audit=await request('/auth/audit-logs','support');assert.equal(JSON.stringify(audit.body).includes(body.internalNote),false);
    });
    await t.test('synthetic-only policy exercises atomic promotion and rejection preserves approved snapshot',async()=>{
      await request('/professional-profile/me/credential-proposals','a','POST',proposal());version=(await request('/professional-profile/me','a')).body.data.profile.rowVersion;
      const actor=(await request('/auth/me','admin')).body.data;
      const body={rowVersion:version,outcome:'approved',ownerMessage:'Synthetic supported review.',evidenceReference:'isolated-fixture://evidence',evidenceSupported:true};
      await assert.rejects(decideCredential(actor,'admin','2',body));
      await decideCredential(actor,'a','2',body,{approvalPolicy:({owner,evidenceReference})=>owner==='a'&&evidenceReference==='isolated-fixture://evidence'});
      const approved=(await request('/professional-profile/me/credentials','a')).body.data;assert.equal(approved.approved.version,'2');assert.equal(approved.pending,null);version=approved.rowVersion;
      await request('/professional-profile/me/credential-proposals','a','POST',proposal());version=(await request('/professional-profile/me','a')).body.data.profile.rowVersion;
      await request('/professional-reviews/a/3/decision','admin','POST',{rowVersion:version,outcome:'rejected',ownerMessage:'Synthetic rejection.'});
      assert.equal((await request('/professional-profile/me/credentials','a')).body.data.approved.version,'2');version=(await request('/professional-profile/me','a')).body.data.profile.rowVersion;
    });
    await t.test('private photos validate, replace, retire, deny symlinks and retain historical files',async()=>{
      const input=await sharp({create:{width:30,height:20,channels:3,background:'red'}}).jpeg().toBuffer();
      assert.equal((await request('/professional-profile/me/photo','a','POST',input,{'Content-Type':'image/png','If-Match':version})).status,400);
      assert.equal((await request('/professional-profile/me/photo',null)).status,401);
      const upload=await request('/professional-profile/me/photo','a','POST',input,{'Content-Type':'image/jpeg','If-Match':version});assert.equal(upload.status,200);version=upload.body.data.rowVersion;
      const photo=await request('/professional-profile/me/photo','a');assert.equal(photo.status,200);assert.equal(photo.headers.get('cache-control'),'private, no-store');assert.equal((await sharp(photo.body).metadata()).exif,undefined);
      await request('/professional-profile/me','b','POST',{});assert.equal((await request('/professional-profile/me/photo','b')).status,404);
      const row=(await client.query('SELECT * FROM professional_photographs WHERE id=$1',[upload.body.data.id])).rows[0],file=path.join(root,row.storage_key+'.webp');
      const preserved=file+'.original';await fs.rename(file,preserved);await fs.symlink(preserved,file);assert.equal((await request('/professional-profile/me/photo','a')).status,503);await fs.unlink(file);await fs.rename(preserved,file);
      const replacement=await request('/professional-profile/me/photo','a','POST',input,{'Content-Type':'image/jpeg','If-Match':version});assert.equal(replacement.status,200);version=replacement.body.data.rowVersion;
      assert.equal((await client.query('SELECT status FROM professional_photographs WHERE id=$1',[row.id])).rows[0].status,'retired');await fs.access(file);
      assert.equal((await request('/professional-profile/me/photo','a','DELETE',{rowVersion:version})).status,200);assert.equal((await request('/professional-profile/me/photo','a')).status,404);version=(await request('/professional-profile/me','a')).body.data.profile.rowVersion;
      await fs.chmod(root,0o500);
      try{assert.equal((await request('/professional-profile/me/photo','a','POST',input,{'Content-Type':'image/jpeg','If-Match':version})).status,503);}finally{await fs.chmod(root,0o700);}
      await client.query("INSERT INTO professional_photographs(owner_user_id,version,status,byte_size) VALUES('b',1,'retired',8388608)");
      assert.equal((await request('/professional-profile/me/photo','b','POST',input,{'Content-Type':'image/jpeg','If-Match':'0'})).status,409);
      await client.query("INSERT INTO professional_photographs(owner_user_id,version,status) SELECT 'a',max(version)+1,'staged' FROM professional_photographs WHERE owner_user_id='a'");
      const recovered=await request('/professional-profile/me/photo/recover','a','POST',{rowVersion:version});assert.equal(recovered.status,200);version=recovered.body.data.rowVersion;
      assert.equal((await client.query("SELECT count(*)::int n FROM professional_photographs WHERE owner_user_id='a' AND status='staged'")).rows[0].n,0);
    });
    await t.test('all professional transitions revoke correctly and recovery never restores flags',async()=>{
      await client.query("UPDATE professional_publication_profiles SET is_public=true,accepts_new_patients=true,row_version=row_version+1 WHERE owner_user_id='a'");
      const ordinary=tokens.a;
      const result=await request('/auth/psychologists/a/review','admin','PATCH',{approvalStatus:'suspended',ownerMessage:'Explicit message for the owner.'});assert.equal(result.status,200);
      assert.ok([401,403].includes((await request('/patients', 'a')).status));await login('a');assert.equal((await request('/professional-status/me','a')).body.data.messages[0].message,'Explicit message for the owner.');
      const restricted=tokens.a,sv=(await client.query("SELECT session_version FROM users WHERE id='a'")).rows[0].session_version;
      await request('/auth/psychologists/a/review','admin','PATCH',{approvalStatus:'suspended'});assert.equal((await client.query("SELECT session_version FROM users WHERE id='a'")).rows[0].session_version,sv);
      await request('/auth/psychologists/a/review','admin','PATCH',{approvalStatus:'active'});tokens.a=restricted;assert.equal((await request('/professional-status/me','a')).status,401);tokens.a=ordinary;assert.equal((await request('/patients','a')).status,401);await login('a');
      const profile=(await request('/professional-profile/me','a')).body.data.profile;assert.equal(profile.isPublic,false);assert.equal(profile.acceptsNewPatients,false);
      for(const state of ['rejected','pending_review']){await client.query("UPDATE psychologist_profiles SET approval_status=$1 WHERE user_id='a'",[state]);await login('a');const prior=tokens.a;
        await client.query("UPDATE psychologist_profiles SET approval_status='suspended' WHERE user_id='a'");tokens.a=prior;assert.equal((await request('/professional-status/me','a')).status,401);}
      await login('a');await client.query("UPDATE users SET password_hash=$1 WHERE id='a'",[await bcrypt.hash(password,5)]);assert.equal((await request('/professional-status/me','a')).status,401);
      await client.query("UPDATE psychologist_profiles SET approval_status='active' WHERE user_id='a'");await login('a');
      await client.query("UPDATE users SET is_active=false WHERE id='admin2'");assert.equal((await request('/professional-reviews/pending','admin2')).status,401);
    });
    await t.test('new APIs never grant public exposure, clinical relationships or episode activation',async()=>{
      for(const route of ['/public/professionals','/public/professionals/a'])assert.equal((await request(route,null)).status,404);
      assert.equal((await request('/professional-profile/a/photo',null)).status,401);
      for(const [route,method]of [['/patients','POST'],['/auth/care-relationships/request','POST'],['/auth/care-relationships/invite','POST'],['/auth/care-relationships/1/respond','PATCH'],['/auth/care-relationships/accept-code','POST']])assert.equal((await request(route,'a',method,{})).status,403);
      assert.equal((await client.query('SELECT count(*)::int n FROM clinical_episodes')).rows[0].n,0);
      assert.equal((await client.query('SELECT count(*)::int n FROM care_relationships')).rows[0].n,2);
    });
    await t.test('a concurrent suspension serializes with editing and no stale session can commit',async()=>{
      const locker=new pg.Client(connection(name));await locker.connect();let attempt;
      try{await locker.query('BEGIN');await locker.query("SELECT id FROM users WHERE id='a' FOR NO KEY UPDATE");
        version=(await client.query("SELECT row_version::text AS version FROM professional_publication_profiles WHERE owner_user_id='a'")).rows[0].version;
        attempt=request('/professional-profile/me','a','PATCH',{rowVersion:version,description:'Must not persist after suspension'});
        let waiting=false;for(let count=0;count<100&&!waiting;count++){
          waiting=(await client.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=$1 AND wait_event_type='Lock' AND pid<>pg_backend_pid()) AS waiting",[name])).rows[0].waiting;
          if(!waiting)await new Promise(resolve=>setTimeout(resolve,10));
        }assert.equal(waiting,true,'HTTP writer must reach a real PostgreSQL lock');
        await locker.query("UPDATE psychologist_profiles SET approval_status='suspended' WHERE user_id='a'");await locker.query('COMMIT');assert.ok([401,403].includes((await attempt).status));
        assert.notEqual((await client.query("SELECT description FROM professional_publication_profiles WHERE owner_user_id='a'")).rows[0].description,'Must not persist after suspension');
      }finally{await locker.query('ROLLBACK');await locker.end();if(attempt)await attempt;}
    });
  }finally{
    if(server)await new Promise(resolve=>server.close(resolve));db.query=original.query;db.getClient=original.getClient;env.d2Enabled=original.enabled;env.restrictedJwtSecret=original.secret;env.professionalMediaRoot=original.root;
    if(pool)await pool.end();await client.end();control.release();
    // This exact mkdtemp directory is synthetic test storage, never a configured volume.
    assert.ok(root.startsWith(path.join(os.tmpdir(),'d2-media-')));await fs.rm(root,{recursive:true,force:true});
  }
});
