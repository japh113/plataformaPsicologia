import db from '../../config/db.js';
import { buildPatientEntity } from './patients.model.js';
import { buildPatientAccessScope, ensurePsychologist } from '../auth/auth.permissions.js';

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

const mapTaskRow = (task) => ({
  id: String(task.id),
  text: task.text,
  completed: Boolean(task.completed),
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
});

const getPatientBaseQuery = `
  SELECT
    ${patientSelectColumns}
  FROM patients p
`;

const mapPatientResult = (result) => (result.rows[0] ? mapPatientRow(result.rows[0]) : null);

export const getAllPatients = async (actor) => {
  const accessScope = buildPatientAccessScope(actor, 'p.id');
  const result = await db.query(
    `
      ${getPatientBaseQuery}
      WHERE ${accessScope.clause}
      ORDER BY p.created_at DESC, p.full_name ASC
    `,
    accessScope.params,
  );

  return result.rows.map(mapPatientRow);
};

export const getPatientById = async (id, actor) => {
  const accessScope = buildPatientAccessScope(actor, 'p.id', 2);
  const result = await db.query(
    `
      ${getPatientBaseQuery}
      WHERE p.id = $1
        AND ${accessScope.clause}
      LIMIT 1
    `,
    [id, ...accessScope.params],
  );

  return mapPatientResult(result);
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
