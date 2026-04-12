import test from 'node:test';
import assert from 'node:assert/strict';

import { __testables as patientTestables } from '../src/modules/patients/patients.service.js';
import {
  validateCreateClinicalNotePayload,
  validateUpdateClinicalNotePayload,
} from '../src/modules/patients/patients.clinical-notes.validators.js';

test('ensureAppointmentEligibleForClinicalNote rejects appointments that are not completed', () => {
  assert.throws(
    () => patientTestables.ensureAppointmentEligibleForClinicalNote({
      status: 'pending',
      scheduled_date: '2026-04-10',
    }),
    {
      message: 'Solo puedes registrar una nota clinica desde una cita completada.',
    },
  );
});

test('ensureAppointmentEligibleForClinicalNote rejects future completed appointments', () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const futureDate = tomorrow.toISOString().slice(0, 10);

  assert.throws(
    () => patientTestables.ensureAppointmentEligibleForClinicalNote({
      status: 'completed',
      scheduled_date: futureDate,
    }),
    {
      message: 'No puedes registrar una nota clinica para una cita futura.',
    },
  );
});

test('ensureAppointmentEligibleForClinicalNote allows completed appointments from today or earlier', () => {
  assert.doesNotThrow(() =>
    patientTestables.ensureAppointmentEligibleForClinicalNote({
      status: 'completed',
      scheduled_date: patientTestables.getTodayDateString(),
    }),
  );
});

test('normalizeClinicalNoteTaskPayloads normalizes ids and defaults completed to false', () => {
  const tasks = patientTestables.normalizeClinicalNoteTaskPayloads([
    { id: '18', text: ' Respiracion diaria ', completed: true },
    { text: ' Registrar emociones ' },
  ]);

  assert.deepEqual(tasks, [
    { id: 18, text: 'Respiracion diaria', completed: true },
    { id: null, text: 'Registrar emociones', completed: false },
  ]);
});

test('mapTaskRow preserves clinical note links for patient tasks', () => {
  const task = patientTestables.mapTaskRow({
    id: 7,
    text: 'Practicar grounding',
    completed: false,
    clinicalNoteId: 10,
    clinicalNoteDate: '2026-04-08',
    clinicalNoteObjective: 'Reducir ansiedad',
  });

  assert.deepEqual(task, {
    id: '7',
    text: 'Practicar grounding',
    completed: false,
    clinicalNoteId: '10',
    clinicalNoteDate: '2026-04-08',
    clinicalNoteObjective: 'Reducir ansiedad',
  });
});

test('mapClinicalNoteRow maps the public clinical note shape', () => {
  const note = patientTestables.mapClinicalNoteRow({
    id: 5,
    appointmentId: 12,
    clinicalNoteDate: '2026-04-08',
    noteFormat: 'soap',
    clinicalNoteObjective: 'Regular sueno',
    clinicalObservations: 'Paciente con menos despertares.',
    nextSteps: 'Sostener higiene del sueno.',
    content: 'Nota detallada',
    createdAt: '2026-04-08T18:00:00.000Z',
    updatedAt: '2026-04-08T18:20:00.000Z',
  });

  assert.deepEqual(note, {
    id: '5',
    appointmentId: '12',
    clinicalNoteDate: '2026-04-08',
    noteFormat: 'soap',
    clinicalNoteObjective: 'Regular sueno',
    clinicalObservations: 'Paciente con menos despertares.',
    nextSteps: 'Sostener higiene del sueno.',
    content: 'Nota detallada',
    createdAt: '2026-04-08T18:00:00.000Z',
    updatedAt: '2026-04-08T18:20:00.000Z',
  });
});

test('validateCreateClinicalNotePayload requires appointment, format, content, and valid tasks', () => {
  const errors = validateCreateClinicalNotePayload({
    appointmentId: '',
    noteFormat: 'otro',
    content: ' ',
    tasks: [{ text: '' }],
  });

  assert.deepEqual(errors, [
    'appointmentId is required',
    'noteFormat must be one of: simple, soap',
    'content is required',
    'tasks[0].text is required',
  ]);
});

test('validateCreateClinicalNotePayload accepts structured fields and task payloads', () => {
  const errors = validateCreateClinicalNotePayload({
    appointmentId: '9',
    noteFormat: 'simple',
    content: 'Seguimiento semanal.',
    clinicalNoteObjective: 'Bajar activacion',
    clinicalObservations: 'Mas regulado',
    nextSteps: 'Mantener practica',
    tasks: [{ text: 'Respirar', completed: true }],
  });

  assert.deepEqual(errors, []);
});

test('validateUpdateClinicalNotePayload requires at least one field', () => {
  const errors = validateUpdateClinicalNotePayload({});

  assert.deepEqual(errors, ['At least one field must be provided']);
});

test('validateUpdateClinicalNotePayload validates appointmentId and task id shape', () => {
  const errors = validateUpdateClinicalNotePayload({
    appointmentId: '',
    tasks: [{ id: '', text: 'Respirar' }],
  });

  assert.deepEqual(errors, [
    'tasks[0].id must be a valid value when provided',
    'appointmentId must be a valid value when provided',
  ]);
});
