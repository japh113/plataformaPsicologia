-- D2 only: no public readers, legacy backfill or clinical authorization.
DO $$ BEGIN
  IF current_setting('psicopanel.migration_target',true) IS DISTINCT FROM '007' THEN
    RAISE EXCEPTION 'Use explicit migration runner target 007';
  END IF;
END $$;

-- 002 already revokes when leaving active. Complement only the other edges.
CREATE FUNCTION revoke_restricted_professional_sessions() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.approval_status IS DISTINCT FROM NEW.approval_status AND OLD.approval_status<>'active' THEN
    UPDATE users SET session_version=session_version+1 WHERE id=NEW.user_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER revoke_restricted_professional_sessions AFTER UPDATE OF approval_status ON psychologist_profiles
  FOR EACH ROW EXECUTE FUNCTION revoke_restricted_professional_sessions();

CREATE FUNCTION withdraw_professional_preferences() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_id TEXT;
BEGIN
  IF TG_TABLE_NAME='users' THEN
    IF NOT (OLD.is_active IS DISTINCT FROM NEW.is_active) THEN RETURN NEW; END IF;
    owner_id:=NEW.id;
  ELSE
    IF NOT (OLD.approval_status IS DISTINCT FROM NEW.approval_status) THEN RETURN NEW; END IF;
    owner_id:=NEW.user_id;
  END IF;
  -- Clear on recovery as well: recovery is never consent to publish/admit.
  UPDATE professional_publication_profiles SET is_public=FALSE,accepts_new_patients=FALSE,row_version=row_version+1
    WHERE owner_user_id=owner_id AND (is_public OR accepts_new_patients);
  RETURN NEW;
END $$;
CREATE TRIGGER withdraw_professional_account_preferences AFTER UPDATE OF is_active ON users
  FOR EACH ROW EXECUTE FUNCTION withdraw_professional_preferences();
CREATE TRIGGER withdraw_professional_approval_preferences AFTER UPDATE OF approval_status ON psychologist_profiles
  FOR EACH ROW EXECUTE FUNCTION withdraw_professional_preferences();

CREATE FUNCTION withdraw_professional_validity_preferences() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Any reassessment requires fresh independent preferences in future D3.
  UPDATE professional_publication_profiles SET is_public=FALSE,accepts_new_patients=FALSE,row_version=row_version+1
    WHERE owner_user_id=NEW.owner_user_id AND approved_credential_version=NEW.credential_version
      AND (is_public OR accepts_new_patients);
  RETURN NEW;
END $$;
CREATE TRIGGER withdraw_professional_validity_preferences AFTER INSERT OR UPDATE ON professional_credential_validity
  FOR EACH ROW EXECUTE FUNCTION withdraw_professional_validity_preferences();

-- New, explicitly owner-addressed communications; never copy legacy review_notes.
CREATE TABLE professional_account_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id TEXT NOT NULL REFERENCES psychologist_profiles(user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  author_user_id TEXT NOT NULL,
  author_role TEXT NOT NULL CHECK(author_role IN ('admin','superadmin')),
  account_status TEXT NOT NULL CHECK(account_status IN ('pending_review','active','rejected','suspended')),
  owner_message TEXT NOT NULL CHECK(length(owner_message) BETWEEN 1 AND 2000 AND btrim(owner_message)<>''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK(owner_user_id<>author_user_id),
  FOREIGN KEY(author_user_id,author_role) REFERENCES users(id,role) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE TRIGGER protect_professional_account_message BEFORE UPDATE ON professional_account_messages
  FOR EACH ROW EXECUTE FUNCTION protect_professional_snapshot();
CREATE TRIGGER preserve_professional_account_message BEFORE DELETE ON professional_account_messages
  FOR EACH ROW EXECUTE FUNCTION preserve_professional_data();
CREATE TRIGGER preserve_professional_account_message_truncate BEFORE TRUNCATE ON professional_account_messages
  FOR EACH STATEMENT EXECUTE FUNCTION preserve_professional_data();
CREATE INDEX professional_account_messages_owner ON professional_account_messages(owner_user_id,created_at,id);
CREATE UNIQUE INDEX professional_one_staged_photo ON professional_photographs(owner_user_id) WHERE status='staged';
REVOKE ALL ON professional_account_messages FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_restricted_professional_sessions(),withdraw_professional_preferences(),
  withdraw_professional_validity_preferences() FROM PUBLIC;
