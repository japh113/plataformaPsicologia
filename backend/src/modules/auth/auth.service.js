import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../../config/db.js';
import env from '../../config/env.js';

const mapUserRow = (row) => ({
  id: String(row.id),
  firstName: row.first_name,
  lastName: row.last_name,
  fullName: `${row.first_name} ${row.last_name}`.trim(),
  email: row.email,
  role: row.role,
  patientId: row.patient_id ? String(row.patient_id) : null,
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

export const verifyAuthToken = (token) => jwt.verify(token, env.jwtSecret);

export const getUserById = async (id) => {
  const result = await db.query(
    `
      SELECT
        id,
        first_name,
        last_name,
        email,
        role,
        patient_id
      FROM users
      WHERE id = $1
        AND is_active = TRUE
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
        id,
        first_name,
        last_name,
        email,
        password_hash,
        role,
        patient_id
      FROM users
      WHERE LOWER(email) = LOWER($1)
        AND is_active = TRUE
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

  return {
    user,
    token: signAuthToken(user),
  };
};
