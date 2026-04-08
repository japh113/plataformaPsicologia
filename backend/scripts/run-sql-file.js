import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from '../src/config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sqlFileArgument = process.argv[2];

if (!sqlFileArgument) {
  console.error('Missing SQL file path. Usage: node scripts/run-sql-file.js sql/schema.sql');
  process.exit(1);
}

const resolvedFilePath = path.resolve(__dirname, '..', sqlFileArgument);

try {
  const sql = await fs.readFile(resolvedFilePath, 'utf8');
  await db.query(sql);
  console.log(`Executed SQL file: ${sqlFileArgument}`);
  await db.close();
} catch (error) {
  console.error(`Failed to execute SQL file: ${sqlFileArgument}`);
  console.error(error.message);
  await db.close();
  process.exit(1);
}
