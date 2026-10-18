import { pathToFileURL } from 'node:url';
import { explicitConnection, verifyDestination } from './episode-migration.js';

export async function diagnose(client, expectedDatabase) {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    await client.query('SET LOCAL search_path = public, pg_catalog');
    await client.query("SET LOCAL statement_timeout = '30s'");
    await verifyDestination(client, expectedDatabase);
    const counts = (await client.query(`SELECT
      (SELECT count(*) FROM (SELECT patient_id FROM care_relationships WHERE status='active'
        GROUP BY patient_id HAVING count(*)>1) d) AS patients_with_multiple_legacy_relationships,
      (SELECT count(*) FROM patient_clinical_notes WHERE created_by_user_id IS NULL) AS notes_without_author,
      (SELECT count(*) FROM patient_clinical_notes n JOIN users u ON u.id=n.created_by_user_id
        WHERE u.role<>'psychologist') AS notes_with_non_psychologist_author,
      (SELECT count(*) FROM patient_clinical_notes n JOIN appointments a ON a.id=n.appointment_id
        WHERE n.patient_id<>a.patient_id) AS notes_with_patient_mismatch,
      (SELECT count(*) FROM patient_tasks t JOIN patient_clinical_notes n ON n.id=t.clinical_note_id
        WHERE t.patient_id<>n.patient_id) AS tasks_with_patient_mismatch`)).rows[0];
    const installed = (await client.query("SELECT to_regclass('public.clinical_episodes') AS name")).rows[0].name;
    const unattributed = {};
    if (installed) {
      for (const table of ['appointments', 'patient_clinical_notes', 'patient_tasks', 'appointment_waitlist_entries']) {
        unattributed[table] = (await client.query('SELECT count(*) AS count FROM ' + table + ' WHERE episode_id IS NULL')).rows[0].count;
      }
    }
    await client.query('COMMIT');
    return { counts, episodeFoundationInstalled: Boolean(installed), unattributed,
      policy: 'Read only; counts do not establish ownership or authorize backfill' };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const expectedDatabase = args[0]?.startsWith('--database=') ? args[0].slice(11) : undefined;
  let client;
  try {
    if (args.length !== 1) throw new Error('Usage: MIGRATION_DATABASE_URL=... npm run db:diagnose:episodes -- --database=NAME');
    client = explicitConnection(process.env.MIGRATION_DATABASE_URL, expectedDatabase);
    await client.connect();
    console.log(JSON.stringify(await diagnose(client, expectedDatabase), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  finally { if (client) await client.end(); }
}
