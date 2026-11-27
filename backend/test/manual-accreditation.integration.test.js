import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import env from '../src/config/env.js';
import db from '../src/config/db.js';
import {createSandboxDatabase, installBaseline} from '../scripts/episode-sandbox.js';
import {installConsultationSandbox} from '../scripts/admission-directed-sandbox.js';
import {migrate} from '../scripts/episode-migration.js';
import {closeBilateral} from '../src/modules/bilateral/bilateral.service.js';
import {closeAdmission} from '../src/modules/admission/admission.service.js';

const password = 'Episode-Demo-Only-284!';
const reviewer = 'reviewer', otherReviewer = 'other-reviewer', support = 'support';
const restricted = '/professional-status/me/accreditation';
const ordinary = '/professional-profile/me/accreditation';
const approvals = id => '/auth/psychologists/'+id+'/review';
const reviewPath = (user, version) => '/professional-reviews/'+user.id+'/'+version;
const evidence = {
  checkedOn:new Date().toISOString().slice(0,10), reference:'SIM-ACR-001', identityMethod:'simulated_official_id',
  license:'matches', holder:'matches', title:'matches', institution:'matches', identity:'matches',
};
const proposed = {professionalName:'Persona Ficticia',professionalTitle:'Licenciatura en Psicología',educationalInstitution:'Instituto de Ensayo',licenseNumber:'900017'};

test('023 manual accreditation in an isolated ordinary API, HTTP and PostgreSQL', {
  skip:process.env.RUN_EPISODE_INTEGRATION!=='true',
}, async t=>{
  assert.equal(env.localDevelopment,true);
  assert.equal(env.nodeEnv,'test');
  assert.equal(env.dbHost,'db');
  assert.equal(env.databaseUrl,'');
  assert.match(process.env.EPISODE_TEST_RUN_ID||'',/^[a-f0-9-]{36}$/);
  const config={host:'db',database:'psicopanel_integrity_test',user:env.dbUser,password:env.dbPassword};
  const control=new pg.Client(config);
  await control.connect();
  const database='psicopanel_episode_acr_'+randomUUID().replaceAll('-','');
  const dbFunctions={query:db.query,getClient:db.getClient};
  const envOriginal={d2Enabled:env.d2Enabled, manualAccreditationEnabled:env.manualAccreditationEnabled, restrictedJwtSecret:env.restrictedJwtSecret};
  let pgClient,pool,server;
  try{
    pgClient=await createSandboxDatabase(control,database);
    await installBaseline(pgClient);
    const options=await installConsultationSandbox(pgClient,database,{unifiedCare:true});
    await migrate(pgClient,{...options,target:'023'});
    assert.equal((await migrate(pgClient,{...options,target:'023'})).status,'already-applied');
    const hash=await bcrypt.hash(password,4);
    await pgClient.query(`
      INSERT INTO users(id,email,first_name,last_name,role,password_hash)
      VALUES ($1,'reviewer@accreditation.invalid','Revisión','Ficticia','admin',$4),
        ($2,'second@accreditation.invalid','Otra','Revisión','superadmin',$4),
        ($3,'support@accreditation.invalid','Apoyo','Ficticio','support',$4)
    `,[reviewer,otherReviewer,support,hash]);
    Object.assign(env,{d2Enabled:true,manualAccreditationEnabled:true,restrictedJwtSecret:'fictional-independent-restricted-key-285713'});
    Object.assign(process.env,{
      BILATERAL_ENABLED:'true',BILATERAL_SECRET:'isolated-accreditation-bilateral-key-at-least-32-bytes',
      BILATERAL_DATABASE_URL:`postgres://${options.bilateralClientRole}:disposable_bilateral_roles@db:5432/${database}`,
      ADMISSION_ENABLED:'true',ADMISSION_SECRET:'isolated-accreditation-admission-key-at-least-32-bytes',
      ADMISSION_DATABASE_URL:`postgres://${options.admissionClientRole}:disposable_admission_roles@db:5432/${database}`,
      FIRST_CONSULTATION_ENABLED:'true',UNIFIED_CARE_ENABLED:'true',
    });
    pool=new pg.Pool({...config,database,user:options.consultationLegacyRole,password:'disposable_consultation_legacy'});
    db.query=(...args)=>pool.query(...args);
    db.getClient=()=>pool.connect();
    server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));

    const token=id=>jwt.sign({sub:id,sv:0},env.jwtSecret,{expiresIn:'1h'});
    const http=async(path,bearer,payload,method=payload?'POST':'GET')=>{
      const response=await fetch('http://127.0.0.1:'+server.address().port+'/api'+path,{
        method,headers:{'Content-Type':'application/json',...(bearer?{Authorization:'Bearer '+bearer}:{})},
        ...(payload?{body:JSON.stringify(payload)}:{}),
      });
      return {status:response.status,body:await response.json()};
    };
    const expect=async(status,...args)=>{
      const result=await http(...args);
      assert.equal(result.status,status,JSON.stringify(result.body));return result.body.data;
    };
    const login=email=>expect(200,'/auth/login',null,{email,password});
    const register=async(label)=>{
      const email=label+'@accreditation.invalid';
      const accepted=await http('/auth/register/psychologist',null,{
        email,password,firstName:'Persona',lastName:'Ficticia',professionalTitle:proposed.professionalTitle,licenseNumber:proposed.licenseNumber,
      });
      assert.equal(accepted.status,202,JSON.stringify(accepted.body));
      const id=(await pgClient.query('SELECT id FROM users WHERE email=$1',[email])).rows[0].id;
      const session=await login(email);
      assert.equal(session.sessionKind,'restricted');
      assert.ok(!session.token&&!session.user);
      return {id,email,restrictedToken:session.restrictedToken};
    };
    const read=(user)=>expect(200,restricted,user.restrictedToken);
    const submit=async(user,changes={})=>expect(200,restricted,user.restrictedToken,{rowVersion:(await read(user)).rowVersion,...proposed,...changes});
    const detail=(user,version)=>expect(200,reviewPath(user,version),token(reviewer));
    const decision=(user,version,body,actor=reviewer)=>{
      const review={outcome:'approved',message:'Mensaje ficticio para la persona.',internalNote:'Reservado ACR',evidence,...body};
      return http(reviewPath(user,version)+'/manual-decision',token(actor),review);
    };
    const account=(user,status='active')=>http(approvals(user.id),token(reviewer),{approvalStatus:status,reviewNotes:'',ownerMessage:'Resolución de cuenta.'},'PATCH');
    let first,firstVersion,rejectedVersion;
    await t.test('registration, strict restricted scope and a database gate on first activation',async()=>{
      first=await register('first');
      const status=await expect(200,'/professional-status/me',first.restrictedToken);
      assert.equal(status.manualOnboarding,true);
      assert.equal((await account(first)).status,409);
      await assert.rejects(pool.query("UPDATE psychologist_profiles SET approval_status='active' WHERE user_id=$1",[first.id]),{code:'23514'});
      await assert.rejects(pool.query("DELETE FROM psychologist_profiles WHERE user_id=$1",[first.id]),{code:'23514'});
      await expect(401,'/patients',first.restrictedToken);
      await expect(401,'/availability/me',first.restrictedToken);
      await expect(401,'/appointments',first.restrictedToken);
      await expect(401,'/professional-reviews/pending',first.restrictedToken);
      await expect(401,ordinary,first.restrictedToken);
      await expect(401,restricted,token(reviewer));
      await expect(400,restricted,first.restrictedToken,{...proposed,rowVersion:'0',certifications:['No autorizada']});
      firstVersion=(await submit(first)).version;
      await assert.rejects(pool.query(`
        INSERT INTO professional_credential_decisions(owner_user_id,credential_version,outcome,reviewer_user_id,reviewer_role,owner_message)
        VALUES($1,$2,'rejected',$3,'admin','Resolución sin evidencia')
      `,[first.id,firstVersion,reviewer]),{code:'23514'});
      await expect(409,restricted,first.restrictedToken,{...proposed,rowVersion:'0'});
      await expect(403,'/professional-reviews/pending',token(support));
      await expect(403,'/professional-reviews/pending',token(first.id));
    });
    await t.test('insufficient evidence, inconclusive, correction and exact versions',async()=>{
      let current=await detail(first,firstVersion);
      assert.equal(current.pending.educationalInstitution,proposed.educationalInstitution);
      assert.equal((await decision(first,firstVersion,{rowVersion:current.rowVersion,evidence:{...evidence,holder:'discrepancy'}})).status,400);
      assert.equal((await decision(first,firstVersion,{rowVersion:current.rowVersion,outcome:'rejected',evidence:{...evidence,license:'unavailable'}})).status,400);
      const inconclusive=await decision(first,firstVersion,{rowVersion:current.rowVersion,outcome:'inconclusive',evidence:{...evidence,license:'unavailable'}});
      assert.equal(inconclusive.status,200,JSON.stringify(inconclusive.body));
      const owner=await read(first);
      assert.equal(owner.pending.version,firstVersion);
      assert.equal(owner.events[0].outcome,'inconclusive');
      assert.doesNotMatch(JSON.stringify(owner),/Reservado ACR|SIM-ACR|reviewer|license_result/i);
      assert.equal((await decision(first,firstVersion,{rowVersion:current.rowVersion})).status,409);
      current=await detail(first,firstVersion);
      assert.equal((await decision(first,firstVersion,{rowVersion:current.rowVersion,outcome:'returned'})).status,200);
      assert.equal((await read(first)).pending,null);
      rejectedVersion=(await submit(first,{educationalInstitution:'Instituto Corregido'})).version;
      assert.notEqual(firstVersion,rejectedVersion);
      assert.equal((await decision(first,firstVersion,{rowVersion:current.rowVersion})).status,409);
    });
    await t.test('competing reviewers and two owners claiming the same cédula',async()=>{
      const competing=await register('competing');
      const competingVersion=(await submit(competing,{licenseNumber:'000900017'})).version;
      let a=await detail(first,rejectedVersion),b=await detail(competing,competingVersion);
      const attempts=await Promise.all([
        decision(first,rejectedVersion,{rowVersion:a.rowVersion}),
        decision(first,rejectedVersion,{rowVersion:a.rowVersion},otherReviewer),
        decision(competing,competingVersion,{rowVersion:b.rowVersion},otherReviewer),
      ]);
      assert.deepEqual(attempts.map(result=>result.status).sort(),[200,409,409]);
      const claims=(await pgClient.query('SELECT owner_user_id FROM professional_manual_license_claims')).rows;
      assert.equal(claims.length,1);
      const winner=claims[0].owner_user_id===first.id?first:competing;
      const loser=winner===first?competing:first;
      const version=winner===first?rejectedVersion:competingVersion;
      assert.equal((await read(loser)).events.filter(event=>event.outcome==='approved').length,0);
      assert.equal((await read(winner)).approved.version,version);
      assert.equal((await account(winner)).status,200);
      await expect(401,restricted,winner.restrictedToken);
      const session=await login(winner.email);
      assert.ok(session.token);
      const self=await expect(200,ordinary,session.token);
      assert.equal(self.approved.version,version);
      const patients=await expect(200,'/patients',session.token);
      assert.deepEqual(patients,[]);
      await expect(200,'/availability/me',session.token);
      await expect(403,'/patients',session.token,{firstName:'Ficticia'});
      await expect(403,'/bilateral-invitations/professional-reference',session.token,{operationId:randomUUID()});
      await pgClient.query(`
        INSERT INTO bilateral_restrictions(psychologist_id,state,justification)
        VALUES($1,'enabled','Autorización bilateral exclusivamente ficticia para esta prueba')
      `,[winner.id]);
      const invitations=await http('/bilateral-invitations/professional-reference',session.token,{operationId:randomUUID()});
      assert.equal(invitations.status,200,JSON.stringify(invitations.body));
      await expect(403,reviewPath(winner,version)+'/manual-decision',session.token,{});

      const proposedUpdate=await expect(200,ordinary,session.token,{...proposed,rowVersion:self.rowVersion,licenseNumber:'900018'});
      a=await detail(winner,proposedUpdate.version);
      const rejection=await decision(winner,proposedUpdate.version,{
        rowVersion:a.rowVersion,outcome:'rejected',evidence:{...evidence,title:'discrepancy'},
      });
      assert.equal(rejection.status,200,JSON.stringify(rejection.body));
      assert.equal((await expect(200,ordinary,session.token)).approved.version,version);
      let renewal=await expect(200,reviewPath(winner,version)+'/revalidation',token(reviewer));
      await expect(200,reviewPath(winner,version)+'/revalidation',token(reviewer),{
        rowVersion:renewal.rowVersion,outcome:'revalidation_requested',message:'Aviso ficticio verificable.',evidence,
      });
      assert.equal((await expect(200,ordinary,session.token)).validity.requiresReview,true);
      renewal=await expect(200,reviewPath(winner,version)+'/revalidation',token(reviewer));
      await expect(200,reviewPath(winner,version)+'/revalidation',token(reviewer),{
        rowVersion:renewal.rowVersion,outcome:'revalidated',message:'Comprobación ficticia renovada.',evidence,
      });
      const renewed=await expect(200,ordinary,session.token);
      assert.equal(renewed.approved.version,version);
      assert.equal(renewed.validity.current,true);
      assert.equal(renewed.events.filter(event=>event.version===version).length,3);
      const logs=await expect(200,'/auth/audit-logs',token(reviewer));
      assert.doesNotMatch(JSON.stringify(logs),/SIM-ACR|Reservado ACR/);
      const expired=(await pgClient.query(`
        INSERT INTO professional_manual_reviews(owner_user_id,credential_version,reviewer_user_id,reviewer_role,
          outcome,owner_message,source_code,checked_on,source_reference,license_result,holder_result,
          title_result,institution_result,identity_method,identity_result)
        VALUES($1,$2,$3,'admin','revalidated','Ensayo de vencimiento','simulated_registry',
          (clock_timestamp() AT TIME ZONE 'UTC')::date - interval '12 months','EXP',
          'matches','matches','matches','matches','simulated_official_id','matches')
        RETURNING id,checked_on::text,(checked_on + interval '12 months')::date::text AS valid_until
      `,[winner.id,version,reviewer])).rows[0];
      await pgClient.query(`
        UPDATE professional_credential_validity SET evidence_reference=$3,valid_from=$4,valid_until=$5,row_version=row_version+1
        WHERE owner_user_id=$1 AND credential_version=$2
      `,[winner.id,version,expired.id,expired.checked_on,expired.valid_until]);
      assert.equal((await expect(200,ordinary,session.token)).validity.current,false);
      await expect(200,'/availability/me',session.token);
      assert.equal((await account(loser,'suspended')).status,200);
      await expect(401,restricted,loser.restrictedToken);
      await expect(401,restricted,(await login(loser.email)).restrictedToken);
    });
    await t.test('suspension committed during a review invalidates the decision and the restricted session',async()=>{
      const subject=await register('suspension-race');
      const version=(await submit(subject,{licenseNumber:'900019'})).version;
      const previous=await detail(subject,version);
      await pgClient.query('BEGIN');
      let attempt;
      try{
        await pgClient.query('SELECT id FROM users WHERE id=$1 FOR NO KEY UPDATE',[subject.id]);
        attempt=decision(subject,version,{rowVersion:previous.rowVersion});
        let waiting=false;
        for(let i=0;i<60&&!waiting;i++){
          waiting=(await control.query(`
            SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=$1 AND wait_event_type='Lock'
              AND query LIKE '%FROM users%ORDER BY id FOR NO KEY UPDATE%') AS waiting
          `,[database])).rows[0].waiting;
          if(!waiting)await delay(25);
        }
        assert.equal(waiting,true);
        await pgClient.query("UPDATE psychologist_profiles SET approval_status='suspended' WHERE user_id=$1",[subject.id]);
        await pgClient.query('COMMIT');
        assert.equal((await attempt).status,403);
        await expect(401,restricted,subject.restrictedToken);
        assert.equal((await pgClient.query('SELECT 1 FROM professional_manual_reviews WHERE owner_user_id=$1',[subject.id])).rowCount,0);
      }finally{
        await pgClient.query('ROLLBACK');
        await attempt;
      }
    });
  }finally{
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    await closeAdmission();await closeBilateral();
    Object.assign(db,dbFunctions);
    Object.assign(env,envOriginal);
    if(pool)await pool.end();
    if(pgClient)await pgClient.end();
    await control.end();
  }
});
