import { installAssessmentSandbox } from './admission-assessment-sandbox.js';
import { randomUUID } from 'node:crypto';
import { migrate } from './episode-migration.js';
export async function installDirectedSandbox(client,name,options={}) {
  const roles=await installAssessmentSandbox(client,name,options);
  await migrate(client,{...roles,target:'017'});
  return {...roles,target:'017'};
}

export async function installConsultationSandbox(client,name,{legacyRole,linkedPatients=false,...options}={}) {
  const roles=await installDirectedSandbox(client,name,options);
  const consultationLegacyRole=legacyRole||'consultation_legacy_'+randomUUID().replaceAll('-','');
  if(!/^[a-z][a-z0-9_]{0,62}$/.test(consultationLegacyRole))throw new Error('Invalid isolated legacy API role');
  await client.query('CREATE ROLE '+consultationLegacyRole+" LOGIN NOINHERIT PASSWORD 'disposable_consultation_legacy'");
  const settings={...roles,target:linkedPatients?'020':'019',consultationLegacyRole};
  await migrate(client,settings);
  return settings;
}
