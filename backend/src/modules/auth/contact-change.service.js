import { randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import db from '../../config/db.js';
import { currentIdentity, ensurePatientIdentityOwner, contactDigest, verificationQuota, secretDigest as digestChallenge } from './identity.service.js';
import { normalizeEmail, normalizePhone } from './identity.validation.js';
import { assertDeliveryConfigured, deliverVerification } from './verification.delivery.js';
import { sealContact, openContact } from './contact-change.crypto.js';
const fail=(message,status=400,retryAfter=0)=>Object.assign(new Error(message),{status,retryAfter});
const uuid=value=>typeof value==='string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const secretDigest=(id,secret)=>digestChallenge(id,secret,'contact_change');
const contactFor=(identity,channel)=>channel==='email'?identity.email:identity.phone;
const envelopeContext=request=>'candidate:'+request.user_id+':'+request.id;
function only(payload,allowed) {
  if (!payload || typeof payload!=='object' || Array.isArray(payload) || Object.keys(payload).some(k=>!allowed.includes(k))) throw fail('La solicitud contiene campos no permitidos.');
}
const event=(client,userId,requestId,action)=>client.query('INSERT INTO contact_change_events(user_id,request_id,action) VALUES ($1,$2,$3)',[userId,requestId,action]);
async function limit(client,userId,actions,max,seconds,now) {
  const rows=(await client.query(`SELECT created_at FROM contact_change_events WHERE user_id=$1 AND action=ANY($2)
    AND created_at>$3::timestamptz-($4*INTERVAL '1 second') ORDER BY created_at`,[userId,actions,now,seconds])).rows;
  if (rows.length>=max) throw fail('Cambio temporalmente limitado. Tu acceso y atención continúan disponibles.',429,Math.max(1,Math.ceil((rows[0].created_at.getTime()+seconds*1000-now.getTime())/1000)));
}
async function passwordCheck(client,identity,password,requestId,now) {
  await limit(client,identity.userId,['password_failed'],5,900,now);
  if (typeof password!=='string' || Buffer.byteLength(password)>72 || !await bcrypt.compare(password,identity.passwordHash)) {
    await event(client,identity.userId,requestId,'password_failed');
    throw Object.assign(fail('Contraseña incorrecta. Vuelve a intentarlo.'),{commit:true});
  }
}
async function invalidateChallenges(client,id,now) {
  await client.query(`UPDATE contact_verification_challenges SET invalidated_at=$2
    WHERE change_request_id=$1 AND invalidated_at IS NULL AND consumed_at IS NULL`,[id,now]);
}
export async function resolveChange(client,id,status,now) {
  await client.query(`UPDATE contact_change_requests SET status=$2,resolved_at=$3,candidate_cipher=NULL,
    candidate_digest=NULL,source_digest=NULL,reauthenticated_at=NULL,authorized_session_hash=NULL,authorized_version=NULL WHERE id=$1`,[id,status,now]);
  await invalidateChallenges(client,id,now);
}
async function withIdentity(actor,action) {
  ensurePatientIdentityOwner(actor);
  if (!actor.sessionHash) throw fail('Inicia sesión nuevamente.',401);
  const client=await db.getClient();
  try {
    await client.query('BEGIN');
    const identity=await currentIdentity(client,actor,true);
    const now=(await client.query('SELECT clock_timestamp() AS now')).rows[0].now;
    const expired=(await client.query("SELECT id FROM contact_change_requests WHERE user_id=$1 AND status='pending' AND expires_at<=$2 FOR UPDATE",[actor.id,now])).rows;
    for (const row of expired) await resolveChange(client,row.id,'expired',now);
    const result=await action(client,identity,now);
    await client.query('COMMIT');return result;
  } catch (error) {
    await client.query(error.commit?'COMMIT':'ROLLBACK');throw error;
  } finally {client.release();}
}
function dto(row,actor,now) {
  if (!row) return {request:null};
  const authorized=row.status==='pending' && row.authorized_session_hash===actor.sessionHash && row.authorized_version===actor.sessionVersion;
  const expires=authorized && row.reauthenticated_at?new Date(row.reauthenticated_at.getTime()+600000):null;
  return {request:{id:row.id,channel:row.channel,status:row.status,
    candidate:row.candidate_cipher?openContact(row.candidate_cipher,envelopeContext(row)):null,
    verified:!!row.verified_at,expiresAt:row.expires_at.toISOString(),
    reauthenticationExpiresAt:expires?.toISOString()||null,reauthenticationRequired:!expires || expires<=now}};
}
async function owned(client,actor,id) {
  if (!uuid(id)) throw fail('Solicitud no disponible.',404);
  const row=(await client.query('SELECT * FROM contact_change_requests WHERE id=$1 AND user_id=$2 AND patient_id=$3 FOR UPDATE',[id,actor.id,actor.patientId])).rows[0];
  if (!row) throw fail('Solicitud no disponible.',404);
  return row;
}
function pending(row,identity,now) {
  if (row.status!=='pending' || row.expires_at<=now || row.session_version!==identity.sessionVersion) throw fail('La solicitud ya no está vigente. Consulta su estado o inicia otra.',409);
  if (row.source_digest!==contactDigest(row.channel,contactFor(identity,row.channel)||'')) throw fail('El contacto vigente cambió. Inicia otra solicitud.',409);
}
async function requireEmail(client,identity) {
  const evidence=(await client.query("SELECT contact_digest FROM contact_verification_state WHERE user_id=$1 AND channel='email'",[identity.userId])).rows[0];
  if (!evidence || evidence.contact_digest!==contactDigest('email',identity.email)) throw fail('Verifica primero tu correo vigente para cambiar el teléfono.',409);
}
async function notice(client,row,kind,previous,now) {
  const id=randomUUID(),context='notice:'+row.user_id+':'+id;
  await client.query(`INSERT INTO contact_change_notices(id,request_id,user_id,channel,kind,destination_cipher,status,created_at,retry_until,next_attempt_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8::timestamptz+INTERVAL '72 hours',$8) ON CONFLICT(request_id,kind) DO NOTHING`,
  [id,row.id,row.user_id,row.channel,kind,previous?sealContact(previous,context):null,previous?'pending':'unavailable',now]);
}
export async function getContactChange(actor) {
  return withIdentity(actor,async(client,identity,now)=>dto((await client.query('SELECT * FROM contact_change_requests WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1',[actor.id])).rows[0],actor,now));
}
export async function startContactChange(actor,payload) {
  only(payload,['operationId','channel','contact','password','replaceRequestId']);
  if (!uuid(payload.operationId) || !['email','sms'].includes(payload.channel) || (payload.replaceRequestId && !uuid(payload.replaceRequestId))) throw fail('Solicitud de cambio inválida.');
  const candidate=payload.channel==='email'?normalizeEmail(payload.contact):normalizePhone(payload.contact);
  if (!candidate || (payload.channel==='email' && (candidate.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)))) throw fail('Introduce un correo válido o un teléfono con prefijo internacional.');
  ensurePatientIdentityOwner(actor);
  assertDeliveryConfigured();
  return withIdentity(actor,async(client,identity,now)=>{
    const existing=(await client.query('SELECT * FROM contact_change_requests WHERE id=$1 AND user_id=$2',[payload.operationId,actor.id])).rows[0];
    const fingerprint=contactDigest(payload.channel,candidate);
    await passwordCheck(client,identity,payload.password,existing?.id||null,now);
    if (existing) {
      if (existing.candidate_digest && (existing.channel!==payload.channel || existing.candidate_digest!==fingerprint)) throw fail('La clave de operación ya se utilizó para otro cambio.',409);
      return dto(existing,actor,now);
    }
    if (candidate===contactFor(identity,payload.channel)) throw fail('El nuevo contacto debe ser diferente del vigente.');
    if (payload.channel==='sms') await requireEmail(client,identity);
    const old=(await client.query("SELECT * FROM contact_change_requests WHERE user_id=$1 AND status='pending' FOR UPDATE",[actor.id])).rows[0];
    if ((old && old.id!==payload.replaceRequestId) || (!old && payload.replaceRequestId)) throw fail('Ya existe un cambio pendiente o cambió su estado. Consúltalo antes de sustituirlo.',409);
    await limit(client,actor.id,['started'],5,86400,now);
    if (old) await limit(client,actor.id,['cancelled','replaced'],10,86400,now);
    // Validate encryption before any replacement is written.
    const cipher=sealContact(candidate,'candidate:'+actor.id+':'+payload.operationId);
    if (old) {await resolveChange(client,old.id,'replaced',now);await event(client,actor.id,old.id,'replaced');}
    const row=(await client.query(`INSERT INTO contact_change_requests(id,user_id,patient_id,channel,candidate_cipher,candidate_digest,source_digest,
      session_version,created_at,expires_at,reauthenticated_at,authorized_session_hash,authorized_version)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9::timestamptz+INTERVAL '24 hours',$9,$10,$8) RETURNING *`,
    [payload.operationId,actor.id,actor.patientId,payload.channel,cipher,fingerprint,contactDigest(payload.channel,contactFor(identity,payload.channel)||''),identity.sessionVersion,now,actor.sessionHash])).rows[0];
    await event(client,actor.id,row.id,'started');
    await notice(client,row,'started',contactFor(identity,row.channel),now);
    return dto(row,actor,now);
  });
}
export async function operateContactChange(actor,id,operation,payload={}) {
  const allowed={reauthenticate:['password'],resend:['operationId'],verify:['secret'],confirm:[],cancel:[]};
  if (!allowed[operation]) throw fail('Operación inválida.');
  only(payload,allowed[operation]);
  let message;
  const result=await withIdentity(actor,async(client,identity,now)=>{
    const row=await owned(client,actor,id);
    if ((operation==='cancel' && row.status==='cancelled') || (operation==='confirm' && row.status==='completed')) return operation==='confirm'?{confirmed:true,requestId:id}:dto(row,actor,now);
    pending(row,identity,now);
    if (row.channel==='sms') await requireEmail(client,identity);
    if (operation==='cancel') {
      await limit(client,actor.id,['cancelled','replaced'],10,86400,now);
      await resolveChange(client,id,'cancelled',now);await event(client,actor.id,id,'cancelled');
      return {request:{id,status:'cancelled',channel:row.channel}};
    }
    if (operation==='reauthenticate') {
      await passwordCheck(client,identity,payload.password,id,now);
      const updated=(await client.query('UPDATE contact_change_requests SET reauthenticated_at=$2,authorized_session_hash=$3,authorized_version=$4 WHERE id=$1 RETURNING *',[id,now,actor.sessionHash,identity.sessionVersion])).rows[0];
      await event(client,actor.id,id,'reauthenticated');return dto(updated,actor,now);
    }
    if (operation==='resend') {
      if (!uuid(payload.operationId)) throw fail('Clave de envío inválida.');
      const prior=(await client.query("SELECT id,expires_at,invalidated_at FROM contact_verification_challenges WHERE id=$1 AND user_id=$2 AND change_request_id=$3 AND purpose='contact_change'",[payload.operationId,actor.id,id])).rows[0];
      if (prior) {
        if (prior.invalidated_at || prior.expires_at<=now) throw fail('Este envío ya no está vigente. Solicita otro respetando los límites.',409);
        return {sent:true,expiresAt:prior.expires_at.toISOString(),retryAfter:60};
      }
      if (row.verified_at) throw fail('El candidato ya está verificado. Confirma el cambio.',409);
      assertDeliveryConfigured();
      const candidate=openContact(row.candidate_cipher,envelopeContext(row));
      const quota=await verificationQuota(client,actor.id,row.channel,candidate);
      if (row.expires_at<=quota.now) throw fail('La solicitud venció. Inicia otra.',409);
      const challengeId=payload.operationId;
      const previous=(await client.query("SELECT id,secret_digest,purpose FROM contact_verification_challenges WHERE user_id=$1 AND channel=$2 ORDER BY created_at DESC LIMIT 5",[actor.id,row.channel])).rows;
      let secret;
      do {secret=row.channel==='email'?randomBytes(32).toString('base64url'):String(randomInt(1000000)).padStart(6,'0');}
      while (previous.some(p=>p.secret_digest===digestChallenge(p.id,secret,p.purpose)));
      const expiresAt=new Date(Math.min(row.expires_at.getTime(),quota.now.getTime()+(row.channel==='email'?86400000:600000)));
      await invalidateChallenges(client,id,quota.now);
      await client.query(`INSERT INTO contact_verification_challenges(id,user_id,channel,contact_digest,secret_digest,created_at,expires_at,purpose,change_request_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,'contact_change',$8)`,[challengeId,actor.id,row.channel,quota.destination,secretDigest(challengeId,secret),quota.now,expiresAt,id]);
      message={userId:actor.id,channel:row.channel,contact:candidate,challengeId,requestId:id,purpose:'contact_change',secret,createdAt:quota.now.toISOString(),expiresAt:expiresAt.toISOString()};
      return {sent:true,expiresAt:message.expiresAt,retryAfter:60};
    }
    if (operation==='verify') {
      if (typeof payload.secret!=='string' || !(row.channel==='sms'?/^\d{6}$/:/^[A-Za-z0-9_-]{43}$/).test(payload.secret)) throw fail('Verificación inválida o vencida.');
      const challenge=(await client.query("SELECT * FROM contact_verification_challenges WHERE change_request_id=$1 AND purpose='contact_change' AND invalidated_at IS NULL AND consumed_at IS NULL FOR UPDATE",[id])).rows[0];
      if (!challenge || challenge.expires_at<=now || challenge.contact_digest!==row.candidate_digest) throw fail('Verificación inválida o vencida.');
      if (row.channel==='sms' && challenge.attempts>=5) throw fail('Código bloqueado por intentos. Solicita otro respetando los límites.',429,Math.max(1,Math.ceil((challenge.expires_at-now)/1000)));
      if (row.channel==='sms') await client.query('UPDATE contact_verification_challenges SET attempts=attempts+1 WHERE id=$1',[challenge.id]);
      if (!timingSafeEqual(Buffer.from(challenge.secret_digest,'hex'),Buffer.from(secretDigest(challenge.id,payload.secret),'hex'))) throw Object.assign(fail('Verificación inválida o vencida.'),{commit:true});
      await client.query('UPDATE contact_verification_challenges SET consumed_at=$2 WHERE id=$1',[challenge.id,now]);
      const updated=(await client.query('UPDATE contact_change_requests SET verified_at=$2 WHERE id=$1 RETURNING *',[id,now])).rows[0];
      await event(client,actor.id,id,'verified');return dto(updated,actor,now);
    }
    if (!row.verified_at) throw fail('Verifica el nuevo contacto antes de confirmar.',409);
    if (!row.reauthenticated_at || row.reauthenticated_at.getTime()+600000<=now.getTime() || row.authorized_session_hash!==actor.sessionHash || row.authorized_version!==identity.sessionVersion) throw fail('Confirma nuevamente tu contraseña; el candidato sigue disponible.',409);
    const candidate=openContact(row.candidate_cipher,envelopeContext(row));
    if (row.channel==='email') {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,4081))',[candidate]);
      if ((await client.query('SELECT 1 FROM users WHERE lower(email)=$1 AND id<>$2',[candidate,actor.id])).rowCount) throw fail('No se puede utilizar ese correo. Elige otro.',409);
    }
    // The uniqueness lock may have waited: never confirm with a frozen pre-lock clock.
    const finalNow=(await client.query('SELECT clock_timestamp() AS now')).rows[0].now;
    if (row.expires_at<=finalNow || row.reauthenticated_at.getTime()+600000<=finalNow.getTime()) throw fail('La autorización venció. Consulta el estado y valida tu contraseña.',409);
    await notice(client,row,'completed',contactFor(identity,row.channel),finalNow);
    await resolveChange(client,id,'completed',finalNow);
    if (row.channel==='email') {
      await client.query('UPDATE users SET email=$2,session_version=session_version+1,updated_at=NOW() WHERE id=$1',[actor.id,candidate]);
      await client.query('UPDATE patients SET email=$2,updated_at=NOW() WHERE id=$1',[actor.patientId,candidate]);
    } else {
      await client.query('UPDATE patients SET phone=$2,updated_at=NOW() WHERE id=$1',[actor.patientId,candidate]);
      await client.query('UPDATE users SET session_version=session_version+1,updated_at=NOW() WHERE id=$1',[actor.id]);
    }
    await client.query(`INSERT INTO contact_verification_state(user_id,channel,contact_digest,verified_at) VALUES ($1,$2,$3,$4)
      ON CONFLICT(user_id,channel) DO UPDATE SET contact_digest=EXCLUDED.contact_digest,verified_at=EXCLUDED.verified_at`,[actor.id,row.channel,row.candidate_digest,row.verified_at]);
    await client.query('UPDATE password_reset_tokens SET used_at=$2 WHERE user_id=$1 AND used_at IS NULL',[actor.id,finalNow]);
    await event(client,actor.id,id,'confirmed');
    return {confirmed:true,requestId:id};
  });
  if (message) {
    try {await deliverVerification(message);}
    catch {
      await db.query('UPDATE contact_verification_challenges SET invalidated_at=clock_timestamp() WHERE id=$1',[message.challengeId]);
      throw fail('No se pudo entregar la verificación. Espera antes de solicitar otra.',503);
    }
  }
  return result;
}
