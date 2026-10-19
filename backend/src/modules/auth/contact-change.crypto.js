import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import env from '../../config/env.js';
import { verificationKey, assertDeliveryConfigured } from './verification.delivery.js';
const unavailable = () => Object.assign(new Error('Protección de cambios de contacto no configurada.'), { status: 503 });
function keyring() {
  // Disposable simulator only; remote deployments must supply a versioned external keyring.
  if (!process.env.CONTACT_CHANGE_KEYS && env.localDevelopment && env.verificationDelivery==='simulated') {
    assertDeliveryConfigured();
    return { active:'sandbox-v1', keys: { 'sandbox-v1': createHash('sha256').update(verificationKey()).update('contact-change-encryption').digest() } };
  }
  try {
    const input=JSON.parse(process.env.CONTACT_CHANGE_KEYS || '{}');
    const active=process.env.CONTACT_CHANGE_ACTIVE_KEY_ID;
    const keys=Object.fromEntries(Object.entries(input).map(([id,key])=>[id,Buffer.from(key,'base64')]));
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(active || '') || !keys[active] || Object.values(keys).some(k=>k.length!==32)) throw unavailable();
    return { active, keys };
  } catch { throw unavailable(); }
}
export function sealContact(value, context) {
  const {active,keys}=keyring(),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',keys[active],iv);
  cipher.setAAD(Buffer.from(context));
  const data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
  return { kid:active,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64') };
}
export function openContact(envelope, context) {
  try {
    const key=keyring().keys[envelope.kid]; if (!key) throw unavailable();
    const cipher=createDecipheriv('aes-256-gcm',key,Buffer.from(envelope.iv,'base64'));
    cipher.setAAD(Buffer.from(context));cipher.setAuthTag(Buffer.from(envelope.tag,'base64'));
    return Buffer.concat([cipher.update(Buffer.from(envelope.data,'base64')),cipher.final()]).toString('utf8');
  } catch { throw unavailable(); }
}
export const sessionHash = token => createHash('sha256').update(token).digest('hex');

export const activeContactKeyId = () => keyring().active;
