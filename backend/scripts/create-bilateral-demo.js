import { sandboxControl,createSandboxDatabase,installBaseline } from './episode-sandbox.js';
import { installBilateralSandbox,bilateralFixture } from './bilateral-sandbox.js';
let control,client;
try{
  control=await sandboxControl({demo:true});const name='psicopanel_episode_demo';client=await createSandboxDatabase(control,name);
  await installBaseline(client);await installBilateralSandbox(client,name,{runtimeRole:'bilateral_runtime_demo'});await bilateralFixture(client);
  console.log('Fresh fictional bilateral demo prepared. No clinical relationships, episodes or permissions.');
}catch{console.error('Fictional bilateral demo preparation failed; details withheld.');process.exitCode=1;}
finally{if(client)await client.end();if(control)await control.end();}
