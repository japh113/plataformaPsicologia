import db from '../../config/db.js';
import { buildPatientAccessScope, ensurePsychologist } from '../auth/auth.permissions.js';
import { getEffectiveAvailabilityForDate } from '../availability/availability.service.js';

const normalizeDateValue = (value) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).slice(0, 10);
};

const getTodayDateString = () => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value || '0000';
  const month = parts.find((part) => part.type === 'month')?.value || '01';
  const day = parts.find((part) => part.type === 'day')?.value || '01';
  return `${year}-${month}-${day}`;
};

const mapAppointmentRow = (row) => ({
  id: String(row.id),
  patientId: String(row.patient_id),
  scheduledDate: normalizeDateValue(row.scheduled_date),
  scheduledTime: row.scheduled_time,
  status: row.status,
  notes: row.notes,
});

const normalizeScheduledTime = (value) => {
  const [hours = '00', minutes = '00', seconds = '00'] = String(value).split(':');
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const parseTimeToMinutes = (value) => {
  const [hours = '0', minutes = '0'] = String(value).split(':');
  return Number(hours) * 60 + Number(minutes);
};

const createScheduleConflictError = (message) => {
  const error = new Error(message);
  error.status = 409;
  return error;
};

const ensureAppointmentCompletionIsAllowed = ({ scheduledDate, status }) => {
  if (status !== 'completed') {
    return;
  }

  const appointmentDate = normalizeDateValue(scheduledDate);

  if (appointmentDate > getTodayDateString()) {
    const error = new Error('No puedes marcar como completada una cita futura.');
    error.status = 409;
    throw error;
  }
};

const ensurePatientAccess = async (psychologistUserId, patientId) => {
  const accessCheck = await db.query(
    `
      SELECT 1
      FROM psychologist_patient_access
      WHERE psychologist_user_id = $1
        AND patient_id = $2
    `,
    [psychologistUserId, patientId],
  );

  return accessCheck.rowCount > 0;
};

const ensureAppointmentAvailability = async ({
  actor,
  patientId,
  scheduledDate,
  scheduledTime,
  status,
  excludeAppointmentId = null,
}) => {
  if (status === 'cancelled') {
    return;
  }

  const patientSameDayConflict = await db.query(
    `
      SELECT scheduled_time
      FROM appointments
      WHERE patient_id = $1
        AND scheduled_date = $2
        AND status <> 'cancelled'
        AND ($3::bigint IS NULL OR id <> $3)
      ORDER BY scheduled_time ASC
      LIMIT 1
    `,
    [patientId, scheduledDate, excludeAppointmentId],
  );

  if (patientSameDayConflict.rowCount > 0) {
    throw createScheduleConflictError(
      'Este paciente ya tiene una cita agendada en este dia. Cancela o reprograma esa cita antes de crear otra.',
    );
  }

  const patientConflict = await db.query(
    `
      SELECT 1
      FROM appointments
      WHERE patient_id = $1
        AND scheduled_date = $2
        AND status <> 'cancelled'
        AND (
          (scheduled_date + scheduled_time, scheduled_date + scheduled_time + INTERVAL '1 hour')
          OVERLAPS
          ($2::date + $3::time, $2::date + $3::time + INTERVAL '1 hour')
        )
        AND ($4::bigint IS NULL OR id <> $4)
      LIMIT 1
    `,
    [patientId, scheduledDate, scheduledTime, excludeAppointmentId],
  );

  if (patientConflict.rowCount > 0) {
    throw createScheduleConflictError('Este paciente ya tiene una cita agendada en ese horario.');
  }

  const psychologistConflict = await db.query(
    `
      SELECT 1
      FROM appointments a
      INNER JOIN psychologist_patient_access spa
        ON spa.patient_id = a.patient_id
      WHERE spa.psychologist_user_id = $1
        AND a.scheduled_date = $2
        AND a.status <> 'cancelled'
        AND (
          (a.scheduled_date + a.scheduled_time, a.scheduled_date + a.scheduled_time + INTERVAL '1 hour')
          OVERLAPS
          ($2::date + $3::time, $2::date + $3::time + INTERVAL '1 hour')
        )
        AND ($4::bigint IS NULL OR a.id <> $4)
      LIMIT 1
    `,
    [actor.id, scheduledDate, scheduledTime, excludeAppointmentId],
  );

  if (psychologistConflict.rowCount > 0) {
    throw createScheduleConflictError('Ya tienes otra cita agendada en ese horario.');
  }
};

const ensureInsidePsychologistAvailability = async ({ actor, scheduledDate, scheduledTime, status }) => {
  if (status === 'cancelled') {
    return;
  }

  const availability = await getEffectiveAvailabilityForDate({
    psychologistUserId: actor.id,
    date: scheduledDate,
  });

  if (availability.source === 'exception' && availability.isUnavailable) {
    const error = new Error('Ese dia esta marcado como no disponible en tu calendario.');
    error.status = 409;
    throw error;
  }

  if (availability.blocks.length === 0) {
    const error = new Error(
      availability.source === 'exception'
        ? 'Ese dia tiene una excepcion sin horarios disponibles.'
        : 'No tienes disponibilidad configurada para ese dia.',
    );
    error.status = 409;
    throw error;
  }

  const startMinutes = parseTimeToMinutes(scheduledTime);
  const endMinutes = startMinutes + 60;
  const fitsInsideAnyBlock = availability.blocks.some((availabilityBlock) => {
    const availabilityStart = parseTimeToMinutes(availabilityBlock.startTime);
    const availabilityEnd = parseTimeToMinutes(availabilityBlock.endTime);
    return startMinutes >= availabilityStart && endMinutes <= availabilityEnd;
  });

  if (!fitsInsideAnyBlock) {
    const error = new Error('Ese horario queda fuera de tu disponibilidad configurada.');
    error.status = 409;
    throw error;
  }
};

export const listAppointments = async ({ date = null, actor }) => {
  const accessScope = buildPatientAccessScope(actor, 'a.patient_id', date ? 2 : 1);
  const params = date ? [date, ...accessScope.params] : accessScope.params;
  const dateClause = date ? 'a.scheduled_date = $1 AND ' : '';

  const result = await db.query(
    `
      SELECT
        id,
        patient_id,
        scheduled_date,
        scheduled_time,
        status,
        notes
      FROM appointments a
      WHERE ${dateClause}${accessScope.clause}
      ORDER BY scheduled_date ASC, scheduled_time ASC, id ASC
    `,
    params,
  );

  return result.rows.map(mapAppointmentRow);
};

export const getAppointmentById = async (id, actor) => {
  const accessScope = buildPatientAccessScope(actor, 'a.patient_id', 2);
  const result = await db.query(
    `
      SELECT
        id,
        patient_id,
        scheduled_date,
        scheduled_time,
        status,
        notes
      FROM appointments a
      WHERE a.id = $1
        AND ${accessScope.clause}
      LIMIT 1
    `,
    [id, ...accessScope.params],
  );

  return result.rows[0] ? mapAppointmentRow(result.rows[0]) : null;
};

export const createAppointment = async (payload, actor) => {
  ensurePsychologist(actor);

  const patientId = payload.patientId.trim();
  const scheduledTime = normalizeScheduledTime(payload.scheduledTime);
  const nextStatus = payload.status || 'pending';
  const hasPatientAccess = await ensurePatientAccess(actor.id, patientId);

  if (!hasPatientAccess) {
    return null;
  }

  ensureAppointmentCompletionIsAllowed({
    scheduledDate: payload.scheduledDate,
    status: nextStatus,
  });

  await ensureAppointmentAvailability({
    actor,
    patientId,
    scheduledDate: payload.scheduledDate,
    scheduledTime,
    status: nextStatus,
  });
  await ensureInsidePsychologistAvailability({
    actor,
    scheduledDate: payload.scheduledDate,
    scheduledTime,
    status: nextStatus,
  });

  const result = await db.query(
    `
      INSERT INTO appointments (
        patient_id,
        scheduled_date,
        scheduled_time,
        status,
        notes
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING
        id,
        patient_id,
        scheduled_date,
        scheduled_time,
        status,
        notes
    `,
    [
      patientId,
      payload.scheduledDate,
      scheduledTime,
      nextStatus,
      payload.notes || '',
    ],
  );

  return mapAppointmentRow(result.rows[0]);
};

export const updateAppointment = async (id, payload, actor) => {
  ensurePsychologist(actor);

  const currentAppointment = await getAppointmentById(id, actor);

  if (!currentAppointment) {
    return null;
  }

  const nextPatientId = payload.patientId?.trim() || currentAppointment.patientId;
  const hasPatientAccess = await ensurePatientAccess(actor.id, nextPatientId);

  if (!hasPatientAccess) {
    return null;
  }

  const nextScheduledDate = payload.scheduledDate || currentAppointment.scheduledDate;
  const nextScheduledTime = normalizeScheduledTime(payload.scheduledTime || currentAppointment.scheduledTime);
  const nextStatus = payload.status || currentAppointment.status;
  const shouldValidateScheduleAvailability =
    nextStatus !== 'cancelled' && (
      currentAppointment.status === 'cancelled'
      || nextPatientId !== currentAppointment.patientId
      || nextScheduledDate !== currentAppointment.scheduledDate
      || nextScheduledTime !== normalizeScheduledTime(currentAppointment.scheduledTime)
    );

  ensureAppointmentCompletionIsAllowed({
    scheduledDate: nextScheduledDate,
    status: nextStatus,
  });

  if (shouldValidateScheduleAvailability) {
    await ensureAppointmentAvailability({
      actor,
      patientId: nextPatientId,
      scheduledDate: nextScheduledDate,
      scheduledTime: nextScheduledTime,
      status: nextStatus,
      excludeAppointmentId: id,
    });
    await ensureInsidePsychologistAvailability({
      actor,
      scheduledDate: nextScheduledDate,
      scheduledTime: nextScheduledTime,
      status: nextStatus,
    });
  }

  const result = await db.query(
    `
      UPDATE appointments
      SET
        patient_id = $2,
        scheduled_date = $3,
        scheduled_time = $4,
        status = $5,
        notes = $6,
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        patient_id,
        scheduled_date,
        scheduled_time,
        status,
        notes
    `,
    [
      id,
      nextPatientId,
      nextScheduledDate,
      nextScheduledTime,
      nextStatus,
      payload.notes ?? currentAppointment.notes,
    ],
  );

  return mapAppointmentRow(result.rows[0]);
};

export const deleteAppointment = async (id, actor) => {
  ensurePsychologist(actor);

  const appointment = await getAppointmentById(id, actor);

  if (!appointment) {
    return false;
  }

  const result = await db.query('DELETE FROM appointments WHERE id = $1', [id]);
  return result.rowCount > 0;
};
