import bcrypt from 'bcryptjs';
import { sandboxControl, createSandboxDatabase, installBaseline, syntheticFixture } from './episode-sandbox.js';
import { migrate } from './episode-migration.js';
let control, client;
try {
  control = await sandboxControl({ demo: true });
  const name = 'psicopanel_episode_demo';
  client = await createSandboxDatabase(control, name);
  await installBaseline(client);
  await syntheticFixture(client);
  await migrate(client, { expectedDatabase: name, target: '005' });
  const hash = await bcrypt.hash('Episode-Demo-Only-284!', 10);
  // Explicit fictional adult, unverified and without relationship/access/episode.
  await client.query("INSERT INTO patients(id,first_name,last_name,full_name,email,phone,global_birth_date) VALUES ('r','Renata','Demo','Renata Demo','r@episodes.invalid','+525500000003','1990-01-01')");
  await client.query("INSERT INTO users(id,first_name,last_name,email,password_hash,role,patient_id) VALUES ('r','Renata','Demo','r@episodes.invalid',$1,'patient','r'), ('identity-admin','Admin','Demo','admin@identity.invalid',$1,'admin',NULL), ('identity-support','Soporte','Demo','support@identity.invalid',$1,'support',NULL)", [hash]);
  console.log('NEW fictional identity demo ready: r unlinked/unverified; a/p and b/q retain synthetic legacy care; no episodes created.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { if (client) await client.end(); if (control) await control.end(); }
