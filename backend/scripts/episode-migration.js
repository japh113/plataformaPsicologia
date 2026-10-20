import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import pg from 'pg';

export const sha256 = value => createHash('sha256').update(value).digest('hex');
const sqlRoot = new URL('../sql/migrations/', import.meta.url);
export async function loadMigrations(root = sqlRoot) {
  const manifest = JSON.parse(await fs.readFile(new URL('manifest.json', root), 'utf8'));
  const migrations = [];
  for (const entry of manifest) {
    const sql = await fs.readFile(new URL(entry.file, root), 'utf8');
    if (sha256(sql) !== entry.sha256) throw new Error('Incompatible file checksum: ' + entry.version);
    migrations.push({ ...entry, sql });
  }
  if (migrations.map(m => m.version).join(',') !== '001,002,003,004,005,006') throw new Error('Incompatible migration versions');
  return migrations;
}

// Deliberately does not import app env/db or read .env. No implicit dev destination.
export function explicitConnection(connectionString, expectedDatabase) {
  if (!connectionString || !expectedDatabase) throw new Error('Explicit URL and --database name required');
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname ||
      decodeURIComponent(url.pathname.slice(1)) !== expectedDatabase ||
      [...url.searchParams.keys()].some(k => ['host', 'hostaddr', 'port', 'database', 'dbname', 'user', 'options', 'service'].includes(k))) {
    throw new Error('Explicit database destination mismatch or unsupported connection override');
  }
  return new pg.Client({ connectionString, application_name: 'psicopanel-explicit-migration',
    connectionTimeoutMillis: 10000 });
}
export async function verifyDestination(client, expectedDatabase) {
  const { rows: [row] } = await client.query('SELECT current_database() AS name, current_schema() AS schema');
  if (row.name !== expectedDatabase || row.schema !== 'public') throw new Error('Database/schema destination mismatch');
}

export async function verifyPrerequisites(client, migrations) {
  // Check exact installed bodies, not merely the presence of similarly named functions.
  for (const migration of migrations.slice(0, 2)) {
    const matches = [...migration.sql.matchAll(/CREATE OR REPLACE FUNCTION (\w+)\(\) RETURNS trigger\s+LANGUAGE plpgsql AS \$\$([\s\S]*?)\$\$;/g)];
    if (!matches.length) throw new Error('Missing prerequisite specification');
    for (const [, name, source] of matches) {
      const { rows } = await client.query(`SELECT p.prosrc, p.prosecdef, p.prorettype = 'trigger'::regtype AS returns_trigger,
        l.lanname, p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname='public' AND p.proname=$1 AND p.pronargs=0`, [name]);
      if (rows.length !== 1 || rows[0].prosrc !== source || rows[0].prosecdef ||
          !rows[0].returns_trigger || rows[0].lanname !== 'plpgsql' || rows[0].proconfig !== null) {
        throw new Error('Missing or incompatible prerequisite function: ' + name);
      }
    }
  }
  const expected = [];
  for (const table of ['patients', 'patient_intakes', 'appointments', 'patient_clinical_notes', 'patient_tasks']) {
    expected.push([table, 'preserve_clinical_row', 'preserve_clinical_record', 27]);
    expected.push([table, 'prevent_clinical_truncate', 'preserve_clinical_record', 34]);
  }
  expected.push(['clinical_record_history', 'clinical_history_immutable', 'protect_clinical_history', 58],
    ['appointments', 'enforce_clinical_appointment', 'enforce_clinical_appointment', 19],
    ['patient_clinical_notes', 'enforce_clinical_appointment', 'enforce_clinical_appointment', 23],
    ['users', 'enforce_auth_session_version', 'enforce_auth_session_version', 19],
    ['psychologist_profiles', 'revoke_psychologist_sessions', 'revoke_psychologist_sessions', 25]);
  const triggers = (await client.query(`SELECT c.relname, t.tgname, p.proname, t.tgtype, t.tgenabled,
    t.tgqual IS NULL AS unconditional, t.tgattr::text AS columns, pn.nspname AS function_schema, t.tgnargs
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace WHERE n.nspname='public' AND NOT t.tgisinternal`)).rows;
  for (const [table, name, fn, type] of expected) {
    const trigger = triggers.find(t => t.relname === table && t.tgname === name);
    if (!trigger || trigger.proname !== fn || trigger.tgtype !== type || trigger.tgenabled !== 'O' ||
        trigger.function_schema !== 'public' || trigger.tgnargs !== 0 || !trigger.unconditional || (table !== 'psychologist_profiles' && trigger.columns !== '')) {
      throw new Error('Missing or incompatible prerequisite trigger: ' + table + '.' + name);
    }
  }
  const { rows: [shape] } = await client.query(`SELECT
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='patient_tasks'
      AND column_name='retired_at' AND data_type='timestamp with time zone') AS retired,
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users'
      AND column_name='session_version' AND data_type='integer' AND is_nullable='NO' AND column_default='0') AS sessions,
    EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='users'::regclass AND contype='c'
      AND pg_get_constraintdef(oid)='CHECK ((session_version >= 0))' AND convalidated) AS session_check,
    NOT EXISTS (SELECT 1 FROM pg_constraint WHERE contype='f' AND confdeltype IN ('c','n')
      AND connamespace='public'::regnamespace
      AND conrelid IN ('patient_intakes'::regclass,'users'::regclass,'care_relationships'::regclass,
        'psychologist_patient_access'::regclass,'patient_tasks'::regclass,'appointments'::regclass,
        'appointment_waitlist_entries'::regclass,'patient_clinical_notes'::regclass,'audit_logs'::regclass)
      AND confrelid IN ('patients'::regclass,'appointments'::regclass,'patient_clinical_notes'::regclass,'users'::regclass)) AS safe_fks`);
  if (Object.values(shape).some(value => !value)) throw new Error('Missing or incompatible 001/002 schema prerequisites');
  const requiredReferences = {
    users: { patient_id: 'patients' },
    patient_intakes: { patient_id: 'patients', completed_by_user_id: 'users', updated_by_user_id: 'users' },
    care_relationships: { patient_id: 'patients', psychologist_user_id: 'users', created_by_user_id: 'users', approved_by_user_id: 'users' },
    psychologist_patient_access: { patient_id: 'patients', psychologist_user_id: 'users' },
    appointments: { patient_id: 'patients' },
    appointment_waitlist_entries: { patient_id: 'patients' },
    patient_clinical_notes: { patient_id: 'patients', appointment_id: 'appointments', created_by_user_id: 'users' },
    patient_tasks: { patient_id: 'patients', clinical_note_id: 'patient_clinical_notes' },
    audit_logs: { actor_user_id: 'users', target_user_id: 'users', patient_id: 'patients' },
  };
  const references = (await client.query(`SELECT c.relname AS child, a.attname AS column_name,
    r.relname AS parent, ra.attname AS parent_column, co.confdeltype, co.convalidated,
    NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgconstraint=co.oid AND t.tgenabled<>'O') AS enabled
    FROM pg_constraint co JOIN pg_class c ON c.oid=co.conrelid JOIN pg_class r ON r.oid=co.confrelid
    JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=co.conkey[1]
    JOIN pg_attribute ra ON ra.attrelid=r.oid AND ra.attnum=co.confkey[1]
    WHERE co.contype='f' AND co.connamespace='public'::regnamespace
      AND cardinality(co.conkey)=1 AND cardinality(co.confkey)=1`)).rows;
  for (const [table, columns] of Object.entries(requiredReferences)) {
    for (const [column, parent] of Object.entries(columns)) {
      if (!references.some(r => r.child === table && r.column_name === column && r.parent === parent &&
          r.parent_column === 'id' && r.confdeltype === 'r' && r.convalidated && r.enabled)) {
        throw new Error('Missing or incompatible prerequisite FK: ' + table + '.' + column);
      }
    }
  }
  // The column-specific 002 trigger must still include BOTH approval_status and user_id.
  const profileColumns = (await client.query(`SELECT a.attname FROM pg_trigger t
    JOIN pg_attribute a ON a.attrelid=t.tgrelid AND a.attnum=ANY(t.tgattr::smallint[])
    WHERE t.tgrelid='psychologist_profiles'::regclass AND t.tgname='revoke_psychologist_sessions'
    ORDER BY a.attname`)).rows.map(r => r.attname);
  if (profileColumns.join(',') !== 'approval_status,user_id') throw new Error('Incompatible session revocation trigger columns');
}

// Installation-specific catalog fingerprint: no counters, sequence values or clinical data.
// Any subsequent schema change requires an explicit, reviewed successor migration.
export async function catalogChecksum(client) {
  const queries = [
    `SELECT c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity, c.relacl::text
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S') ORDER BY c.relname`,
    `SELECT c.relname, a.attname, format_type(a.atttypid,a.atttypmod) AS type, a.attnotnull,
      a.attidentity, a.attgenerated, pg_get_expr(d.adbin,d.adrelid) AS default_expression
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped AND c.relkind IN ('r','p','v','m')
      ORDER BY c.relname,a.attnum`,
    `SELECT c.relname, co.conname, co.convalidated, pg_get_constraintdef(co.oid) AS definition
      FROM pg_constraint co JOIN pg_class c ON c.oid=co.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' ORDER BY c.relname,co.conname`,
    `SELECT v.tablename,v.indexname,v.indexdef,i.indisvalid,i.indisready,i.indislive
      FROM pg_indexes v JOIN pg_class c ON c.relname=v.indexname AND c.relnamespace='public'::regnamespace
      JOIN pg_index i ON i.indexrelid=c.oid WHERE v.schemaname='public' ORDER BY v.tablename,v.indexname`,
    `SELECT c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t
      JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' ORDER BY c.relname,t.tgname`,
    `SELECT p.proname,pg_get_functiondef(p.oid) AS definition,p.proacl::text FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f'
      ORDER BY p.proname,pg_get_function_identity_arguments(p.oid)`,
  ];
  const results = [];
  for (const query of queries) results.push((await client.query(query)).rows);
  return sha256(JSON.stringify(results));
}

export async function migrate(client, { expectedDatabase, target = '003' } = {}) {
  if (!['003', '004', '005', '006'].includes(target)) throw new Error('Unsupported target version');
  const migrations = await loadMigrations();
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL search_path = public, pg_catalog");
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SET LOCAL statement_timeout = '120s'");
    // Shares the initializer's lock to exclude concurrent fresh initialization.
    await client.query('SELECT pg_advisory_xact_lock(728194601)');
    await verifyDestination(client, expectedDatabase);
    await verifyPrerequisites(client, migrations);
    const ledgerExists = (await client.query("SELECT to_regclass('public.psicopanel_schema_migrations') AS name")).rows[0].name;
    const ledger = ledgerExists ? (await client.query('SELECT * FROM psicopanel_schema_migrations ORDER BY version')).rows : [];
    for (const row of ledger) {
      const source = migrations.find(m => m.version === row.version);
      if (!source || source.sha256 !== row.file_sha256 || source.file !== row.file_name) {
        throw new Error('Incompatible recorded migration version/checksum: ' + row.version);
      }
    }
    if (ledgerExists && !['001,002,003', '001,002,003,004', '001,002,003,004,005', '001,002,003,004,005,006'].includes(ledger.map(r => r.version).join(','))) {
      throw new Error('Incompatible or incomplete migration ledger');
    }
    if (ledger.length) {
      const applied = ledger.at(-1);
      if (applied.version > target) throw new Error('Target older than installed schema; downgrade forbidden');
      const major = (await client.query("SHOW server_version_num")).rows[0].server_version_num.slice(0, -4);
      if (applied.server_major !== major || applied.catalog_sha256 !== await catalogChecksum(client)) {
        throw new Error('Schema drift or incompatible PostgreSQL version; no SQL applied');
      }
      if (applied.version === target) {
        await client.query('COMMIT');
        return { status: 'already-applied', version: target };
      }
      for (const next of migrations.filter(m => m.version>applied.version && m.version<=target)) {
        await client.query("SELECT set_config('psicopanel.migration_target',$1,true)", [next.version]);
        await client.query(next.sql);
        await client.query(`INSERT INTO psicopanel_schema_migrations(version,file_name,file_sha256,catalog_sha256,server_major)
          VALUES ($1,$2,$3,$4,$5)`, [next.version,next.file,next.sha256,await catalogChecksum(client),major]);
      }
      await client.query('COMMIT');
      return { status: 'applied', version: target };
    }
    const footprints = (await client.query(`SELECT
      EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND left(c.relname,13)='professional_') OR
      EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('reserve_professional_public_id','protect_professional_snapshot','preserve_professional_data','enforce_professional_profile_update','enforce_professional_validity_update','enforce_professional_photo_update','check_professional_pending_version')) OR
      to_regclass('public.contact_change_requests') IS NOT NULL OR
      to_regclass('public.contact_change_notices') IS NOT NULL OR
      to_regclass('public.contact_change_events') IS NOT NULL OR
      to_regclass('public.contact_verification_challenges') IS NOT NULL OR
      to_regclass('public.contact_verification_state') IS NOT NULL OR
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='patients' AND column_name='global_birth_date') OR
      to_regclass('public.clinical_episodes') IS NOT NULL OR EXISTS (
        SELECT 1 FROM information_schema.columns WHERE table_schema='public'
        AND table_name IN ('appointments','patient_clinical_notes','patient_tasks','appointment_waitlist_entries')
        AND column_name IN ('episode_id','episode_scope_id')) AS found`)).rows[0].found;
    if (footprints) throw new Error('Untracked episode schema; no adoption or automatic repair');
    // A legacy cross-patient task cannot be made valid by guessing its owner.
    const inconsistent = (await client.query(`SELECT
      (SELECT count(*) FROM patient_clinical_notes n JOIN appointments a ON a.id=n.appointment_id WHERE n.patient_id<>a.patient_id)
      + (SELECT count(*) FROM patient_tasks t JOIN patient_clinical_notes n ON n.id=t.clinical_note_id WHERE t.patient_id<>n.patient_id) AS count`)).rows[0].count;
    if (Number(inconsistent)) throw new Error('Inconsistent legacy relationships; run read-only diagnostics; no rows changed');
    await client.query(`CREATE TABLE psicopanel_schema_migrations (
      version TEXT PRIMARY KEY, file_name TEXT NOT NULL, file_sha256 TEXT NOT NULL,
      catalog_sha256 TEXT, server_major TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    ); REVOKE ALL ON psicopanel_schema_migrations FROM PUBLIC`);
    await client.query("SET LOCAL psicopanel.migration_target = '003'");
    await client.query(migrations[2].sql);
    const catalog = await catalogChecksum(client);
    const major = (await client.query('SHOW server_version_num')).rows[0].server_version_num.slice(0, -4);
    for (const migration of migrations.slice(0, 3)) {
      await client.query(`INSERT INTO psicopanel_schema_migrations(version,file_name,file_sha256,catalog_sha256,server_major)
        VALUES ($1,$2,$3,$4,$5)`, [migration.version, migration.file, migration.sha256,
        migration.version === '003' ? catalog : null, major]);
    }
    for (const next of migrations.filter(m => m.version>'003' && m.version<=target)) {
      await client.query("SELECT set_config('psicopanel.migration_target',$1,true)", [next.version]);
      await client.query(next.sql);
      await client.query(`INSERT INTO psicopanel_schema_migrations(version,file_name,file_sha256,catalog_sha256,server_major)
        VALUES ($1,$2,$3,$4,$5)`, [next.version,next.file,next.sha256,await catalogChecksum(client),major]);
    }
    await client.query('COMMIT');
    return { status: 'applied', version: target };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
