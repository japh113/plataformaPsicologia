import { createHmac } from 'node:crypto';
import { fail,uuid } from '../bilateral/bilateral.policy.js';
export { fail,uuid };
const fields={prepare:['agreementId'],assign:['agreementId','episodeId','templateId'],accept:['expectedVersion','consentVersion','consentHash'],
  save:['expectedVersion','expectedRevision','answers'],submit:['expectedVersion','expectedRevision'],
  correct:['expectedVersion','submission','episodeId','message'],validate:['expectedVersion','submission','episodeId'],revoke:['expectedVersion']};
export function validate(op,p) {
  const expected=['list','detail','summary','draft'].includes(op)?[]:fields[op]&&['operationId','confirmed',...fields[op]];
  if(!expected||!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).length!==expected.length||Object.keys(p).some(k=>!expected.includes(k)))throw fail('Entrada no válida.');
  if(expected.length&&(!uuid(p.operationId)||p.confirmed!==true))throw fail('Se requiere una acción expresa.');
  if('agreementId'in p&&!uuid(p.agreementId))throw fail('Entrada no válida.');
  if('episodeId'in p&&(typeof p.episodeId!=='string'||!/^[1-9][0-9]{0,17}$/.test(p.episodeId)))throw fail('Entrada no válida.');
  for(const key of ['expectedVersion','expectedRevision','submission'])if(key in p&&(!Number.isSafeInteger(p[key])||p[key]<(key==='expectedRevision'?0:1)||p[key]>2147483646))throw fail('Versión no válida.');
  if('templateId'in p&&p.templateId!=='fictional-adult-v1')throw fail('Plantilla no disponible.');
  if(op==='accept'&&(p.consentVersion!=='fictional-admission-v1'||!/^[a-f0-9]{64}$/.test(p.consentHash)))throw fail('Consentimiento no válido.');
  if(op==='correct'&&(typeof p.message!=='string'||!p.message.trim()||p.message.length>1000))throw fail('Mensaje no válido.');
  if(op==='save'&&(!p.answers||typeof p.answers!=='object'||Array.isArray(p.answers)||Object.entries(p.answers).some(([k,v])=>!['reason','context'].includes(k)||typeof v!=='string'||v.length>1000)))throw fail('Respuestas no válidas.');
}
const canonical=value=>value&&typeof value==='object'?Array.isArray(value)?value.map(canonical):Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
export const fingerprint=(value,key)=>createHmac('sha256',key).update(JSON.stringify(canonical(value))).digest('hex');
export function errorFor(error) {
  const codes={admission_missing:[404,'Recurso no disponible.'],admission_session:[401,'Sesión no válida. Inicia sesión nuevamente.'],
    admission_conflict:[409,'El estado cambió. Recarga antes de reintentar.'],admission_quota:[429,'Límite propio de preparaciones alcanzado. Intenta más tarde.']};
  const known=codes[error.message];
  if(known)return fail(known[1],known[0]);
  if(error.status&&[400,404,409,503].includes(error.status))return fail(error.message,error.status);
  return fail('Admisión temporalmente no disponible.',503);
}
