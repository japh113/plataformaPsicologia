import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import env from '../../config/env.js';

const mailbox = '/tmp/psicopanel-verification-mailbox';
const messages = [];
export function verificationKey() {
  const secret = env.verificationSecret || (env.localDevelopment && ['test','development'].includes(env.nodeEnv) ? env.jwtSecret : '');
  if (Buffer.byteLength(secret) < 32) throw Object.assign(new Error('Verificación no configurada.'), { status: 503 });
  return createHash('sha256').update(secret).digest();
}
function simulatedDeliveryAllowed() {
  return env.localDevelopment && ['test','development'].includes(env.nodeEnv) &&
    env.verificationDelivery === 'simulated' &&
    (env.nodeEnv === 'test' || (/^[a-f0-9-]{36}$/.test(process.env.EPISODE_TEST_RUN_ID || '') &&
      env.dbHost === 'db' && env.dbName === 'psicopanel_episode_demo'));
}
export function assertDeliveryConfigured() {
  if (!simulatedDeliveryAllowed()) throw Object.assign(new Error('Entrega de verificación no disponible temporalmente.'), { status: 503 });
  verificationKey();
}
// Adapter boundary: only the local simulator is implemented. No network providers.
export async function deliverVerification(message) {
  assertDeliveryConfigured();
  if (env.nodeEnv === 'test') { messages.push({ ...message }); return; }
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', verificationKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(message), 'utf8'), cipher.final()]);
  await fs.mkdir(mailbox, { recursive: true, mode: 0o700 });
  await fs.writeFile(mailbox + '/' + randomBytes(16).toString('hex') + '.json',
    JSON.stringify({ iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), data: encrypted.toString('hex') }),
    { mode: 0o600, flag: 'wx' });
}
export function testDeliveries() {
  if (env.nodeEnv !== 'test') throw new Error('Test-only mailbox');
  return messages;
}
// Local CLI only; never mounted in Express or returned by an HTTP endpoint.
export async function readSimulatedMailbox(userId) {
  assertDeliveryConfigured();
  if (env.nodeEnv !== 'development') throw new Error('Development-only mailbox');
  const files = await fs.readdir(mailbox).catch(() => []);
  const result = [];
  for (const file of files) {
    const envelope = JSON.parse(await fs.readFile(mailbox + '/' + file, 'utf8'));
    const cipher = createDecipheriv('aes-256-gcm', verificationKey(), Buffer.from(envelope.iv, 'hex'));
    cipher.setAuthTag(Buffer.from(envelope.tag, 'hex'));
    const message = JSON.parse(Buffer.concat([cipher.update(Buffer.from(envelope.data, 'hex')), cipher.final()]).toString('utf8'));
    if (message.userId === userId) result.push(message);
  }
  return result.sort((a,b) => a.createdAt.localeCompare(b.createdAt));
}
