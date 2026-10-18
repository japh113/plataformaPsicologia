import pg from 'pg';
import fs from 'node:fs/promises';
import bcrypt from 'bcryptjs';
import { loadMigrations, migrate } from './episode-migration.js';

const connection = database => ({ host: 'db', database, user: 'integrity_test',
  password: 'disposable_test_password', connectionTimeoutMillis: 5000 });
export async function sandboxControl({ demo = false } = {}) {
  if (process.env.NODE_ENV !== (demo ? 'development' : 'test') ||
      process.env.LOCAL_DEVELOPMENT !== 'true' || process.env.PGHOST !== 'db' ||
      process.env.PGDATABASE !== 'psicopanel_integrity_test' || process.env.DATABASE_URL ||
      !/^[a-f0-9-]{36}$/.test(process.env.EPISODE_TEST_RUN_ID ?? '')) {
    throw new Error('Refusing writes: requires fresh isolated episode Compose environment');
  }
  const control = new pg.Client(connection('psicopanel_integrity_test'));
  await control.connect();
  try {
    const actual = (await control.query('SELECT current_database() AS db, current_user AS role')).rows[0];
    if (actual.db !== 'psicopanel_integrity_test' || actual.role !== 'integrity_test') throw new Error('Isolation identity mismatch');
    const databases = (await control.query("SELECT datname FROM pg_database WHERE NOT datistemplate ORDER BY datname")).rows.map(r => r.datname);
    if (databases.join(',') !== 'postgres,psicopanel_integrity_test') throw new Error('Refusing reused cluster');
    const tables = await control.query("SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace");
    if (tables.rowCount) throw new Error('Refusing populated control database');
    return control;
  } catch (error) { await control.end(); throw error; }
}
export async function createSandboxDatabase(control, name) {
  if (!/^psicopanel_episode_[a-z0-9_]+$/.test(name)) throw new Error('Invalid sandbox database name');
  if ((await control.query('SELECT 1 FROM pg_database WHERE datname=$1', [name])).rowCount) throw new Error('Refusing existing destination');
  // CREATE DATABASE itself also fails if another creator won the race; never IF NOT EXISTS.
  await control.query('CREATE DATABASE "' + name + '"');
  const client = new pg.Client(connection(name));
  await client.connect();
  const objects = await client.query("SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace");
  if (objects.rowCount || (await client.query('SELECT current_database() AS name')).rows[0].name !== name) {
    await client.end(); throw new Error('Sandbox is not empty');
  }
  return client;
}
export async function installBaseline(client) {
  // Exclusively after createSandboxDatabase has verified a brand-new empty database.
  await client.query(await fs.readFile(new URL('../sql/schema.sql', import.meta.url), 'utf8'));
  for (const migration of (await loadMigrations()).slice(0, 2)) await client.query(migration.sql);
}
export async function installFoundation(client, name) {
  return migrate(client, { expectedDatabase: name });
}
export async function syntheticFixture(client) {
  await client.query("INSERT INTO patients(id,first_name,full_name) VALUES ('p','Demo P','Demo P'),('q','Demo Q','Demo Q')");
  const password = await bcrypt.hash('Episode-Demo-Only-284!', 4);
  for (const [id, role, patient] of [['a','psychologist',null],['b','psychologist',null],['p','patient','p'],['q','patient','q']]) {
    await client.query(`INSERT INTO users(id,first_name,email,password_hash,role,patient_id) VALUES ($1,$1,$2,$3,$4,$5)`,
      [id, id + '@episodes.invalid', password, role, patient]);
  }
  await client.query("INSERT INTO psychologist_profiles(user_id,approval_status) VALUES ('a','active'),('b','active')");
  await client.query("INSERT INTO psychologist_patient_access(psychologist_user_id,patient_id) VALUES ('a','p'),('b','q')");
  await client.query("INSERT INTO care_relationships(patient_id,psychologist_user_id,status) VALUES ('p','a','active'),('q','b','active')");
  const appointment = (await client.query("INSERT INTO appointments(patient_id,scheduled_date,scheduled_time,status) VALUES ('p',CURRENT_DATE-5,'08:00','completed') RETURNING id")).rows[0].id;
  const note = (await client.query(`INSERT INTO patient_clinical_notes(patient_id,appointment_id,clinical_note_date,content,created_by_user_id)
    VALUES ('p',$1,CURRENT_DATE-5,'Synthetic legacy note: do not attribute',NULL) RETURNING id`, [appointment])).rows[0].id;
  const task = (await client.query("INSERT INTO patient_tasks(patient_id,clinical_note_id,text) VALUES ('p',$1,'Synthetic legacy task') RETURNING id", [note])).rows[0].id;
  await client.query("INSERT INTO patient_tasks(patient_id,kind,text) VALUES ('p','objective','Synthetic legacy objective')");
  await client.query("INSERT INTO appointment_waitlist_entries(patient_id,scheduled_date,scheduled_time) VALUES ('p',CURRENT_DATE+5,'10:00')");
  return { appointment, note, task };
}
