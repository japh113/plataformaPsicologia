import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import db from '../src/config/db.js';
import env from '../src/config/env.js';
import { initializeProduction } from '../scripts/initialize-production.js';
import { migrate } from '../scripts/episode-migration.js';
import { preparedEpisode } from '../scripts/episode-participants-fixture.js';
import { resolveEpisodeContext } from '../src/modules/episodes/episode.context.js';
import { authorizeEpisodeOperation, episodeOperations } from '../src/modules/episodes/episode.policy.js';

const restrictedKeys = new Set(['objectives', 'objetivos', 'objectivesProgress', 'notes', 'riskLevel', 'clinicalNoteObjective', 'sessionObjective']);
const professionalMarkers = ['FICTIONAL_PRIVATE_CONTEXT_', 'FICTIONAL_NOTE_OBJECTIVE_', 'FICTIONAL_NOTE_CONTENT_'];

// Check every nested object and the complete HTTP envelope, including empty fields.
const assertPatientProjection = (body) => {
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      assert.equal(restrictedKeys.has(key), false, `Restricted response key: ${key}`);
      visit(child);
    }
  };
  visit(body);
  for (const marker of professionalMarkers) assert.equal(JSON.stringify(body).includes(marker), false);
};

const runPatientProjectionCases = async (t, target) => {
  const name = 'psicopanel_patient_projection_' + target;
  assert.equal((await db.query('SELECT 1 FROM pg_database WHERE datname=$1', [name])).rowCount, 0,
    'Requires a new destination in the verified disposable cluster');
  await db.query(`CREATE DATABASE ${name}`);
  const pool = new pg.Pool({ host: env.dbHost, port: env.dbPort, user: env.dbUser,
    password: env.dbPassword, database: name });
  const originalQuery = db.query;
  const originalGetClient = db.getClient;
  db.query = (sql, params) => pool.query(sql, params);
  db.getClient = () => pool.connect();
  let server;
  try {
    await initializeProduction(db, { nodeEnv: 'production', localDevelopment: false });
    // 008 requires an empty destination; attributed fixtures are created only
    // after installing the existing foundation, never by changing historical SQL.
    if (target === '008') {
      const client = await db.getClient();
      try { await migrate(client, { expectedDatabase: name, target }); }
      finally { client.release(); }
    }
    assert.equal((await pool.query("SELECT 1 FROM information_schema.columns WHERE table_name='patient_tasks' AND column_name='episode_id'")).rowCount, target === '008' ? 1 : 0);
    for (const id of ['a', 'b']) {
      await db.query(`INSERT INTO patients(id,first_name,full_name,notes,risk_level)
        VALUES ($1,$1,$1,$2,'high')`, [id, 'FICTIONAL_PRIVATE_CONTEXT_' + id]);
      await db.query(`INSERT INTO users(id,first_name,email,password_hash,role,patient_id)
        VALUES ($1,$1,$2,'unused-fictional-hash','patient',$1)`, [id, id + '@projection.invalid']);
    }
    for (const role of ['psychologist', 'admin', 'superadmin', 'support']) {
      await db.query(`INSERT INTO users(id,first_name,email,password_hash,role)
        VALUES ($1,$1,$2,'unused-fictional-hash',$1)`, [role, role + '@projection.invalid']);
    }
    await db.query(`INSERT INTO psychologist_profiles(user_id,approval_status) VALUES ('psychologist','active')`);
    await db.query(`INSERT INTO psychologist_patient_access(psychologist_user_id,patient_id) VALUES ('psychologist','a')`);
    await db.query(`INSERT INTO users(id,first_name,email,password_hash,role)
      VALUES ('psychologist_b','Fictional B','psychologist_b@projection.invalid','unused-fictional-hash','psychologist')`);
    await db.query("INSERT INTO psychologist_profiles(user_id,approval_status) VALUES ('psychologist_b','active')");
    await db.query("INSERT INTO psychologist_patient_access(psychologist_user_id,patient_id) VALUES ('psychologist_b','b')");
    const items = {};
    for (const id of ['a', 'b']) {
      const appointment = (await db.query(`INSERT INTO appointments(patient_id,scheduled_date,scheduled_time,status)
        VALUES ($1,CURRENT_DATE-5,'08:00','completed') RETURNING id`, [id])).rows[0].id;
      const note = (await db.query(`INSERT INTO patient_clinical_notes(patient_id,appointment_id,clinical_note_date,clinical_note_objective,content)
        VALUES ($1,$2,CURRENT_DATE-5,$3,$4) RETURNING id,clinical_note_date::text AS date`,
      [id, appointment, 'FICTIONAL_NOTE_OBJECTIVE_' + id, 'FICTIONAL_NOTE_CONTENT_' + id])).rows[0];
      const task = (await db.query(`INSERT INTO patient_tasks(patient_id,kind,text,clinical_note_id)
        VALUES ($1,'task',$2,$3) RETURNING id`, [id, 'FICTIONAL_PATIENT_TASK_' + id, note.id])).rows[0].id;
      const objective = (await db.query(`INSERT INTO patient_tasks(patient_id,kind,text)
        VALUES ($1,'objective',$2) RETURNING id`, [id, 'FICTIONAL_SHARED_OBJECTIVE_' + id])).rows[0].id;
      items[id] = { note: String(note.id), date: note.date, task: String(task), objective: String(objective) };
    }
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const request = async (path, actor = 'a', method = 'GET', body) => {
      const token = jwt.sign({ sub: actor, sv: 0 }, env.jwtSecret, { algorithm: 'HS256' });
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
        method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: await response.json() };
    };
    const expectedTask = (completed = false) => ({ id: items.a.task, text: 'FICTIONAL_PATIENT_TASK_a',
      completed, clinicalNoteId: items.a.note, clinicalNoteDate: items.a.date });
    const interview = { birthDate: '1990-01-01', birthPlace: 'FICTIONAL_PATIENT_ANSWER', occupation: 'Fictional occupation',
      maritalStatus: 'Fictional status', familyMembers: 'Fictional family', livesWith: 'Fictional household', insomnia: true };

    await t.test('authorized psychologist retains private fields in list and detail', async () => {
      const list = await request('/patients', 'psychologist');
      const detail = await request('/patients/a', 'psychologist');
      assert.equal(list.status, 200);
      assert.equal(detail.status, 200);
      assert.deepEqual(list.body.data.map(patient => patient.id), ['a']);
      for (const patient of [list.body.data[0], detail.body.data]) {
        assert.equal(patient.notes, 'FICTIONAL_PRIVATE_CONTEXT_a');
        assert.equal(patient.riskLevel, 'high');
        assert.equal(patient.tasks[0].clinicalNoteObjective, 'FICTIONAL_NOTE_OBJECTIVE_a');
        assert.equal(patient.clinicalNotes[0].content, 'FICTIONAL_NOTE_CONTENT_a');
      }
    });

    await t.test('patient list omits professional fields everywhere in the JSON', async () => {
      const response = await request('/patients');
      assert.equal(response.status, 200);
      assertPatientProjection(response.body);
      assert.deepEqual(response.body.data.map(patient => patient.id), ['a']);
      assert.deepEqual(response.body.data[0].tasks, [expectedTask()]);
      assert.equal(Object.hasOwn(response.body.data[0], 'objectives'), false);
    });

    await t.test('patient detail omits professional fields and retains task references', async () => {
      const response = await request('/patients/a');
      assert.equal(response.status, 200);
      assertPatientProjection(response.body);
      assert.deepEqual(response.body.data.tasks, [expectedTask()]);
      assert.deepEqual(response.body.data.clinicalNotes, []);
    });

    await t.test('task completion responses omit the associated professional objective', async () => {
      for (const completed of [true, false]) {
        const response = await request(`/patients/a/tasks/${items.a.task}`, 'a', 'PATCH', { completed });
        assert.equal(response.status, 200);
        assertPatientProjection(response.body);
        assert.deepEqual(response.body.data, expectedTask(completed));
        assert.equal((await db.query('SELECT completed FROM patient_tasks WHERE id=$1', [items.a.task])).rows[0].completed, completed);
      }
    });

    await t.test('first interview save returns a projected file and preserves the patients own answers', async () => {
      const response = await request('/patients/a/interview', 'a', 'PUT', interview);
      assert.equal(response.status, 200);
      assertPatientProjection(response.body);
      assert.equal(response.body.data.interviewCompleted, true);
      assert.equal(response.body.data.interview.birthPlace, interview.birthPlace);
      assert.equal(response.body.data.interview.insomnia, true);
      assert.deepEqual(response.body.data.tasks, [expectedTask()]);
      assert.equal((await request('/patients/a/interview', 'a', 'PUT', interview)).status, 403);
      const professional = await request('/patients/a/interview', 'psychologist', 'PUT', interview);
      assert.equal(professional.status, 200);
      assert.equal(professional.body.data.notes, 'FICTIONAL_PRIVATE_CONTEXT_a');
      assert.equal(professional.body.data.riskLevel, 'high');
    });

    await t.test('identifier changes cannot expose or update another patients file, task or interview', async () => {
      for (const actor of ['a', 'psychologist']) {
        for (const [path, method, body] of [
          ['/patients/b', 'GET'],
          [`/patients/b/tasks/${items.b.task}`, 'PATCH', { completed: true }],
          [`/patients/a/tasks/${items.b.task}`, 'PATCH', { completed: true }],
          ['/patients/b/interview', 'PUT', interview],
        ]) {
          const response = await request(path, actor, method, body);
          assert.equal(response.status, 404, `${actor} ${method} ${path}`);
          assertPatientProjection(response.body);
        }
      }
      const other = await request('/patients/b', 'b');
      assert.equal(other.status, 200);
      assertPatientProjection(other.body);
      assert.equal(other.body.data.tasks[0].id, items.b.task);
      assert.equal((await db.query('SELECT completed FROM patient_tasks WHERE id=$1', [items.b.task])).rows[0].completed, false);
    });

    await t.test('administrative roles retain clinical denials for reads and writes', async () => {
      for (const actor of ['admin', 'superadmin', 'support']) {
        for (const [path, method, body] of [
          ['/patients', 'GET'], ['/patients/a', 'GET'],
          ['/patients/a/interview', 'PUT', interview],
          [`/patients/a/tasks/${items.a.task}`, 'PATCH', { completed: true }],
          [`/patients/a/objectives/${items.a.objective}`, 'PATCH', { completed: true }],
        ]) {
          const response = await request(path, actor, method, body);
          assert.equal(response.status, 403);
          assertPatientProjection(response.body);
        }
      }
    });

    await t.test('patient task permissions and direct note access remain restricted', async () => {
      for (const [path, method, body] of [
        ['/patients/a/tasks', 'POST', { text: 'Unpermitted', clinicalNoteId: items.a.note }],
        [`/patients/a/tasks/${items.a.task}`, 'PATCH', { text: 'Unpermitted' }],
        [`/patients/a/tasks/${items.a.task}`, 'DELETE'],
        [`/patients/a/clinical-notes/${items.a.note}`, 'PATCH', { content: 'Unpermitted' }],
        ['/patients/a', 'PUT', { notes: 'Unpermitted', riskLevel: 'low' }],
      ]) {
        const response = await request(path, 'a', method, body);
        assert.equal(response.status, 403);
        assertPatientProjection(response.body);
      }
      assert.equal((await request(`/patients/a/clinical-notes/${items.a.note}`)).status, 404);
    });

    await t.test('psychologist retains task creation, editing and retirement with clinical context', async () => {
      const created = await request('/patients/a/tasks', 'psychologist', 'POST', { text: 'FICTIONAL_NEW_TASK', clinicalNoteId: items.a.note });
      assert.equal(created.status, 201);
      assert.equal(created.body.data.clinicalNoteObjective, 'FICTIONAL_NOTE_OBJECTIVE_a');
      const path = `/patients/a/tasks/${created.body.data.id}`;
      const updated = await request(path, 'psychologist', 'PATCH', { text: 'FICTIONAL_EDITED_TASK', completed: true });
      assert.equal(updated.status, 200);
      assert.equal(updated.body.data.text, 'FICTIONAL_EDITED_TASK');
      assert.equal(updated.body.data.completed, true);
      assert.equal(updated.body.data.clinicalNoteObjective, 'FICTIONAL_NOTE_OBJECTIVE_a');
      assert.equal((await request(path, 'psychologist', 'DELETE')).status, 200);
      assert.equal((await request(path, 'a', 'PATCH', { completed: false })).status, 404);
    });

    // Complete rows include updated_at, attribution and retirement fields; audit events
    // and patient rows must also remain identical after every denied write.
    const persistence = async () => ({
      items: (await db.query('SELECT * FROM patient_tasks ORDER BY id')).rows,
      patients: (await db.query('SELECT * FROM patients ORDER BY id')).rows,
      audit: (await db.query('SELECT * FROM audit_logs ORDER BY id')).rows,
      history: (await db.query('SELECT * FROM clinical_record_history ORDER BY id')).rows,
    });
    const deniedWrite = async (path, actor, payload, status = 403, method = 'PATCH') => {
      const before = await persistence();
      const response = await request(path, actor, method, payload);
      assert.equal(response.status, status, actor + ' ' + method + ' ' + path);
      assertPatientProjection(response.body);
      assert.deepEqual(await persistence(), before, 'Denied write changed persistence or audit');
      return response.body;
    };

    await t.test('retired objective routes accept no operation for legacy, missing, foreign or task IDs', async () => {
      for (const actor of ['a', 'b', 'psychologist', 'psychologist_b', 'admin', 'superadmin', 'support']) {
        const status = ['admin', 'superadmin', 'support'].includes(actor) ? 403 : 404;
        await deniedWrite('/patients/a/objectives', actor, { text: 'Unpermitted' }, status, 'POST');
        for (const patient of ['a', 'b']) for (const id of [items.a.objective, items.b.objective, items.a.task, '9223372036854775807']) {
          for (const method of ['PATCH', 'DELETE']) {
            await deniedWrite(`/patients/${patient}/objectives/${id}`, actor,
              method === 'PATCH' ? { text: 'Unpermitted', completed: true } : undefined, status, method);
          }
        }
      }
    });

    await t.test('objective IDs cannot be modified or retired through the retained task routes', async () => {
      for (const id of [items.a.objective, items.b.objective]) {
        for (const method of ['PATCH', 'DELETE']) {
          await deniedWrite(`/patients/a/tasks/${id}`, 'psychologist',
            method === 'PATCH' ? { completed: true } : undefined, 404, method);
        }
      }
    });

    const attributed = [];
    const legacyReads = [
      ...['a', 'psychologist', 'psychologist_b', 'admin', 'superadmin', 'support'].flatMap(actor =>
        ['/patients', '/patients/a', '/patients/a/follow-up', '/reminders/me',
          '/appointments', '/appointments/waitlist'].map(path => [path, actor])),
      ['/availability/me', 'psychologist'],
    ];
    if (target === '008') await t.test('episode objectives E1/E2 change no legacy JSON, counts, task reminders or follow-up', async () => {
      const before = [];
      for (const [path, actor] of legacyReads) before.push(await request(path, actor));
      for (const [index, professional] of ['psychologist', 'psychologist_b'].entries()) {
        const episode = await preparedEpisode(pool, { one: 'a', professional, creator: 'a' });
        const row = (await pool.query(`INSERT INTO patient_tasks
          (patient_id,kind,text,completed,episode_id,created_by_user_id)
          VALUES ('a','objective',$1,$2,$3,$4) RETURNING *`,
        ['FICTIONAL_EPISODE_OBJECTIVE_E' + (index + 1), index === 1, episode, professional])).rows[0];
        attributed.push(row);
      }
      for (const [index, [path, actor]] of legacyReads.entries()) {
        assert.deepEqual(await request(path, actor), before[index], actor + ' ' + path);
      }
      for (const actor of ['a', 'psychologist']) {
        const detail = await request('/patients/a', actor);
        assert.equal(detail.status, 200);
        assert.equal(Object.hasOwn(detail.body.data, 'objectives'), false);
      }
    });

    if (target === '008') await t.test('retired routes and alternate task routes cannot mutate E1/E2 by ID', async () => {
      for (const row of attributed) {
        for (const actor of ['a', 'psychologist', 'psychologist_b', 'admin', 'superadmin', 'support']) {
          for (const method of ['PATCH', 'DELETE']) {
            await deniedWrite(`/patients/a/objectives/${row.id}`, actor,
              method === 'PATCH' ? { text: 'Unpermitted', completed: true } : undefined,
              ['admin', 'superadmin', 'support'].includes(actor) ? 403 : 404, method);
          }
        }
        for (const method of ['PATCH', 'DELETE']) {
          await deniedWrite(`/patients/a/tasks/${row.id}`, 'psychologist',
            method === 'PATCH' ? { completed: true } : undefined, 404, method);
        }
        assert.deepEqual((await pool.query('SELECT * FROM patient_tasks WHERE id=$1', [row.id])).rows[0], row);
      }
    });

    await t.test('patient and interview write responses contain no global objective projection or derivatives', async () => {
      for (const response of [
        await request('/patients/a', 'psychologist', 'PUT', { notes: 'FICTIONAL_PRIVATE_CONTEXT_a' }),
        await request('/patients/a/interview', 'psychologist', 'PUT', interview),
      ]) {
        assert.equal(response.status, 200);
        assert.equal(Object.hasOwn(response.body.data, 'objectives'), false);
        assert.doesNotMatch(JSON.stringify(response.body), /FICTIONAL_(EPISODE_OBJECTIVE|SHARED_OBJECTIVE)_/);
      }
    });

    if (target === '008') await t.test('existing episode identification remains structural and every clinical operation remains denied', async () => {
      for (const row of attributed) {
        const context = await resolveEpisodeContext(pool, {
          actor: { id: row.created_by_user_id, role: 'psychologist', isActive: true, psychologistStatus: 'active' },
          episodeId: row.episode_id, operation: 'read', resource: { type: 'objective', id: row.id },
        });
        assert.equal(context.episode.status, 'prepared');
        assert.equal(context.resource.verified, true);
        assert.equal(context.resource.audienceVerified, false);
        for (const operation of episodeOperations) {
          assert.deepEqual(authorizeEpisodeOperation({ ...context, operation }), { allowed: false });
        }
      }
    });

    if (target === '008') await t.test('retirement leaves the existing task behavior unchanged even with attribution', async () => {
      const id = (await pool.query(`INSERT INTO patient_tasks
        (patient_id,kind,text,episode_id,created_by_user_id)
        VALUES ('a','task','FICTIONAL_TASK_REGRESSION',$1,'psychologist') RETURNING id`,
      [attributed[0].episode_id])).rows[0].id;
      assert.ok((await request('/patients/a', 'a')).body.data.tasks.some(item => item.id === id));
      const completed = await request(`/patients/a/tasks/${id}`, 'a', 'PATCH', { completed: true });
      assert.equal(completed.status, 200);
      assert.equal(completed.body.data.completed, true);
      const edited = await request(`/patients/a/tasks/${id}`, 'psychologist', 'PATCH', { text: 'FICTIONAL_TASK_EDIT' });
      assert.equal(edited.status, 200);
      assert.equal(edited.body.data.text, 'FICTIONAL_TASK_EDIT');
      assert.equal((await request(`/patients/a/tasks/${id}`, 'psychologist', 'DELETE')).status, 200);
      assert.ok((await pool.query('SELECT retired_at FROM patient_tasks WHERE id=$1', [id])).rows[0].retired_at);
    });

    await t.test('private stored fields remain intact after all patient and task operations', async () => {
      for (const id of ['a', 'b']) {
        const patient = (await db.query('SELECT notes,risk_level FROM patients WHERE id=$1', [id])).rows[0];
        assert.deepEqual(patient, { notes: 'FICTIONAL_PRIVATE_CONTEXT_' + id, risk_level: 'high' });
        const note = (await db.query('SELECT clinical_note_objective,content FROM patient_clinical_notes WHERE id=$1', [items[id].note])).rows[0];
        assert.deepEqual(note, { clinical_note_objective: 'FICTIONAL_NOTE_OBJECTIVE_' + id, content: 'FICTIONAL_NOTE_CONTENT_' + id });
      }
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    db.query = originalQuery;
    db.getClient = originalGetClient;
    await pool.end();
  }
};

test('patient response projections: retired global objectives and preserved privacy on SQL 002 and 008', {
  skip: process.env.RUN_CLINICAL_INTEGRATION !== 'true',
}, async (t) => {
  assert.equal(env.nodeEnv, 'test');
  assert.equal(env.databaseUrl, '');
  assert.equal(env.dbHost, 'db');
  assert.equal(env.dbName, 'psicopanel_integrity_test');
  assert.match(process.env.EPISODE_TEST_RUN_ID || '', /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
  try {
    for (const target of ['002', '008']) {
      await t.test(`retirement with SQL ${target}`, t => runPatientProjectionCases(t, target));
    }
  } finally { await db.close(); }
});
