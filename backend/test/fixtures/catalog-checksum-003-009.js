// Frozen pre-010 algorithm. Never evolve historical installation fingerprints.
import {createHash} from 'node:crypto';
import {accountLockSecurityCatalog} from '../../scripts/account-lock-contract.js';
const sha256=value=>createHash('sha256').update(value).digest('hex');
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
  // Preserve the exact historical 003–007 algorithm. Only 008 installs CEP.
  // SECURITY DEFINER ownership/role membership is part of 008's security boundary.
  if ((await client.query("SELECT to_regclass('public.clinical_episode_participants') AS relation")).rows[0].relation) {
    for (const query of [
      `SELECT c.relname,r.rolname AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        JOIN pg_roles r ON r.oid=c.relowner WHERE n.nspname='public'
        AND c.relname IN ('clinical_episodes','clinical_episode_participants','clinical_episode_history','clinical_episode_history_id_seq') ORDER BY c.relname`,
      `SELECT p.proname,r.rolname AS owner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname='public' AND p.proname IN
        ('materialize_episode_participants','check_episode_participant','preserve_episode_record','enforce_clinical_episode_identity','preserve_episode_attribution') ORDER BY p.proname`,
      `SELECT r.rolname,r.rolsuper,r.rolinherit,r.rolcreaterole,r.rolcreatedb,r.rolcanlogin,r.rolreplication,
        r.rolbypassrls,r.rolconnlimit,r.rolvaliduntil,r.rolconfig FROM pg_roles r
        WHERE r.oid=(SELECT proowner FROM pg_proc WHERE oid='public.materialize_episode_participants()'::regprocedure)`,
      `SELECT parent.rolname AS granted_role,member.rolname AS member,grantor.rolname AS grantor,
        m.admin_option,m.inherit_option,m.set_option FROM pg_auth_members m
        JOIN pg_roles parent ON parent.oid=m.roleid JOIN pg_roles member ON member.oid=m.member
        JOIN pg_roles grantor ON grantor.oid=m.grantor WHERE
        (SELECT proowner FROM pg_proc WHERE oid='public.materialize_episode_participants()'::regprocedure) IN (m.roleid,m.member)
        ORDER BY parent.rolname,member.rolname,grantor.rolname`,
      `SELECT n.nspname,r.rolname AS owner,n.nspacl::text FROM pg_namespace n JOIN pg_roles r ON r.oid=n.nspowner WHERE n.nspname='public'`,
      `SELECT a.attname,co.collname,cn.nspname FROM pg_attribute a JOIN pg_collation co ON co.oid=a.attcollation
        JOIN pg_namespace cn ON cn.oid=co.collnamespace WHERE a.attrelid='public.clinical_episodes'::regclass
        AND a.attname IN ('participant_one_id','participant_two_id') ORDER BY a.attname`,
      // 008 only: relation ACLs omit column GRANTs (pg_attribute.attacl).
      // This changes old 008 fingerprints; reject old ledgers without adoption.
      `SELECT c.relname,a.attnum,a.attname,a.attacl::text
        FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
        JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped
        ORDER BY c.relname,a.attnum`,
    ]) results.push((await client.query(query)).rows);
  }
  // Append only if 009 actually exists. Repository updates must NEVER change
  // the historical 003-008 algorithm for an installation still at those versions.
  if ((await client.query("SELECT to_regprocedure('public.lock_account_session(text)') AS function")).rows[0].function) {
    results.push(...await accountLockSecurityCatalog(client));
  }
  return sha256(JSON.stringify(results));
}
