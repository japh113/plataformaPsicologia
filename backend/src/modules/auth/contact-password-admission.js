import bcrypt from 'bcryptjs';
import db from '../../config/db.js';
import {currentIdentity,ensurePatientIdentityOwner} from './identity.service.js';

const fail=(message,status,code,retryAfter=0)=>Object.assign(new Error(message),{status,code,retryAfter});
const unavailable=()=>fail('Cambio temporalmente no disponible. Vuelve a intentarlo.',503,'CONTACT_PASSWORD_UNAVAILABLE');
const expired=()=>fail('La comprobación venció. Vuelve a intentarlo.',503,'CONTACT_PASSWORD_RESERVATION_EXPIRED');
const limited=retry=>fail('Cambio temporalmente limitado. Tu acceso y atención continúan disponibles.',429,'CONTACT_PASSWORD_LIMIT',retry);
const lifetimeNs=10000000000n;

// Called only after the account lock, in a separate statement/snapshot. Taking
// the M newest events also computes the correct release time if there are > M.
async function budget(client,userId,includeAdmission) {
  const {rows:[row]}=await client.query(`WITH sample AS MATERIALIZED (SELECT clock_timestamp() AS now),
    failures AS (SELECT created_at FROM contact_change_events,sample
      WHERE user_id=$1 AND action='password_failed' AND created_at>sample.now-INTERVAL '900 seconds'
      ORDER BY created_at DESC,id DESC LIMIT 5),
    admissions AS (SELECT created_at FROM contact_change_events,sample
      WHERE user_id=$1 AND action='password_admitted' AND created_at>sample.now-INTERVAL '900 seconds'
      ORDER BY created_at DESC,id DESC LIMIT 10)
    SELECT GREATEST(
      CASE WHEN (SELECT count(*) FROM failures)=5 THEN
        ceil(EXTRACT(EPOCH FROM ((SELECT min(created_at) FROM failures)+INTERVAL '900 seconds'-sample.now))) ELSE 0 END,
      CASE WHEN $2::boolean AND (SELECT count(*) FROM admissions)=10 THEN
        ceil(EXTRACT(EPOCH FROM ((SELECT min(created_at) FROM admissions)+INTERVAL '900 seconds'-sample.now))) ELSE 0 END
    )::int AS retry_after FROM sample`,[userId,includeAdmission]);
  if(row.retry_after>0)throw limited(Math.max(1,row.retry_after));
}

// Dependency injection is confined to constructing the executor. Reservations
// and their used flag never leave a single invocation, and HTTP cannot redeem
// event IDs. There is no retry loop or public reserve/compare pair.
export function createContactPasswordOperation({database=db,nowNs=()=>process.hrtime.bigint(),compare=(...args)=>bcrypt.compare(...args)}={}) {
  return async function contactPasswordOperation(actor,password,preflight,action) {
    ensurePatientIdentityOwner(actor);
    if(!actor.sessionHash)throw fail('Inicia sesión nuevamente.',401,'CONTACT_PASSWORD_SESSION');
    let client,inTransaction=false,discard=false,used=false;
    const begin=async()=>{
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');inTransaction=true;
      await client.query("SET LOCAL lock_timeout='2s'");
      await client.query("SET LOCAL statement_timeout='5s'");
      await client.query("SET LOCAL synchronous_commit='on'");
    };
    const commit=async()=>{
      // An uncertain COMMIT must never authorize work or reuse the connection.
      try {await client.query('COMMIT');inTransaction=false;}
      catch(error){discard=true;throw error;}
    };
    const identityAndState=async()=>{
      const identity=await currentIdentity(client,actor,true);
      const now=(await client.query('SELECT clock_timestamp() AS now')).rows[0].now;
      const state=await preflight(client,identity,now);
      return {identity,state};
    };
    try {
      client=await database.getClient();
      await begin();
      await identityAndState(); // A: reads only; never expire or invalidate here.
      const admittedFrom=nowNs();
      await budget(client,actor.id,true);
      const {rows:[reservation]}=await client.query(`INSERT INTO contact_change_events(user_id,request_id,action)
        VALUES($1,NULL,'password_admitted') RETURNING id`,[actor.id]);
      await commit(); // A is durable before any bcrypt or business mutation.

      await begin();
      const {identity,state}=await identityAndState(); // B: no stale hash/authority.
      await budget(client,actor.id,false); // Never charge/check admission twice.
      const {rows:[valid]}=await client.query(`SELECT EXISTS(SELECT 1 FROM contact_change_events
        WHERE id=$1 AND user_id=$2 AND action='password_admitted' AND request_id IS NULL
        AND created_at<=clock_timestamp() AND created_at>clock_timestamp()-INTERVAL '10 seconds') AS valid`,[reservation.id,actor.id]);
      const elapsed=nowNs()-admittedFrom;
      if(used||!valid.valid||elapsed<0n||elapsed>=lifetimeNs)throw expired();
      used=true; // Set BEFORE compare, including throws; no internal retries.
      if(typeof password!=='string'||Buffer.byteLength(password)>72||!await compare(password,identity.passwordHash)) {
        await client.query("INSERT INTO contact_change_events(user_id,request_id,action) VALUES($1,$2,'password_failed')",[actor.id,state.requestId||null]);
        await commit();
        throw fail('Contraseña incorrecta. Vuelve a intentarlo.',400,'CONTACT_PASSWORD_INCORRECT');
      }
      const now=(await client.query('SELECT clock_timestamp() AS now')).rows[0].now;
      const result=await action(client,identity,now,state);
      await commit();return result;
    } catch(error) {
      if(client&&inTransaction&&!discard) {
        try {await client.query('ROLLBACK');}catch{discard=true;}
      }
      // Preserve the controller's generic, privacy-safe uniqueness conflict.
      if(error.status||error.code==='23505')throw error;
      throw unavailable();
    } finally {if(client)client.release(discard?new Error('Contact password connection unavailable'):undefined);}
  };
}

export const contactPasswordOperation=createContactPasswordOperation();

// Technical events are not security/functional history. Eligible only after
// 24h (> 900s window and 10s reservation); never delete other actions. A stopped
// processor delays physical removal; one tick does not promise to drain backlog.
export async function purgeContactPasswordAdmissions(database=db) {
  return database.query(`WITH cutoff AS MATERIALIZED (
    SELECT clock_timestamp()-INTERVAL '24 hours' AS before
  ), obsolete AS (
    SELECT id FROM contact_change_events WHERE action='password_admitted'
      AND created_at<(SELECT before FROM cutoff)
    ORDER BY created_at,id LIMIT 1000 FOR UPDATE SKIP LOCKED
  ) DELETE FROM contact_change_events e USING obsolete o
    WHERE e.id=o.id AND e.action='password_admitted'
      AND e.created_at<(SELECT before FROM cutoff)`);
}
