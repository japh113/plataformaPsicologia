import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import db from '../src/config/db.js';
import env from '../src/config/env.js';
import { initializeProduction } from '../scripts/initialize-production.js';
import { migrate } from '../scripts/episode-migration.js';
import { updatePatientObjective } from '../src/modules/patients/patients.service.js';

const restrictedKeys = new Set(['notes', 'riskLevel', 'clinicalNoteObjective', 'sessionObjective']);
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

test('patient response projections: private clinical fields, writes and isolation over HTTP/PostgreSQL', {
  skip: process.env.RUN_CLINICAL_INTEGRATION !== 'true',
}, async (t) => {
  assert.equal(env.nodeEnv, 'test');
  assert.equal(env.databaseUrl, '');
  assert.equal(env.dbHost, 'db');
  assert.equal(env.dbName, 'psicopanel_integrity_test');
  assert.match(process.env.EPISODE_TEST_RUN_ID || '', /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
  const name = 'psicopanel_patient_projection_test';
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
    const client = await db.getClient();
    try { await migrate(client, { expectedDatabase: name, target: '004' }); }
    finally { client.release(); }

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
      assert.equal(response.body.data[0].objectives[0].text, 'FICTIONAL_SHARED_OBJECTIVE_a');
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
    });
    const deniedWrite = async (path, actor, payload, status = 403, method = 'PATCH') => {
      const before = await persistence();
      const response = await request(path, actor, method, payload);
      assert.equal(response.status, status, actor + ' ' + method + ' ' + path);
      assertPatientProjection(response.body);
      assert.deepEqual(await persistence(), before, 'Denied write changed persistence or audit');
      return response.body;
    };

    await t.test('only the authorized psychologist completes and unmarks objectives; patient reads both states', async () => {
      const path = `/patients/a/objectives/${items.a.objective}`;
      for (const completed of [false, true, false]) {
        const updated = await request(path, 'psychologist', 'PATCH', { completed });
        assert.equal(updated.status, 200);
        assert.equal(updated.body.data.completed, completed);
        for (const readPath of ['/patients', '/patients/a']) {
          const response = await request(readPath);
          assert.equal(response.status, 200);
          assertPatientProjection(response.body);
          const patient = readPath === '/patients' ? response.body.data[0] : response.body.data;
          assert.equal(patient.objectives[0].id, items.a.objective);
          assert.equal(patient.objectives[0].completed, completed);
        }
        // Both values, including the current value, must be forbidden without
        // refreshing updated_at or introducing audit/attribution changes.
        for (const payload of [{ completed: true }, { completed: false }, { text: 'Unpermitted' },
          { completed: 'invalid' }, {}, { text: 'Unpermitted', completed }]) {
          const own = await deniedWrite(path, 'a', payload);
          const foreign = await deniedWrite(`/patients/b/objectives/${items.b.objective}`, 'a', payload);
          assert.deepEqual(own, foreign, 'Forbidden response must not disclose resource ownership');
        }
      }
    });

    await t.test('direct objective service calls reject patients and administrative actors without writes', async () => {
      for (const actor of [{ id: 'a', role: 'patient', patientId: 'a' },
        { id: 'b', role: 'patient', patientId: 'b' },
        ...['admin', 'superadmin', 'support', 'unknown'].map(role => ({ id: role, role })), undefined]) {
        for (const completed of [true, false]) {
          const before = await persistence();
          await assert.rejects(updatePatientObjective('a', items.a.objective, { completed }, actor),
            { status: actor ? 403 : 401, message: actor ? 'Forbidden' : 'Unauthorized' });
          assert.deepEqual(await persistence(), before);
        }
      }
    });

    await t.test('objective authorization preserves psychologist isolation, ownership and administrative denials', async () => {
      for (const actor of ['admin', 'superadmin', 'support']) {
        await deniedWrite(`/patients/a/objectives/${items.a.objective}`, actor, { completed: true });
      }
      for (const [patient, item, actor] of [
        ['b', items.b.objective, 'psychologist'], ['a', items.a.objective, 'psychologist_b'],
        ['a', items.b.objective, 'psychologist'], ['b', items.a.objective, 'psychologist_b'],
        ['a', '999999999', 'psychologist'],
      ]) {
        await deniedWrite(`/patients/${patient}/objectives/${item}`, actor, { completed: true }, 404);
        const before = await persistence();
        assert.equal(await updatePatientObjective(patient, item, { completed: true },
          { id: actor, role: 'psychologist' }), null);
        assert.deepEqual(await persistence(), before);
      }
      for (const completed of [true, false]) {
        const updated = await request(`/patients/b/objectives/${items.b.objective}`, 'psychologist_b', 'PATCH', { completed });
        assert.equal(updated.status, 200);
        assert.equal(updated.body.data.completed, completed);
      }
    });

    await t.test('task and objective IDs cannot cross kinds through HTTP or the objective service', async () => {
      await deniedWrite(`/patients/a/tasks/${items.a.objective}`, 'a', { completed: true }, 404);
      await deniedWrite(`/patients/a/tasks/${items.a.objective}`, 'psychologist', { completed: true }, 404);
      await deniedWrite(`/patients/a/objectives/${items.a.task}`, 'psychologist', { completed: true }, 404);
      await deniedWrite(`/patients/a/objectives/${items.a.task}`, 'a', { completed: true });
      const before = await persistence();
      assert.equal(await updatePatientObjective('a', items.a.task, { completed: true },
        { id: 'psychologist', role: 'psychologist' }), null);
      assert.deepEqual(await persistence(), before);
    });

    await t.test('objective creation, text editing and retirement remain professional operations', async () => {
      await deniedWrite('/patients/a/objectives', 'a', { text: 'Unpermitted' }, 403, 'POST');
      await deniedWrite(`/patients/a/objectives/${items.a.objective}`, 'a', undefined, 403, 'DELETE');
      const created = await request('/patients/a/objectives', 'psychologist', 'POST', { text: 'FICTIONAL_NEW_OBJECTIVE' });
      assert.equal(created.status, 201);
      const newPath = `/patients/a/objectives/${created.body.data.id}`;
      const updated = await request(newPath, 'psychologist', 'PATCH', { text: 'FICTIONAL_EDITED_OBJECTIVE', completed: true });
      assert.equal(updated.status, 200);
      assert.equal(updated.body.data.text, 'FICTIONAL_EDITED_OBJECTIVE');
      assert.equal(updated.body.data.completed, true);
      assert.equal((await request(newPath, 'psychologist', 'DELETE')).status, 200);
      await deniedWrite(newPath, 'psychologist', { completed: false }, 404);
      assert.ok((await db.query('SELECT retired_at FROM patient_tasks WHERE id=$1', [created.body.data.id])).rows[0].retired_at);
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
    await db.close();
  }
});
