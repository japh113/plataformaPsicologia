import { migrate as migrateEpisodes } from '../scripts/episode-migration.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import app from '../src/app.js';
import db from '../src/config/db.js';
import env from '../src/config/env.js';
import { initializeProduction } from '../scripts/initialize-production.js';

test('backoffice clinical isolation and operational projections with PostgreSQL and HTTP', {
  skip: process.env.RUN_AUTH_INTEGRATION !== 'true',
}, async t => {
  assert.equal(env.databaseUrl, '');
  assert.equal(env.dbName, 'psicopanel_integrity_test');
  assert.equal(env.dbHost, 'db');
  assert.equal(env.nodeEnv, 'test');
  assert.equal((await db.query("SELECT 1 FROM pg_database WHERE datname='psicopanel_backoffice_test'")).rowCount, 0,
    'Requires a new disposable cluster; never reuse a database');
  await db.query('CREATE DATABASE psicopanel_backoffice_test');
  const pool = new pg.Pool({ host: env.dbHost, port: env.dbPort, user: env.dbUser,
    password: env.dbPassword, database: 'psicopanel_backoffice_test' });
  const originalQuery = db.query;
  const originalGetClient = db.getClient;
  db.query = (sql, params) => pool.query(sql, params);
  db.getClient = () => pool.connect();
  let server;
  try {
    await initializeProduction(db, { nodeEnv: 'production', localDevelopment: false });
    const password = 'Disposable-Backoffice-983!';
    const hash = await bcrypt.hash(password, 4);
    const roles = ['superadmin', 'admin', 'support', 'psychologist', 'patient'];
    await db.query("INSERT INTO patients(id,first_name,last_name,full_name,email,notes,risk_level) VALUES ('own','Own','Patient','Own Patient','patient@access.invalid','clinical-context','high'), ('other','Other','Patient','Other Patient','other@access.invalid','foreign-context','low')");
    for (const role of roles) {
      await db.query(`INSERT INTO users(id,first_name,last_name,email,password_hash,role,patient_id)
        VALUES ($1,'Access',$2,$3,$4,$2,$5)`,
      [role, role, role + '@access.invalid', hash, role === 'patient' ? 'own' : null]);
    }
    await db.query("INSERT INTO psychologist_profiles(user_id,approval_status,review_notes) VALUES ('psychologist','active','legacy-free-text')");
    // Even inherited links and a linked patient ID cannot authorize an administrative actor.
    for (const role of ['admin', 'support', 'superadmin', 'psychologist']) {
      await db.query("INSERT INTO psychologist_patient_access(psychologist_user_id,patient_id) VALUES ($1,'own')", [role]);
      await db.query("INSERT INTO care_relationships(patient_id,psychologist_user_id,status,requested_by_role,notes,invite_code) VALUES ('own',$1,'active','patient','clinical-relationship-text',$2)", [role, 'CODE-' + role]);
    }
    for (const role of ['admin', 'support', 'superadmin']) {
      await db.query("INSERT INTO patients(id,first_name,full_name) VALUES ($1,'Inherited','Inherited Patient')", ['inherited-' + role]);
      await db.query('UPDATE users SET patient_id=$1 WHERE id=$2', ['inherited-' + role, role]);
    }
    await db.query("INSERT INTO patient_intakes(patient_id,birth_date,birth_place) VALUES ('own','1990-01-01','sensitive-interview')");
    const appointment = (await db.query("INSERT INTO appointments(patient_id,scheduled_date,scheduled_time,status) VALUES ('own', CURRENT_DATE - 2,'08:00','completed') RETURNING id")).rows[0].id;
    const note = (await db.query("INSERT INTO patient_clinical_notes(patient_id,appointment_id,clinical_note_date,content,created_by_user_id) VALUES ('own',$1,CURRENT_DATE - 2,'professional-note','psychologist') RETURNING id", [appointment])).rows[0].id;
    const task = (await db.query("INSERT INTO patient_tasks(patient_id,kind,text,clinical_note_id) VALUES ('own','task','patient-activity',$1) RETURNING id", [note])).rows[0].id;
    const objective = (await db.query("INSERT INTO patient_tasks(patient_id,kind,text) VALUES ('own','objective','shared-objective') RETURNING id")).rows[0].id;
    if (process.env.RUN_EPISODE_INTEGRATION === 'true') {
      const migrationClient = await db.getClient();
      try {
        const name = (await migrationClient.query('SELECT current_database() AS name')).rows[0].name;
        await migrateEpisodes(migrationClient, { expectedDatabase: name });
      } finally { migrationClient.release(); }
    }
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const tokens = {};
    const request = async (path, role, method = 'GET', body) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
        method, headers: { 'Content-Type': 'application/json', ...(tokens[role] ? { Authorization: 'Bearer ' + tokens[role] } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: await response.json() };
    };
    for (const role of roles) {
      const response = await request('/auth/login', role, 'POST', { email: role + '@access.invalid', password });
      assert.equal(response.status, 200);
      tokens[role] = response.body.data.token;
    }

    await t.test('all clinical routes deny backoffice before validation, including secondary routes', async () => {
      const routes = [
        ['GET','/patients'], ['GET','/patients/own'], ['GET','/patients/other'], ['POST','/patients'],
        ['PUT','/patients/own'], ['DELETE','/patients/own'], ['PUT','/patients/own/interview'],
        ...['tasks','objectives','clinical-notes'].flatMap(kind => [
          ['POST',`/patients/own/${kind}`], ['PATCH',`/patients/own/${kind}/1`], ['DELETE',`/patients/own/${kind}/1`],
        ]),
        ['GET','/appointments'], ['GET',`/appointments/${appointment}`], ['POST','/appointments'],
        ['PATCH',`/appointments/${appointment}`], ['DELETE',`/appointments/${appointment}`],
        ['DELETE',`/appointments/${appointment}/recurrence`], ['GET','/appointments/waitlist'],
        ['POST','/appointments/waitlist'], ['PATCH','/appointments/waitlist/reorder'], ['DELETE','/appointments/waitlist/1'],
        ['GET','/availability/me'], ['PUT','/availability/me'], ['GET','/availability/me/exceptions'],
        ['POST','/availability/me/exceptions/range'], ['PUT','/availability/me/exceptions/range'],
        ['DELETE','/availability/me/exceptions/range'], ['PUT','/availability/me/exceptions/2026-01-01'],
        ['DELETE','/availability/me/exceptions/2026-01-01'], ['GET','/reminders/me'],
        ['POST','/auth/care-relationships/request'], ['POST','/auth/care-relationships/invite'],
        ['POST','/auth/care-relationships/accept-code'], ['PATCH','/auth/care-relationships/1/respond'],
        ['GET','/patients?export=true'], ['GET','/appointments?date=2026-01-01'],
      ];
      const before = (await db.query('SELECT content FROM patient_clinical_notes')).rows;
      for (const role of ['superadmin','admin','support']) {
        for (const [method, path] of routes) {
          const response = await request(path, role, method, method === 'GET' ? undefined : {});
          assert.equal(response.status, 403, `${role} ${method} ${path}`);
          assert.equal(JSON.stringify(response.body).includes('clinical-context'), false);
        }
      }
      assert.deepEqual((await db.query('SELECT content FROM patient_clinical_notes')).rows, before);
    });

    await t.test('patients and psychologists retain scoped clinical access and patient participation', async () => {
      for (const role of ['patient','psychologist']) {
        const response = await request('/patients', role);
        assert.equal(response.status, 200);
        assert.deepEqual(response.body.data.map(p => p.id), ['own']);
        assert.equal((await request('/patients/other', role)).status, 404);
        assert.equal((await request('/appointments', role)).status, 200);
        assert.equal((await request('/appointments/waitlist', role)).status, 200);
        assert.equal((await request('/reminders/me', role)).status, 200);
      }
      const professional = await request('/patients/own', 'psychologist');
      assert.match(JSON.stringify(professional.body.data), /professional-note/);
      const patient = await request('/patients/own', 'patient');
      assert.equal(JSON.stringify(patient.body.data).includes('professional-note'), false);
      assert.match(JSON.stringify(patient.body.data), /patient-activity/);
      assert.match(JSON.stringify(patient.body.data), /sensitive-interview/);
      assert.equal((await request(`/patients/own/tasks/${task}`, 'patient', 'PATCH', { completed: true })).status, 200);
      assert.equal((await request(`/patients/own/objectives/${objective}`, 'patient', 'PATCH', { completed: true })).status, 200);
      assert.equal((await request(`/patients/own/tasks/${task}`, 'psychologist', 'PATCH', { text: 'updated-activity' })).status, 200);
      assert.equal((await request('/availability/me', 'psychologist')).status, 200);
      const relationships = await request('/auth/care-relationships', 'psychologist');
      assert.match(JSON.stringify(relationships.body.data), /CODE-psychologist/);
      assert.match(JSON.stringify(relationships.body.data), /clinical-relationship-text/);
    });

    await t.test('operational queries and psychologist reviews remain usable without free text or secrets', async () => {
      for (const role of ['admin','support','superadmin']) {
        const accounts = await request('/auth/users', role);
        assert.equal(accounts.status, 200);
        assert.equal(JSON.stringify(accounts.body).includes('legacy-free-text'), false);
        for (const account of accounts.body.data) {
          assert.equal('sessionVersion' in account, false);
          assert.equal('passwordHash' in account, false);
        }
        assert.equal((await request('/auth/psychologists/pending', role)).status, 200);
        const relationships = await request('/auth/care-relationships', role);
        assert.equal(relationships.status, 200);
        for (const relationship of relationships.body.data) {
          for (const field of ['notes','inviteCode','invitePreview','inviteExpiresAt']) assert.equal(field in relationship, false);
        }
      }
      assert.equal((await request('/auth/psychologists/psychologist/review','support','PATCH', { approvalStatus: 'active' })).status, 403);
      assert.equal((await request('/auth/care-relationships','support','POST', { patientId: 'other', psychologistUserId: 'psychologist' })).status, 403);
      for (const role of ['admin','superadmin']) {
        const reviewed = await request('/auth/psychologists/psychologist/review',role,'PATCH', { approvalStatus: 'active' });
        assert.equal(reviewed.status, 200);
        assert.equal('reviewNotes' in reviewed.body.data.psychologistProfile, false);
        assert.equal((await db.query("SELECT review_notes FROM psychologist_profiles WHERE user_id='psychologist'")).rows[0].review_notes, 'legacy-free-text');
      }
    });

    await t.test('administrative endpoints cannot create, reactivate, close or rewrite clinical relationships or inherited access', async () => {
      // Independent pairs cover every persisted source state without granting access
      // to the unlinked patient used by POST attempts.
      for (const status of ['pending', 'ended', 'rejected']) {
        const patientId = 'state-' + status;
        await db.query("INSERT INTO patients(id,first_name,full_name) VALUES ($1,'Fixture','State Fixture')", [patientId]);
        await db.query(`INSERT INTO care_relationships(patient_id,psychologist_user_id,status,requested_by_role,notes)
          VALUES ($1,'psychologist',$2,'patient','preserve-relationship')`, [patientId, status]);
      }
      const relationships = (await db.query("SELECT id,patient_id,status FROM care_relationships WHERE psychologist_user_id='psychologist' ORDER BY id")).rows;
      const snapshot = async () => ({
        relationships: (await db.query('SELECT * FROM care_relationships ORDER BY id')).rows,
        access: (await db.query('SELECT * FROM psychologist_patient_access ORDER BY psychologist_user_id,patient_id')).rows,
        audit: (await db.query('SELECT * FROM audit_logs ORDER BY id')).rows,
      });
      const before = await snapshot();
      assert.equal((await db.query("SELECT 1 FROM psychologist_patient_access WHERE patient_id='other'")).rowCount, 0);
      assert.equal((await request('/patients/other', 'psychologist')).status, 404);
      for (const role of ['admin', 'superadmin', 'support']) {
        for (const status of [undefined, 'active', 'pending', 'ended', 'rejected']) {
          // POST must neither create a new pair nor overwrite an existing one.
          for (const patientId of ['other', ...relationships.map(r => r.patient_id)]) {
            const response = await request('/auth/care-relationships', role, 'POST',
              { patientId, psychologistUserId: 'psychologist', ...(status ? { status } : {}) });
            assert.equal(response.status, 403, `${role} POST ${patientId} ${status}`);
            assert.deepEqual(await snapshot(), before);
          }
          for (const relationship of [...relationships, { id: '999999', status: 'missing' }]) {
            const response = await request('/auth/care-relationships/' + relationship.id, role, 'PATCH',
              status ? { status } : {});
            assert.equal(response.status, 403, `${role} PATCH ${relationship.status} -> ${status}`);
            assert.deepEqual(await snapshot(), before);
          }
        }
        for (const [path, method] of [['/auth/care-relationships','POST'], ['/auth/care-relationships/999999','PATCH']]) {
          for (const body of [{}, { status: 'invalid' }, { notes: 'clinical-write' }]) {
            assert.equal((await request(path, role, method, body)).status, 403);
            assert.deepEqual(await snapshot(), before);
          }
        }
      }
      assert.equal((await request('/patients/other', 'psychologist')).status, 404, 'No indirect clinical grant');
      assert.equal((await request('/patients/own', 'psychologist')).status, 200, 'Existing legitimate access remains');
    });

    await t.test('legacy audit metadata and clinical events never leak via fields, filters or the result limit', async () => {
      const metadata = { approvalStatus: 'active', notes: 'clinical-secret', riskLevel: 'high',
        inviteCode: 'invite-secret', token: 'token-secret', passwordHash: 'hash-secret',
        nested: { content: 'nested-secret' }, appointments: 42 };
      const insert = async (action, entity, patient = null, meta = metadata) => db.query(`
        INSERT INTO audit_logs(actor_user_id,actor_role,action,entity_type,entity_id,target_user_id,patient_id,metadata)
        VALUES ('admin','admin',$1,$2,'entity-secret','psychologist',$3,$4)`, [action, entity, patient, JSON.stringify(meta)]);
      await insert('psychologist_reviewed', 'psychologist_profile');
      await insert('password_reset_requested', 'auth');
      await insert('password_reset_confirmed', 'auth');
      // More than the endpoint limit, to ensure SQL filters happen before LIMIT.
      for (let i = 0; i < 85; i++) await insert('clinical_note_created','clinical_note','own');
      await insert('unknown_future_event','user');
      await insert('psychologist_reviewed','clinical_note');
      await insert('psychologist_reviewed','psychologist_profile','own');
      await insert('psychologist_reviewed','psychologist_profile',null,{ approvalStatus: { content: 'nested-secret' } });
      const before = (await db.query('SELECT * FROM audit_logs ORDER BY id')).rows;
      for (const role of ['admin','support','superadmin']) {
        const response = await request('/auth/audit-logs', role);
        assert.equal(response.status, 200);
        assert.ok(response.body.data.some(e => e.action === 'password_reset_requested'));
        assert.ok(response.body.data.some(e => e.metadata.approvalStatus === 'active'));
        assert.equal(/clinical-secret|invite-secret|token-secret|hash-secret|nested-secret|entity-secret|clinical_note/.test(JSON.stringify(response.body)), false);
        for (const entry of response.body.data) {
          assert.equal('patient' in entry, false);
          assert.equal('entityId' in entry, false);
          assert.ok(Object.keys(entry.metadata).every(key => key === 'approvalStatus'));
        }
        for (const query of ['action=clinical_note_created','search=clinical-secret','search=Own%20Patient',
          'action=unknown_future_event','actorRole=psychologist']) {
          const filtered = await request('/auth/audit-logs?' + query,role);
          assert.equal(filtered.status, 200);
          assert.deepEqual(filtered.body.data, []);
        }
      }
      assert.deepEqual((await db.query('SELECT * FROM audit_logs ORDER BY id')).rows, before, 'Never delete or rewrite historical audit events');
      for (const role of ['patient','psychologist']) assert.equal((await request('/auth/audit-logs',role)).status, 403);
    });
    await t.test('real recovery and invitation events preserve legitimate flows without logging credentials', async () => {
      const registration = await request('/auth/register/patient', null, 'POST',
        { firstName: 'Invited', email: 'invited@access.invalid', password });
      assert.equal(registration.status, 201);
      tokens.invited = registration.body.data.token;
      const invitation = await request('/auth/care-relationships/invite', 'psychologist', 'POST',
        { patientEmail: 'invited@access.invalid', notes: 'private-invitation-text' });
      assert.equal(invitation.status, 201);
      const code = invitation.body.data.inviteCode;
      assert.ok(code);
      const accepted = await request('/auth/care-relationships/accept-code', 'invited', 'POST', { inviteCode: code });
      assert.equal(accepted.status, 200);
      const reset = await request('/auth/password-reset/request', null, 'POST', { email: 'invited@access.invalid' });
      assert.equal(reset.status, 200);
      const resetToken = reset.body.data.preview.resetToken;
      assert.ok(resetToken);
      assert.equal((await request('/auth/password-reset/confirm', null, 'POST',
        { token: resetToken, password: 'New-Disposable-853!' })).status, 200);
      const allMetadata = JSON.stringify((await db.query('SELECT metadata FROM audit_logs')).rows);
      assert.equal(allMetadata.includes(code), false);
      assert.equal(allMetadata.includes(resetToken), false);
      const events = await request('/auth/audit-logs', 'admin');
      for (const action of ['password_reset_requested', 'password_reset_confirmed']) {
        assert.ok(events.body.data.some(entry => entry.action === action));
      }
      const serialized = JSON.stringify(events.body.data);
      for (const sensitive of [code, resetToken, 'private-invitation-text']) {
        assert.equal(serialized.includes(sensitive), false);
      }
    });

  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    db.query = originalQuery;
    db.getClient = originalGetClient;
    await pool.end();
    await db.close();
  }
});
