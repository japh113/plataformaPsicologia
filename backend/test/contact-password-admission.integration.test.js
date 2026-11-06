import test from 'node:test';
import assert from 'node:assert/strict';
import {fork,spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import app from '../src/app.js';
import db from '../src/config/db.js';
import env from '../src/config/env.js';
import {migrate,catalogChecksum,loadMigrations} from '../scripts/episode-migration.js';
import {createSandboxDatabase,installBaseline,syntheticFixture} from '../scripts/episode-sandbox.js';
import {installContactAdmissionSchema} from '../scripts/contact-admission-sandbox.js';
import {purgeContactPasswordAdmissions} from '../src/modules/auth/contact-password-admission.js';

test('012 contact bcrypt admission: isolated PostgreSQL HTTP and multiple processes',{
  skip:process.env.RUN_EPISODE_INTEGRATION!=='true',
},async t=>{
  assert.equal(env.dbHost,'db');assert.equal(env.dbName,'psicopanel_integrity_test');assert.equal(env.nodeEnv,'test');
  assert.match(process.env.EPISODE_TEST_RUN_ID||'',/^[a-f0-9-]{36}$/);
  const control=await db.getClient(),name='psicopanel_episode_bcrypt_admission',client=await createSandboxDatabase(control,name);
  const originalQuery=db.query,originalGet=db.getClient,originalCompare=bcrypt.compare;
  let pool,server,calls=0,index=0;
  const password='Fictional-Admission-Only-482!';
  try {
    await installBaseline(client);
    const options=await installContactAdmissionSchema(client,name);
    await syntheticFixture(client);
    pool=new pg.Pool({host:'db',database:name,user:env.dbUser,password:env.dbPassword,max:4});
    db.query=(sql,args)=>pool.query(sql,args);db.getClient=()=>pool.connect();
    bcrypt.compare=(...args)=>{calls++;return originalCompare(...args);};
    server=app.listen(0,'127.0.0.1');await once(server,'listening');
    const base='http://127.0.0.1:'+server.address().port+'/api/auth';
    const req=async(path,token,body,url=base)=>{
      const response=await fetch(url+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
      return {status:response.status,body:await response.json(),retryAfter:Number(response.headers.get('Retry-After')),cache:response.headers.get('Cache-Control')};
    };
    const login=async email=>(await req('/login',null,{email,password})).body.data;
    const account=async()=>{
      const email='admission-'+(++index)+'@fixture.invalid';
      assert.equal((await req('/register/patient',null,{firstName:'Ficticia',email,password,birthDate:'1990-01-01',phone:'+525599'+String(index).padStart(6,'0')})).status,202);
      return login(email);
    };
    const payload=()=>({operationId:randomUUID(),channel:'email',contact:'candidate-'+randomUUID()+'@fixture.invalid',password});
    const start=(a,p=payload(),url)=>req('/contact-changes',a.token,p,url);
    const reauth=(a,id,pw=password,url)=>req('/contact-changes/'+id+'/reauthenticate',a.token,{password:pw},url);
    const count=async(a,action='password_admitted')=>(await client.query('SELECT count(*)::int n FROM contact_change_events WHERE user_id=$1 AND action=$2',[a.user.id,action])).rows[0].n;
    const snapshot=async()=>{
      const result={};
      for(const table of ['users','patients','contact_change_requests','contact_verification_challenges','contact_verification_state','contact_change_notices','password_reset_tokens','clinical_episodes','care_relationships','appointments','patient_clinical_notes','patient_tasks'])
        result[table]=(await client.query('SELECT to_jsonb(t) data FROM '+table+' t ORDER BY to_jsonb(t)::text')).rows;
      return result;
    };
    const intercept=async(handler,action)=>{
      const get=db.getClient;
      db.getClient=async()=>{const c=await pool.connect();let admission=false;return {release:error=>c.release(error),query:async(sql,args)=>{
        if(String(sql).includes("VALUES($1,NULL,'password_admitted')"))admission=true;
        return handler({sql:String(sql),args,c,admission});
      }};};
      try{return await action();}finally{db.getClient=get;}
    };

    await t.test('012 full chain replay ledger historical checksums and restricted contracts stay enforced',async()=>{
      const ledger=(await client.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows;
      assert.equal(ledger.length,12);assert.equal(ledger.at(-1).catalog_sha256,await catalogChecksum(client));
      assert.equal((await migrate(client,options)).status,'already-applied');
      assert.deepEqual((await client.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows,ledger);
      await assert.rejects(migrate(client,{...options,target:'011'}),/downgrade/);
      await client.query('GRANT SELECT ON contact_change_events TO '+options.accountReaderRole);
      // Deliberately make ledger fingerprint match: special 009 contract must still reject.
      await client.query("UPDATE psicopanel_schema_migrations SET catalog_sha256=$1 WHERE version='012'",[await catalogChecksum(client)]);
      await assert.rejects(migrate(client,options),/009 account lock security contract/);
      await client.query('REVOKE SELECT ON contact_change_events FROM '+options.accountReaderRole);
      await client.query("UPDATE psicopanel_schema_migrations SET catalog_sha256=$1 WHERE version='012'",[ledger.at(-1).catalog_sha256]);
      assert.equal((await migrate(client,options)).status,'already-applied');
      assert.equal((await loadMigrations()).length,12);
    });
    await t.test('012 upgrade rollback and concurrent replay preserve 011 ledger and all special contracts',async()=>{
      const nextName='psicopanel_episode_bcrypt_upgrade',next=await createSandboxDatabase(control,nextName);
      try {
        await installBaseline(next);const prior=await installContactAdmissionSchema(next,nextName,{target:'011'});
        const before=(await next.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows,checksum=await catalogChecksum(next);
        const broken={query:(sql,args)=>next.query(String(sql).includes('DROP CONSTRAINT contact_change_events_action_check')?sql+' SELECT 1/0;':sql,args)};
        await assert.rejects(migrate(broken,{...prior,target:'012'}),/division by zero/);
        assert.equal(await catalogChecksum(next),checksum);assert.deepEqual((await next.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows,before);
        const second=new pg.Client({host:'db',database:nextName,user:env.dbUser,password:env.dbPassword});await second.connect();
        try {
          const results=await Promise.all([migrate(next,{...prior,target:'012'}),migrate(second,{...prior,target:'012'})]);
          assert.deepEqual(results.map(r=>r.status).sort(),['already-applied','applied']);
        }finally{await second.end();}
        assert.deepEqual((await next.query("SELECT * FROM psicopanel_schema_migrations WHERE version<'012' ORDER BY version")).rows,before);
        const finalChecksum=await catalogChecksum(next);
        const resolver='psicopanel_origin_resolver_owner_'+(await next.query('SELECT oid FROM pg_database WHERE datname=current_database()')).rows[0].oid;
        for(const [role,pattern] of [[prior.privateNoteCreatorRole,/010 private note security contract/],[resolver,/011 origin resolver contract/]]) {
          await next.query('GRANT SELECT ON contact_change_events TO '+role);
          await next.query("UPDATE psicopanel_schema_migrations SET catalog_sha256=$1 WHERE version='012'",[await catalogChecksum(next)]);
          await assert.rejects(migrate(next,{...prior,target:'012'}),pattern);
          await next.query('REVOKE SELECT ON contact_change_events FROM '+role);
          await next.query("UPDATE psicopanel_schema_migrations SET catalog_sha256=$1 WHERE version='012'",[finalChecksum]);
          assert.equal((await migrate(next,{...prior,target:'012'})).status,'already-applied');
        }
        const cli=spawnSync(process.execPath,['scripts/migrate.js','--target=012','--database='+nextName],{encoding:'utf8',env:{...process.env,MIGRATION_DATABASE_URL:'postgres://integrity_test:disposable_test_password@db/'+nextName}});
        assert.equal(cli.status,0,'012 CLI replay must verify inferred restricted roles');
        assert.equal(JSON.parse(cli.stdout).version,'012');
        await next.query('ALTER TABLE contact_change_events DROP CONSTRAINT contact_change_admission_without_request');
        await assert.rejects(migrate(next,{...prior,target:'012'}),/Schema drift/);
      }finally{await next.end();}
    });
    await t.test('012 correct idempotent starts consume ten reservations and 429 precedes bcrypt without mutations',async()=>{
      const a=await account(),p=payload(),before=calls;
      for(let i=0;i<10;i++)assert.equal((await start(a,p)).status,200);
      assert.equal(calls-before,10);assert.equal(await count(a),10);assert.equal(await count(a,'started'),1);
      const state=await snapshot(),limited=await start(a,p);
      assert.equal(limited.status,429);assert.ok(limited.retryAfter>0&&limited.retryAfter<=900);assert.equal(limited.cache,'no-store');
      assert.equal(calls-before,10);assert.deepEqual(await snapshot(),state);assert.equal(await count(a),10);
      // A new operation ID cannot reset technical quota (nor create another pending change).
      const other=payload();other.replaceRequestId=p.operationId;
      assert.equal((await start(a,other)).status,429);assert.equal(calls-before,10);
      assert.equal((await req('/me',a.token)).status,200);
    });
    await t.test('012 terminal and conflicting idempotent starts still require a fresh reserved password',async()=>{
      const a=await account(),p=payload();assert.equal((await start(a,p)).status,200);const before=calls;
      assert.equal((await start(a,{...p,contact:'different@fixture.invalid'})).status,409);
      assert.equal((await start(a,{...p,password:'Wrong-Replay-Only'})).status,400);
      assert.equal((await req('/contact-changes/'+p.operationId+'/cancel',a.token,{})).status,200);
      const result=await start(a,p);assert.equal(result.status,200);assert.equal(result.body.data.request.status,'cancelled');
      assert.equal(calls-before,3);assert.equal(await count(a),4);assert.equal(await count(a,'started'),1);
    });
    await t.test('012 repeated correct reauthentication shares starts sessions and channels budget',async()=>{
      const a=await account(),p=payload();assert.equal((await start(a,p)).status,200);
      const second=await login(a.user.email),before=calls;
      for(let i=0;i<9;i++)assert.equal((await reauth(i%2?a:second,p.operationId)).status,200);
      const state=await snapshot();assert.equal((await reauth(a,p.operationId)).status,429);
      assert.equal(calls-before,9);assert.equal(await count(a),10);assert.deepEqual(await snapshot(),state);
      const b=await account();assert.equal((await start(b)).status,200);
    });
    await t.test('012 idempotent wrong and malformed passwords retain five failure limit',async()=>{
      const a=await account(),p=payload();assert.equal((await start(a,p)).status,200);const before=calls;
      for(const pw of ['Wrong-Only-1','Wrong-Only-2',null,{},'x'.repeat(73)])assert.equal((await start(a,{...p,password:pw})).status,400);
      assert.equal(calls-before,2);assert.equal(await count(a,'password_failed'),5);assert.equal(await count(a),6);
      const state=await snapshot(),result=await start(a,p);assert.equal(result.status,429);assert.ok(result.retryAfter>0);
      assert.equal(calls-before,2);assert.deepEqual(await snapshot(),state);assert.ok(await login(a.user.email));
    });
    await t.test('012 concurrency bounded to ten durable reservations with one comparison each and one start',async()=>{
      const a=await account(),p=payload(),before=calls;
      const results=await Promise.all(Array.from({length:12},()=>start(a,p)));
      assert.equal(results.filter(r=>r.status===200).length,10);assert.equal(results.filter(r=>r.status===429).length,2);
      assert.equal(await count(a),10);assert.equal(calls-before,10);assert.equal(await count(a,'started'),1);
    });
    await t.test('012 functional quota rejects before reserve bcrypt or pending expiry cleanup',async()=>{
      const a=await account(),p=payload();assert.equal((await start(a,p)).status,200);
      await client.query("UPDATE contact_change_requests SET created_at=clock_timestamp()-INTERVAL '25 hours',expires_at=clock_timestamp()-INTERVAL '1 hour' WHERE id=$1",[p.operationId]);
      for(let i=0;i<4;i++)await client.query("INSERT INTO contact_change_events(user_id,action) VALUES($1,'started')",[a.user.id]);
      const before=calls,state=await snapshot(),admissions=await count(a);
      const result=await start(a);assert.equal(result.status,429);assert.ok(result.retryAfter>0);
      assert.equal(calls,before);assert.equal(await count(a),admissions);assert.deepEqual(await snapshot(),state);
    });
    await t.test('012 rollback after actual bcrypt preserves consumed admission and no functional effects',async()=>{
      const a=await account(),p=payload(),state=await snapshot(),before=calls;
      const result=await intercept(async({sql,args,c})=>{
        if(sql.startsWith('INSERT INTO contact_change_requests'))return c.query('SELECT 1/0');
        return c.query(sql,args);
      },()=>start(a,p));
      assert.equal(result.status,503);assert.equal(calls-before,1);assert.equal(await count(a),1);assert.deepEqual(await snapshot(),state);
      assert.equal((await start(a,p)).status,200);assert.equal(await count(a),2);assert.equal(calls-before,2);
    });
    await t.test('012 connection loss after bcrypt keeps admission and rolls back all functional writes',async()=>{
      const a=await account(),p=payload(),before=calls,state=await snapshot();let killed=false;
      const result=await intercept(async({sql,args,c})=>{
        if(sql.startsWith('INSERT INTO contact_change_requests')&&!killed){
          killed=true;await client.query('SELECT pg_terminate_backend($1)',[c.processID]);
        }
        return c.query(sql,args);
      },()=>start(a,p));
      assert.equal(result.status,503);assert.equal(calls-before,1);assert.equal(await count(a),1);assert.deepEqual(await snapshot(),state);
    });
    await t.test('012 lost admission commit response never compares and never refunds confirmed event',async()=>{
      const a=await account(),before=calls;let injected=false;
      const result=await intercept(async({sql,args,c,admission})=>{
        const value=await c.query(sql,args);
        if(admission&&sql==='COMMIT'&&!injected){injected=true;throw Error('Synthetic lost response');}
        return value;
      },()=>start(a));
      assert.equal(result.status,503);assert.equal(await count(a),1);assert.equal(calls,before);
    });
    await t.test('012 session revocation between transactions is revalidated before comparison',async()=>{
      const a=await account(),before=calls;let changed=false;
      const result=await intercept(async({sql,args,c,admission})=>{
        const value=await c.query(sql,args);
        if(admission&&sql==='COMMIT'&&!changed){changed=true;await client.query('UPDATE users SET session_version=session_version+1 WHERE id=$1',[a.user.id]);}
        return value;
      },()=>start(a));
      assert.equal(result.status,401);assert.equal(await count(a),1);assert.equal(calls,before);
      assert.equal((await req('/me',a.token)).status,401);
    });
    await t.test('012 changed password and fifth concurrent failure between A and B never use stale authority',async()=>{
      const a=await account(),before=calls;let changed=false;
      const newHash=await bcrypt.hash('New-Fictional-Password-Only-491!',4);
      const result=await intercept(async({sql,args,c,admission})=>{
        const value=await c.query(sql,args);
        if(admission&&sql==='COMMIT'&&!changed){changed=true;await client.query('UPDATE users SET password_hash=$2 WHERE id=$1',[a.user.id,newHash]);}
        return value;
      },()=>start(a));
      assert.equal(result.status,401);assert.equal(calls,before);assert.equal(await count(a),1);
      const b=await account(),beforeB=calls;let injected=false;
      const blocked=await intercept(async({sql,args,c,admission})=>{
        const value=await c.query(sql,args);
        if(admission&&sql==='COMMIT'&&!injected){injected=true;await client.query("INSERT INTO contact_change_events(user_id,action) SELECT $1,'password_failed' FROM generate_series(1,5)",[b.user.id]);}
        return value;
      },()=>start(b));
      assert.equal(blocked.status,429);assert.equal(calls,beforeB);assert.equal(await count(b),1);
    });
    await t.test('012 PostgreSQL lock timeout is infrastructure error before any comparison',async()=>{
      const a=await account(),lock=await pool.connect(),before=calls;
      await lock.query('BEGIN');await lock.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[a.user.id]);
      try {
        const result=await start(a);assert.equal(result.status,503);assert.equal(result.retryAfter,0);assert.equal(calls,before);assert.equal(await count(a),0);
      }finally{await lock.query('ROLLBACK');lock.release();}
    });
    await t.test('012 expired reservation is a distinct temporary error without bcrypt or authority mutation',async()=>{
      const a=await account(),p=payload();assert.equal((await start(a,p)).status,200);
      const before=calls,state=await snapshot();let aged=false;
      const result=await intercept(async({sql,args,c,admission})=>{
        const value=await c.query(sql,args);
        if(admission&&sql==='COMMIT'&&!aged){aged=true;await client.query("UPDATE contact_change_events SET created_at=clock_timestamp()-INTERVAL '11 seconds' WHERE user_id=$1 AND action='password_admitted'",[a.user.id]);}
        return value;
      },()=>reauth(a,p.operationId));
      assert.equal(result.status,503);assert.match(JSON.stringify(result.body),/comprobación venció/);
      assert.equal(calls,before);assert.equal(await count(a),2);assert.deepEqual(await snapshot(),state);
    });
    await t.test('012 window recovery uses PostgreSQL time and does not delete consumed history',async()=>{
      const a=await account(),p=payload();assert.equal((await start(a,p)).status,200);
      for(let i=0;i<9;i++)await client.query("INSERT INTO contact_change_events(user_id,action) VALUES($1,'password_admitted')",[a.user.id]);
      const before=calls;assert.equal((await start(a,p)).status,429);assert.equal(calls,before);
      await client.query("UPDATE contact_change_events SET created_at=clock_timestamp()-INTERVAL '901 seconds' WHERE user_id=$1 AND action='password_admitted'",[a.user.id]);
      assert.equal((await start(a,p)).status,200);assert.equal(calls-before,1);assert.equal(await count(a),11);
    });
    await t.test('012 Retry-After releases the correct slot with more than ten synthetic events',async()=>{
      const a=await account(),before=calls;
      await client.query("INSERT INTO contact_change_events(user_id,action,created_at) SELECT $1,'password_admitted',clock_timestamp()-((900-g)*INTERVAL '1 second') FROM generate_series(1,12) g",[a.user.id]);
      const result=await start(a);assert.equal(result.status,429);assert.ok(result.retryAfter>=2&&result.retryAfter<=3);
      assert.equal(calls,before);assert.equal(await count(a),12);
    });
    await t.test('012 retention removes only admissions older than 24 hours and preserves active windows and security history',async()=>{
      const a=await account();
      for(const [action,age] of [['password_admitted',86500],['password_admitted',901],['password_admitted',899],['password_failed',86500],['started',86500],['reauthenticated',86500]])
        await client.query("INSERT INTO contact_change_events(user_id,action,created_at) VALUES($1,$2,clock_timestamp()-($3*INTERVAL '1 second'))",[a.user.id,action,age]);
      const before=(await client.query("SELECT * FROM contact_change_events WHERE user_id=$1 AND action<>'password_admitted' ORDER BY id",[a.user.id])).rows;
      await Promise.all([purgeContactPasswordAdmissions(),purgeContactPasswordAdmissions()]);
      assert.equal(await count(a),2);assert.deepEqual((await client.query("SELECT * FROM contact_change_events WHERE user_id=$1 AND action<>'password_admitted' ORDER BY id",[a.user.id])).rows,before);
      assert.equal((await client.query("SELECT count(*)::int n FROM contact_change_events WHERE user_id=$1 AND action='password_admitted' AND created_at>clock_timestamp()-INTERVAL '900 seconds'",[a.user.id])).rows[0].n,1);
    });
    await t.test('012 retention is bounded to one thousand eligible technical events per tick',async()=>{
      const a=await account();
      await client.query("INSERT INTO contact_change_events(user_id,action,created_at) SELECT $1,'password_admitted',clock_timestamp()-INTERVAL '25 hours' FROM generate_series(1,1002)",[a.user.id]);
      const first=await purgeContactPasswordAdmissions();assert.equal(first.rowCount,1000);assert.equal(await count(a),2);
      const second=await purgeContactPasswordAdmissions();assert.equal(second.rowCount,2);assert.equal(await count(a),0);
    });
    await t.test('012 two independent backend processes share quota and each instruments actual bcrypt',async()=>{
      const a=await account(),p=payload();assert.equal((await start(a,p)).status,200);
      const child=fork(new URL('./fixtures/contact-admission-worker.js',import.meta.url),[],{env:{...process.env,PGDATABASE:name},silent:true});
      try {
        const [{port}]=await once(child,'message',{signal:AbortSignal.timeout(10000)});
        const remote='http://127.0.0.1:'+port+'/api/auth',before=calls;
        const results=await Promise.all(Array.from({length:11},(_,i)=>reauth(a,p.operationId,password,i%2?remote:base)));
        assert.equal(results.filter(r=>r.status===200).length,9);assert.equal(results.filter(r=>r.status===429).length,2);
        const message=once(child,'message',{signal:AbortSignal.timeout(5000)});child.send('calls');const [{calls:otherCalls}]=await message;
        assert.equal(calls-before+otherCalls,9);assert.equal(await count(a),10);
        assert.equal((await reauth(a,p.operationId,password,remote)).status,429);
      } finally {child.kill('SIGTERM');await once(child,'exit',{signal:AbortSignal.timeout(10000)});}
    });
  } finally {
    bcrypt.compare=originalCompare;db.query=originalQuery;db.getClient=originalGet;
    if(server)await new Promise(resolve=>server.close(resolve));if(pool)await pool.end();
    await client.end();control.release();await db.close();
  }
});
