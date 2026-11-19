import { installAssessmentSandbox } from './admission-assessment-sandbox.js';
import { migrate } from './episode-migration.js';
export async function installDirectedSandbox(client,name,options={}) {
  const roles=await installAssessmentSandbox(client,name,options);
  await migrate(client,{...roles,target:'017'});
  return {...roles,target:'017'};
}
