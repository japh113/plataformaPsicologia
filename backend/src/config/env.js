import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isLocalDevelopment, resolveJwtSecret, resolveRestrictedSecret } from './security.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envFilePath = path.resolve(__dirname, '../../.env');

const loadEnvFile = () => {
  if (!fs.existsSync(envFilePath)) {
    return;
  }

  const fileContents = fs.readFileSync(envFilePath, 'utf8');
  const lines = fileContents.split(/\r?\n/);

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf('=');

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    const rawValue = trimmedLine.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, '');

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
};

loadEnvFile();

const parsePort = (value, fallback) => {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : fallback;
};

const env = {
  port: parsePort(process.env.PORT, 5000),
  nodeEnv: process.env.NODE_ENV || 'development',
  localDevelopment: isLocalDevelopment(process.env),
  databaseUrl: process.env.DATABASE_URL || '',
  dbHost: process.env.PGHOST || 'localhost',
  dbPort: parsePort(process.env.PGPORT, 5432),
  dbName: process.env.PGDATABASE || 'psicopanel',
  dbUser: process.env.PGUSER || 'postgres',
  dbPassword: process.env.PGPASSWORD || '',
  dbSsl: process.env.DB_SSL === 'true',
  jwtSecret: resolveJwtSecret(process.env),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  d2Enabled: process.env.D2_ENABLED === 'true',
  restrictedJwtSecret: resolveRestrictedSecret(process.env,resolveJwtSecret(process.env)),
  professionalMediaRoot: process.env.PROFESSIONAL_MEDIA_ROOT || '',
  passwordResetTokenTtlMinutes: parsePort(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES, 30),
  verificationDelivery: process.env.VERIFICATION_DELIVERY || 'disabled',
  verificationSecret: process.env.VERIFICATION_SECRET || '',
  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:5173',
};

export default env;
