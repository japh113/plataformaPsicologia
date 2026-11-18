import { randomUUID } from 'node:crypto';
import { installBilateralSandbox } from './bilateral-sandbox.js';
import { migrate } from './episode-migration.js';
export async function installAdmissionSandbox(client,name,{admissionRole,...bilateral}={}){
  const options=await installBilateralSandbox(client,name,bilateral);
  const admissionClientRole=admissionRole||'adm_rt_'+randomUUID().replaceAll('-','');
  if(!/^[a-z][a-z0-9_]{0,62}$/.test(admissionClientRole))throw new Error('Invalid isolated admission role');
  await client.query('CREATE ROLE '+admissionClientRole+" LOGIN NOINHERIT PASSWORD 'disposable_admission_roles'");
  const before=(await client.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows;
  await migrate(client,{...options,target:'014',admissionClientRole});
  const after=(await client.query("SELECT * FROM psicopanel_schema_migrations WHERE version<'014' ORDER BY version")).rows;
  if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Historical SQL ledger changed');
  return {...options,target:'014',admissionClientRole};
}
