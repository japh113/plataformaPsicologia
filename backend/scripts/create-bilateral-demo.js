import { sandboxControl,createSandboxDatabase,installBaseline } from './episode-sandbox.js';
import { installConsultationSandbox } from './admission-directed-sandbox.js';
import { bilateralFixture } from './bilateral-sandbox.js';
let control,client;
try{
  control=await sandboxControl({demo:true});const name='psicopanel_episode_demo';client=await createSandboxDatabase(control,name);
  await installBaseline(client);
  await installConsultationSandbox(client,name,{runtimeRole:'bilateral_runtime_demo',legacyRole:'consultation_legacy_demo',linkedPatients:true});
  await bilateralFixture(client);
  await client.query("UPDATE patients SET first_name='Lucía',last_name='García',full_name='Lucía García' WHERE id='bq1'");
  await client.query("UPDATE users SET first_name='Lucía',last_name='García' WHERE id='bq1'");
  console.log('Fresh fictional bilateral demo prepared. No clinical relationships, episodes or permissions.');
}catch{console.error('Fictional bilateral demo preparation failed; details withheld.');process.exitCode=1;}
finally{if(client)await client.end();if(control)await control.end();}
