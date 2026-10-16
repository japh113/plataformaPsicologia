-- Additive upgrade for existing databases. Never replay schema.sql or seed.sql.
BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0
  CHECK (session_version >= 0);

CREATE OR REPLACE FUNCTION enforce_auth_session_version() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.session_version < OLD.session_version THEN
    RAISE EXCEPTION 'Session version cannot decrease';
  END IF;
  IF NEW.password_hash IS DISTINCT FROM OLD.password_hash
     OR (OLD.is_active AND NOT NEW.is_active) THEN
    NEW.session_version := GREATEST(NEW.session_version, OLD.session_version + 1);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS enforce_auth_session_version ON users;
CREATE TRIGGER enforce_auth_session_version BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION enforce_auth_session_version();

CREATE OR REPLACE FUNCTION revoke_psychologist_sessions() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.approval_status = 'active' THEN
      UPDATE users SET session_version = session_version + 1 WHERE id = OLD.user_id;
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.approval_status = 'active' AND
     (NEW.approval_status IS DISTINCT FROM 'active' OR NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
    UPDATE users SET session_version = session_version + 1 WHERE id = OLD.user_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS revoke_psychologist_sessions ON psychologist_profiles;
CREATE TRIGGER revoke_psychologist_sessions AFTER UPDATE OF approval_status, user_id OR DELETE ON psychologist_profiles
  FOR EACH ROW EXECUTE FUNCTION revoke_psychologist_sessions();

COMMIT;
