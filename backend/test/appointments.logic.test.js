import test from 'node:test';
import assert from 'node:assert/strict';

import { __testables } from '../src/modules/appointments/appointments.service.js';
import {
  validateCreateAppointmentPayload,
  validateReorderWaitlistEntriesPayload,
  validateUpdateAppointmentPayload,
} from '../src/modules/appointments/appointments.validators.js';

test('normalizeRecurrencePayload builds weekly recurring dates', () => {
  const recurrence = __testables.normalizeRecurrencePayload(
    { endDate: '2026-05-06' },
    '2026-04-15',
    'pending',
  );

  assert.deepEqual(recurrence, {
    endDate: '2026-05-06',
    dates: ['2026-04-22', '2026-04-29', '2026-05-06'],
  });
});

test('normalizeRecurrencePayload rejects recurrence when end date is not after the initial appointment', () => {
  assert.throws(
    () => __testables.normalizeRecurrencePayload({ endDate: '2026-04-15' }, '2026-04-15', 'pending'),
    {
      message: 'La fecha fin de recurrencia debe ser posterior a la cita inicial.',
    },
  );
});

test('normalizeRecurrencePayload rejects recurrence on a different weekday', () => {
  assert.throws(
    () => __testables.normalizeRecurrencePayload({ endDate: '2026-04-23' }, '2026-04-15', 'pending'),
    {
      message: 'La fecha fin de recurrencia debe caer en el mismo dia de la semana que la cita inicial.',
    },
  );
});

test('normalizeRecurrencePayload rejects recurrence for non-pending appointments', () => {
  assert.throws(
    () => __testables.normalizeRecurrencePayload({ endDate: '2026-04-22' }, '2026-04-15', 'completed'),
    {
      message: 'Las citas recurrentes solo pueden generarse con estado pendiente.',
    },
  );
});

test('ensureAppointmentCompletionIsAllowed rejects future appointments', () => {
  const tomorrow = __testables.addDaysToDateString(__testables.getTodayDateString(), 1);

  assert.throws(
    () => __testables.ensureAppointmentCompletionIsAllowed({ scheduledDate: tomorrow, status: 'completed' }),
    {
      message: 'No puedes marcar como completada una cita futura.',
    },
  );
});

test('ensureAppointmentCompletionIsAllowed allows pending future appointments and completed past appointments', () => {
  const yesterday = __testables.addDaysToDateString(__testables.getTodayDateString(), -1);
  const tomorrow = __testables.addDaysToDateString(__testables.getTodayDateString(), 1);

  assert.doesNotThrow(() =>
    __testables.ensureAppointmentCompletionIsAllowed({ scheduledDate: tomorrow, status: 'pending' }),
  );
  assert.doesNotThrow(() =>
    __testables.ensureAppointmentCompletionIsAllowed({ scheduledDate: yesterday, status: 'completed' }),
  );
});

test('validateCreateAppointmentPayload enforces hour-aligned time slots', () => {
  const errors = validateCreateAppointmentPayload({
    patientId: '1',
    scheduledDate: '2026-04-15',
    scheduledTime: '10:30',
  });

  assert.deepEqual(errors, ['scheduledTime must be in HH:00 or HH:00:00 format']);
});

test('validateUpdateAppointmentPayload accepts standard update fields and optional recurrence object', () => {
  const errors = validateUpdateAppointmentPayload({
    scheduledTime: '10:30',
    notes: 'Reagendar si cancela otro paciente.',
    recurrence: { endDate: '2026-05-13' },
  });

  assert.deepEqual(errors, []);
});

test('validateReorderWaitlistEntriesPayload requires a non-empty list of ids', () => {
  const errors = validateReorderWaitlistEntriesPayload({
    scheduledDate: '2026-04-15',
    scheduledTime: '10:00',
    entryIds: [],
  });

  assert.deepEqual(errors, ['entryIds must be a non-empty array']);
});
