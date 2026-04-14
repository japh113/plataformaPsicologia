import { createHash, randomBytes, randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../../config/db.js';
import env from '../../config/env.js';

const createAuthError = (message, status = 400) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const normalizeRelationshipStatus = (status) => String(status || 'active').trim().toLowerCase();
const normalizeRelationshipResponseStatus = (status) => String(status || '').trim().toLowerCase();
const addMinutesToDate = (date, minutes) => new Date(date.getTime() + minutes * 60 * 1000);
const hashPasswordResetToken = (token) => createHash('sha256').update(String(token)).digest('hex');
const buildPasswordResetPreview = ({ token, expiresAt, appBaseUrl = env.appBaseUrl }) => ({
  resetToken: token,
  resetUrl: `${appBaseUrl.replace(/\/$/, '')}?resetToken=${encodeURIComponent(token)}`,
  expiresAt: expiresAt.toISOString(),
});

const mapUserRow = (row) => ({
  id: String(row.id),
  firstName: row.first_name,
  lastName: row.last_name,
  fullName: `${row.first_name} ${row.last_name}`.trim(),
  email: row.email,
  role: row.role,
  patientId: row.patient_id ? String(row.patient_id) : null,
  patientName: row.patient_full_name || null,
  isActive: row.is_active !== false,
  createdAt: row.created_at || null,
  psychologistStatus: row.psychologist_approval_status || null,
  psychologistProfile: row.role === 'psychologist'
    ? {
        professionalTitle: row.professional_title || '',
        licenseNumber: row.license_number || '',
        approvalStatus: row.psychologist_approval_status || 'pending_review',
        reviewNotes: row.review_notes || '',
      }
    : null,
});

const mapCareRelationshipRow = (row) => ({
  id: String(row.id),
  status: row.status,
  notes: row.notes || '',
  requestedByRole: row.requested_by_role,
  createdAt: row.created_at || null,
  approvedAt: row.approved_at || null,
  patient: {
    id: String(row.patient_id),
    fullName: row.patient_full_name,
    email: row.patient_email || '',
  },
  psychologist: {
    id: String(row.psychologist_user_id),
    fullName: row.psychologist_full_name,
    email: row.psychologist_email,
    professionalTitle: row.professional_title || '',
    approvalStatus: row.psychologist_approval_status || 'pending_review',
  },
});

const mapPsychologistDirectoryRow = (row) => ({
  id: String(row.id),
  fullName: `${row.first_name} ${row.last_name}`.trim(),
  email: row.email,
  professionalTitle: row.professional_title || 'Psicologo',
  approvalStatus: row.approval_status || 'pending_review',
});

const mapAuditLogRow = (row) => ({
  id: String(row.id),
  action: row.action,
  entityType: row.entity_type,
  entityId: row.entity_id ? String(row.entity_id) : null,
  createdAt: row.created_at || null,
  actor: row.actor_user_id
    ? {
        id: String(row.actor_user_id),
        fullName: `${row.actor_first_name || ''} ${row.actor_last_name || ''}`.trim() || 'Usuario',
        email: row.actor_email || '',
        role: row.actor_role || '',
      }
    : null,
  targetUser: row.target_user_id
    ? {
        id: String(row.target_user_id),
        fullName: `${row.target_first_name || ''} ${row.target_last_name || ''}`.trim() || 'Usuario',
        email: row.target_email || '',
      }
    : null,
  patient: row.patient_id
    ? {
        id: String(row.patient_id),
        fullName: row.patient_full_name || '',
      }
    : null,
  metadata: row.metadata || {},
});

const signAuthToken = (user) =>
  jwt.sign(
    {
      sub: user.id,
      role: user.role,
      patientId: user.patientId,
      email: user.email,
    },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn },
  );

const baseUserSelect = `
  SELECT
    u.id,
    u.first_name,
    u.last_name,
    u.email,
    u.role,
    u.patient_id,
    u.is_active,
    u.created_at,
    p.full_name AS patient_full_name,
    pp.professional_title,
    pp.license_number,
    pp.approval_status AS psychologist_approval_status,
    pp.review_notes
  FROM users u
  LEFT JOIN patients p
    ON p.id = u.patient_id
  LEFT JOIN psychologist_profiles pp
    ON pp.user_id = u.id
`;

const relationshipBaseSelect = `
  SELECT
    cr.id,
    cr.patient_id,
    cr.psychologist_user_id,
    cr.status,
    cr.notes,
    cr.requested_by_role,
    cr.created_at,
    cr.approved_at,
    p.full_name AS patient_full_name,
    p.email AS patient_email,
    u.first_name AS psychologist_first_name,
    u.last_name AS psychologist_last_name,
    u.email AS psychologist_email,
    pp.professional_title,
    pp.approval_status AS psychologist_approval_status
  FROM care_relationships cr
  INNER JOIN patients p
    ON p.id = cr.patient_id
  INNER JOIN users u
    ON u.id = cr.psychologist_user_id
  LEFT JOIN psychologist_profiles pp
    ON pp.user_id = u.id
`;

const isBackofficeActor = (actor) => ['admin', 'support', 'superadmin'].includes(actor?.role || '');
const isBackofficeManagerActor = (actor) => ['admin', 'superadmin'].includes(actor?.role || '');
const isPatientActor = (actor) => actor?.role === 'patient';
const isPsychologistActor = (actor) => actor?.role === 'psychologist';

const ensurePsychologistCanAuthenticate = (userRow) => {
  if (userRow.role !== 'psychologist') {
    return;
  }

  const approvalStatus = userRow.psychologist_approval_status || 'pending_review';

  if (approvalStatus === 'active') {
    return;
  }

  if (approvalStatus === 'pending_review') {
    throw createAuthError('Psychologist account is pending review', 403);
  }

  if (approvalStatus === 'rejected') {
    throw createAuthError('Psychologist account was rejected', 403);
  }

  if (approvalStatus === 'suspended') {
    throw createAuthError('Psychologist account is suspended', 403);
  }
};

const assertEmailAvailable = async (client, email) => {
  const result = await client.query(
    `
      SELECT 1
      FROM users
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
    `,
    [email.trim()],
  );

  if (result.rows[0]) {
    throw createAuthError('Email is already in use', 409);
  }
};

const ensurePasswordResetRecordUsable = (record, now = new Date()) => {
  if (!record) {
    throw createAuthError('Password reset token is invalid or expired', 400);
  }

  if (record.used_at) {
    throw createAuthError('Password reset token is invalid or expired', 400);
  }

  const expiresAt = new Date(record.expires_at);

  if (Number.isNaN(expiresAt.getTime()) || expiresAt <= now) {
    throw createAuthError('Password reset token is invalid or expired', 400);
  }
};

const writeAuditLog = async (
  client,
  {
    actorUserId = null,
    actorRole = '',
    action,
    entityType,
    entityId = '',
    targetUserId = null,
    patientId = null,
    metadata = {},
  },
) => {
  await client.query(
    `
      INSERT INTO audit_logs (
        actor_user_id,
        actor_role,
        action,
        entity_type,
        entity_id,
        target_user_id,
        patient_id,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
    `,
    [
      actorUserId,
      actorRole || '',
      action,
      entityType,
      entityId ? String(entityId) : '',
      targetUserId,
      patientId,
      JSON.stringify(metadata || {}),
    ],
  );
};

const buildRelationshipScope = (actor) => {
  if (isBackofficeActor(actor)) {
    return {
      clause: 'TRUE',
      params: [],
    };
  }

  if (isPatientActor(actor)) {
    if (!actor.patientId) {
      throw createAuthError('Patient account is not linked correctly', 409);
    }

    return {
      clause: 'cr.patient_id = $1',
      params: [actor.patientId],
    };
  }

  if (isPsychologistActor(actor)) {
    return {
      clause: 'cr.psychologist_user_id = $1',
      params: [actor.id],
    };
  }

  throw createAuthError('Forbidden', 403);
};

const getRelationshipById = async (client, relationshipId) => {
  const result = await client.query(
    `
      ${relationshipBaseSelect}
      WHERE cr.id = $1
      LIMIT 1
    `,
    [relationshipId],
  );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  return mapCareRelationshipRow({
    ...row,
    psychologist_full_name: `${row.psychologist_first_name} ${row.psychologist_last_name}`.trim(),
  });
};

const ensureCareRelationshipResponseAllowed = (actor, relationship, nextStatus) => {
  const normalizedStatus = normalizeRelationshipResponseStatus(nextStatus);

  if (!['active', 'rejected'].includes(normalizedStatus)) {
    throw createAuthError('Care relationship response must be active or rejected', 400);
  }

  if (relationship.status !== 'pending') {
    throw createAuthError('Only pending care relationships can be responded to', 409);
  }

  if (isPatientActor(actor)) {
    if (!actor.patientId || relationship.patient.id !== String(actor.patientId) || relationship.requestedByRole !== 'psychologist') {
      throw createAuthError('You cannot respond to this invitation', 403);
    }

    return normalizedStatus;
  }

  if (isPsychologistActor(actor)) {
    if (relationship.psychologist.id !== String(actor.id) || relationship.requestedByRole !== 'patient') {
      throw createAuthError('You cannot respond to this request', 403);
    }

    return normalizedStatus;
  }

  throw createAuthError('Forbidden', 403);
};

export const verifyAuthToken = (token) => jwt.verify(token, env.jwtSecret);

export const getUserById = async (id) => {
  const result = await db.query(
    `
      ${baseUserSelect}
      WHERE u.id = $1
        AND u.is_active = TRUE
      LIMIT 1
    `,
    [id],
  );

  return result.rows[0] ? mapUserRow(result.rows[0]) : null;
};

export const loginUser = async ({ email, password }) => {
  const result = await db.query(
    `
      SELECT
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        u.password_hash,
        u.role,
        u.patient_id,
        pp.professional_title,
        pp.license_number,
        pp.approval_status AS psychologist_approval_status,
        pp.review_notes
      FROM users u
      LEFT JOIN psychologist_profiles pp
        ON pp.user_id = u.id
      WHERE LOWER(u.email) = LOWER($1)
        AND u.is_active = TRUE
      LIMIT 1
    `,
    [email.trim()],
  );

  const userRow = result.rows[0];

  if (!userRow) {
    return null;
  }

  const passwordMatches = await bcrypt.compare(password, userRow.password_hash);

  if (!passwordMatches) {
    return null;
  }

  ensurePsychologistCanAuthenticate(userRow);

  const user = mapUserRow(userRow);

  return {
    user,
    token: signAuthToken(user),
  };
};

export const requestPasswordReset = async ({ email }) => {
  const normalizedEmail = email.trim();
  const userResult = await db.query(
    `
      SELECT id, role, is_active
      FROM users
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
    `,
    [normalizedEmail],
  );

  const user = userResult.rows[0];

  if (!user || user.is_active === false) {
    return {
      sent: true,
      preview: null,
    };
  }

  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    await client.query(
      `
        UPDATE password_reset_tokens
        SET used_at = NOW()
        WHERE user_id = $1
          AND used_at IS NULL
      `,
      [user.id],
    );

    const rawToken = randomBytes(24).toString('hex');
    const tokenHash = hashPasswordResetToken(rawToken);
    const expiresAt = addMinutesToDate(new Date(), env.passwordResetTokenTtlMinutes);

    await client.query(
      `
        INSERT INTO password_reset_tokens (
          user_id,
          token_hash,
          expires_at
        )
        VALUES ($1, $2, $3)
      `,
      [user.id, tokenHash, expiresAt.toISOString()],
    );

    await writeAuditLog(client, {
      actorUserId: user.id,
      actorRole: user.role,
      action: 'password_reset_requested',
      entityType: 'auth',
      entityId: user.id,
      targetUserId: user.id,
      metadata: {
        email: normalizedEmail,
      },
    });

    await client.query('COMMIT');

    return {
      sent: true,
      preview: env.nodeEnv === 'production' ? null : buildPasswordResetPreview({ token: rawToken, expiresAt }),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const confirmPasswordReset = async ({ token, password }) => {
  const tokenHash = hashPasswordResetToken(token.trim());
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    const resetResult = await client.query(
      `
        SELECT
          prt.id,
          prt.user_id,
          prt.expires_at,
          prt.used_at
        FROM password_reset_tokens prt
        WHERE prt.token_hash = $1
        LIMIT 1
      `,
      [tokenHash],
    );

    const resetRecord = resetResult.rows[0];
    ensurePasswordResetRecordUsable(resetRecord);

    const passwordHash = await bcrypt.hash(password, 10);

    await client.query(
      `
        UPDATE users
        SET
          password_hash = $2,
          updated_at = NOW()
        WHERE id = $1
      `,
      [resetRecord.user_id, passwordHash],
    );

    await client.query(
      `
        UPDATE password_reset_tokens
        SET used_at = NOW()
        WHERE user_id = $1
          AND used_at IS NULL
      `,
      [resetRecord.user_id],
    );

    const userResult = await client.query(
      `
        SELECT id, role
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [resetRecord.user_id],
    );

    const resetUser = userResult.rows[0];

    await writeAuditLog(client, {
      actorUserId: resetRecord.user_id,
      actorRole: resetUser?.role || '',
      action: 'password_reset_confirmed',
      entityType: 'auth',
      entityId: resetRecord.user_id,
      targetUserId: resetRecord.user_id,
    });

    await client.query('COMMIT');

    return {
      reset: true,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const registerPatientUser = async ({
  firstName,
  lastName = '',
  email,
  password,
  age = null,
  reasonForConsultation = '',
}) => {
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    await assertEmailAvailable(client, email);

    const patientId = randomUUID();
    const userId = randomUUID();
    const normalizedFirstName = firstName.trim();
    const normalizedLastName = lastName.trim();
    const fullName = `${normalizedFirstName} ${normalizedLastName}`.trim();
    const passwordHash = await bcrypt.hash(password, 10);

    await client.query(
      `
        INSERT INTO patients (
          id,
          first_name,
          last_name,
          full_name,
          email,
          risk_level,
          status,
          age,
          reason_for_consultation
        )
        VALUES ($1, $2, $3, $4, $5, 'none', 'active', $6, $7)
      `,
      [patientId, normalizedFirstName, normalizedLastName, fullName, email.trim(), age === '' ? null : age, reasonForConsultation.trim()],
    );

    const result = await client.query(
      `
        INSERT INTO users (
          id,
          first_name,
          last_name,
          email,
          password_hash,
          role,
          patient_id
        )
        VALUES ($1, $2, $3, $4, $5, 'patient', $6)
        RETURNING
          id,
          first_name,
          last_name,
          email,
          role,
          patient_id,
          NULL::text AS professional_title,
          NULL::text AS license_number,
          NULL::text AS psychologist_approval_status,
          NULL::text AS review_notes
      `,
      [userId, normalizedFirstName, normalizedLastName, email.trim(), passwordHash, patientId],
    );

    await client.query('COMMIT');

    const user = mapUserRow(result.rows[0]);

    return {
      user,
      token: signAuthToken(user),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const registerPsychologistUser = async ({
  firstName,
  lastName = '',
  email,
  password,
  professionalTitle,
  licenseNumber = '',
}) => {
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    await assertEmailAvailable(client, email);

    const userId = randomUUID();
    const normalizedFirstName = firstName.trim();
    const normalizedLastName = lastName.trim();
    const passwordHash = await bcrypt.hash(password, 10);

    await client.query(
      `
        INSERT INTO users (
          id,
          first_name,
          last_name,
          email,
          password_hash,
          role,
          patient_id
        )
        VALUES ($1, $2, $3, $4, $5, 'psychologist', NULL)
      `,
      [userId, normalizedFirstName, normalizedLastName, email.trim(), passwordHash],
    );

    const result = await client.query(
      `
        INSERT INTO psychologist_profiles (
          user_id,
          professional_title,
          license_number,
          approval_status
        )
        VALUES ($1, $2, $3, 'pending_review')
        RETURNING
          $1::text AS id,
          $4::text AS first_name,
          $5::text AS last_name,
          $6::text AS email,
          'psychologist'::text AS role,
          NULL::text AS patient_id,
          professional_title,
          license_number,
          approval_status AS psychologist_approval_status,
          review_notes
      `,
      [userId, professionalTitle.trim(), licenseNumber.trim(), normalizedFirstName, normalizedLastName, email.trim()],
    );

    await client.query('COMMIT');

    return mapUserRow(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const listPendingPsychologistUsers = async () => {
  const result = await db.query(
    `
      ${baseUserSelect}
      WHERE u.role = 'psychologist'
        AND COALESCE(pp.approval_status, 'pending_review') = 'pending_review'
      ORDER BY u.created_at ASC
    `,
    [],
  );

  return result.rows.map(mapUserRow);
};

export const listBackofficeUsers = async () => {
  const result = await db.query(
    `
      ${baseUserSelect}
      ORDER BY
        CASE u.role
          WHEN 'superadmin' THEN 1
          WHEN 'admin' THEN 2
          WHEN 'support' THEN 3
          WHEN 'psychologist' THEN 4
          WHEN 'patient' THEN 5
          ELSE 6
        END,
        u.created_at DESC
    `,
    [],
  );

  return result.rows.map(mapUserRow);
};

export const listAvailablePsychologists = async () => {
  const result = await db.query(
    `
      SELECT
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        pp.professional_title,
        pp.approval_status
      FROM users u
      INNER JOIN psychologist_profiles pp
        ON pp.user_id = u.id
      WHERE u.role = 'psychologist'
        AND u.is_active = TRUE
        AND pp.approval_status = 'active'
      ORDER BY u.first_name ASC, u.last_name ASC
    `,
    [],
  );

  return result.rows.map(mapPsychologistDirectoryRow);
};

export const listCareRelationships = async (actor) => {
  const { clause, params } = buildRelationshipScope(actor);
  const result = await db.query(
    `
      ${relationshipBaseSelect}
      WHERE ${clause}
      ORDER BY
        CASE cr.status
          WHEN 'active' THEN 1
          WHEN 'pending' THEN 2
          WHEN 'ended' THEN 3
          WHEN 'rejected' THEN 4
          ELSE 5
        END,
        cr.created_at DESC
    `,
    params,
  );

  return result.rows.map((row) =>
    mapCareRelationshipRow({
      ...row,
      psychologist_full_name: `${row.psychologist_first_name} ${row.psychologist_last_name}`.trim(),
    }),
  );
};

export const listAuditLogs = async () => {
  const result = await db.query(
    `
      SELECT
        al.id,
        al.action,
        al.entity_type,
        al.entity_id,
        al.actor_user_id,
        al.actor_role,
        al.target_user_id,
        al.patient_id,
        al.metadata,
        al.created_at,
        actor.first_name AS actor_first_name,
        actor.last_name AS actor_last_name,
        actor.email AS actor_email,
        target.first_name AS target_first_name,
        target.last_name AS target_last_name,
        target.email AS target_email,
        p.full_name AS patient_full_name
      FROM audit_logs al
      LEFT JOIN users actor
        ON actor.id = al.actor_user_id
      LEFT JOIN users target
        ON target.id = al.target_user_id
      LEFT JOIN patients p
        ON p.id = al.patient_id
      ORDER BY al.created_at DESC
      LIMIT 80
    `,
    [],
  );

  return result.rows.map(mapAuditLogRow);
};

const ensurePatientExists = async (client, patientId) => {
  const result = await client.query(
    `
      SELECT id
      FROM patients
      WHERE id = $1
      LIMIT 1
    `,
    [patientId],
  );

  if (!result.rows[0]) {
    throw createAuthError('Patient not found', 404);
  }
};

const findPatientUserByEmail = async (client, email) => {
  const result = await client.query(
    `
      SELECT
        u.id,
        u.email,
        u.is_active,
        p.id AS patient_id,
        p.full_name
      FROM users u
      INNER JOIN patients p
        ON p.id = u.patient_id
      WHERE u.role = 'patient'
        AND LOWER(u.email) = LOWER($1)
      LIMIT 1
    `,
    [email.trim()],
  );

  return result.rows[0] || null;
};

const ensurePsychologistCanBeLinked = async (client, psychologistUserId) => {
  const result = await client.query(
    `
      SELECT
        u.id,
        COALESCE(pp.approval_status, 'pending_review') AS approval_status
      FROM users u
      LEFT JOIN psychologist_profiles pp
        ON pp.user_id = u.id
      WHERE u.id = $1
        AND u.role = 'psychologist'
        AND u.is_active = TRUE
      LIMIT 1
    `,
    [psychologistUserId],
  );

  const psychologist = result.rows[0];

  if (!psychologist) {
    throw createAuthError('Psychologist user not found', 404);
  }

  if (psychologist.approval_status !== 'active') {
    throw createAuthError('Only active psychologists can be linked to patients', 409);
  }
};

const syncLegacyRelationshipAccess = async (client, patientId, psychologistUserId, status) => {
  if (status === 'active') {
    await client.query(
      `
        INSERT INTO psychologist_patient_access (
          psychologist_user_id,
          patient_id
        )
        VALUES ($1, $2)
        ON CONFLICT (psychologist_user_id, patient_id) DO NOTHING
      `,
      [psychologistUserId, patientId],
    );
    return;
  }

  await client.query(
    `
      DELETE FROM psychologist_patient_access
      WHERE psychologist_user_id = $1
        AND patient_id = $2
    `,
    [psychologistUserId, patientId],
  );
};

export const createCareRelationship = async ({
  actor,
  patientId,
  psychologistUserId,
  status = 'active',
  notes = '',
}) => {
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    await ensurePatientExists(client, patientId);
    await ensurePsychologistCanBeLinked(client, psychologistUserId);

    const normalizedStatus = normalizeRelationshipStatus(status);
    const existingResult = await client.query(
      `
        SELECT id, status
        FROM care_relationships
        WHERE patient_id = $1
          AND psychologist_user_id = $2
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [patientId, psychologistUserId],
    );

    let relationshipId = null;

    if (existingResult.rows[0]) {
      relationshipId = existingResult.rows[0].id;

      await client.query(
        `
          UPDATE care_relationships
          SET
            status = $2,
            notes = $3,
            requested_by_role = $4,
            created_by_user_id = $5,
            approved_by_user_id = CASE WHEN $2 = 'active' THEN $5 ELSE approved_by_user_id END,
            approved_at = CASE WHEN $2 = 'active' THEN NOW() ELSE NULL END,
            updated_at = NOW()
          WHERE id = $1
        `,
        [relationshipId, normalizedStatus, notes.trim(), actor.role, actor.id],
      );
    } else {
      const insertResult = await client.query(
        `
          INSERT INTO care_relationships (
            patient_id,
            psychologist_user_id,
            status,
            requested_by_role,
            created_by_user_id,
            approved_by_user_id,
            approved_at,
            notes
          )
          VALUES ($1, $2, $3, $4, $5, CASE WHEN $3 = 'active' THEN $5 ELSE NULL END, CASE WHEN $3 = 'active' THEN NOW() ELSE NULL END, $6)
          RETURNING id
        `,
        [patientId, psychologistUserId, normalizedStatus, actor.role, actor.id, notes.trim()],
      );
      relationshipId = insertResult.rows[0].id;
    }

    await syncLegacyRelationshipAccess(client, patientId, psychologistUserId, normalizedStatus);

    await writeAuditLog(client, {
      actorUserId: actor.id,
      actorRole: actor.role,
      action: 'care_relationship_created',
      entityType: 'care_relationship',
      entityId: relationshipId,
      targetUserId: psychologistUserId,
      patientId,
      metadata: {
        status: normalizedStatus,
        requestedByRole: actor.role,
      },
    });

    await client.query('COMMIT');

    return getRelationshipById(db, relationshipId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const updateCareRelationship = async ({
  actor,
  relationshipId,
  status,
  notes = '',
}) => {
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    const currentResult = await client.query(
      `
        SELECT
          id,
          patient_id,
          psychologist_user_id
        FROM care_relationships
        WHERE id = $1
        LIMIT 1
      `,
      [relationshipId],
    );

    const currentRelationship = currentResult.rows[0];

    if (!currentRelationship) {
      throw createAuthError('Care relationship not found', 404);
    }

    const normalizedStatus = normalizeRelationshipStatus(status);

    await client.query(
      `
        UPDATE care_relationships
        SET
          status = $2,
          notes = $3,
          approved_by_user_id = CASE WHEN $2 = 'active' THEN $4 ELSE approved_by_user_id END,
          approved_at = CASE WHEN $2 = 'active' THEN COALESCE(approved_at, NOW()) ELSE approved_at END,
          updated_at = NOW()
        WHERE id = $1
      `,
      [relationshipId, normalizedStatus, notes.trim(), actor.id],
    );

    await syncLegacyRelationshipAccess(
      client,
      currentRelationship.patient_id,
      currentRelationship.psychologist_user_id,
      normalizedStatus,
    );

    await writeAuditLog(client, {
      actorUserId: actor.id,
      actorRole: actor.role,
      action: 'care_relationship_updated',
      entityType: 'care_relationship',
      entityId: relationshipId,
      targetUserId: currentRelationship.psychologist_user_id,
      patientId: currentRelationship.patient_id,
      metadata: {
        status: normalizedStatus,
      },
    });

    await client.query('COMMIT');

    return getRelationshipById(db, relationshipId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const requestCareRelationship = async ({
  actor,
  psychologistUserId,
  notes = '',
}) => {
  if (!isPatientActor(actor) || !actor.patientId) {
    throw createAuthError('Only patients can request a psychologist link', 403);
  }

  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    await ensurePatientExists(client, actor.patientId);
    await ensurePsychologistCanBeLinked(client, psychologistUserId);

    const existingResult = await client.query(
      `
        SELECT id, status
        FROM care_relationships
        WHERE patient_id = $1
          AND psychologist_user_id = $2
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [actor.patientId, psychologistUserId],
    );

    const existingRelationship = existingResult.rows[0];

    if (existingRelationship?.status === 'active') {
      throw createAuthError('This psychologist is already linked to the patient', 409);
    }

    let relationshipId = existingRelationship?.id || null;

    if (relationshipId) {
      await client.query(
        `
          UPDATE care_relationships
          SET
            status = 'pending',
            notes = $2,
            requested_by_role = 'patient',
            created_by_user_id = $3,
            approved_by_user_id = NULL,
            approved_at = NULL,
            updated_at = NOW()
          WHERE id = $1
        `,
        [relationshipId, notes.trim(), actor.id],
      );
    } else {
      const insertResult = await client.query(
        `
          INSERT INTO care_relationships (
            patient_id,
            psychologist_user_id,
            status,
            requested_by_role,
            created_by_user_id,
            notes
          )
          VALUES ($1, $2, 'pending', 'patient', $3, $4)
          RETURNING id
        `,
        [actor.patientId, psychologistUserId, actor.id, notes.trim()],
      );

      relationshipId = insertResult.rows[0].id;
    }

    await syncLegacyRelationshipAccess(client, actor.patientId, psychologistUserId, 'pending');

    await writeAuditLog(client, {
      actorUserId: actor.id,
      actorRole: actor.role,
      action: 'care_relationship_requested',
      entityType: 'care_relationship',
      entityId: relationshipId,
      targetUserId: psychologistUserId,
      patientId: actor.patientId,
      metadata: {
        requestType: 'patient_request',
      },
    });

    await client.query('COMMIT');

    return getRelationshipById(db, relationshipId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const inviteCareRelationship = async ({
  actor,
  patientEmail,
  notes = '',
}) => {
  if (!isPsychologistActor(actor)) {
    throw createAuthError('Only psychologists can send patient invitations', 403);
  }

  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    await ensurePsychologistCanBeLinked(client, actor.id);

    const patientUser = await findPatientUserByEmail(client, patientEmail);

    if (!patientUser || patientUser.is_active === false) {
      throw createAuthError('No active patient account was found with that email', 404);
    }

    const existingResult = await client.query(
      `
        SELECT id, status
        FROM care_relationships
        WHERE patient_id = $1
          AND psychologist_user_id = $2
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [patientUser.patient_id, actor.id],
    );

    const existingRelationship = existingResult.rows[0];

    if (existingRelationship?.status === 'active') {
      throw createAuthError('That patient is already linked to this psychologist', 409);
    }

    let relationshipId = existingRelationship?.id || null;

    if (relationshipId) {
      await client.query(
        `
          UPDATE care_relationships
          SET
            status = 'pending',
            notes = $2,
            requested_by_role = 'psychologist',
            created_by_user_id = $3,
            approved_by_user_id = NULL,
            approved_at = NULL,
            updated_at = NOW()
          WHERE id = $1
        `,
        [relationshipId, notes.trim(), actor.id],
      );
    } else {
      const insertResult = await client.query(
        `
          INSERT INTO care_relationships (
            patient_id,
            psychologist_user_id,
            status,
            requested_by_role,
            created_by_user_id,
            notes
          )
          VALUES ($1, $2, 'pending', 'psychologist', $3, $4)
          RETURNING id
        `,
        [patientUser.patient_id, actor.id, actor.id, notes.trim()],
      );

      relationshipId = insertResult.rows[0].id;
    }

    await syncLegacyRelationshipAccess(client, patientUser.patient_id, actor.id, 'pending');

    await writeAuditLog(client, {
      actorUserId: actor.id,
      actorRole: actor.role,
      action: 'care_relationship_invited',
      entityType: 'care_relationship',
      entityId: relationshipId,
      targetUserId: patientUser.id,
      patientId: patientUser.patient_id,
      metadata: {
        requestType: 'psychologist_invitation',
        patientEmail: patientUser.email,
      },
    });

    await client.query('COMMIT');

    return getRelationshipById(db, relationshipId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const respondToCareRelationship = async ({
  actor,
  relationshipId,
  status,
  notes = '',
}) => {
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    const currentRelationship = await getRelationshipById(client, relationshipId);

    if (!currentRelationship) {
      throw createAuthError('Care relationship not found', 404);
    }

    const normalizedStatus = ensureCareRelationshipResponseAllowed(actor, currentRelationship, status);

    await client.query(
      `
        UPDATE care_relationships
        SET
          status = $2,
          notes = CASE WHEN $3 <> '' THEN $3 ELSE notes END,
          approved_by_user_id = CASE WHEN $2 = 'active' THEN $4 ELSE approved_by_user_id END,
          approved_at = CASE WHEN $2 = 'active' THEN COALESCE(approved_at, NOW()) ELSE approved_at END,
          updated_at = NOW()
        WHERE id = $1
      `,
      [relationshipId, normalizedStatus, notes.trim(), actor.id],
    );

    await syncLegacyRelationshipAccess(
      client,
      currentRelationship.patient.id,
      currentRelationship.psychologist.id,
      normalizedStatus,
    );

    await writeAuditLog(client, {
      actorUserId: actor.id,
      actorRole: actor.role,
      action: 'care_relationship_responded',
      entityType: 'care_relationship',
      entityId: relationshipId,
      targetUserId: currentRelationship.psychologist.id,
      patientId: currentRelationship.patient.id,
      metadata: {
        status: normalizedStatus,
        requestedByRole: currentRelationship.requestedByRole,
      },
    });

    await client.query('COMMIT');

    return getRelationshipById(db, relationshipId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const reviewPsychologistUser = async ({
  reviewerUserId,
  reviewerRole = '',
  psychologistUserId,
  approvalStatus,
  reviewNotes = '',
}) => {
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `
        UPDATE psychologist_profiles
        SET
          approval_status = $2,
          review_notes = $3,
          reviewed_at = NOW(),
          reviewed_by_user_id = $4,
          approved_at = CASE
            WHEN $2 = 'active' THEN COALESCE(approved_at, NOW())
            ELSE NULL
          END,
          updated_at = NOW()
        WHERE user_id = $1
        RETURNING user_id
      `,
      [psychologistUserId, approvalStatus, reviewNotes.trim(), reviewerUserId],
    );

    if (!result.rows[0]) {
      throw createAuthError('Psychologist profile not found', 404);
    }

    await writeAuditLog(client, {
      actorUserId: reviewerUserId,
      actorRole: reviewerRole,
      action: 'psychologist_reviewed',
      entityType: 'psychologist_profile',
      entityId: psychologistUserId,
      targetUserId: psychologistUserId,
      metadata: {
        approvalStatus,
        reviewNotes: reviewNotes.trim(),
      },
    });

    await client.query('COMMIT');

    const reviewedUser = await getUserById(psychologistUserId);

    if (!reviewedUser) {
      throw createAuthError('Psychologist user not found', 404);
    }

    return reviewedUser;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const __authTestables = {
  hashPasswordResetToken,
  buildPasswordResetPreview,
  ensurePasswordResetRecordUsable,
};
