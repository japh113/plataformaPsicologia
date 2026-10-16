import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import db from '../src/config/db.js';
import env from '../src/config/env.js';
import { __testables } from '../src/modules/appointments/appointments.service.js';

const enabled = process.env.RUN_CLINICAL_INTEGRATION === 'true';
test('clinical integrity: PostgreSQL migration, HTTP API and concurrency', { skip: !enabled }, async (t) => {
  assert.equal(env.dbName, 'psicopanel_integrity_test', 'Use only the disposable test database');
  assert.equal(env.databaseUrl, '', 'Do not point integration tests at an external database');
  const sql = name => fs.readFile(new URL(`../sql/${name}`, import.meta.url), 'utf8');
  const migration = await sql('migrations/001_clinical_data_integrity.sql');
  let server;
  try {
    await db.query(await sql('schema.sql'));
    await db.query(await sql('seed.sql'));
    // Recreate representative legacy cascades to exercise upgrade, not only fresh installs.
    await db.query(`ALTER TABLE patient_tasks DROP CONSTRAINT patient_tasks_clinical_note_id_fkey;
      ALTER TABLE patient_tasks ADD CONSTRAINT legacy_task_note_fk FOREIGN KEY (clinical_note_id) REFERENCES patient_clinical_notes(id) ON DELETE CASCADE;
      ALTER TABLE patient_clinical_notes DROP CONSTRAINT patient_clinical_notes_appointment_id_fkey;
      ALTER TABLE patient_clinical_notes ADD CONSTRAINT legacy_note_appointment_fk FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE;`);
    const counts = async () => (await db.query(`SELECT
      (SELECT count(*) FROM patients)::int AS patients,
      (SELECT count(*) FROM patient_clinical_notes)::int AS notes,
      (SELECT count(*) FROM patient_tasks)::int AS tasks,
      (SELECT count(*) FROM appointments)::int AS appointments`)).rows[0];
    const before = await counts();
    await db.query(migration);
    await db.query(migration);
    assert.deepEqual(await counts(), before);
    const unsafe = await db.query(`SELECT conname FROM pg_constraint WHERE contype='f' AND confdeltype='c'
      AND confrelid IN ('patients'::regclass, 'appointments'::regclass, 'patient_clinical_notes'::regclass)`);
    assert.equal(unsafe.rowCount, 0);
    // Required schema + seed compatibility checks, solely in the disposable database.
    await db.query(await sql('schema.sql'));
    await db.query(migration);
    await db.query(await sql('seed.sql'));

    const yesterday = __testables.addDaysToDateString(__testables.getTodayDateString(), -1);
    const tomorrow = __testables.addDaysToDateString(__testables.getTodayDateString(), 1);
    const insertAppointment = async (status = 'pending', group = null, date = yesterday) =>
      (await db.query(`INSERT INTO appointments(patient_id,scheduled_date,scheduled_time,status,recurrence_group_id)
        VALUES ('1',$1,'08:00',$2,$3) RETURNING id`, [date, status, group])).rows[0].id;
    const linked = await insertAppointment('completed', 'protected');
    const note = (await db.query(`INSERT INTO patient_clinical_notes(patient_id,appointment_id,clinical_note_date,content)
      VALUES ('1',$1,$2,'original note') RETURNING id`, [linked,yesterday])).rows[0].id;
    const task = (await db.query(`INSERT INTO patient_tasks(patient_id,clinical_note_id,text) VALUES ('1',$1,'preserve me') RETURNING id`, [note])).rows[0].id;
    server = app.listen(0,'127.0.0.1');
    await new Promise(resolve => server.once('listening',resolve));
    const request = async (path, method = 'GET', body, user = 'u_psy_1') => {
      const token = jwt.sign({ sub: user }, env.jwtSecret);
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
        method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : {body: JSON.stringify(body)}),
      });
      return { status: response.status, body: await response.json() };
    };
    const waitForLock = async (pid) => {
      for (let attempt = 0; attempt < 200; attempt += 1) {
        const state = await db.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[pid]);
        if (state.rows[0]?.wait_event_type === 'Lock') return;
        await new Promise(resolve=>setTimeout(resolve,10));
      }
      assert.fail('Expected concurrent operation to wait for the appointment lock');
    };

    await t.test('legacy API deletion fails explicitly and conserves clinical rows', async () => {
      const baseline = await counts();
      for (const path of [`/patients/1`, `/appointments/${linked}`, `/appointments/${linked}/recurrence`, `/patients/1/clinical-notes/${note}`]) {
        const response = await request(path,'DELETE');
        assert.equal(response.status,409);
        assert.equal(response.body.code,'CLINICAL_RECORD_PRESERVED');
      }
      assert.deepEqual(await counts(), baseline);
      assert.equal((await request(`/appointments/${linked}`,'DELETE',undefined,'u_psy_2')).status,404);
      for (const user of ['u_pat_1','u_admin_1','u_support_1','u_superadmin_1']) {
        assert.equal((await request(`/appointments/${linked}`,'DELETE',undefined,user)).status,403);
      }
    });

    await t.test('cancel retains the appointment and does not assign the waitlist', async () => {
      const id = await insertAppointment();
      await db.query(`INSERT INTO appointment_waitlist_entries(patient_id,scheduled_date,scheduled_time) VALUES ('2',$1,'08:00')`,[yesterday]);
      assert.equal((await request(`/appointments/${id}`,'PATCH',{status:'cancelled'})).status,200);
      assert.equal((await db.query('SELECT status FROM appointments WHERE id=$1',[id])).rows[0].status,'cancelled');
      assert.equal((await db.query(`SELECT status FROM appointment_waitlist_entries WHERE patient_id='2' AND scheduled_date=$1`,[yesterday])).rows[0].status,'active');
      assert.ok((await db.query(`SELECT 1 FROM clinical_record_history WHERE table_name='appointments' AND record_id=$1 AND previous_record->>'status'='pending'`,[String(id)])).rowCount);
      const waitlist = (await db.query(`SELECT id FROM appointment_waitlist_entries WHERE patient_id='2' AND scheduled_date=$1`,[yesterday])).rows[0].id;
      assert.equal((await request(`/appointments/waitlist/${waitlist}`,'DELETE')).status,200);
      assert.equal((await db.query('SELECT status FROM appointment_waitlist_entries WHERE id=$1',[waitlist])).rows[0].status,'cancelled');
    });

    await t.test('patient inactivation preserves the complete file and existing appointments', async () => {
      const baseline = await counts();
      assert.equal((await request('/patients/1','PUT',{status:'inactive'})).status,200);
      assert.equal((await request('/patients/1')).body.data.status,'inactive');
      assert.deepEqual(await counts(),baseline);
      assert.equal((await request('/patients/1','PUT',{status:'active'})).status,200);
      for (const user of ['u_admin_1','u_support_1']) {
        assert.equal((await request('/patients/1','GET',undefined,user)).status,403);
      }
    });

    await t.test('linked note blocks cancellation, rescheduling and reassignment through HTTP and SQL', async () => {
      for (const body of [{status:'cancelled'},{scheduledDate:tomorrow},{patientId:'2'}]) {
        assert.equal((await request(`/appointments/${linked}`,'PATCH',body)).status,409);
      }
      await assert.rejects(db.query(`UPDATE appointments SET status='cancelled' WHERE id=$1`,[linked]),/CLINICAL_INTEGRITY/);
      const another = await insertAppointment('completed');
      assert.equal((await request(`/patients/1/clinical-notes/${note}`,'PATCH',{appointmentId:String(another)})).status,409);
    });

    await t.test('recurrence cancellation rolls back every occurrence when one is protected', async () => {
      const first = await insertAppointment('pending','protected',__testables.addDaysToDateString(yesterday,-7));
      assert.equal((await request(`/appointments/${first}`,'PATCH',{status:'cancelled',recurrenceEditScope:'future'})).status,409);
      assert.equal((await db.query('SELECT status FROM appointments WHERE id=$1',[first])).rows[0].status,'pending');
      const clean = await insertAppointment('pending','clean',tomorrow);
      const cleanNext = await insertAppointment('pending','clean',__testables.addDaysToDateString(tomorrow,7));
      assert.equal((await request(`/appointments/${clean}`,'PATCH',{status:'cancelled',recurrenceEditScope:'future'})).status,200);
      assert.deepEqual((await db.query('SELECT status FROM appointments WHERE id=ANY($1::bigint[]) ORDER BY id',[[clean,cleanNext]])).rows.map(r=>r.status),['cancelled','cancelled']);
      assert.equal((await db.query(`SELECT count(*)::int AS n FROM audit_logs WHERE entity_id=ANY($1::text[]) AND action='appointment_cancelled'`,[[String(clean),String(cleanNext)]])).rows[0].n,2);
    });

    await t.test('task retirement preserves rows, hides them and prevents stale updates', async () => {
      assert.equal((await request(`/patients/1/tasks/${task}`,'DELETE')).status,200);
      assert.ok((await db.query('SELECT retired_at FROM patient_tasks WHERE id=$1',[task])).rows[0].retired_at);
      const patient = await request('/patients/1');
      assert.ok(!patient.body.data.tasks.some(item=>item.id===String(task)));
      assert.equal((await request(`/patients/1/tasks/${task}`,'PATCH',{completed:true},'u_pat_1')).status,404);
      assert.equal((await request(`/patients/1/tasks/${task}`,'PATCH',{text:'changed'},'u_pat_1')).status,403);
      const newTask = (await db.query(`INSERT INTO patient_tasks(patient_id,clinical_note_id,text) VALUES ('1',$1,'retire through note') RETURNING id`,[note])).rows[0].id;
      assert.equal((await request(`/patients/1/clinical-notes/${note}`,'PATCH',{content:'corrected note',tasks:[]})).status,200);
      assert.ok((await db.query('SELECT retired_at FROM patient_tasks WHERE id=$1',[newTask])).rows[0].retired_at);
      assert.ok((await db.query(`SELECT 1 FROM clinical_record_history WHERE table_name='patient_clinical_notes' AND record_id=$1 AND previous_record->>'content'='original note'`,[String(note)])).rowCount);
      const objective = (await db.query(`INSERT INTO patient_tasks(patient_id,kind,text) VALUES ('1','objective','preserve objective') RETURNING id`)).rows[0].id;
      assert.equal((await request(`/patients/1/objectives/${objective}`,'DELETE')).status,200);
      assert.ok((await db.query('SELECT retired_at FROM patient_tasks WHERE id=$1',[objective])).rows[0].retired_at);
    });

    await t.test('rescheduling an unlinked appointment preserves its identity and original schedule', async () => {
      await db.query(`INSERT INTO psychologist_availability_blocks(psychologist_user_id,weekday,start_time,end_time)
        VALUES ('u_psy_1',EXTRACT(DOW FROM $1::date),'09:00','17:00')`,[tomorrow]);
      const appointment = await insertAppointment();
      assert.equal((await request(`/appointments/${appointment}`,'PATCH',{scheduledDate:tomorrow,scheduledTime:'10:00'})).status,200);
      const result = (await db.query('SELECT patient_id,scheduled_date::text,scheduled_time FROM appointments WHERE id=$1',[appointment])).rows[0];
      assert.equal(result.scheduled_date,tomorrow);
      assert.equal(result.scheduled_time,'10:00:00');
      assert.ok((await db.query(`SELECT 1 FROM clinical_record_history WHERE table_name='appointments' AND record_id=$1 AND previous_record->>'scheduled_date'=$2`,[String(appointment),yesterday])).rowCount);
    });

    await t.test('physical deletion and truncation are blocked even for unreferenced records', async () => {
      await db.query(`INSERT INTO patients(id,first_name,full_name) VALUES ('empty','Empty','Empty')`);
      for (const statement of ["DELETE FROM patients WHERE id='empty'", `DELETE FROM appointments WHERE id=${linked}`,
        `DELETE FROM patient_clinical_notes WHERE id=${note}`, `DELETE FROM patient_tasks WHERE id=${task}`,
        'TRUNCATE appointments CASCADE', 'TRUNCATE clinical_record_history', 'DELETE FROM clinical_record_history',
        `DELETE FROM users WHERE id='u_psy_1'`]) {
        await assert.rejects(db.query(statement));
      }
    });

    await t.test('a concurrent cancellation waits for a note then fails without changing the appointment', async () => {
      const appointment = await insertAppointment('completed');
      const writer = await db.getClient();
      const updater = await db.getClient();
      try {
        await writer.query('BEGIN');
        await writer.query(`INSERT INTO patient_clinical_notes(patient_id,appointment_id,clinical_note_date,content) VALUES ('1',$1,$2,'concurrent')`,[appointment,yesterday]);
        await updater.query("SET statement_timeout = '5s'");
        const pid = (await updater.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        const pending = updater.query(`UPDATE appointments SET status='cancelled' WHERE id=$1`,[appointment]);
        const rejected = assert.rejects(pending,/CLINICAL_INTEGRITY/);
        await waitForLock(pid);
        await writer.query('COMMIT');
        await rejected;
        assert.equal((await db.query('SELECT status FROM appointments WHERE id=$1',[appointment])).rows[0].status,'completed');
      } finally {
        await writer.query('ROLLBACK');
        writer.release(); updater.release();
      }
    });

    await t.test('a concurrent note waits for cancellation then fails without inserting a note', async () => {
      const appointment = await insertAppointment('completed');
      const canceller = await db.getClient();
      const writer = await db.getClient();
      try {
        await canceller.query('BEGIN');
        await canceller.query(`UPDATE appointments SET status='cancelled' WHERE id=$1`,[appointment]);
        await writer.query("SET statement_timeout = '5s'");
        const pid = (await writer.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        const rejected = assert.rejects(writer.query(`INSERT INTO patient_clinical_notes(patient_id,appointment_id,clinical_note_date,content) VALUES ('1',$1,$2,'must not insert')`,[appointment,yesterday]),/CLINICAL_INTEGRITY/);
        await waitForLock(pid);
        await canceller.query('COMMIT');
        await rejected;
        assert.equal((await db.query('SELECT 1 FROM patient_clinical_notes WHERE appointment_id=$1',[appointment])).rowCount,0);
      } finally {
        await canceller.query('ROLLBACK');
        canceller.release(); writer.release();
      }
    });
  } finally {
    if(server) await new Promise(resolve=>server.close(resolve));
    await db.close();
  }
});
