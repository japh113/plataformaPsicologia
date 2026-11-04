// Frozen rejected HEAD 97438c0: test-only counterexample; never import in production.
// 010-only catalog and fail-closed security specification. No data/clinical text.
const names = ['create_private_clinical_note_v1','guard_private_note_insert',
  'materialize_private_note_origin','guard_private_note_origin',
  'verify_private_note_origin','guard_private_note_mutation'];
const roots = `SELECT proowner AS oid FROM pg_proc WHERE pronamespace='public'::regnamespace
  AND proname=ANY($1::text[]) UNION SELECT a.grantee FROM pg_proc p
  CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.pronamespace='public'::regnamespace
  AND p.proname=ANY($1::text[]) AND a.grantee<>0`;
const graph = `WITH RECURSIVE related(oid) AS (${roots} UNION
  SELECT CASE WHEN m.roleid=r.oid THEN m.member ELSE m.roleid END
  FROM related r JOIN pg_auth_members m ON r.oid IN(m.roleid,m.member)) SELECT oid FROM related`;

export async function privateNoteSecurityCatalog(client) {
  const results=[];
  for(const query of [
    `SELECT r.rolname,r.rolsuper,r.rolinherit,r.rolcreaterole,r.rolcreatedb,r.rolcanlogin,
      r.rolreplication,r.rolbypassrls,r.rolconfig,r.rolconnlimit,r.rolvaliduntil
      FROM pg_roles r WHERE r.oid IN(${graph}) ORDER BY r.rolname`,
    `SELECT parent.rolname AS granted_role,member.rolname AS member,grantor.rolname AS grantor,
      m.admin_option,m.inherit_option,m.set_option FROM pg_auth_members m
      JOIN pg_roles parent ON parent.oid=m.roleid JOIN pg_roles member ON member.oid=m.member
      JOIN pg_roles grantor ON grantor.oid=m.grantor
      WHERE m.roleid IN(${graph}) OR m.member IN(${graph}) ORDER BY 1,2,3`,
    `SELECT p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,
      pg_get_functiondef(p.oid) AS definition,owner.rolname AS owner,p.proacl::text,
      p.prosecdef,p.proconfig,p.provolatile,p.proparallel,p.proisstrict,p.prosrc,
      l.lanname,pg_get_function_result(p.oid) AS result,p.prorettype='trigger'::regtype AS is_trigger
      FROM pg_proc p JOIN pg_roles owner ON owner.oid=p.proowner JOIN pg_language l ON l.oid=p.prolang
      WHERE p.pronamespace='public'::regnamespace AND p.proname=ANY($1::text[]) ORDER BY p.proname,arguments`,
    `SELECT r.rolname,c.relname,a.attname,
      has_column_privilege(r.oid,c.oid,a.attnum,'SELECT') AS can_select,
      has_column_privilege(r.oid,c.oid,a.attnum,'INSERT') AS can_insert,
      has_column_privilege(r.oid,c.oid,a.attnum,'UPDATE') AS can_update,
      has_column_privilege(r.oid,c.oid,a.attnum,'REFERENCES') AS can_reference
      FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
      WHERE r.oid IN(${graph}) AND n.nspname='public' AND c.relkind IN('r','p','v','m')
      ORDER BY r.rolname,c.relname,a.attnum`,
    `SELECT r.rolname,c.relname,owner.rolname AS owner,
      has_table_privilege(r.oid,c.oid,'INSERT') AS can_insert,
      has_table_privilege(r.oid,c.oid,'UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES') AS can_mutate
      FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_roles owner ON owner.oid=c.relowner WHERE r.oid IN(${graph})
      AND n.nspname='public' AND c.relkind IN('r','p','v','m') ORDER BY r.rolname,c.relname`,
    `SELECT r.rolname,n.nspname,owner.rolname AS owner,
      has_schema_privilege(r.oid,n.oid,'CREATE') AS can_create,n.nspacl::text
      FROM pg_roles r CROSS JOIN pg_namespace n JOIN pg_roles owner ON owner.oid=n.nspowner
      WHERE r.oid IN(${graph}) AND n.nspname!~'^pg_(toast_)?temp_' ORDER BY r.rolname,n.nspname`,
    `SELECT r.rolname,owner.rolname AS owner,d.datacl::text,
      has_database_privilege(r.oid,d.oid,'CREATE') AS can_create
      FROM pg_roles r CROSS JOIN pg_database d JOIN pg_roles owner ON owner.oid=d.datdba
      WHERE r.oid IN(${graph}) AND d.datname=current_database() ORDER BY r.rolname`,
    `SELECT r.rolname,n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,
      has_function_privilege(r.oid,p.oid,'EXECUTE') AS can_execute,p.prosecdef,p.prosrc,p.probin,p.prosqlbody::text,
      owner.rolname AS owner,p.proacl::text,l.lanpltrusted,p.oid<16384 AS bootstrap,
      i.objoid IS NOT NULL AND NOT EXISTS(SELECT FROM aclexplode(i.initprivs) a
        WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS initially_restricted
      FROM pg_roles r CROSS JOIN pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      JOIN pg_roles owner ON owner.oid=p.proowner JOIN pg_language l ON l.oid=p.prolang
      LEFT JOIN pg_init_privs i ON i.classoid='pg_proc'::regclass AND i.objoid=p.oid AND i.objsubid=0
      WHERE r.oid IN(${graph}) ORDER BY r.rolname,n.nspname,p.proname,arguments`,
    `SELECT r.rolname,n.nspname,c.relname,
      has_sequence_privilege(r.oid,c.oid,'USAGE') AS can_use,
      has_sequence_privilege(r.oid,c.oid,'SELECT') AS can_select,
      has_sequence_privilege(r.oid,c.oid,'UPDATE') AS can_update
      FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE r.oid IN(${graph}) AND c.relkind='S' AND n.nspname='public' ORDER BY r.rolname,c.relname`,
    `SELECT c.relname,owner.rolname AS owner,c.relacl::text FROM pg_class c JOIN pg_roles owner ON owner.oid=c.relowner
      WHERE c.oid IN('public.clinical_note_private_origins'::regclass,'public.patient_clinical_notes'::regclass)
      AND cardinality($1::text[])>0 ORDER BY c.relname`,
  ])results.push((await client.query(query,[names])).rows);
  return results;
}

const creatorInsert=['episode_id','patient_id','created_by_user_id','appointment_id','clinical_note_date','content'];
const creatorRead={clinical_episodes:['id','status','psychologist_user_id'],
  clinical_episode_participants:['episode_id','patient_id','psychologist_user_id'],patient_clinical_notes:['id']};
const verifierRead=['id','episode_id','patient_id','created_by_user_id'];
export async function verifyPrivateNoteContract(client,migration,requestedCreator) {
  const fail=()=>{throw new Error('Schema drift or incompatible 010 private note security contract; no adoption or repair');};
  const {rows:[db]}=await client.query('SELECT oid FROM pg_database WHERE datname=current_database()');
  const creatorOwner='psicopanel_note_creator_owner_'+db.oid,verifierOwner='psicopanel_note_verifier_owner_'+db.oid;
  const security=await privateNoteSecurityCatalog(client);
  if(security[2].length!==names.length)fail();
  const bodies=new Map([...migration.sql.matchAll(/CREATE FUNCTION public[.](\w+)[(][\s\S]*?AS \$\$([\s\S]*?)\$\$;/g)].map(m=>[m[1],m[2]]));
  for(const fn of security[2]) {
    const verifier=['verify_private_note_origin','guard_private_note_mutation'].includes(fn.proname);
    if(fn.prosrc!==bodies.get(fn.proname) || fn.prosecdef!==(verifier || fn.proname===names[0]) ||
      fn.owner!==(verifier?verifierOwner:creatorOwner) || fn.lanname!=='plpgsql' || fn.proisstrict ||
      fn.result!==(fn.proname===names[0]?'bigint':'trigger') ||
      fn.arguments!==(fn.proname===names[0]?'requested_episode bigint, requested_patient text, requested_author text, requested_appointment bigint, requested_content text':'') ||
      fn.provolatile!=='v' || fn.proparallel!=='u' || fn.is_trigger!==(fn.proname!==names[0]) ||
      JSON.stringify(fn.proconfig)!==JSON.stringify([fn.proname===names[0]?'search_path=pg_catalog, public, pg_temp':'search_path=pg_catalog, pg_temp']))fail();
  }
  const acl=(await client.query(`SELECT p.proname,r.rolname,a.grantee,a.privilege_type,a.is_grantable
    FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a LEFT JOIN pg_roles r ON r.oid=a.grantee
    WHERE p.pronamespace='public'::regnamespace AND p.proname=ANY($1::text[])`,[names])).rows;
  const external=acl.filter(a=>![creatorOwner,verifierOwner].includes(a.rolname));
  if(acl.some(a=>!a.grantee || a.is_grantable || a.privilege_type!=='EXECUTE') ||
    external.length!==1 || external[0].proname!==names[0] || !external[0].rolname)fail();
  const creator=external[0].rolname,roles=[creatorOwner,verifierOwner,creator];
  if(requestedCreator && requestedCreator!==creator)fail();
  if(security[0].length!==3 || security[0].some(r=>!roles.includes(r.rolname) || r.rolsuper || r.rolinherit ||
    r.rolcreaterole || r.rolcreatedb || r.rolreplication || r.rolbypassrls || r.rolconfig!==null ||
    r.rolcanlogin!==(r.rolname===creator)) || security[1].length)fail();
  for(const r of security[3]) {
    const isCreator=r.rolname===creatorOwner,isVerifier=r.rolname===verifierOwner;
    const read=(isCreator && (r.relname==='appointments' || creatorRead[r.relname]?.includes(r.attname))) ||
      (isVerifier && (r.relname==='clinical_note_private_origins' || (r.relname==='patient_clinical_notes' && verifierRead.includes(r.attname))));
    const insert=isCreator && (r.relname==='clinical_note_private_origins' ||
      (r.relname==='patient_clinical_notes' && creatorInsert.includes(r.attname)));
    if(r.can_select!==!!read || r.can_insert!==!!insert || r.can_reference ||
      r.can_update!==(isCreator && r.relname==='appointments' && r.attname==='id'))fail();
  }
  if(security[4].some(r=>roles.includes(r.owner) || r.can_mutate ||
    r.can_insert!==(r.rolname===creatorOwner && r.relname==='clinical_note_private_origins')) ||
    security[5].some(r=>r.can_create || roles.includes(r.owner)) ||
    security[6].some(r=>r.can_create || roles.includes(r.owner)))fail();
  if(security[7].some(r=>r.can_execute && !(r.nspname==='public' && names.includes(r.proname) &&
    ((r.proname===names[0] && r.rolname===creator) || r.owner===r.rolname)) &&
    (r.initially_restricted || r.prosecdef || (!r.bootstrap && !r.lanpltrusted))))fail();
  if(security[8].some(r=>r.can_select || r.can_update || r.can_use!==
    (r.rolname===creatorOwner && r.relname==='patient_clinical_notes_id_seq')))fail();
  const relationAcl=(await client.query(`SELECT c.relname,owner.rolname AS owner,a.attnum,a.attacl::text
    FROM pg_class c JOIN pg_roles owner ON owner.oid=c.relowner
    JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    WHERE c.oid='public.clinical_note_private_origins'::regclass`)).rows;
  const tableOwner=security[9].find(r=>r.relname==='patient_clinical_notes')?.owner;
  if(!tableOwner || relationAcl.some(r=>r.owner!==tableOwner || r.attacl!==null))fail();
  const grants=(await client.query(`SELECT r.rolname,a.grantee,a.privilege_type,a.is_grantable
    FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a LEFT JOIN pg_roles r ON r.oid=a.grantee
    WHERE c.oid='public.clinical_note_private_origins'::regclass`)).rows;
  if(grants.some(a=>!a.grantee || a.is_grantable ||
    (a.rolname!==tableOwner && !((a.rolname===creatorOwner && a.privilege_type==='INSERT') ||
    (a.rolname===verifierOwner && a.privilege_type==='SELECT')))))fail();
  const triggers=(await client.query(`SELECT c.relname,t.tgname,t.tgtype,t.tgenabled,t.tgdeferrable,t.tginitdeferred,
    t.tgattr::text AS columns,t.tgnargs,t.tgqual IS NULL AS unconditional,
    pg_get_triggerdef(t.oid) AS definition,p.proname,n.nspname AS function_schema
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid
    JOIN pg_namespace n ON n.oid=p.pronamespace WHERE t.tgrelid IN(
    'public.patient_clinical_notes'::regclass,'public.clinical_note_private_origins'::regclass) AND NOT t.tgisinternal`)).rows;
  for(const [table,name,type,fn,deferred] of [
    ['patient_clinical_notes','a_private_note_insert',7,'guard_private_note_insert',false],
    ['patient_clinical_notes','materialize_private_note_origin',5,'materialize_private_note_origin',false],
    ['patient_clinical_notes','private_note_origin_required',5,'verify_private_note_origin',true],
    ['patient_clinical_notes','a_private_note_mutation',27,'guard_private_note_mutation',false],
    ['clinical_note_private_origins','guard_private_note_origin',31,'guard_private_note_origin',false],
    ['clinical_note_private_origins','guard_private_note_origin_truncate',34,'guard_private_note_origin',false],
  ]) {
    const trigger=triggers.find(r=>r.relname===table && r.tgname===name);
    if(!trigger || trigger.tgtype!==type || trigger.tgenabled!=='O' || trigger.proname!==fn ||
      trigger.function_schema!=='public' || trigger.columns!=='' || trigger.tgnargs!==0 ||
      trigger.tgdeferrable!==deferred || trigger.tginitdeferred!==deferred || trigger.unconditional===deferred ||
      (deferred && !/WHEN [(][(]?new[.]episode_id IS NOT NULL[)]?[)]/i.test(trigger.definition)))fail();
  }
  // No routine except the fixed creator may execute as its owner. No application
  // role can create trigger attachments, alter owners, assume roles or disable FK.
  return creator;
}
