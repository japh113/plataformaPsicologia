import { accountLockSecurityCatalog } from './account-lock-contract.js';
export const originSignature = 'public.recognize_private_note_origin_v1(bigint,bigint,text,text)';
const roots = `SELECT proowner AS oid FROM pg_proc WHERE oid=to_regprocedure('${originSignature}')
  UNION SELECT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
  WHERE p.oid=to_regprocedure('${originSignature}') AND a.grantee<>0`;
export async function originResolverSecurityCatalog(client) {
  const result = await accountLockSecurityCatalog(client, originSignature);
  // Additional 011-only coverage: effective access outside public as well as
  // table ownership/DML everywhere. PUBLIC grants count even without USAGE.
  result.push((await client.query(`SELECT r.rolname,n.nspname,c.relname,a.attname,
    has_column_privilege(r.oid,c.oid,a.attnum,'SELECT,INSERT,UPDATE,REFERENCES') AS access
    FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    WHERE r.oid IN (${roots}) AND n.nspname<>'public' AND n.nspname!~'^pg_'
    AND n.nspname<>'information_schema' AND c.relkind IN ('r','p','v','m')
    ORDER BY r.rolname,n.nspname,c.relname,a.attnum`)).rows);
  result.push((await client.query(`SELECT r.rolname,n.nspname,c.relname,c.relowner=r.oid AS owns,
    CASE WHEN c.relkind='S' THEN has_sequence_privilege(r.oid,c.oid,'USAGE,SELECT,UPDATE')
      ELSE has_table_privilege(r.oid,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES') END AS access
    FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE r.oid IN (${roots}) AND n.nspname!~'^pg_' AND n.nspname<>'information_schema'
    AND c.relkind IN ('r','p','v','m','S') ORDER BY r.rolname,n.nspname,c.relname`)).rows);
  result.push((await client.query(`SELECT r.rolname,
    has_parameter_privilege(r.oid,'session_replication_role','SET') AS can_set,
    has_parameter_privilege(r.oid,'session_replication_role','ALTER SYSTEM') AS can_alter_system
    FROM pg_roles r WHERE r.oid IN (${roots}) ORDER BY r.rolname`)).rows);
  result.push((await client.query(`SELECT p.parname,pg_get_userbyid(a.grantor) AS grantor,
    CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee,
    a.privilege_type,a.is_grantable FROM pg_parameter_acl p CROSS JOIN LATERAL aclexplode(p.paracl) a
    WHERE p.parname='session_replication_role' AND (a.grantee=0 OR a.grantee IN (${roots}))
    ORDER BY p.parname,grantor,grantee,a.privilege_type,a.is_grantable`)).rows);
  result.push((await client.query(`SELECT d.datname,CASE WHEN s.setrole=0 THEN 'ALL' ELSE pg_get_userbyid(s.setrole) END AS role,config
    FROM pg_db_role_setting s LEFT JOIN pg_database d ON d.oid=s.setdatabase CROSS JOIN LATERAL unnest(s.setconfig) config
    WHERE s.setdatabase IN(0,(SELECT oid FROM pg_database WHERE datname=current_database()))
    AND (s.setrole=0 OR s.setrole IN (${roots})) AND config LIKE 'session_replication_role=%'
    ORDER BY d.datname NULLS FIRST,role,config`)).rows);
  return result;
}
const readerColumns = {
  psychologist_profiles: ['user_id','approval_status'],
  clinical_episodes: ['id','modality','status','psychologist_user_id','created_by_user_id','participant_one_id','participant_two_id'],
  clinical_episode_participants: ['episode_id','patient_id','slot','psychologist_user_id'],
  patient_clinical_notes: ['id','episode_id','patient_id','created_by_user_id','appointment_id'],
};
const columns = {
  patient_clinical_notes: ['id','episode_id','patient_id','created_by_user_id'],
  clinical_episode_participants: ['episode_id','patient_id','psychologist_user_id'],
  clinical_note_private_origins: ['note_id','episode_id','subject_patient_id','author_user_id',
    'contract_version','registration_kind','registered_by_user_id'],
};
export async function verifyOriginResolverContract(client, migration, reader) {
  const fail = () => { throw new Error('Schema drift or incompatible 011 origin resolver contract; no adoption or repair'); };
  const security = await originResolverSecurityCatalog(client);
  if (security[9].some(r => r.access) || security[10].some(r => r.access || r.owns)) fail();
  if (security[11].some(r => r.can_set || r.can_alter_system) || security[12].length ||
      security[13].some(r => !['origin','local'].includes(r.config.split('=')[1]))) fail();
  const fn = security[0][0];
  const body = migration.sql.match(/SET search_path=pg_catalog,pg_temp AS \$\$([\s\S]*?)\$\$;/)?.[1];
  const { rows: [db] } = await client.query('SELECT oid FROM pg_database WHERE datname=current_database()');
  const owner = 'psicopanel_origin_resolver_owner_' + db.oid;
  if (security[0].length !== 1 || !fn || !body || fn.owner !== owner ||
      !fn.prosecdef || !fn.proisstrict || fn.provolatile !== 's' || fn.proparallel !== 'u' ||
      JSON.stringify(fn.proconfig) !== JSON.stringify(['search_path=pg_catalog, pg_temp'])) fail();
  const shape = (await client.query(`SELECT p.prorettype='boolean'::regtype AS boolean_result,
    p.prosrc,p.proretset,l.lanname FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang
    WHERE p.oid=to_regprocedure($1)`, [originSignature])).rows[0];
  if (shape?.prosrc !== body || !shape?.boolean_result || shape.proretset || shape.lanname !== 'sql') fail();
  const acl = (await client.query(`SELECT r.rolname,a.grantee,a.privilege_type,a.is_grantable
    FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a LEFT JOIN pg_roles r ON r.oid=a.grantee
    WHERE p.oid=to_regprocedure($1)`, [originSignature])).rows;
  if (acl.length !== 2 || new Set(acl.map(a => a.rolname)).size !== 2 ||
      acl.some(a => ![owner,reader].includes(a.rolname) || a.grantee === 0 ||
        a.privilege_type !== 'EXECUTE' || a.is_grantable)) fail();
  if (security[1].length !== 2 || security[1].some(r => ![owner,reader].includes(r.rolname) ||
      r.rolsuper || r.rolinherit || r.rolcreatedb || r.rolcreaterole || r.rolreplication ||
      r.rolbypassrls || r.rolconfig !== null || r.rolcanlogin !== (r.rolname === reader)) || security[2].length) fail();
  // Reader is separately checked against 009's unchanged column matrix. Only
  // this new owner gains provenance SELECT; no existing owner gains anything.
  for (const r of security[3]) {
    const expected = r.rolname === owner ? columns : readerColumns;
    if (r.can_select !== (expected[r.relname]?.includes(r.attname) === true) ||
        r.can_insert || r.can_update || r.can_reference) fail();
  }
  if (security[5].some(r => r.can_create || [owner,reader].includes(r.owner)) ||
      security[6].some(r => r.can_create || [owner,reader].includes(r.owner)) ||
      security[8].some(r => r.can_use || r.can_select || r.can_update)) fail();
  for (const r of security[7]) {
    const lock = r.rolname === reader && r.nspname === 'public' && r.proname === 'lock_account_session' && r.arguments === 'account_id text';
    if (r.can_execute && !r.account_lock && !lock &&
        (r.initially_restricted || r.prosecdef || (!r.bootstrap && !r.lanpltrusted))) fail();
  }
  for (const name of ['pg_read_file','pg_read_binary_file','pg_ls_dir','pg_stat_file','lo_import','lo_export']) {
    if (!security[7].some(r => r.nspname === 'pg_catalog' && r.proname === name &&
        r.bootstrap && r.privtype === 'i' && r.initially_restricted)) fail();
  }
  if ((await client.query(`SELECT FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE r.rolname=ANY($1::text[]) AND n.nspname='public' AND c.relkind IN ('r','p','v','m')
    AND has_table_privilege(r.oid,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')`, [[owner,reader]])).rowCount) fail();
}
