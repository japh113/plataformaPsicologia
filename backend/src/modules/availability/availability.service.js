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

const parseTimeToMinutes = (value) => {
  const [hours = '0', minutes = '0'] = String(value).split(':');
  return Number(hours) * 60 + Number(minutes);
};

const getWeekdayFromDateString = (value) => {
  const [year = '0', month = '1', day = '1'] = String(value).split('-');
  return new Date(Number(year), Number(month) - 1, Number(day)).getDay();
};

const mapAvailabilityRow = (row) => ({
  id: String(row.id),
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

const ensureAvailabilityDoesNotConflictWithAppointments = async (entries, actor) => {
  const futureAppointmentsResult = await db.query(
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
        AND a.status <> 'cancelled'
        AND a.scheduled_date >= CURRENT_DATE
      ORDER BY a.scheduled_date ASC, a.scheduled_time ASC, a.id ASC
    `,
    [actor.id],
  );

  const entriesByWeekday = new Map(entries.map((entry) => [entry.weekday, entry.blocks || []]));
  const conflictingAppointments = futureAppointmentsResult.rows.filter((appointment) => {
    const weekday = getWeekdayFromDateString(appointment.scheduled_date);
    const blocks = entriesByWeekday.get(weekday) || [];

    if (blocks.length === 0) {
      return true;
    }

    const appointmentStart = parseTimeToMinutes(appointment.scheduled_time);
    const appointmentEnd = appointmentStart + 60;

    return !blocks.some((block) => {
      const blockStart = parseTimeToMinutes(block.startTime);
      const blockEnd = parseTimeToMinutes(block.endTime);
      return appointmentStart >= blockStart && appointmentEnd <= blockEnd;
    });
  });

  if (conflictingAppointments.length === 0) {
    return;
  }

  const conflictPreview = conflictingAppointments
    .slice(0, 3)
    .map((appointment) => `${appointment.scheduled_date} ${String(appointment.scheduled_time).slice(0, 5)}`)
    .join(', ');

  const remainingCount = conflictingAppointments.length - Math.min(conflictingAppointments.length, 3);
  const suffix = remainingCount > 0 ? ` y ${remainingCount} mas` : '';
  const error = new Error(`No puedes reducir la disponibilidad porque ya existen citas agendadas fuera del nuevo horario: ${conflictPreview}${suffix}. Reagenda o cancela esos espacios primero.`);
  error.status = 409;
  throw error;
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
