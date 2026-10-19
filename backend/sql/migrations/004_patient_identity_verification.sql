-- Authorized PR B successor. No historical inference, contact verification or clinical access.
DO $$ BEGIN
  IF current_setting('psicopanel.migration_target', true) IS DISTINCT FROM '004' THEN
    RAISE EXCEPTION 'Use explicit migration runner target 004';
  END IF;
END $$;

ALTER TABLE patients ADD COLUMN global_birth_date DATE;
ALTER TABLE patients ADD CONSTRAINT patients_global_birth_date_finite
  CHECK (global_birth_date IS NULL OR isfinite(global_birth_date));

-- Private evidence is separate from clinical tables and their row-history triggers.
CREATE TABLE contact_verification_state (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  channel TEXT NOT NULL CHECK (channel IN ('email','sms')),
  contact_digest TEXT NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, channel)
);
CREATE TABLE contact_verification_challenges (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  channel TEXT NOT NULL CHECK (channel IN ('email','sms')),
  contact_digest TEXT NOT NULL,
  secret_digest TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  invalidated_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  CHECK (expires_at > created_at)
);
CREATE UNIQUE INDEX contact_verification_one_current
  ON contact_verification_challenges(user_id,channel)
  WHERE invalidated_at IS NULL AND consumed_at IS NULL;
-- Every issuance consumes its destination quota, including failed deliveries.
CREATE INDEX contact_verification_destination_window
  ON contact_verification_challenges(channel,contact_digest,created_at);
REVOKE ALL ON contact_verification_state, contact_verification_challenges FROM PUBLIC;

-- A changed or restored contact never inherits earlier evidence/challenges.
CREATE FUNCTION invalidate_contact_verification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'users' THEN
    IF OLD.patient_id IS DISTINCT FROM NEW.patient_id OR OLD.role IS DISTINCT FROM NEW.role THEN
      DELETE FROM contact_verification_state WHERE user_id=OLD.id;
      UPDATE contact_verification_challenges SET invalidated_at=clock_timestamp()
        WHERE user_id=OLD.id AND invalidated_at IS NULL AND consumed_at IS NULL;
    ELSIF OLD.email IS DISTINCT FROM NEW.email THEN
      DELETE FROM contact_verification_state WHERE user_id=OLD.id AND channel='email';
      UPDATE contact_verification_challenges SET invalidated_at=clock_timestamp()
        WHERE user_id=OLD.id AND channel='email' AND invalidated_at IS NULL AND consumed_at IS NULL;
    END IF;
  ELSIF OLD.phone IS DISTINCT FROM NEW.phone THEN
    DELETE FROM contact_verification_state s USING users u
      WHERE u.patient_id=OLD.id AND s.user_id=u.id AND s.channel='sms';
    UPDATE contact_verification_challenges c SET invalidated_at=clock_timestamp()
      FROM users u WHERE u.patient_id=OLD.id AND c.user_id=u.id AND c.channel='sms'
      AND c.invalidated_at IS NULL AND c.consumed_at IS NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER invalidate_account_verification BEFORE UPDATE OF email,patient_id,role ON users
  FOR EACH ROW EXECUTE FUNCTION invalidate_contact_verification();
CREATE TRIGGER invalidate_phone_verification BEFORE UPDATE OF phone ON patients
  FOR EACH ROW EXECUTE FUNCTION invalidate_contact_verification();

CREATE INDEX contact_verification_account_window ON contact_verification_challenges(user_id,channel,created_at);
