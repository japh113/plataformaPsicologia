import { sandboxControl,createSandboxDatabase,installBaseline } from './episode-sandbox.js';
import { installAssessmentSandbox } from './admission-assessment-sandbox.js';
import { bilateralFixture } from './bilateral-sandbox.js';
import { command as bilateral,processQueue,closeBilateral } from '../src/modules/bilateral/bilateral.service.js';
import { command,closeAdmission } from '../src/modules/admission/admission.service.js';
import { conditionsVersion,conditionsText,sha256,declarationVersion } from '../src/modules/bilateral/bilateral.policy.js';
import { randomUUID } from 'node:crypto';
let control,client;
const actor=id=>({id,sessionVersion:0,sessionExpiresAt:Math.floor(Date.now()/1000)+3600});
const act=()=>({operationId:randomUUID(),confirmed:true});
try{
  control=await sandboxControl({demo:true});const name='psicopanel_episode_demo';client=await createSandboxDatabase(control,name);await installBaseline(client);
  await installAssessmentSandbox(client,name,{runtimeRole:'bilateral_runtime_demo',admissionRole:'admission_runtime_demo'});await bilateralFixture(client);
  Object.assign(process.env,{BILATERAL_ENABLED:'true',BILATERAL_SECRET:'fictitious-bilateral-independent-demo-key-32bytes',BILATERAL_DATABASE_URL:'postgres://bilateral_runtime_demo:disposable_bilateral_roles@db:5432/'+name,
    ADMISSION_ENABLED:'true',ADMISSION_SECRET:'fictitious-admission-independent-demo-key-32bytes',ADMISSION_DATABASE_URL:'postgres://admission_runtime_demo:disposable_admission_roles@db:5432/'+name});
  const professionalReference=(await bilateral(actor('bp1'),'professional-reference',{operationId:randomUUID()})).reference;
  const recipientReference=(await bilateral(actor('bq1'),'recipient-reference',{...act(),professionalReference})).reference;
  const receipt=await bilateral(actor('bp1'),'issue',{operationId:randomUUID(),recipientReference,email:'bq1@bilateral.invalid',conditionsVersion,conditionsHash:sha256(conditionsText('Profesional ficticio bp1')),declarationVersion,declared:true,proposed:true});
  await processQueue();const invitation=(await bilateral(actor('bq1'),'received')).find(i=>i.id===receipt.receiptId);
  const agreement=await bilateral(actor('bq1'),'accept',{...act(),expectedVersion:invitation.version,conditionsVersion,conditionsHash:invitation.conditionsHash},invitation.id);
  const prepared=await command(actor('bp1'),'prepare',{...act(),agreementId:agreement.agreementId});
  await command(actor('bp1'),'assign',{...act(),agreementId:agreement.agreementId,episodeId:prepared.episodeId,templateId:'fictional-adult-v1'});
  if((await client.query("SELECT count(*)::int n FROM care_relationships")).rows[0].n!==0||(await client.query("SELECT count(*)::int n FROM clinical_episodes WHERE status<>'prepared'")).rows[0].n!==0)throw new Error('Demo isolation assertion failed');
  const initial=(await client.query('SELECT risk_level,professional_context,technical_author_user_id FROM episode_private_record_versions WHERE episode_id=$1',[prepared.episodeId])).rows;
  if(initial.length!==1||initial[0].risk_level!=='unevaluated'||initial[0].professional_context!==''||initial[0].technical_author_user_id!==null)throw new Error('Empty private record assertion failed');
  console.log('Fresh fictional adult self-admission demo: one real bilateral agreement, explicit prepared episode and proposed versioned assignment. No clinical access or activation.');
}catch{console.error('Fictional admission demo preparation failed; details withheld.');process.exitCode=1;}
finally{await closeAdmission();await closeBilateral();if(client)await client.end();if(control)await control.end();}
