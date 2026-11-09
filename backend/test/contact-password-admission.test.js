import test from 'node:test';
import assert from 'node:assert/strict';
import {createContactPasswordOperation} from '../src/modules/auth/contact-password-admission.js';

const actor={id:'fictional-user',patientId:'fictional-patient',role:'patient',sessionVersion:0,sessionHash:'fictional-session'};
function harness({uncertainCommit=false,compareError=false,expired=false,failedBudget=false,expiredMonotonic=false,beginFailureAt=0,setFailureAt=0,setFailureIndex=1,rollbackFailure=false,commitFailureAt=0}={}) {
  let commits=0,reservations=0,calls=0,releases=0,preflights=0,clockReads=0,begins=0,sets=0,rollbacks=0;
  const releaseErrors=[];
  const client={release(error){releases++;releaseErrors.push(error);},async query(sql){
    if(sql.startsWith('BEGIN')){begins++;sets=0;if(begins===beginFailureAt)throw Error('Synthetic uncertain BEGIN');}
    if(sql.startsWith('SET LOCAL')){sets++;if(begins===setFailureAt&&sets===setFailureIndex)throw Error('Synthetic SET failure');}
    if(sql==='ROLLBACK'){rollbacks++;if(rollbackFailure)throw Error('Synthetic rollback failure');}
    if(sql.includes('SELECT id,patient_id'))return {rows:[{id:actor.id,patient_id:actor.patientId,email:'f@unit.invalid',session_version:0,password_hash:'fresh-hash'}]};
    if(sql.includes('to_char(global_birth_date'))return {rows:[{id:actor.patientId,phone:null}]};
    if(sql==='SELECT clock_timestamp() AS now')return {rows:[{now:new Date()}]};
    if(sql.startsWith('WITH sample'))return {rows:[{retry_after:failedBudget?15:0}]};
    if(sql.includes("VALUES($1,NULL,'password_admitted')")){reservations++;return {rows:[{id:'1'}]};}
    if(sql.startsWith('SELECT EXISTS'))return {rows:[{valid:!expired}]};
    if(sql==='COMMIT'){commits++;if((uncertainCommit&&commits===1)||commits===commitFailureAt)throw Error('Synthetic lost commit response');}
    return {rows:[]};
  }};
  const run=createContactPasswordOperation({database:{getClient:async()=>client},nowNs:()=>expiredMonotonic&&clockReads++?10000000000n:0n,
    compare:async(password,hash)=>{calls++;assert.equal(hash,'fresh-hash');if(compareError)throw Error('Synthetic compare error');return true;}});
  return {run:action=>run(actor,'fictional-password',async()=>{preflights++;return {};},action),
    recovery:()=>({begins,rollbacks,releaseErrors}),
    counts:()=>({commits,reservations,calls,releases,preflights})};
}

test('contact bcrypt executor commits admission before one comparison and revalidates twice',async()=>{
  const h=harness();assert.equal(await h.run(async()=>{assert.equal(h.counts().commits,1);return 'done';}),'done');
  assert.deepEqual(h.counts(),{commits:2,reservations:1,calls:1,releases:1,preflights:2});
});
test('contact bcrypt executor never retries a throwing comparison or reuses its reservation',async()=>{
  const h=harness({compareError:true});await assert.rejects(h.run(async()=>assert.fail('No business action')),{status:503});
  assert.equal(h.counts().calls,1);assert.equal(h.counts().reservations,1);assert.equal(h.counts().commits,1);
});
test('contact bcrypt executor fails closed on uncertain admission commit and expired reservation',async()=>{
  for(const options of [{uncertainCommit:true},{expired:true},{expiredMonotonic:true}]) {
    const h=harness(options);await assert.rejects(h.run(async()=>assert.fail('No action')),{status:503});
    assert.equal(h.counts().calls,0);assert.equal(h.counts().reservations,1);assert.equal(h.counts().releases,1);
  }
});
test('contact bcrypt executor rejects exhausted admission before reserve compare or business action',async()=>{
  const h=harness({failedBudget:true});await assert.rejects(h.run(async()=>assert.fail('No action')),{status:429,retryAfter:15});
  assert.equal(h.counts().calls,0);assert.equal(h.counts().reservations,0);assert.equal(h.counts().commits,0);
});

test('contact bcrypt executor discards any uncertain BEGIN in A or B without attempting rollback',async()=>{
  for(const beginFailureAt of [1,2]) {
    const h=harness({beginFailureAt});await assert.rejects(h.run(async()=>assert.fail('No business action')),{status:503});
    assert.equal(h.counts().calls,0);assert.equal(h.counts().reservations,beginFailureAt===1?0:1);
    assert.equal(h.recovery().rollbacks,0);assert.ok(h.recovery().releaseErrors[0] instanceof Error);
  }
});
test('contact bcrypt executor rolls back each SET LOCAL failure after acknowledged BEGIN in both stages',async()=>{
  for(const setFailureAt of [1,2])for(const setFailureIndex of [1,2,3]) {
    const h=harness({setFailureAt,setFailureIndex});await assert.rejects(h.run(async()=>assert.fail('No action')),{status:503});
    assert.equal(h.recovery().rollbacks,1);assert.equal(h.recovery().releaseErrors[0],undefined);
    assert.equal(h.counts().calls,0);assert.equal(h.counts().reservations,setFailureAt===1?0:1);
  }
});
test('contact bcrypt executor discards failed rollback after confirmed BEGIN in either stage',async()=>{
  for(const setFailureAt of [1,2]) {
    const h=harness({setFailureAt,rollbackFailure:true});await assert.rejects(h.run(async()=>assert.fail('No action')),{status:503});
    assert.equal(h.recovery().rollbacks,1);assert.ok(h.recovery().releaseErrors[0] instanceof Error);assert.equal(h.counts().calls,0);
  }
});
test('contact bcrypt executor preserves discard on uncertain COMMIT in admission and functional transaction',async()=>{
  for(const commitFailureAt of [1,2]) {
    const h=harness({commitFailureAt});await assert.rejects(h.run(async()=>true),{status:503});
    assert.equal(h.recovery().rollbacks,0);assert.ok(h.recovery().releaseErrors[0] instanceof Error);
    assert.equal(h.counts().reservations,1);assert.equal(h.counts().calls,commitFailureAt===1?0:1);
  }
});
