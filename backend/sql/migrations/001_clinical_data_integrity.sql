-- Apply explicitly to existing databases; never replay schema/seed as a migration.
-- No clinical rows are removed, rewritten or normalized by this migration.
BEGIN;

ALTER TABLE patient_tasks ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ;

-- Find constraints by relationship, including legacy or custom constraint names.
DO $$
DECLARE fk RECORD;
BEGIN
  FOR fk IN
    SELECT c.conrelid::regclass AS child, c.conname,
      pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.contype = 'f' AND c.confdeltype IN ('c', 'n')
      AND n.nspname = current_schema()
      AND t.relname IN ('patient_intakes', 'users', 'care_relationships',
        'psychologist_patient_access', 'patient_tasks', 'appointments',
        'appointment_waitlist_entries', 'patient_clinical_notes', 'audit_logs')
      AND c.confrelid IN ('patients'::regclass, 'appointments'::regclass,
        'patient_clinical_notes'::regclass, 'users'::regclass)
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', fk.child, fk.conname);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', fk.child, fk.conname,
      regexp_replace(fk.definition, 'ON DELETE (CASCADE|SET NULL)', 'ON DELETE RESTRICT'));
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS clinical_record_history (
  id BIGSERIAL PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  previous_record JSONB NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS clinical_record_history_patient_idx
  ON clinical_record_history (patient_id, recorded_at, id);
REVOKE ALL ON clinical_record_history FROM PUBLIC;

CREATE OR REPLACE FUNCTION preserve_clinical_record() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION 'CLINICAL_INTEGRITY: Los registros clinicos se conservan; utiliza cancelacion, cambio de estado o retiro.';
  END IF;
  IF to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW) THEN
    INSERT INTO clinical_record_history (table_name, record_id, patient_id, previous_record)
    VALUES (TG_TABLE_NAME, COALESCE(to_jsonb(OLD)->>'id', to_jsonb(OLD)->>'patient_id'),
      CASE WHEN TG_TABLE_NAME = 'patients' THEN to_jsonb(OLD)->>'id' ELSE to_jsonb(OLD)->>'patient_id' END,
      to_jsonb(OLD));
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION protect_clinical_history() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'CLINICAL_INTEGRITY: El historial clinico no puede modificarse ni eliminarse.';
END $$;
DROP TRIGGER IF EXISTS clinical_history_immutable ON clinical_record_history;
CREATE TRIGGER clinical_history_immutable BEFORE UPDATE OR DELETE OR TRUNCATE
  ON clinical_record_history FOR EACH STATEMENT EXECUTE FUNCTION protect_clinical_history();

DO $$
DECLARE clinical_table TEXT;
BEGIN
  FOREACH clinical_table IN ARRAY ARRAY['patients', 'patient_intakes', 'appointments',
    'patient_clinical_notes', 'patient_tasks'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS preserve_clinical_row ON %I', clinical_table);
    EXECUTE format('CREATE TRIGGER preserve_clinical_row BEFORE UPDATE OR DELETE ON %I
      FOR EACH ROW EXECUTE FUNCTION preserve_clinical_record()', clinical_table);
    EXECUTE format('DROP TRIGGER IF EXISTS prevent_clinical_truncate ON %I', clinical_table);
    EXECUTE format('CREATE TRIGGER prevent_clinical_truncate BEFORE TRUNCATE ON %I
      FOR EACH STATEMENT EXECUTE FUNCTION preserve_clinical_record()', clinical_table);
  END LOOP;
END $$;

-- Both paths serialize on the appointment row, closing the gap between API checks
-- and writes. A clinical note cannot be moved to unlock a previous appointment.
CREATE OR REPLACE FUNCTION enforce_clinical_appointment() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE linked_appointment appointments%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME = 'patient_clinical_notes' THEN
    IF TG_OP = 'UPDATE' AND (NEW.appointment_id, NEW.patient_id)
      IS DISTINCT FROM (OLD.appointment_id, OLD.patient_id) THEN
      RAISE EXCEPTION 'CLINICAL_INTEGRITY: No puedes cambiar la cita o paciente de una nota clinica.';
    END IF;
    SELECT * INTO linked_appointment FROM appointments WHERE id = NEW.appointment_id FOR UPDATE;
    IF NOT FOUND OR linked_appointment.patient_id <> NEW.patient_id
      OR linked_appointment.status <> 'completed'
      OR linked_appointment.scheduled_date > (CURRENT_TIMESTAMP AT TIME ZONE 'America/Los_Angeles')::date
      OR linked_appointment.scheduled_date <> NEW.clinical_note_date THEN
      RAISE EXCEPTION 'CLINICAL_INTEGRITY: La nota requiere una cita completada del mismo paciente y fecha, que no sea futura.';
    END IF;
  ELSIF EXISTS (SELECT 1 FROM patient_clinical_notes WHERE appointment_id = OLD.id)
    AND ((NEW.patient_id, NEW.scheduled_date, NEW.scheduled_time)
      IS DISTINCT FROM (OLD.patient_id, OLD.scheduled_date, OLD.scheduled_time)
      OR NEW.status <> 'completed') THEN
    RAISE EXCEPTION 'CLINICAL_INTEGRITY: No puedes cancelar ni reprogramar una cita con nota clinica.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS enforce_clinical_appointment ON appointments;
CREATE TRIGGER enforce_clinical_appointment BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION enforce_clinical_appointment();
DROP TRIGGER IF EXISTS enforce_clinical_appointment ON patient_clinical_notes;
CREATE TRIGGER enforce_clinical_appointment BEFORE INSERT OR UPDATE ON patient_clinical_notes
  FOR EACH ROW EXECUTE FUNCTION enforce_clinical_appointment();

COMMIT;
