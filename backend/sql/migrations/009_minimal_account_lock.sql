-- 009: account-lock capability only. No clinical authorization or data adoption.
-- Run only through the explicit runner in a new, isolated, empty destination.
DO $$
DECLARE relation_name TEXT; populated BOOLEAN; reader_oid OID;
  reader_name TEXT := current_setting('psicopanel.account_reader',true);
BEGIN
  IF current_setting('psicopanel.migration_target',true) IS DISTINCT FROM '009' THEN
    RAISE EXCEPTION 'Use explicit migration runner target 009';
  END IF;
  IF NOT (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=current_user) THEN
    RAISE EXCEPTION '009 requires an explicit isolated provisioning administrator';
  END IF;
  SELECT oid INTO reader_oid FROM pg_catalog.pg_roles WHERE rolname=reader_name
    AND rolcanlogin AND NOT rolsuper AND NOT rolinherit AND NOT rolcreatedb
    AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND rolconfig IS NULL;
  IF reader_oid IS NULL OR EXISTS (
    SELECT FROM pg_catalog.pg_auth_members WHERE reader_oid IN (roleid,member)
  ) OR EXISTS (
    -- No adoption of a role owning objects or already receiving any explicit
    -- grants, in this database OR another database in this isolated cluster.
    SELECT FROM pg_catalog.pg_shdepend WHERE refclassid='pg_catalog.pg_authid'::regclass AND refobjid=reader_oid
  ) THEN
    RAISE EXCEPTION '009 requires an explicit pristine restricted NOINHERIT LOGIN account reader';
  END IF;
  IF pg_catalog.has_schema_privilege(reader_oid,'public','CREATE') THEN
    RAISE EXCEPTION '009 account reader must not be able to create public objects';
  END IF;
  -- Serialize against all writers and preserve 008 empty-destination policy.
  FOR relation_name IN SELECT tablename FROM pg_catalog.pg_tables
    WHERE schemaname='public' AND tablename<>'psicopanel_schema_migrations' ORDER BY tablename
  LOOP
    EXECUTE format('LOCK TABLE public.%I IN ACCESS EXCLUSIVE MODE',relation_name);
    EXECUTE format('SELECT EXISTS (SELECT FROM public.%I)',relation_name) INTO STRICT populated;
    IF populated THEN RAISE EXCEPTION '009 requires an empty isolated destination; no rows changed'; END IF;
  END LOOP;
  IF EXISTS (
    SELECT FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S')
      AND (pg_catalog.has_table_privilege(reader_oid,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        OR pg_catalog.has_any_column_privilege(reader_oid,c.oid,'INSERT,UPDATE,REFERENCES'))
  ) THEN
    RAISE EXCEPTION '009 account reader has unsafe effective privileges';
  END IF;
END $$;

-- Fixed statement, no dynamic SQL, callbacks, identifiers or content access.
-- VOLATILE is required for row locking. The lock belongs to the caller's tx.
CREATE FUNCTION public.lock_account_session(account_id pg_catalog.text)
RETURNS TABLE(id pg_catalog.text,role pg_catalog.text,is_active pg_catalog.bool,session_version pg_catalog.int4)
LANGUAGE sql VOLATILE STRICT SECURITY DEFINER PARALLEL UNSAFE
SET search_path=pg_catalog,pg_temp AS $$
  SELECT u.id,u.role,u.is_active,u.session_version
  FROM public.users AS u WHERE u.id=$1 FOR SHARE OF u
$$;
REVOKE ALL ON FUNCTION public.lock_account_session(pg_catalog.text) FROM PUBLIC;

DO $$
DECLARE owner_name TEXT; reader_name TEXT := current_setting('psicopanel.account_reader');
BEGIN
  SELECT 'psicopanel_account_lock_owner_'||oid::text INTO owner_name
    FROM pg_catalog.pg_database WHERE datname=current_database();
  -- Never adopt an existing cluster role, including a role with this name.
  EXECUTE format('CREATE ROLE %I NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',owner_name);
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I',owner_name);
  EXECUTE format('GRANT SELECT(id,role,is_active,session_version), UPDATE(session_version) ON public.users TO %I',owner_name);
  EXECUTE format('ALTER FUNCTION public.lock_account_session(pg_catalog.text) OWNER TO %I',owner_name);
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I',reader_name);
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.lock_account_session(pg_catalog.text) TO %I',reader_name);
  -- Structural facts only, matching the existing private note evaluator.
  -- No direct users SELECT/UPDATE, text, history, sequences or other resources.
  EXECUTE format('GRANT SELECT(user_id,approval_status) ON public.psychologist_profiles TO %I',reader_name);
  EXECUTE format('GRANT SELECT(id,modality,status,psychologist_user_id,created_by_user_id,participant_one_id,participant_two_id) ON public.clinical_episodes TO %I',reader_name);
  EXECUTE format('GRANT SELECT(episode_id,patient_id,slot,psychologist_user_id) ON public.clinical_episode_participants TO %I',reader_name);
  EXECUTE format('GRANT SELECT(id,episode_id,patient_id,created_by_user_id,appointment_id) ON public.patient_clinical_notes TO %I',reader_name);
END $$;
