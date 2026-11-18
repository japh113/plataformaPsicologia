import { verifyEpisodeRecordContract } from '../../../scripts/episode-record-contract.js';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import env from '../../config/env.js';
import { contactDigest } from '../auth/identity.service.js';
import { normalizeEmail,normalizePhone } from '../auth/identity.validation.js';
import { verifyAdmissionContract } from '../../../scripts/admission-contract.js';
import { validate,uuid,fail,fingerprint } from './admission.policy.js';
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
    if(['record','assess'].includes(op))await verifyEpisodeRecordContract(client);
    const c=(await client.query('SELECT public.admission_context($1,$2,$3,$4::jsonb) AS data',[actor.id,actor.sessionVersion,op,JSON.stringify(p)])).rows[0].data;
    if(!c.ownRead){
      const phone=normalizePhone(c.phone);
      p.emailDigest=contactDigest('email',normalizeEmail(c.email));p.phoneDigest=phone?contactDigest('sms',phone):null;
    }
    return (await client.query('SELECT public.admission_command($1,$2,$3,$4::jsonb) AS data',[actor.id,actor.sessionVersion,op,JSON.stringify(p)])).rows[0].data;
  });
}
