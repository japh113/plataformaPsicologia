import db from '../../config/db.js';
import { ensurePsychologist } from '../auth/auth.permissions.js';

const DEFAULT_AVAILABILITY = Array.from({ length: 7 }, (_, weekday) => ({
  weekday,
  blocks: [],
}));

const normalizeTime = (value) => {
  if (!value) {
    return null;
  }

  const [hours = '00', minutes = '00', seconds = '00'] = String(value).split(':');
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const normalizeDateValue = (value) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).slice(0, 10);
};

const addDaysToDateString = (dateString, amount) => {
  const [year = '0', month = '1', day = '1'] = String(dateString).split('-');
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  date.setDate(date.getDate() + amount);
  return normalizeDateValue(date);
};

const buildDateRange = (startDate, endDate) => {
  const dates = [];
  let currentDate = normalizeDateValue(startDate);
  const lastDate = normalizeDateValue(endDate);

  while (currentDate <= lastDate) {
    dates.push(currentDate);
    currentDate = addDaysToDateString(currentDate, 1);
  }

  return dates;
};

const differenceBetweenDateRanges = (sourceDates, excludedDates) => {
  const excludedDateSet = new Set(excludedDates || []);
  return (sourceDates || []).filter((date) => !excludedDateSet.has(date));
};

const parseTimeToMinutes = (value) => {
  const [hours = '0', minutes = '0'] = String(value).split(':');
  return Number(hours) * 60 + Number(minutes);
};

const getWeekdayFromDateString = (value) => {
  const [year = '0', month = '1', day = '1'] = String(value).split('-');
  return new Date(Number(year), Number(month) - 1, Number(day)).getDay();
};

const mapAvailabilityRow = (row) => ({
  id: row.id ? String(row.id) : undefined,
  startTime: normalizeTime(row.start_time),
  endTime: normalizeTime(row.end_time),
});

const mergeWithDefaults = (rows) => {
  const entriesByWeekday = new Map(DEFAULT_AVAILABILITY.map((entry) => [entry.weekday, { ...entry, blocks: [] }]));

  rows.forEach((row) => {
    entriesByWeekday.get(Number(row.weekday)).blocks.push(mapAvailabilityRow(row));
  });

  return [...entriesByWeekday.values()].map((entry) => ({
    ...entry,
    blocks: entry.blocks.sort((left, right) => left.startTime.localeCompare(right.startTime)),
  }));
};

const mapExceptionRows = (rows) => {
  const exceptionByDate = new Map();

  rows.forEach((row) => {
    const date = normalizeDateValue(row.exception_date);

    if (!exceptionByDate.has(date)) {
      exceptionByDate.set(date, {
        date,
        isUnavailable: Boolean(row.is_unavailable),
        blocks: [],
      });
    }

    if (row.start_time && row.end_time) {
      exceptionByDate.get(date).blocks.push(mapAvailabilityRow(row));
    }
  });

  return [...exceptionByDate.values()]
    .map((entry) => ({
      ...entry,
      blocks: entry.blocks.sort((left, right) => left.startTime.localeCompare(right.startTime)),
    }))
    .sort((left, right) => left.date.localeCompare(right.date));
};

const createConflictError = (message) => {
  const error = new Error(message);
  error.status = 409;
  return error;
};

const fitsAppointmentInsideBlocks = (scheduledTime, blocks) => {
  const appointmentStart = parseTimeToMinutes(scheduledTime);
  const appointmentEnd = appointmentStart + 60;

  return blocks.some((block) => {
    const blockStart = parseTimeToMinutes(block.startTime);
    const blockEnd = parseTimeToMinutes(block.endTime);
    return appointmentStart >= blockStart && appointmentEnd <= blockEnd;
  });
};

const buildConflictPreview = (appointments) => {
  const preview = appointments
    .slice(0, 3)
    .map((appointment) => `${appointment.scheduled_date} ${String(appointment.scheduled_time).slice(0, 5)}`)
    .join(', ');

  const remainingCount = appointments.length - Math.min(appointments.length, 3);
  const suffix = remainingCount > 0 ? ` y ${remainingCount} mas` : '';

  return `${preview}${suffix}`;
};

const ensureAppointmentsFitBlocks = (appointments, blocks, message) => {
  const conflictingAppointments = appointments.filter((appointment) => !fitsAppointmentInsideBlocks(appointment.scheduled_time, blocks));

  if (conflictingAppointments.length === 0) {
    return;
  }

  throw createConflictError(`${message}: ${buildConflictPreview(conflictingAppointments)}. Reagenda o cancela esos espacios primero.`);
};

const getFutureAppointmentsForPsychologist = async (psychologistUserId, date = null) => {
  const params = [psychologistUserId];
  const dateClause = date ? 'AND a.scheduled_date = $2' : '';

  if (date) {
    params.push(date);
  }

  const result = await db.query(
    `
      SELECT
        a.id,
        a.patient_id,
        a.scheduled_date::text AS scheduled_date,
        a.scheduled_time::text AS scheduled_time
      FROM appointments a
      INNER JOIN psychologist_patient_access spa
        ON spa.patient_id = a.patient_id
      WHERE spa.psychologist_user_id = $1
        ${dateClause}
        AND a.status <> 'cancelled'
        AND (
          a.scheduled_date > CURRENT_DATE
          OR (
            a.scheduled_date = CURRENT_DATE
            AND a.scheduled_time + INTERVAL '1 hour' > CURRENT_TIME
          )
        )
      ORDER BY a.scheduled_date ASC, a.scheduled_time ASC, a.id ASC
    `,
    params,
  );

  return result.rows;
};

const getFutureAppointmentsForPsychologistByDates = async (psychologistUserId, dates) => {
  if (!dates || dates.length === 0) {
    return [];
  }

  const result = await db.query(
    `
      SELECT
        a.id,
        a.patient_id,
        a.scheduled_date::text AS scheduled_date,
        a.scheduled_time::text AS scheduled_time
      FROM appointments a
      INNER JOIN psychologist_patient_access spa
        ON spa.patient_id = a.patient_id
      WHERE spa.psychologist_user_id = $1
        AND a.scheduled_date = ANY($2::date[])
        AND a.status <> 'cancelled'
        AND (
          a.scheduled_date > CURRENT_DATE
          OR (
            a.scheduled_date = CURRENT_DATE
            AND a.scheduled_time + INTERVAL '1 hour' > CURRENT_TIME
          )
        )
      ORDER BY a.scheduled_date ASC, a.scheduled_time ASC, a.id ASC
    `,
    [psychologistUserId, dates],
  );

  return result.rows;
};

const getWeeklyAvailabilityBlocks = async (psychologistUserId, weekday) => {
  const result = await db.query(
    `
      SELECT id, start_time, end_time
      FROM psychologist_availability_blocks
      WHERE psychologist_user_id = $1
        AND weekday = $2
      ORDER BY start_time ASC, end_time ASC, id ASC
    `,
    [psychologistUserId, weekday],
  );

  return result.rows.map(mapAvailabilityRow);
};

const getAvailabilityExceptionMap = async (psychologistUserId, dates) => {
  if (!dates || dates.length === 0) {
    return new Map();
  }

  const result = await db.query(
    `
      SELECT
        e.exception_date,
        e.is_unavailable,
        b.id,
        b.start_time,
        b.end_time
      FROM psychologist_availability_exceptions e
      LEFT JOIN psychologist_availability_exception_blocks b
        ON b.psychologist_user_id = e.psychologist_user_id
       AND b.exception_date = e.exception_date
      WHERE e.psychologist_user_id = $1
        AND e.exception_date = ANY($2::date[])
      ORDER BY e.exception_date ASC, b.start_time ASC, b.id ASC
    `,
    [psychologistUserId, dates],
  );

  return new Map(mapExceptionRows(result.rows).map((entry) => [entry.date, entry]));
};

const getAvailabilityExceptionByDate = async (psychologistUserId, exceptionDate) => {
  const exceptionMap = await getAvailabilityExceptionMap(psychologistUserId, [exceptionDate]);
  return exceptionMap.get(exceptionDate) || null;
};

const ensureDatesAreUnavailableExceptions = async (psychologistUserId, dates, message) => {
  const exceptionMap = await getAvailabilityExceptionMap(psychologistUserId, dates);
  const invalidDates = dates.filter((date) => {
    const exception = exceptionMap.get(date);
    return !exception || !exception.isUnavailable;
  });

  if (invalidDates.length === 0) {
    return;
  }

  throw createConflictError(`${message}: ${invalidDates.slice(0, 3).join(', ')}.`);
};

const ensureDatesDoNotOverrideSpecialExceptions = async (psychologistUserId, dates) => {
  if (!dates || dates.length === 0) {
    return;
  }

  const exceptionMap = await getAvailabilityExceptionMap(psychologistUserId, dates);
  const conflictingDates = dates.filter((date) => {
    const exception = exceptionMap.get(date);
    return exception && !exception.isUnavailable;
  });

  if (conflictingDates.length === 0) {
    return;
  }

  throw createConflictError(
    `No puedes bloquear este periodo porque ya existen horarios especiales en estas fechas: ${conflictingDates.slice(0, 3).join(', ')}. Edita o elimina esas excepciones primero.`,
  );
};

const ensureAvailabilityDoesNotConflictWithAppointments = async (entries, actor) => {
  const futureAppointments = await getFutureAppointmentsForPsychologist(actor.id);

  if (futureAppointments.length === 0) {
    return;
  }

  const dates = [...new Set(futureAppointments.map((appointment) => appointment.scheduled_date))];
  const exceptionMap = await getAvailabilityExceptionMap(actor.id, dates);
  const entriesByWeekday = new Map(entries.map((entry) => [entry.weekday, entry.blocks || []]));

  const conflictingAppointments = futureAppointments.filter((appointment) => {
    const exception = exceptionMap.get(appointment.scheduled_date);
    const weekday = getWeekdayFromDateString(appointment.scheduled_date);
    const blocks = exception ? exception.blocks : entriesByWeekday.get(weekday) || [];

    return !fitsAppointmentInsideBlocks(appointment.scheduled_time, blocks);
  });

  if (conflictingAppointments.length === 0) {
    return;
  }

  throw createConflictError(
    `No puedes reducir la disponibilidad porque ya existen citas agendadas fuera del nuevo horario: ${buildConflictPreview(conflictingAppointments)}. Reagenda o cancela esos espacios primero.`,
  );
};

const ensureAvailabilityExceptionDoesNotConflictWithAppointments = async ({
  actor,
  exceptionDate,
  isUnavailable,
  blocks,
}) => {
  const futureAppointments = await getFutureAppointmentsForPsychologist(actor.id, exceptionDate);

  if (futureAppointments.length === 0) {
    return;
  }

  if (isUnavailable || blocks.length === 0) {
    throw createConflictError(
      `No puedes marcar ${exceptionDate} como no disponible porque ya existen citas agendadas: ${buildConflictPreview(futureAppointments)}. Reagenda o cancela esos espacios primero.`,
    );
  }

  ensureAppointmentsFitBlocks(
    futureAppointments,
    blocks,
    `No puedes guardar esa excepcion porque ya existen citas fuera del horario especial`,
  );
};

const ensureExceptionDeletionDoesNotConflictWithAppointments = async (exceptionDate, actor) => {
  const futureAppointments = await getFutureAppointmentsForPsychologist(actor.id, exceptionDate);

  if (futureAppointments.length === 0) {
    return;
  }

  const weekday = getWeekdayFromDateString(exceptionDate);
  const weeklyBlocks = await getWeeklyAvailabilityBlocks(actor.id, weekday);

  if (weeklyBlocks.length === 0) {
    throw createConflictError(
      `No puedes eliminar la excepcion porque la disponibilidad semanal deja sin cobertura estas citas: ${buildConflictPreview(futureAppointments)}. Reagenda o cancela esos espacios primero.`,
    );
  }

  ensureAppointmentsFitBlocks(
    futureAppointments,
    weeklyBlocks,
    'No puedes eliminar la excepcion porque la disponibilidad semanal deja fuera algunas citas',
  );
};

const ensureExceptionRangeDeletionDoesNotConflictWithAppointments = async (dates, actor) => {
  if (!dates || dates.length === 0) {
    return;
  }

  await Promise.all(dates.map((date) => ensureExceptionDeletionDoesNotConflictWithAppointments(date, actor)));
};

export const getEffectiveAvailabilityForDate = async ({ psychologistUserId, date }) => {
  const normalizedDate = normalizeDateValue(date);
  const exception = await getAvailabilityExceptionByDate(psychologistUserId, normalizedDate);

  if (exception) {
    return {
      source: 'exception',
      date: normalizedDate,
      isUnavailable: exception.isUnavailable,
      blocks: exception.blocks,
    };
  }

  const weekday = getWeekdayFromDateString(normalizedDate);
  const blocks = await getWeeklyAvailabilityBlocks(psychologistUserId, weekday);

  return {
    source: 'weekly',
    date: normalizedDate,
    isUnavailable: false,
    blocks,
  };
};

export const listMyAvailability = async (actor) => {
  ensurePsychologist(actor);

  const result = await db.query(
    `
      SELECT id, weekday, start_time, end_time
      FROM psychologist_availability_blocks
      WHERE psychologist_user_id = $1
      ORDER BY weekday ASC, start_time ASC, id ASC
    `,
    [actor.id],
  );

  return mergeWithDefaults(result.rows);
};

export const updateMyAvailability = async (entries, actor) => {
  ensurePsychologist(actor);
  await ensureAvailabilityDoesNotConflictWithAppointments(entries, actor);

  const client = await db.getClient();

  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM psychologist_availability_blocks WHERE psychologist_user_id = $1', [actor.id]);

    for (const entry of entries) {
      for (const block of entry.blocks) {
        await client.query(
          `
            INSERT INTO psychologist_availability_blocks (
              psychologist_user_id,
              weekday,
              start_time,
              end_time
            )
            VALUES ($1, $2, $3, $4)
          `,
          [actor.id, entry.weekday, normalizeTime(block.startTime), normalizeTime(block.endTime)],
        );
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return listMyAvailability(actor);
};

export const listMyAvailabilityExceptions = async (actor) => {
  ensurePsychologist(actor);

  const result = await db.query(
    `
      SELECT
        e.exception_date,
        e.is_unavailable,
        b.id,
        b.start_time,
        b.end_time
      FROM psychologist_availability_exceptions e
      LEFT JOIN psychologist_availability_exception_blocks b
        ON b.psychologist_user_id = e.psychologist_user_id
       AND b.exception_date = e.exception_date
      WHERE e.psychologist_user_id = $1
      ORDER BY e.exception_date ASC, b.start_time ASC, b.id ASC
    `,
    [actor.id],
  );

  return mapExceptionRows(result.rows);
};

export const upsertMyAvailabilityException = async (exceptionDate, payload, actor) => {
  ensurePsychologist(actor);

  const normalizedDate = normalizeDateValue(exceptionDate);
  const blocks = (payload.isUnavailable ? [] : payload.blocks).map((block) => ({
    startTime: normalizeTime(block.startTime),
    endTime: normalizeTime(block.endTime),
  }));

  await ensureAvailabilityExceptionDoesNotConflictWithAppointments({
    actor,
    exceptionDate: normalizedDate,
    isUnavailable: Boolean(payload.isUnavailable),
    blocks,
  });

  const client = await db.getClient();

  try {
    await client.query('BEGIN');
    await client.query(
      `
        INSERT INTO psychologist_availability_exceptions (
          psychologist_user_id,
          exception_date,
          is_unavailable
        )
        VALUES ($1, $2, $3)
        ON CONFLICT (psychologist_user_id, exception_date)
        DO UPDATE SET
          is_unavailable = EXCLUDED.is_unavailable,
          updated_at = NOW()
      `,
      [actor.id, normalizedDate, Boolean(payload.isUnavailable)],
    );

    await client.query(
      `
        DELETE FROM psychologist_availability_exception_blocks
        WHERE psychologist_user_id = $1
          AND exception_date = $2
      `,
      [actor.id, normalizedDate],
    );

    for (const block of blocks) {
      await client.query(
        `
          INSERT INTO psychologist_availability_exception_blocks (
            psychologist_user_id,
            exception_date,
            start_time,
            end_time
          )
          VALUES ($1, $2, $3, $4)
        `,
        [actor.id, normalizedDate, block.startTime, block.endTime],
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return getAvailabilityExceptionByDate(actor.id, normalizedDate);
};

export const createMyUnavailableAvailabilityRange = async ({ startDate, endDate }, actor) => {
  ensurePsychologist(actor);

  const dates = buildDateRange(startDate, endDate);
  await ensureDatesDoNotOverrideSpecialExceptions(actor.id, dates);
  const futureAppointments = await getFutureAppointmentsForPsychologistByDates(actor.id, dates);

  if (futureAppointments.length > 0) {
    throw createConflictError(
      `No puedes bloquear este periodo porque ya existen citas agendadas dentro del rango: ${buildConflictPreview(futureAppointments)}. Reagenda o cancela esos espacios primero.`,
    );
  }

  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    for (const date of dates) {
      await client.query(
        `
          INSERT INTO psychologist_availability_exceptions (
            psychologist_user_id,
            exception_date,
            is_unavailable
          )
          VALUES ($1, $2, TRUE)
          ON CONFLICT (psychologist_user_id, exception_date)
          DO UPDATE SET
            is_unavailable = TRUE,
            updated_at = NOW()
        `,
        [actor.id, date],
      );

      await client.query(
        `
          DELETE FROM psychologist_availability_exception_blocks
          WHERE psychologist_user_id = $1
            AND exception_date = $2
        `,
        [actor.id, date],
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const exceptionMap = await getAvailabilityExceptionMap(actor.id, dates);
  return dates.map((date) => exceptionMap.get(date)).filter(Boolean);
};

export const updateMyUnavailableAvailabilityRange = async (
  { currentStartDate, currentEndDate, startDate, endDate },
  actor,
) => {
  ensurePsychologist(actor);

  const currentDates = buildDateRange(currentStartDate, currentEndDate);
  const nextDates = buildDateRange(startDate, endDate);
  const datesToRemove = differenceBetweenDateRanges(currentDates, nextDates);
  const datesToAdd = differenceBetweenDateRanges(nextDates, currentDates);

  await ensureDatesAreUnavailableExceptions(
    actor.id,
    currentDates,
    'No se pudo editar el periodo porque algunas fechas ya no siguen bloqueadas',
  );
  await ensureDatesDoNotOverrideSpecialExceptions(actor.id, datesToAdd);
  await ensureExceptionRangeDeletionDoesNotConflictWithAppointments(datesToRemove, actor);

  const futureAppointments = await getFutureAppointmentsForPsychologistByDates(actor.id, datesToAdd);

  if (futureAppointments.length > 0) {
    throw createConflictError(
      `No puedes mover este periodo porque ya existen citas agendadas dentro del nuevo rango: ${buildConflictPreview(futureAppointments)}. Reagenda o cancela esos espacios primero.`,
    );
  }

  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    if (datesToRemove.length > 0) {
      await client.query(
        `
          DELETE FROM psychologist_availability_exceptions
          WHERE psychologist_user_id = $1
            AND exception_date = ANY($2::date[])
        `,
        [actor.id, datesToRemove],
      );
    }

    for (const date of datesToAdd) {
      await client.query(
        `
          INSERT INTO psychologist_availability_exceptions (
            psychologist_user_id,
            exception_date,
            is_unavailable
          )
          VALUES ($1, $2, TRUE)
          ON CONFLICT (psychologist_user_id, exception_date)
          DO UPDATE SET
            is_unavailable = TRUE,
            updated_at = NOW()
        `,
        [actor.id, date],
      );

      await client.query(
        `
          DELETE FROM psychologist_availability_exception_blocks
          WHERE psychologist_user_id = $1
            AND exception_date = $2
        `,
        [actor.id, date],
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const exceptionMap = await getAvailabilityExceptionMap(actor.id, nextDates);
  return nextDates.map((date) => exceptionMap.get(date)).filter(Boolean);
};

export const deleteMyUnavailableAvailabilityRange = async ({ startDate, endDate }, actor) => {
  ensurePsychologist(actor);

  const dates = buildDateRange(startDate, endDate);
  await ensureDatesAreUnavailableExceptions(
    actor.id,
    dates,
    'No se pudo desbloquear el periodo porque algunas fechas ya no siguen bloqueadas',
  );
  await ensureExceptionRangeDeletionDoesNotConflictWithAppointments(dates, actor);

  await db.query(
    `
      DELETE FROM psychologist_availability_exceptions
      WHERE psychologist_user_id = $1
        AND exception_date = ANY($2::date[])
    `,
    [actor.id, dates],
  );

  return {
    startDate: normalizeDateValue(startDate),
    endDate: normalizeDateValue(endDate),
    deletedDates: dates,
  };
};

export const deleteMyAvailabilityException = async (exceptionDate, actor) => {
  ensurePsychologist(actor);

  const normalizedDate = normalizeDateValue(exceptionDate);
  const existingException = await getAvailabilityExceptionByDate(actor.id, normalizedDate);

  if (!existingException) {
    return false;
  }

  await ensureExceptionDeletionDoesNotConflictWithAppointments(normalizedDate, actor);

  const result = await db.query(
    `
      DELETE FROM psychologist_availability_exceptions
      WHERE psychologist_user_id = $1
        AND exception_date = $2
    `,
    [actor.id, normalizedDate],
  );

  return result.rowCount > 0;
};
