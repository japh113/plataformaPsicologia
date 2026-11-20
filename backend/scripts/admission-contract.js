// Explicit provisioning and runtime guard for the isolated admission LOGIN.
const baselineFunctions=['admission_context(text,integer,text,jsonb)','admission_command(text,integer,text,jsonb)','admission_candidates(text,integer,double precision)'];
export async function verifyAdmissionContract(client,role,{install=false,runtime=false}={}) {
  if(typeof role!=='string'||!/^[a-z][a-z0-9_]{0,62}$/.test(role))throw new Error('Explicit restricted admission LOGIN required');
  if(runtime&&(await client.query('SELECT current_user=$1 AS matches',[role])).rows[0].matches!==true)throw new Error('Mismatched admission LOGIN');
  const {rows:[guard]}=await client.query(`SELECT r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolinherit AND NOT r.rolcreaterole
    AND NOT r.rolcreatedb AND NOT r.rolreplication AND NOT r.rolbypassrls
    AND current_setting('session_replication_role')='origin'
    AND NOT has_parameter_privilege(r.oid,'session_replication_role','SET,ALTER SYSTEM')
    AND NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE r.oid IN (roleid,member))
    AND NOT has_schema_privilege(r.oid,'public','CREATE')
    AND NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','v','m','S') AND
      CASE WHEN c.relkind='S' THEN has_sequence_privilege(r.oid,c.oid,'USAGE,SELECT,UPDATE')
      ELSE has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') OR has_table_privilege(r.oid,c.oid,'DELETE,TRUNCATE,TRIGGER') END)
    AND NOT EXISTS(SELECT 1 FROM pg_proc f WHERE f.pronamespace='public'::regnamespace
      AND NOT starts_with(f.proname,'admission_') AND f.prosecdef AND has_function_privilege(r.oid,f.oid,'EXECUTE')) AS safe
    FROM pg_roles r WHERE rolname=$1`,[role]);
  if(!guard?.safe)throw new Error('Unsafe admission LOGIN');
  const owner=(await client.query(`SELECT r.rolname,NOT r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolinherit AND NOT r.rolcreaterole
    AND NOT r.rolcreatedb AND NOT r.rolreplication AND NOT r.rolbypassrls
    AND NOT has_parameter_privilege(r.oid,'session_replication_role','SET,ALTER SYSTEM')
    AND NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE r.oid IN (roleid,member))
    AND NOT has_column_privilege(r.oid,'public.users','password_hash','SELECT')
    AND NOT has_table_privilege(r.oid,'public.patient_clinical_notes','SELECT')
    AND NOT has_table_privilege(r.oid,'public.patient_intakes','SELECT')
    AND NOT has_table_privilege(r.oid,'public.care_relationships','INSERT') AS safe
    FROM pg_roles r WHERE r.oid=(SELECT proowner FROM pg_proc WHERE oid='public.admission_command(text,integer,text,jsonb)'::regprocedure)`)).rows[0];
  if(!owner?.safe)throw new Error('Unsafe admission owner');
  const hasConsultation=(await client.query(
    "SELECT to_regprocedure('public.admission_consultation(text,integer,text,jsonb)') IS NOT NULL AS configured"
  )).rows[0].configured;
  const functions=hasConsultation?[...baselineFunctions,'admission_consultation(text,integer,text,jsonb)']:baselineFunctions;
  for(const fn of functions){
    if(install)await client.query(`GRANT EXECUTE ON FUNCTION public.${fn} TO "${role}"`);
    const {rows:[row]}=await client.query(`SELECT p.prosecdef,p.proconfig,p.proowner::regrole::text AS owner,
      has_function_privilege($1,p.oid,'EXECUTE') executable,
      EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) WHERE grantee=0 AND privilege_type='EXECUTE') public_execute
      FROM pg_proc p WHERE p.oid=$2::regprocedure`,[role,'public.'+fn]);
    if(!row?.prosecdef||row.owner!==owner.rolname||!row.executable||row.public_execute||JSON.stringify(row.proconfig)!==JSON.stringify(['search_path=pg_catalog, public']))throw new Error('Invalid admission function boundary');
  }
  const {rows:[extra]}=await client.query(`SELECT EXISTS(SELECT 1 FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND starts_with(p.proname,'admission_')
    AND (EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) WHERE grantee=0 AND privilege_type='EXECUTE')
      OR p.proname<>ALL($2::text[]) AND has_function_privilege($1,p.oid,'EXECUTE'))) unsafe`,[role,functions.map(fn=>fn.split('(')[0])]);
  if(extra.unsafe)throw new Error('Expanded admission function access');
  // 016/017 internal content boundaries has no executable grant to any LOGIN or PUBLIC.
  const internals=(await client.query(`SELECT p.prosecdef,p.proconfig,p.proowner::regrole::text AS owner,
    EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) WHERE grantee<>p.proowner) exposed
    FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN ('admission_record_command','admission_directed_command','admission_directed_version_guard')`)).rows;
  for(const internal of internals)
  if(internal&&(!internal.prosecdef||internal.owner!==owner.rolname||internal.exposed||
    JSON.stringify(internal.proconfig)!==JSON.stringify(['search_path=pg_catalog, public'])))throw new Error('Expanded admission assessment boundary');

}
