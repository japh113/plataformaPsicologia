import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import db from '../src/config/db.js';
import { adultBirthDateError, normalizePhone, registrationErrors } from '../src/modules/auth/identity.validation.js';
import { listAvailablePsychologists, requestCareRelationship, inviteCareRelationship, respondToCareRelationship, acceptCareRelationshipInvite } from '../src/modules/auth/auth.service.js';
import { createPatient } from '../src/modules/patients/patients.service.js';
import { getOwnIdentity, updateOwnIdentity, requestVerification, confirmVerification } from '../src/modules/auth/identity.service.js';

test('adult DOB uses real Gregorian dates and the approved Mexico City civil birthday', () => {
  const now = new Date('2026-10-18T23:59:59Z');
  for (const dob of ['2008-10-18', '2008-10-17', '2000-02-29']) assert.equal(adultBirthDateError(dob, now), null);
  for (const dob of ['2008-10-19', '2009-01-01', '2027-01-01', '2026-02-29', '2000-04-31',
    '2000-13-01', '0000-01-01', '01/01/1990', '', null, 1990, '1990-01-01T00:00:00Z']) assert.ok(adultBirthDateError(dob, now), String(dob));
  assert.ok(adultBirthDateError('2008-02-29', new Date('2026-03-01T05:59:59.999Z')));
  assert.equal(adultBirthDateError('2008-02-29', new Date('2026-03-01T06:00:00.000Z')), null);
  assert.ok(adultBirthDateError('2008-10-18', new Date('2026-10-17T23:59:59Z')));
});
test('age and future-date validation change at Mexico City midnight, not UTC midnight', () => {
  for (const instant of ['2026-10-17T23:59:59.999Z','2026-10-18T00:00:00.000Z','2026-10-18T05:59:59.999Z']) {
    assert.match(adultBirthDateError('2008-10-18',new Date(instant)), /18 or older/,instant);
  }
  for (const instant of ['2026-10-18T06:00:00.000Z','2026-10-18T06:00:00.001Z']) {
    assert.equal(adultBirthDateError('2008-10-18',new Date(instant)),null,instant);
  }
  assert.match(adultBirthDateError('2026-10-18',new Date('2026-10-18T05:59:59.999Z')), /future/);
  assert.match(adultBirthDateError('2026-10-18',new Date('2026-10-18T06:00:00.000Z')), /18 or older/);
  assert.match(adultBirthDateError('2009-01-01',new Date('2027-01-01T05:59:59.999Z')), /18 or older/);
  assert.equal(adultBirthDateError('2009-01-01',new Date('2027-01-01T06:00:00.000Z')),null);
  // This named zone has historical DST rules; it is not a hard-coded UTC-6 offset.
  assert.match(adultBirthDateError('2003-10-18',new Date('2021-10-18T04:59:59.999Z')), /18 or older/);
  assert.equal(adultBirthDateError('2003-10-18',new Date('2021-10-18T05:00:00.000Z')),null);
  const payload = { firstName:'Adult',email:'boundary@identity.invalid',password:'Password123!',phone:'+525512345678',birthDate:'2008-10-18' };
  assert.ok(registrationErrors(payload,new Date('2026-10-18T05:59:59.999Z')).some(error => error.includes('18 or older')));
  assert.deepEqual(registrationErrors(payload,new Date('2026-10-18T06:00:00.000Z')),[]);
});
test('February 29 eligibility waits for March 1 locally and leap-year birthdays remain exact', () => {
  for (const instant of ['2026-02-28T18:00:00Z','2026-03-01T00:00:00Z','2026-03-01T05:59:59.999Z']) {
    assert.match(adultBirthDateError('2008-02-29',new Date(instant)), /18 or older/,instant);
  }
  assert.equal(adultBirthDateError('2008-02-29',new Date('2026-03-01T06:00:00Z')),null);
  assert.equal(adultBirthDateError('2000-02-29',new Date('2024-02-29T06:00:00Z')),null);
  assert.match(adultBirthDateError('2008-02-29',new Date('2024-02-29T06:00:00Z')), /18 or older/);
  assert.equal(adultBirthDateError('2006-02-28',new Date('2024-02-28T06:00:00Z')),null);
  assert.match(adultBirthDateError('2006-03-01',new Date('2024-03-01T05:59:59.999Z')), /18 or older/);
  assert.equal(adultBirthDateError('2006-03-01',new Date('2024-03-01T06:00:00Z')),null);
  for (const value of ['1900-02-29','2100-02-29']) assert.match(adultBirthDateError(value,new Date('2026-10-18T18:00:00Z')), /real date/);
});
test('registration reference is independent of the backend host timezone', () => {
  const source = "import {adultBirthDateError} from './src/modules/auth/identity.validation.js'; console.log(JSON.stringify(['2026-10-18T05:59:59.999Z','2026-10-18T06:00:00Z'].map(now => adultBirthDateError('2008-10-18',new Date(now)))));";
  for (const timezone of ['UTC','America/Tijuana','Asia/Tokyo']) {
    const child = spawnSync(process.execPath,['--input-type=module','-e',source],{
      cwd: new URL('..',import.meta.url),encoding:'utf8',env:{ ...process.env,TZ:timezone },
    });
    assert.equal(child.status,0,child.stderr);
    const values = JSON.parse(child.stdout);
    assert.match(values[0],/18 or older/,timezone);
    assert.equal(values[1],null,timezone);
  }
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
    await assert.rejects(listAvailablePsychologists(), { status: 403 });
    assert.equal(writes, 0);
  } finally { db.query = oldQuery; db.getClient = oldGet; }
});
