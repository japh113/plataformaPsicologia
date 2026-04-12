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

test('mapAppointmentRow forces completed status when a linked clinical note exists', () => {
  const appointment = __testables.mapAppointmentRow({
    id: 12,
    patient_id: 4,
    scheduled_date: '2026-04-15',
    scheduled_time: '10:00:00',
    recurrence_group_id: 'series-1',
    status: 'pending',
    notes: '',
    has_linked_clinical_note: true,
    waitlist_count: 2,
  });

  assert.deepEqual(appointment, {
    id: '12',
    patientId: '4',
    scheduledDate: '2026-04-15',
    scheduledTime: '10:00:00',
    recurrenceGroupId: 'series-1',
    status: 'completed',
    notes: '',
    hasLinkedClinicalNote: true,
    waitlistCount: 2,
  });
});

test('ensureLinkedClinicalNoteUpdateIsAllowed rejects downgrading a linked appointment status', () => {
  assert.throws(
    () => __testables.ensureLinkedClinicalNoteUpdateIsAllowed({
      currentAppointment: {
        patientId: '5',
        scheduledDate: '2026-04-15',
        scheduledTime: '10:00:00',
        hasLinkedClinicalNote: true,
      },
      nextPatientId: '5',
      nextScheduledDate: '2026-04-15',
      nextScheduledTime: '10:00:00',
      nextStatus: 'cancelled',
    }),
    {
      message: 'No puedes marcar como pendiente o cancelada una cita que ya tiene una nota clinica registrada.',
    },
  );
});

test('ensureLinkedClinicalNoteUpdateIsAllowed rejects rescheduling a linked appointment', () => {
  assert.throws(
    () => __testables.ensureLinkedClinicalNoteUpdateIsAllowed({
      currentAppointment: {
        patientId: '5',
        scheduledDate: '2026-04-15',
        scheduledTime: '10:00:00',
        hasLinkedClinicalNote: true,
      },
      nextPatientId: '5',
      nextScheduledDate: '2026-04-22',
      nextScheduledTime: '10:00:00',
      nextStatus: 'completed',
    }),
    {
      message: 'No puedes reprogramar una cita que ya tiene una nota clinica registrada.',
    },
  );
});

test('ensureLinkedClinicalNoteUpdateIsAllowed allows keeping a linked appointment intact', () => {
  assert.doesNotThrow(() =>
    __testables.ensureLinkedClinicalNoteUpdateIsAllowed({
      currentAppointment: {
        patientId: '5',
        scheduledDate: '2026-04-15',
        scheduledTime: '10:00:00',
        hasLinkedClinicalNote: true,
      },
      nextPatientId: '5',
      nextScheduledDate: '2026-04-15',
      nextScheduledTime: '10:00:00',
      nextStatus: 'completed',
    }),
  );
});

test('shouldValidateScheduleAvailability is false for status-only updates on active appointments', () => {
  const result = __testables.shouldValidateScheduleAvailability({
    currentAppointment: {
      patientId: '5',
      scheduledDate: '2026-04-15',
      scheduledTime: '10:00:00',
      status: 'pending',
    },
    nextPatientId: '5',
    nextScheduledDate: '2026-04-15',
    nextScheduledTime: '10:00:00',
    nextStatus: 'completed',
  });

  assert.equal(result, false);
});

test('shouldValidateScheduleAvailability is true when reactivating a cancelled appointment', () => {
  const result = __testables.shouldValidateScheduleAvailability({
    currentAppointment: {
      patientId: '5',
      scheduledDate: '2026-04-15',
      scheduledTime: '10:00:00',
      status: 'cancelled',
    },
    nextPatientId: '5',
    nextScheduledDate: '2026-04-15',
    nextScheduledTime: '10:00:00',
    nextStatus: 'pending',
  });

  assert.equal(result, true);
});

test('shouldValidateScheduleAvailability is true when changing a scheduled slot', () => {
  const result = __testables.shouldValidateScheduleAvailability({
    currentAppointment: {
      patientId: '5',
      scheduledDate: '2026-04-15',
      scheduledTime: '10:00:00',
      status: 'pending',
    },
    nextPatientId: '5',
    nextScheduledDate: '2026-04-22',
    nextScheduledTime: '10:00:00',
    nextStatus: 'pending',
  });

  assert.equal(result, true);
});

test('ensureRecurringDeletionIsAllowed rejects deleting future appointments outside a recurrence', () => {
  assert.throws(
    () => __testables.ensureRecurringDeletionIsAllowed({
      recurrenceGroupId: null,
      linkedFutureClinicalNotesCount: 0,
    }),
    {
      message: 'Esta cita no forma parte de una recurrencia.',
    },
  );
});

test('ensureRecurringDeletionIsAllowed rejects deleting future appointments with linked clinical notes', () => {
  assert.throws(
    () => __testables.ensureRecurringDeletionIsAllowed({
      recurrenceGroupId: 'series-1',
      linkedFutureClinicalNotesCount: 1,
    }),
    {
      message: 'No puedes eliminar futuras citas de esta recurrencia porque al menos una ya tiene nota clinica registrada.',
    },
  );
});

test('ensureRecurringDeletionIsAllowed allows deleting future appointments when the series is clean', () => {
  assert.doesNotThrow(() =>
    __testables.ensureRecurringDeletionIsAllowed({
      recurrenceGroupId: 'series-1',
      linkedFutureClinicalNotesCount: 0,
    }),
  );
});

test('ensureSlotFitsAvailability rejects dates explicitly blocked by exception', () => {
  assert.throws(
    () => __testables.ensureSlotFitsAvailability({
      availability: {
        source: 'exception',
        isUnavailable: true,
        blocks: [],
      },
      scheduledTime: '10:00:00',
      status: 'pending',
    }),
    {
      message: 'Ese dia esta marcado como no disponible en tu calendario.',
    },
  );
});

test('ensureSlotFitsAvailability rejects missing configured blocks on regular schedule', () => {
  assert.throws(
    () => __testables.ensureSlotFitsAvailability({
      availability: {
        source: 'weekly',
        isUnavailable: false,
        blocks: [],
      },
      scheduledTime: '10:00:00',
      status: 'pending',
    }),
    {
      message: 'No tienes disponibilidad configurada para ese dia.',
    },
  );
});

test('ensureSlotFitsAvailability rejects hour slots outside configured blocks', () => {
  assert.throws(
    () => __testables.ensureSlotFitsAvailability({
      availability: {
        source: 'weekly',
        isUnavailable: false,
        blocks: [{ startTime: '09:00:00', endTime: '12:00:00' }],
      },
      scheduledTime: '12:00:00',
      status: 'pending',
    }),
    {
      message: 'Ese horario queda fuera de tu disponibilidad configurada.',
    },
  );
});

test('ensureSlotFitsAvailability allows hour slots fully contained inside a configured block', () => {
  assert.doesNotThrow(() =>
    __testables.ensureSlotFitsAvailability({
      availability: {
        source: 'weekly',
        isUnavailable: false,
        blocks: [{ startTime: '09:00:00', endTime: '12:00:00' }],
      },
      scheduledTime: '11:00:00',
      status: 'pending',
    }),
  );
});

test('ensureWaitlistCreationIsAllowed rejects patients with another active appointment that day', () => {
  assert.throws(
    () => __testables.ensureWaitlistCreationIsAllowed({
      hasPatientSameDayConflict: true,
      hasDuplicatedWaitlistEntry: false,
      isOccupiedSlot: true,
    }),
    {
      message: 'Este paciente ya tiene una cita activa ese dia. Cancela o reprograma esa cita antes de sumarlo a lista de espera.',
    },
  );
});

test('ensureWaitlistCreationIsAllowed rejects duplicate waitlist entries for the same slot', () => {
  assert.throws(
    () => __testables.ensureWaitlistCreationIsAllowed({
      hasPatientSameDayConflict: false,
      hasDuplicatedWaitlistEntry: true,
      isOccupiedSlot: true,
    }),
    {
      message: 'Este paciente ya esta en lista de espera para ese horario.',
    },
  );
});

test('ensureWaitlistCreationIsAllowed rejects waitlist entries on free slots', () => {
  assert.throws(
    () => __testables.ensureWaitlistCreationIsAllowed({
      hasPatientSameDayConflict: false,
      hasDuplicatedWaitlistEntry: false,
      isOccupiedSlot: false,
    }),
    {
      message: 'Solo puedes agregar lista de espera sobre un horario que ya esta ocupado.',
    },
  );
});

test('ensureWaitlistCreationIsAllowed accepts a clean occupied slot', () => {
  assert.doesNotThrow(() =>
    __testables.ensureWaitlistCreationIsAllowed({
      hasPatientSameDayConflict: false,
      hasDuplicatedWaitlistEntry: false,
      isOccupiedSlot: true,
    }),
  );
});
