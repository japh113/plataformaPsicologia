import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import {newReference,referenceDigest,referenceBindingDigest,sealEmail,openEmail,validate,conditionsText,conditionsVersion,declarationVersion,errorFor} from '../src/modules/bilateral/bilateral.policy.js';

test('bilateral references use independent 256-bit secrets and bind kind and purpose without plaintext storage',()=>{
  const key=randomBytes(32),a=newReference('recipient',key),b=newReference('recipient',key);
  assert.notEqual(a.token,b.token);assert.equal(Buffer.from(a.token.split('.')[1],'base64url').length,32);
  assert.equal(referenceDigest(a.token,'recipient',key),a.digest);
  assert.notEqual(referenceDigest(a.token,'professional',key),a.digest);
  assert.notEqual(referenceDigest(a.token,'recipient',randomBytes(32)),a.digest);
  for(const token of [null,'',a.id,a.token+'x','https://example.invalid/'+a.token])assert.equal(referenceDigest(token,'recipient',key),null);
  assert.ok(!a.digest.includes(a.token.split('.')[1]));
  const binding=referenceBindingDigest(a.digest,'recipient','psy','account','patient',key);
  for(const tuple of [['other','account','patient'],['psy','other','patient'],['psy','account','other']])assert.notEqual(referenceBindingDigest(a.digest,'recipient',...tuple,key),binding);
});
test('bilateral encrypted destinations authenticate the exact receipt and encryption key',()=>{
  const key=randomBytes(32),id=randomUUID(),envelope=sealEmail('fictional@bilateral.invalid',id,key);
  assert.equal(openEmail(envelope,id,key),'fictional@bilateral.invalid');
  assert.throws(()=>openEmail(envelope,randomUUID(),key));assert.throws(()=>openEmail(envelope,id,randomBytes(32)));
  assert.ok(!JSON.stringify(envelope).includes('fictional'));
});
test('bilateral requires explicit exact-version human acts and rejects injected identities',()=>{
  const p={operationId:randomUUID(),email:'fictional@bilateral.invalid',recipientReference:'unknown',conditionsVersion,conditionsHash:'a'.repeat(64),declarationVersion,declared:true,proposed:true};
  validate('issue',p);
  for(const change of [{declared:false},{proposed:false},{patientId:'other'},{conditionsVersion:'stale'},{declarationVersion:'stale'}])assert.throws(()=>validate('issue',{...p,...change}));
  assert.throws(()=>validate('accept',{operationId:randomUUID(),expectedVersion:1,conditionsVersion,conditionsHash:'a'.repeat(64),confirmed:false}));
  assert.match(conditionsText('Profesional ficticio'),/No inicia tratamiento/);
  assert.match(conditionsText('Profesional ficticio'),/Cualquiera de las partes/);
});
test('bilateral errors suppress SQL, secrets and unexpected diagnostics',()=>{
  const e=errorFor(new Error('password=secret contact=private SQL-detail'));
  assert.equal(e.status,503);assert.ok(!e.message.includes('secret'));
  assert.equal(errorFor(new Error('bilateral_missing')).status,404);
  assert.equal(errorFor(new Error('bilateral_quota')).status,429);
});
