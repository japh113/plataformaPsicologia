import db from '../../config/db.js';
import { buildPatientEntity } from './patients.model.js';
import { buildPatientAccessScope, ensurePsychologist, isPsychologist } from '../auth/auth.permissions.js';

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

const patientSelectColumns = `
  p.id,
  p.first_name,
  p.last_name,
  p.full_name,
  p.email,
  p.phone,
  p.risk_level,
  p.status,
  p.last_session_date,
  p.notes,
  p.age,
  p.reason_for_consultation,
  COALESCE(
    (
      SELECT json_agg(
        json_build_object(
          'id', pt.id,
          'text', pt.text,
          'completed', pt.completed
        )
        ORDER BY pt.created_at ASC, pt.id ASC
      )
      FROM patient_tasks pt
      WHERE pt.patient_id = p.id
        AND pt.kind = 'task'
    ),
    '[]'::json
  ) AS tasks,
  COALESCE(
    (
      SELECT json_agg(
        json_build_object(
          'id', pt.id,
          'text', pt.text,
          'completed', pt.completed
        )
        ORDER BY pt.created_at ASC, pt.id ASC
      )
      FROM patient_tasks pt
      WHERE pt.patient_id = p.id
        AND pt.kind = 'objective'
    ),
    '[]'::json
  ) AS objectives
`;

const psychologistSessionSelectColumn = `,
  COALESCE(
    (
      SELECT json_agg(
        json_build_object(
          'id', ps.id,
          'appointmentId', ps.appointment_id,
          'sessionDate', ps.session_date,
          'noteFormat', ps.note_format,
          'sessionObjective', ps.session_objective,
          'clinicalObservations', ps.clinical_observations,
          'nextSteps', ps.next_steps,
          'content', ps.content,
          'createdAt', ps.created_at,
          'updatedAt', ps.updated_at
        )
        ORDER BY ps.session_date DESC, ps.created_at DESC, ps.id DESC
      )
      FROM patient_sessions ps
      WHERE ps.patient_id = p.id
    ),
    '[]'::json
  ) AS sessions
`;

const mapTaskRow = (task) => ({
  id: String(task.id),
  text: task.text,
  completed: Boolean(task.completed),
});

const mapSessionRow = (session) => ({
  id: String(session.id),
  appointmentId: session.appointmentId === null || typeof session.appointmentId === 'undefined' ? null : String(session.appointmentId),
  sessionDate: normalizeDateValue(session.sessionDate),
  noteFormat: session.noteFormat || 'simple',
  sessionObjective: session.sessionObjective || '',
  clinicalObservations: session.clinicalObservations || '',
  nextSteps: session.nextSteps || '',
  content: session.content || '',
  createdAt: session.createdAt,
  updatedAt: session.updatedAt,
});

const mapPatientRow = (row) => ({
  id: String(row.id),
  firstName: row.first_name,
  lastName: row.last_name,
  fullName: row.full_name,
  email: row.email,
  phone: row.phone,
  riskLevel: row.risk_level,
  status: row.status,
  lastSessionDate: normalizeDateValue(row.last_session_date),
  notes: row.notes,
  age: row.age,
  reasonForConsultation: row.reason_for_consultation,
  tasks: Array.isArray(row.tasks) ? row.tasks.map(mapTaskRow) : [],
  objectives: Array.isArray(row.objectives) ? row.objectives.map(mapTaskRow) : [],
  sessions: Array.isArray(row.sessions) ? row.sessions.map(mapSessionRow) : [],
});

const getPatientBaseQuery = (includeSessions = false) => `
  SELECT
    ${patientSelectColumns}
    ${includeSessions ? psychologistSessionSelectColumn : ''}
  FROM patients p
`;

const mapPatientResult = (result) => (result.rows[0] ? mapPatientRow(result.rows[0]) : null);
const normalizeOptionalText = (value) => (typeof value === 'string' ? value.trim() : '');

export const getAllPatients = async (actor) => {
  const includeSessions = isPsychologist(actor);
  const accessScope = buildPatientAccessScope(actor, 'p.id');
  const result = await db.query(
    `
      ${getPatientBaseQuery(includeSessions)}
      WHERE ${accessScope.clause}
      ORDER BY p.created_at DESC, p.full_name ASC
    `,
    accessScope.params,
  );

  return result.rows.map(mapPatientRow);
};

export const getPatientById = async (id, actor) => {
  const includeSessions = isPsychologist(actor);
  const accessScope = buildPatientAccessScope(actor, 'p.id', 2);
  const result = await db.query(
    `
      ${getPatientBaseQuery(includeSessions)}
      WHERE p.id = $1
        AND ${accessScope.clause}
      LIMIT 1
    `,
    [id, ...accessScope.params],
  );

  return mapPatientResult(result);
};

const refreshPatientLastSessionDate = async (patientId) => {
  await db.query(
    `
      UPDATE patients
      SET
        last_session_date = (
          SELECT MAX(ps.session_date)
          FROM patient_sessions ps
          WHERE ps.patient_id = $1
        ),
        updated_at = NOW()
      WHERE id = $1
    `,
    [patientId],
  );
};

const markAppointmentAsCompleted = async (appointmentId) => {
  await db.query(
    `
      UPDATE appointments
      SET
        status = 'completed',
        updated_at = NOW()
      WHERE id = $1
        AND status <> 'completed'
    `,
    [appointmentId],
  );
};

const ensureAppointmentBelongsToPatient = async (appointmentId, patientId) => {
  if (!appointmentId) {
    const error = new Error('Debes seleccionar una cita para registrar la sesion');
    error.status = 400;
    throw error;
  }

  const result = await db.query(
    `
      SELECT
        id,
        scheduled_date,
        scheduled_time,
        status
      FROM appointments
      WHERE id = $1
        AND patient_id = $2
      LIMIT 1
    `,
    [appointmentId, patientId],
  );

  if (!result.rows[0]) {
    const error = new Error('La cita seleccionada no pertenece a este paciente');
    error.status = 400;
    throw error;
  }

  return result.rows[0];
};

const ensureAppointmentSessionUniqueness = async (appointmentId, excludeSessionId = null) => {
  const result = await db.query(
    `
      SELECT id
      FROM patient_sessions
      WHERE appointment_id = $1
        AND ($2::bigint IS NULL OR id <> $2)
      LIMIT 1
    `,
    [appointmentId, excludeSessionId],
  );

  if (result.rows[0]) {
    const error = new Error('Esa cita ya tiene una sesion registrada');
    error.status = 409;
    throw error;
  }
};

const ensureAppointmentEligibleForSession = (appointment) => {
  if (!appointment) {
    return;
  }

  if (appointment.status !== 'completed') {
    const error = new Error('Solo puedes registrar una sesion desde una cita completada.');
    error.status = 409;
    throw error;
  }

  if (normalizeDateValue(appointment.scheduled_date) > getTodayDateString()) {
    const error = new Error('No puedes registrar una sesion para una cita futura.');
    error.status = 409;
    throw error;
  }
};

export const createPatient = async (payload, actor) => {
  ensurePsychologist(actor);

  const patient = buildPatientEntity(payload, String(Date.now()));
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    await client.query(
      `
        INSERT INTO patients (
          id,
          first_name,
          last_name,
          full_name,
          email,
          phone,
          risk_level,
          status,
          last_session_date,
          notes,
          age,
          reason_for_consultation
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `,
      [
        patient.id,
        patient.firstName,
        patient.lastName,
        patient.fullName,
        patient.email,
        patient.phone,
        patient.riskLevel,
        patient.status,
        patient.lastSessionDate,
        patient.notes,
        patient.age,
        patient.reasonForConsultation,
      ],
    );

    await client.query(
      `
        INSERT INTO psychologist_patient_access (
          psychologist_user_id,
          patient_id
        )
        VALUES ($1, $2)
        ON CONFLICT (psychologist_user_id, patient_id) DO NOTHING
      `,
      [actor.id, patient.id],
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return getPatientById(patient.id, actor);
};

export const updatePatient = async (id, payload, actor) => {
  ensurePsychologist(actor);

  const currentPatient = await getPatientById(id, actor);

  if (!currentPatient) {
    return null;
  }

  const updatedPatient = buildPatientEntity({ ...currentPatient, ...payload }, id);

  await db.query(
    `
      UPDATE patients
      SET
        first_name = $2,
        last_name = $3,
        full_name = $4,
        email = $5,
        phone = $6,
        risk_level = $7,
        status = $8,
        last_session_date = $9,
        notes = $10,
        age = $11,
        reason_for_consultation = $12,
        updated_at = NOW()
      WHERE id = $1
    `,
    [
      id,
      updatedPatient.firstName,
      updatedPatient.lastName,
      updatedPatient.fullName,
      updatedPatient.email,
      updatedPatient.phone,
      updatedPatient.riskLevel,
      updatedPatient.status,
      updatedPatient.lastSessionDate,
      updatedPatient.notes,
      updatedPatient.age,
      updatedPatient.reasonForConsultation,
    ],
  );

  return getPatientById(id, actor);
};

export const deletePatient = async (id, actor) => {
  ensurePsychologist(actor);

  const accessiblePatient = await getPatientById(id, actor);

  if (!accessiblePatient) {
    return false;
  }

  const result = await db.query('DELETE FROM patients WHERE id = $1', [id]);
  return result.rowCount > 0;
};

const createPatientChecklistItem = async (patientId, payload, actor, kind) => {
  ensurePsychologist(actor);

  const patient = await getPatientById(patientId, actor);

  if (!patient) {
    return null;
  }

  const result = await db.query(
    `
      INSERT INTO patient_tasks (
        patient_id,
        kind,
        text,
        completed
      )
      VALUES ($1, $2, $3, $4)
      RETURNING id, text, completed
    `,
    [patientId, kind, payload.text.trim(), false],
  );

  return mapTaskRow(result.rows[0]);
};

const updatePatientChecklistItem = async (patientId, taskId, payload, actor, kind) => {
  const patient = await getPatientById(patientId, actor);

  if (!patient) {
    return null;
  }

  const currentTaskResult = await db.query(
    `
      SELECT id, patient_id, text, completed
      FROM patient_tasks
      WHERE patient_id = $1 AND id = $2 AND kind = $3
      LIMIT 1
    `,
    [patientId, taskId, kind],
  );

  if (!currentTaskResult.rows[0]) {
    return null;
  }

  const currentTask = currentTaskResult.rows[0];
  const nextText =
    Object.prototype.hasOwnProperty.call(payload, 'text') && typeof payload.text === 'string'
      ? payload.text.trim()
      : currentTask.text;
  const nextCompleted =
    Object.prototype.hasOwnProperty.call(payload, 'completed') && typeof payload.completed === 'boolean'
      ? payload.completed
      : currentTask.completed;

  const result = await db.query(
    `
      UPDATE patient_tasks
      SET
        text = $4,
        completed = $5,
        updated_at = NOW()
      WHERE patient_id = $1 AND id = $2 AND kind = $3
      RETURNING id, text, completed
    `,
    [patientId, taskId, kind, nextText, nextCompleted],
  );

  return mapTaskRow(result.rows[0]);
};

const deletePatientChecklistItem = async (patientId, taskId, actor, kind) => {
  ensurePsychologist(actor);

  const patient = await getPatientById(patientId, actor);

  if (!patient) {
    return false;
  }

  const result = await db.query(
    `
      DELETE FROM patient_tasks
      WHERE patient_id = $1 AND id = $2 AND kind = $3
    `,
    [patientId, taskId, kind],
  );

  return result.rowCount > 0;
};

export const createPatientTask = async (patientId, payload, actor) => createPatientChecklistItem(patientId, payload, actor, 'task');
export const updatePatientTask = async (patientId, taskId, payload, actor) => updatePatientChecklistItem(patientId, taskId, payload, actor, 'task');
export const deletePatientTask = async (patientId, taskId, actor) => deletePatientChecklistItem(patientId, taskId, actor, 'task');
export const createPatientObjective = async (patientId, payload, actor) => createPatientChecklistItem(patientId, payload, actor, 'objective');
export const updatePatientObjective = async (patientId, objectiveId, payload, actor) => updatePatientChecklistItem(patientId, objectiveId, payload, actor, 'objective');
export const deletePatientObjective = async (patientId, objectiveId, actor) => deletePatientChecklistItem(patientId, objectiveId, actor, 'objective');

export const createPatientSession = async (patientId, payload, actor) => {
  ensurePsychologist(actor);

  const patient = await getPatientById(patientId, actor);

  if (!patient) {
    return null;
  }

  const appointment = await ensureAppointmentBelongsToPatient(payload.appointmentId ? Number(payload.appointmentId) : null, patientId);
  ensureAppointmentEligibleForSession(appointment);
  await ensureAppointmentSessionUniqueness(Number(appointment.id));

  const result = await db.query(
    `
      INSERT INTO patient_sessions (
        patient_id,
        appointment_id,
        created_by_user_id,
        session_date,
        note_format,
        session_objective,
        clinical_observations,
        next_steps,
        content
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING
        id,
        appointment_id AS "appointmentId",
        session_date AS "sessionDate",
        note_format AS "noteFormat",
        session_objective AS "sessionObjective",
        clinical_observations AS "clinicalObservations",
        next_steps AS "nextSteps",
        content,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `,
    [
      patientId,
      Number(appointment.id),
      actor.id,
      normalizeDateValue(appointment.scheduled_date),
      payload.noteFormat,
      normalizeOptionalText(payload.sessionObjective),
      normalizeOptionalText(payload.clinicalObservations),
      normalizeOptionalText(payload.nextSteps),
      payload.content.trim(),
    ],
  );

  await markAppointmentAsCompleted(Number(appointment.id));
  await refreshPatientLastSessionDate(patientId);
  return mapSessionRow(result.rows[0]);
};

export const updatePatientSession = async (patientId, sessionId, payload, actor) => {
  ensurePsychologist(actor);

  const patient = await getPatientById(patientId, actor);

  if (!patient) {
    return null;
  }

  const currentSessionResult = await db.query(
    `
      SELECT
        id,
        appointment_id AS "appointmentId",
        session_date AS "sessionDate",
        note_format AS "noteFormat",
        session_objective AS "sessionObjective",
        clinical_observations AS "clinicalObservations",
        next_steps AS "nextSteps",
        content,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM patient_sessions
      WHERE patient_id = $1 AND id = $2
      LIMIT 1
    `,
    [patientId, sessionId],
  );

  if (!currentSessionResult.rows[0]) {
    return null;
  }

  const currentSession = currentSessionResult.rows[0];
  const nextNoteFormat = Object.prototype.hasOwnProperty.call(payload, 'noteFormat') ? payload.noteFormat : currentSession.noteFormat;
  const nextContent = Object.prototype.hasOwnProperty.call(payload, 'content') ? payload.content.trim() : currentSession.content;
  const nextSessionObjective = Object.prototype.hasOwnProperty.call(payload, 'sessionObjective')
    ? normalizeOptionalText(payload.sessionObjective)
    : currentSession.sessionObjective;
  const nextClinicalObservations = Object.prototype.hasOwnProperty.call(payload, 'clinicalObservations')
    ? normalizeOptionalText(payload.clinicalObservations)
    : currentSession.clinicalObservations;
  const nextSteps = Object.prototype.hasOwnProperty.call(payload, 'nextSteps')
    ? normalizeOptionalText(payload.nextSteps)
    : currentSession.nextSteps;
  const nextAppointmentId = Object.prototype.hasOwnProperty.call(payload, 'appointmentId')
    ? Number(payload.appointmentId)
    : currentSession.appointmentId;

  const appointment = await ensureAppointmentBelongsToPatient(nextAppointmentId, patientId);
  ensureAppointmentEligibleForSession(appointment);
  await ensureAppointmentSessionUniqueness(Number(appointment.id), Number(sessionId));

  const result = await db.query(
    `
      UPDATE patient_sessions
      SET
        appointment_id = $3,
        session_date = $4,
        note_format = $5,
        session_objective = $6,
        clinical_observations = $7,
        next_steps = $8,
        content = $9,
        updated_at = NOW()
      WHERE patient_id = $1 AND id = $2
      RETURNING
        id,
        appointment_id AS "appointmentId",
        session_date AS "sessionDate",
        note_format AS "noteFormat",
        session_objective AS "sessionObjective",
        clinical_observations AS "clinicalObservations",
        next_steps AS "nextSteps",
        content,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `,
    [
      patientId,
      sessionId,
      Number(appointment.id),
      normalizeDateValue(appointment.scheduled_date),
      nextNoteFormat,
      nextSessionObjective,
      nextClinicalObservations,
      nextSteps,
      nextContent,
    ],
  );

  await markAppointmentAsCompleted(Number(appointment.id));
  await refreshPatientLastSessionDate(patientId);
  return mapSessionRow(result.rows[0]);
};

export const deletePatientSession = async (patientId, sessionId, actor) => {
  ensurePsychologist(actor);

  const patient = await getPatientById(patientId, actor);

  if (!patient) {
    return false;
  }

  const result = await db.query(
    `
      DELETE FROM patient_sessions
      WHERE patient_id = $1 AND id = $2
    `,
    [patientId, sessionId],
  );

  if (result.rowCount > 0) {
    await refreshPatientLastSessionDate(patientId);
    return true;
  }

  return false;
};
