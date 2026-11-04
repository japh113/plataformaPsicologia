-- 011: private provenance recognition only; never a clinical permission.
DO $$
DECLARE owner_name text; reader_name text;
BEGIN
  IF current_setting('psicopanel.migration_target',true) IS DISTINCT FROM '011'
    OR NOT (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=current_user) THEN
    RAISE EXCEPTION 'Use explicit isolated provisioning runner target 011';
  END IF;
  -- Reuse the already verified 009 LOGIN, never its privileged owner.
  SELECT r.rolname INTO STRICT reader_name FROM pg_catalog.pg_proc p
    CROSS JOIN LATERAL pg_catalog.aclexplode(p.proacl) a
    JOIN pg_catalog.pg_roles r ON r.oid=a.grantee
    WHERE p.oid='public.lock_account_session(text)'::regprocedure AND a.grantee<>p.proowner;
  SELECT 'psicopanel_origin_resolver_owner_'||oid::text INTO STRICT owner_name
    FROM pg_catalog.pg_database WHERE datname=current_database();
  EXECUTE format('CREATE ROLE %I NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',owner_name);
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I',owner_name);
  EXECUTE format('GRANT SELECT(id,episode_id,patient_id,created_by_user_id) ON public.patient_clinical_notes TO %I',owner_name);
  EXECUTE format('GRANT SELECT(note_id,episode_id,subject_patient_id,author_user_id,contract_version,registration_kind,registered_by_user_id) ON public.clinical_note_private_origins TO %I',owner_name);
  EXECUTE format('GRANT SELECT(episode_id,patient_id,psychologist_user_id) ON public.clinical_episode_participants TO %I',owner_name);
END $$;

-- Exact tuple oracle for a trusted internal structural reader, no IDs or rows
-- returned, no text/history/timestamps, dynamic SQL, session claims or fallback.
CREATE FUNCTION public.recognize_private_note_origin_v1(note_id bigint,episode_id bigint,patient_id text,author_id text)
RETURNS boolean LANGUAGE sql STABLE STRICT SECURITY DEFINER PARALLEL UNSAFE
SET search_path=pg_catalog,pg_temp AS $$
  SELECT count(*)=1 FROM public.clinical_note_private_origins o
  JOIN public.patient_clinical_notes n ON (n.id,n.episode_id,n.patient_id,n.created_by_user_id)=
    (o.note_id,o.episode_id,o.subject_patient_id,o.author_user_id)
  JOIN public.clinical_episode_participants c ON (c.episode_id,c.patient_id,c.psychologist_user_id)=
    (o.episode_id,o.subject_patient_id,o.author_user_id)
  WHERE (o.note_id,o.episode_id,o.subject_patient_id,o.author_user_id)=($1,$2,$3,$4)
    AND o.contract_version=1 AND o.registration_kind='professional_original'
    AND o.registered_by_user_id=o.author_user_id
$$;
REVOKE ALL ON FUNCTION public.recognize_private_note_origin_v1(bigint,bigint,text,text) FROM PUBLIC;
DO $$
DECLARE owner_name text; reader_name text;
BEGIN
  SELECT 'psicopanel_origin_resolver_owner_'||oid::text INTO STRICT owner_name FROM pg_catalog.pg_database WHERE datname=current_database();
  SELECT r.rolname INTO STRICT reader_name FROM pg_catalog.pg_proc p
    CROSS JOIN LATERAL pg_catalog.aclexplode(p.proacl) a JOIN pg_catalog.pg_roles r ON r.oid=a.grantee
    WHERE p.oid='public.lock_account_session(text)'::regprocedure AND a.grantee<>p.proowner;
  EXECUTE format('ALTER FUNCTION public.recognize_private_note_origin_v1(bigint,bigint,text,text) OWNER TO %I',owner_name);
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.recognize_private_note_origin_v1(bigint,bigint,text,text) TO %I',reader_name);
END $$;
