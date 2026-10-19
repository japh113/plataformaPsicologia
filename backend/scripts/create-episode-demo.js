import { sandboxControl, createSandboxDatabase, installBaseline, installFoundation, syntheticFixture } from './episode-sandbox.js';
let control, client;
try {
  control = await sandboxControl({ demo: true });
  client = await createSandboxDatabase(control, 'psicopanel_episode_demo');
  await installBaseline(client);
  await syntheticFixture(client);
  await installFoundation(client, 'psicopanel_episode_demo', '004');
  await client.query(`INSERT INTO clinical_episodes(patient_id,psychologist_user_id,status,started_at,finalized_at)
    VALUES ('p','b','finalized',NOW()-INTERVAL '30 days',NOW()-INTERVAL '20 days'),
      ('p','a','active',NOW(),NULL),('q','b','paused',NOW(),NULL)`);
  console.log('Created NEW development-only demo; legacy records remain unattributed; current permissions unchanged.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { if (client) await client.end(); if (control) await control.end(); }
