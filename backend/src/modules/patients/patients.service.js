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
    ),
    '[]'::json
  ) AS tasks
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
  sessions: Array.isArray(row.sessions) ? row.sessions.map(mapSessionRow) : [],
});

const getPatientBaseQuery = (includeSessions = false) => `
  SELECT
    ${patientSelectColumns}
    ${includeSessions ? psychologistSessionSelectColumn : ''}
  FROM patients p
`;

const mapPatientResult = (result) => (result.rows[0] ? mapPatientRow(result.rows[0]) : null);

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

const ensureAppointmentBelongsToPatient = async (appointmentId, patientId) => {
  if (!appointmentId) {
    return;
  }

  const result = await db.query(
    `
      SELECT 1
      FROM appointments
      WHERE id = $1
        AND patient_id = $2
      LIMIT 1
    `,
    [appointmentId, patientId],
  );

  if (!result.rows[0]) {
    const error = new Error('The selected appointment does not belong to this patient');
    error.status = 400;
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

export const createPatientTask = async (patientId, payload, actor) => {
  ensurePsychologist(actor);

  const patient = await getPatientById(patientId, actor);

  if (!patient) {
    return null;
  }

  const result = await db.query(
    `
      INSERT INTO patient_tasks (
        patient_id,
        text,
        completed
      )
      VALUES ($1, $2, $3)
      RETURNING id, text, completed
    `,
    [patientId, payload.text.trim(), false],
  );

  return mapTaskRow(result.rows[0]);
};

export const updatePatientTask = async (patientId, taskId, payload, actor) => {
  const patient = await getPatientById(patientId, actor);

  if (!patient) {
    return null;
  }

  const currentTaskResult = await db.query(
    `
      SELECT id, patient_id, text, completed
      FROM patient_tasks
      WHERE patient_id = $1 AND id = $2
      LIMIT 1
    `,
    [patientId, taskId],
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
        text = $3,
        completed = $4,
        updated_at = NOW()
      WHERE patient_id = $1 AND id = $2
      RETURNING id, text, completed
    `,
    [patientId, taskId, nextText, nextCompleted],
  );

  return mapTaskRow(result.rows[0]);
};

export const deletePatientTask = async (patientId, taskId, actor) => {
  ensurePsychologist(actor);

  const patient = await getPatientById(patientId, actor);

  if (!patient) {
    return false;
  }

  const result = await db.query(
    `
      DELETE FROM patient_tasks
      WHERE patient_id = $1 AND id = $2
    `,
    [patientId, taskId],
  );

  return result.rowCount > 0;
};

export const createPatientSession = async (patientId, payload, actor) => {
  ensurePsychologist(actor);

  const patient = await getPatientById(patientId, actor);

  if (!patient) {
    return null;
  }

  await ensureAppointmentBelongsToPatient(payload.appointmentId ? Number(payload.appointmentId) : null, patientId);

  const result = await db.query(
    `
      INSERT INTO patient_sessions (
        patient_id,
        appointment_id,
        created_by_user_id,
        session_date,
        note_format,
        content
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING
        id,
        appointment_id AS "appointmentId",
        session_date AS "sessionDate",
        note_format AS "noteFormat",
        content,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `,
    [
      patientId,
      payload.appointmentId ? Number(payload.appointmentId) : null,
      actor.id,
      payload.sessionDate,
      payload.noteFormat,
      payload.content.trim(),
    ],
  );

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
  const nextSessionDate = Object.prototype.hasOwnProperty.call(payload, 'sessionDate') ? payload.sessionDate : normalizeDateValue(currentSession.sessionDate);
  const nextNoteFormat = Object.prototype.hasOwnProperty.call(payload, 'noteFormat') ? payload.noteFormat : currentSession.noteFormat;
  const nextContent = Object.prototype.hasOwnProperty.call(payload, 'content') ? payload.content.trim() : currentSession.content;
  const nextAppointmentId = Object.prototype.hasOwnProperty.call(payload, 'appointmentId')
    ? (payload.appointmentId ? Number(payload.appointmentId) : null)
    : currentSession.appointmentId;

  await ensureAppointmentBelongsToPatient(nextAppointmentId, patientId);

  const result = await db.query(
    `
      UPDATE patient_sessions
      SET
        appointment_id = $3,
        session_date = $4,
        note_format = $5,
        content = $6,
        updated_at = NOW()
      WHERE patient_id = $1 AND id = $2
      RETURNING
        id,
        appointment_id AS "appointmentId",
        session_date AS "sessionDate",
        note_format AS "noteFormat",
        content,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `,
    [patientId, sessionId, nextAppointmentId, nextSessionDate, nextNoteFormat, nextContent],
  );

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
