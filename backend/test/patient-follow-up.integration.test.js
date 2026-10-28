import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import db from '../src/config/db.js';
import env from '../src/config/env.js';
import { initializeProduction } from '../scripts/initialize-production.js';
import { migrate } from '../scripts/episode-migration.js';
import { patientFollowUpFixture } from '../scripts/patient-follow-up-fixture.js';

test('follow-up: complete HTTP JSON, real dates, task association, privacy and authorization in a new PostgreSQL database', {
  skip: process.env.RUN_CLINICAL_INTEGRATION !== 'true',
}, async t => {
  assert.equal(env.nodeEnv, 'test');
  assert.equal(env.databaseUrl, '');
  assert.equal(env.dbHost, 'db');
  assert.equal(env.dbName, 'psicopanel_integrity_test');
  assert.match(process.env.EPISODE_TEST_RUN_ID || '', /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
  const name = 'psicopanel_follow_up_test';
  assert.equal((await db.query('SELECT 1 FROM pg_database WHERE datname=$1',[name])).rowCount, 0);
  await db.query(`CREATE DATABASE ${name}`);
  const pool = new pg.Pool({ host: env.dbHost, port: env.dbPort, user: env.dbUser, password: env.dbPassword, database: name });
  const originalQuery = db.query, originalGetClient = db.getClient;
  db.query = (sql,params) => pool.query(sql,params);
  db.getClient = () => pool.connect();
  let server;
  try {
    await initializeProduction(db, { nodeEnv: 'production', localDevelopment: false });
    const f = await patientFollowUpFixture(db);
    const client = await db.getClient();
    try { await migrate(client, { expectedDatabase: name, target: '004' }); }
    finally { client.release(); }
    server = app.listen(0,'127.0.0.1');
    await new Promise(resolve => server.once('listening',resolve));
    const request = async (path, actor = 'p', method = 'GET', payload) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
        method, headers: { Authorization: 'Bearer ' + jwt.sign({ sub: actor, sv: 0 },env.jwtSecret,{ algorithm: 'HS256' }),
          'Content-Type': 'application/json' },
        ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
      });
      return { status: response.status, body: await response.json() };
    };
    const follow = (actor = 'p', patient = actor) => request('/patients/' + patient + '/follow-up',actor);
    const expectedTask = (id,text,completed = false) => ({ id: String(id),text,completed });
    const expected = { consultations: [
      { id: String(f.eighth), scheduledDate: '2026-04-08', scheduledTime: '11:00:00', status: 'completed',
        tasks: [expectedTask(f.tasks[2],'Fictional April 8 task')] },
      { id: String(f.fifth), scheduledDate: '2026-04-05', scheduledTime: '10:00:00', status: 'completed', tasks: [] },
      { id: String(f.first), scheduledDate: '2026-04-01', scheduledTime: '09:00:00', status: 'completed',
        tasks: [expectedTask(f.tasks[0],'Fictional April 1 task A'),expectedTask(f.tasks[1],'Fictional April 1 task B',true)] },
    ], unassignedTasks: [expectedTask(f.historical,'Fictional historical task')] };
    const assertPrivacy = body => {
      const banned = new Set(['notes','riskLevel','clinicalNoteObjective','clinicalObservations',
        'nextSteps','content','clinicalNotes','clinicalNoteId','clinicalNoteDate','createdAt','updatedAt']);
      const visit = value => {
        if (!value || typeof value !== 'object') return;
        for (const [key,child] of Object.entries(value)) { assert.equal(banned.has(key),false,key); visit(child); }
      };
      visit(body);
      assert.equal(JSON.stringify(body).includes('FICTIONAL_PRIVATE'),false);
    };
    const persistence = async () => {
      const result = {};
      for (const table of ['patients','patient_tasks','patient_clinical_notes','appointments','audit_logs']) {
        result[table] = (await db.query('SELECT * FROM ' + table + ' ORDER BY id')).rows;
      }
      return result;
    };
    await t.test('April 8/5/1: three visits, 1/0/2 tasks; no note required, no retired tasks or objectives', async () => {
      const before = await persistence();
      const response = await follow();
      assert.equal(response.status,200);
      assertPrivacy(response.body);
      assert.deepEqual(response.body, { success: true, message: 'Patient follow-up fetched successfully', data: expected });
      assert.deepEqual(await persistence(),before,'Read changed clinical records');
      assert.deepEqual((await follow()).body,response.body,'Order must remain stable');
    });
    await t.test('same-day visits stay distinct, note without tasks stays visible', async () => {
      const response = await follow('q');
      assert.equal(response.status,200);
      assertPrivacy(response.body);
      assert.deepEqual(response.body.data, { consultations: [
        { id: String(f.qLate), scheduledDate: '2026-04-08', scheduledTime: '15:00:00', status: 'completed', tasks: [] },
        { id: String(f.qEarly), scheduledDate: '2026-04-08', scheduledTime: '08:00:00', status: 'completed', tasks: [] },
      ], unassignedTasks: [] });
    });
    await t.test('empty and historical-only histories remain distinct', async () => {
      assert.deepEqual((await follow('r')).body.data,{ consultations: [],unassignedTasks: [] });
      const history = await follow('s');
      assertPrivacy(history.body);
      assert.deepEqual(history.body.data.consultations,[]);
      assert.equal(history.body.data.unassignedTasks[0].text,'Fictional history only task');
    });
    await t.test('legacy unverifiable links stay unassigned in the real SQL reader, without altering persistent rows', async () => {
      const before = await persistence();
      const isolated = await pool.connect();
      const publicQuery = db.query;
      try {
        await isolated.query('BEGIN');
        // Deliberately malformed legacy rows live only in connection-local copies.
        // No persistent constraint, record, migration or historical attribution is changed.
        for (const table of ['patients','appointments','patient_clinical_notes','patient_tasks']) {
          await isolated.query('CREATE TEMP TABLE ' + table + ' ON COMMIT DROP AS SELECT * FROM public.' + table);
        }
        db.query = (sql,params) => isolated.query(sql,params);
        const pending = (await isolated.query("SELECT id FROM pg_temp.appointments WHERE patient_id='p' AND status='pending'")).rows[0].id;
        const cases = [
          ["UPDATE pg_temp.patient_tasks SET clinical_note_id=$1 WHERE id=$2", [f.qNote,f.tasks[2]], f.tasks[2]],
          ["UPDATE pg_temp.patient_tasks SET clinical_note_id=$1 WHERE id=$2", [999999,f.tasks[0]]],
          ["UPDATE pg_temp.patient_clinical_notes SET patient_id='q' WHERE id=$1", [f.firstNote]],
          ["UPDATE pg_temp.patient_clinical_notes SET appointment_id=$1 WHERE id=$2", [f.qEarly,f.firstNote]],
          ["UPDATE pg_temp.patient_clinical_notes SET appointment_id=$1 WHERE id=$2", [999999,f.firstNote]],
          ["UPDATE pg_temp.patient_clinical_notes SET appointment_id=$1 WHERE id=$2", [pending,f.firstNote]],
        ];
        for (const [sql,params,moved = f.tasks[0]] of cases) {
          await isolated.query('SAVEPOINT malformed');
          await isolated.query(sql,params);
          const response = await follow();
          assert.equal(response.status,200);
          assertPrivacy(response.body);
          const data = response.body.data;
          assert.equal(data.consultations.length,3);
          assert.equal(data.consultations.flatMap(c => c.tasks).some(task => task.id === String(moved)),false);
          assert.equal(data.unassignedTasks.some(task => task.id === String(moved)),true);
          const ids = [...data.consultations.flatMap(c => c.tasks),...data.unassignedTasks].map(task => task.id);
          assert.equal(new Set(ids).size,ids.length);
          await isolated.query('ROLLBACK TO SAVEPOINT malformed');
        }
        await isolated.query('SAVEPOINT legacy_status');
        await isolated.query("UPDATE pg_temp.appointments SET status='pending' WHERE id=$1",[f.first]);
        const agenda = await request('/appointments');
        assert.equal(agenda.status,200);
        assert.equal(agenda.body.data.find(item => item.id === String(f.first)).status,'completed',
          'Existing agenda represents a linked note as completed');
        const stored = (await isolated.query('SELECT status FROM pg_temp.appointments WHERE id=$1',[f.first])).rows[0].status;
        assert.equal(stored,'pending');
        const actualFollowUp = await follow();
        assertPrivacy(actualFollowUp.body);
        assert.equal(actualFollowUp.body.data.consultations.some(item => item.id === String(f.first)),false,
          'Follow-up keeps the approved stored-completed definition');
        assert.equal(actualFollowUp.body.data.unassignedTasks.some(item => item.id === String(f.tasks[0])),true);
        await isolated.query('ROLLBACK TO SAVEPOINT legacy_status');
        for (const zone of ['America/Chihuahua','Pacific/Kiritimati','UTC']) {
          await isolated.query("SELECT set_config('TimeZone',$1,true)",[zone]);
          assert.deepEqual((await follow()).body.data,expected);
        }
      } finally {
        db.query = publicQuery;
        await isolated.query('ROLLBACK');
        isolated.release();
      }
      assert.deepEqual(await persistence(),before);
    });
    await t.test('completion/unmark persists for linked and unlinked tasks and refreshed projection', async () => {
      for (const id of [f.tasks[0], f.historical]) {
        for (const completed of [true,false]) {
          const response = await request('/patients/p/tasks/' + id,'p','PATCH',{ completed });
          assert.equal(response.status,200);
          assert.equal(response.body.data.completed,completed);
          assert.equal(Object.hasOwn(response.body.data,'clinicalNoteObjective'),false);
          const refreshed = await follow();
          assertPrivacy(refreshed.body);
          const tasks = [...refreshed.body.data.consultations.flatMap(c => c.tasks),...refreshed.body.data.unassignedTasks];
          assert.equal(tasks.find(task => task.id === String(id)).completed,completed);
          assert.equal((await db.query('SELECT completed FROM patient_tasks WHERE id=$1',[id])).rows[0].completed,completed);
        }
      }
    });
    await t.test('patient and psychologist isolation, unknown IDs and administrative clinical denials', async () => {
      const before = await persistence();
      for (const [actor,patient,status] of [['p','q',404],['p','missing',404],['q','p',404],
        ['a','q',404],['b','p',404],['admin','p',403],['support','p',403],['superadmin','p',403]]) {
        const response = await follow(actor,patient);
        assert.equal(response.status,status,actor + '/' + patient);
        assertPrivacy(response.body);
      }
      const unauthorized = await fetch(`http://127.0.0.1:${server.address().port}/api/patients/p/follow-up`);
      assert.equal(unauthorized.status,401);
      for (const path of ['/patients/q/tasks/' + f.tasks[0],'/patients/p/tasks/' + f.objective]) {
        assert.equal((await request(path,'p','PATCH',{ completed: true })).status,404);
      }
      assert.deepEqual(await persistence(),before);
    });
    await t.test('minimal psychologist reader and professional clinical projection are independent', async () => {
      const response = await follow('a','p');
      assert.equal(response.status,200);
      assertPrivacy(response.body);
      assert.deepEqual(response.body.data,expected);
      const professional = await request('/patients/p','a');
      assert.equal(professional.status,200);
      assert.equal(professional.body.data.notes,'FICTIONAL_PRIVATE_CONTEXT');
      assert.equal(professional.body.data.riskLevel,'high');
      assert.equal(professional.body.data.clinicalNotes.length,2);
      assert.equal(professional.body.data.clinicalNotes[0].content,'FICTIONAL_PRIVATE_CONTENT');
      const updated = await request('/patients/p/tasks/' + f.tasks[0],'a','PATCH',{ text: 'Fictional edited task' });
      assert.equal(updated.status,200);
      assert.equal(updated.body.data.clinicalNoteObjective,'FICTIONAL_PRIVATE_OBJECTIVE');
      assert.equal((await follow()).body.data.consultations[2].tasks[0].text,'Fictional edited task');
    });
    await t.test('objective completion and direct note reads stay denied for patients', async () => {
      const before = await persistence();
      assert.equal((await request('/patients/p/objectives/' + f.objective,'p','PATCH',{ completed: true })).status,403);
      assert.equal((await request('/patients/p/clinical-notes/' + f.firstNote)).status,404);
      assert.deepEqual(await persistence(),before);
      assert.equal((await request('/patients/p/objectives/' + f.objective,'a','PATCH',{ completed: true })).status,200);
    });
    await t.test('DB rejects cross-patient task-to-note links; no task can appear under a foreign visit', async () => {
      await assert.rejects(db.query(`INSERT INTO patient_tasks(patient_id,text,clinical_note_id)
        VALUES ('p','Fictional invalid link',$1)`,[f.qNote]),{ code: '23503' });
      const response = await follow();
      assertPrivacy(response.body);
      assert.equal(response.body.data.consultations.some(c => c.id === String(f.qEarly)),false);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    db.query = originalQuery; db.getClient = originalGetClient;
    await pool.end(); await db.close();
  }
});
