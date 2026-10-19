-- PR C: explicit additive successor; no historical attribution or clinical permissions.
DO $$ BEGIN
  IF current_setting('psicopanel.migration_target', true) IS DISTINCT FROM '005' THEN
    RAISE EXCEPTION 'Use explicit migration runner target 005';
  END IF;
END $$;
CREATE TABLE contact_change_requests (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  channel TEXT NOT NULL CHECK (channel IN ('email','sms')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','cancelled','replaced','expired','invalidated')),
  candidate_cipher JSONB, candidate_digest TEXT, source_digest TEXT,
  session_version INTEGER NOT NULL CHECK (session_version>=0),
  created_at TIMESTAMPTZ NOT NULL, expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ, reauthenticated_at TIMESTAMPTZ,
  authorized_session_hash TEXT, authorized_version INTEGER,
  resolved_at TIMESTAMPTZ,
  CHECK (expires_at>created_at),
  CHECK (status<>'pending' OR (candidate_cipher IS NOT NULL AND candidate_digest IS NOT NULL AND source_digest IS NOT NULL))
);
CREATE UNIQUE INDEX contact_change_one_pending ON contact_change_requests(user_id) WHERE status='pending';
CREATE INDEX contact_change_expiry ON contact_change_requests(expires_at) WHERE status='pending';
ALTER TABLE contact_verification_challenges ADD COLUMN purpose TEXT NOT NULL DEFAULT 'verification'
  CHECK (purpose IN ('verification','contact_change'));
ALTER TABLE contact_verification_challenges ADD COLUMN change_request_id UUID REFERENCES contact_change_requests(id) ON DELETE RESTRICT;
ALTER TABLE contact_verification_challenges ADD CONSTRAINT verification_purpose_binding
  CHECK ((purpose='verification' AND change_request_id IS NULL) OR (purpose='contact_change' AND change_request_id IS NOT NULL));
DROP INDEX contact_verification_one_current;
CREATE UNIQUE INDEX contact_verification_one_current ON contact_verification_challenges(user_id,channel,purpose)
  WHERE invalidated_at IS NULL AND consumed_at IS NULL;
CREATE INDEX contact_change_challenge_request ON contact_verification_challenges(change_request_id) WHERE change_request_id IS NOT NULL;
CREATE TABLE contact_change_events (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  request_id UUID REFERENCES contact_change_requests(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN ('password_failed','started','cancelled','replaced','reauthenticated','verified','confirmed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX contact_change_event_window ON contact_change_events(user_id,action,created_at);
CREATE TABLE contact_change_notices (
  id UUID PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES contact_change_requests(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  channel TEXT NOT NULL CHECK (channel IN ('email','sms')),
  kind TEXT NOT NULL CHECK (kind IN ('started','completed')),
  destination_cipher JSONB,
  status TEXT NOT NULL CHECK (status IN ('pending','delivered','exhausted','unavailable')),
  created_at TIMESTAMPTZ NOT NULL,
  retry_until TIMESTAMPTZ NOT NULL,
  next_attempt_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts>=0),
  UNIQUE(request_id,kind),
  CHECK (status<>'pending' OR destination_cipher IS NOT NULL)
);
CREATE INDEX contact_change_notice_due ON contact_change_notices(next_attempt_at) WHERE status='pending';
REVOKE ALL ON contact_change_requests,contact_change_events,contact_change_notices FROM PUBLIC;
-- Every security-version/contact/association change invalidates pending authority.
-- Confirmation marks its own request completed before touching contacts/version.
CREATE FUNCTION invalidate_pending_contact_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='users' THEN
    IF NEW.session_version IS DISTINCT FROM OLD.session_version OR NEW.email IS DISTINCT FROM OLD.email
       OR NEW.patient_id IS DISTINCT FROM OLD.patient_id OR NEW.role IS DISTINCT FROM OLD.role THEN
      UPDATE contact_change_requests SET status='invalidated',resolved_at=clock_timestamp(),candidate_cipher=NULL,
        candidate_digest=NULL,source_digest=NULL,authorized_session_hash=NULL,reauthenticated_at=NULL,authorized_version=NULL
        WHERE user_id=OLD.id AND status='pending';
    END IF;
  ELSIF NEW.phone IS DISTINCT FROM OLD.phone THEN
    UPDATE contact_change_requests SET status='invalidated',resolved_at=clock_timestamp(),candidate_cipher=NULL,
      candidate_digest=NULL,source_digest=NULL,authorized_session_hash=NULL,reauthenticated_at=NULL,authorized_version=NULL
      WHERE patient_id=OLD.id AND status='pending';
  END IF;
  UPDATE contact_verification_challenges c SET invalidated_at=clock_timestamp()
    FROM contact_change_requests q WHERE c.change_request_id=q.id AND q.status<>'pending'
    AND ((TG_TABLE_NAME='users' AND q.user_id=OLD.id) OR (TG_TABLE_NAME='patients' AND q.patient_id=OLD.id))
    AND c.invalidated_at IS NULL AND c.consumed_at IS NULL;
  RETURN NEW;
END $$;
CREATE TRIGGER invalidate_pending_account_changes AFTER UPDATE OF session_version,email,patient_id,role ON users
  FOR EACH ROW EXECUTE FUNCTION invalidate_pending_contact_changes();
CREATE TRIGGER invalidate_pending_phone_changes AFTER UPDATE OF phone ON patients
  FOR EACH ROW EXECUTE FUNCTION invalidate_pending_contact_changes();
