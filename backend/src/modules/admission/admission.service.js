import { verifyEpisodeRecordContract } from '../../../scripts/episode-record-contract.js';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import env from '../../config/env.js';
import db from '../../config/db.js';
import { contactDigest } from '../auth/identity.service.js';
import { normalizeEmail,normalizePhone } from '../auth/identity.validation.js';
import { verifyAdmissionContract } from '../../../scripts/admission-contract.js';
import { validate,validateResponses,uuid,fail,fingerprint } from './admission.policy.js';
let pool;
export function configuration(){
  if(process.env.ADMISSION_ENABLED!=='true')throw fail('Admisión deshabilitada.',404);
  if(!env.localDevelopment||!['test','development'].includes(env.nodeEnv)||env.verificationDelivery!=='simulated'||!uuid(process.env.EPISODE_TEST_RUN_ID)||
    Buffer.byteLength(process.env.ADMISSION_SECRET||'')<32||[env.jwtSecret,env.verificationSecret,process.env.BILATERAL_SECRET].includes(process.env.ADMISSION_SECRET))throw fail('Protección de admisión no configurada.',503);
  let url;try{url=new URL(process.env.ADMISSION_DATABASE_URL);}catch{throw fail('Destino de admisión no válido.',503);}
  if(!['postgres:','postgresql:'].includes(url.protocol)||!['db','127.0.0.1','localhost'].includes(url.hostname)||!/^\/psicopanel_episode_[a-z0-9_]+$/.test(url.pathname)||[...url.searchParams.keys()].length||!url.username)throw fail('La admisión requiere un destino local aislado.',503);
  return {role:decodeURIComponent(url.username),key:process.env.ADMISSION_SECRET};
}
export async function transaction(operation){
  const config=configuration();
  if(!pool){pool=new pg.Pool({connectionString:process.env.ADMISSION_DATABASE_URL,max:4,connectionTimeoutMillis:5000,application_name:'psicopanel-admission-isolated'});pool.on('error',()=>{});}
  for(let attempt=0;attempt<3;attempt++){
    const client=await pool.connect();let uncertain=true;
    try{
      await client.query('BEGIN');uncertain=false;
      await client.query("SET LOCAL statement_timeout='5s'");
      await verifyAdmissionContract(client,config.role,{runtime:true});
      const result=await operation(client);uncertain=true;await client.query('COMMIT');uncertain=false;return result;
    }catch(error){
      if(!uncertain)try{await client.query('ROLLBACK');}catch{uncertain=true;}
      if(!uncertain&&['40P01','40001'].includes(error.code)&&attempt<2)continue;
      throw error;
    }finally{client.release(uncertain);}
  }
}
export async function closeAdmission(){if(pool){const current=pool;pool=undefined;await current.end();}}
export async function command(actor,op,input={},id){
  validate(op,input);const {key}=configuration();
  if(id&&!uuid(id))throw fail('Recurso no disponible.',404);
  if(!Number.isFinite(actor?.sessionExpiresAt))throw fail('Sesión no válida.',401);
  if(op==='list'){
    const ids=await transaction(async client=>(await client.query('SELECT public.admission_candidates($1,$2,$3) AS data',[actor.id,actor.sessionVersion,actor.sessionExpiresAt])).rows[0].data);
    const rows=[];
    for(const candidate of ids)try{rows.push(await command(actor,'summary',{},candidate));}catch(error){if(error.message!=='admission_missing')throw error;}
    return rows;
  }
  const p={...input,...(id?{id}:{}),sessionExpiresAt:actor.sessionExpiresAt,
    fingerprint:fingerprint({op,input,id:id??null},key),newId:randomUUID()};
  return transaction(async client=>{
    if(['record','assess','directed-record','directed-assess'].includes(op))await verifyEpisodeRecordContract(client);
    const execute = async (operation) => (await client.query(
      'SELECT public.admission_command($1,$2,$3,$4::jsonb) AS data',
      [actor.id, actor.sessionVersion, operation, JSON.stringify(p)]
    )).rows[0].data;
    if (op === 'templates') return execute(op);
    const agreementOperation = ['preparations', 'prepare-current'].includes(op);
    const contextOperation = op === 'assign-directed' ? 'assign' : agreementOperation ? 'prepare' : op;
    const c=(await client.query('SELECT public.admission_context($1,$2,$3,$4::jsonb) AS data',[actor.id,actor.sessionVersion,contextOperation,JSON.stringify(p)])).rows[0].data;
    if(!c.ownRead){
      const phone=normalizePhone(c.phone);
      p.emailDigest=contactDigest('email',normalizeEmail(c.email));p.phoneDigest=phone?contactDigest('sms',phone):null;
    }
    if (op === 'save' || Object.hasOwn(input, 'declarations')) {
      const assigned = await execute('summary');
      validateResponses(input.answers ?? input.declarations, op !== 'save', assigned.templateId);
    }
    return execute(op);
  });
}

const agendaDestination = `SELECT current_database() AS name, inet_server_addr()::text AS address,
  inet_server_port() AS port`;
const consultationFields = {
  status: [],
  sufficiency: ['assignmentVersion', 'documentVersion', 'criteriaVersion'],
  consent: ['sufficiencyId', 'consentVersion', 'consentHash'],
  withdraw: ['consentId'],
  'revoke-admission': ['assignmentVersion'],
  activate: ['consentId'],
  book: ['date', 'time'],
  complete: ['appointmentId'],
  note: ['appointmentId', 'content'],
};

function validateConsultation(operation, input) {
  const fields = Object.hasOwn(consultationFields, operation) && consultationFields[operation];
  const keys = fields && (operation === 'status' ? fields : ['confirmed', ...fields]);
  if (!keys || typeof input !== 'object' || !input || Array.isArray(input)
    || Object.keys(input).length !== keys.length || !keys.every(key => Object.hasOwn(input, key))
    || (operation !== 'status' && input.confirmed !== true)) throw fail('Entrada no válida.');
  for (const key of ['assignmentVersion', 'documentVersion']) {
    if (keys.includes(key) && (!Number.isInteger(input[key]) || input[key] < 1 || input[key] > 2147483646)) {
      throw fail('Versión no válida.');
    }
  }
  for (const key of ['sufficiencyId', 'consentId', 'appointmentId']) {
    if (keys.includes(key) && !uuid(input[key])) throw fail('Entrada no válida.');
  }
  if (operation === 'sufficiency' && input.criteriaVersion !== 'fictional-sufficiency-v1') throw fail('Versión no válida.');
  if (operation === 'consent' && (input.consentVersion !== 'fictional-first-consultation-v1'
    || typeof input.consentHash !== 'string' || !/^[a-f0-9]{64}$/.test(input.consentHash))) throw fail('Consentimiento no válido.');
  if (operation === 'book') {
    const date = typeof input.date === 'string' && /^(?!0000)[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(input.date)
      ? new Date(input.date + 'T00:00:00Z') : null;
    if (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== input.date
      || typeof input.time !== 'string' || !/^([01][0-9]|2[0-3]):00$/.test(input.time)) {
      throw fail('Selecciona una fecha válida y una hora exacta.');
    }
  }
  if (operation === 'note' && (typeof input.content !== 'string' || !input.content.trim()
    || input.content.includes(String.fromCharCode(0)) || input.content.length > 10000)) throw fail('Nota no válida.');
}

export async function consultation(actor, operation, input = {}, id) {
  if (process.env.FIRST_CONSULTATION_ENABLED !== 'true') throw fail('Primera consulta deshabilitada.', 404);
  configuration();
  if (!Number.isFinite(actor?.sessionExpiresAt)) throw fail('Sesión no válida.', 401);
  if (operation === 'withdrawals' && actor.role !== 'patient') throw fail('Recurso no disponible.', 404);
  const clinicalDatabase = new URL(process.env.ADMISSION_DATABASE_URL);
  const { rows: [legacy] } = await db.query(agendaDestination + `, EXISTS (
    SELECT 1 FROM pg_roles r WHERE r.rolname=current_user
      AND NOT (r.rolsuper OR r.rolinherit OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls)
      AND NOT EXISTS(SELECT 1 FROM pg_auth_members m WHERE r.oid IN (m.roleid,m.member))
      AND NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
        AND starts_with(p.proname,'admission_') AND p.prosecdef AND has_function_privilege(r.oid,p.oid,'EXECUTE'))
      AND NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.relnamespace='public'::regnamespace
        AND c.relkind='r' AND (starts_with(c.relname,'consultation_') OR starts_with(c.relname,'admission_'))
        AND (has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')
          OR has_table_privilege(r.oid,c.oid,'DELETE,TRUNCATE,TRIGGER')))
  ) AS isolated`);
  if (legacy.name !== clinicalDatabase.pathname.slice(1) || !legacy.isolated) throw fail('Destino de agenda incompatible.', 503);

  if (operation === 'withdrawals') {
    return transaction(async client => {
      await ensureConsultationDestination(client, legacy);
      const { rows: [result] } = await client.query(
        'SELECT public.admission_withdrawal_references($1,$2,$3) AS data',
        [actor.id, actor.sessionVersion, actor.sessionExpiresAt]
      );
      return result.data;
    });
  }

  if (operation === 'list') {
    const ids = await transaction(async client => {
      await ensureConsultationDestination(client, legacy);
      return (await client.query('SELECT public.admission_candidates($1,$2,$3) AS data',
        [actor.id, actor.sessionVersion, actor.sessionExpiresAt])).rows[0].data;
    });
    const rows = [];
    for (const candidate of ids) {
      try {
        rows.push(await consultationCommand(actor, 'summary', {}, candidate, legacy));
      } catch (error) {
        if (error.message !== 'admission_missing') throw error;
      }
    }
    return rows;
  }
  if (!uuid(id)) throw fail('Recurso no disponible.', 404);
  validateConsultation(operation, input);
  return consultationCommand(actor, operation, input, id, legacy);
}

async function ensureConsultationDestination(client, legacy) {
  const { rows: [agenda] } = await client.query(agendaDestination);
  if (agenda.name !== legacy.name || agenda.address !== legacy.address || agenda.port !== legacy.port) {
    throw fail('Destino de agenda incompatible.', 503);
  }
}

async function consultationCommand(actor, operation, input, id, legacy) {
  const data = { ...input, id, sessionExpiresAt: actor.sessionExpiresAt };
  return transaction(async client => {
    await ensureConsultationDestination(client, legacy);
    const contextOperation = operation === 'withdraw' ? 'detail' : 'consultation';
    const { rows: [context] } = await client.query(
      'SELECT public.admission_context($1,$2,$3,$4::jsonb) AS data',
      [actor.id, actor.sessionVersion, contextOperation, JSON.stringify(data)]
    );
    if (!context.data.ownRead) {
      const phone = normalizePhone(context.data.phone);
      data.emailDigest = contactDigest('email', normalizeEmail(context.data.email));
      data.phoneDigest = phone ? contactDigest('sms', phone) : null;
    }
    const { rows: [result] } = await client.query(
      'SELECT public.admission_consultation($1,$2,$3,$4::jsonb) AS data',
      [actor.id, actor.sessionVersion, operation, JSON.stringify(data)]
    );
    return result.data;
  });
}
