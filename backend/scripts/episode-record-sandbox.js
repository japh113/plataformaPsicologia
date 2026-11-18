import { randomUUID } from 'node:crypto';
import { installAdmissionSandbox } from './admission-sandbox.js';
import { migrate,verifyDestination } from './episode-migration.js';
import { verifyEpisodeRecordContract } from './episode-record-contract.js';

export async function installEpisodeRecordSandbox(client,name,options={}) {
  const prior=await installAdmissionSandbox(client,name,options);
  const before=(await client.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows;
  await migrate(client,{...prior,target:'015'});
  const after=(await client.query("SELECT * FROM psicopanel_schema_migrations WHERE version<'015' ORDER BY version")).rows;
  if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Historical record ledger changed');
  return {...prior,target:'015'};
}

// Ephemeral fixture LOGIN only. Never imported by app, used for authentication,
// or installed by the migration. It cannot read values or impersonate a human.
export async function provisionRecordFixtureWriter(client,name) {
  if(process.env.LOCAL_DEVELOPMENT!=='true'||!['test','development'].includes(process.env.NODE_ENV)||
    !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(process.env.EPISODE_TEST_RUN_ID||'')||
    !/^psicopanel_episode_[a-z0-9_]+$/.test(name))throw new Error('Isolated record fixture destination required');
  await verifyDestination(client,name);
  await verifyEpisodeRecordContract(client);
  const role='record_fixture_'+randomUUID().replaceAll('-','');
  await client.query('CREATE ROLE '+role+" LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD 'disposable_record_fixture'");
  await client.query('GRANT USAGE ON SCHEMA public TO '+role);
  await client.query('GRANT INSERT(episode_id,patient_id,professional_user_id,revision,previous_revision,risk_level,professional_context,recording_kind,technical_author_user_id) ON public.episode_private_record_versions TO '+role);
  return role;
}

export async function appendRecordFixture(client,{episodeId,patientId,professionalId,expectedRevision,riskLevel,context}) {
  await client.query(`INSERT INTO public.episode_private_record_versions(episode_id,patient_id,professional_user_id,revision,previous_revision,
    risk_level,professional_context,recording_kind,technical_author_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,'sandbox_fixture',$3)`,
  [episodeId,patientId,professionalId,expectedRevision+1,expectedRevision,riskLevel,context]);
}
