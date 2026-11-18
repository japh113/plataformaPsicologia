-- Private storage only. No operational content reader/writer or clinical grant.
DO $$ DECLARE relation_name text; populated boolean; BEGIN
  IF current_setting('psicopanel.migration_target',true) IS DISTINCT FROM '015'
    OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN
    RAISE EXCEPTION '015 requires explicit isolated provisioning';
  END IF;
  -- 014 installs one immutable predefined template, not business/clinical data.
  -- Lock it too; only that configuration and the ledger may already contain rows.
  FOR relation_name IN SELECT tablename FROM pg_tables WHERE schemaname='public'
    AND tablename<>'psicopanel_schema_migrations' ORDER BY tablename LOOP
    EXECUTE format('LOCK TABLE public.%I IN ACCESS EXCLUSIVE MODE',relation_name);
    EXECUTE format('SELECT EXISTS(SELECT FROM public.%I)',relation_name) INTO populated;
    IF populated AND relation_name<>'admission_templates' THEN RAISE EXCEPTION '015 requires an empty isolated destination'; END IF;
  END LOOP;
END $$;

CREATE TABLE episode_private_records (
  episode_id bigint PRIMARY KEY REFERENCES admission_preparations(episode_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  patient_id text COLLATE "C" NOT NULL,
  professional_user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(episode_id,patient_id,professional_user_id),
  FOREIGN KEY(episode_id,patient_id,professional_user_id)
    REFERENCES clinical_episode_participants(episode_id,patient_id,psychologist_user_id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
-- Each revision is the complete private value; no text is copied to generic history.
CREATE TABLE episode_private_record_versions (
  episode_id bigint NOT NULL, patient_id text COLLATE "C" NOT NULL, professional_user_id text NOT NULL,
  revision integer NOT NULL CHECK(revision>0), previous_revision integer NOT NULL CHECK(previous_revision>=0 AND previous_revision=revision-1),
  risk_level text NOT NULL CHECK(risk_level IN ('unevaluated','none','low','medium','high')),
  professional_context text NOT NULL CHECK(length(professional_context)<=10000),
  recording_kind text NOT NULL CHECK(recording_kind IN ('initial_empty','sandbox_fixture')),
  technical_author_user_id text REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  writer_login name NOT NULL DEFAULT session_user,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(episode_id,revision),
  FOREIGN KEY(episode_id,patient_id,professional_user_id)
    REFERENCES episode_private_records(episode_id,patient_id,professional_user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CHECK((revision=1 AND recording_kind='initial_empty' AND technical_author_user_id IS NULL
      AND risk_level='unevaluated' AND professional_context='') OR
    (revision>1 AND recording_kind='sandbox_fixture' AND technical_author_user_id=professional_user_id AND technical_author_user_id IS NOT NULL))
);
REVOKE ALL ON episode_private_records,episode_private_record_versions FROM PUBLIC;

CREATE FUNCTION episode_record_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'episode_record_immutable'; END $$;
CREATE TRIGGER episode_record_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON episode_private_records
  FOR EACH STATEMENT EXECUTE FUNCTION episode_record_immutable();
CREATE TRIGGER episode_record_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON episode_private_record_versions
  FOR EACH STATEMENT EXECUTE FUNCTION episode_record_immutable();

CREATE FUNCTION episode_record_version_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
DECLARE latest integer;
BEGIN
  IF current_setting('session_replication_role')<>'origin' THEN RAISE EXCEPTION 'episode_record_invalid'; END IF;
  -- Serialize per record. The SELECT after waiting sees the committed revision.
  PERFORM episode_id FROM public.episode_private_records WHERE episode_id=NEW.episode_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'episode_record_invalid'; END IF;
  SELECT coalesce(max(revision),0) INTO latest FROM public.episode_private_record_versions WHERE episode_id=NEW.episode_id;
  IF latest IS DISTINCT FROM NEW.previous_revision OR NEW.revision IS DISTINCT FROM latest+1 THEN
    RAISE EXCEPTION 'episode_record_conflict' USING ERRCODE='40001';
  END IF;
  IF latest=0 AND (pg_trigger_depth()<>2 OR NEW.recording_kind<>'initial_empty') OR
    latest>0 AND (pg_trigger_depth()<>1 OR NEW.recording_kind<>'sandbox_fixture') THEN
    RAISE EXCEPTION 'episode_record_invalid';
  END IF;
  -- Actual database provenance, never evidence of an authenticated clinical act.
  NEW.writer_login:=session_user; NEW.recorded_at:=clock_timestamp();
  RETURN NEW;
END $$;
CREATE TRIGGER episode_record_version_guard BEFORE INSERT ON episode_private_record_versions
  FOR EACH ROW EXECUTE FUNCTION episode_record_version_guard();

CREATE FUNCTION episode_record_from_preparation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
DECLARE subject text; professional text;
BEGIN
  IF current_setting('session_replication_role')<>'origin' THEN RAISE EXCEPTION 'episode_record_invalid'; END IF;
  SELECT e.participant_one_id,e.psychologist_user_id INTO subject,professional
    FROM public.clinical_episodes e JOIN public.clinical_episode_participants cp
      ON (cp.episode_id,cp.patient_id,cp.psychologist_user_id)=(e.id,e.participant_one_id,e.psychologist_user_id)
    WHERE e.id=NEW.episode_id AND e.modality='individual' AND e.participant_two_id IS NULL
      AND e.status='prepared' AND e.started_at IS NULL AND e.finalized_at IS NULL
      AND e.created_by_user_id=NEW.created_by AND e.psychologist_user_id=NEW.created_by;
  IF NOT FOUND THEN RAISE EXCEPTION 'episode_record_invalid'; END IF;
  INSERT INTO public.episode_private_records(episode_id,patient_id,professional_user_id) VALUES(NEW.episode_id,subject,professional);
  INSERT INTO public.episode_private_record_versions(episode_id,patient_id,professional_user_id,revision,previous_revision,
    risk_level,professional_context,recording_kind)
    VALUES(NEW.episode_id,subject,professional,1,0,'unevaluated','','initial_empty');
  RETURN NULL;
END $$;
-- Only the explicit admission preparation, never arbitrary episode insertion.
CREATE TRIGGER episode_record_from_preparation AFTER INSERT ON admission_preparations
  FOR EACH ROW EXECUTE FUNCTION episode_record_from_preparation();

DO $$ DECLARE owner_name text:='episode_record_owner_'||substr(md5(current_database()),1,16); f record; BEGIN
  EXECUTE format('CREATE ROLE %I NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',owner_name);
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I',owner_name);
  EXECUTE format('GRANT SELECT(id,participant_one_id,participant_two_id,psychologist_user_id,created_by_user_id,modality,status,started_at,finalized_at) ON public.clinical_episodes TO %I',owner_name);
  EXECUTE format('GRANT SELECT(episode_id,patient_id,psychologist_user_id) ON public.clinical_episode_participants TO %I',owner_name);
  EXECUTE format('ALTER TABLE public.episode_private_records OWNER TO %I',owner_name);
  EXECUTE format('ALTER TABLE public.episode_private_record_versions OWNER TO %I',owner_name);
  FOR f IN SELECT p.oid::regprocedure AS name FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
    AND p.proname IN ('episode_record_immutable','episode_record_version_guard','episode_record_from_preparation') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f.name);
    EXECUTE format('ALTER FUNCTION %s OWNER TO %I',f.name,owner_name);
  END LOOP;
END $$;
