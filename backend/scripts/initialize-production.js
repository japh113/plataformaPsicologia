import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import db from '../src/config/db.js';
import env from '../src/config/env.js';

// This is a fresh-install command, never an upgrade path. No demo seed is read.
export const initializeProduction = async (database = db, config = env) => {
  if (config.nodeEnv !== 'production' || config.localDevelopment) {
    throw new Error('db:init:production requires NODE_ENV=production and local development disabled');
  }
  const client = await database.getClient();
  try {
    // Serialize this initializer and refuse any existing application relations.
    await client.query("SELECT pg_advisory_lock(728194601)");
    const existing = await client.query(`SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_toast%'
        AND n.nspname NOT LIKE 'pg_temp%' AND c.relkind IN ('r','p','v','m','S','f') LIMIT 1`);
    if (existing.rowCount) throw new Error('Refusing initialization: database is not empty; no SQL was applied');

    const sql = name => fs.readFile(new URL(`../sql/${name}`, import.meta.url), 'utf8');
    await client.query(await sql('schema.sql'));
    await client.query(await sql('migrations/001_clinical_data_integrity.sql'));
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock(728194601)');
    } finally { client.release(); }
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await initializeProduction();
    console.log('Initialized empty production database without demo accounts');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
}
