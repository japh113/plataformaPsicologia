import db from '../../config/db.js';
import { buildPatientEntity, buildPatientInterviewEntity } from './patients.model.js';
import {
  buildPatientAccessScope,
  createForbiddenError,
  ensurePsychologist,
  isPatient,
  isPsychologist,
} from '../auth/auth.permissions.js';
import { logAuditEvent } from '../../utils/audit.js';

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
  p.last_clinical_note_date,
  p.notes,
  p.age,
  p.reason_for_consultation,
  EXISTS (
    SELECT 1
    FROM patient_intakes pi
    WHERE pi.patient_id = p.id
  ) AS interview_completed,
  (
    SELECT json_build_object(
      'birthDate', pi.birth_date,
      'birthPlace', pi.birth_place,
      'occupation', pi.occupation,
      'hobbies', pi.hobbies,
      'maritalStatus', pi.marital_status,
      'familyMembers', pi.family_members,
      'livesWith', pi.lives_with,
      'physicalIllnesses', pi.physical_illnesses,
      'insomnia', pi.insomnia,
      'nightmares', pi.nightmares,
      'fearsOrPhobias', pi.fears_or_phobias,
      'accidents', pi.accidents,
      'alcoholUse', pi.alcohol_use,
      'tobaccoUse', pi.tobacco_use,
      'drugUse', pi.drug_use,
      'psychologicalAbuse', pi.psychological_abuse,
      'physicalAbuse', pi.physical_abuse,
      'deathWish', pi.death_wish,
      'suicideAttempts', pi.suicide_attempts,
      'completedAt', pi.completed_at,
      'createdAt', pi.created_at,
      'updatedAt', pi.updated_at
    )
    FROM patient_intakes pi
    WHERE pi.patient_id = p.id
    LIMIT 1
  ) AS interview,
  COALESCE(
    (
      SELECT json_agg(
        json_build_object(
          'id', pt.id,
          'text', pt.text,
          'completed', pt.completed,
          'clinicalNoteId', pt.clinical_note_id,
          'clinicalNoteDate', pcn.clinical_note_date,
          'clinicalNoteObjective', pcn.clinical_note_objective
        )
        ORDER BY pcn.clinical_note_date DESC NULLS LAST, pt.created_at ASC, pt.id ASC
      )
      FROM patient_tasks pt
      LEFT JOIN patient_clinical_notes pcn
        ON pcn.id = pt.clinical_note_id
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

const psychologistClinicalNoteSelectColumn = `,
  COALESCE(
    (
      SELECT json_agg(
        json_build_object(
          'id', pcn.id,
          'appointmentId', pcn.appointment_id,
          'clinicalNoteDate', pcn.clinical_note_date,
          'noteFormat', pcn.note_format,
          'clinicalNoteObjective', pcn.clinical_note_objective,
          'clinicalObservations', pcn.clinical_observations,
          'nextSteps', pcn.next_steps,
          'content', pcn.content,
          'createdAt', pcn.created_at,
          'updatedAt', pcn.updated_at
        )
        ORDER BY pcn.clinical_note_date DESC, pcn.created_at DESC, pcn.id DESC
      )
      FROM patient_clinical_notes pcn
      WHERE pcn.patient_id = p.id
    ),
    '[]'::json
  ) AS clinical_notes
`;

const mapTaskRow = (task) => ({
  id: String(task.id),
  text: task.text,
  completed: Boolean(task.completed),
  clinicalNoteId:
    task.clinicalNoteId === null || typeof task.clinicalNoteId === 'undefined'
      ? (
          task.sessionId === null || typeof task.sessionId === 'undefined'
            ? (task.clinical_note_id === null || typeof task.clinical_note_id === 'undefined' ? null : String(task.clinical_note_id))
            : String(task.sessionId)
        )
      : String(task.clinicalNoteId),
  clinicalNoteDate: normalizeDateValue(task.clinicalNoteDate ?? task.sessionDate),
  clinicalNoteObjective: task.clinicalNoteObjective || task.sessionObjective || '',
});

const mapClinicalNoteRow = (clinicalNote) => ({
  id: String(clinicalNote.id),
  appointmentId: clinicalNote.appointmentId === null || typeof clinicalNote.appointmentId === 'undefined' ? null : String(clinicalNote.appointmentId),
  clinicalNoteDate: normalizeDateValue(clinicalNote.clinicalNoteDate ?? clinicalNote.sessionDate),
  noteFormat: clinicalNote.noteFormat || 'simple',
  clinicalNoteObjective: clinicalNote.clinicalNoteObjective || clinicalNote.sessionObjective || '',
  clinicalObservations: clinicalNote.clinicalObservations || '',
  nextSteps: clinicalNote.nextSteps || '',
  content: clinicalNote.content || '',
  createdAt: clinicalNote.createdAt,
  updatedAt: clinicalNote.updatedAt,
});

const mapInterviewRow = (interview) => {
  if (!interview) {
    return null;
  }

  return {
    birthDate: normalizeDateValue(interview.birthDate),
    birthPlace: interview.birthPlace || '',
    occupation: interview.occupation || '',
    hobbies: interview.hobbies || '',
    maritalStatus: interview.maritalStatus || '',
    familyMembers: interview.familyMembers || '',
    livesWith: interview.livesWith || '',
    physicalIllnesses: interview.physicalIllnesses || '',
    insomnia: Boolean(interview.insomnia),
    nightmares: Boolean(interview.nightmares),
    fearsOrPhobias: Boolean(interview.fearsOrPhobias),
    accidents: Boolean(interview.accidents),
    alcoholUse: Boolean(interview.alcoholUse),
    tobaccoUse: Boolean(interview.tobaccoUse),
    drugUse: Boolean(interview.drugUse),
    psychologicalAbuse: Boolean(interview.psychologicalAbuse),
    physicalAbuse: Boolean(interview.physicalAbuse),
    deathWish: Boolean(interview.deathWish),
    suicideAttempts: Boolean(interview.suicideAttempts),
    completedAt: interview.completedAt || null,
    createdAt: interview.createdAt || null,
    updatedAt: interview.updatedAt || null,
  };
};

const mapPatientRow = (row) => ({
  id: String(row.id),
  firstName: row.first_name,
  lastName: row.last_name,
  fullName: row.full_name,
  email: row.email,
  phone: row.phone,
  riskLevel: row.risk_level,
  status: row.status,
  lastClinicalNoteDate: normalizeDateValue(row.last_clinical_note_date),
  notes: row.notes,
  age: row.age,
  reasonForConsultation: row.reason_for_consultation,
  interviewCompleted: Boolean(row.interview_completed),
  interview: mapInterviewRow(row.interview),
  tasks: Array.isArray(row.tasks) ? row.tasks.map(mapTaskRow) : [],
  objectives: Array.isArray(row.objectives) ? row.objectives.map(mapTaskRow) : [],
  clinicalNotes: Array.isArray(row.clinical_notes) ? row.clinical_notes.map(mapClinicalNoteRow) : [],
});

const getPatientBaseQuery = (includeClinicalNotes = false) => `
  SELECT
    ${patientSelectColumns}
    ${includeClinicalNotes ? psychologistClinicalNoteSelectColumn : ''}
  FROM patients p
`;

const mapPatientResult = (result) => (result.rows[0] ? mapPatientRow(result.rows[0]) : null);
const normalizeOptionalText = (value) => (typeof value === 'string' ? value.trim() : '');

const ensureClinicalNoteBelongsToPatient = async (clinicalNoteId, patientId) => {
  if (!clinicalNoteId) {
    const error = new Error('Debes vincular la tarea a una nota clinica.');
    error.status = 400;
    throw error;
  }

  const result = await db.query(
    `
      SELECT
        id,
        clinical_note_date,
        clinical_note_objective
      FROM patient_clinical_notes
      WHERE id = $1
        AND patient_id = $2
      LIMIT 1
    `,
    [clinicalNoteId, patientId],
  );

  if (!result.rows[0]) {
    const error = new Error('La nota clinica seleccionada no pertenece a este paciente.');
    error.status = 400;
    throw error;
  }

  return result.rows[0];
};

const normalizeClinicalNoteTaskPayloads = (tasks = []) =>
  tasks.map((task) => ({
    id: task.id ? Number(task.id) : null,
    text: String(task.text || '').trim(),
    completed: typeof task.completed === 'boolean' ? task.completed : false,
  }));

const syncClinicalNoteTasks = async (client, patientId, clinicalNoteId, tasks) => {
  if (!Array.isArray(tasks)) {
    return;
  }

  const normalizedTasks = normalizeClinicalNoteTaskPayloads(tasks);
  const existingTasksResult = await client.query(
    `
      SELECT id
      FROM patient_tasks
      WHERE patient_id = $1
        AND clinical_note_id = $2
        AND kind = 'task'
    `,
    [patientId, clinicalNoteId],
  );

  const existingTaskIds = new Set(existingTasksResult.rows.map((row) => Number(row.id)));
  const incomingTaskIds = new Set(normalizedTasks.filter((task) => task.id).map((task) => Number(task.id)));

  const taskIdsToDelete = [...existingTaskIds].filter((taskId) => !incomingTaskIds.has(taskId));

  if (taskIdsToDelete.length > 0) {
    await client.query(
      `
        DELETE FROM patient_tasks
        WHERE patient_id = $1
          AND clinical_note_id = $2
          AND kind = 'task'
          AND id = ANY($3::bigint[])
      `,
      [patientId, clinicalNoteId, taskIdsToDelete],
    );
  }

  for (const task of normalizedTasks) {
    if (task.id && existingTaskIds.has(task.id)) {
      await client.query(
        `
          UPDATE patient_tasks
          SET
            text = $4,
            completed = $5,
            updated_at = NOW()
          WHERE patient_id = $1
            AND clinical_note_id = $2
            AND kind = 'task'
            AND id = $3
        `,
        [patientId, clinicalNoteId, task.id, task.text, task.completed],
      );
      continue;
    }

    await client.query(
      `
        INSERT INTO patient_tasks (
          patient_id,
          clinical_note_id,
          kind,
          text,
          completed
        )
        VALUES ($1, $2, 'task', $3, $4)
      `,
      [patientId, clinicalNoteId, task.text, task.completed],
    );
  }
};

const getPatientInterviewById = async (patientId) => {
  const result = await db.query(
    `
      SELECT json_build_object(
        'birthDate', pi.birth_date,
        'birthPlace', pi.birth_place,
        'occupation', pi.occupation,
        'hobbies', pi.hobbies,
        'maritalStatus', pi.marital_status,
        'familyMembers', pi.family_members,
        'livesWith', pi.lives_with,
        'physicalIllnesses', pi.physical_illnesses,
        'insomnia', pi.insomnia,
        'nightmares', pi.nightmares,
        'fearsOrPhobias', pi.fears_or_phobias,
        'accidents', pi.accidents,
        'alcoholUse', pi.alcohol_use,
        'tobaccoUse', pi.tobacco_use,
        'drugUse', pi.drug_use,
        'psychologicalAbuse', pi.psychological_abuse,
        'physicalAbuse', pi.physical_abuse,
        'deathWish', pi.death_wish,
        'suicideAttempts', pi.suicide_attempts,
        'completedAt', pi.completed_at,
        'createdAt', pi.created_at,
        'updatedAt', pi.updated_at
      ) AS interview
      FROM patient_intakes pi
      WHERE pi.patient_id = $1
      LIMIT 1
    `,
    [patientId],
  );

  return mapInterviewRow(result.rows[0]?.interview || null);
};

export const getAllPatients = async (actor) => {
  const includeClinicalNotes = isPsychologist(actor);
  const accessScope = buildPatientAccessScope(actor, 'p.id');
  const result = await db.query(
    `
      ${getPatientBaseQuery(includeClinicalNotes)}
      WHERE ${accessScope.clause}
      ORDER BY p.created_at DESC, p.full_name ASC
    `,
    accessScope.params,
  );

  return result.rows.map(mapPatientRow);
};

export const getPatientById = async (id, actor) => {
  const includeClinicalNotes = isPsychologist(actor);
  const accessScope = buildPatientAccessScope(actor, 'p.id', 2);
  const result = await db.query(
    `
      ${getPatientBaseQuery(includeClinicalNotes)}
      WHERE p.id = $1
        AND ${accessScope.clause}
      LIMIT 1
    `,
    [id, ...accessScope.params],
  );

  return mapPatientResult(result);
};

const refreshPatientLastClinicalNoteDate = async (patientId) => {
  await db.query(
    `
      UPDATE patients
      SET
        last_clinical_note_date = (
          SELECT MAX(pcn.clinical_note_date)
          FROM patient_clinical_notes pcn
          WHERE pcn.patient_id = $1
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
    const error = new Error('Debes seleccionar una cita para registrar la nota clinica');
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

const ensureAppointmentClinicalNoteUniqueness = async (appointmentId, excludeClinicalNoteId = null) => {
  const result = await db.query(
    `
      SELECT id
      FROM patient_clinical_notes
      WHERE appointment_id = $1
        AND ($2::bigint IS NULL OR id <> $2)
      LIMIT 1
    `,
    [appointmentId, excludeClinicalNoteId],
  );

  if (result.rows[0]) {
    const error = new Error('Esa cita ya tiene una nota clinica registrada');
    error.status = 409;
    throw error;
  }
};

const ensureAppointmentEligibleForClinicalNote = (appointment) => {
  if (!appointment) {
    return;
  }

  if (appointment.status !== 'completed') {
    const error = new Error('Solo puedes registrar una nota clinica desde una cita completada.');
    error.status = 409;
    throw error;
  }

  if (normalizeDateValue(appointment.scheduled_date) > getTodayDateString()) {
    const error = new Error('No puedes registrar una nota clinica para una cita futura.');
    error.status = 409;
    throw error;
  }
};

const ensurePatientInterviewWriteIsAllowed = ({ actor, currentInterview }) => {
  if (isPatient(actor) && currentInterview) {
    throw createForbiddenError('La entrevista ya fue completada y no puede ser editada por el paciente.');
  }
};

export const __testables = {
  ensureAppointmentEligibleForClinicalNote,
  ensurePatientInterviewWriteIsAllowed,
  getTodayDateString,
  mapInterviewRow,
  mapClinicalNoteRow,
  mapTaskRow,
  normalizeClinicalNoteTaskPayloads,
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
          last_clinical_note_date,
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
        patient.lastClinicalNoteDate,
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

    await logAuditEvent(client, {
      actorUserId: actor.id,
      actorRole: actor.role,
      action: 'patient_created',
      entityType: 'patient',
      entityId: patient.id,
      patientId: patient.id,
      metadata: {
        riskLevel: patient.riskLevel,
        status: patient.status,
      },
    });

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
        last_clinical_note_date = $9,
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
      updatedPatient.lastClinicalNoteDate,
      updatedPatient.notes,
      updatedPatient.age,
      updatedPatient.reasonForConsultation,
    ],
  );

  await logAuditEvent(db, {
    actorUserId: actor.id,
    actorRole: actor.role,
    action: 'patient_updated',
    entityType: 'patient',
    entityId: id,
    patientId: id,
    metadata: {
      riskLevel: updatedPatient.riskLevel,
      status: updatedPatient.status,
    },
  });

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

export const upsertPatientInterview = async (patientId, payload, actor) => {
  const patient = await getPatientById(patientId, actor);

  if (!patient) {
    return null;
  }

  const currentInterview = await getPatientInterviewById(patientId);
  ensurePatientInterviewWriteIsAllowed({ actor, currentInterview });

  const interview = buildPatientInterviewEntity(payload);

  await db.query(
    `
      INSERT INTO patient_intakes (
        patient_id,
        birth_date,
        birth_place,
        occupation,
        hobbies,
        marital_status,
        family_members,
        lives_with,
        physical_illnesses,
        insomnia,
        nightmares,
        fears_or_phobias,
        accidents,
        alcohol_use,
        tobacco_use,
        drug_use,
        psychological_abuse,
        physical_abuse,
        death_wish,
        suicide_attempts,
        completed_at,
        completed_by_user_id,
        updated_by_user_id,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        COALESCE((SELECT completed_at FROM patient_intakes WHERE patient_id = $1), NOW()),
        COALESCE((SELECT completed_by_user_id FROM patient_intakes WHERE patient_id = $1), $21),
        $21,
        NOW()
      )
      ON CONFLICT (patient_id) DO UPDATE
      SET
        birth_date = EXCLUDED.birth_date,
        birth_place = EXCLUDED.birth_place,
        occupation = EXCLUDED.occupation,
        hobbies = EXCLUDED.hobbies,
        marital_status = EXCLUDED.marital_status,
        family_members = EXCLUDED.family_members,
        lives_with = EXCLUDED.lives_with,
        physical_illnesses = EXCLUDED.physical_illnesses,
        insomnia = EXCLUDED.insomnia,
        nightmares = EXCLUDED.nightmares,
        fears_or_phobias = EXCLUDED.fears_or_phobias,
        accidents = EXCLUDED.accidents,
        alcohol_use = EXCLUDED.alcohol_use,
        tobacco_use = EXCLUDED.tobacco_use,
        drug_use = EXCLUDED.drug_use,
        psychological_abuse = EXCLUDED.psychological_abuse,
        physical_abuse = EXCLUDED.physical_abuse,
        death_wish = EXCLUDED.death_wish,
        suicide_attempts = EXCLUDED.suicide_attempts,
        updated_by_user_id = EXCLUDED.updated_by_user_id,
        updated_at = NOW()
    `,
    [
      patientId,
      interview.birthDate,
      interview.birthPlace,
      interview.occupation,
      interview.hobbies,
      interview.maritalStatus,
      interview.familyMembers,
      interview.livesWith,
      interview.physicalIllnesses,
      interview.insomnia,
      interview.nightmares,
      interview.fearsOrPhobias,
      interview.accidents,
      interview.alcoholUse,
      interview.tobaccoUse,
      interview.drugUse,
      interview.psychologicalAbuse,
      interview.physicalAbuse,
      interview.deathWish,
      interview.suicideAttempts,
      actor.id,
    ],
  );

  await logAuditEvent(db, {
    actorUserId: actor.id,
    actorRole: actor.role,
    action: 'patient_intake_saved',
    entityType: 'patient_intake',
    entityId: patientId,
    patientId,
    metadata: {
      byRole: actor.role,
    },
  });

  return getPatientById(patientId, actor);
};

const createPatientChecklistItem = async (patientId, payload, actor, kind) => {
  ensurePsychologist(actor);

  const patient = await getPatientById(patientId, actor);

  if (!patient) {
    return null;
  }

  let session = null;

  if (kind === 'task') {
    session = await ensureClinicalNoteBelongsToPatient(Number(payload.clinicalNoteId ?? payload.sessionId), patientId);
  }

  const result = await db.query(
    `
        INSERT INTO patient_tasks (
          patient_id,
          clinical_note_id,
          kind,
          text,
          completed
        )
        VALUES ($1, $2, $3, $4, $5)
      RETURNING id, text, completed, clinical_note_id AS "clinicalNoteId"
    `,
    [patientId, session ? Number(session.id) : null, kind, payload.text.trim(), false],
  );

  return mapTaskRow({
    ...result.rows[0],
    clinicalNoteDate: session?.clinical_note_date || null,
    clinicalNoteObjective: session?.clinical_note_objective || '',
  });
};

const updatePatientChecklistItem = async (patientId, taskId, payload, actor, kind) => {
  const patient = await getPatientById(patientId, actor);

  if (!patient) {
    return null;
  }

  const currentTaskResult = await db.query(
    `
      SELECT id, patient_id, text, completed
           , clinical_note_id
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
      RETURNING id, text, completed, clinical_note_id AS "clinicalNoteId"
    `,
    [patientId, taskId, kind, nextText, nextCompleted],
  );

  let session = null;

  if (kind === 'task' && result.rows[0]?.clinicalNoteId) {
    session = await ensureClinicalNoteBelongsToPatient(Number(result.rows[0].clinicalNoteId), patientId);
  }

  return mapTaskRow({
    ...result.rows[0],
    clinicalNoteDate: session?.clinical_note_date || null,
    clinicalNoteObjective: session?.clinical_note_objective || '',
  });
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

export const createPatientClinicalNote = async (patientId, payload, actor) => {
  ensurePsychologist(actor);

  const patient = await getPatientById(patientId, actor);

  if (!patient) {
    return null;
  }

  const appointment = await ensureAppointmentBelongsToPatient(payload.appointmentId ? Number(payload.appointmentId) : null, patientId);
  ensureAppointmentEligibleForClinicalNote(appointment);
  await ensureAppointmentClinicalNoteUniqueness(Number(appointment.id));
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `
        INSERT INTO patient_clinical_notes (
          patient_id,
          appointment_id,
          created_by_user_id,
          clinical_note_date,
          note_format,
          clinical_note_objective,
          clinical_observations,
          next_steps,
          content
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING
          id,
          appointment_id AS "appointmentId",
          clinical_note_date AS "clinicalNoteDate",
          note_format AS "noteFormat",
          clinical_note_objective AS "clinicalNoteObjective",
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
        normalizeOptionalText(payload.clinicalNoteObjective ?? payload.sessionObjective),
        normalizeOptionalText(payload.clinicalObservations),
        normalizeOptionalText(payload.nextSteps),
        payload.content.trim(),
      ],
    );

    const createdClinicalNote = result.rows[0];
    await syncClinicalNoteTasks(client, patientId, Number(createdClinicalNote.id), payload.tasks);

    await client.query(
      `
        UPDATE appointments
        SET
          status = 'completed',
          updated_at = NOW()
        WHERE id = $1
          AND status <> 'completed'
      `,
      [Number(appointment.id)],
    );

    await client.query(
      `
        UPDATE patients
        SET
          last_clinical_note_date = (
            SELECT MAX(pcn.clinical_note_date)
            FROM patient_clinical_notes pcn
            WHERE pcn.patient_id = $1
          ),
          updated_at = NOW()
        WHERE id = $1
      `,
      [patientId],
    );

    await logAuditEvent(client, {
      actorUserId: actor.id,
      actorRole: actor.role,
      action: 'clinical_note_created',
      entityType: 'clinical_note',
      entityId: createdClinicalNote.id,
      patientId,
      metadata: {
        appointmentId: String(appointment.id),
      },
    });

    await client.query('COMMIT');
    return mapClinicalNoteRow(createdClinicalNote);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const updatePatientClinicalNote = async (patientId, clinicalNoteId, payload, actor) => {
  ensurePsychologist(actor);

  const patient = await getPatientById(patientId, actor);

  if (!patient) {
    return null;
  }

  const currentClinicalNoteResult = await db.query(
    `
      SELECT
        id,
        appointment_id AS "appointmentId",
        clinical_note_date AS "clinicalNoteDate",
        note_format AS "noteFormat",
        clinical_note_objective AS "clinicalNoteObjective",
        clinical_observations AS "clinicalObservations",
        next_steps AS "nextSteps",
        content,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM patient_clinical_notes
      WHERE patient_id = $1 AND id = $2
      LIMIT 1
    `,
    [patientId, clinicalNoteId],
  );

  if (!currentClinicalNoteResult.rows[0]) {
    return null;
  }

  const currentClinicalNote = currentClinicalNoteResult.rows[0];
  const nextNoteFormat = Object.prototype.hasOwnProperty.call(payload, 'noteFormat') ? payload.noteFormat : currentClinicalNote.noteFormat;
  const nextContent = Object.prototype.hasOwnProperty.call(payload, 'content') ? payload.content.trim() : currentClinicalNote.content;
  const nextClinicalNoteObjective = Object.prototype.hasOwnProperty.call(payload, 'clinicalNoteObjective')
    ? normalizeOptionalText(payload.clinicalNoteObjective)
    : Object.prototype.hasOwnProperty.call(payload, 'sessionObjective')
      ? normalizeOptionalText(payload.sessionObjective)
    : currentClinicalNote.clinicalNoteObjective;
  const nextClinicalObservations = Object.prototype.hasOwnProperty.call(payload, 'clinicalObservations')
    ? normalizeOptionalText(payload.clinicalObservations)
    : currentClinicalNote.clinicalObservations;
  const nextSteps = Object.prototype.hasOwnProperty.call(payload, 'nextSteps')
    ? normalizeOptionalText(payload.nextSteps)
    : currentClinicalNote.nextSteps;
  const nextAppointmentId = Object.prototype.hasOwnProperty.call(payload, 'appointmentId')
    ? Number(payload.appointmentId)
    : currentClinicalNote.appointmentId;

  const appointment = await ensureAppointmentBelongsToPatient(nextAppointmentId, patientId);
  ensureAppointmentEligibleForClinicalNote(appointment);
  await ensureAppointmentClinicalNoteUniqueness(Number(appointment.id), Number(clinicalNoteId));

  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `
        UPDATE patient_clinical_notes
        SET
          appointment_id = $3,
          clinical_note_date = $4,
          note_format = $5,
          clinical_note_objective = $6,
          clinical_observations = $7,
          next_steps = $8,
          content = $9,
          updated_at = NOW()
        WHERE patient_id = $1 AND id = $2
        RETURNING
          id,
          appointment_id AS "appointmentId",
          clinical_note_date AS "clinicalNoteDate",
          note_format AS "noteFormat",
          clinical_note_objective AS "clinicalNoteObjective",
          clinical_observations AS "clinicalObservations",
          next_steps AS "nextSteps",
          content,
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `,
      [
        patientId,
        clinicalNoteId,
        Number(appointment.id),
        normalizeDateValue(appointment.scheduled_date),
        nextNoteFormat,
        nextClinicalNoteObjective,
        nextClinicalObservations,
        nextSteps,
        nextContent,
      ],
    );

    await syncClinicalNoteTasks(client, patientId, Number(clinicalNoteId), payload.tasks);

    await client.query(
      `
        UPDATE appointments
        SET
          status = 'completed',
          updated_at = NOW()
        WHERE id = $1
          AND status <> 'completed'
      `,
      [Number(appointment.id)],
    );

    await client.query(
      `
        UPDATE patients
        SET
          last_clinical_note_date = (
            SELECT MAX(pcn.clinical_note_date)
            FROM patient_clinical_notes pcn
            WHERE pcn.patient_id = $1
          ),
          updated_at = NOW()
        WHERE id = $1
      `,
      [patientId],
    );

    await logAuditEvent(client, {
      actorUserId: actor.id,
      actorRole: actor.role,
      action: 'clinical_note_updated',
      entityType: 'clinical_note',
      entityId: clinicalNoteId,
      patientId,
      metadata: {
        appointmentId: String(appointment.id),
      },
    });

    await client.query('COMMIT');
    return mapClinicalNoteRow(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const deletePatientClinicalNote = async (patientId, clinicalNoteId, actor) => {
  ensurePsychologist(actor);

  const patient = await getPatientById(patientId, actor);

  if (!patient) {
    return false;
  }

  const result = await db.query(
    `
      DELETE FROM patient_clinical_notes
      WHERE patient_id = $1 AND id = $2
    `,
    [patientId, clinicalNoteId],
  );

  if (result.rowCount > 0) {
    await refreshPatientLastClinicalNoteDate(patientId);
    await logAuditEvent(db, {
      actorUserId: actor.id,
      actorRole: actor.role,
      action: 'clinical_note_deleted',
      entityType: 'clinical_note',
      entityId: clinicalNoteId,
      patientId,
    });
    return true;
  }

  return false;
};
