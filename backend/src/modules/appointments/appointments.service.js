import db from '../../config/db.js';
import { buildPatientAccessScope, ensurePsychologist, isPsychologist } from '../auth/auth.permissions.js';
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

const mapAppointmentRow = (row) => {
  const hasLinkedClinicalNote = Boolean(row.has_linked_clinical_note ?? row.has_linked_session);

  return {
    id: String(row.id),
    patientId: String(row.patient_id),
    scheduledDate: normalizeDateValue(row.scheduled_date),
    scheduledTime: row.scheduled_time,
    status: hasLinkedClinicalNote ? 'completed' : row.status,
    notes: row.notes,
    hasLinkedClinicalNote,
    waitlistCount: Number(row.waitlist_count || 0),
  };
};

const mapWaitlistEntryRow = (row) => ({
  id: String(row.id),
  patientId: String(row.patient_id),
  patientName: row.patient_full_name,
  scheduledDate: normalizeDateValue(row.scheduled_date),
  scheduledTime: row.scheduled_time,
  priorityPosition: Number(row.priority_position || 0),
  notes: row.notes || '',
  status: row.status,
  createdAt: row.created_at,
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

const normalizeWaitlistPriorityForSlot = async (client, { scheduledDate, scheduledTime }) => {
  await client.query(
    `
      WITH ranked_entries AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            ORDER BY priority_position ASC, created_at ASC, id ASC
          ) AS normalized_priority_position
        FROM appointment_waitlist_entries
        WHERE scheduled_date = $1
          AND scheduled_time = $2
          AND status = 'active'
      )
      UPDATE appointment_waitlist_entries AS waitlist_entry
      SET
        priority_position = ranked_entries.normalized_priority_position,
        updated_at = NOW()
      FROM ranked_entries
      WHERE waitlist_entry.id = ranked_entries.id
    `,
    [scheduledDate, scheduledTime],
  );
};

const getAppointmentSelectColumns = (waitlistParamIndex = null) => `
  a.id,
  a.patient_id,
  a.scheduled_date,
  a.scheduled_time,
  a.status,
  a.notes,
  EXISTS (
    SELECT 1
    FROM patient_clinical_notes pcn
    WHERE pcn.appointment_id = a.id
  ) AS has_linked_clinical_note,
  ${waitlistParamIndex
    ? `COALESCE((
        SELECT COUNT(*)
        FROM appointment_waitlist_entries awe
        INNER JOIN psychologist_patient_access spa_wait
          ON spa_wait.patient_id = awe.patient_id
        WHERE spa_wait.psychologist_user_id = $${waitlistParamIndex}
          AND awe.status = 'active'
          AND awe.scheduled_date = a.scheduled_date
          AND awe.scheduled_time = a.scheduled_time
      ), 0)`
    : '0'} AS waitlist_count
`;

const fulfillWaitlistEntriesForAppointment = async ({ patientId, scheduledDate, scheduledTime }) => {
  await db.query(
    `
      UPDATE appointment_waitlist_entries
      SET
        status = 'fulfilled',
        updated_at = NOW()
      WHERE patient_id = $1
        AND scheduled_date = $2
        AND scheduled_time = $3
        AND status = 'active'
    `,
    [patientId, scheduledDate, scheduledTime],
  );

  await normalizeWaitlistPriorityForSlot(db, { scheduledDate, scheduledTime });
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
  const params = date ? [date, ...accessScope.params] : [...accessScope.params];
  const waitlistParamIndex = isPsychologist(actor) ? params.push(actor.id) : null;
  const dateClause = date ? 'a.scheduled_date = $1 AND ' : '';

  const result = await db.query(
    `
      SELECT
        ${getAppointmentSelectColumns(waitlistParamIndex)}
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
  const params = [id, ...accessScope.params];
  const waitlistParamIndex = isPsychologist(actor) ? params.push(actor.id) : null;
  const result = await db.query(
    `
      SELECT
        ${getAppointmentSelectColumns(waitlistParamIndex)}
      FROM appointments a
      WHERE a.id = $1
        AND ${accessScope.clause}
      LIMIT 1
    `,
    params,
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

  await fulfillWaitlistEntriesForAppointment({
    patientId,
    scheduledDate: payload.scheduledDate,
    scheduledTime,
  });

  return getAppointmentById(result.rows[0].id, actor);
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
  const isChangingLinkedAppointmentSchedule =
    currentAppointment.hasLinkedClinicalNote && (
      nextPatientId !== currentAppointment.patientId
      || nextScheduledDate !== currentAppointment.scheduledDate
      || nextScheduledTime !== normalizeScheduledTime(currentAppointment.scheduledTime)
    );

  if (currentAppointment.hasLinkedClinicalNote && nextStatus !== 'completed') {
    const error = new Error('No puedes marcar como pendiente o cancelada una cita que ya tiene una nota clinica registrada.');
    error.status = 409;
    throw error;
  }

  if (isChangingLinkedAppointmentSchedule) {
    const error = new Error('No puedes reprogramar una cita que ya tiene una nota clinica registrada.');
    error.status = 409;
    throw error;
  }

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

  if (nextStatus !== 'cancelled') {
    await fulfillWaitlistEntriesForAppointment({
      patientId: nextPatientId,
      scheduledDate: nextScheduledDate,
      scheduledTime: nextScheduledTime,
    });
  }

  return getAppointmentById(result.rows[0].id, actor);
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

export const listWaitlistEntries = async ({ date = null, actor }) => {
  const accessScope = buildPatientAccessScope(actor, 'w.patient_id', date ? 2 : 1);
  const params = date ? [date, ...accessScope.params] : accessScope.params;
  const dateClause = date ? 'w.scheduled_date = $1 AND ' : '';

  const result = await db.query(
    `
      SELECT
        w.id,
        w.patient_id,
        p.full_name AS patient_full_name,
        w.scheduled_date,
        w.scheduled_time,
        w.priority_position,
        w.status,
        w.notes,
        w.created_at
      FROM appointment_waitlist_entries w
      INNER JOIN patients p
        ON p.id = w.patient_id
      WHERE ${dateClause}${accessScope.clause}
        AND w.status = 'active'
      ORDER BY w.scheduled_date ASC, w.scheduled_time ASC, w.priority_position ASC, w.created_at ASC
    `,
    params,
  );

  return result.rows.map(mapWaitlistEntryRow);
};

export const createWaitlistEntry = async (payload, actor) => {
  ensurePsychologist(actor);

  const patientId = payload.patientId.trim();
  const scheduledTime = normalizeScheduledTime(payload.scheduledTime);
  const hasPatientAccess = await ensurePatientAccess(actor.id, patientId);

  if (!hasPatientAccess) {
    return null;
  }

  const patientSameDayConflict = await db.query(
    `
      SELECT 1
      FROM appointments
      WHERE patient_id = $1
        AND scheduled_date = $2
        AND status <> 'cancelled'
      LIMIT 1
    `,
    [patientId, payload.scheduledDate],
  );

  if (patientSameDayConflict.rowCount > 0) {
    throw createScheduleConflictError(
      'Este paciente ya tiene una cita activa ese dia. Cancela o reprograma esa cita antes de sumarlo a lista de espera.',
    );
  }

  const duplicatedWaitlistEntry = await db.query(
    `
      SELECT 1
      FROM appointment_waitlist_entries
      WHERE patient_id = $1
        AND scheduled_date = $2
        AND scheduled_time = $3
        AND status = 'active'
      LIMIT 1
    `,
    [patientId, payload.scheduledDate, scheduledTime],
  );

  if (duplicatedWaitlistEntry.rowCount > 0) {
    throw createScheduleConflictError('Este paciente ya esta en lista de espera para ese horario.');
  }

  const occupiedSlot = await db.query(
    `
      SELECT 1
      FROM appointments a
      INNER JOIN psychologist_patient_access spa
        ON spa.patient_id = a.patient_id
      WHERE spa.psychologist_user_id = $1
        AND a.scheduled_date = $2
        AND a.scheduled_time = $3
        AND a.status <> 'cancelled'
      LIMIT 1
    `,
    [actor.id, payload.scheduledDate, scheduledTime],
  );

  if (occupiedSlot.rowCount === 0) {
    throw createScheduleConflictError('Solo puedes agregar lista de espera sobre un horario que ya esta ocupado.');
  }

  const result = await db.query(
    `
      WITH next_priority AS (
        SELECT COALESCE(MAX(priority_position), 0) + 1 AS value
        FROM appointment_waitlist_entries
        WHERE scheduled_date = $2
          AND scheduled_time = $3
          AND status = 'active'
      )
      INSERT INTO appointment_waitlist_entries (
        patient_id,
        scheduled_date,
        scheduled_time,
        priority_position,
        notes
      )
      VALUES ($1, $2, $3, (SELECT value FROM next_priority), $4)
      RETURNING
        id,
        patient_id,
        scheduled_date,
        scheduled_time,
        priority_position,
        status,
        notes,
        created_at
    `,
    [patientId, payload.scheduledDate, scheduledTime, payload.notes || ''],
  );

  const patientResult = await db.query('SELECT full_name FROM patients WHERE id = $1 LIMIT 1', [patientId]);
  return mapWaitlistEntryRow({
    ...result.rows[0],
    patient_full_name: patientResult.rows[0]?.full_name || '',
  });
};

export const deleteWaitlistEntry = async (id, actor) => {
  ensurePsychologist(actor);

  const accessScope = buildPatientAccessScope(actor, 'w.patient_id', 2);
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `
        DELETE FROM appointment_waitlist_entries w
        WHERE w.id = $1
          AND ${accessScope.clause}
        RETURNING w.id, w.scheduled_date, w.scheduled_time
      `,
      [id, ...accessScope.params],
    );

    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return false;
    }

    await normalizeWaitlistPriorityForSlot(client, {
      scheduledDate: normalizeDateValue(result.rows[0].scheduled_date),
      scheduledTime: result.rows[0].scheduled_time,
    });

    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const reorderWaitlistEntries = async (payload, actor) => {
  ensurePsychologist(actor);

  const scheduledTime = normalizeScheduledTime(payload.scheduledTime);
  const entryIds = payload.entryIds.map((entryId) => String(entryId));
  const validationAccessScope = buildPatientAccessScope(actor, 'w.patient_id', 4);
  const refreshedAccessScope = buildPatientAccessScope(actor, 'w.patient_id', 3);
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `
        SELECT
          w.id,
          w.patient_id,
          p.full_name AS patient_full_name,
          w.scheduled_date,
          w.scheduled_time,
          w.priority_position,
          w.status,
          w.notes,
          w.created_at
        FROM appointment_waitlist_entries w
        INNER JOIN patients p
          ON p.id = w.patient_id
        WHERE w.scheduled_date = $1
          AND w.scheduled_time = $2
          AND w.status = 'active'
          AND w.id::text = ANY($3::text[])
          AND ${validationAccessScope.clause}
      `,
      [payload.scheduledDate, scheduledTime, entryIds, ...validationAccessScope.params],
    );

    if (result.rowCount !== entryIds.length) {
      throw createScheduleConflictError('No se pudieron validar todas las entradas de lista de espera para este horario.');
    }

    const matchedEntryIds = new Set(result.rows.map((row) => String(row.id)));
    const containsUnexpectedIds = entryIds.some((entryId) => !matchedEntryIds.has(entryId));

    if (containsUnexpectedIds) {
      throw createScheduleConflictError('El nuevo orden contiene entradas invalidas para este horario.');
    }

    for (let index = 0; index < entryIds.length; index += 1) {
      await client.query(
        `
          UPDATE appointment_waitlist_entries
          SET
            priority_position = $2,
            updated_at = NOW()
          WHERE id = $1
        `,
        [entryIds[index], index + 1],
      );
    }

    await normalizeWaitlistPriorityForSlot(client, {
      scheduledDate: payload.scheduledDate,
      scheduledTime,
    });

    const refreshedEntries = await client.query(
      `
        SELECT
          w.id,
          w.patient_id,
          p.full_name AS patient_full_name,
          w.scheduled_date,
          w.scheduled_time,
          w.priority_position,
          w.status,
          w.notes,
          w.created_at
        FROM appointment_waitlist_entries w
        INNER JOIN patients p
          ON p.id = w.patient_id
        WHERE w.scheduled_date = $1
          AND w.scheduled_time = $2
          AND w.status = 'active'
          AND ${refreshedAccessScope.clause}
        ORDER BY w.priority_position ASC, w.created_at ASC
      `,
      [payload.scheduledDate, scheduledTime, ...refreshedAccessScope.params],
    );

    await client.query('COMMIT');
    return refreshedEntries.rows.map(mapWaitlistEntryRow);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
