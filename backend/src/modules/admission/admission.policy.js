import { createHmac } from 'node:crypto';
import { fail,uuid } from '../bilateral/bilateral.policy.js';
export { fail,uuid };
// PostgreSQL owns the immutable definitions and validates the final document.
// Keep the HTTP field allowlist aligned with the catalog installed by 021.
const templateKeys = new Map([
  ['fictional-adult-v1', ['reason', 'context']],
  ['fictional-initial-interview-v1', ['reason', 'personalContext', 'expectations', 'initialGoals']],
  ['fictional-daily-wellbeing-v1', ['stressors', 'dailyHabits', 'rest', 'supports']],
  ['fictional-personal-changes-v1', ['recentChanges', 'difficulties', 'supportNetwork', 'currentNeeds']],
]);

export function validateResponses(responses, complete, templateId) {
  const schemas = templateId === undefined ? templateKeys.values() : [templateKeys.get(templateId)];
  const entries = responses && typeof responses === 'object' && !Array.isArray(responses) && Object.entries(responses);
  const matches = entries && [...schemas].some(keys => keys
    && (!complete || entries.length === keys.length)
    && entries.every(([key, value]) => keys.includes(key)
      && typeof value === 'string' && !value.includes(String.fromCharCode(0))
      && [...value].length <= 1000 && (!complete || value.trim())));
  if (!matches) throw fail(complete ? 'Declaraciones no válidas.' : 'Respuestas no válidas.');
}

const fields={
  'care-start':['agreementId','mode','templateId'],
  'care-send':['expectedVersion','expectedRevision','answers'],
  'care-register':['expectedVersion','declarations'],
  'assign-directed':['agreementId','episodeId','templateId'],'directed-attest':['expectedVersion'],
  'directed-document':['expectedVersion','expectedDocumentRevision','declarations'],'directed-request':['expectedVersion','documentRevision','reason'],
  'directed-resolve':['expectedVersion','expectedDocumentRevision','requestId','decision','explanation'],
  'directed-validate':['expectedVersion','documentRevision','episodeId'],
  'directed-assess':['expectedVersion','expectedRevision','documentRevision','episodeId','riskLevel','context'],assess:['expectedVersion','expectedRevision','submission','episodeId','riskLevel','context'],prepare:['agreementId'],assign:['agreementId','episodeId','templateId'],accept:['expectedVersion','consentVersion','consentHash'],
  save:['expectedVersion','expectedRevision','answers'],submit:['expectedVersion','expectedRevision'],
  correct:['expectedVersion','submission','episodeId','message'],validate:['expectedVersion','submission','episodeId'],revoke:['expectedVersion']};
// Existing stores retain the message and exact document reference. The optional
// question uses a reserved prefix that plain messages cannot introduce.
const questionMarker = '\u001equestion:';
const questionPattern = /^[a-z][a-z0-9_-]{0,63}$/;
export function encodeQuestionMessage(questionId, message, template) {
  if (!template.questions.some(question => question.id === questionId)) throw fail('Pregunta no disponible.');
  const stored = questionMarker + questionId + '\n' + message;
  if (stored.length > 1000) throw fail('Mensaje demasiado largo.');
  return stored;
}
export function readQuestionMessage(entry, field, template) {
  const stored = entry[field];
  if (!stored.startsWith(questionMarker)) return entry;
  const end = stored.indexOf('\n');
  if (end < 0) return entry;
  const questionId = stored.slice(questionMarker.length, end);
  if (!template.questions.some(question => question.id === questionId)) return entry;
  return { ...entry, questionId, [field]: stored.slice(end + 1) };
}

export function validate(op,p) {
  const scopedRead=op==='care-context';
  const expected=scopedRead?['agreementId']:['list','detail','summary','draft','record','directed-record'].includes(op)?[]:fields[op]&&['operationId','confirmed',...fields[op],...(op==='directed-resolve'&&p?.decision==='accept'?['declarations']:[]),...(op==='care-start'&&Object.hasOwn(p??{},'episodeId')?['episodeId']:[]),...(['correct','directed-request'].includes(op)&&Object.hasOwn(p??{},'questionId')?['questionId']:[])];
  if(!expected||!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).length!==expected.length||Object.keys(p).some(k=>!expected.includes(k)))throw fail('Entrada no válida.');
  if(expected.length&&!scopedRead&&(!uuid(p.operationId)||p.confirmed!==true))throw fail('Se requiere una acción expresa.');
  if('agreementId'in p&&!uuid(p.agreementId))throw fail('Entrada no válida.');
  if('episodeId'in p&&(typeof p.episodeId!=='string'||!/^[1-9][0-9]{0,17}$/.test(p.episodeId)))throw fail('Entrada no válida.');
  for(const key of ['expectedVersion','expectedRevision','submission','expectedDocumentRevision','documentRevision'])if(key in p&&(!Number.isSafeInteger(p[key])||p[key]<(['expectedRevision','expectedDocumentRevision'].includes(key)?0:1)||p[key]>2147483646))throw fail('Versión no válida.');
  if(op==='care-start'&&(!['self','directed'].includes(p.mode)||p.templateId==='fictional-adult-v1'))throw fail('Elige una modalidad y una plantilla de entrevista.');
  if('templateId'in p&&!templateKeys.has(p.templateId))throw fail('Plantilla no disponible.');
  if(op==='accept'&&(!['fictional-admission-v1','fictional-admission-v2','fictional-directed-v1'].includes(p.consentVersion)||!/^[a-f0-9]{64}$/.test(p.consentHash)))throw fail('Consentimiento no válido.');
  if(['assess','directed-assess'].includes(op)&&(!['unevaluated','none','low','medium','high'].includes(p.riskLevel)||typeof p.context!=='string'||p.context.length>10000||p.expectedRevision<1))throw fail('Valoración no válida.');
  if ('questionId' in p && (typeof p.questionId !== 'string' || !questionPattern.test(p.questionId))) throw fail('Pregunta no válida.');
  if(op==='correct'&&(typeof p.message!=='string'||!p.message.trim()||p.message.length>1000||p.message.startsWith(questionMarker)))throw fail('Mensaje no válido.');
  if(op==='directed-resolve'&&(!uuid(p.requestId)||!['accept','reject'].includes(p.decision)||typeof p.explanation!=='string'||!p.explanation.trim()||p.explanation.length>1000))throw fail('Resolución no válida.');
  if(op==='directed-request'&&(typeof p.reason!=='string'||!p.reason.trim()||p.reason.length>1000||p.reason.startsWith(questionMarker)))throw fail('Solicitud no válida.');
  if ('declarations' in p) validateResponses(p.declarations, true);
  if (op === 'save' || op === 'care-send') validateResponses(p.answers, op === 'care-send');
}
const canonical=value=>value&&typeof value==='object'?Array.isArray(value)?value.map(canonical):Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
export const fingerprint=(value,key)=>createHmac('sha256',key).update(JSON.stringify(canonical(value))).digest('hex');
export function errorFor(error) {
  const codes={consultation_slot_unavailable:[409,'El turno solicitado no está disponible.'],
    consultation_future:[409,'La cita aún no se puede completar.'],admission_missing:[404,'Recurso no disponible.'],admission_session:[401,'Sesión no válida. Inicia sesión nuevamente.'],
    admission_preparation_choice:[409,'Elige cuál de las atenciones pendientes quieres continuar.'],
    admission_context_limit:[409,'Hay demasiadas entrevistas para mostrar esta atención completa.'],
    admission_conflict:[409,'La atención cambió. Revisa el estado actualizado antes de volver a confirmar.'],admission_quota:[429,'Límite propio de preparaciones alcanzado. Intenta más tarde.']};
  const known=codes[error.message];
  if(known)return fail(known[1],known[0]);
  if(error.status&&[400,404,409,503].includes(error.status))return fail(error.message,error.status);
  return fail('Admisión temporalmente no disponible.',503);
}
