import {fail} from './professional.core.js';
export const exact=(body,keys)=>{
  if(!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).some(key=>!keys.includes(key))) throw fail('Campos no permitidos.');
};
export const text=(value,max,required=false)=>{
  if(typeof value!=='string' || value.length>max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value) || (required&&!value.trim())) throw fail('Texto no válido o demasiado largo.');
  return value.trim();
};
export const decimal=value=>{
  if(typeof value!=='string' || !/^(0|[1-9]\d{0,18})$/.test(value) || BigInt(value)>9223372036854775806n) throw fail('Versión decimal no válida.');return value;
};
const list=value=>{
  if(!Array.isArray(value) || value.length>20) throw fail('Lista no válida.');
  const result=value.map(item=>text(item,200,true));if(new Set(result).size!==result.length)throw fail('Valores repetidos.');return result;
};
export const directPayload=body=>{
  exact(body,['rowVersion','description','modality','city','state','approachCodes']);decimal(body.rowVersion);
  const changes={};
  for(const [key,max] of [['description',2000],['city',100],['state',100]]) if(body[key]!==undefined)changes[key]=text(body[key],max);
  if(body.modality!==undefined){if(![null,'in_person','online','both'].includes(body.modality))throw fail('Modalidad no válida.');changes.modality=body.modality;}
  if(body.approachCodes!==undefined)changes.approachCodes=list(body.approachCodes);
  if(!Object.keys(changes).length)throw fail('No hay cambios.');return changes;
};
const credentialKeys=['professionalName','professionalTitle','licenseNumber','academicTraining','formalSpecialties','certifications','credentialedApproaches'];
export const proposalPayload=body=>{
  exact(body,['rowVersion',...credentialKeys]);decimal(body.rowVersion);
  const value={};for(const key of credentialKeys){value[key]=key.endsWith('Name')?text(body[key],200,true):['professionalTitle','licenseNumber'].includes(key)?text(body[key],200):list(body[key]);}return value;
};
export const decisionPayload=body=>{
  exact(body,['rowVersion','outcome','ownerMessage','internalNote','evidenceReference','evidenceSupported','validFrom','validUntil']);decimal(body.rowVersion);
  if(!['approved','rejected'].includes(body.outcome))throw fail('Decisión no válida.');
  text(body.ownerMessage,2000,body.outcome==='rejected');if(body.internalNote!==undefined)text(body.internalNote,4000);
  if(body.outcome==='approved'){
    text(body.evidenceReference,1000,true);if(body.evidenceSupported!==true)throw fail('Evidencia no sustentada.');
    for(const key of ['validFrom','validUntil'])if(body[key]!=null && (!/^\d{4}-\d{2}-\d{2}$/.test(body[key]) || Number.isNaN(Date.parse(body[key])) || new Date(body[key]).toISOString().slice(0,10)!==body[key]))throw fail('Fecha de vigencia no válida.');
    if(body.validFrom&&body.validUntil&&body.validUntil<body.validFrom)throw fail('Vigencia no válida.');
  }return body;
};
