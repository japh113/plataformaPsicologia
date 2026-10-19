import test from 'node:test';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { loadMigrations, migrate, catalogChecksum, explicitConnection } from '../scripts/episode-migration.js';
import { diagnose } from '../scripts/diagnose-episodes.js';
import { sandboxControl, createSandboxDatabase, installBaseline, syntheticFixture } from '../scripts/episode-sandbox.js';

const connect = async name => {
  const client = new pg.Client({ host: 'db', database: name, user: 'integrity_test', password: 'disposable_test_password' });
  await client.connect();
  await client.query("SET statement_timeout = '8s'");
  return client;
};
const waitForLock = async (control, pid) => {
  for (let i = 0; i < 300; i++) {
    if ((await control.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1', [pid])).rows[0]?.wait_event_type === 'Lock') return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail('Concurrent operation did not wait for a PostgreSQL lock');
};
const snapshot = async client => {
  const tables = (await client.query(`SELECT tablename FROM pg_tables WHERE schemaname='public'
    AND tablename NOT IN ('clinical_episodes','psicopanel_schema_migrations') ORDER BY tablename`)).rows;
  const result = {};
  for (const { tablename } of tables) result[tablename] = (await client.query(`SELECT to_jsonb(t)-'episode_id'-'episode_scope_id' AS data FROM "${tablename}" t ORDER BY 1`)).rows;
  return result;
};
const episode = async (client, patient = 'p', psychologist = 'a', status = 'active') =>
  (await client.query(`INSERT INTO clinical_episodes(patient_id,psychologist_user_id,status)
    VALUES ($1,$2,$3) RETURNING id`, [patient, psychologist, status])).rows[0].id;
const appointment = async (client, id = null, patient = 'p') =>
  (await client.query(`INSERT INTO appointments(patient_id,scheduled_date,scheduled_time,status,episode_id)
    VALUES ($1,CURRENT_DATE-3,'09:00','completed',$2) RETURNING id`, [patient, id])).rows[0].id;
const note = async (client, appointmentId, episodeId = null, author = null, patient = 'p') =>
  (await client.query(`INSERT INTO patient_clinical_notes(patient_id,appointment_id,clinical_note_date,episode_id,created_by_user_id)
    VALUES ($1,$2,CURRENT_DATE-3,$3,$4) RETURNING id`, [patient, appointmentId, episodeId, author])).rows[0].id;

test('003: isolated PostgreSQL installation, integrity, races, drift and rollback', {
  skip: process.env.RUN_EPISODE_INTEGRATION !== 'true',
}, async t => {
  const control = await sandboxControl();
  const clients = [];
  const fresh = async ({ populated = true, migrated = true } = {}) => {
    const name = 'psicopanel_episode_' + randomUUID().replaceAll('-', '');
    const client = await createSandboxDatabase(control, name);
    clients.push(client);
    await installBaseline(client);
    const fixture = populated ? await syntheticFixture(client) : null;
    if (migrated) await migrate(client, { expectedDatabase: name });
    return { client, name, fixture };
  };
  try {
    await t.test('explicit destination is mandatory; app defaults and connection overrides cannot select a DB', () => {
      for (const [url, name] of [[undefined,'x'],['postgres://u:p@db/a','b'],
        ['postgres://u:p@db/a?host=elsewhere','a'], ['postgres://u:p@db/a?options=-csearch_path%3Devil','a']]) {
        assert.throws(() => explicitConnection(url, name));
      }
    });
    await t.test('new empty installation; no accounts, episodes or automatic history assignment', async () => {
      const { client, name } = await fresh({ populated: false });
      for (const table of ['users', 'patients', 'clinical_episodes']) {
        assert.equal((await client.query('SELECT count(*)::int AS n FROM ' + table)).rows[0].n, 0);
      }
      assert.equal((await migrate(client, { expectedDatabase: name })).status, 'already-applied');
    });
    await t.test('sandbox refuses an existing destination, reused cluster and nondevelopment demo', async () => {
      const { client, name } = await fresh();
      const before = await snapshot(client);
      await assert.rejects(createSandboxDatabase(control, name), /existing destination/);
      await assert.rejects(sandboxControl(), /reused cluster/);
      const saved = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        await assert.rejects(sandboxControl({ demo: true }), /Refusing writes/);
      } finally { process.env.NODE_ENV = saved; }
      assert.deepEqual(await snapshot(client), before);
    });
    await t.test('actual migration and read-only diagnostic CLIs require confirmation and safely reapply', async () => {
      const { client, name } = await fresh({ migrated: false });
      const cli = (file, args, url = 'postgres://integrity_test:disposable_test_password@db/' + name) =>
        spawnSync(process.execPath, ['scripts/' + file, ...args], {
          encoding: 'utf8', env: { ...process.env, MIGRATION_DATABASE_URL: url },
        });
      const args = ['--target=003', '--database=' + name];
      let result = cli('migrate.js', args);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout).status, 'applied');
      result = cli('migrate.js', args);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout).status, 'already-applied');
      const before = await snapshot(client);
      result = cli('diagnose-episodes.js', ['--database=' + name]);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout).episodeFoundationInstalled, true);
      for (const result of [cli('migrate.js', ['--target=003','--database=wrong']),
        cli('migrate.js', args, ''), cli('migrate.js', ['--target=005','--database=' + name])]) {
        assert.notEqual(result.status, 0);
      }
      assert.deepEqual(await snapshot(client), before);
    });
    await t.test('populated synthetic installation preserves every original row and author, including history', async () => {
      const { client, name } = await fresh({ migrated: false });
      // Ambiguous relationships do not become episodes, nor block the additive foundation.
      await client.query("INSERT INTO care_relationships(patient_id,psychologist_user_id,status) VALUES ('p','b','active')");
      await client.query("UPDATE patients SET notes='synthetic original context' WHERE id='p'");
      const before = await snapshot(client);
      await migrate(client, { expectedDatabase: name });
      assert.deepEqual(await snapshot(client), before);
      assert.equal((await client.query('SELECT count(*)::int AS n FROM clinical_episodes')).rows[0].n, 0);
      const ledger = (await client.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows;
      await migrate(client, { expectedDatabase: name });
      assert.deepEqual((await client.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows, ledger);
      assert.deepEqual(await snapshot(client), before);
      const checksum = await catalogChecksum(client);
      const report = await diagnose(client, name);
      assert.equal(report.counts.patients_with_multiple_legacy_relationships, '1');
      assert.equal(report.counts.notes_without_author, '1');
      assert.equal(report.unattributed.patient_clinical_notes, '1');
      assert.equal(await catalogChecksum(client), checksum);
      assert.deepEqual(await snapshot(client), before);
      await episode(client);
      assert.equal((await migrate(client, { expectedDatabase: name })).status, 'already-applied', 'data changes do not count as catalog drift');
    });
    await t.test('file checksum, recorded checksum/version and PostgreSQL version mismatches fail closed', async () => {
      const dir = await fs.mkdtemp(os.tmpdir() + '/episode-manifest-');
      try {
        const root = new URL('../sql/migrations/', import.meta.url);
        for (const file of await fs.readdir(root)) await fs.copyFile(new URL(file, root), dir + '/' + file);
        await fs.appendFile(dir + '/003_clinical_episode_foundation.sql', '\n-- incompatible edit\n');
        await assert.rejects(loadMigrations(new URL('file://' + dir + '/')), /checksum/);
      } finally { await fs.rm(dir, { recursive: true, force: true }); }
      for (const sql of [
        "UPDATE psicopanel_schema_migrations SET file_sha256='wrong' WHERE version='001'",
        "INSERT INTO psicopanel_schema_migrations(version,file_name,file_sha256,server_major) VALUES ('999','unknown','x','17')",
        "UPDATE psicopanel_schema_migrations SET server_major='0' WHERE version='003'",
      ]) {
        const { client, name } = await fresh();
        await client.query(sql);
        const before = await snapshot(client);
        await assert.rejects(migrate(client, { expectedDatabase: name }), /Incompatible|incompatible/);
        assert.deepEqual(await snapshot(client), before);
      }
    });
    await t.test('disabled triggers, changed constraints/indexes/functions/defaults are detected without repair', async () => {
      for (const sql of [
        'ALTER TABLE clinical_episodes DISABLE TRIGGER enforce_clinical_episode_identity',
        'ALTER TABLE patient_tasks DROP CONSTRAINT tasks_note_scope_fk',
        "DROP INDEX clinical_episodes_one_current_patient_idx; CREATE UNIQUE INDEX clinical_episodes_one_current_patient_idx ON clinical_episodes(patient_id) WHERE status='active'",
        "CREATE OR REPLACE FUNCTION preserve_episode_attribution() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$",
        "ALTER TABLE clinical_episodes ALTER COLUMN status SET DEFAULT 'paused'",
      ]) {
        const { client, name } = await fresh();
        await client.query(sql);
        const before = await catalogChecksum(client);
        await assert.rejects(migrate(client, { expectedDatabase: name }), /drift/);
        assert.equal(await catalogChecksum(client), before);
      }
    });
    await t.test('missing or altered 001/002 prerequisites and untracked schemas are refused before migration', async () => {
      for (const sql of [
        'ALTER TABLE appointments DISABLE TRIGGER preserve_clinical_row',
        'ALTER TABLE patient_clinical_notes DROP CONSTRAINT patient_clinical_notes_created_by_user_id_fkey',
        "CREATE OR REPLACE FUNCTION enforce_auth_session_version() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$",
        'DROP TRIGGER revoke_psychologist_sessions ON psychologist_profiles',
        'ALTER TABLE users DROP CONSTRAINT users_session_version_check',
        'ALTER TABLE appointments ADD COLUMN episode_id BIGINT',
      ]) {
        const { client, name } = await fresh({ migrated: false });
        await client.query(sql);
        const before = await catalogChecksum(client);
        await assert.rejects(migrate(client, { expectedDatabase: name }), /prerequisite|Untracked/);
        assert.equal(await catalogChecksum(client), before);
        assert.equal((await client.query("SELECT to_regclass('public.psicopanel_schema_migrations') AS name")).rows[0].name, null);
      }
    });
    await t.test('legacy patient mismatch is diagnosed and blocks installation without rewriting notes or tasks', async () => {
      const { client, name, fixture } = await fresh({ migrated: false });
      await client.query("UPDATE patient_tasks SET patient_id='q' WHERE id=$1", [fixture.task]);
      const before = await snapshot(client);
      assert.equal((await diagnose(client, name)).counts.tasks_with_patient_mismatch, '1');
      await assert.rejects(migrate(client, { expectedDatabase: name }), /Inconsistent legacy/);
      assert.deepEqual(await snapshot(client), before);
    });
    await t.test('active AND paused exclusion, patient/professional validity and stable account-independent identity', async () => {
      const { client } = await fresh();
      const id = await episode(client);
      await assert.rejects(episode(client, 'p', 'b'), /unique/);
      await client.query("UPDATE clinical_episodes SET status='paused' WHERE id=$1", [id]);
      await assert.rejects(episode(client, 'p', 'b', 'paused'), /unique/);
      await assert.rejects(episode(client, 'missing'), /foreign key/);
      await assert.rejects(episode(client, 'q', 'p'), /foreign key/);
      await assert.rejects(client.query("UPDATE users SET role='support' WHERE id='a'"), /foreign key/);
      await assert.rejects(client.query("DELETE FROM users WHERE id='a'"));
      // Account recovery can detach/replace the patient account without touching the episode.
      await client.query("UPDATE users SET patient_id=NULL WHERE id='p'");
      await client.query("INSERT INTO users(id,first_name,email,password_hash,role,patient_id) VALUES ('recovered','P','recovered@episodes.invalid','synthetic','patient','p')");
      assert.equal((await client.query('SELECT patient_id FROM clinical_episodes WHERE id=$1', [id])).rows[0].patient_id, 'p');
      for (const mutation of ["patient_id='q'", "psychologist_user_id='b'", 'id=id+100',
        "started_at=started_at-INTERVAL '1 day'", "created_at=created_at-INTERVAL '1 day'"]) {
        await assert.rejects(client.query('UPDATE clinical_episodes SET ' + mutation + ' WHERE id=$1', [id]), /identity/);
      }
      await client.query("UPDATE clinical_episodes SET status='active' WHERE id=$1", [id]);
      await assert.rejects(client.query("UPDATE clinical_episodes SET status='finalized' WHERE id=$1", [id]), /check constraint/);
      await client.query("UPDATE clinical_episodes SET status='finalized',finalized_at=NOW() WHERE id=$1", [id]);
      for (const sql of ["status='active',finalized_at=NULL", "finalized_at=NOW()+INTERVAL '1 second'"]) {
        await assert.rejects(client.query('UPDATE clinical_episodes SET ' + sql + ' WHERE id=$1', [id]), /terminal/);
      }
      const next = await episode(client, 'p', 'b');
      await client.query("UPDATE clinical_episodes SET status='finalized',finalized_at=NOW() WHERE id=$1", [next]);
      assert.notEqual(await episode(client), id, 'A to B to A creates a new identity');
      await assert.rejects(client.query('DELETE FROM clinical_episodes WHERE id=$1', [id]), /CLINICAL_INTEGRITY/);
      await assert.rejects(client.query('TRUNCATE clinical_episodes CASCADE'), /CLINICAL_INTEGRITY/);
    });
    await t.test('composite relations reject foreign patients, wrong/missing authors and partial attribution in both directions', async () => {
      const { client, fixture } = await fresh();
      const id = await episode(client);
      const other = await episode(client, 'q', 'b');
      const appt = await appointment(client, id);
      await assert.rejects(appointment(client, id, 'q'), /foreign key/);
      await assert.rejects(note(client, appt), /foreign key/);
      await assert.rejects(note(client, appt, id), /check constraint/);
      await assert.rejects(note(client, appt, id, 'b'), /foreign key/);
      await assert.rejects(note(client, appt, other, 'b'), /foreign key/);
      const legacy = await appointment(client);
      await assert.rejects(note(client, legacy, id, 'a'), /foreign key/);
      const n = await note(client, appt, id, 'a');
      for (const [patient, linked, scope] of [['q', n, other], ['p', n, null], ['p', fixture.note, id]]) {
        await assert.rejects(client.query('INSERT INTO patient_tasks(patient_id,clinical_note_id,episode_id,text) VALUES ($1,$2,$3,$4)',
          [patient, linked, scope, 'invalid task']), /foreign key/);
      }
      await client.query("INSERT INTO patient_tasks(patient_id,clinical_note_id,episode_id,text) VALUES ('p',$1,$2,'valid task')", [n, id]);
      await client.query("INSERT INTO patient_tasks(patient_id,kind,episode_id,text) VALUES ('p','objective',$1,'standalone objective')", [id]);
      await assert.rejects(client.query("INSERT INTO appointment_waitlist_entries(patient_id,scheduled_date,scheduled_time,episode_id) VALUES ('q',CURRENT_DATE+6,'10:00',$1)", [id]), /foreign key/);
      for (const table of ['appointments', 'patient_clinical_notes', 'patient_tasks']) {
        await assert.rejects(client.query('UPDATE ' + table + ' SET episode_id=NULL WHERE episode_id=$1', [id]), /attribution/);
      }
      // Cannot assign only a legacy appointment while its existing note stays NULL.
      await assert.rejects(client.query('UPDATE appointments SET episode_id=$1 WHERE id=$2', [id, fixture.appointment]), /foreign key/);
      const legacyNote = (await client.query('SELECT * FROM patient_clinical_notes WHERE id=$1', [fixture.note])).rows[0];
      assert.equal(legacyNote.created_by_user_id, null);
      assert.equal(legacyNote.episode_id, null);
      await assert.rejects(client.query('DELETE FROM appointment_waitlist_entries'), /CLINICAL_INTEGRITY/);
    });
    await t.test('concurrent active/paused creation waits and only one commits', async () => {
      const { client, name } = await fresh();
      const contender = await connect(name);
      try {
        await client.query('BEGIN');
        await episode(client);
        const pid = (await contender.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        const rejected = assert.rejects(episode(contender, 'p', 'b', 'paused'), /unique/);
        await waitForLock(control, pid);
        await client.query('COMMIT');
        await rejected;
        assert.equal((await contender.query('SELECT count(*)::int AS n FROM clinical_episodes')).rows[0].n, 1);
      } finally { await client.query('ROLLBACK'); await contender.end(); }
    });
    await t.test('concurrent migrations serialize, yielding one install and one verified no-op', async () => {
      const { client, name } = await fresh({ migrated: false });
      const contender = await connect(name);
      try {
        const results = await Promise.all([migrate(client, { expectedDatabase: name }), migrate(contender, { expectedDatabase: name })]);
        assert.deepEqual(results.map(r => r.status).sort(), ['already-applied', 'applied']);
        assert.equal((await client.query('SELECT count(*)::int AS n FROM psicopanel_schema_migrations')).rows[0].n, 3);
      } finally { await contender.end(); }
    });
    await t.test('concurrent legacy note and parent attribution cannot commit inconsistent null scopes (both orders)', async () => {
      for (const parentFirst of [false, true]) {
        const { client, name } = await fresh();
        const id = await episode(client);
        const appt = await appointment(client);
        const contender = await connect(name);
        try {
          await client.query('BEGIN');
          if (parentFirst) await client.query('UPDATE appointments SET episode_id=$1 WHERE id=$2', [id, appt]);
          else await note(client, appt);
          const pid = (await contender.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
          const pending = parentFirst ? note(contender, appt) :
            contender.query('UPDATE appointments SET episode_id=$1 WHERE id=$2', [id, appt]);
          const rejected = assert.rejects(pending, /foreign key/);
          await waitForLock(control, pid);
          await client.query('COMMIT');
          await rejected;
        } finally { await client.query('ROLLBACK'); await contender.end(); }
      }
    });
    await t.test('001 history/note/appointment protection and 002 revocation remain effective', async () => {
      const { client, fixture } = await fresh();
      for (const sql of ['DELETE FROM patients', 'TRUNCATE patient_tasks CASCADE',
        'UPDATE clinical_record_history SET patient_id=patient_id', 'TRUNCATE clinical_record_history',
        "UPDATE appointments SET status='cancelled' WHERE id=" + fixture.appointment,
        "UPDATE patient_clinical_notes SET patient_id='q' WHERE id=" + fixture.note]) {
        await assert.rejects(client.query(sql), /CLINICAL_INTEGRITY/);
      }
      await client.query("UPDATE patient_clinical_notes SET content='synthetic correction' WHERE id=$1", [fixture.note]);
      assert.ok((await client.query("SELECT 1 FROM clinical_record_history WHERE table_name='patient_clinical_notes' AND record_id=$1", [fixture.note])).rowCount);
      const future = (await client.query("INSERT INTO appointments(patient_id,scheduled_date,scheduled_time,status) VALUES ('p',CURRENT_DATE+5,'09:00','completed') RETURNING id")).rows[0].id;
      await assert.rejects(client.query("INSERT INTO patient_clinical_notes(patient_id,appointment_id,clinical_note_date) VALUES ('p',$1,CURRENT_DATE+5)", [future]), /CLINICAL_INTEGRITY/);
      await client.query("UPDATE users SET password_hash='changed' WHERE id='a'");
      await client.query("UPDATE psychologist_profiles SET approval_status='suspended' WHERE user_id='a'");
      assert.equal((await client.query("SELECT session_version FROM users WHERE id='a'")).rows[0].session_version, 2);
      await assert.rejects(client.query("UPDATE users SET session_version=0 WHERE id='a'"), /cannot decrease/);
    });
    await t.test('injected PostgreSQL DDL failure rolls back schema, ledger and all data; retry succeeds', async () => {
      const { client, name } = await fresh({ migrated: false });
      await client.query(`CREATE FUNCTION fail_episode_install() RETURNS event_trigger LANGUAGE plpgsql AS $$
        BEGIN IF EXISTS (SELECT 1 FROM pg_event_trigger_ddl_commands() WHERE object_identity='public.clinical_episodes')
          THEN RAISE EXCEPTION 'synthetic DDL failure'; END IF; END $$;
        CREATE EVENT TRIGGER fail_episode_install ON ddl_command_end EXECUTE FUNCTION fail_episode_install()`);
      const before = await snapshot(client);
      const catalog = await catalogChecksum(client);
      await assert.rejects(migrate(client, { expectedDatabase: name }), /synthetic DDL failure/);
      assert.deepEqual(await snapshot(client), before);
      assert.equal(await catalogChecksum(client), catalog);
      assert.equal((await client.query("SELECT to_regclass('public.clinical_episodes') AS name")).rows[0].name, null);
      assert.equal((await client.query("SELECT to_regclass('public.psicopanel_schema_migrations') AS name")).rows[0].name, null);
      await client.query('DROP EVENT TRIGGER fail_episode_install; DROP FUNCTION fail_episode_install()');
      await migrate(client, { expectedDatabase: name });
      assert.deepEqual(await snapshot(client), before);
    });
  } finally {
    for (const client of clients) await client.end();
    await control.end();
  }
});
