-- 008: structural preparation only. Never activates treatment or grants clinical access.
-- Explicit runner, empty destination, transaction and ledger are mandatory.
DO $$
DECLARE relation_name TEXT; populated BOOLEAN;
BEGIN
  IF current_setting('psicopanel.migration_target',true) IS DISTINCT FROM '008' THEN
    RAISE EXCEPTION 'Use explicit migration runner target 008';
  END IF;
  -- This increment provisions a dedicated NOLOGIN function owner; it is not a
  -- deployable upgrade for existing application roles or populated databases.
  IF NOT (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=current_user) THEN
    RAISE EXCEPTION '008 requires an explicit isolated provisioning administrator';
  END IF;
  -- Prevent a writer racing the emptiness check. Never repair or delete rows.
  FOR relation_name IN SELECT tablename FROM pg_catalog.pg_tables
    WHERE schemaname='public' AND tablename<>'psicopanel_schema_migrations' ORDER BY tablename
  LOOP
    EXECUTE format('LOCK TABLE public.%I IN ACCESS EXCLUSIVE MODE',relation_name);
    IF EXISTS (SELECT FROM pg_catalog.pg_class WHERE oid=to_regclass(format('public.%I',relation_name))) THEN
      EXECUTE format('SELECT EXISTS (SELECT FROM public.%I)',relation_name) INTO STRICT populated;
      IF populated THEN RAISE EXCEPTION '008 requires an empty isolated destination; no rows changed'; END IF;
    END IF;
  END LOOP;
END $$;

ALTER TABLE public.appointments DROP CONSTRAINT appointments_episode_patient_fk;
ALTER TABLE public.patient_clinical_notes DROP CONSTRAINT notes_episode_patient_fk,
  DROP CONSTRAINT notes_episode_author_fk;
ALTER TABLE public.patient_tasks DROP CONSTRAINT tasks_episode_patient_fk;
ALTER TABLE public.appointment_waitlist_entries DROP CONSTRAINT waitlist_episode_patient_fk;
DROP INDEX public.clinical_episodes_one_current_patient_idx;
DROP INDEX public.clinical_episodes_psychologist_idx;
ALTER TABLE public.clinical_episodes DROP CONSTRAINT clinical_episodes_patient_key,
  DROP CONSTRAINT clinical_episodes_author_key,
  DROP CONSTRAINT clinical_episodes_status_check,
  DROP CONSTRAINT clinical_episodes_finalization_check,
  DROP COLUMN patient_id,
  ALTER COLUMN status SET DEFAULT 'prepared',
  ALTER COLUMN started_at DROP DEFAULT,
  ALTER COLUMN started_at DROP NOT NULL,
  ADD COLUMN modality TEXT NOT NULL CHECK (modality IN ('individual','couple')),
  ADD COLUMN participant_one_id TEXT COLLATE "C" NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD COLUMN participant_two_id TEXT COLLATE "C" REFERENCES public.patients(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD COLUMN created_by_user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT clinical_episodes_status_check CHECK (status IN ('prepared','active','paused','finalized')),
  ADD CONSTRAINT clinical_episodes_prepared_check CHECK (status='prepared' AND started_at IS NULL AND finalized_at IS NULL),
  ADD CONSTRAINT clinical_episodes_composition_check CHECK (
    (modality='individual' AND participant_two_id IS NULL) OR
    (modality='couple' AND participant_two_id IS NOT NULL AND participant_one_id < participant_two_id)),
  ADD CONSTRAINT clinical_episodes_professional_key UNIQUE(id,psychologist_user_id);
CREATE INDEX clinical_episodes_psychologist_idx ON public.clinical_episodes(psychologist_user_id,status,id);

CREATE TABLE public.clinical_episode_participants (
  episode_id BIGINT NOT NULL,
  patient_id TEXT COLLATE "C" NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  slot SMALLINT NOT NULL CHECK (slot IN (1,2)),
  psychologist_user_id TEXT NOT NULL,
  PRIMARY KEY(episode_id,patient_id),
  UNIQUE(episode_id,slot),
  UNIQUE(episode_id,patient_id,psychologist_user_id),
  FOREIGN KEY(episode_id,psychologist_user_id) REFERENCES public.clinical_episodes(id,psychologist_user_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX clinical_episode_participants_patient_idx ON public.clinical_episode_participants(patient_id,episode_id);
REVOKE ALL ON public.clinical_episode_participants FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.enforce_clinical_episode_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'EPISODE_INTEGRITY: Prepared episode identity and lifecycle are immutable';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION public.check_episode_participant() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF TG_OP<>'INSERT' THEN
    RAISE EXCEPTION 'EPISODE_INTEGRITY: Participants are immutable';
  END IF;
  IF NOT EXISTS (SELECT FROM public.clinical_episodes e WHERE e.id=NEW.episode_id
    AND e.psychologist_user_id=NEW.psychologist_user_id
    AND ((NEW.slot=1 AND NEW.patient_id=e.participant_one_id)
      OR (NEW.slot=2 AND NEW.patient_id=e.participant_two_id))) THEN
    RAISE EXCEPTION 'EPISODE_INTEGRITY: Participant does not match episode composition';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER check_episode_participant BEFORE INSERT OR UPDATE OR DELETE ON public.clinical_episode_participants
  FOR EACH ROW EXECUTE FUNCTION public.check_episode_participant();
CREATE TRIGGER prevent_clinical_truncate BEFORE TRUNCATE ON public.clinical_episode_participants
  FOR EACH STATEMENT EXECUTE FUNCTION public.protect_clinical_history();

CREATE FUNCTION public.materialize_episode_participants() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  INSERT INTO public.clinical_episode_participants(episode_id,patient_id,slot,psychologist_user_id)
    VALUES(NEW.id,NEW.participant_one_id,1,NEW.psychologist_user_id);
  IF NEW.participant_two_id IS NOT NULL THEN
    INSERT INTO public.clinical_episode_participants(episode_id,patient_id,slot,psychologist_user_id)
      VALUES(NEW.id,NEW.participant_two_id,2,NEW.psychologist_user_id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER materialize_episode_participants AFTER INSERT ON public.clinical_episodes
  FOR EACH ROW EXECUTE FUNCTION public.materialize_episode_participants();
REVOKE ALL ON FUNCTION public.materialize_episode_participants(),public.check_episode_participant() FROM PUBLIC;

-- Unique per database: never adopt or mutate a preexisting cluster role.
DO $$
DECLARE owner_name TEXT;
BEGIN
  SELECT 'psicopanel_cep_owner_'||oid::text INTO owner_name FROM pg_catalog.pg_database WHERE datname=current_database();
  EXECUTE format('CREATE ROLE %I NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',owner_name);
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I',owner_name);
  EXECUTE format('GRANT SELECT ON public.clinical_episodes TO %I',owner_name);
  EXECUTE format('GRANT INSERT ON public.clinical_episode_participants TO %I',owner_name);
  EXECUTE format('ALTER FUNCTION public.materialize_episode_participants() OWNER TO %I',owner_name);
END $$;

-- 001 row history requires a singular patient; do not attribute a couple to slot 1.
CREATE TABLE public.clinical_episode_history (
  id BIGSERIAL PRIMARY KEY,
  episode_id BIGINT NOT NULL REFERENCES public.clinical_episodes(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  previous_record JSONB NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON public.clinical_episode_history FROM PUBLIC;
CREATE FUNCTION public.preserve_episode_record() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF TG_OP IN ('DELETE','TRUNCATE') THEN
    RAISE EXCEPTION 'CLINICAL_INTEGRITY: Episode records are preserved';
  END IF;
  IF NEW IS DISTINCT FROM OLD THEN
    INSERT INTO public.clinical_episode_history(episode_id,previous_record) VALUES(OLD.id,to_jsonb(OLD));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER preserve_clinical_row ON public.clinical_episodes;
DROP TRIGGER prevent_clinical_truncate ON public.clinical_episodes;
CREATE TRIGGER preserve_clinical_row BEFORE UPDATE OR DELETE ON public.clinical_episodes
  FOR EACH ROW EXECUTE FUNCTION public.preserve_episode_record();
CREATE TRIGGER prevent_clinical_truncate BEFORE TRUNCATE ON public.clinical_episodes
  FOR EACH STATEMENT EXECUTE FUNCTION public.preserve_episode_record();
CREATE TRIGGER clinical_episode_history_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.clinical_episode_history
  FOR EACH STATEMENT EXECUTE FUNCTION public.protect_clinical_history();

ALTER TABLE public.appointments ADD COLUMN created_by_user_id TEXT REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public.patient_tasks ADD COLUMN created_by_user_id TEXT REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public.appointment_waitlist_entries ADD COLUMN created_by_user_id TEXT REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_episode_patient_fk FOREIGN KEY(episode_id,patient_id)
    REFERENCES public.clinical_episode_participants(episode_id,patient_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT appointments_episode_author_check CHECK(episode_id IS NULL OR created_by_user_id IS NOT NULL),
  ADD CONSTRAINT appointments_episode_author_fk FOREIGN KEY(episode_id,patient_id,created_by_user_id)
    REFERENCES public.clinical_episode_participants(episode_id,patient_id,psychologist_user_id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public.patient_clinical_notes
  ADD CONSTRAINT notes_episode_patient_fk FOREIGN KEY(episode_id,patient_id)
    REFERENCES public.clinical_episode_participants(episode_id,patient_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT notes_episode_author_fk FOREIGN KEY(episode_id,patient_id,created_by_user_id)
    REFERENCES public.clinical_episode_participants(episode_id,patient_id,psychologist_user_id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public.patient_tasks
  ADD CONSTRAINT tasks_episode_patient_fk FOREIGN KEY(episode_id,patient_id)
    REFERENCES public.clinical_episode_participants(episode_id,patient_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT tasks_episode_author_check CHECK(episode_id IS NULL OR created_by_user_id IS NOT NULL),
  ADD CONSTRAINT tasks_episode_author_fk FOREIGN KEY(episode_id,patient_id,created_by_user_id)
    REFERENCES public.clinical_episode_participants(episode_id,patient_id,psychologist_user_id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public.appointment_waitlist_entries
  ADD CONSTRAINT waitlist_episode_patient_fk FOREIGN KEY(episode_id,patient_id)
    REFERENCES public.clinical_episode_participants(episode_id,patient_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT waitlist_episode_author_check CHECK(episode_id IS NULL OR created_by_user_id IS NOT NULL),
  ADD CONSTRAINT waitlist_episode_author_fk FOREIGN KEY(episode_id,patient_id,created_by_user_id)
    REFERENCES public.clinical_episode_participants(episode_id,patient_id,psychologist_user_id) ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE OR REPLACE FUNCTION public.preserve_episode_attribution() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF OLD.episode_id IS NOT NULL AND (NEW.episode_id,NEW.patient_id,NEW.created_by_user_id)
    IS DISTINCT FROM (OLD.episode_id,OLD.patient_id,OLD.created_by_user_id) THEN
    RAISE EXCEPTION 'EPISODE_INTEGRITY: Existing attribution, subject and author are immutable';
  END IF;
  RETURN NEW;
END $$;
