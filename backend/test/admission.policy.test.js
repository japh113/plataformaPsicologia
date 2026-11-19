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
test('admission assessments require explicit risk, exact submission, expected versions and reject identity or content injection',()=>{
  const p={operationId:randomUUID(),confirmed:true,expectedVersion:3,expectedRevision:1,episodeId:'12',submission:1,riskLevel:'unevaluated',context:''};
  validate('assess',p);validate('record',{});
  for(const extra of [{riskLevel:'unknown'},{context:'a'.repeat(10001)},{submission:0},{expectedRevision:0},{episodeId:12},{actorId:'forged'},{assignmentId:randomUUID()},{confirmed:false}])assert.throws(()=>validate('assess',{...p,...extra}));
  assert.equal(errorFor(Object.assign(new Error('admission_conflict'),{code:'P0001'})).status,409);
});
test('directed commands bind exact professional versions and correction decisions without dates or patient authorship injection',()=>{
  const act={operationId:randomUUID(),confirmed:true,expectedVersion:4};
  const document={...act,expectedDocumentRevision:0,declarations:{reason:'Declaración ficticia',context:'Contexto declarado'}};
  validate('directed-document',document);validate('directed-attest',act);validate('directed-record',{});
  for(const extra of [{authorId:'patient'},{performedAt:'2026-11-18'},{expectedDocumentRevision:-1},{declarations:{reason:'missing context'}},{declarations:{reason:'',context:'b'}}])assert.throws(()=>validate('directed-document',{...document,...extra}));
  const decision={...act,expectedDocumentRevision:1,requestId:randomUUID(),decision:'reject',explanation:'Explicación destinada al paciente'};
  validate('directed-resolve',decision);validate('directed-resolve',{...decision,decision:'accept',declarations:document.declarations});
  assert.throws(()=>validate('directed-resolve',{...decision,decision:'accept'}));
  assert.throws(()=>validate('directed-resolve',{...decision,declarations:document.declarations}));
  assert.throws(()=>validate('directed-request',{...act,documentRevision:1,reason:' '}));
});
