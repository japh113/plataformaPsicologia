CREATE TABLE IF NOT EXISTS patients (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL DEFAULT '',
  full_name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  risk_level TEXT NOT NULL DEFAULT 'none' CHECK (risk_level IN ('none', 'low', 'medium', 'high')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'inactive', 'discharged')),
  last_session_date DATE,
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
  role TEXT NOT NULL CHECK (role IN ('psychologist', 'patient')),
  patient_id TEXT UNIQUE REFERENCES patients(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
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

ALTER TABLE appointment_waitlist_entries
  ADD COLUMN IF NOT EXISTS priority_position INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS appointment_waitlist_entries_slot_idx
  ON appointment_waitlist_entries (scheduled_date, scheduled_time, status);

CREATE INDEX IF NOT EXISTS appointment_waitlist_entries_priority_idx
  ON appointment_waitlist_entries (scheduled_date, scheduled_time, priority_position, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS appointment_waitlist_entries_active_unique_idx
  ON appointment_waitlist_entries (patient_id, scheduled_date, scheduled_time)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS patient_sessions (
  id BIGSERIAL PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  appointment_id BIGINT NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE CASCADE,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  session_date DATE NOT NULL,
  note_format TEXT NOT NULL DEFAULT 'simple' CHECK (note_format IN ('simple', 'soap')),
  session_objective TEXT NOT NULL DEFAULT '',
  clinical_observations TEXT NOT NULL DEFAULT '',
  next_steps TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE patient_sessions
  ADD COLUMN IF NOT EXISTS session_objective TEXT NOT NULL DEFAULT '';

ALTER TABLE patient_sessions
  ADD COLUMN IF NOT EXISTS clinical_observations TEXT NOT NULL DEFAULT '';

ALTER TABLE patient_sessions
  ADD COLUMN IF NOT EXISTS next_steps TEXT NOT NULL DEFAULT '';

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

ALTER TABLE patient_tasks
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'task';

ALTER TABLE patient_tasks
  DROP CONSTRAINT IF EXISTS patient_tasks_kind_check;

ALTER TABLE patient_tasks
  ADD CONSTRAINT patient_tasks_kind_check
  CHECK (kind IN ('task', 'objective'));

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
