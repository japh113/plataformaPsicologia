import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import db from '../../config/db.js';
import { normalizeEmail, normalizePhone } from './identity.validation.js';
import { assertDeliveryConfigured, deliverVerification, verificationKey } from './verification.delivery.js';

const fail = (message, status = 400, retryAfter = 0) => Object.assign(new Error(message), { status, retryAfter });
const digest = value => createHmac('sha256', verificationKey()).update(value).digest('hex');
const contactDigest = (channel, contact) => digest('contact:' + channel + ':' + contact);
const secretDigest = (id, secret) => digest('challenge:' + id + ':' + secret);
export function ensurePatientIdentityOwner(actor) {
  if (actor?.role !== 'patient' || !actor.patientId) throw fail('Solo el paciente puede administrar su identidad.', 403);
}
async function currentIdentity(client, actor, lock = false) {
  ensurePatientIdentityOwner(actor);
  // Always lock account first; every verifier/identity writer uses the same order.
  const account = (await client.query(`SELECT id,patient_id,email FROM users
    WHERE id=$1 AND patient_id=$2 AND role='patient' AND is_active=true ${lock ? 'FOR UPDATE' : ''}`,
  [actor.id, actor.patientId])).rows[0];
  if (!account) throw fail('Sesión no válida.', 401);
  const patient = (await client.query(`SELECT id,first_name,last_name,phone,
    to_char(global_birth_date,'YYYY-MM-DD') AS birth_date FROM patients WHERE id=$1 ${lock ? 'FOR UPDATE' : ''}`,
  [account.patient_id])).rows[0];
  if (!patient) throw fail('Identidad no disponible.', 403);
  return { ...patient, userId: account.id, email: normalizeEmail(account.email), phone: normalizePhone(patient.phone) };
}
const contactFor = (identity, channel) => channel === 'email' ? identity.email : identity.phone;
function ensureChannel(channel) {
  if (!['email','sms'].includes(channel)) throw fail('Canal inválido.');
}
export async function getOwnIdentity(actor) {
  const identity = await currentIdentity(db, actor);
  const states = (await db.query('SELECT channel,contact_digest,verified_at FROM contact_verification_state WHERE user_id=$1', [actor.id])).rows;
  const verifiedAt = channel => {
    const contact = contactFor(identity, channel);
    return contact ? states.find(s => s.channel === channel && s.contact_digest === contactDigest(channel, contact))?.verified_at || null : null;
  };
  return { firstName: identity.first_name, lastName: identity.last_name, birthDate: identity.birth_date,
    email: identity.email, phone: identity.phone,
    emailVerifiedAt: verifiedAt('email'), phoneVerifiedAt: verifiedAt('sms') };
}
export async function updateOwnIdentity(actor, payload) {
  ensurePatientIdentityOwner(actor);
  const allowed = ['firstName', 'lastName'];
  if (!Object.keys(payload).length || Object.keys(payload).some(k => !allowed.includes(k)) ||
      Object.values(payload).some(v => typeof v !== 'string' || v.trim().length > 100) ||
      ('firstName' in payload && !payload.firstName.trim())) {
    throw fail('Solo puedes editar nombre y apellido. Contactos y correcciones de DOB requieren un flujo posterior.');
  }
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const current = await currentIdentity(client, actor, true);
    const firstName = (payload.firstName ?? current.first_name).trim();
    const lastName = (payload.lastName ?? current.last_name).trim();
    await client.query('UPDATE patients SET first_name=$2,last_name=$3,full_name=$4,updated_at=NOW() WHERE id=$1',
      [actor.patientId, firstName, lastName, (firstName + ' ' + lastName).trim()]);
    await client.query('UPDATE users SET first_name=$2,last_name=$3,updated_at=NOW() WHERE id=$1', [actor.id, firstName, lastName]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
  return getOwnIdentity(actor);
}
export async function requestVerification(actor, channel) {
  ensurePatientIdentityOwner(actor); ensureChannel(channel); assertDeliveryConfigured();
  const client = await db.getClient();
  let message;
  try {
    await client.query('BEGIN');
    const current = await currentIdentity(client, actor, true);
    if (channel === 'sms') {
      const evidence = (await client.query("SELECT contact_digest FROM contact_verification_state WHERE user_id=$1 AND channel='email'", [actor.id])).rows[0];
      if (!evidence || evidence.contact_digest !== contactDigest('email', current.email)) {
        throw fail('Verifica primero tu correo para solicitar un SMS.', 409);
      }
    }
    const contact = contactFor(current, channel);
    if (!contact) throw fail('El contacto no tiene un formato verificable. Su cambio estará disponible en una entrega posterior.', 409);
    const destination = contactDigest(channel, contact);
    // Shared across ALL accounts/instances; no caller-supplied destination or lock key.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 4082))', [destination]);
    const now = (await client.query('SELECT clock_timestamp() AS now')).rows[0].now;
    const recent = (await client.query(`SELECT created_at FROM contact_verification_challenges
      WHERE channel=$1 AND contact_digest=$2 AND created_at > $3::timestamptz - INTERVAL '24 hours'
      ORDER BY created_at`, [channel, destination, now])).rows;
    const ownRecent = (await client.query(`SELECT created_at FROM contact_verification_challenges
      WHERE channel=$1 AND user_id=$2 AND created_at > $3::timestamptz - INTERVAL '24 hours'
      ORDER BY created_at`, [channel, actor.id, now])).rows;
    const last = [...recent, ...ownRecent].sort((a,b) => a.created_at - b.created_at).at(-1)?.created_at;
    let retryAfter = last ? Math.max(0, Math.ceil((last.getTime() + 60000 - now.getTime()) / 1000)) : 0;
    if (recent.length >= 5) retryAfter = Math.max(retryAfter, Math.ceil((recent[0].created_at.getTime() + 86400000 - now.getTime()) / 1000));
    if (ownRecent.length >= 5) retryAfter = Math.max(retryAfter, Math.ceil((ownRecent[0].created_at.getTime() + 86400000 - now.getTime()) / 1000));
    if (retryAfter) throw fail('Verificación temporalmente limitada. Intenta más tarde.', 429, retryAfter);
    const id = randomUUID();
    const previous = channel === 'sms' ? (await client.query(
      'SELECT id,secret_digest FROM contact_verification_challenges WHERE user_id=$1 AND channel=$2 ORDER BY created_at DESC LIMIT 5',
      [actor.id, channel])).rows : [];
    let secret;
    do {
      secret = channel === 'email' ? randomBytes(32).toString('base64url') : String(randomInt(1000000)).padStart(6, '0');
    } while (previous.some(old => old.secret_digest === secretDigest(old.id, secret)));
    const expiresAt = new Date(now.getTime() + (channel === 'email' ? 86400000 : 600000));
    await client.query(`UPDATE contact_verification_challenges SET invalidated_at=$3
      WHERE user_id=$1 AND channel=$2 AND invalidated_at IS NULL AND consumed_at IS NULL`, [actor.id, channel, now]);
    await client.query(`INSERT INTO contact_verification_challenges
      (id,user_id,channel,contact_digest,secret_digest,created_at,expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`, [id, actor.id, channel, destination, secretDigest(id, secret), now, expiresAt]);
    await client.query('COMMIT');
    message = { userId: actor.id, channel, contact, challengeId: id, secret,
      createdAt: now.toISOString(), expiresAt: expiresAt.toISOString() };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
  try { await deliverVerification(message); }
  catch {
    await db.query('UPDATE contact_verification_challenges SET invalidated_at=clock_timestamp() WHERE id=$1', [message.challengeId]);
    throw fail('No se pudo entregar la verificación. Espera antes de reintentar.', 503);
  }
  // The secret is delivered only by the adapter, never in an API response.
  return { sent: true, expiresAt: message.expiresAt, retryAfter: 60 };
}
export async function confirmVerification(actor, channel, payload = {}) {
  ensurePatientIdentityOwner(actor); ensureChannel(channel);
  const secret = payload.secret;
  if (Object.keys(payload).some(k => k !== 'secret') || typeof secret !== 'string' ||
      (channel === 'sms' ? !/^\d{6}$/.test(secret) : !/^[A-Za-z0-9_-]{43}$/.test(secret))) {
    throw fail('Verificación inválida o vencida. Solicita una nueva.');
  }
  const client = await db.getClient();
  let invalid = false, retryAfter = 0;
  try {
    await client.query('BEGIN');
    const identity = await currentIdentity(client, actor, true);
    const challenge = (await client.query(`SELECT * FROM contact_verification_challenges
      WHERE user_id=$1 AND channel=$2 AND invalidated_at IS NULL AND consumed_at IS NULL FOR UPDATE`, [actor.id, channel])).rows[0];
    const now = (await client.query('SELECT clock_timestamp() AS now')).rows[0].now;
    const contact = contactFor(identity, channel);
    if (!challenge || !contact || challenge.contact_digest !== contactDigest(channel, contact) || challenge.expires_at <= now) {
      if (challenge) await client.query('UPDATE contact_verification_challenges SET invalidated_at=$2 WHERE id=$1', [challenge.id, now]);
      invalid = true;
    } else if (channel === 'sms' && challenge.attempts >= 5) {
      invalid = true; retryAfter = Math.max(1, Math.ceil((challenge.expires_at - now) / 1000));
    } else {
      const matches = timingSafeEqual(Buffer.from(challenge.secret_digest, 'hex'), Buffer.from(secretDigest(challenge.id, secret), 'hex'));
      // Persist failed attempts by committing the rejection as well as success.
      if (channel === 'sms') await client.query('UPDATE contact_verification_challenges SET attempts=attempts+1 WHERE id=$1', [challenge.id]);
      if (!matches) { invalid = true; }
      else {
        await client.query('UPDATE contact_verification_challenges SET consumed_at=$2 WHERE id=$1', [challenge.id, now]);
        await client.query(`INSERT INTO contact_verification_state(user_id,channel,contact_digest,verified_at)
          VALUES ($1,$2,$3,$4) ON CONFLICT (user_id,channel)
          DO UPDATE SET contact_digest=EXCLUDED.contact_digest,verified_at=EXCLUDED.verified_at`,
        [actor.id, channel, challenge.contact_digest, now]);
      }
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
  if (invalid) throw fail(retryAfter ? 'Código temporalmente bloqueado por intentos. Solicita uno nuevo respetando los límites de reenvío.' : 'Verificación inválida o vencida. Solicita una nueva.', retryAfter ? 429 : 400, retryAfter);
  return getOwnIdentity(actor);
}
