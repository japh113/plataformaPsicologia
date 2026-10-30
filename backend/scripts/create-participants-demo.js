import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {sandboxControl,createSandboxDatabase,installBaseline} from './episode-sandbox.js';
import {migrate} from './episode-migration.js';
import {participantIdentities,preparedEpisode,participantGraph} from './episode-participants-fixture.js';

// New SQL-only sandbox. Never connect this attributed fixture to legacy HTTP.
const control=await sandboxControl({demo:true});let client;
try{
  const name='psicopanel_episode_'+randomUUID().replaceAll('-','');
  client=await createSandboxDatabase(control,name);
  await installBaseline(client);await migrate(client,{expectedDatabase:name,target:'008'});
  await participantIdentities(client);
  const first=await preparedEpisode(client);
  await preparedEpisode(client,{professional:'b',creator:'b'});
  await preparedEpisode(client,{two:'q'});
  await participantGraph(client,first);
  await assert.rejects(client.query("INSERT INTO clinical_episodes(modality,participant_one_id,psychologist_user_id,created_by_user_id,status) VALUES('individual','p','a','p','active')"));
  const episodes=(await client.query(`SELECT e.id,e.modality,e.created_by_user_id,e.psychologist_user_id,e.status,e.started_at,e.finalized_at,
    array_agg(p.patient_id ORDER BY p.slot) AS participants FROM clinical_episodes e JOIN clinical_episode_participants p ON p.episode_id=e.id
    GROUP BY e.id ORDER BY e.id`)).rows;
  assert.deepEqual(episodes.map(e=>e.participants.length),[1,1,2]);
  console.log(JSON.stringify({mode:'structural-only-no-HTTP',run:process.env.EPISODE_TEST_RUN_ID,database:name,
    episodes,resources:{appointments:1,notes:1,tasks:1,waitlist:1},activationRejected:true}));
}finally{await client?.end();await control.end();}
