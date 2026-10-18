-- Transaction, prerequisites, checksums and advisory lock belong to migrate.js.
-- No backfill: existing rows keep episode_id NULL and original authorship.
DO $$
BEGIN
  IF current_setting('psicopanel.migration_target', true) IS DISTINCT FROM '003' THEN
    RAISE EXCEPTION 'Use the explicit db:migrate runner for migration 003';
  END IF;
END $$;

-- A composite reference keeps the professional role valid even after account edits.
ALTER TABLE users ADD CONSTRAINT users_id_role_episode_key UNIQUE (id, role);

CREATE TABLE clinical_episodes (
  id BIGSERIAL PRIMARY KEY CHECK (id > 0),
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  psychologist_user_id TEXT NOT NULL,
  psychologist_role TEXT NOT NULL DEFAULT 'psychologist' CHECK (psychologist_role = 'psychologist'),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'finalized')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT clinical_episodes_professional_fk FOREIGN KEY (psychologist_user_id, psychologist_role)
    REFERENCES users(id, role) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT clinical_episodes_finalization_check CHECK (
    (status = 'finalized' AND finalized_at IS NOT NULL AND finalized_at >= started_at)
    OR (status IN ('active', 'paused') AND finalized_at IS NULL)),
  CONSTRAINT clinical_episodes_patient_key UNIQUE (id, patient_id),
  CONSTRAINT clinical_episodes_author_key UNIQUE (id, patient_id, psychologist_user_id)
);
CREATE UNIQUE INDEX clinical_episodes_one_current_patient_idx ON clinical_episodes(patient_id)
  WHERE status IN ('active', 'paused');
CREATE INDEX clinical_episodes_psychologist_idx ON clinical_episodes(psychologist_user_id, patient_id);

CREATE FUNCTION enforce_clinical_episode_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id, NEW.patient_id, NEW.psychologist_user_id, NEW.psychologist_role, NEW.started_at, NEW.created_at)
    IS DISTINCT FROM
    (OLD.id, OLD.patient_id, OLD.psychologist_user_id, OLD.psychologist_role, OLD.started_at, OLD.created_at) THEN
    RAISE EXCEPTION 'EPISODE_INTEGRITY: Episode identity is immutable';
  END IF;
  IF OLD.status = 'finalized' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'EPISODE_INTEGRITY: Finalization is terminal';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER enforce_clinical_episode_identity BEFORE UPDATE ON clinical_episodes
  FOR EACH ROW EXECUTE FUNCTION enforce_clinical_episode_identity();
CREATE TRIGGER preserve_clinical_row BEFORE UPDATE OR DELETE ON clinical_episodes
  FOR EACH ROW EXECUTE FUNCTION preserve_clinical_record();
CREATE TRIGGER prevent_clinical_truncate BEFORE TRUNCATE ON clinical_episodes
  FOR EACH STATEMENT EXECUTE FUNCTION preserve_clinical_record();

ALTER TABLE appointments ADD COLUMN episode_id BIGINT;
ALTER TABLE patient_clinical_notes ADD COLUMN episode_id BIGINT;
ALTER TABLE patient_tasks ADD COLUMN episode_id BIGINT;
ALTER TABLE appointment_waitlist_entries ADD COLUMN episode_id BIGINT;

-- MATCH SIMPLE alone skips NULL: a generated, non-null comparison key makes
-- NULL/NULL equal and rejects NULL/episode in either direction, using native FK
-- locking also for concurrent parent/child writes. Zero is never an episode ID.
ALTER TABLE appointments ADD COLUMN episode_scope_id BIGINT
  GENERATED ALWAYS AS (COALESCE(episode_id, 0)) STORED;
ALTER TABLE patient_clinical_notes ADD COLUMN episode_scope_id BIGINT
  GENERATED ALWAYS AS (COALESCE(episode_id, 0)) STORED;
ALTER TABLE patient_tasks ADD COLUMN episode_scope_id BIGINT
  GENERATED ALWAYS AS (COALESCE(episode_id, 0)) STORED;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_episode_patient_fk FOREIGN KEY (episode_id, patient_id)
    REFERENCES clinical_episodes(id, patient_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT appointments_episode_scope_key UNIQUE (id, patient_id, episode_scope_id);
ALTER TABLE patient_clinical_notes
  ADD CONSTRAINT notes_episode_patient_fk FOREIGN KEY (episode_id, patient_id)
    REFERENCES clinical_episodes(id, patient_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT notes_episode_author_check CHECK (episode_id IS NULL OR created_by_user_id IS NOT NULL),
  ADD CONSTRAINT notes_episode_author_fk FOREIGN KEY (episode_id, patient_id, created_by_user_id)
    REFERENCES clinical_episodes(id, patient_id, psychologist_user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT notes_appointment_scope_fk FOREIGN KEY (appointment_id, patient_id, episode_scope_id)
    REFERENCES appointments(id, patient_id, episode_scope_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT notes_episode_scope_key UNIQUE (id, patient_id, episode_scope_id);
ALTER TABLE patient_tasks
  ADD CONSTRAINT tasks_episode_patient_fk FOREIGN KEY (episode_id, patient_id)
    REFERENCES clinical_episodes(id, patient_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT tasks_note_scope_fk FOREIGN KEY (clinical_note_id, patient_id, episode_scope_id)
    REFERENCES patient_clinical_notes(id, patient_id, episode_scope_id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE appointment_waitlist_entries
  ADD CONSTRAINT waitlist_episode_patient_fk FOREIGN KEY (episode_id, patient_id)
    REFERENCES clinical_episodes(id, patient_id) ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION preserve_episode_attribution() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.episode_id IS NOT NULL AND NEW.episode_id IS DISTINCT FROM OLD.episode_id THEN
    RAISE EXCEPTION 'EPISODE_INTEGRITY: Existing attribution cannot be removed or reassigned';
  END IF;
  RETURN NEW;
END $$;
DO $$
DECLARE relation_name TEXT;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['appointments', 'patient_clinical_notes', 'patient_tasks', 'appointment_waitlist_entries'] LOOP
    EXECUTE format('CREATE INDEX %I ON %I (episode_id, patient_id)', relation_name || '_episode_idx', relation_name);
    EXECUTE format('CREATE TRIGGER preserve_episode_attribution BEFORE UPDATE ON %I
      FOR EACH ROW EXECUTE FUNCTION preserve_episode_attribution()', relation_name);
  END LOOP;
END $$;

-- Waitlist attribution is historical too; cancellation remains the supported path.
CREATE TRIGGER preserve_clinical_row BEFORE UPDATE OR DELETE ON appointment_waitlist_entries
  FOR EACH ROW EXECUTE FUNCTION preserve_clinical_record();
CREATE TRIGGER prevent_clinical_truncate BEFORE TRUNCATE ON appointment_waitlist_entries
  FOR EACH STATEMENT EXECUTE FUNCTION preserve_clinical_record();
REVOKE ALL ON clinical_episodes FROM PUBLIC;
