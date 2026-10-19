import { registrationErrors, normalizeEmail, normalizePhone } from './identity.validation.js';
import { createHash, randomBytes, randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../../config/db.js';
import env from '../../config/env.js';
import { ensureAccountCanAuthenticate } from './auth.account-status.js';
import { ensureBackofficeViewer, ensureBackofficeManager, ensureClinicalActor } from './auth.permissions.js';
import { projectOperationalAuditMetadata } from '../../utils/audit-projections.js';
import { logAuditEvent } from '../../utils/audit.js';

const createAuthError = (message, status = 400) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const normalizeRelationshipResponseStatus = (status) => String(status || '').trim().toLowerCase();
const addMinutesToDate = (date, minutes) => new Date(date.getTime() + minutes * 60 * 1000);
const addDaysToDate = (date, days) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
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
  sessionVersion: row.session_version,
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

const projectOperationalUser = (user) => ({
  id: user.id,
  firstName: user.firstName,
  lastName: user.lastName,
  fullName: user.fullName,
  email: user.email,
  role: user.role,
  patientId: user.patientId,
  patientName: user.patientName,
  isActive: user.isActive,
  createdAt: user.createdAt,
  psychologistStatus: user.psychologistStatus,
  psychologistProfile: user.psychologistProfile ? {
    professionalTitle: user.psychologistProfile.professionalTitle,
    licenseNumber: user.psychologistProfile.licenseNumber,
    approvalStatus: user.psychologistProfile.approvalStatus,
  } : null,
});

const mapOperationalUserRow = (row) => projectOperationalUser(mapUserRow(row));

const mapCareRelationshipRow = (row) => ({
  id: String(row.id),
  status: row.status,
  notes: row.notes || '',
  requestedByRole: row.requested_by_role,
  createdAt: row.created_at || null,
  approvedAt: row.approved_at || null,
  inviteExpiresAt: row.invite_expires_at || null,
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

const mapOperationalRelationshipRow = (row) => ({
  id: String(row.id),
  status: row.status,
  requestedByRole: row.requested_by_role,
  createdAt: row.created_at || null,
  approvedAt: row.approved_at || null,
  patient: { id: String(row.patient_id), fullName: row.patient_full_name, email: row.patient_email || '' },
  psychologist: {
    id: String(row.psychologist_user_id),
    fullName: `${row.psychologist_first_name} ${row.psychologist_last_name}`.trim(),
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
  metadata: projectOperationalAuditMetadata(row.action, row.metadata),
});

const signAuthToken = (user) =>
  jwt.sign(
    {
      sub: user.id,
      sv: user.sessionVersion,
      role: user.role,
      patientId: user.patientId,
      email: user.email,
    },
    env.jwtSecret,
    { algorithm: 'HS256', expiresIn: env.jwtExpiresIn },
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
    u.session_version,
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

const relationshipBaseSelect = (includeSensitive = true) => `
  SELECT
    cr.id,
    cr.patient_id,
    cr.psychologist_user_id,
    cr.status,
    ${includeSensitive ? 'cr.notes, cr.invite_code, cr.invite_expires_at,' : ''}
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
const isPatientActor = (actor) => actor?.role === 'patient';
const isPsychologistActor = (actor) => actor?.role === 'psychologist';
const createInviteCode = () => randomBytes(4).toString('hex').toUpperCase();

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

const getRelationshipById = async (client, relationshipId, operational = false) => {
  const result = await client.query(
    `
      ${relationshipBaseSelect(!operational)}
      WHERE cr.id = $1
      LIMIT 1
    `,
    [relationshipId],
  );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  if (operational) return mapOperationalRelationshipRow(row);

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

export const verifyAuthToken = (token) => {
  const payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
  if (typeof payload !== 'object' || typeof payload.sub !== 'string' || !payload.sub.trim()) {
    throw createAuthError('Invalid token subject', 401);
  }
  return payload;
};

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
        u.session_version,
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

  const user = mapUserRow(userRow);
  ensureAccountCanAuthenticate(user, env);

  return {
    user,
    token: signAuthToken(user),
  };
};

export const requestPasswordReset = async ({ email }) => {
  // No email delivery exists yet. Never expose a bearer reset token remotely.
  if (!env.localDevelopment) throw createAuthError('Password recovery is not configured', 503);
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

    // Use the same user-first lock order as confirmation, including concurrent requests.
    const activeUser = await client.query('SELECT id FROM users WHERE id=$1 AND is_active=TRUE FOR NO KEY UPDATE', [user.id]);
    if (!activeUser.rows[0]) {
      await client.query('COMMIT');
      return { sent: true, preview: null };
    }

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

    await logAuditEvent(client, {
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
      preview: buildPasswordResetPreview({ token: rawToken, expiresAt }),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const confirmPasswordReset = async ({ token, password }) => {
  if (!env.localDevelopment) throw createAuthError('Password recovery is not configured', 503);
  const tokenHash = hashPasswordResetToken(token.trim());
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // Serialize all resets for the same account, even with different reset tokens.
    // Re-read token usability after acquiring the user lock (READ COMMITTED).
    const lockedUser = await client.query(`
      SELECT u.id FROM users u
      JOIN password_reset_tokens prt ON prt.user_id = u.id
      WHERE prt.token_hash = $1 AND u.is_active = TRUE
      FOR NO KEY UPDATE OF u
    `, [tokenHash]);
    if (!lockedUser.rows[0]) throw createAuthError('Password reset token is invalid or expired', 400);

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

    await logAuditEvent(client, {
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

export const registerPatientUser = async (payload) => {
  const errors = registrationErrors(payload);
  if (errors.length) throw createAuthError(errors.join('; '), 400);
  const { firstName, lastName = '', password, birthDate } = payload;
  const email = normalizeEmail(payload.email);
  const phone = normalizePhone(payload.phone);
  // Hash even on a duplicate; public outcome never discloses account existence.
  const passwordHash = await bcrypt.hash(password, 10);
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 4081))', [email]);
    const exists = await client.query('SELECT 1 FROM users WHERE lower(email)=lower($1)', [email]);
    if (!exists.rowCount) {
      const patientId = randomUUID(), userId = randomUUID();
      await client.query(
        `INSERT INTO patients(id,first_name,last_name,full_name,email,phone,global_birth_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [patientId, firstName.trim(), lastName.trim(), (firstName.trim() + ' ' + lastName.trim()).trim(), email, phone, birthDate]);
      await client.query(
        `INSERT INTO users(id,first_name,last_name,email,password_hash,role,patient_id)
         VALUES ($1,$2,$3,$4,$5,'patient',$6)`,
        [userId, firstName.trim(), lastName.trim(), email, passwordHash, patientId]);
    }
    await client.query('COMMIT');
    return { accepted: true };
  } catch (error) {
    await client.query('ROLLBACK');
    // A concurrent older registration may race our pre-check; still no disclosure.
    if (error.code === '23505') return { accepted: true };
    throw error;
  } finally { client.release(); }
};

export const registerPsychologistUser = async ({
  firstName,
  lastName = '',
  email,
  password,
  professionalTitle,
  licenseNumber = '',
}) => {
  email = normalizeEmail(email);
  const passwordHash = await bcrypt.hash(password, 10);
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 4081))', [email]);
    if ((await client.query('SELECT 1 FROM users WHERE lower(email)=lower($1)', [email])).rowCount) {
      await client.query('COMMIT');
      return { accepted: true };
    }

    const userId = randomUUID();
    const normalizedFirstName = firstName.trim();
    const normalizedLastName = lastName.trim();

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

    await client.query(
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

    return { accepted: true };
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') return { accepted: true };
    throw error;
  } finally {
    client.release();
  }
};

export const listPendingPsychologistUsers = async (actor) => {
  ensureBackofficeViewer(actor);
  const result = await db.query(
    `
      ${baseUserSelect}
      WHERE u.role = 'psychologist'
        AND COALESCE(pp.approval_status, 'pending_review') = 'pending_review'
      ORDER BY u.created_at ASC
    `,
    [],
  );

  return result.rows.map(mapOperationalUserRow);
};

export const listBackofficeUsers = async (actor) => {
  ensureBackofficeViewer(actor);
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

  return result.rows.map(mapOperationalUserRow);
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
      ${relationshipBaseSelect(!isBackofficeActor(actor))}
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
    isBackofficeActor(actor) ? mapOperationalRelationshipRow(row) : mapCareRelationshipRow({
      ...row,
      psychologist_full_name: `${row.psychologist_first_name} ${row.psychologist_last_name}`.trim(),
    }),
  );
};

export const listAuditLogs = async ({
  actor,
  action = '',
  actorRole = '',
  search = '',
} = {}) => {
  ensureBackofficeViewer(actor);
  const params = [];
  const filters = [
    "al.patient_id IS NULL",
    `((al.action = 'psychologist_reviewed' AND al.entity_type = 'psychologist_profile')
      OR (al.action IN ('password_reset_requested', 'password_reset_confirmed') AND al.entity_type = 'auth'))`,
  ];

  if (action.trim()) {
    params.push(action.trim());
    filters.push(`al.action = $${params.length}`);
  }

  if (actorRole.trim()) {
    params.push(actorRole.trim());
    filters.push(`al.actor_role = $${params.length}`);
  }

  if (search.trim()) {
    params.push(`%${search.trim().toLowerCase()}%`);
    filters.push(`(
      LOWER(COALESCE(actor.first_name, '') || ' ' || COALESCE(actor.last_name, '')) LIKE $${params.length}
      OR LOWER(COALESCE(target.first_name, '') || ' ' || COALESCE(target.last_name, '')) LIKE $${params.length}
      OR LOWER(al.action) LIKE $${params.length}
    )`);
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

  const result = await db.query(
    `
      SELECT
        al.id,
        al.action,
        al.entity_type,
        al.actor_user_id,
        al.actor_role,
        al.target_user_id,
        CASE WHEN al.action = 'psychologist_reviewed'
          AND al.metadata->>'approvalStatus' IN ('active', 'pending_review', 'rejected', 'suspended')
          THEN jsonb_build_object('approvalStatus', al.metadata->>'approvalStatus')
          ELSE '{}'::jsonb END AS metadata,
        al.created_at,
        actor.first_name AS actor_first_name,
        actor.last_name AS actor_last_name,
        actor.email AS actor_email,
        target.first_name AS target_first_name,
        target.last_name AS target_last_name,
        target.email AS target_email
      FROM audit_logs al
      LEFT JOIN users actor
        ON actor.id = al.actor_user_id
      LEFT JOIN users target
        ON target.id = al.target_user_id
      ${whereClause}
      ORDER BY al.created_at DESC
      LIMIT 80
    `,
    params,
  );

  return result.rows.map(mapAuditLogRow);
};

const denyLegacyRelationshipWrite = (actor) => {
  ensureClinicalActor(actor);
  throw createAuthError('Las nuevas vinculaciones están temporalmente deshabilitadas. Los vínculos existentes se conservan.', 403);
};

export const createCareRelationship = async ({ actor }) => {
  ensureBackofficeManager(actor);
  throw createAuthError('Administrative care relationship changes are temporarily disabled; bilateral clinical authorization is required', 403);
};
export const updateCareRelationship = createCareRelationship;
export const requestCareRelationship = async ({ actor }) => denyLegacyRelationshipWrite(actor);
export const inviteCareRelationship = async ({ actor }) => denyLegacyRelationshipWrite(actor);
export const respondToCareRelationship = async ({ actor }) => denyLegacyRelationshipWrite(actor);
export const acceptCareRelationshipInvite = async ({ actor }) => denyLegacyRelationshipWrite(actor);

export const reviewPsychologistUser = async ({
  reviewerUserId,
  reviewerRole = '',
  psychologistUserId,
  approvalStatus,
  reviewNotes = '',
}) => {
  ensureBackofficeManager({ id: reviewerUserId, role: reviewerRole });
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `
        UPDATE psychologist_profiles
        SET
          approval_status = $2,
          review_notes = CASE WHEN $3 <> '' THEN $3 ELSE review_notes END,
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

    await logAuditEvent(client, {
      actorUserId: reviewerUserId,
      actorRole: reviewerRole,
      action: 'psychologist_reviewed',
      entityType: 'psychologist_profile',
      entityId: psychologistUserId,
      targetUserId: psychologistUserId,
      metadata: {
        approvalStatus,
      },
    });

    await client.query('COMMIT');

    const reviewedUser = await getUserById(psychologistUserId);

    if (!reviewedUser) {
      throw createAuthError('Psychologist user not found', 404);
    }

    return projectOperationalUser(reviewedUser);
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
