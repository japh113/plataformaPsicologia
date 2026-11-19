import { sandboxControl, createSandboxDatabase, installBaseline, installFoundation, syntheticFixture } from './episode-sandbox.js';
import { preparedEpisode } from './episode-participants-fixture.js';

let control, client;
try {
  control = await sandboxControl({ demo: true });
  client = await createSandboxDatabase(control, 'psicopanel_episode_demo');
  await installBaseline(client);
  await installFoundation(client, 'psicopanel_episode_demo', '008');
  const { note } = await syntheticFixture(client);
  await client.query("UPDATE patients SET notes='FICTIONAL_PRIVATE_CONTEXT_p',risk_level='high' WHERE id='p'");
  await client.query(`UPDATE patient_clinical_notes
    SET clinical_note_objective='FICTIONAL_NOTE_OBJECTIVE_p',content='FICTIONAL_NOTE_CONTENT_p' WHERE id=$1`, [note]);
  for (const professional of ['a', 'b']) {
    const episode = await preparedEpisode(client, { professional });
    await client.query(`INSERT INTO patient_tasks(patient_id,kind,text,completed,episode_id,created_by_user_id)
      VALUES ('p','objective',$1,$2,$3,$4)`,
    ['FICTIONAL_EPISODE_OBJECTIVE_' + professional, professional === 'b', episode, professional]);
  }
  console.log('Created NEW fictional patient projection demo, including two prepared episodes with hidden attributed objectives; no activation or publication.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { if (client) await client.end(); if (control) await control.end(); }
