// 009-only security catalog. Never append these results to a 003-008 ledger.
const signature = 'public.lock_account_session(text)';
const rootRoles = `SELECT proowner AS oid FROM pg_proc WHERE oid=to_regprocedure('${signature}')
  UNION SELECT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
    WHERE p.oid=to_regprocedure('${signature}') AND a.grantee<>0`;
const roleGraph = `WITH RECURSIVE related(oid) AS (
  ${rootRoles}
  UNION SELECT CASE WHEN m.roleid=r.oid THEN m.member ELSE m.roleid END
    FROM related r JOIN pg_auth_members m ON r.oid IN (m.roleid,m.member)
) SELECT oid FROM related`;

export async function accountLockSecurityCatalog(client, capability = signature) {
  const roots = rootRoles.replaceAll(signature, capability);
  const related = roleGraph.replaceAll(signature, capability);
  const results = [];
  for (const query of [
    `SELECT p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,
      pg_get_functiondef(p.oid) AS definition,r.rolname AS owner,p.proacl::text,
      p.prosecdef,p.proconfig,p.provolatile,p.proparallel,p.proisstrict
      FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner
      WHERE p.oid=to_regprocedure('${capability}')`,
    `SELECT r.rolname,r.rolsuper,r.rolinherit,r.rolcreaterole,r.rolcreatedb,r.rolcanlogin,
      r.rolreplication,r.rolbypassrls,r.rolconnlimit,r.rolvaliduntil,r.rolconfig
      FROM pg_roles r WHERE r.oid IN (${related}) ORDER BY r.rolname`,
    `SELECT parent.rolname AS granted_role,member.rolname AS member,grantor.rolname AS grantor,
      m.admin_option,m.inherit_option,m.set_option FROM pg_auth_members m
      JOIN pg_roles parent ON parent.oid=m.roleid JOIN pg_roles member ON member.oid=m.member
      JOIN pg_roles grantor ON grantor.oid=m.grantor
      WHERE m.roleid IN (${related}) OR m.member IN (${related})
      ORDER BY parent.rolname,member.rolname,grantor.rolname`,
    // Effective rights include PUBLIC, table ownership, column grants and inherited
    // roles. No role passwords or data are inspected or included in evidence.
    `SELECT r.rolname,c.relname,a.attname,
      has_column_privilege(r.oid,c.oid,a.attnum,'SELECT') AS can_select,
      has_column_privilege(r.oid,c.oid,a.attnum,'UPDATE') AS can_update,
      has_column_privilege(r.oid,c.oid,a.attnum,'INSERT') AS can_insert,
      has_column_privilege(r.oid,c.oid,a.attnum,'REFERENCES') AS can_reference
      FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
      WHERE r.oid IN (${roots}) AND n.nspname='public' AND c.relkind IN ('r','p','v','m')
      ORDER BY r.rolname,c.relname,a.attnum`,
    `SELECT r.rolname,n.nspname,c.relname,owner.rolname AS owner,c.relacl::text
      FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_roles owner ON owner.oid=c.relowner WHERE r.oid IN (${roots})
      AND n.nspname!~'^pg_' AND n.nspname<>'information_schema'
      AND (c.relowner=r.oid OR EXISTS(SELECT FROM aclexplode(c.relacl) a WHERE a.grantee=r.oid))
      ORDER BY r.rolname,n.nspname,c.relname`,
    `SELECT r.rolname,n.nspname,has_schema_privilege(r.oid,n.oid,'USAGE') AS can_use,
      has_schema_privilege(r.oid,n.oid,'CREATE') AS can_create,owner.rolname AS owner,n.nspacl::text
      FROM pg_roles r CROSS JOIN pg_namespace n JOIN pg_roles owner ON owner.oid=n.nspowner
      WHERE r.oid IN (${roots}) AND n.nspname!~'^pg_(toast_)?temp_'
      ORDER BY r.rolname,n.nspname`,
    `SELECT r.rolname,has_database_privilege(r.oid,d.oid,'CREATE') AS can_create,
      has_database_privilege(r.oid,d.oid,'CONNECT') AS can_connect,
      has_database_privilege(r.oid,d.oid,'TEMP') AS can_temp,owner.rolname AS owner,d.datacl::text
      FROM pg_roles r CROSS JOIN pg_database d JOIN pg_roles owner ON owner.oid=d.datdba
      WHERE r.oid IN (${roots}) AND d.datname=current_database() ORDER BY r.rolname`,
    // P2-01: no namespace exclusion. initprivs is the initdb/extension
    // baseline, NOT the currently mutable ACL. A GRANT to PUBLIC must not
    // redefine a previously restricted routine as safe during installation.
    `SELECT r.rolname,n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,
      owner.rolname AS owner,p.proacl::text,i.privtype,i.initprivs::text,
      p.prokind,p.prosecdef,p.proconfig,p.prosrc,p.probin,p.prosqlbody::text,
      l.lanname,l.lanpltrusted,p.oid<16384 AS bootstrap,
      i.objoid IS NOT NULL AND NOT EXISTS(SELECT FROM aclexplode(i.initprivs) a
        WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS initially_restricted,
      has_function_privilege(r.oid,p.oid,'EXECUTE') AS can_execute,
      p.oid=to_regprocedure('${capability}') AS account_lock
      FROM pg_roles r CROSS JOIN pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      JOIN pg_roles owner ON owner.oid=p.proowner JOIN pg_language l ON l.oid=p.prolang
      LEFT JOIN pg_init_privs i ON i.classoid='pg_proc'::regclass AND i.objoid=p.oid AND i.objsubid=0
      WHERE r.oid IN (${roots})
      ORDER BY r.rolname,n.nspname,p.proname,arguments`,
    `SELECT r.rolname,n.nspname,c.relname,
      has_sequence_privilege(r.oid,c.oid,'USAGE') AS can_use,
      has_sequence_privilege(r.oid,c.oid,'SELECT') AS can_select,
      has_sequence_privilege(r.oid,c.oid,'UPDATE') AS can_update
      FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE r.oid IN (${roots}) AND c.relkind='S' AND n.nspname='public'
      ORDER BY r.rolname,n.nspname,c.relname`,
  ]) results.push((await client.query(query)).rows);
  return results;
}

const readerColumns = {
  psychologist_profiles: ['user_id','approval_status'],
  clinical_episodes: ['id','modality','status','psychologist_user_id','created_by_user_id','participant_one_id','participant_two_id'],
  clinical_episode_participants: ['episode_id','patient_id','slot','psychologist_user_id'],
  patient_clinical_notes: ['id','episode_id','patient_id','created_by_user_id','appointment_id'],
};

// Verify before recording a new ledger, not just fingerprint a potentially unsafe
// installation (e.g. unexpected ALTER DEFAULT PRIVILEGES inherited from admin).
export async function verifyAccountLockContract(client, migration, requestedReader, originResolver = false) {
  const fail = () => { throw new Error('Schema drift or incompatible 009 account lock security contract; no adoption or repair'); };
  const { rows: [fn] } = await client.query(`SELECT p.prosrc,p.prosecdef,p.proconfig,p.proisstrict,p.provolatile,
    p.proparallel,l.lanname,p.prorettype='record'::regtype AS returns_record,
    pg_get_function_result(p.oid) AS result,owner.rolname AS owner,
    'psicopanel_account_lock_owner_'||d.oid::text AS expected_owner
    FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang JOIN pg_roles owner ON owner.oid=p.proowner
    CROSS JOIN pg_database d WHERE p.oid=to_regprocedure('${signature}') AND d.datname=current_database()`);
  const expectedBody = migration.sql.match(/SET search_path=pg_catalog,pg_temp AS \$\$([\s\S]*?)\$\$;/)?.[1];
  if (!fn || !expectedBody || fn.prosrc !== expectedBody || !fn.prosecdef || !fn.proisstrict ||
      fn.provolatile !== 'v' || fn.proparallel !== 'u' || fn.lanname !== 'sql' || !fn.returns_record ||
      fn.result !== 'TABLE(id text, role text, is_active boolean, session_version integer)' ||
      JSON.stringify(fn.proconfig) !== JSON.stringify(['search_path=pg_catalog, pg_temp']) || fn.owner !== fn.expected_owner) fail();
  const acl = (await client.query(`SELECT r.rolname,a.grantee,a.privilege_type,a.is_grantable
    FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a LEFT JOIN pg_roles r ON r.oid=a.grantee
    WHERE p.oid=to_regprocedure('${signature}')`)).rows;
  const others = acl.filter(a => a.rolname !== fn.owner);
  if (acl.some(a => a.grantee === 0 || a.privilege_type !== 'EXECUTE' || a.is_grantable) ||
      others.length !== 1 || !others[0].rolname || (requestedReader && requestedReader !== others[0].rolname)) fail();
  const reader = others[0].rolname;
  const roles = (await client.query(`SELECT * FROM pg_roles WHERE rolname=ANY($1::text[])`, [[fn.owner,reader]])).rows;
  if (roles.length !== 2 || roles.some(r => r.rolsuper || r.rolinherit || r.rolcreaterole || r.rolcreatedb ||
      r.rolreplication || r.rolbypassrls || r.rolconfig !== null || r.rolcanlogin !== (r.rolname === reader))) fail();
  if ((await client.query('SELECT FROM pg_auth_members WHERE roleid=ANY($1::oid[]) OR member=ANY($1::oid[])', [roles.map(r => r.oid)])).rowCount) fail();
  const security = await accountLockSecurityCatalog(client);
  // PostgreSQL 17 FirstNormalObjectId=16384 (access/transam.h) separates
  // initdb native code from user/extension native code. Trust a healthy initdb
  // catalog, not arbitrary C/internal/untrusted routines added to any schema.
  // Trusted invokers cannot confer their owner's privileges; additional
  // definers (even trigger functions) are incompatible with this capability.
  if (security[7].some(r => r.can_execute && !r.account_lock && !(originResolver && r.nspname === 'public' && r.proname === 'recognize_private_note_origin_v1' && r.arguments === 'note_id bigint, episode_id bigint, patient_id text, author_id text') &&
      (r.initially_restricted || r.prosecdef || (!r.bootstrap && !r.lanpltrusted)))) fail();
  // Fail closed if the expected PG17 initial ACL baseline is absent. Do not
  // silently fall back to a mutable current ACL or accept a reduced catalog.
  for (const name of ['pg_read_file','pg_read_binary_file','pg_ls_dir','pg_stat_file','lo_import','lo_export']) {
    if (!security[7].some(r => r.nspname === 'pg_catalog' && r.proname === name &&
        r.bootstrap && r.privtype === 'i' && r.initially_restricted)) fail();
  }
  for (const row of security[3]) {
    const owner = row.rolname === fn.owner;
    const expectedSelect = (owner ? row.relname === 'users' && ['id','role','is_active','session_version'].includes(row.attname)
      : readerColumns[row.relname]?.includes(row.attname)) === true;
    if (row.can_select !== expectedSelect || row.can_update !== (owner && row.relname === 'users' && row.attname === 'session_version') ||
        row.can_insert || row.can_reference) fail();
  }
  if (security[5].some(r => r.can_create || r.owner === reader || r.owner === fn.owner) ||
      security[6].some(r => r.can_create || r.owner === reader || r.owner === fn.owner) ||
      security[8].some(r => r.can_use || r.can_select || r.can_update)) fail();
  // Row/statement privileges not covered by the per-column matrix.
  if ((await client.query(`SELECT FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE r.rolname=ANY($1::text[]) AND n.nspname='public' AND c.relkind IN ('r','p','v','m')
    AND has_table_privilege(r.oid,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')`, [[fn.owner,reader]])).rowCount) fail();
  return reader;
}
