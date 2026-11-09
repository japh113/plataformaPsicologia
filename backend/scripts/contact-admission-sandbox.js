// Only called by explicit fresh UUID sandbox scripts/tests, never by the app.
import {randomUUID} from 'node:crypto';
import {migrate,verifyDestination} from './episode-migration.js';

export async function installContactAdmissionSchema(client,name,{target='012'}={}) {
  if(!/^[a-f0-9-]{36}$/.test(process.env.EPISODE_TEST_RUN_ID||'')||
    process.env.LOCAL_DEVELOPMENT!=='true'||process.env.PGHOST!=='db'||
    !['011','012'].includes(target)||!/^psicopanel_episode_[a-z0-9_]+$/.test(name))throw new Error('Fresh contact admission sandbox required');
  await verifyDestination(client,name);
  const suffix=randomUUID().replaceAll('-','');
  const accountReaderRole='contact_reader_'+suffix,privateNoteCreatorRole='contact_creator_'+suffix;
  // Real, distinct minimum-privilege LOGINs: 009–011 preconditions are unchanged.
  for(const role of [accountReaderRole,privateNoteCreatorRole])await client.query('CREATE ROLE '+role+" LOGIN NOINHERIT PASSWORD 'disposable_contact_roles'");
  const options={expectedDatabase:name,target,accountReaderRole,privateNoteCreatorRole};
  await migrate(client,options);
  return options;
}
