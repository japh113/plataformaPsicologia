import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { migrate,verifyDestination } from './episode-migration.js';
import { contactDigest } from '../src/modules/auth/identity.service.js';

// Only called after a fresh database has been created and its empty public schema verified.
export async function installBilateralSandbox(client,name,{runtimeRole}={}) {
  if(!/^psicopanel_episode_[a-z0-9_]+$/.test(name)||!process.env.EPISODE_TEST_RUN_ID||process.env.LOCAL_DEVELOPMENT!=='true')throw new Error('Fresh fictitious bilateral sandbox required');
  await verifyDestination(client,name);
  const suffix=randomUUID().replaceAll('-','');
  const roles={accountReaderRole:'bil_ac_'+suffix,privateNoteCreatorRole:'bil_nc_'+suffix,bilateralClientRole:runtimeRole||'bil_rt_'+suffix};
  if(Object.values(roles).some(role=>!/^[a-z][a-z0-9_]{0,62}$/.test(role)))throw new Error('Invalid sandbox role');
  for(const role of Object.values(roles))await client.query('CREATE ROLE '+role+" LOGIN NOINHERIT PASSWORD 'disposable_bilateral_roles'");
  const options={expectedDatabase:name,target:'013',...roles};
  await migrate(client,{...options,target:'012'});
  const prior=(await client.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows;
  await migrate(client,options);
  const after=(await client.query("SELECT * FROM psicopanel_schema_migrations WHERE version<'013' ORDER BY version")).rows;
  if(JSON.stringify(prior)!==JSON.stringify(after))throw new Error('Historical migration ledger changed');
  return options;
}
export async function bilateralFixture(client) {
  const hash=await bcrypt.hash('Episode-Demo-Only-284!',4);
  for(let n=1;n<=24;n++){
    const id='bp'+n;
    await client.query("INSERT INTO users(id,first_name,email,password_hash,role) VALUES($1,$2,$3,$4,'psychologist')",[id,'Profesional ficticio '+id,id+'@bilateral.invalid',hash]);
    await client.query("INSERT INTO psychologist_profiles(user_id,approval_status) VALUES($1,'active')",[id]);
  }
  for(let n=1;n<=60;n++){
    const id='bq'+n,phone='+52550000000'+n;
    await client.query("INSERT INTO patients(id,first_name,full_name,phone,global_birth_date) VALUES($1,$1,$1,$2,'1990-01-01')",[id,phone]);
    await client.query("INSERT INTO users(id,first_name,email,password_hash,role,patient_id) VALUES($1,$1,$2,$3,'patient',$1)",[id,id+'@bilateral.invalid',hash]);
    for(const [channel,value]of [['email',id+'@bilateral.invalid'],['sms',phone]])await client.query('INSERT INTO contact_verification_state(user_id,channel,contact_digest,verified_at) VALUES($1,$2,$3,clock_timestamp())',[id,channel,contactDigest(channel,value)]);
  }
  for(const role of ['admin','superadmin','support'])await client.query('INSERT INTO users(id,first_name,email,password_hash,role) VALUES($1,$1,$2,$3,$4)',['bil-'+role,role+'@bilateral.invalid',hash,role]);
  // Explicitly authorized fictitious enablement. No account/status/clinical mutation.
  await client.query("INSERT INTO bilateral_restrictions(psychologist_id,state,justification) SELECT id,'enabled','Ensayo ficticio autorizado; no acreditación civil ni clínica' FROM users WHERE id LIKE 'bp%' AND role='psychologist'");
}
