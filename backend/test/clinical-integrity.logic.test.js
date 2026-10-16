import test from 'node:test';
import assert from 'node:assert/strict';
import db from '../src/config/db.js';
import { clinicalDeletionError } from '../src/utils/clinicalIntegrity.js';
import { deleteAppointment, deleteFutureRecurringAppointments, __testables } from '../src/modules/appointments/appointments.service.js';
import { deletePatient, deletePatientClinicalNote, deletePatientTask, updatePatientTask } from '../src/modules/patients/patients.service.js';

test('preservation errors have a stable conflict contract', () => {
  assert.equal(clinicalDeletionError('preserved').status, 409);
  assert.equal(clinicalDeletionError('preserved').code, 'CLINICAL_RECORD_PRESERVED');
});

test('destructive clinical service entrypoints reject non-psychologists before querying', async () => {
  for (const role of ['patient', 'admin', 'support', 'superadmin']) {
    const actor = { id: 'u', role, patientId: 'p' };
    for (const operation of [
      () => deleteAppointment('1', actor), () => deleteFutureRecurringAppointments('1', actor),
      () => deletePatient('p', actor), () => deletePatientClinicalNote('p', '1', actor),
      () => deletePatientTask('p', '1', actor),
    ]) await assert.rejects(operation, { status: 403 });
  }
});

test('a patient cannot rewrite clinical task text', async () => {
  await assert.rejects(() => updatePatientTask('p', '1', { text: 'replacement' }, { role: 'patient', patientId: 'p' }), { status: 403 });
});

test('linked appointments reject patient reassignment as well as cancellation', () => {
  for (const status of ['pending', 'cancelled', 'no_show']) {
    assert.throws(() => __testables.ensureLinkedClinicalNoteUpdateIsAllowed({
      currentAppointment: { patientId: 'p', scheduledDate: '2026-01-01', scheduledTime: '10:00', hasLinkedClinicalNote: true },
      nextPatientId: 'p', nextScheduledDate: '2026-01-01', nextScheduledTime: '10:00:00', nextStatus: status,
    }), { status: 409 });
  }
  assert.throws(() => __testables.ensureLinkedClinicalNoteUpdateIsAllowed({
    currentAppointment: { patientId: 'p', scheduledDate: '2026-01-01', scheduledTime: '10:00', hasLinkedClinicalNote: true },
    nextPatientId: 'another', nextScheduledDate: '2026-01-01', nextScheduledTime: '10:00:00', nextStatus: 'completed',
  }), { status: 409 });
});

test('rescheduling a recurrence preserves gaps left by cancelled occurrences', () => {
  const targets = __testables.buildRecurringAppointmentFutureTargets({
    recurringAppointments: [
      { id: '1', patientId: 'p', scheduledDate: '2026-04-01', scheduledTime: '10:00', status: 'pending' },
      { id: '3', patientId: 'p', scheduledDate: '2026-04-15', scheduledTime: '10:00', status: 'pending' },
    ], payload: { scheduledDate: '2026-04-02' },
  });
  assert.deepEqual(targets.map(target=>target.nextScheduledDate), ['2026-04-02','2026-04-16']);
});

test('legacy deletes preserve accessible records and hide inaccessible ids', async () => {
  const original = db.query;
  const queries = [];
  db.query = async (sql) => {
    queries.push(sql);
    return { rowCount: 1, rows: [{ id: 1, patient_id: 'p', tasks: [], objectives: [] }] };
  };
  const actor = { id: 'psy', role: 'psychologist' };
  try {
    for (const operation of [
      () => deleteAppointment('1', actor), () => deleteFutureRecurringAppointments('1', actor),
      () => deletePatient('p', actor), () => deletePatientClinicalNote('p', '1', actor),
    ]) await assert.rejects(operation, { status: 409, code: 'CLINICAL_RECORD_PRESERVED' });
    assert.ok(queries.every(sql => !/\b(DELETE|UPDATE)\b/i.test(sql)));
    db.query = async () => ({ rowCount: 0, rows: [] });
    assert.equal(await deleteAppointment('missing', actor), false);
    assert.equal(await deletePatient('missing', actor), false);
  } finally { db.query = original; }
});
