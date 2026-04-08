import db from '../../config/db.js';
import { ensureAuthenticated, isPatient, isPsychologist } from '../auth/auth.permissions.js';

const normalizeDateValue = (value) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).slice(0, 10);
};

const normalizeTimeValue = (value) => {
  const [hours = '00', minutes = '00', seconds = '00'] = String(value).split(':');
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const getDayDistanceFromToday = (dateValue) => {
  const today = new Date();
  const baseToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const [year = '0', month = '1', day = '1'] = String(dateValue).split('-');
  const targetDate = new Date(Number(year), Number(month) - 1, Number(day));
  return Math.floor((targetDate.getTime() - baseToday.getTime()) / 86400000);
};

const getAppointmentPriority = (scheduledDate) => {
  const dayDistance = getDayDistanceFromToday(scheduledDate);

  if (dayDistance <= 0) {
    return 'high';
  }

  if (dayDistance === 1) {
    return 'medium';
  }

  return 'low';
};

const getAppointmentTitle = ({ scheduledDate, patientName, actorRole }) => {
  const dayDistance = getDayDistanceFromToday(scheduledDate);
  const owner = actorRole === 'psychologist' ? patientName : 'tu cita';

  if (dayDistance <= 0) {
    return actorRole === 'psychologist' ? `Tienes una cita hoy con ${owner}` : 'Tienes una cita hoy';
  }

  if (dayDistance === 1) {
    return actorRole === 'psychologist' ? `Tienes una cita manana con ${owner}` : 'Tienes una cita manana';
  }

  return actorRole === 'psychologist' ? `Proxima cita con ${owner}` : 'Proxima cita programada';
};

const getStatusLabel = (status) => {
  if (status === 'completed') {
    return 'completada';
  }

  if (status === 'cancelled') {
    return 'cancelada';
  }

  return 'pendiente';
};

const mapAppointmentReminder = (appointment, actorRole) => ({
  id: `appointment-${appointment.id}`,
  type: 'appointment',
  priority: getAppointmentPriority(appointment.scheduled_date),
  title: getAppointmentTitle({
    scheduledDate: appointment.scheduled_date,
    patientName: appointment.patient_name,
    actorRole,
  }),
  description:
    actorRole === 'psychologist'
      ? `${appointment.patient_name} - ${String(appointment.scheduled_time).slice(0, 5)}. Estado ${getStatusLabel(appointment.status)}.`
      : `${String(appointment.scheduled_time).slice(0, 5)}. Estado ${getStatusLabel(appointment.status)}.`,
  date: normalizeDateValue(appointment.scheduled_date),
  time: normalizeTimeValue(appointment.scheduled_time),
  patientId: appointment.patient_id ? String(appointment.patient_id) : null,
  action: actorRole === 'psychologist' ? 'open-patient' : 'open-appointments',
});

const mapTaskReminderForPsychologist = (taskSummary) => ({
  id: `task-summary-${taskSummary.patient_id}`,
  type: 'task',
  priority: taskSummary.risk_level === 'high' || Number(taskSummary.pending_count) >= 3 ? 'high' : 'medium',
  title: `${taskSummary.patient_name} tiene ${taskSummary.pending_count} tarea${Number(taskSummary.pending_count) === 1 ? '' : 's'} pendiente${Number(taskSummary.pending_count) === 1 ? '' : 's'}`,
  description: 'Conviene revisarlas en la proxima sesion para mantener el seguimiento activo.',
  date: null,
  time: null,
  patientId: String(taskSummary.patient_id),
  action: 'open-patient',
});

const mapTaskReminderForPatient = (taskSummary) => ({
  id: `task-summary-${taskSummary.patient_id}`,
  type: 'task',
  priority: Number(taskSummary.pending_count) >= 3 ? 'high' : 'medium',
  title: `Tienes ${taskSummary.pending_count} tarea${Number(taskSummary.pending_count) === 1 ? '' : 's'} pendiente${Number(taskSummary.pending_count) === 1 ? '' : 's'}`,
  description: 'Retoma las actividades asignadas para mantener tu seguimiento al dia.',
  date: null,
  time: null,
  patientId: String(taskSummary.patient_id),
  action: 'open-patient',
});

const getPsychologistAppointmentReminders = async (actor) => {
  const result = await db.query(
    `
      SELECT
        a.id,
        a.patient_id,
        p.full_name AS patient_name,
        a.scheduled_date,
        a.scheduled_time,
        a.status
      FROM appointments a
      INNER JOIN psychologist_patient_access spa
        ON spa.patient_id = a.patient_id
      INNER JOIN patients p
        ON p.id = a.patient_id
      WHERE spa.psychologist_user_id = $1
        AND a.status = 'pending'
        AND (
          a.scheduled_date > CURRENT_DATE
          OR (
            a.scheduled_date = CURRENT_DATE
            AND a.scheduled_time + INTERVAL '1 hour' > CURRENT_TIME
          )
        )
      ORDER BY a.scheduled_date ASC, a.scheduled_time ASC, a.id ASC
      LIMIT 4
    `,
    [actor.id],
  );

  return result.rows.map((row) => mapAppointmentReminder(row, actor.role));
};

const getPatientAppointmentReminders = async (actor) => {
  const result = await db.query(
    `
      SELECT
        a.id,
        a.patient_id,
        p.full_name AS patient_name,
        a.scheduled_date,
        a.scheduled_time,
        a.status
      FROM appointments a
      INNER JOIN patients p
        ON p.id = a.patient_id
      WHERE a.patient_id = $1
        AND a.status = 'pending'
        AND (
          a.scheduled_date > CURRENT_DATE
          OR (
            a.scheduled_date = CURRENT_DATE
            AND a.scheduled_time + INTERVAL '1 hour' > CURRENT_TIME
          )
        )
      ORDER BY a.scheduled_date ASC, a.scheduled_time ASC, a.id ASC
      LIMIT 3
    `,
    [actor.patientId],
  );

  return result.rows.map((row) => mapAppointmentReminder(row, actor.role));
};

const getPsychologistTaskReminders = async (actor) => {
  const result = await db.query(
    `
      SELECT
        p.id AS patient_id,
        p.full_name AS patient_name,
        p.risk_level,
        COUNT(pt.id)::int AS pending_count
      FROM patient_tasks pt
      INNER JOIN patients p
        ON p.id = pt.patient_id
      INNER JOIN psychologist_patient_access spa
        ON spa.patient_id = pt.patient_id
      WHERE spa.psychologist_user_id = $1
        AND pt.completed = FALSE
      GROUP BY p.id, p.full_name, p.risk_level
      ORDER BY pending_count DESC, p.full_name ASC
      LIMIT 3
    `,
    [actor.id],
  );

  return result.rows.map(mapTaskReminderForPsychologist);
};

const getPatientTaskReminders = async (actor) => {
  const result = await db.query(
    `
      SELECT
        p.id AS patient_id,
        COUNT(pt.id)::int AS pending_count
      FROM patient_tasks pt
      INNER JOIN patients p
        ON p.id = pt.patient_id
      WHERE pt.patient_id = $1
        AND pt.completed = FALSE
      GROUP BY p.id
    `,
    [actor.patientId],
  );

  return result.rows.map(mapTaskReminderForPatient);
};

const sortReminders = (reminders) => {
  const priorityOrder = { high: 0, medium: 1, low: 2 };

  return [...reminders].sort((left, right) => {
    const priorityDifference = (priorityOrder[left.priority] ?? 9) - (priorityOrder[right.priority] ?? 9);

    if (priorityDifference !== 0) {
      return priorityDifference;
    }

    const leftDateTime = `${left.date || '9999-12-31'}T${left.time || '23:59:59'}`;
    const rightDateTime = `${right.date || '9999-12-31'}T${right.time || '23:59:59'}`;
    return leftDateTime.localeCompare(rightDateTime);
  });
};

export const listMyReminders = async (actor) => {
  ensureAuthenticated(actor);

  if (isPsychologist(actor)) {
    const [appointmentReminders, taskReminders] = await Promise.all([
      getPsychologistAppointmentReminders(actor),
      getPsychologistTaskReminders(actor),
    ]);

    return sortReminders([...appointmentReminders, ...taskReminders]).slice(0, 6);
  }

  if (isPatient(actor)) {
    const [appointmentReminders, taskReminders] = await Promise.all([
      getPatientAppointmentReminders(actor),
      getPatientTaskReminders(actor),
    ]);

    return sortReminders([...appointmentReminders, ...taskReminders]).slice(0, 6);
  }

  return [];
};
