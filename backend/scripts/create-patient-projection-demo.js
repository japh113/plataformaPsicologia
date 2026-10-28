import { sandboxControl, createSandboxDatabase, installBaseline, installFoundation, syntheticFixture } from './episode-sandbox.js';

let control, client;
try {
  control = await sandboxControl({ demo: true });
  client = await createSandboxDatabase(control, 'psicopanel_episode_demo');
  await installBaseline(client);
  const { note } = await syntheticFixture(client);
  await client.query("UPDATE patients SET notes='FICTIONAL_PRIVATE_CONTEXT_p',risk_level='high' WHERE id='p'");
  await client.query(`UPDATE patient_clinical_notes
    SET clinical_note_objective='FICTIONAL_NOTE_OBJECTIVE_p',content='FICTIONAL_NOTE_CONTENT_p' WHERE id=$1`, [note]);
  await installFoundation(client, 'psicopanel_episode_demo', '005');
  console.log('Created NEW fictional patient projection demo; no episode activation or publication.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { if (client) await client.end(); if (control) await control.end(); }
