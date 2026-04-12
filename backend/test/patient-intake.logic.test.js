import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPatientInterviewEntity } from '../src/modules/patients/patients.model.js';
import { validatePatientInterviewPayload } from '../src/modules/patients/patients.intake.validators.js';
import { __testables as patientTestables } from '../src/modules/patients/patients.service.js';

test('ensurePatientInterviewWriteIsAllowed blocks patients from editing a completed interview', () => {
  assert.throws(
    () => patientTestables.ensurePatientInterviewWriteIsAllowed({
      actor: { role: 'patient', id: 'user-1' },
      currentInterview: { completedAt: '2026-04-10T18:00:00.000Z' },
    }),
    {
      message: 'La entrevista ya fue completada y no puede ser editada por el paciente.',
    },
  );
});

test('ensurePatientInterviewWriteIsAllowed allows patients to complete interview for the first time', () => {
  assert.doesNotThrow(() =>
    patientTestables.ensurePatientInterviewWriteIsAllowed({
      actor: { role: 'patient', id: 'user-1' },
      currentInterview: null,
    }),
  );
});

test('ensurePatientInterviewWriteIsAllowed allows psychologists to edit completed interviews', () => {
  assert.doesNotThrow(() =>
    patientTestables.ensurePatientInterviewWriteIsAllowed({
      actor: { role: 'psychologist', id: 'therapist-1' },
      currentInterview: { completedAt: '2026-04-10T18:00:00.000Z' },
    }),
  );
});

test('buildPatientInterviewEntity trims text fields and normalizes booleans', () => {
  const interview = buildPatientInterviewEntity({
    birthDate: '1995-06-15T12:30:00.000Z',
    birthPlace: ' Monterrey ',
    occupation: ' Disenadora ',
    hobbies: ' Leer y nadar ',
    maritalStatus: ' Soltera ',
    familyMembers: ' Mama y hermana ',
    livesWith: ' Con su hermana ',
    physicalIllnesses: ' Ninguna ',
    insomnia: 1,
    nightmares: 0,
    fearsOrPhobias: 'yes',
  });

  assert.deepEqual(interview, {
    birthDate: '1995-06-15',
    birthPlace: 'Monterrey',
    occupation: 'Disenadora',
    hobbies: 'Leer y nadar',
    maritalStatus: 'Soltera',
    familyMembers: 'Mama y hermana',
    livesWith: 'Con su hermana',
    physicalIllnesses: 'Ninguna',
    insomnia: true,
    nightmares: false,
    fearsOrPhobias: true,
    accidents: false,
    alcoholUse: false,
    tobaccoUse: false,
    drugUse: false,
    psychologicalAbuse: false,
    physicalAbuse: false,
    deathWish: false,
    suicideAttempts: false,
  });
});

test('mapInterviewRow returns null when no interview exists', () => {
  assert.equal(patientTestables.mapInterviewRow(null), null);
});

test('mapInterviewRow returns normalized interview data for the frontend contract', () => {
  const interview = patientTestables.mapInterviewRow({
    birthDate: '1995-06-15T00:00:00.000Z',
    birthPlace: 'Monterrey',
    occupation: 'Disenadora',
    hobbies: 'Leer',
    maritalStatus: 'Soltera',
    familyMembers: 'Mama y hermana',
    livesWith: 'Hermana',
    physicalIllnesses: 'Ninguna',
    insomnia: 1,
    nightmares: 0,
    fearsOrPhobias: 1,
    accidents: 0,
    alcoholUse: false,
    tobaccoUse: true,
    drugUse: false,
    psychologicalAbuse: false,
    physicalAbuse: true,
    deathWish: false,
    suicideAttempts: false,
    completedAt: '2026-04-10T18:00:00.000Z',
    createdAt: '2026-04-10T18:00:00.000Z',
    updatedAt: '2026-04-10T18:15:00.000Z',
  });

  assert.deepEqual(interview, {
    birthDate: '1995-06-15',
    birthPlace: 'Monterrey',
    occupation: 'Disenadora',
    hobbies: 'Leer',
    maritalStatus: 'Soltera',
    familyMembers: 'Mama y hermana',
    livesWith: 'Hermana',
    physicalIllnesses: 'Ninguna',
    insomnia: true,
    nightmares: false,
    fearsOrPhobias: true,
    accidents: false,
    alcoholUse: false,
    tobaccoUse: true,
    drugUse: false,
    psychologicalAbuse: false,
    physicalAbuse: true,
    deathWish: false,
    suicideAttempts: false,
    completedAt: '2026-04-10T18:00:00.000Z',
    createdAt: '2026-04-10T18:00:00.000Z',
    updatedAt: '2026-04-10T18:15:00.000Z',
  });
});

test('validatePatientInterviewPayload requires the core intake fields', () => {
  const errors = validatePatientInterviewPayload({
    birthDate: '',
    birthPlace: '',
    occupation: '',
    maritalStatus: '',
    familyMembers: '',
    livesWith: '',
  });

  assert.deepEqual(errors, [
    'birthDate must be a valid YYYY-MM-DD date',
    'birthPlace is required',
    'occupation is required',
    'maritalStatus is required',
    'familyMembers is required',
    'livesWith is required',
  ]);
});

test('validatePatientInterviewPayload validates boolean fields', () => {
  const errors = validatePatientInterviewPayload({
    birthDate: '1995-06-15',
    birthPlace: 'Monterrey',
    occupation: 'Disenadora',
    maritalStatus: 'Soltera',
    familyMembers: 'Mama y hermana',
    livesWith: 'Hermana',
    insomnia: 'si',
    nightmares: 1,
  });

  assert.deepEqual(errors, [
    'insomnia must be a boolean',
    'nightmares must be a boolean',
  ]);
});

test('validatePatientInterviewPayload accepts a complete valid payload', () => {
  const errors = validatePatientInterviewPayload({
    birthDate: '1995-06-15',
    birthPlace: 'Monterrey',
    occupation: 'Disenadora',
    hobbies: 'Leer',
    maritalStatus: 'Soltera',
    familyMembers: 'Mama y hermana',
    livesWith: 'Hermana',
    physicalIllnesses: 'Ninguna',
    insomnia: false,
    nightmares: false,
    fearsOrPhobias: true,
    accidents: false,
    alcoholUse: false,
    tobaccoUse: false,
    drugUse: false,
    psychologicalAbuse: false,
    physicalAbuse: false,
    deathWish: false,
    suicideAttempts: false,
  });

  assert.deepEqual(errors, []);
});
