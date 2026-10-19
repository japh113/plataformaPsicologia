import test from 'node:test';
import assert from 'node:assert/strict';
import db from '../src/config/db.js';
import { adultBirthDateError, normalizePhone, registrationErrors } from '../src/modules/auth/identity.validation.js';
import { requestCareRelationship, inviteCareRelationship, respondToCareRelationship, acceptCareRelationshipInvite } from '../src/modules/auth/auth.service.js';
import { createPatient } from '../src/modules/patients/patients.service.js';
import { getOwnIdentity, updateOwnIdentity, requestVerification, confirmVerification } from '../src/modules/auth/identity.service.js';

test('adult DOB uses real Gregorian dates and exact UTC civil birthday, including leap days', () => {
  const now = new Date('2026-10-18T23:59:59Z');
  for (const dob of ['2008-10-18', '2008-10-17', '2000-02-29']) assert.equal(adultBirthDateError(dob, now), null);
  for (const dob of ['2008-10-19', '2009-01-01', '2027-01-01', '2026-02-29', '2000-04-31',
    '2000-13-01', '0000-01-01', '01/01/1990', '', null, 1990, '1990-01-01T00:00:00Z']) assert.ok(adultBirthDateError(dob, now), String(dob));
  assert.ok(adultBirthDateError('2008-02-29', new Date('2026-02-28T23:59:59Z')));
  assert.equal(adultBirthDateError('2008-02-29', new Date('2026-03-01T00:00:00Z')), null);
  assert.ok(adultBirthDateError('2008-10-18', new Date('2026-10-17T23:59:59Z')));
});
test('registration allowlist rejects clinical/identity injection and phone needs explicit international prefix', () => {
  const payload = { firstName: 'Demo', lastName: '', email: 'demo@test.invalid', password: 'Password123!',
    birthDate: '1990-01-01', phone: '+52 (55) 1234-5678' };
  assert.deepEqual(registrationErrors(payload), []);
  assert.equal(normalizePhone(payload.phone), '+525512345678');
  for (const phone of ['5512345678', '+012345678', 'abc', null, '+1234567890123456']) assert.equal(normalizePhone(phone), null);
  for (const field of ['age', 'role', 'patientId', 'status', 'riskLevel', 'reasonForConsultation', 'emailVerifiedAt', 'episodeId']) {
    assert.ok(registrationErrors({ ...payload, [field]: 'injected' }).length, field);
  }
});
test('every legacy service denies new and old accounts before any client/query, without synchronization', async () => {
  const oldQuery = db.query, oldGet = db.getClient;
  let writes = 0;
  db.query = db.getClient = () => { writes++; throw new Error('Unexpected database access'); };
  try {
    for (const id of ['new', 'historical']) for (const role of ['patient','psychologist','admin','support','superadmin']) {
      const actor = { id, role, patientId: id, emailVerifiedAt: new Date(), phoneVerifiedAt: new Date() };
      for (const fn of [requestCareRelationship,inviteCareRelationship,respondToCareRelationship,acceptCareRelationshipInvite]) {
        await assert.rejects(fn({ actor, status: 'active', inviteCode: 'OLD', psychologistUserId: 'other' }), { status: 403 });
      }
      await assert.rejects(createPatient({ firstName: 'Minor', age: 12 }, actor), { status: 403 });
    }
    for (const role of ['psychologist','admin','support','superadmin']) {
      const actor = { role, id: 'other', patientId: 'other' };
      for (const fn of [() => getOwnIdentity(actor), () => updateOwnIdentity(actor, { firstName: 'X' }),
        () => requestVerification(actor, 'email'), () => confirmVerification(actor, 'sms', { secret: '123456' })])
        await assert.rejects(fn(), { status: 403 });
    }
    assert.equal(writes, 0);
  } finally { db.query = oldQuery; db.getClient = oldGet; }
});
