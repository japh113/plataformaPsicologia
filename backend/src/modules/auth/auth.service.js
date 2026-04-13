import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../../config/db.js';
import env from '../../config/env.js';

const createAuthError = (message, status = 400) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

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
