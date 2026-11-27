import { sandboxControl,createSandboxDatabase,installBaseline } from './episode-sandbox.js';
import { installConsultationSandbox } from './admission-directed-sandbox.js';
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
  await installConsultationSandbox(client,name,{runtimeRole:'bilateral_runtime_demo',admissionRole:'admission_runtime_demo',
    legacyRole:'consultation_legacy_demo',unifiedCare:true});await bilateralFixture(client);
  if (process.env.UNIFIED_CARE_ENABLED === 'true') {
    // An independent record verifies ordinary access without deriving it from bilateral admission.
    await client.query("INSERT INTO psychologist_patient_access(psychologist_user_id,patient_id) VALUES ('bp2','bq4')");
  }
  if(process.env.FIRST_CONSULTATION_ENABLED==='true') {
    await client.query(`INSERT INTO psychologist_availability_blocks(psychologist_user_id,weekday,start_time,end_time)
      SELECT id,weekday,'08:00','18:00' FROM users CROSS JOIN generate_series(0,6) AS weekday
      WHERE id IN ('bp2','bp3')`);
  }
  Object.assign(process.env,{BILATERAL_ENABLED:'true',BILATERAL_SECRET:'fictitious-bilateral-independent-demo-key-32bytes',BILATERAL_DATABASE_URL:'postgres://bilateral_runtime_demo:disposable_bilateral_roles@db:5432/'+name,
    ADMISSION_ENABLED:'true',ADMISSION_SECRET:'fictitious-admission-independent-demo-key-32bytes',ADMISSION_DATABASE_URL:'postgres://admission_runtime_demo:disposable_admission_roles@db:5432/'+name});
  async function prepareAdmission(psy,pac) {
    const professionalReference=(await bilateral(actor(psy),'professional-reference',{operationId:randomUUID()})).reference;
    const recipientReference=(await bilateral(actor(pac),'recipient-reference',{...act(),professionalReference})).reference;
    const receipt=await bilateral(actor(psy),'issue',{operationId:randomUUID(),recipientReference,email:pac+'@bilateral.invalid',
      conditionsVersion,conditionsHash:sha256(conditionsText('Profesional ficticio '+psy)),declarationVersion,declared:true,proposed:true});
    await processQueue();
    const invitation=(await bilateral(actor(pac),'received')).find(i=>i.id===receipt.receiptId);
    const agreement=await bilateral(actor(pac),'accept',{...act(),expectedVersion:invitation.version,conditionsVersion,
      conditionsHash:invitation.conditionsHash},invitation.id);
    const prepared=await command(actor(psy),'prepare',{...act(),agreementId:agreement.agreementId});
    const assigned=await command(actor(psy),'assign',{...act(),agreementId:agreement.agreementId,
      episodeId:prepared.episodeId,templateId:'fictional-adult-v1'});
    return {prepared,assigned};
  }
  const {prepared}=await prepareAdmission('bp1','bq1');
  if(process.env.FIRST_CONSULTATION_ENABLED==='true') {
    const {prepared:episode,assigned}=await prepareAdmission('bp3','bq3');
    const read=()=>command(actor('bq3'),'detail',{},assigned.id);
    const write=async(who,operation,payload)=>command(actor(who),operation,
      {...act(),expectedVersion:(await read()).version,...payload},assigned.id);
    const detail=await read();
    await write('bq3','accept',{consentVersion:detail.consentVersion,consentHash:detail.consentHash});
    await write('bq3','save',{expectedRevision:0,answers:{reason:'Motivo ficticio',context:'Contexto ficticio'}});
    await write('bq3','submit',{expectedRevision:1});
    await write('bp3','validate',{episodeId:episode.episodeId,submission:1});
  }
  if((await client.query("SELECT count(*)::int n FROM care_relationships")).rows[0].n!==0||(await client.query("SELECT count(*)::int n FROM clinical_episodes WHERE status<>'prepared'")).rows[0].n!==0)throw new Error('Demo isolation assertion failed');
  const initial=(await client.query('SELECT risk_level,professional_context,technical_author_user_id FROM episode_private_record_versions WHERE episode_id=$1',[prepared.episodeId])).rows;
  if(initial.length!==1||initial[0].risk_level!=='unevaluated'||initial[0].professional_context!==''||initial[0].technical_author_user_id!==null)throw new Error('Empty private record assertion failed');
  console.log('Fresh fictional adult self-admission demo: one real bilateral agreement, explicit prepared episode and proposed versioned assignment. No clinical access or activation.');
}catch{console.error('Fictional admission demo preparation failed; details withheld.');process.exitCode=1;}
finally{await closeAdmission();await closeBilateral();if(client)await client.end();if(control)await control.end();}
