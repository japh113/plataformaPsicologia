import { spawn } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import pg from 'pg';
import app from '../src/app.js';
import db from '../src/config/db.js';
import env from '../src/config/env.js';
import { testDeliveries } from '../src/modules/auth/verification.delivery.js';
import { migrate, loadMigrations, catalogChecksum } from '../scripts/episode-migration.js';
import { createSandboxDatabase, installBaseline, syntheticFixture } from '../scripts/episode-sandbox.js';

test('004: adult identity, private verification, concurrency and legacy barrier in disposable PostgreSQL/HTTP', {
  skip: process.env.RUN_EPISODE_INTEGRATION !== 'true',
}, async t => {
  assert.equal(env.databaseUrl, ''); assert.equal(env.dbHost, 'db');
  assert.equal(env.dbName, 'psicopanel_integrity_test'); assert.equal(env.nodeEnv, 'test');
  assert.match(process.env.EPISODE_TEST_RUN_ID || '', /^[a-f0-9-]{36}$/);
  const control = await db.getClient();
  const originalQuery = db.query, originalGetClient = db.getClient;
  const name = 'psicopanel_episode_identity_http';
  const client = await createSandboxDatabase(control, name);
  let server, pool;
  try {
    await installBaseline(client);
    await syntheticFixture(client);
    const legacy = (await client.query("SELECT id,age FROM patients ORDER BY id")).rows;
    await migrate(client, { expectedDatabase: name, target: '003' });
    const oldLedger = (await client.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows;
    await t.test('upgrade 003 -> 004 serializes with replay and keeps prior ledger, historical DOB/evidence unknown', async () => {
      const other = new pg.Client({ host: 'db', database: name, user: env.dbUser, password: env.dbPassword });
      await other.connect();
      try {
        const results = await Promise.all([migrate(client, { expectedDatabase: name, target: '004' }),
          migrate(other, { expectedDatabase: name, target: '004' })]);
        assert.deepEqual(results.map(r => r.status).sort(), ['already-applied','applied']);
      } finally { await other.end(); }
      assert.deepEqual((await client.query("SELECT * FROM psicopanel_schema_migrations WHERE version<'004' ORDER BY version")).rows, oldLedger);
      assert.deepEqual((await client.query('SELECT id,age FROM patients ORDER BY id')).rows, legacy);
      assert.equal((await client.query('SELECT 1 FROM patients WHERE global_birth_date IS NOT NULL')).rowCount, 0);
      assert.equal((await client.query('SELECT 1 FROM contact_verification_state')).rowCount, 0);
      assert.equal((await client.query('SELECT 1 FROM clinical_episodes')).rowCount, 0);
      await assert.rejects(migrate(client, { expectedDatabase: name, target: '003' }), /downgrade/);
    });
    await t.test('fresh baseline -> 004, partial DDL rollback, file/ledger checksum, version and drift fail closed', async () => {
      const freshName = 'psicopanel_episode_identity_fresh';
      const fresh = await createSandboxDatabase(control, freshName);
      try {
        await installBaseline(fresh);
        assert.equal((await migrate(fresh, { expectedDatabase: freshName, target: '004' })).status, 'applied');
        assert.equal((await fresh.query('SELECT count(*)::int n FROM psicopanel_schema_migrations')).rows[0].n, 4);
        assert.equal((await fresh.query('SELECT count(*)::int n FROM patients')).rows[0].n, 0);
        const fingerprint = await catalogChecksum(fresh);
        await fresh.query('ALTER TABLE patients ADD COLUMN identity_drift text');
        await assert.rejects(migrate(fresh, { expectedDatabase: freshName, target: '004' }), /drift/);
        await fresh.query('ALTER TABLE patients DROP COLUMN identity_drift');
        assert.equal(await catalogChecksum(fresh), fingerprint);
        await fresh.query("UPDATE psicopanel_schema_migrations SET file_sha256='wrong' WHERE version='004'");
        await assert.rejects(migrate(fresh, { expectedDatabase: freshName, target: '004' }), /checksum/);
      } finally { await fresh.end(); }
      const brokenName = 'psicopanel_episode_identity_rollback';
      const broken = await createSandboxDatabase(control, brokenName);
      try {
        await installBaseline(broken);
        await broken.query("CREATE FUNCTION invalidate_contact_verification() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$");
        await migrate(broken, { expectedDatabase: brokenName, target: '003' });
        const fingerprint = await catalogChecksum(broken);
        await assert.rejects(migrate(broken, { expectedDatabase: brokenName, target: '004' }), /already exists/);
        assert.equal(await catalogChecksum(broken), fingerprint);
        assert.equal((await broken.query("SELECT 1 FROM psicopanel_schema_migrations WHERE version='004'")).rowCount, 0);
        assert.equal((await broken.query("SELECT to_regclass('contact_verification_challenges') name")).rows[0].name, null);
      } finally { await broken.end(); }
      const dir = await fs.mkdtemp(os.tmpdir() + '/identity-manifest-');
      try {
        const root = new URL('../sql/migrations/', import.meta.url);
        for (const file of await fs.readdir(root)) await fs.copyFile(new URL(file, root), dir + '/' + file);
        await fs.appendFile(dir + '/004_patient_identity_verification.sql', '\n-- altered');
        await assert.rejects(loadMigrations(new URL('file://' + dir + '/')), /checksum/);
      } finally { await fs.rm(dir, { recursive: true }); }
      await assert.rejects(migrate(client, { expectedDatabase: name, target: '999' }), /Unsupported/);
    });
    await migrate(client, { expectedDatabase: name, target: '005' });
    pool = new pg.Pool({ host: 'db', database: name, user: env.dbUser, password: env.dbPassword });
    db.query = (sql, values) => pool.query(sql, values);
    db.getClient = () => pool.connect();
    server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const request = async (path, token, method = 'GET', body) => {
      const response = await fetch('http://127.0.0.1:' + server.address().port + '/api' + path, {
        method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: await response.json(), retryAfter: Number(response.headers.get('Retry-After')) };
    };
    const password = 'Disposable-Identity-Only-783!';
    const credentials = { firstName: 'Adult', lastName: 'Demo', email: 'adult@identity.invalid',
      phone: '+525512345678', birthDate: '1990-01-01', password };
    const login = async email => (await request('/auth/login', null, 'POST', { email, password })).body.data;
    let session, second, userId;
    const messages = () => testDeliveries().filter(m => m.userId === userId);
    const send = (channel, token = session.token) => request('/auth/verification/' + channel + '/request', token, 'POST', {});
    const confirm = (channel, secret, token = session.token) => request('/auth/verification/' + channel + '/confirm', token, 'POST', { secret });
    const ageChallenges = async (channel, seconds = 61) => {
      await client.query("UPDATE contact_verification_challenges SET created_at=created_at-($3 * INTERVAL '1 second') WHERE user_id=$1 AND channel=$2", [userId, channel, seconds]);
    };
    await t.test('invalid/minor registration rejected; accepted adult has no clinical links/access/intake, duplicate outcome uniform', async () => {
      for (const birthDate of ['2027-01-01', '2020-01-01', '2000-02-30', 'not-a-date', undefined]) {
        assert.equal((await request('/auth/register/patient', null, 'POST', { ...credentials, birthDate })).status, 400);
      }
      for (const field of ['role','patientId','emailVerifiedAt','riskLevel','reasonForConsultation','age']) {
        assert.equal((await request('/auth/register/patient', null, 'POST', { ...credentials, [field]: 'inject' })).status, 400);
      }
      const registered = await request('/auth/register/patient', null, 'POST', credentials);
      assert.equal(registered.status, 202); assert.equal('token' in registered.body.data, false);
      const duplicate = await request('/auth/register/patient', null, 'POST', { ...credentials, password: 'Different-Password-678!' });
      assert.deepEqual(duplicate.body, registered.body); assert.equal(duplicate.status, registered.status);
      const professionalPayload = { firstName: 'Professional', professionalTitle: 'Psychologist', email: 'professional@identity.invalid', password };
      const freshProfessional = await request('/auth/register/psychologist', null, 'POST', professionalPayload);
      const existingPatientEmail = await request('/auth/register/psychologist', null, 'POST', { ...professionalPayload, email: credentials.email });
      assert.equal(freshProfessional.status, 202);
      assert.deepEqual(existingPatientEmail.body, freshProfessional.body);
      session = await login(credentials.email); second = await login(credentials.email); userId = session.user.id;
      for (const table of ['care_relationships','psychologist_patient_access','clinical_episodes','patient_intakes']) {
        assert.equal((await client.query('SELECT 1 FROM ' + table + ' WHERE patient_id=$1', [session.user.patientId])).rowCount, 0, table);
      }
      const identity = await request('/auth/identity', session.token);
      assert.equal(identity.body.data.birthDate, credentials.birthDate);
      assert.equal(identity.body.data.emailVerifiedAt, null); assert.equal(identity.body.data.phoneVerifiedAt, null);
      assert.equal((await send('sms')).status, 409, 'Email prerequisite before any SMS quota consumption');
      assert.equal((await client.query("SELECT 1 FROM contact_verification_challenges WHERE user_id=$1", [userId])).rowCount, 0);
    });
    await t.test('unverified new patient cannot enumerate professional emails in the selector or related DTOs', async () => {
      const identity = (await request('/auth/identity',session.token)).body.data;
      assert.equal(identity.emailVerifiedAt,null); assert.equal(identity.phoneVerifiedAt,null);
      const professionalEmails = (await client.query("SELECT email FROM users WHERE role='psychologist'")).rows.map(r => r.email);
      for (const [path,status] of [
        ['/auth/psychologists/available',403], ['/auth/users',403], ['/auth/psychologists/pending',403],
        ['/auth/audit-logs',403], ['/auth/care-relationships',200], ['/auth/me',200],
        ['/auth/identity',200], ['/patients',200],
      ]) {
        const result = await request(path,session.token);
        assert.equal(result.status,status,path);
        for (const email of professionalEmails) assert.equal(JSON.stringify(result.body).includes(email),false,path);
        if (path === '/auth/care-relationships') assert.deepEqual(result.body.data,[]);
      }
      assert.equal((await request('/auth/psychologists/available',null)).status,401);
      const historical = (await request('/auth/login',null,'POST',{ email:'p@episodes.invalid',password:'Episode-Demo-Only-284!' })).body.data;
      const relationships = await request('/auth/care-relationships',historical.token);
      assert.equal(relationships.status,200); assert.equal(relationships.body.data.length,1);
      assert.equal(relationships.body.data[0].status,'active');
      assert.equal(relationships.body.data[0].psychologist.id,'a');
      assert.ok(relationships.body.data[0].psychologist.fullName);
      assert.equal('email' in relationships.body.data[0].psychologist,false);
      for (const email of professionalEmails) assert.equal(JSON.stringify(relationships.body).includes(email),false);
      const professional = (await request('/auth/login',null,'POST',{ email:'a@episodes.invalid',password:'Episode-Demo-Only-284!' })).body.data;
      assert.equal((await request('/auth/psychologists/available',professional.token)).status,403);
      assert.equal((await request('/patients/p',professional.token)).status,200);
    });
    await t.test('email concurrency, owner binding, replacement, expiry, consumption and cross-session visibility', async () => {
      const results = await Promise.all(Array.from({ length: 8 }, () => send('email')));
      assert.equal(results.filter(r => r.status === 200).length, 1);
      assert.equal(results.filter(r => r.status === 429).length, 7);
      assert.ok(results.find(r => r.status === 429).retryAfter > 0);
      const first = messages().at(-1);
      for (const response of results) assert.equal(JSON.stringify(response.body).includes(first.secret), false);
      const otherSession = await request('/auth/login', null, 'POST', { email: 'p@episodes.invalid', password: 'Episode-Demo-Only-284!' });
      assert.equal((await confirm('email', first.secret, otherSession.body.data.token)).status, 400);
      await ageChallenges('email');
      assert.equal((await send('email', second.token)).status, 200);
      const latest = messages().at(-1); assert.notEqual(latest.secret, first.secret);
      assert.equal((await confirm('email', first.secret)).status, 400);
      await client.query("UPDATE contact_verification_challenges SET expires_at=clock_timestamp()-INTERVAL '1 second',created_at=clock_timestamp()-INTERVAL '25 hours' WHERE id=$1", [latest.challengeId]);
      assert.equal((await confirm('email', latest.secret)).status, 400);
      await ageChallenges('email');
      assert.equal((await send('email')).status, 200);
      const good = messages().at(-1);
      const confirmations = await Promise.all([confirm('email', good.secret), confirm('email', good.secret, second.token)]);
      assert.deepEqual(confirmations.map(r => r.status).sort(), [200,400]);
      assert.ok((await request('/auth/identity', second.token)).body.data.emailVerifiedAt);
    });
    await t.test('SMS codes use keyed hashes, bounded concurrent attempts, replacement, expiry and independent evidence', async () => {
      assert.equal((await send('sms')).status, 200);
      const first = messages().at(-1);
      const stored = (await client.query('SELECT * FROM contact_verification_challenges WHERE id=$1', [first.challengeId])).rows[0];
      assert.equal(JSON.stringify(stored).includes(first.secret), false);
      const wrong = first.secret === '000000' ? '000001' : '000000';
      const failures = await Promise.all(Array.from({ length: 8 }, () => confirm('sms', wrong)));
      assert.equal(failures.filter(r => r.status === 400).length, 5);
      assert.equal(failures.filter(r => r.status === 429).length, 3);
      assert.equal((await client.query('SELECT attempts FROM contact_verification_challenges WHERE id=$1', [first.challengeId])).rows[0].attempts, 5);
      assert.equal((await confirm('sms', first.secret)).status, 429);
      assert.equal((await request('/auth/me', session.token)).status, 200);
      await ageChallenges('sms');
      const resends = await Promise.all([send('sms'),send('sms', second.token)]);
      assert.deepEqual(resends.map(r => r.status).sort(), [200,429]);
      const next = messages().at(-1);
      assert.equal((await confirm('sms', first.secret)).status, 400);
      await client.query("UPDATE contact_verification_challenges SET expires_at=clock_timestamp()-INTERVAL '1 second',created_at=clock_timestamp()-INTERVAL '11 minutes' WHERE id=$1", [next.challengeId]);
      assert.equal((await confirm('sms', next.secret)).status, 400);
      assert.equal((await send('sms')).status, 200);
      const good = messages().at(-1);
      const responses = await Promise.all([confirm('sms', good.secret),confirm('sms', good.secret, second.token)]);
      assert.deepEqual(responses.map(r => r.status).sort(), [200,400]);
      const identity = (await request('/auth/identity', second.token)).body.data;
      assert.ok(identity.emailVerifiedAt); assert.ok(identity.phoneVerifiedAt);
      assert.equal((await confirm('sms', good.secret)).status, 400);
    });
    await t.test('distinct backend processes share destination/account quotas through PostgreSQL', async () => {
      const separate = { ...credentials, email: 'instances@identity.invalid', phone: '+525511111119' };
      assert.equal((await request('/auth/register/patient', null, 'POST', separate)).status, 202);
      const account = await login(separate.email);
      assert.equal((await send('email', account.token)).status, 200);
      const email = testDeliveries().filter(m => m.userId === account.user.id).at(-1);
      assert.equal((await confirm('email', email.secret, account.token)).status, 200);
      const child = spawn(process.execPath, ['--input-type=module','-e',
        "import app from './src/app.js'; const server=app.listen(0,'127.0.0.1',()=>console.log(server.address().port));"],
        { env: { ...process.env, PGDATABASE: name }, stdio: ['ignore','pipe','pipe'] });
      try {
        const port = await new Promise((resolve,reject) => {
          const timer = setTimeout(() => reject(new Error('Second backend did not start')), 5000);
          child.once('error', reject);
          child.stdout.once('data', value => { clearTimeout(timer); resolve(Number(value.toString().trim())); });
        });
        const remoteSend = async () => {
          const response = await fetch('http://127.0.0.1:' + port + '/api/auth/verification/sms/request',
            { method: 'POST', headers: { Authorization: 'Bearer ' + account.token, 'Content-Type': 'application/json' }, body: '{}' });
          return response.status;
        };
        const codes = await Promise.all([send('sms',account.token).then(r => r.status),remoteSend(),remoteSend(),send('sms',account.token).then(r => r.status)]);
        assert.deepEqual(codes.sort(), [200,429,429,429]);
        assert.equal((await client.query("SELECT 1 FROM contact_verification_challenges WHERE user_id=$1 AND channel='sms'", [account.user.id])).rowCount, 1);
      } finally {
        child.kill('SIGTERM');
        await new Promise(resolve => child.once('exit',resolve));
      }
    });
    await t.test('name ownership, contact/DOB mass assignment, historical unknown DOB and clinical continuity', async () => {
      for (const payload of [{ birthDate: '1990-01-01' }, { email: 'other@invalid.test' }, { phone: '+525511111111' }, { patientId: 'p' }, { role: 'admin' }]) {
        assert.equal((await request('/auth/identity', session.token, 'PATCH', payload)).status, 400);
      }
      assert.equal((await request('/auth/identity', second.token, 'PATCH', { firstName: 'Renamed' })).status, 200);
      const names = (await client.query('SELECT u.first_name account,p.first_name patient FROM users u JOIN patients p ON p.id=u.patient_id WHERE u.id=$1', [userId])).rows[0];
      assert.equal(names.account, 'Renamed'); assert.equal(names.patient, 'Renamed');
      const professional = (await request('/auth/login', null, 'POST', { email: 'a@episodes.invalid', password: 'Episode-Demo-Only-284!' })).body.data;
      assert.equal((await request('/patients/' + session.user.patientId, professional.token)).status, 404);
      assert.equal((await request('/patients/p', professional.token, 'PUT', { firstName: 'Stolen' })).status, 403);
      assert.equal((await request('/patients/p', professional.token, 'PUT', { notes: 'Preserved clinical care', status: 'active' })).status, 200);
      for (const path of ['/patients/p','/appointments','/appointments/waitlist','/availability/me','/reminders/me']) {
        assert.equal((await request(path, professional.token)).status, 200, path);
      }
      const historical = (await request('/auth/login', null, 'POST', { email: 'p@episodes.invalid', password: 'Episode-Demo-Only-284!' })).body.data;
      assert.equal((await request('/auth/identity', historical.token)).body.data.birthDate, null);
    });
    await t.test('all legacy routes deny both new and historical accounts, every role; no partial grant/revocation/audit', async () => {
      const tokens = [session.token, second.token];
      for (const id of ['p','a','b']) tokens.push((await request('/auth/login', null, 'POST', { email: id + '@episodes.invalid', password: 'Episode-Demo-Only-284!' })).body.data.token);
      const tables = ['patients','users','care_relationships','psychologist_patient_access','clinical_episodes','audit_logs'];
      const snapshot = async () => Object.fromEntries(await Promise.all(tables.map(async table => [table,(await client.query('SELECT * FROM ' + table + ' ORDER BY 1')).rows])));
      const before = await snapshot();
      const routes = [
        ['POST','/patients',{ firstName: 'Minor', age: 12 }],
        ['POST','/auth/care-relationships/request',{ psychologistUserId: 'a' }],
        ['POST','/auth/care-relationships/invite',{ patientEmail: credentials.email }],
        ['PATCH','/auth/care-relationships/1/respond',{ status: 'active' }],
        ['PATCH','/auth/care-relationships/1/respond',{ status: 'rejected' }],
        ['POST','/auth/care-relationships/accept-code',{ inviteCode: 'OLD' }],
        ['POST','/auth/care-relationships',{ patientId: 'p', psychologistUserId: 'b' }],
        ['PATCH','/auth/care-relationships/1',{ status: 'active' }],
      ];
      const responses = await Promise.all(tokens.flatMap(token => routes.map(([method,path,body]) => request(path,token,method,body))));
      for (const response of responses) assert.equal(response.status, 403);
      assert.deepEqual(await snapshot(), before);
    });
    await t.test('shared-phone multiactount quotas, destination restrictions and channels cannot expose other accounts', async () => {
      const other = { ...credentials, email: 'shared@identity.invalid' };
      assert.equal((await request('/auth/register/patient', null, 'POST', other)).status, 202);
      const shared = await login(other.email);
      assert.equal((await send('sms', shared.token)).status, 409);
      assert.equal((await send('email', shared.token)).status, 200);
      const email = testDeliveries().filter(m => m.userId === shared.user.id).at(-1);
      assert.equal((await confirm('email', email.secret, shared.token)).status, 200);
      assert.equal((await request('/auth/verification/sms/request', session.token, 'POST', { phone: '+525511111111' })).status, 400);
      for (let i = 0; i < 2; i++) {
        await client.query("UPDATE contact_verification_challenges SET created_at=created_at-INTERVAL '61 seconds' WHERE channel='sms'");
        assert.equal((await send('sms', shared.token)).status, 200);
      }
      await client.query("UPDATE contact_verification_challenges SET created_at=created_at-INTERVAL '61 seconds' WHERE channel='sms'");
      const denied = await Promise.all([send('sms'),send('sms',shared.token)]);
      for (const result of denied) { assert.equal(result.status, 429); assert.ok(result.retryAfter > 80000); }
      assert.equal((await confirm('sms', testDeliveries().filter(m => m.userId === shared.user.id && m.channel === 'sms').at(-1).secret)).status, 400);
      for (let i = 0; i < 3; i++) { await ageChallenges('email'); assert.equal((await send('email')).status, 200); }
      await ageChallenges('email'); assert.equal((await send('email')).status, 429);
    });
    await t.test('replaced and restored contacts revoke evidence/challenges; secret isolation and production adapter disabled', async () => {
      await client.query("UPDATE users SET email='temporary@identity.invalid' WHERE id=$1", [userId]);
      let after = (await request('/auth/identity', session.token)).body.data;
      assert.equal(after.emailVerifiedAt, null);
      assert.ok(after.phoneVerifiedAt, 'Changing email does not revoke independent SMS evidence');
      await client.query('UPDATE users SET email=$2 WHERE id=$1', [userId, credentials.email]);
      await client.query('UPDATE patients SET phone=$2 WHERE id=$1', [session.user.patientId, '+525500000009']);
      await client.query('UPDATE patients SET phone=$2 WHERE id=$1', [session.user.patientId, credentials.phone]);
      assert.equal((await request('/auth/identity', session.token)).body.data.phoneVerifiedAt, null);
      await client.query("UPDATE users SET email='changed@identity.invalid' WHERE id=$1", [userId]);
      await client.query('UPDATE users SET email=$2 WHERE id=$1', [userId, credentials.email]);
      const identity = (await request('/auth/identity', session.token)).body.data;
      assert.equal(identity.emailVerifiedAt, null); assert.equal(identity.phoneVerifiedAt, null);
      const lastEmail = messages().filter(m => m.channel === 'email').at(-1);
      assert.equal((await confirm('email', lastEmail.secret)).status, 400);
      const history = JSON.stringify((await client.query('SELECT * FROM audit_logs')).rows) + JSON.stringify((await client.query('SELECT * FROM clinical_record_history')).rows);
      const publicResults = JSON.stringify((await request('/auth/me',session.token)).body) + JSON.stringify((await request('/auth/care-relationships',session.token)).body);
      for (const message of messages()) {
        assert.equal(history.includes(message.secret), false);
        assert.equal(publicResults.includes(message.secret), false);
      }
      const previous = env.nodeEnv; env.nodeEnv = 'production';
      try { assert.equal((await send('email')).status, 503); }
      finally { env.nodeEnv = previous; }
      assert.equal((await request('/auth/identity', null)).status, 401);
      for (const id of ['a','b']) {
        const professional = (await request('/auth/login', null, 'POST', { email: id + '@episodes.invalid', password: 'Episode-Demo-Only-284!' })).body.data;
        for (const path of ['/auth/identity','/auth/verification/email/request','/auth/verification/sms/confirm']) {
          assert.equal((await request(path,professional.token,path.endsWith('identity') ? 'GET':'POST',path.endsWith('identity') ? undefined:{ secret: '123456' })).status, 403);
        }
      }
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    db.query = originalQuery; db.getClient = originalGetClient;
    if (pool) await pool.end();
    await client.end(); control.release(); await db.close();
  }
});
