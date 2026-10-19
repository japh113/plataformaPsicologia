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
