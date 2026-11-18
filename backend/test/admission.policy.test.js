import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { validate,fingerprint,errorFor } from '../src/modules/admission/admission.policy.js';
test('admission exact acts reject actor injection, stale shapes, nested malformed answers and excessive input',()=>{
  const p={operationId:randomUUID(),confirmed:true,expectedVersion:2,expectedRevision:0,answers:{reason:'Ficticio',context:'Ensayo'}};
  validate('save',p);
  for(const changed of [{...p,patientId:'other'},{...p,confirmed:false},{...p,expectedRevision:-1},{...p,answers:{reason:{text:'injection'}}},{...p,answers:{extra:'unknown'}},{...p,answers:{context:'a'.repeat(1001)}}])assert.throws(()=>validate('save',changed));
  assert.throws(()=>validate('submit',{...p,answers:undefined}));
});
test('admission idempotency binds nested response content and canonical order with keyed fingerprints',()=>{
  const key='independent-fictional-key';
  assert.equal(fingerprint({answers:{reason:'a',context:'b'},id:'c'},key),fingerprint({id:'c',answers:{context:'b',reason:'a'}},key));
  assert.notEqual(fingerprint({answers:{reason:'a'}},key),fingerprint({answers:{reason:'b'}},key));
  assert.notEqual(fingerprint({answers:{reason:'a'}},key),fingerprint({answers:{reason:'a'}},key+'x'));
});
test('admission errors contain no database, identity, answers or unexpected diagnostics',()=>{
  assert.equal(errorFor(new Error('admission_missing')).status,404);
  assert.equal(errorFor(new Error('admission_conflict')).status,409);
  assert.equal(errorFor(new Error('SQL secret@example.invalid private answer')).message,'Admisión temporalmente no disponible.');
});
