// Frozen 009 catalog from audited HEAD 33d8bff; never adopt its ledger.
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

export async function accountLockSecurityCatalog(client) {
  const results = [];
  for (const query of [
    `SELECT p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,
      pg_get_functiondef(p.oid) AS definition,r.rolname AS owner,p.proacl::text,
      p.prosecdef,p.proconfig,p.provolatile,p.proparallel,p.proisstrict
      FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner
      WHERE p.oid=to_regprocedure('${signature}')`,
    `SELECT r.rolname,r.rolsuper,r.rolinherit,r.rolcreaterole,r.rolcreatedb,r.rolcanlogin,
      r.rolreplication,r.rolbypassrls,r.rolconnlimit,r.rolvaliduntil,r.rolconfig
      FROM pg_roles r WHERE r.oid IN (${roleGraph}) ORDER BY r.rolname`,
    `SELECT parent.rolname AS granted_role,member.rolname AS member,grantor.rolname AS grantor,
      m.admin_option,m.inherit_option,m.set_option FROM pg_auth_members m
      JOIN pg_roles parent ON parent.oid=m.roleid JOIN pg_roles member ON member.oid=m.member
      JOIN pg_roles grantor ON grantor.oid=m.grantor
      WHERE m.roleid IN (${roleGraph}) OR m.member IN (${roleGraph})
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
      WHERE r.oid IN (${rootRoles}) AND n.nspname='public' AND c.relkind IN ('r','p','v','m')
      ORDER BY r.rolname,c.relname,a.attnum`,
    `SELECT r.rolname,n.nspname,c.relname,owner.rolname AS owner,c.relacl::text
      FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_roles owner ON owner.oid=c.relowner WHERE r.oid IN (${rootRoles})
      AND n.nspname!~'^pg_' AND n.nspname<>'information_schema'
      AND (c.relowner=r.oid OR EXISTS(SELECT FROM aclexplode(c.relacl) a WHERE a.grantee=r.oid))
      ORDER BY r.rolname,n.nspname,c.relname`,
    `SELECT r.rolname,n.nspname,has_schema_privilege(r.oid,n.oid,'USAGE') AS can_use,
      has_schema_privilege(r.oid,n.oid,'CREATE') AS can_create,owner.rolname AS owner,n.nspacl::text
      FROM pg_roles r CROSS JOIN pg_namespace n JOIN pg_roles owner ON owner.oid=n.nspowner
      WHERE r.oid IN (${rootRoles}) AND n.nspname!~'^pg_' AND n.nspname<>'information_schema'
      ORDER BY r.rolname,n.nspname`,
    `SELECT r.rolname,has_database_privilege(r.oid,d.oid,'CREATE') AS can_create,
      has_database_privilege(r.oid,d.oid,'CONNECT') AS can_connect,
      has_database_privilege(r.oid,d.oid,'TEMP') AS can_temp,owner.rolname AS owner,d.datacl::text
      FROM pg_roles r CROSS JOIN pg_database d JOIN pg_roles owner ON owner.oid=d.datdba
      WHERE r.oid IN (${rootRoles}) AND d.datname=current_database() ORDER BY r.rolname`,
    `SELECT r.rolname,n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,
      owner.rolname AS owner,p.proacl::text,has_function_privilege(r.oid,p.oid,'EXECUTE') AS can_execute
      FROM pg_roles r CROSS JOIN pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      JOIN pg_roles owner ON owner.oid=p.proowner WHERE r.oid IN (${rootRoles})
      AND n.nspname!~'^pg_' AND n.nspname<>'information_schema'
      ORDER BY r.rolname,n.nspname,p.proname,arguments`,
    `SELECT r.rolname,n.nspname,c.relname,
      has_sequence_privilege(r.oid,c.oid,'USAGE') AS can_use,
      has_sequence_privilege(r.oid,c.oid,'SELECT') AS can_select,
      has_sequence_privilege(r.oid,c.oid,'UPDATE') AS can_update
      FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE r.oid IN (${rootRoles}) AND c.relkind='S' AND n.nspname='public'
      ORDER BY r.rolname,n.nspname,c.relname`,
  ]) results.push((await client.query(query)).rows);
  return results;
}
