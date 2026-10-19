import test from 'node:test';
import assert from 'node:assert/strict';
process.env.VERIFICATION_DELIVERY='simulated';
process.env.VERIFICATION_SECRET='disposable-contact-test-key-at-least-32-bytes';
const {sealContact,openContact}=await import('../src/modules/auth/contact-change.crypto.js');
test('candidate encryption authenticates context, ciphertext, version and supports external key rotation',()=>{
  const oldKeys=process.env.CONTACT_CHANGE_KEYS,oldActive=process.env.CONTACT_CHANGE_ACTIVE_KEY_ID;
  try {
    process.env.CONTACT_CHANGE_KEYS=JSON.stringify({old:Buffer.alloc(32,7).toString('base64')});
    process.env.CONTACT_CHANGE_ACTIVE_KEY_ID='old';
    const value=sealContact('fictional@contact.invalid','candidate:account:request');
    assert.equal(JSON.stringify(value).includes('fictional'),false);
    assert.equal(openContact(value,'candidate:account:request'),'fictional@contact.invalid');
    assert.throws(()=>openContact(value,'notice:account:request'));
    assert.throws(()=>openContact({...value,tag:Buffer.alloc(16).toString('base64')},'candidate:account:request'));
    process.env.CONTACT_CHANGE_KEYS=JSON.stringify({old:Buffer.alloc(32,7).toString('base64'),next:Buffer.alloc(32,8).toString('base64')});
    process.env.CONTACT_CHANGE_ACTIVE_KEY_ID='next';
    const rotated=sealContact(openContact(value,'candidate:account:request'),'candidate:account:request');
    assert.equal(rotated.kid,'next');
    process.env.CONTACT_CHANGE_KEYS=JSON.stringify({next:Buffer.alloc(32,8).toString('base64')});
    assert.equal(openContact(rotated,'candidate:account:request'),'fictional@contact.invalid');
    assert.throws(()=>openContact(value,'candidate:account:request'));
  } finally {
    if(oldKeys===undefined)delete process.env.CONTACT_CHANGE_KEYS;else process.env.CONTACT_CHANGE_KEYS=oldKeys;
    if(oldActive===undefined)delete process.env.CONTACT_CHANGE_ACTIVE_KEY_ID;else process.env.CONTACT_CHANGE_ACTIVE_KEY_ID=oldActive;
  }
});


test('notice deadline terminates the underlying non-resolving worker and its heartbeat',async()=>{
  const {deliverContactNotice}=await import('../src/modules/auth/contact-change.delivery.js');
  const observation=new SharedArrayBuffer(4),counter=new Int32Array(observation);
  const start=Date.now();
  await assert.rejects(deliverContactNotice({noticeId:'fictional'},
    {workerUrl:new URL('./fixtures/contact-notice-worker.js',import.meta.url),workerData:{mode:'hang',observation},timeoutMs:700}),{code:'DELIVERY_TIMEOUT'});
  assert.ok(Atomics.load(counter,0)>0);assert.ok(Date.now()-start<2500);
  const stopped=Atomics.load(counter,0);await new Promise(resolve=>setTimeout(resolve,100));assert.equal(Atomics.load(counter,0),stopped);
});
test('notice deadline rejects non-finite/unbounded settings and successful worker is joined',async()=>{
  const {deliverContactNotice}=await import('../src/modules/auth/contact-change.delivery.js');
  for(const timeoutMs of [Infinity,NaN,0,-1,10001])await assert.rejects(deliverContactNotice({}, {timeoutMs}),{code:'INVALID_DELIVERY_DEADLINE'});
  await deliverContactNotice({noticeId:'fictional'},{workerUrl:new URL('./fixtures/contact-notice-worker.js',import.meta.url),workerData:{mode:'success'}});
});
