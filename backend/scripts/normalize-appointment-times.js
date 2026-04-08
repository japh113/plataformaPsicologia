import db from '../src/config/db.js';

const APPOINTMENT_DURATION_MINUTES = 60;
const MINUTES_IN_DAY = 24 * 60;

const parseTimeToMinutes = (timeValue) => {
  const [rawHours = '0', rawMinutes = '0'] = String(timeValue).split(':');
  return Number(rawHours) * 60 + Number(rawMinutes);
};

const formatMinutesToTime = (minutes) => {
  const normalizedMinutes = ((minutes % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
  const hours = Math.floor(normalizedMinutes / 60);
  const remainderMinutes = normalizedMinutes % 60;

  return `${String(hours).padStart(2, '0')}:${String(remainderMinutes).padStart(2, '0')}:00`;
};

const roundUpToNextHour = (minutes) => {
  if (minutes % 60 === 0) {
    return minutes;
  }

  return Math.ceil(minutes / 60) * 60;
};

const rangesOverlap = (startA, endA, startB, endB) => startA < endB && startB < endA;

const hasOverlap = (ranges, nextStart, nextEnd) => ranges.some((range) => rangesOverlap(range.start, range.end, nextStart, nextEnd));

const addRangeToMap = (map, key, range) => {
  if (!map.has(key)) {
    map.set(key, []);
  }

  map.get(key).push(range);
};

const getMapRanges = (map, key) => map.get(key) || [];

const reserveAppointmentRanges = ({ appointment, patientPsychologistMap, patientRanges, psychologistRanges }) => {
  const start = parseTimeToMinutes(appointment.scheduled_time);
  const end = start + APPOINTMENT_DURATION_MINUTES;
  const dateKey = appointment.scheduled_date;
  const patientKey = `${dateKey}:${appointment.patient_id}`;
  const psychologists = patientPsychologistMap.get(appointment.patient_id) || [];

  addRangeToMap(patientRanges, patientKey, { start, end, appointmentId: appointment.id });

  psychologists.forEach((psychologistId) => {
    addRangeToMap(psychologistRanges, `${dateKey}:${psychologistId}`, {
      start,
      end,
      appointmentId: appointment.id,
    });
  });
};

const canAssignTime = ({
  dateKey,
  patientId,
  patientPsychologistMap,
  patientRanges,
  psychologistRanges,
  candidateStart,
}) => {
  const candidateEnd = candidateStart + APPOINTMENT_DURATION_MINUTES;
  const patientKey = `${dateKey}:${patientId}`;
  const psychologists = patientPsychologistMap.get(patientId) || [];

  if (hasOverlap(getMapRanges(patientRanges, patientKey), candidateStart, candidateEnd)) {
    return false;
  }

  return !psychologists.some((psychologistId) =>
    hasOverlap(getMapRanges(psychologistRanges, `${dateKey}:${psychologistId}`), candidateStart, candidateEnd),
  );
};

const main = async () => {
  const patientPsychologistMap = new Map();

  try {
    const [accessResult, appointmentsResult] = await Promise.all([
      db.query(
        `
          SELECT patient_id, psychologist_user_id
          FROM psychologist_patient_access
          ORDER BY patient_id, psychologist_user_id
        `,
      ),
      db.query(
        `
          SELECT
            id,
            patient_id,
            scheduled_date::text AS scheduled_date,
            scheduled_time::text AS scheduled_time,
            status
          FROM appointments
          ORDER BY scheduled_date ASC, scheduled_time ASC, id ASC
        `,
      ),
    ]);

    accessResult.rows.forEach((row) => {
      const patientId = String(row.patient_id);

      if (!patientPsychologistMap.has(patientId)) {
        patientPsychologistMap.set(patientId, []);
      }

      patientPsychologistMap.get(patientId).push(String(row.psychologist_user_id));
    });

    const patientRanges = new Map();
    const psychologistRanges = new Map();
    const appointmentsToNormalize = [];

    appointmentsResult.rows.forEach((appointment) => {
      const startMinutes = parseTimeToMinutes(appointment.scheduled_time);
      const isWholeHour = startMinutes % 60 === 0;

      if (isWholeHour) {
        reserveAppointmentRanges({
          appointment,
          patientPsychologistMap,
          patientRanges,
          psychologistRanges,
        });
        return;
      }

      appointmentsToNormalize.push(appointment);
    });

    const normalizedAppointments = [];

    for (const appointment of appointmentsToNormalize) {
      const originalStart = parseTimeToMinutes(appointment.scheduled_time);
      let candidateStart = roundUpToNextHour(originalStart);

      while (
        candidateStart < MINUTES_IN_DAY &&
        !canAssignTime({
          dateKey: appointment.scheduled_date,
          patientId: String(appointment.patient_id),
          patientPsychologistMap,
          patientRanges,
          psychologistRanges,
          candidateStart,
        })
      ) {
        candidateStart += 60;
      }

      if (candidateStart >= MINUTES_IN_DAY) {
        throw new Error(`No se pudo normalizar la cita ${appointment.id} sin generar conflicto.`);
      }

      const normalizedTime = formatMinutesToTime(candidateStart);
      const normalizedAppointment = {
        ...appointment,
        normalized_time: normalizedTime,
      };

      normalizedAppointments.push(normalizedAppointment);

      reserveAppointmentRanges({
        appointment: {
          ...appointment,
          scheduled_time: normalizedTime,
        },
        patientPsychologistMap,
        patientRanges,
        psychologistRanges,
      });
    }

    if (normalizedAppointments.length === 0) {
      console.log('No legacy appointments found. Nothing to normalize.');
      return;
    }

    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      for (const appointment of normalizedAppointments) {
        await client.query(
          `
            UPDATE appointments
            SET
              scheduled_time = $2::time,
              updated_at = NOW()
            WHERE id = $1
          `,
          [appointment.id, appointment.normalized_time],
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    normalizedAppointments.forEach((appointment) => {
      console.log(`Appointment ${appointment.id}: ${appointment.scheduled_time} -> ${appointment.normalized_time}`);
    });
  } finally {
    await db.close();
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
