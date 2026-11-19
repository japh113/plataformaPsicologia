// Catalog boundary only: no clinical values, implicit pool or operational grants.
export async function episodeRecordSecurityCatalog(client) {
  const results=[];
  for(const sql of [
    `SELECT c.relname,c.relowner::regrole::text FROM pg_class c WHERE c.relnamespace='public'::regnamespace
      AND c.relname IN ('episode_private_records','episode_private_record_versions') ORDER BY c.relname`,
    `SELECT p.oid::regprocedure::text,p.proowner::regrole::text FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
      AND starts_with(p.proname,'episode_record_') ORDER BY p.oid::regprocedure::text`,
    `SELECT r.rolname,r.rolsuper,r.rolinherit,r.rolcreaterole,r.rolcreatedb,r.rolcanlogin,r.rolreplication,r.rolbypassrls,r.rolconfig,
      (SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY roleid,member),'[]'::jsonb) FROM pg_auth_members m WHERE r.oid IN (m.roleid,m.member)) memberships
      FROM pg_roles r WHERE r.oid=(SELECT proowner FROM pg_proc WHERE oid='public.episode_record_from_preparation()'::regprocedure)`
  ])results.push((await client.query(sql)).rows);
  return results;
}
export async function verifyEpisodeRecordContract(client) {
  const {rows:[r]}=await client.query(`SELECT NOT r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolinherit AND NOT r.rolcreaterole
    AND NOT r.rolcreatedb AND NOT r.rolreplication AND NOT r.rolbypassrls AND r.rolconfig IS NULL
    AND NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE r.oid IN (roleid,member))
    AND NOT has_parameter_privilege(r.oid,'session_replication_role','SET,ALTER SYSTEM')
    AND NOT has_schema_privilege(r.oid,'public','CREATE')
    AND NOT has_any_column_privilege(r.oid,'public.users','SELECT,INSERT,UPDATE,REFERENCES')
    AND NOT has_table_privilege(r.oid,'public.patient_intakes','SELECT')
    AND NOT has_table_privilege(r.oid,'public.patient_clinical_notes','SELECT') AS safe
    FROM pg_roles r WHERE r.oid=(SELECT proowner FROM pg_proc WHERE oid='public.episode_record_from_preparation()'::regprocedure)`);
  if(!r?.safe)throw new Error('Unsafe episode record owner');
  const {rows:[exposure]}=await client.query(`SELECT EXISTS(
    SELECT 1 FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND starts_with(p.proname,'episode_record_')
      AND (p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public'] OR
        p.proowner<>(SELECT proowner FROM pg_proc WHERE oid='public.episode_record_from_preparation()'::regprocedure) OR
        EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) WHERE grantee<>p.proowner))
    UNION ALL SELECT 1 FROM pg_class c WHERE c.oid IN ('public.episode_private_records'::regclass,'public.episode_private_record_versions'::regclass)
      AND (c.relowner<>(SELECT proowner FROM pg_proc WHERE oid='public.episode_record_from_preparation()'::regprocedure) OR
        EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl WHERE grantee<>c.relowner AND NOT (
          EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.episode_private_record_versions'::regclass AND attname='assignment_id' AND NOT attisdropped)
          AND acl.grantee=(SELECT proowner FROM pg_proc WHERE oid='public.admission_command(text,integer,text,jsonb)'::regprocedure)
          AND acl.privilege_type='SELECT' AND NOT acl.is_grantable)) OR
        EXISTS(SELECT 1 FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) acl WHERE a.attrelid=c.oid AND acl.grantee<>c.relowner AND NOT (
          EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.episode_private_record_versions'::regclass AND attname='assignment_id' AND NOT attisdropped)
          AND acl.grantee=(SELECT proowner FROM pg_proc WHERE oid='public.admission_command(text,integer,text,jsonb)'::regprocedure)
          AND NOT acl.is_grantable AND (c.relname='episode_private_records' AND a.attname='episode_id' AND acl.privilege_type='UPDATE'
            OR c.relname='episode_private_record_versions' AND acl.privilege_type='INSERT' AND a.attname IN
              ('episode_id','patient_id','professional_user_id','revision','previous_revision','risk_level','professional_context','recording_kind','assignment_id','submission','directed_revision','authenticated_author_user_id','authenticated_session_version')))))
    ) AS unsafe`);
  if(exposure.unsafe)throw new Error('Expanded episode record access');
}
