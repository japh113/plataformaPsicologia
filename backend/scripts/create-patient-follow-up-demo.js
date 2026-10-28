import { sandboxControl, createSandboxDatabase, installBaseline, installFoundation } from './episode-sandbox.js';
import { patientFollowUpFixture } from './patient-follow-up-fixture.js';

let control, client;
try {
  control = await sandboxControl({ demo: true });
  client = await createSandboxDatabase(control, 'psicopanel_episode_demo');
  await installBaseline(client);
  await patientFollowUpFixture(client);
  await installFoundation(client, 'psicopanel_episode_demo', '005');
  console.log('Created NEW fictional follow-up demo: April 1/5/8, historical tasks and empty histories.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { if (client) await client.end(); if (control) await control.end(); }
