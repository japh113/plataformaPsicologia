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
      SELECT id, is_active
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

export const listCareRelationships = async () => {
  const result = await db.query(
    `
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
    [],
  );

  return result.rows.map((row) =>
    mapCareRelationshipRow({
      ...row,
      psychologist_full_name: `${row.psychologist_first_name} ${row.psychologist_last_name}`.trim(),
    }),
  );
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

    await client.query('COMMIT');

    const relationships = await listCareRelationships();
    return relationships.find((relationship) => relationship.id === String(relationshipId)) || null;
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

    await client.query('COMMIT');

    const relationships = await listCareRelationships();
    return relationships.find((relationship) => relationship.id === String(relationshipId)) || null;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const reviewPsychologistUser = async ({
  reviewerUserId,
  psychologistUserId,
  approvalStatus,
  reviewNotes = '',
}) => {
  const result = await db.query(
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

  const reviewedUser = await getUserById(psychologistUserId);

  if (!reviewedUser) {
    throw createAuthError('Psychologist user not found', 404);
  }

  return reviewedUser;
};

export const __authTestables = {
  hashPasswordResetToken,
  buildPasswordResetPreview,
  ensurePasswordResetRecordUsable,
};
