import pg from 'pg';
import { createHmac, randomUUID } from 'node:crypto';
import env from '../../config/env.js';
import { contactDigest } from '../auth/identity.service.js';
import { normalizeEmail, normalizePhone, adultBirthDateError } from '../auth/identity.validation.js';
import { isValidEmail } from '../auth/email.validation.js';
import { purpose,conditionsText,conditionsVersion,declarationText,declarationVersion,sha256,
  referenceDigest,referenceBindingDigest,newReference,fingerprint,sealEmail,openEmail,validate,fail,uuid } from './bilateral.policy.js';

let pool;
export function configuration() {
  if(process.env.BILATERAL_ENABLED!=='true') throw fail('Vinculación bilateral deshabilitada.',404);
  if(!env.localDevelopment || !['test','development'].includes(env.nodeEnv) || env.verificationDelivery!=='simulated' ||
    !uuid(process.env.EPISODE_TEST_RUN_ID) || !process.env.BILATERAL_DATABASE_URL ||
    Buffer.byteLength(process.env.BILATERAL_SECRET||'')<32 || [env.jwtSecret,env.verificationSecret].includes(process.env.BILATERAL_SECRET))
    throw fail('Protección bilateral no configurada.',503);
  let destination;
  try{destination=new URL(process.env.BILATERAL_DATABASE_URL);}catch{throw fail('Destino bilateral no válido.',503);}
  if(!['postgres:','postgresql:'].includes(destination.protocol)||!['db','localhost','127.0.0.1'].includes(destination.hostname)||
    !/^\/psicopanel_episode_[a-z0-9_]+$/.test(destination.pathname)||[...destination.searchParams.keys()].length)
    throw fail('El incremento requiere un destino local de ensayo aislado.',503);
  const key=createHmac('sha256',process.env.BILATERAL_SECRET).update('bilateral-v1').digest();
  return {key,encryptionKey:createHmac('sha256',key).update('delivery-encryption').digest()};
}
function database() {
  configuration();
  if(!pool){
    pool=new pg.Pool({connectionString:process.env.BILATERAL_DATABASE_URL,max:4,connectionTimeoutMillis:5000,application_name:'psicopanel-bilateral-isolated'});
    pool.on('error',()=>{/* pg removes the failed idle client; no sensitive diagnostics or process crash. */});
  }
  return pool;
}
export const closeBilateral = async()=>{if(pool){const current=pool;pool=undefined;await current.end();}};
export async function transaction(operation) {
  for(let attempt=0;attempt<3;attempt++) {
    const client=await database().connect();let uncertain=true;
    try {
      await client.query('BEGIN');uncertain=false;
      await client.query("SET LOCAL statement_timeout='5s'");
      // A misconfigured normal/elevated pool fails closed before touching any bilateral resource.
      const {rows:[guard]}=await client.query(`SELECT NOT r.rolsuper AND NOT r.rolcreaterole AND NOT r.rolcreatedb
        AND NOT r.rolbypassrls AND NOT r.rolreplication AND NOT r.rolinherit
        AND current_setting('session_replication_role')='origin'
        AND NOT has_parameter_privilege(r.oid,'session_replication_role','SET,ALTER SYSTEM')
        AND NOT has_any_column_privilege(current_user,'public.users','SELECT')
        AND NOT has_any_column_privilege(current_user,'public.patients','SELECT')
        AND NOT has_table_privilege(current_user,'public.patient_clinical_notes','SELECT')
        AND NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','v','m') AND
          (has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') OR has_table_privilege(r.oid,c.oid,'DELETE,TRUNCATE,TRIGGER')))
        AND NOT EXISTS(SELECT 1 FROM pg_proc f,LATERAL aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) acl
          WHERE f.pronamespace='public'::regnamespace AND starts_with(f.proname,'bilateral_') AND acl.grantee=0 AND acl.privilege_type='EXECUTE')
        AND NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid)
        AND NOT EXISTS(SELECT 1 FROM pg_proc f JOIN pg_roles owner ON owner.oid=f.proowner
          WHERE f.oid='public.bilateral_command(text,integer,text,jsonb)'::regprocedure AND
          (owner.rolcanlogin OR owner.rolsuper OR owner.rolinherit OR owner.rolcreaterole OR owner.rolcreatedb OR owner.rolbypassrls
           OR has_parameter_privilege(owner.oid,'session_replication_role','SET,ALTER SYSTEM')
           OR has_column_privilege(owner.oid,'public.users','password_hash','SELECT')
           OR has_table_privilege(owner.oid,'public.patient_clinical_notes','SELECT')
           OR has_table_privilege(owner.oid,'public.care_relationships','INSERT')
           OR EXISTS(SELECT 1 FROM pg_auth_members WHERE owner.oid IN (roleid,member))))
        AS safe FROM pg_roles r WHERE rolname=current_user`);
      if(!guard?.safe)throw fail('Pool bilateral sin aislamiento.',503);
      const result=await operation(client);
      uncertain=true;await client.query('COMMIT');uncertain=false;return result;
    }catch(error){
      if(!uncertain)try{await client.query('ROLLBACK');}catch{uncertain=true;}
      if(!uncertain && ['40P01','40001'].includes(error.code) && attempt<2)continue;
      throw error;
    }finally{client.release(uncertain);}
  }
}
function authenticateReference(c,key) {
  return !!c.referenceDigest && c.referenceBindingDigest===referenceBindingDigest(c.referenceDigest,c.referenceKind,c.psychologist,c.referenceKind==='recipient'?c.account:null,c.referenceKind==='recipient'?c.patient:null,key);
}
function binding(c,email) {
  const phone=normalizePhone(c.phone);
  return {email:normalizeEmail(email??c.email),phone,adult:!!c.birthDate&&!adultBirthDateError(c.birthDate),
    emailDigest:contactDigest('email',normalizeEmail(c.email)),phoneDigest:phone?contactDigest('sms',phone):null};
}
async function context(client,actor,op,p) {
  return (await client.query('SELECT public.bilateral_context($1,$2,$3,$4::jsonb) AS data',
    [actor?.id??null,actor?.sessionVersion??null,op,JSON.stringify(p)])).rows[0].data;
}
async function execute(client,actor,op,p) {
  return (await client.query('SELECT public.bilateral_command($1,$2,$3,$4::jsonb) AS data',
    [actor?.id??null,actor?.sessionVersion??null,op,JSON.stringify(p)])).rows[0].data;
}
export async function command(actor,op,input={},id) {
  validate(op,input);
  if(id&&!uuid(id))throw fail('Recurso no disponible.',404);
  const {key,encryptionKey}=configuration();
  const p={...input,...(id?{id}:{}),fingerprint:fingerprint({op,...input,...(id?{id}:{})},key)};
  let reference;
  if(['professional-reference','recipient-reference'].includes(op)){
    reference=newReference(op==='professional-reference'?'professional':'recipient',key);
    p.referenceId=reference.id;p.digest=reference.digest;
  }
  if(input.professionalReference)p.professionalDigest=referenceDigest(input.professionalReference,'professional',key);
  if(op==='issue') {
    if(!isValidEmail(input.email))throw fail('Correo no válido.');
    p.receiptId=randomUUID();p.contactEnvelope=sealEmail(normalizeEmail(input.email),p.receiptId,encryptionKey);
    // Malformed/unknown references still receive the same asynchronous acknowledgement.
    p.referenceDigest=referenceDigest(input.recipientReference,'recipient',key);
  }
  delete p.professionalReference;delete p.recipientReference;
  if(op==='accept')p.agreementId=randomUUID();
  const result=await transaction(async client=>{
    const c=await context(client,actor,op,p);
    Object.assign(p,binding(c));
    p.referenceAuthenticated=authenticateReference(c,key);
    if(reference)p.bindingDigest=referenceBindingDigest(reference.digest,op==='professional-reference'?'professional':'recipient',op==='professional-reference'?actor.id:c.psychologist,op==='recipient-reference'?actor.id:null,op==='recipient-reference'?c.patient:null,key);
    if(op==='issue') {
      const text=conditionsText(c.professionalName);
      if(input.conditionsHash!==sha256(text))throw fail('Las condiciones cambiaron. Recarga.',409);
      p.proposal={purpose,conditionsVersion,conditionsText:text,conditionsHash:sha256(text),declarationVersion,declarationText,declared:true,proposed:true};
    }
    return execute(client,actor,op,p);
  });
  // A reference secret is returned once. On uncertain delivery generate a new operation/reference.
  // Durable idempotency never stores or reconstructs that secret.
  if(reference && result.referenceCreated && !result.replayed)return {...result,reference:reference.token};
  return result;
}
export async function processQueue() {
  const {key,encryptionKey}=configuration();
  // Queue listing is read-only. Each receipt is subsequently checked and processed atomically.
  const jobs=await transaction(async client=>(await client.query('SELECT * FROM public.bilateral_queue()')).rows);
  let deferred=0;
  for(const job of jobs)try{await transaction(async client=>{
    const p={id:job.receipt_id,jobId:job.id};const c=await context(client,null,job.kind,p);p.referenceAuthenticated=authenticateReference(c,key);
    if(job.contact_envelope)Object.assign(p,binding(c,openEmail(job.contact_envelope,job.receipt_id,encryptionKey)));
    await execute(client,null,job.kind,p);
  });}catch{deferred++;}
  await transaction(client=>client.query('SELECT public.bilateral_cleanup()'));
  return {deferred};
}
export function startBilateralProcessor() {
  if(process.env.BILATERAL_ENABLED!=='true')return;
  configuration();let running=false;
  const tick=async()=>{if(running)return;running=true;try{await processQueue();}catch{/* No SQL, contacts, references or per-recipient diagnostics in logs. */}finally{running=false;}};
  void tick();const timer=setInterval(tick,1000);timer.unref();return ()=>clearInterval(timer);
}
