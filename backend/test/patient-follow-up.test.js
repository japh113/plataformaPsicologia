import test from 'node:test';
import assert from 'node:assert/strict';
import db from '../src/config/db.js';
import { buildPatientFollowUp, getPatientFollowUp } from '../src/modules/patients/patients.follow-up.js';

test('minimal DTO: descending date/time/ID, separate same-day visits, stable task order, no private extras', () => {
  const result = buildPatientFollowUp({
    consultations: [
      { id: 1, scheduledDate: '2026-04-01', scheduledTime: '09:00:00', notes: 'PRIVATE' },
      { id: 2, scheduledDate: '2026-04-08', scheduledTime: '09:00:00', content: 'PRIVATE' },
      { id: 3, scheduledDate: '2026-04-05', scheduledTime: '10:00:00' },
      { id: 10, scheduledDate: '2026-04-08', scheduledTime: '15:00:00' },
    ],
    tasks: [
      { id: 5, appointmentId: 1, text: 'first', completed: true, clinicalNoteObjective: 'PRIVATE' },
      { id: 6, appointmentId: 1, text: 'second', completed: false },
      { id: 7, appointmentId: 999, text: 'unverified', completed: false },
      { id: 8, appointmentId: null, text: 'legacy', completed: true },
    ],
  });
  assert.deepEqual(result, { consultations: [
    { id: '10', scheduledDate: '2026-04-08', scheduledTime: '15:00:00', status: 'completed', tasks: [] },
    { id: '2', scheduledDate: '2026-04-08', scheduledTime: '09:00:00', status: 'completed', tasks: [] },
    { id: '3', scheduledDate: '2026-04-05', scheduledTime: '10:00:00', status: 'completed', tasks: [] },
    { id: '1', scheduledDate: '2026-04-01', scheduledTime: '09:00:00', status: 'completed',
      tasks: [{ id: '5', text: 'first', completed: true }, { id: '6', text: 'second', completed: false }] },
  ], unassignedTasks: [{ id: '7', text: 'unverified', completed: false }, { id: '8', text: 'legacy', completed: true }] });
  assert.deepEqual(buildPatientFollowUp({}), { consultations: [], unassignedTasks: [] });
});

test('reader applies legacy scope, verified ownership joins, civil DATE text and task filters; denies non-clinical actors before DB', async () => {
  const original = db.query;
  const calls = [];
  db.query = async (sql, params) => { calls.push({ sql, params }); return { rows: [] }; };
  try {
    for (const role of ['admin','superadmin','support','unknown']) {
      await assert.rejects(getPatientFollowUp('p', { id: role, role }), { status: 403 });
    }
    await assert.rejects(getPatientFollowUp('p'), { status: 401 });
    assert.equal(calls.length, 0);
    assert.equal(await getPatientFollowUp('p', { role: 'patient', patientId: 'p' }), null);
    assert.deepEqual(calls[0].params, ['p','p']);
    const sql = calls[0].sql;
    for (const fragment of ['n.patient_id = pt.patient_id', 'a.patient_id = pt.patient_id',
      "a.status = 'completed'", "pt.kind = 'task'", 'pt.retired_at IS NULL',
      'a.scheduled_date::text', 'pt.created_at ASC, pt.id ASC']) assert.ok(sql.includes(fragment));
    assert.equal(await getPatientFollowUp('p', { id: 'a', role: 'psychologist' }), null);
    assert.match(calls[1].sql, /care_relationships/);
    assert.match(calls[1].sql, /psychologist_patient_access/);
    assert.deepEqual(calls[1].params, ['p','a']);
  } finally { db.query = original; }
});
