import { createHash, createHmac, randomBytes, randomUUID, createCipheriv, createDecipheriv } from 'node:crypto';

export const purpose = 'individual_linkage';
export const conditionsVersion = 'fictional-individual-v1';
export const declarationVersion = 'independent-channel-v1';
export const declarationText = 'Confirmo que recibí esta referencia de la persona que pretendo invitar mediante un canal de confianza independiente del correo al que se enviará la invitación.';
export const conditionsText = name => `Acepto la propuesta de vinculación preclínica individual de ${name}, con las condiciones y versión mostradas. Esto completa un acuerdo bilateral y deja la admisión pendiente. No inicia tratamiento, no autoriza al profesional a consultar mi entrevista o expediente y no sustituye los consentimientos clínicos que correspondan. Cualquiera de las partes puede terminar este acuerdo de inmediato, sin autorización de la otra. Si existe un tratamiento activo o pausado, su continuidad, pausa o cierre se tramitan por su procedimiento propio.`;
export const sha256 = text => createHash('sha256').update(text).digest('hex');
export const fail = (message, status=400) => Object.assign(new Error(message),{status});
export const uuid = value => typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function referenceDigest(token, kind, key) {
  if (typeof token!=='string' || !/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/.test(token) || !uuid(token.slice(0,36))) return null;
  return createHmac('sha256',key).update(JSON.stringify(['bilateral-reference-v1',kind,purpose,token])).digest('hex');
}
export const referenceBindingDigest=(digest,kind,psychologist,account,patient,key)=>createHmac('sha256',key).update(JSON.stringify(['bilateral-binding-v1',kind,purpose,psychologist,account,patient,digest])).digest('hex');
export function newReference(kind,key) {
  const id=randomUUID(),token=id+'.'+randomBytes(32).toString('base64url');
  return {id,token,digest:referenceDigest(token,kind,key)};
}
export const fingerprint = (value,key) => createHmac('sha256',key).update(JSON.stringify(value,Object.keys(value).sort())).digest('hex');
export function sealEmail(email,id,key) {
  const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(Buffer.from('bilateral-email-v1:'+id));
  const data=Buffer.concat([cipher.update(email,'utf8'),cipher.final()]);
  return {iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')};
}
export function openEmail(envelope,id,key) {
  const cipher=createDecipheriv('aes-256-gcm',key,Buffer.from(envelope.iv,'base64'));
  cipher.setAAD(Buffer.from('bilateral-email-v1:'+id));cipher.setAuthTag(Buffer.from(envelope.tag,'base64'));
  return Buffer.concat([cipher.update(Buffer.from(envelope.data,'base64')),cipher.final()]).toString('utf8');
}
const lists=['sent','received','agreements','blocks','notices'];
export function validate(op,p={}) {
  const fields={
    'professional-reference':['operationId'],preflight:['professionalReference'],
    'recipient-reference':['operationId','professionalReference','confirmed'],
    issue:['operationId','email','recipientReference','conditionsVersion','conditionsHash','declarationVersion','declared','proposed'],
    accept:['operationId','expectedVersion','conditionsVersion','conditionsHash','confirmed'],
    decline:['operationId','expectedVersion','confirmed'],withdraw:['operationId','expectedVersion','confirmed'],
    resend:['operationId','confirmed'],block:['operationId','confirmed'],unblock:['operationId','confirmed'],
    unlink:['operationId','expectedVersion','confirmed'],
  };
  if (lists.includes(op)) {if(Object.keys(p).length) throw fail('Entrada no válida.');return;}
  if (!fields[op] || !p || Array.isArray(p) || Object.keys(p).length!==fields[op].length || Object.keys(p).some(k=>!fields[op].includes(k))) throw fail('Entrada no válida.');
  if (op!=='preflight' && !uuid(p.operationId)) throw fail('Operación no válida.');
  if (fields[op].includes('expectedVersion') && (!Number.isSafeInteger(p.expectedVersion)||p.expectedVersion<1)) throw fail('Versión no válida.');
  for(const field of ['confirmed','declared','proposed']) if(fields[op].includes(field) && p[field]!==true) throw fail('Se requiere una acción expresa.');
  if (fields[op].includes('conditionsVersion') && p.conditionsVersion!==conditionsVersion || op==='issue' && p.declarationVersion!==declarationVersion) throw fail('Las condiciones cambiaron. Recarga.',409);
  if (fields[op].includes('conditionsHash') && !/^[a-f0-9]{64}$/.test(p.conditionsHash||'')) throw fail('Condiciones no válidas.');
  for(const field of ['professionalReference','recipientReference']) if(fields[op].includes(field) && (typeof p[field]!=='string'||p[field].length>128)) throw fail('Referencia no válida.');
}
export const errorFor = error => {
  const errors={bilateral_session:[401,'Sesión no válida. Inicia sesión nuevamente.'],bilateral_forbidden:[403,'Operación no autorizada.'],
    bilateral_missing:[404,'Recurso no disponible.'],bilateral_conflict:[409,'El estado cambió. Recarga antes de reintentar.'],
    bilateral_unavailable:[409,'Referencia no disponible. Solicita una nueva.'],bilateral_quota:[429,'Límite propio de invitaciones alcanzado. Intenta más tarde.']};
  const known=errors[error.message];
  if(known)return fail(known[1],known[0]);
  if(error.status)return error;
  return fail('Servicio bilateral temporalmente no disponible.',503);
};
