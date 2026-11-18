// Used only by the explicit migration runner and disposable fixture provisioning.
const commands=['bilateral_context(text,integer,text,jsonb)','bilateral_command(text,integer,text,jsonb)','bilateral_queue()','bilateral_cleanup()'];
export async function verifyBilateralContract(client,role,{install=false}={}) {
  if(typeof role!=='string'||!/^[a-z][a-z0-9_]{0,62}$/.test(role))throw new Error('Explicit restricted bilateral LOGIN required');
  const {rows:[guard]}=await client.query(`SELECT r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolinherit AND NOT r.rolcreaterole
    AND NOT r.rolcreatedb AND NOT r.rolreplication AND NOT r.rolbypassrls
    AND NOT has_parameter_privilege(r.oid,'session_replication_role','SET,ALTER SYSTEM')
    AND NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE r.oid IN (roleid,member))
    AND NOT has_schema_privilege(r.oid,'public','CREATE')
    AND NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','v','S') AND
      (CASE WHEN c.relkind='S' THEN has_sequence_privilege(r.oid,c.oid,'USAGE,SELECT,UPDATE')
       ELSE has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') OR has_table_privilege(r.oid,c.oid,'DELETE,TRUNCATE,TRIGGER') END)) AS safe
    FROM pg_roles r WHERE rolname=$1`,[role]);
  if(!guard?.safe)throw new Error('Bilateral LOGIN must have no direct data or role privileges');
  const owner=(await client.query(`SELECT r.rolname,NOT r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolinherit AND NOT r.rolcreaterole
    AND NOT r.rolcreatedb AND NOT r.rolreplication AND NOT r.rolbypassrls
    AND NOT has_parameter_privilege(r.oid,'session_replication_role','SET,ALTER SYSTEM') AND
    NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE r.oid IN (roleid,member)) AS safe
    FROM pg_roles r WHERE r.oid=(SELECT proowner FROM pg_proc WHERE oid='public.bilateral_command(text,integer,text,jsonb)'::regprocedure)`)).rows[0];
  if(!owner?.safe)throw new Error('Bilateral NOLOGIN owner boundary invalid');
  for(const name of commands){
    if(install)await client.query(`GRANT EXECUTE ON FUNCTION public.${name} TO "${role}"`);
    const {rows:[fn]}=await client.query(`SELECT p.prosecdef,p.proconfig,p.proowner::regrole::text AS owner,
      has_function_privilege($1,p.oid,'EXECUTE') AS executable,
      EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) WHERE grantee=0 AND privilege_type='EXECUTE') AS public_execute
      FROM pg_proc p WHERE p.oid=$2::regprocedure`,[role,'public.'+name]);
    if(!fn?.prosecdef||fn.owner!==owner.rolname||fn.public_execute||!fn.executable||JSON.stringify(fn.proconfig)!==JSON.stringify(['search_path=pg_catalog, public']))throw new Error('Bilateral function contract invalid');
  }
}
