import bcrypt from 'bcryptjs';
import {sandboxControl,createSandboxDatabase,installBaseline,syntheticFixture} from './episode-sandbox.js';
import {migrate} from './episode-migration.js';
let control,client;
try{
  control=await sandboxControl({demo:true});const name='psicopanel_episode_demo';client=await createSandboxDatabase(control,name);
  await installBaseline(client);await syntheticFixture(client);await migrate(client,{expectedDatabase:name,target:'007'});
  const hash=await bcrypt.hash('Episode-Demo-Only-284!',4);
  for(const[id,role,status]of [['identity-admin','admin'],['identity-admin2','superadmin'],['identity-support','support'],['d2-pending','psychologist','pending_review'],['d2-rejected','psychologist','rejected'],['d2-suspended','psychologist','suspended']]){
    const email=id.replace('identity-','').replace('d2-','')+'@'+(id.startsWith('identity-')?'identity.invalid':'professional.invalid');
    await client.query('INSERT INTO users(id,first_name,email,password_hash,role) VALUES($1,$1,$2,$3,$4)',[id,email,hash,role]);
    if(status){await client.query('INSERT INTO psychologist_profiles(user_id,approval_status,review_notes) VALUES($1,$2,$3)',[id,status,'Reserved historical fixture']);
      await client.query(`INSERT INTO professional_account_messages(owner_user_id,author_user_id,author_role,account_status,owner_message)
        VALUES($1,'identity-admin','admin',$2,'Mensaje de prueba destinado expresamente al titular.')`,[id,status]);}
  }
  console.log('Fresh fictional D2 demo prepared; no episodes or public profiles.');
}catch(error){console.error(error);process.exitCode=1;}
finally{if(client)await client.end();if(control)await control.end();}
