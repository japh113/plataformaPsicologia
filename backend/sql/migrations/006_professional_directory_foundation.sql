-- D1: private persistence only. No legacy backfill, public API or auth changes.
-- Transaction, destination, advisory lock and ledger belong to the explicit runner.
DO $$ BEGIN
  IF current_setting('psicopanel.migration_target', true) IS DISTINCT FROM '006' THEN
    RAISE EXCEPTION 'Use explicit migration runner target 006';
  END IF;
END $$;

-- Only opaque reservations survive future content-retention decisions.
CREATE TABLE professional_public_ids (
  public_id UUID PRIMARY KEY
);
CREATE TABLE professional_publication_profiles (
  owner_user_id TEXT PRIMARY KEY REFERENCES psychologist_profiles(user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  owner_role TEXT NOT NULL DEFAULT 'psychologist' CHECK (owner_role='psychologist'),
  public_id UUID NOT NULL UNIQUE REFERENCES professional_public_ids(public_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  accepts_new_patients BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT NOT NULL DEFAULT '',
  modality TEXT CHECK (modality IN ('in_person','online','both')),
  city TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT '',
  row_version BIGINT NOT NULL DEFAULT 0 CHECK (row_version>=0),
  approved_credential_version BIGINT,
  approved_decision TEXT NOT NULL DEFAULT 'approved' CHECK (approved_decision='approved'),
  pending_credential_version BIGINT,
  current_photo_id UUID,
  photo_state TEXT NOT NULL DEFAULT 'ready' CHECK (photo_state='ready'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK (NOT is_public OR approved_credential_version IS NOT NULL),
  CHECK (approved_credential_version IS DISTINCT FROM pending_credential_version OR approved_credential_version IS NULL),
  FOREIGN KEY (owner_user_id,owner_role) REFERENCES users(id,role) ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- Vocabulary is intentionally empty: D1 does not choose clinical labels or certify them.
CREATE TABLE professional_general_approaches (
  code TEXT PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9_]*$'),
  label TEXT NOT NULL CHECK (btrim(label)<>'')
);
CREATE TABLE professional_profile_approaches (
  owner_user_id TEXT NOT NULL REFERENCES professional_publication_profiles(owner_user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  approach_code TEXT NOT NULL REFERENCES professional_general_approaches(code) ON DELETE RESTRICT ON UPDATE RESTRICT,
  PRIMARY KEY (owner_user_id,approach_code)
);

-- Submitted snapshots never change. Editing a submission creates another version.
CREATE TABLE professional_credential_versions (
  owner_user_id TEXT NOT NULL REFERENCES professional_publication_profiles(owner_user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  version BIGINT NOT NULL CHECK (version>0),
  professional_name TEXT NOT NULL CHECK (btrim(professional_name)<>''),
  professional_title TEXT NOT NULL DEFAULT '',
  license_number TEXT NOT NULL DEFAULT '',
  academic_training TEXT[] NOT NULL DEFAULT '{}',
  formal_specialties TEXT[] NOT NULL DEFAULT '{}',
  certifications TEXT[] NOT NULL DEFAULT '{}',
  credentialed_approaches TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (owner_user_id,version)
);
CREATE TABLE professional_credential_decisions (
  owner_user_id TEXT NOT NULL,
  credential_version BIGINT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('approved','rejected')),
  reviewer_user_id TEXT NOT NULL,
  reviewer_role TEXT NOT NULL CHECK (reviewer_role IN ('admin','superadmin')),
  owner_message TEXT NOT NULL DEFAULT '',
  evidence_reference TEXT,
  valid_from DATE,
  valid_until DATE,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (owner_user_id,credential_version),
  UNIQUE (owner_user_id,credential_version,outcome),
  CHECK (owner_user_id<>reviewer_user_id),
  CHECK (outcome<>'rejected' OR btrim(owner_message)<>''),
  CHECK (outcome<>'approved' OR (evidence_reference IS NOT NULL AND btrim(evidence_reference)<>'')),
  CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until>=valid_from),
  FOREIGN KEY (owner_user_id,credential_version) REFERENCES professional_credential_versions(owner_user_id,version) ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY (reviewer_user_id,reviewer_role) REFERENCES users(id,role) ON DELETE RESTRICT ON UPDATE RESTRICT
);
-- Kept outside the owner-facing decision. No grant to support or PUBLIC.
CREATE TABLE professional_review_internal_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id TEXT NOT NULL,
  credential_version BIGINT NOT NULL,
  reviewer_user_id TEXT NOT NULL,
  reviewer_role TEXT NOT NULL CHECK (reviewer_role IN ('admin','superadmin')),
  body TEXT NOT NULL CHECK (btrim(body)<>''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK (owner_user_id<>reviewer_user_id),
  FOREIGN KEY (owner_user_id,credential_version) REFERENCES professional_credential_versions(owner_user_id,version) ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY (reviewer_user_id,reviewer_role) REFERENCES users(id,role) ON DELETE RESTRICT ON UPDATE RESTRICT
);
-- A later reassessment can require review without rewriting an approved decision.
CREATE TABLE professional_credential_validity (
  owner_user_id TEXT NOT NULL,
  credential_version BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requires_review' CHECK (status IN ('requires_review','supported')),
  evidence_reference TEXT,
  assessed_by_user_id TEXT,
  assessed_by_role TEXT CHECK (assessed_by_role IN ('admin','superadmin')),
  assessed_at TIMESTAMPTZ,
  valid_from DATE,
  valid_until DATE,
  row_version BIGINT NOT NULL DEFAULT 0 CHECK (row_version>=0),
  PRIMARY KEY (owner_user_id,credential_version),
  CHECK ((assessed_by_user_id IS NULL)=(assessed_by_role IS NULL)),
  CHECK ((assessed_by_user_id IS NULL)=(assessed_at IS NULL)),
  CHECK (assessed_by_user_id IS NULL OR assessed_by_user_id<>owner_user_id),
  CHECK (status<>'supported' OR (assessed_at IS NOT NULL AND evidence_reference IS NOT NULL AND btrim(evidence_reference)<>'')),
  CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until>=valid_from),
  FOREIGN KEY (owner_user_id,credential_version) REFERENCES professional_credential_versions(owner_user_id,version) ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY (assessed_by_user_id,assessed_by_role) REFERENCES users(id,role) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE TABLE professional_photographs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id TEXT NOT NULL REFERENCES professional_publication_profiles(owner_user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  version BIGINT NOT NULL CHECK (version>0),
  storage_key UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'staged' CHECK (status IN ('staged','ready','retired')),
  processed_mime TEXT CHECK (processed_mime IN ('image/jpeg','image/png','image/webp')),
  byte_size BIGINT CHECK (byte_size>0),
  width INTEGER CHECK (width>0),
  height INTEGER CHECK (height>0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (owner_user_id,version),
  UNIQUE (owner_user_id,id,status),
  CHECK (status<>'ready' OR (processed_mime IS NOT NULL AND byte_size IS NOT NULL AND width IS NOT NULL AND height IS NOT NULL))
);
ALTER TABLE professional_publication_profiles
  ADD CONSTRAINT professional_approved_version_fk FOREIGN KEY (owner_user_id,approved_credential_version,approved_decision)
    REFERENCES professional_credential_decisions(owner_user_id,credential_version,outcome) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT professional_pending_version_fk FOREIGN KEY (owner_user_id,pending_credential_version)
    REFERENCES professional_credential_versions(owner_user_id,version) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT professional_current_photo_fk FOREIGN KEY (owner_user_id,current_photo_id,photo_state)
    REFERENCES professional_photographs(owner_user_id,id,status) ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE VIEW professional_credential_review_states WITH (security_invoker=true) AS
  SELECT v.owner_user_id,v.version,COALESCE(d.outcome,'pending') AS review_status
  FROM professional_credential_versions v LEFT JOIN professional_credential_decisions d
    ON (d.owner_user_id,d.credential_version)=(v.owner_user_id,v.version);

CREATE FUNCTION reserve_professional_public_id() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.public_id IS NOT NULL THEN
    RAISE EXCEPTION 'PROFESSIONAL_INTEGRITY: Public identifier is generated by the database';
  END IF;
  NEW.public_id := gen_random_uuid();
  INSERT INTO professional_public_ids(public_id) VALUES (NEW.public_id);
  RETURN NEW;
END $$;
CREATE TRIGGER reserve_professional_public_id BEFORE INSERT ON professional_publication_profiles
  FOR EACH ROW EXECUTE FUNCTION reserve_professional_public_id();

CREATE FUNCTION protect_professional_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'PROFESSIONAL_INTEGRITY: Snapshot or reservation is immutable';
END $$;
CREATE FUNCTION preserve_professional_data() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'PROFESSIONAL_INTEGRITY: Destructive retention policy is not authorized';
END $$;
CREATE FUNCTION enforce_professional_profile_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.owner_user_id,NEW.owner_role,NEW.public_id,NEW.created_at) IS DISTINCT FROM
     (OLD.owner_user_id,OLD.owner_role,OLD.public_id,OLD.created_at) THEN
    RAISE EXCEPTION 'PROFESSIONAL_INTEGRITY: Profile identity is immutable';
  END IF;
  IF NEW.row_version<>OLD.row_version+1 THEN
    RAISE EXCEPTION 'PROFESSIONAL_INTEGRITY: Expected next row version';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER enforce_professional_profile_update BEFORE UPDATE ON professional_publication_profiles
  FOR EACH ROW EXECUTE FUNCTION enforce_professional_profile_update();
CREATE FUNCTION enforce_professional_validity_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.owner_user_id,NEW.credential_version) IS DISTINCT FROM (OLD.owner_user_id,OLD.credential_version)
     OR NEW.row_version<>OLD.row_version+1 THEN
    RAISE EXCEPTION 'PROFESSIONAL_INTEGRITY: Immutable validity owner and expected next row version required';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER enforce_professional_validity_update BEFORE UPDATE ON professional_credential_validity
  FOR EACH ROW EXECUTE FUNCTION enforce_professional_validity_update();
CREATE FUNCTION enforce_professional_photo_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id,NEW.owner_user_id,NEW.version,NEW.storage_key,NEW.created_at) IS DISTINCT FROM
     (OLD.id,OLD.owner_user_id,OLD.version,OLD.storage_key,OLD.created_at)
     OR OLD.status='retired'
     OR (OLD.status='ready' AND (NEW.status<>'retired' OR
         (NEW.processed_mime,NEW.byte_size,NEW.width,NEW.height) IS DISTINCT FROM
         (OLD.processed_mime,OLD.byte_size,OLD.width,OLD.height))) THEN
    RAISE EXCEPTION 'PROFESSIONAL_INTEGRITY: Immutable photo identity/content or invalid transition';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER enforce_professional_photo_update BEFORE UPDATE ON professional_photographs
  FOR EACH ROW EXECUTE FUNCTION enforce_professional_photo_update();

-- Serialize both sides on the profile row; a submitted pending pointer cannot
-- survive a decision. D2 must explicitly clear it in the same transaction.
CREATE FUNCTION check_professional_pending_version() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE profile professional_publication_profiles%ROWTYPE;
BEGIN
  SELECT * INTO profile FROM professional_publication_profiles WHERE owner_user_id=NEW.owner_user_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM professional_credential_decisions d
      WHERE d.owner_user_id=profile.owner_user_id AND d.credential_version=profile.pending_credential_version) THEN
    RAISE EXCEPTION 'PROFESSIONAL_INTEGRITY: Pending version already decided';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER check_professional_pending_profile AFTER INSERT OR UPDATE ON professional_publication_profiles
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_professional_pending_version();
CREATE CONSTRAINT TRIGGER check_professional_pending_decision AFTER INSERT ON professional_credential_decisions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_professional_pending_version();

DO $$ DECLARE relation_name TEXT; BEGIN
  FOREACH relation_name IN ARRAY ARRAY['professional_public_ids','professional_credential_versions','professional_credential_decisions','professional_review_internal_notes'] LOOP
    EXECUTE format('CREATE TRIGGER protect_professional_snapshot BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION protect_professional_snapshot()',relation_name);
  END LOOP;
  FOREACH relation_name IN ARRAY ARRAY['professional_public_ids','professional_publication_profiles','professional_general_approaches','professional_credential_versions','professional_credential_decisions','professional_review_internal_notes','professional_credential_validity','professional_photographs'] LOOP
    EXECUTE format('CREATE TRIGGER preserve_professional_data BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION preserve_professional_data()',relation_name);
    EXECUTE format('CREATE TRIGGER preserve_professional_truncate BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION preserve_professional_data()',relation_name);
  END LOOP;
END $$;
REVOKE ALL ON professional_public_ids,professional_publication_profiles,professional_general_approaches,
  professional_profile_approaches,professional_credential_versions,professional_credential_decisions,
  professional_review_internal_notes,professional_credential_validity,professional_photographs,
  professional_credential_review_states FROM PUBLIC;
REVOKE ALL ON FUNCTION reserve_professional_public_id(),protect_professional_snapshot(),preserve_professional_data(),
  enforce_professional_profile_update(),enforce_professional_validity_update(),enforce_professional_photo_update(),
  check_professional_pending_version() FROM PUBLIC;
