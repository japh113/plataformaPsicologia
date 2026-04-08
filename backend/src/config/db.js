import pg from 'pg';
import env from './env.js';

const { Pool } = pg;

const poolConfig = env.databaseUrl
  ? {
      connectionString: env.databaseUrl,
      ssl: env.dbSsl ? { rejectUnauthorized: false } : false,
    }
  : {
      host: env.dbHost,
      port: env.dbPort,
      database: env.dbName,
      user: env.dbUser,
      password: env.dbPassword,
      ssl: env.dbSsl ? { rejectUnauthorized: false } : false,
    };

const pool = new Pool(poolConfig);

pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL client error', error);
});

export const db = {
  query: (text, params = []) => pool.query(text, params),
  getClient: () => pool.connect(),
  close: () => pool.end(),
};

export default db;
