CREATE TABLE IF NOT EXISTS patients (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL DEFAULT '',
  full_name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  risk_level TEXT NOT NULL DEFAULT 'none' CHECK (risk_level IN ('none', 'low', 'medium', 'high')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'inactive', 'discharged')),
  last_clinical_note_date DATE,
  notes TEXT NOT NULL DEFAULT '',
  age INTEGER CHECK (age IS NULL OR age >= 0),
  reason_for_consultation TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS patient_intakes (
  patient_id TEXT PRIMARY KEY REFERENCES patients(id) ON DELETE CASCADE,
  birth_date DATE NOT NULL,
  birth_place TEXT NOT NULL DEFAULT '',
  occupation TEXT NOT NULL DEFAULT '',
  hobbies TEXT NOT NULL DEFAULT '',
  marital_status TEXT NOT NULL DEFAULT '',
  family_members TEXT NOT NULL DEFAULT '',
  lives_with TEXT NOT NULL DEFAULT '',
  physical_illnesses TEXT NOT NULL DEFAULT '',
  insomnia BOOLEAN NOT NULL DEFAULT FALSE,
  nightmares BOOLEAN NOT NULL DEFAULT FALSE,
  fears_or_phobias BOOLEAN NOT NULL DEFAULT FALSE,
  accidents BOOLEAN NOT NULL DEFAULT FALSE,
  alcohol_use BOOLEAN NOT NULL DEFAULT FALSE,
  tobacco_use BOOLEAN NOT NULL DEFAULT FALSE,
  drug_use BOOLEAN NOT NULL DEFAULT FALSE,
  psychological_abuse BOOLEAN NOT NULL DEFAULT FALSE,
  physical_abuse BOOLEAN NOT NULL DEFAULT FALSE,
  death_wish BOOLEAN NOT NULL DEFAULT FALSE,
  suicide_attempts BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'support', 'superadmin', 'psychologist', 'patient')),
  patient_id TEXT UNIQUE REFERENCES patients(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx
  ON password_reset_tokens (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS password_reset_tokens_active_idx
  ON password_reset_tokens (expires_at, used_at);

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'support', 'superadmin', 'psychologist', 'patient'));

CREATE TABLE IF NOT EXISTS psychologist_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  professional_title TEXT NOT NULL DEFAULT 'Psicologo',
  license_number TEXT NOT NULL DEFAULT '',
  approval_status TEXT NOT NULL DEFAULT 'pending_review' CHECK (approval_status IN ('pending_review', 'active', 'rejected', 'suspended')),
  review_notes TEXT NOT NULL DEFAULT '',
  approved_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS psychologist_profiles_approval_status_idx
  ON psychologist_profiles (approval_status, created_at DESC);

CREATE TABLE IF NOT EXISTS care_relationships (
  id BIGSERIAL PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  psychologist_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'ended', 'rejected')),
  requested_by_role TEXT NOT NULL DEFAULT 'psychologist' CHECK (requested_by_role IN ('admin', 'support', 'superadmin', 'psychologist', 'patient')),
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  approved_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT NOT NULL DEFAULT '',
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS care_relationships_patient_psychologist_active_idx
  ON care_relationships (patient_id, psychologist_user_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS care_relationships_patient_status_idx
  ON care_relationships (patient_id, status);

CREATE INDEX IF NOT EXISTS care_relationships_psychologist_status_idx
  ON care_relationships (psychologist_user_id, status);

ALTER TABLE patient_intakes
  DROP CONSTRAINT IF EXISTS patient_intakes_completed_by_user_id_fkey;

ALTER TABLE patient_intakes
  ADD CONSTRAINT patient_intakes_completed_by_user_id_fkey
  FOREIGN KEY (completed_by_user_id)
  REFERENCES users(id)
  ON DELETE SET NULL;

ALTER TABLE patient_intakes
  DROP CONSTRAINT IF EXISTS patient_intakes_updated_by_user_id_fkey;

ALTER TABLE patient_intakes
  ADD CONSTRAINT patient_intakes_updated_by_user_id_fkey
  FOREIGN KEY (updated_by_user_id)
  REFERENCES users(id)
  ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS psychologist_patient_access (
  psychologist_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (psychologist_user_id, patient_id)
);

CREATE TABLE IF NOT EXISTS psychologist_availability (
  psychologist_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (psychologist_user_id, weekday)
);

CREATE TABLE IF NOT EXISTS psychologist_availability_blocks (
  id BIGSERIAL PRIMARY KEY,
  psychologist_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS psychologist_availability_exceptions (
  psychologist_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exception_date DATE NOT NULL,
  is_unavailable BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (psychologist_user_id, exception_date)
);

CREATE TABLE IF NOT EXISTS psychologist_availability_exception_blocks (
  id BIGSERIAL PRIMARY KEY,
  psychologist_user_id TEXT NOT NULL,
  exception_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT psychologist_availability_exception_blocks_parent_fk
    FOREIGN KEY (psychologist_user_id, exception_date)
    REFERENCES psychologist_availability_exceptions (psychologist_user_id, exception_date)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS patient_tasks (
  id BIGSERIAL PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  clinical_note_id BIGINT,
  kind TEXT NOT NULL DEFAULT 'task' CHECK (kind IN ('task', 'objective')),
  text TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS appointments (
  id BIGSERIAL PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  scheduled_date DATE NOT NULL,
  scheduled_time TIME NOT NULL,
  recurrence_group_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled', 'no_show')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS appointment_waitlist_entries (
  id BIGSERIAL PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  scheduled_date DATE NOT NULL,
  scheduled_time TIME NOT NULL,
  priority_position INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'fulfilled', 'cancelled')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'appointments'
      AND constraint_name = 'appointments_status_check'
  ) THEN
    ALTER TABLE appointments DROP CONSTRAINT appointments_status_check;
  END IF;
END $$;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_status_check
  CHECK (status IN ('pending', 'completed', 'cancelled', 'no_show'));

ALTER TABLE appointment_waitlist_entries
  ADD COLUMN IF NOT EXISTS priority_position INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS appointment_waitlist_entries_slot_idx
  ON appointment_waitlist_entries (scheduled_date, scheduled_time, status);

CREATE INDEX IF NOT EXISTS appointment_waitlist_entries_priority_idx
  ON appointment_waitlist_entries (scheduled_date, scheduled_time, priority_position, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS appointment_waitlist_entries_active_unique_idx
  ON appointment_waitlist_entries (patient_id, scheduled_date, scheduled_time)
  WHERE status = 'active';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'patients'
      AND column_name = 'last_session_date'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'patients'
      AND column_name = 'last_clinical_note_date'
  ) THEN
    ALTER TABLE patients RENAME COLUMN last_session_date TO last_clinical_note_date;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_name = 'patient_sessions'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_name = 'patient_clinical_notes'
  ) THEN
    ALTER TABLE patient_sessions RENAME TO patient_clinical_notes;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS patient_clinical_notes (
  id BIGSERIAL PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  appointment_id BIGINT NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE CASCADE,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  clinical_note_date DATE NOT NULL,
  note_format TEXT NOT NULL DEFAULT 'simple' CHECK (note_format IN ('simple', 'soap')),
  clinical_note_objective TEXT NOT NULL DEFAULT '',
  clinical_observations TEXT NOT NULL DEFAULT '',
  next_steps TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'patient_clinical_notes'
      AND column_name = 'session_date'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'patient_clinical_notes'
      AND column_name = 'clinical_note_date'
  ) THEN
    ALTER TABLE patient_clinical_notes RENAME COLUMN session_date TO clinical_note_date;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'patient_clinical_notes'
      AND column_name = 'session_objective'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'patient_clinical_notes'
      AND column_name = 'clinical_note_objective'
  ) THEN
    ALTER TABLE patient_clinical_notes RENAME COLUMN session_objective TO clinical_note_objective;
  END IF;
END $$;

ALTER TABLE patient_clinical_notes
  ADD COLUMN IF NOT EXISTS clinical_note_objective TEXT NOT NULL DEFAULT '';

ALTER TABLE patient_clinical_notes
  ADD COLUMN IF NOT EXISTS clinical_observations TEXT NOT NULL DEFAULT '';

ALTER TABLE patient_clinical_notes
  ADD COLUMN IF NOT EXISTS next_steps TEXT NOT NULL DEFAULT '';

ALTER TABLE patients
  DROP COLUMN IF EXISTS allows_recurring_appointments;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS recurrence_group_id TEXT;

ALTER TABLE patients
  DROP CONSTRAINT IF EXISTS patients_risk_level_check;

ALTER TABLE patients
  ADD CONSTRAINT patients_risk_level_check
  CHECK (risk_level IN ('none', 'low', 'medium', 'high'));

ALTER TABLE patients
  DROP CONSTRAINT IF EXISTS patients_status_check;

ALTER TABLE patients
  ADD CONSTRAINT patients_status_check
  CHECK (status IN ('active', 'paused', 'inactive', 'discharged'));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'patient_tasks'
      AND column_name = 'session_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'patient_tasks'
      AND column_name = 'clinical_note_id'
  ) THEN
    ALTER TABLE patient_tasks RENAME COLUMN session_id TO clinical_note_id;
  END IF;
END $$;

ALTER TABLE patient_tasks
  ADD COLUMN IF NOT EXISTS clinical_note_id BIGINT;

ALTER TABLE patient_tasks
  DROP CONSTRAINT IF EXISTS patient_tasks_session_id_fkey;

ALTER TABLE patient_tasks
  DROP CONSTRAINT IF EXISTS patient_tasks_clinical_note_id_fkey;

ALTER TABLE patient_tasks
  ADD CONSTRAINT patient_tasks_clinical_note_id_fkey
  FOREIGN KEY (clinical_note_id)
  REFERENCES patient_clinical_notes(id)
  ON DELETE CASCADE;

ALTER TABLE patient_tasks
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'task';

ALTER TABLE patient_tasks
  DROP CONSTRAINT IF EXISTS patient_tasks_kind_check;

ALTER TABLE patient_tasks
  ADD CONSTRAINT patient_tasks_kind_check
  CHECK (kind IN ('task', 'objective'));

INSERT INTO psychologist_profiles (
  user_id,
  professional_title,
  approval_status,
  approved_at,
  reviewed_at
)
SELECT
  u.id,
  'Psicologo',
  'active',
  NOW(),
  NOW()
FROM users u
WHERE u.role = 'psychologist'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO care_relationships (
  patient_id,
  psychologist_user_id,
  status,
  requested_by_role,
  created_by_user_id,
  approved_by_user_id,
  approved_at
)
SELECT
  spa.patient_id,
  spa.psychologist_user_id,
  'active',
  'psychologist',
  spa.psychologist_user_id,
  spa.psychologist_user_id,
  spa.created_at
FROM psychologist_patient_access spa
WHERE NOT EXISTS (
  SELECT 1
  FROM care_relationships cr
  WHERE cr.patient_id = spa.patient_id
    AND cr.psychologist_user_id = spa.psychologist_user_id
    AND cr.status = 'active'
);

WITH ranked_waitlist_entries AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY scheduled_date, scheduled_time
      ORDER BY priority_position ASC, created_at ASC, id ASC
    ) AS normalized_priority_position
  FROM appointment_waitlist_entries
  WHERE status = 'active'
)
UPDATE appointment_waitlist_entries AS appointment_waitlist_entry
SET priority_position = ranked_waitlist_entries.normalized_priority_position
FROM ranked_waitlist_entries
WHERE appointment_waitlist_entry.id = ranked_waitlist_entries.id;

WITH latest_patient_clinical_notes AS (
  SELECT DISTINCT ON (pcn.patient_id)
    pcn.patient_id,
    pcn.id AS clinical_note_id
  FROM patient_clinical_notes pcn
  ORDER BY pcn.patient_id, pcn.clinical_note_date DESC, pcn.created_at DESC, pcn.id DESC
)
UPDATE patient_tasks pt
SET
  clinical_note_id = latest_patient_clinical_notes.clinical_note_id,
  updated_at = NOW()
FROM latest_patient_clinical_notes
WHERE pt.patient_id = latest_patient_clinical_notes.patient_id
  AND pt.kind = 'task'
  AND pt.clinical_note_id IS NULL;
