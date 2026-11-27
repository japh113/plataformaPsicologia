import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import sharp from 'sharp';
import app from '../src/app.js';
import db from '../src/config/db.js';
import env from '../src/config/env.js';
import {createSandboxDatabase, installBaseline} from '../scripts/episode-sandbox.js';
import {installConsultationSandbox} from '../scripts/admission-directed-sandbox.js';
import {migrate} from '../scripts/episode-migration.js';
import {changeFixtureAccount, directoryCredentials, directoryEvidence, directoryReview, directoryReviewer,
  fixtureAccreditationExpiry, seedDirectoryProfessional} from '../scripts/directory-fixtures.js';

const publication = '/professional-profile/me/publication';
const own = '/professional-profile/me';
const profilePath = owner => '/directory/' + owner.publicId;
const privatePhoto = own + '/photo';
const fields = ['publicId','professionalName','photoUrl','professionalTitle','educationalInstitution','licenseNumber',
  'modality','city','state','description','approaches','acceptsNewPatients'];
const token = ({id,sessionVersion}) => jwt.sign({sub:id,sv:sessionVersion},env.jwtSecret,{expiresIn:'1h'});

test('D3 anonymous directory and owner publication on isolated PostgreSQL', {
  skip:process.env.RUN_EPISODE_INTEGRATION!=='true',
}, async t=>{
  assert.equal(env.nodeEnv,'test');
  assert.equal(env.localDevelopment,true);
  assert.equal(env.dbHost,'db');
  assert.equal(env.databaseUrl,'');
  assert.match(process.env.EPISODE_TEST_RUN_ID||'',/^[a-f0-9-]{36}$/);
  const config={host:'db',database:'psicopanel_integrity_test',user:env.dbUser,password:env.dbPassword};
  const control=new pg.Client(config);
  const database='psicopanel_episode_d3_'+randomUUID().replaceAll('-','');
  const previousEnv={d2Enabled:env.d2Enabled,manualAccreditationEnabled:env.manualAccreditationEnabled,
    directoryEnabled:env.directoryEnabled,professionalMediaRoot:env.professionalMediaRoot};
  const previousDb={query:db.query,getClient:db.getClient};
  let server, client, pool, media;
  try {
    await control.connect();
    client=await createSandboxDatabase(control,database);
    await installBaseline(client);
    const options=await installConsultationSandbox(client,database,{unifiedCare:true});
    await migrate(client,{...options,target:'023'});
    const passwordHash=await bcrypt.hash('Episode-Demo-Only-284!',4);
    await client.query(`
      INSERT INTO users(id,first_name,email,password_hash,role) VALUES
      ($1,'Revisión','reviewer@directory.invalid',$2,'admin'),
      ('directory-support','Apoyo','support@directory.invalid',$2,'support'),
      ('directory-historical','Profesional histórico','historical@directory.invalid',$2,'psychologist')
    `,[directoryReviewer.id,passwordHash]);
    await client.query("INSERT INTO psychologist_profiles(user_id,approval_status) VALUES('directory-historical','active')");
    await client.query(`
      INSERT INTO professional_general_approaches(code,label)
      VALUES('candidate_cbt','Cognitivo-conductual'),('candidate_humanist','Humanista'),
        ('unsupported_demo','Etiqueta interna fuera del catálogo de publicación')
    `);
    media=await mkdtemp(join(tmpdir(),'psicopanel-directory-test-'));
    Object.assign(env,{d2Enabled:true,manualAccreditationEnabled:true,directoryEnabled:true,professionalMediaRoot:media});
    pool=new pg.Pool({...config,database,user:options.consultationLegacyRole,password:'disposable_consultation_legacy'});
    db.query=(...args)=>pool.query(...args);
    db.getClient=()=>pool.connect();
    server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    const base='http://127.0.0.1:'+server.address().port+'/api';
    async function http(path,{actor,method='GET',body,headers={}}={}) {
      const res=await fetch(base+path,{
        method,headers:{...(actor?{Authorization:'Bearer '+token(actor)}:{}),
          ...(body && !Buffer.isBuffer(body)?{'Content-Type':'application/json'}:{}),...headers},
        body:Buffer.isBuffer(body)?body:body?JSON.stringify(body):undefined,
      });
      const payload=res.headers.get('content-type')?.includes('image/webp')
        ? Buffer.from(await res.arrayBuffer()) : await res.json();
      return {status:res.status,headers:res.headers,payload};
    }
    const expect=async(status,...args)=>{
      const result=await http(...args);
      assert.equal(result.status,status,JSON.stringify(Buffer.isBuffer(result.payload)?'image':result.payload));
      return result.payload.data;
    };
    const refresh=owner=>expect(200,own,{actor:owner.actor}).then(data=>data.profile);
    const preferences=async(owner,changes,status=200)=>expect(status,publication,{
      actor:owner.actor,method:'PATCH',body:{rowVersion:(await refresh(owner)).rowVersion,...changes},
    });
    const seed=(slug,name,license,options={})=>seedDirectoryProfessional(client,{slug,name,license,passwordHash,...options});
    const admin=directoryReviewer;
    const privateOwner=await seed('clara','Clara Montes','993001',{approaches:['candidate_cbt','unsupported_demo']});
    const other=await seed('bruno','Brúno Salgado','993002',{publishes:true,modality:'online',city:'Guadalajara',state:'Jalisco'});

    await t.test('private defaults, exact preview and independent owner choices',async()=>{
      const mine=await refresh(privateOwner);
      assert.equal(mine.isPublic,false);
      assert.equal(mine.acceptsNewPatients,false);
      const preview=await expect(200,publication,{actor:privateOwner.actor});
      assert.deepEqual(Object.keys(preview.profile).sort(),fields.slice().sort());
      assert.equal(preview.profile.description,'Atención presencial y en línea · Chihuahua');
      assert.deepEqual(preview.profile.approaches,['Cognitivo-conductual']);
      assert.doesNotMatch(JSON.stringify(preview.profile),/Contacto privado|Etiqueta interna|directory-clara|@/);
      const missing=await http(profilePath(privateOwner));
      assert.equal(missing.status,404);
      assert.deepEqual(missing.payload,(await http('/directory/'+randomUUID())).payload);
      await expect(401,publication);
      await expect(404,profilePath(privateOwner)+'/preview');
      for (const actor of [admin,{id:'directory-support',sessionVersion:0}]) {
        await expect(403,publication,{actor,method:'PATCH',body:{rowVersion:mine.rowVersion,isPublic:true}});
      }
      await expect(400,publication,{actor:other.actor,method:'PATCH',
        body:{rowVersion:(await refresh(other)).rowVersion,isPublic:true,ownerId:privateOwner.actor.id}});
      await expect(400,own,{actor:privateOwner.actor,method:'PATCH',
        body:{rowVersion:mine.rowVersion,city:'contacto@directory.invalid',state:'Chihuahua'}});
      const accepting=await preferences(privateOwner,{acceptsNewPatients:true});
      assert.deepEqual([accepting.isPublic,accepting.acceptsNewPatients],[false,true]);
      await expect(404,profilePath(privateOwner));
      await expect(409,publication,{actor:privateOwner.actor,method:'PATCH',
        body:{rowVersion:mine.rowVersion,isPublic:true}});
      assert.equal((await preferences(privateOwner,{acceptsNewPatients:false})).isPublic,false);
      const published=await preferences(privateOwner,{isPublic:true});
      assert.deepEqual([published.isPublic,published.acceptsNewPatients],[true,false]);
      const publicResult=await http(profilePath(privateOwner));
      assert.equal(publicResult.headers.get('cache-control'),'no-store');
      assert.equal(publicResult.headers.get('x-robots-tag'),'noindex, nofollow');
      assert.deepEqual(publicResult.payload.data,preview.profile);
      await expect(409,own,{actor:privateOwner.actor,method:'PATCH',
        body:{rowVersion:published.rowVersion,modality:null}});
    });

    const upload=async(owner,colour)=>{
      const png=await sharp({create:{width:48,height:48,channels:3,background:colour}}).png().toBuffer();
      return expect(200,privatePhoto,{actor:owner.actor,method:'POST',body:png,
        headers:{'Content-Type':'image/png','If-Match':(await refresh(owner)).rowVersion}});
    };
    let livePhoto;
    await t.test('only the current, eligible and expressly shared photo can be retrieved',async()=>{
      const first=await upload(privateOwner,'#4455aa');
      assert.equal((await refresh(privateOwner)).isPublic,false);
      const firstUrl=profilePath(privateOwner)+'/photo/'+first.id;
      await expect(404,firstUrl);
      await expect(200,privatePhoto,{actor:privateOwner.actor});
      await preferences(privateOwner,{isPublic:true,acceptsNewPatients:true});
      const photo=await http(firstUrl);
      assert.equal(photo.status,200);
      assert.equal(photo.headers.get('content-type'),'image/webp');
      assert.equal(photo.headers.get('cache-control'),'no-store');
      assert.equal((await sharp(photo.payload).metadata()).format,'webp');
      await expect(404,profilePath(other)+'/photo/'+first.id);
      await expect(404,profilePath(privateOwner)+'/photo/%2E%2E%2Fprivate.webp');
      await expect(404,profilePath(privateOwner)+'/photo/'+(await client.query(
        'SELECT storage_key FROM professional_photographs WHERE id=$1',[first.id])).rows[0].storage_key);
      const second=await upload(privateOwner,'#11aa77');
      livePhoto=profilePath(privateOwner)+'/photo/'+second.id;
      await expect(404,firstUrl);
      await expect(404,livePhoto);
      await preferences(privateOwner,{isPublic:true});
      await expect(200,livePhoto);
      await expect(404,firstUrl);
      const withdrawn=await preferences(privateOwner,{isPublic:false});
      assert.equal(withdrawn.acceptsNewPatients,true);
      assert.deepEqual((await http(firstUrl)).payload,(await http(livePhoto)).payload);
      await expect(404,livePhoto);
      await expect(404,profilePath(privateOwner));
      await preferences(privateOwner,{isPublic:true});
    });

    await t.test('manual history, expiry, later proposals and renewal cannot grant unintended visibility',async()=>{
      const historical={id:'directory-historical',sessionVersion:0};
      const legacy=(await expect(200,own,{actor:historical,method:'POST',body:{}})).profile;
      await expect(200,own,{actor:historical,method:'PATCH',body:{rowVersion:legacy.rowVersion,
        city:'Chihuahua',state:'Chihuahua',modality:'both'}});
      await preferences({actor:historical},{isPublic:true},409);
      await preferences({actor:historical},{acceptsNewPatients:true},409);
      await expect(404,'/directory/'+legacy.publicId);
      const approvals=await seed('pending','Elena Primera','993003',{publishes:true,accepts:true});
      const proposed=await expect(200,own+'/accreditation',{actor:approvals.actor,method:'POST',
        body:{rowVersion:(await refresh(approvals)).rowVersion,...directoryCredentials('Elena Reservada','993003')}});
      const detail=await expect(200,profilePath(approvals));
      assert.equal(detail.professionalName,'Elena Primera');
      assert.doesNotMatch(JSON.stringify(detail),/Reservada|Observación|SIM-DIRECTORY/);
      await fixtureAccreditationExpiry(client,approvals,{keepPreferences:true});
      assert.equal((await refresh(approvals)).isPublic,true);
      await expect(404,profilePath(approvals));
      assert.ok(!(await expect(200,'/directory')).profiles.some(item=>item.publicId===approvals.publicId));
      await preferences(approvals,{isPublic:true},409);
      await expect(200,`/professional-reviews/${approvals.actor.id}/${proposed.version}/manual-decision`,{actor:admin,method:'POST',
        body:directoryReview((await refresh(approvals)).rowVersion)});
      const renewed=await refresh(approvals);
      assert.deepEqual([renewed.isPublic,renewed.acceptsNewPatients],[false,false]);
      await expect(404,profilePath(approvals));
      await preferences(approvals,{isPublic:true});
      assert.equal((await expect(200,profilePath(approvals))).professionalName,'Elena Reservada');
    });

    async function waitForReaders(count) {
      for(let attempt=0;attempt<60;attempt++){
        const {waiting}= (await control.query(`
          SELECT count(*)::int AS waiting FROM pg_stat_activity
          WHERE datname=$1 AND wait_event_type='Lock' AND query LIKE '%FOR SHARE'
        `,[database])).rows[0];
        if(waiting>=count) return;
        await delay(8);
      }
      assert.fail('The anonymous read did not wait for the conflicting account lock.');
    }
    await t.test('suspension wins against concurrent publication and anonymous list, profile and photo reads',async()=>{
      const {rowVersion}=await refresh(privateOwner);
      await client.query('BEGIN');
      let requests=[];
      try {
        await client.query('SELECT id FROM users WHERE id=$1 FOR NO KEY UPDATE',[privateOwner.actor.id]);
        await client.query("UPDATE psychologist_profiles SET approval_status='suspended' WHERE user_id=$1",[privateOwner.actor.id]);
        requests=[
          http(profilePath(privateOwner)),http(livePhoto),http('/directory?name=Clara'),
          http(publication,{actor:privateOwner.actor,method:'PATCH',body:{rowVersion,isPublic:true}}),
        ];
        await waitForReaders(3);
        await client.query('COMMIT');
        const [profile,photo,list,publish]=await Promise.all(requests);
        assert.equal(profile.status,404);
        assert.equal(photo.status,404);
        assert.equal(list.status,200);
        assert.deepEqual(list.payload.data.profiles,[]);
        assert.ok([401,403,409].includes(publish.status));
      } finally {
        await client.query('ROLLBACK');
        await Promise.allSettled(requests);
      }
      await changeFixtureAccount(privateOwner.actor.id,'active');
      privateOwner.actor.sessionVersion=(await client.query('SELECT session_version FROM users WHERE id=$1',[privateOwner.actor.id])).rows[0].session_version;
      const after=await refresh(privateOwner);
      assert.deepEqual([after.isPublic,after.acceptsNewPatients],[false,false]);
      await expect(404,livePhoto);
      await preferences(privateOwner,{isPublic:true});
      await client.query('UPDATE users SET is_active=false WHERE id=$1',[privateOwner.actor.id]);
      await expect(404,profilePath(privateOwner));
      await expect(404,livePhoto);
      await expect(401,publication,{actor:privateOwner.actor});
      await client.query('UPDATE users SET is_active=true WHERE id=$1',[privateOwner.actor.id]);
      await expect(404,profilePath(privateOwner));
    });

    await t.test('an older approved snapshot stays public until a conflicting revalidation commits',async()=>{
      const owner=await seed('revalidation','Irene Primera','993004',{publishes:true,accepts:true});
      const proposed=await expect(200,own+'/accreditation',{actor:owner.actor,method:'POST',
        body:{rowVersion:(await refresh(owner)).rowVersion,...directoryCredentials('Irene Pendiente','993004')}});
      assert.equal((await expect(200,profilePath(owner))).professionalName,'Irene Primera');
      const rowVersion=(await refresh(owner)).rowVersion;
      const body={...directoryReview(rowVersion,'rejected',{...directoryEvidence(),institution:'discrepancy'}),
        priorImpact:{version:owner.version,message:'La comprobación anterior requiere revisión.',
          evidence:{...directoryEvidence(),institution:'discrepancy'}}};

      // Hold the real reviewer transaction immediately before its commit.
      const getClient=db.getClient;
      let ready,release,deciding=false;
      const atCommit=new Promise(resolve=>{ready=resolve;});
      const continueCommit=new Promise(resolve=>{release=resolve;});
      db.getClient=async()=>{
        const connection=await getClient();
        const hold=deciding;
        if (hold) deciding=false;
        return {
          query:async(sql,params)=>{
            if (hold && sql==='COMMIT'){ready();await continueCommit;}
            return connection.query(sql,params);
          },
          release:()=>connection.release(),
        };
      };
      let reading, decidingRequest;
      try {
        deciding=true;
        decidingRequest=http(`/professional-reviews/${owner.actor.id}/${proposed.version}/manual-decision`,{actor:admin,method:'POST',body});
        await Promise.race([atCommit,decidingRequest.then(()=>assert.fail('The review ended before its controlled commit.'))]);
        reading=http(profilePath(owner));
        await waitForReaders(1);
        release();
        assert.equal((await decidingRequest).status,200);
        assert.equal((await reading).status,404);
      } finally {
        release();
        await Promise.allSettled([decidingRequest,reading]);
        db.getClient=getClient;
      }
      await preferences(owner,{isPublic:true},409);
      await expect(200,`/professional-reviews/${owner.actor.id}/${owner.version}/revalidation`,{
        actor:admin,method:'POST',body:directoryReview((await refresh(owner)).rowVersion,'revalidated'),
      });
      const after=await refresh(owner);
      assert.deepEqual([after.isPublic,after.acceptsNewPatients],[false,false]);
      await expect(404,profilePath(owner));
    });

    await t.test('strict lookup filters, bounded pagination and anonymous availability',async()=>{
      for(let index=0;index<13;index++){
        const letters=['Alfa','Beta','Cielo','Delta','Eco','Faro','Gema','Hoja','Isla','Joya','Kilo','Lago','Miel'];
        await seed('pagination-'+index,'Grupo '+letters[index],String(994000+index),{publishes:true,accepts:index%2===0});
      }
      const first=await expect(200,'/directory?name=Grupo');
      assert.equal(first.profiles.length,12);
      assert.equal(first.hasMore,true);
      const second=await expect(200,'/directory?name=Grupo&page=2');
      assert.equal(second.profiles.length,1);
      assert.equal(second.hasMore,false);
      assert.ok(!first.profiles.some(item=>item.publicId===second.profiles[0].publicId));
      const params=new URLSearchParams({name:'Bruno',city:'Guadalajara',state:'Jalisco',modality:'online',accepting:'false'});
      const found=await expect(200,'/directory?'+params);
      assert.deepEqual(found.profiles.map(item=>item.publicId),[other.publicId]);
      assert.equal((await expect(200,'/directory?name=Grupo&modality=online&accepting=true')).profiles.length,7);
      assert.deepEqual((await expect(200,'/directory?name=Grupo&state=Jalisco')).profiles,[]);
      for(const query of ['page=101','page=01','city=Contacto','state=__proto__','accepting=1',
        'name=x&name=y','name=%25','modality=remote','state=Jalisco&city=Chihuahua','anything=1','name='+('A'.repeat(1100))]){
        await expect(400,'/directory?'+query);
      }
      env.directoryEnabled=false;
      try {
        await expect(404,'/directory');
        await expect(404,profilePath(other));
        await expect(404,publication,{actor:other.actor});
      } finally {env.directoryEnabled=true;}
    });

    await t.test('anonymous rate limiting applies before database and photo work',async()=>{
      let photoAttempts=0;
      for(let index=0;index<125;index++){
        const result=await http('/directory/'+randomUUID()+'/photo/'+randomUUID(),{headers:{'X-Forwarded-For':'192.0.2.'+(1+index)}});
        if(result.status===429){
          assert.equal(result.headers.get('cache-control'),'no-store');
          assert.ok(result.headers.get('retry-after'));
          photoAttempts=index;
          break;
        }
        assert.equal(result.status,404);
      }
      assert.ok(photoAttempts>0 && photoAttempts<120);
      await expect(429,profilePath(other));
    });
  }finally {
    if(server) await new Promise(resolve=>server.close(resolve));
    Object.assign(env,previousEnv);
    Object.assign(db,previousDb);
    if(pool) await pool.end();
    if(client) await client.end();
    await control.end();
    if(media) await rm(media,{recursive:true});
  }
});
