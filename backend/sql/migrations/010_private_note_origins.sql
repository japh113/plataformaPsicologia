-- 010: private technical provenance only, in an explicitly isolated destination.
-- No HTTP writer, clinical permission, audience resolver, publication or activation.
DO $$
DECLARE creator_name TEXT := current_setting('psicopanel.private_note_creator',true); creator_oid OID;
BEGIN
  IF current_setting('psicopanel.migration_target',true) IS DISTINCT FROM '010'
    OR NOT (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=current_user) THEN
    RAISE EXCEPTION '010 requires explicit isolated provisioning through the migration runner';
  END IF;
  SELECT oid INTO creator_oid FROM pg_catalog.pg_roles WHERE rolname=creator_name
    AND rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
    AND NOT rolreplication AND NOT rolbypassrls AND rolconfig IS NULL;
  IF creator_oid IS NULL OR EXISTS(SELECT FROM pg_catalog.pg_auth_members WHERE creator_oid IN (roleid,member))
    OR EXISTS(SELECT FROM pg_catalog.pg_shdepend WHERE refclassid='pg_catalog.pg_authid'::regclass AND refobjid=creator_oid)
    OR pg_catalog.has_schema_privilege(creator_oid,'public','CREATE') THEN
    RAISE EXCEPTION '010 requires an explicit pristine restricted NOINHERIT LOGIN private note creator';
  END IF;
  -- Existing 009 rows are neither classified nor changed. All DDL and role grants
  -- below are transactional; the runner verifies 009 BEFORE executing this file.
  LOCK TABLE public.patient_clinical_notes IN ACCESS EXCLUSIVE MODE;
END $$;

ALTER TABLE public.patient_clinical_notes ADD CONSTRAINT notes_private_origin_key
  UNIQUE(id,episode_id,patient_id,created_by_user_id);
CREATE TABLE public.clinical_note_private_origins (
  note_id BIGINT PRIMARY KEY,
  episode_id BIGINT NOT NULL,
  subject_patient_id TEXT NOT NULL,
  author_user_id TEXT NOT NULL,
  contract_version INTEGER NOT NULL CHECK(contract_version=1),
  registration_kind TEXT NOT NULL CHECK(registration_kind='professional_original'),
  registered_by_user_id TEXT NOT NULL REFERENCES public.users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  registered_at TIMESTAMPTZ NOT NULL,
  UNIQUE(note_id,episode_id),
  CHECK(registered_by_user_id=author_user_id),
  FOREIGN KEY(note_id,episode_id,subject_patient_id,author_user_id)
    REFERENCES public.patient_clinical_notes(id,episode_id,patient_id,created_by_user_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY(episode_id,subject_patient_id,author_user_id)
    REFERENCES public.clinical_episode_participants(episode_id,patient_id,psychologist_user_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE INDEX clinical_note_private_origins_episode_idx
  ON public.clinical_note_private_origins(episode_id,subject_patient_id);
REVOKE ALL ON public.clinical_note_private_origins FROM PUBLIC;

-- The only exported capability. The argument author is a structural fixture
-- assertion, NOT proof of a human session. No existing note id is accepted.
CREATE FUNCTION public.create_private_clinical_note_v1(
  requested_episode BIGINT, requested_patient TEXT, requested_author TEXT,
  requested_appointment BIGINT, requested_content TEXT
) RETURNS BIGINT LANGUAGE plpgsql VOLATILE SECURITY DEFINER PARALLEL UNSAFE
SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE appointment_date DATE; new_note_id BIGINT;
BEGIN
  SELECT a.scheduled_date INTO appointment_date
    FROM public.clinical_episodes e
    JOIN public.clinical_episode_participants p ON p.episode_id=e.id
    JOIN public.appointments a ON a.episode_id=e.id AND a.patient_id=p.patient_id
    WHERE e.id=requested_episode AND e.status='prepared'
      AND p.patient_id=requested_patient AND e.psychologist_user_id=requested_author
      AND p.psychologist_user_id=requested_author AND a.created_by_user_id=requested_author
      AND a.id=requested_appointment AND a.status='completed'
    FOR UPDATE OF a;
  IF NOT FOUND OR appointment_date>(CURRENT_TIMESTAMP AT TIME ZONE 'America/Los_Angeles')::date THEN
    RAISE EXCEPTION 'PRIVATE_NOTE_ORIGIN: Invalid prepared episode, subject, author or completed appointment';
  END IF;
  INSERT INTO public.patient_clinical_notes(episode_id,patient_id,created_by_user_id,
    appointment_id,clinical_note_date,content)
    VALUES(requested_episode,requested_patient,requested_author,requested_appointment,appointment_date,requested_content)
    RETURNING id INTO new_note_id;
  RETURN new_note_id;
END $$;

-- SECURITY INVOKER: compares the ACTUAL effective writer while creator is on
-- the stack. No caller parameter, GUC or assumable application role is trusted.
CREATE FUNCTION public.guard_private_note_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF NEW.episode_id IS NOT NULL AND current_user IS DISTINCT FROM (
    SELECT pg_catalog.pg_get_userbyid(proowner) FROM pg_catalog.pg_proc
    WHERE oid='public.create_private_clinical_note_v1(bigint,text,text,bigint,text)'::regprocedure
  ) THEN
    RAISE EXCEPTION 'PRIVATE_NOTE_ORIGIN: Attributed notes require the restricted creator';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER a_private_note_insert BEFORE INSERT ON public.patient_clinical_notes
  FOR EACH ROW EXECUTE FUNCTION public.guard_private_note_insert();

CREATE FUNCTION public.materialize_private_note_origin() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF NEW.episode_id IS NOT NULL THEN
    INSERT INTO public.clinical_note_private_origins(note_id,episode_id,subject_patient_id,author_user_id,
      contract_version,registration_kind,registered_by_user_id,registered_at)
      VALUES(NEW.id,NEW.episode_id,NEW.patient_id,NEW.created_by_user_id,
        1,'professional_original',NEW.created_by_user_id,clock_timestamp());
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER materialize_private_note_origin AFTER INSERT ON public.patient_clinical_notes
  FOR EACH ROW EXECUTE FUNCTION public.materialize_private_note_origin();

CREATE FUNCTION public.guard_private_note_origin() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF TG_OP<>'INSERT' THEN
    RAISE EXCEPTION 'PRIVATE_NOTE_ORIGIN: Provenance is immutable';
  END IF;
  IF pg_catalog.pg_trigger_depth()<>2 OR current_user IS DISTINCT FROM (
    SELECT pg_catalog.pg_get_userbyid(proowner) FROM pg_catalog.pg_proc
    WHERE oid='public.create_private_clinical_note_v1(bigint,text,text,bigint,text)'::regprocedure
  ) THEN
    RAISE EXCEPTION 'PRIVATE_NOTE_ORIGIN: Registration only during restricted note insertion';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_private_note_origin BEFORE INSERT OR UPDATE OR DELETE ON public.clinical_note_private_origins
  FOR EACH ROW EXECUTE FUNCTION public.guard_private_note_origin();
CREATE TRIGGER guard_private_note_origin_truncate BEFORE TRUNCATE ON public.clinical_note_private_origins
  FOR EACH STATEMENT EXECUTE FUNCTION public.guard_private_note_origin();

-- Dedicated read-only SECURITY DEFINER. At COMMIT/SET CONSTRAINTS the creator
-- has returned: current_user is THIS verifier owner, independent of the caller.
-- WHEN is evaluated at INSERT; only attributed NEW rows enqueue this check.
CREATE FUNCTION public.verify_private_note_origin() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF NOT EXISTS(
    SELECT FROM public.patient_clinical_notes n
    JOIN public.clinical_note_private_origins o ON o.note_id=n.id AND o.episode_id=n.episode_id
      AND o.subject_patient_id=n.patient_id AND o.author_user_id=n.created_by_user_id
    WHERE n.id=NEW.id AND n.episode_id=NEW.episode_id AND n.patient_id=NEW.patient_id
      AND n.created_by_user_id=NEW.created_by_user_id AND o.contract_version=1
      AND o.registration_kind='professional_original' AND o.registered_by_user_id=o.author_user_id
  ) THEN
    RAISE EXCEPTION 'PRIVATE_NOTE_ORIGIN: Missing or inconsistent atomic provenance';
  END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER private_note_origin_required AFTER INSERT ON public.patient_clinical_notes
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN(NEW.episode_id IS NOT NULL)
  EXECUTE FUNCTION public.verify_private_note_origin();

-- Blocks every current legacy editor on accredited rows, even a no-op UPDATE.
-- Does not finalize their content: a future authorized editor needs its own PR.
CREATE FUNCTION public.guard_private_note_mutation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF EXISTS(SELECT FROM public.clinical_note_private_origins WHERE note_id=OLD.id) THEN
    RAISE EXCEPTION 'PRIVATE_NOTE_ORIGIN: No authorized editing protocol for accredited notes';
  END IF;
  IF TG_OP='UPDATE' AND OLD.episode_id IS NULL AND NEW.episode_id IS NOT NULL THEN
    RAISE EXCEPTION 'PRIVATE_NOTE_ORIGIN: Retrospective attribution is forbidden';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER a_private_note_mutation BEFORE UPDATE OR DELETE ON public.patient_clinical_notes
  FOR EACH ROW EXECUTE FUNCTION public.guard_private_note_mutation();

REVOKE ALL ON FUNCTION public.create_private_clinical_note_v1(bigint,text,text,bigint,text),
  public.guard_private_note_insert(),public.materialize_private_note_origin(),public.guard_private_note_origin(),
  public.verify_private_note_origin(),public.guard_private_note_mutation() FROM PUBLIC;
DO $$
DECLARE creator_owner TEXT; verifier_owner TEXT; creator_name TEXT:=current_setting('psicopanel.private_note_creator');
BEGIN
  SELECT 'psicopanel_note_creator_owner_'||oid::text,'psicopanel_note_verifier_owner_'||oid::text
    INTO creator_owner,verifier_owner FROM pg_catalog.pg_database WHERE datname=current_database();
  EXECUTE format('CREATE ROLE %I NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',creator_owner);
  EXECUTE format('CREATE ROLE %I NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',verifier_owner);
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I,%I,%I',creator_owner,verifier_owner,creator_name);
  EXECUTE format('GRANT SELECT(id,status,psychologist_user_id) ON public.clinical_episodes TO %I',creator_owner);
  EXECUTE format('GRANT SELECT(episode_id,patient_id,psychologist_user_id) ON public.clinical_episode_participants TO %I',creator_owner);
  -- 001 is an invoker and selects appointments%%ROWTYPE FOR UPDATE. Its exact
  -- historical body requires SELECT all + UPDATE one column; no exported UPDATE.
  EXECUTE format('GRANT SELECT ON public.appointments TO %I',creator_owner);
  EXECUTE format('GRANT UPDATE(id) ON public.appointments TO %I',creator_owner);
  EXECUTE format('GRANT INSERT(episode_id,patient_id,created_by_user_id,appointment_id,clinical_note_date,content),SELECT(id) ON public.patient_clinical_notes TO %I',creator_owner);
  EXECUTE format('GRANT USAGE ON SEQUENCE public.patient_clinical_notes_id_seq TO %I',creator_owner);
  EXECUTE format('GRANT INSERT ON public.clinical_note_private_origins TO %I',creator_owner);
  EXECUTE format('GRANT SELECT(id,episode_id,patient_id,created_by_user_id) ON public.patient_clinical_notes TO %I',verifier_owner);
  EXECUTE format('GRANT SELECT ON public.clinical_note_private_origins TO %I',verifier_owner);
  EXECUTE format('ALTER FUNCTION public.create_private_clinical_note_v1(bigint,text,text,bigint,text) OWNER TO %I',creator_owner);
  EXECUTE format('ALTER FUNCTION public.guard_private_note_insert() OWNER TO %I',creator_owner);
  EXECUTE format('ALTER FUNCTION public.materialize_private_note_origin() OWNER TO %I',creator_owner);
  EXECUTE format('ALTER FUNCTION public.guard_private_note_origin() OWNER TO %I',creator_owner);
  EXECUTE format('ALTER FUNCTION public.verify_private_note_origin() OWNER TO %I',verifier_owner);
  EXECUTE format('ALTER FUNCTION public.guard_private_note_mutation() OWNER TO %I',verifier_owner);
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.create_private_clinical_note_v1(bigint,text,text,bigint,text) TO %I',creator_name);
END $$;
