import { installEpisodeRecordSandbox } from './episode-record-sandbox.js';
import { migrate } from './episode-migration.js';
export async function installAssessmentSandbox(client,name,options={}) {
  const prior=await installEpisodeRecordSandbox(client,name,options);
  const before=(await client.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows;
  await migrate(client,{...prior,target:'016'});
  const after=(await client.query("SELECT * FROM psicopanel_schema_migrations WHERE version<'016' ORDER BY version")).rows;
  if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Historical assessment ledger changed');
  return {...prior,target:'016'};
}
