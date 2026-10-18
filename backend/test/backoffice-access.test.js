import test from 'node:test';
import assert from 'node:assert/strict';
import db from '../src/config/db.js';
import * as patients from '../src/modules/patients/patients.service.js';
import * as appointments from '../src/modules/appointments/appointments.service.js';
import * as availability from '../src/modules/availability/availability.service.js';
import { listMyReminders } from '../src/modules/reminders/reminders.service.js';
import { listAuditLogs, listBackofficeUsers, listPendingPsychologistUsers,
  createCareRelationship, updateCareRelationship, reviewPsychologistUser,
  respondToCareRelationship, requestCareRelationship, inviteCareRelationship, acceptCareRelationshipInvite } from '../src/modules/auth/auth.service.js';
import { projectOperationalAuditMetadata } from '../src/utils/audit-projections.js';

test('clinical services deny administrative roles before any query or transaction', async () => {
  const originalQuery = db.query;
  const originalGetClient = db.getClient;
  let queries = 0;
  const failQuery = () => { queries += 1; throw new Error('Unexpected database access'); };
  db.query = failQuery;
  db.getClient = failQuery;
  try {
    for (const role of ['superadmin', 'admin', 'support']) {
      const actor = { role, id: 'inherited-psychologist', patientId: 'inherited-patient' };
      const calls = [
        () => patients.getAllPatients(actor),
        () => patients.getPatientById('1', actor),
        () => patients.createPatient({}, actor),
        () => patients.updatePatient('1', {}, actor),
        () => patients.deletePatient('1', actor),
        () => patients.upsertPatientInterview('1', {}, actor),
        ...['Task', 'Objective', 'ClinicalNote'].flatMap(kind => [
          () => patients['createPatient' + kind]('1', {}, actor),
          () => patients['updatePatient' + kind]('1', '1', {}, actor),
          () => patients['deletePatient' + kind]('1', '1', actor),
        ]),
        () => appointments.listAppointments({ actor }),
        () => appointments.getAppointmentById('1', actor),
        () => appointments.createAppointment({}, actor),
        () => appointments.updateAppointment('1', {}, actor),
        () => appointments.deleteAppointment('1', actor),
        () => appointments.deleteFutureRecurringAppointments('1', actor),
        () => appointments.listWaitlistEntries({ actor }),
        () => appointments.createWaitlistEntry({}, actor),
        () => appointments.reorderWaitlistEntries({}, actor),
        () => appointments.deleteWaitlistEntry('1', actor),
        () => availability.listMyAvailability(actor),
        () => availability.updateMyAvailability([], actor),
        () => availability.listMyAvailabilityExceptions(actor),
        () => availability.upsertMyAvailabilityException('2026-01-01', {}, actor),
        () => availability.deleteMyAvailabilityException('2026-01-01', actor),
        () => availability.createMyUnavailableAvailabilityRange({}, actor),
        () => availability.updateMyUnavailableAvailabilityRange({}, actor),
        () => availability.deleteMyUnavailableAvailabilityRange({}, actor),
        () => listMyReminders(actor),
        () => respondToCareRelationship({ actor }),
        () => requestCareRelationship({ actor }),
        () => inviteCareRelationship({ actor }),
        () => acceptCareRelationshipInvite({ actor }),
      ];
      for (const call of calls) await assert.rejects(call, { status: 403 }, role);
    }
    assert.equal(queries, 0);
  } finally {
    db.query = originalQuery;
    db.getClient = originalGetClient;
  }
});

test('operational services enforce their own viewer and manager permissions', async () => {
  for (const actor of [undefined, { role: 'patient' }, { role: 'psychologist' }]) {
    for (const call of [
      () => listAuditLogs({ actor }), () => listBackofficeUsers(actor),
      () => listPendingPsychologistUsers(actor), () => createCareRelationship({ actor }),
      () => updateCareRelationship({ actor }),
    ]) await assert.rejects(call, { status: actor ? 403 : 401 });
  }
  const actor = { role: 'support', id: 'support' };
  await assert.rejects(createCareRelationship({ actor }), { status: 403 });
  await assert.rejects(updateCareRelationship({ actor }), { status: 403 });
  await assert.rejects(reviewPsychologistUser({ reviewerUserId: actor.id, reviewerRole: actor.role }), { status: 403 });
  for (const role of ['admin', 'superadmin']) {
    await assert.rejects(createCareRelationship({ actor: { role }, notes: 'sensitive' }), { status: 403 });
    await assert.rejects(updateCareRelationship({ actor: { role }, notes: 'sensitive' }), { status: 403 });
  }
});

test('audit metadata projection permits only enumerated operational values', () => {
  const secrets = { inviteCode: 'secret', token: 'secret', password: 'secret', riskLevel: 'high',
    notes: 'clinical', nested: { content: 'clinical' } };
  assert.deepEqual(projectOperationalAuditMetadata('psychologist_reviewed',
    { ...secrets, approvalStatus: 'active' }), { approvalStatus: 'active' });
  for (const approvalStatus of [secrets, ['active'], null, 'clinical-secret']) {
    assert.deepEqual(projectOperationalAuditMetadata('psychologist_reviewed', { approvalStatus }), {});
  }
  for (const action of ['patient_updated', 'clinical_note_created', 'password_reset_requested', 'unknown']) {
    assert.deepEqual(projectOperationalAuditMetadata(action, secrets), {});
  }
});
