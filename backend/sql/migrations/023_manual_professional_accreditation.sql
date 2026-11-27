-- Additive manual accreditation for new fictitious registrations.
DO $$ BEGIN
  IF current_setting('psicopanel.migration_target', true) IS DISTINCT FROM '023' THEN
    RAISE EXCEPTION 'Use explicit migration runner target 023';
  END IF;
END $$;

ALTER TABLE psychologist_profiles
  ADD COLUMN manual_accreditation_required BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN manual_onboarded_at TIMESTAMPTZ;
ALTER TABLE professional_credential_versions
  ADD COLUMN educational_institution TEXT,
  ADD CONSTRAINT manual_professional_snapshot CHECK (
    educational_institution IS NULL OR (
      length(btrim(educational_institution)) BETWEEN 1 AND 200
      AND length(btrim(professional_title)) BETWEEN 1 AND 200
      AND license_number ~ '^[0-9]{1,20}$'
      AND cardinality(academic_training) = 0
      AND cardinality(formal_specialties) = 0
      AND cardinality(certifications) = 0
      AND cardinality(credentialed_approaches) = 0
    )
  );

CREATE TABLE professional_manual_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id TEXT NOT NULL,
  credential_version BIGINT NOT NULL,
  reviewer_user_id TEXT NOT NULL,
  reviewer_role TEXT NOT NULL CHECK (reviewer_role IN ('admin','superadmin')),
  outcome TEXT NOT NULL CHECK (outcome IN ('approved','inconclusive','returned','rejected','revalidation_requested','revalidated')),
  owner_message TEXT NOT NULL CHECK (length(btrim(owner_message)) BETWEEN 1 AND 2000),
  source_code TEXT NOT NULL CHECK (source_code = 'simulated_registry'),
  checked_on DATE NOT NULL,
  source_reference TEXT NOT NULL CHECK (length(source_reference) <= 160),
  license_result TEXT NOT NULL CHECK (license_result IN ('matches','discrepancy','unavailable','pending')),
  holder_result TEXT NOT NULL CHECK (holder_result IN ('matches','discrepancy','unavailable','pending')),
  title_result TEXT NOT NULL CHECK (title_result IN ('matches','discrepancy','unavailable','pending')),
  institution_result TEXT NOT NULL CHECK (institution_result IN ('matches','discrepancy','unavailable','pending')),
  identity_method TEXT NOT NULL CHECK (identity_method IN ('simulated_official_id','pending')),
  identity_result TEXT NOT NULL CHECK (identity_result IN ('matches','discrepancy','unavailable','pending')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK (owner_user_id <> reviewer_user_id),
  CHECK (outcome NOT IN ('approved','revalidated') OR (
    license_result = 'matches' AND holder_result = 'matches'
    AND title_result = 'matches' AND institution_result = 'matches'
    AND identity_method = 'simulated_official_id' AND identity_result = 'matches'
  )),
  FOREIGN KEY (owner_user_id,credential_version) REFERENCES professional_credential_versions(owner_user_id,version),
  FOREIGN KEY (reviewer_user_id,reviewer_role) REFERENCES users(id,role)
);
CREATE INDEX professional_manual_review_history
  ON professional_manual_reviews(owner_user_id, created_at DESC, id DESC);

CREATE TRIGGER protect_manual_review_update BEFORE UPDATE ON professional_manual_reviews
  FOR EACH ROW EXECUTE FUNCTION protect_professional_snapshot();
CREATE TRIGGER protect_manual_review_delete BEFORE DELETE ON professional_manual_reviews
  FOR EACH ROW EXECUTE FUNCTION preserve_professional_data();
CREATE TRIGGER protect_manual_review_truncate BEFORE TRUNCATE ON professional_manual_reviews
  FOR EACH STATEMENT EXECUTE FUNCTION preserve_professional_data();

CREATE TABLE professional_manual_license_claims (
  owner_user_id TEXT PRIMARY KEY,
  credential_version BIGINT NOT NULL,
  license_key TEXT NOT NULL UNIQUE,
  FOREIGN KEY (owner_user_id,credential_version) REFERENCES professional_credential_versions(owner_user_id,version)
);

CREATE FUNCTION has_current_manual_accreditation(owner_id TEXT)
RETURNS BOOLEAN LANGUAGE sql VOLATILE SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM professional_publication_profiles p
    JOIN users u ON u.id=p.owner_user_id AND u.is_active AND u.role='psychologist'
    JOIN professional_credential_versions s
      ON (s.owner_user_id,s.version) = (p.owner_user_id,p.approved_credential_version)
    JOIN professional_credential_validity v
      ON (v.owner_user_id,v.credential_version) = (p.owner_user_id,p.approved_credential_version)
    JOIN professional_manual_reviews r
      ON (r.owner_user_id,r.credential_version,r.id::text) = (v.owner_user_id,v.credential_version,v.evidence_reference)
    JOIN professional_manual_license_claims c
      ON (c.owner_user_id,c.credential_version) = (v.owner_user_id,v.credential_version)
    WHERE p.owner_user_id = owner_id
      AND r.outcome IN ('approved','revalidated')
      AND s.educational_institution IS NOT NULL
      AND c.license_key = COALESCE(NULLIF(ltrim(s.license_number,'0'),''),'0')
      AND v.status = 'supported'
      AND v.valid_from = r.checked_on
      AND v.valid_until = (r.checked_on + interval '12 months')::date
      AND v.valid_from <= (clock_timestamp() AT TIME ZONE 'UTC')::date
      AND v.valid_until > (clock_timestamp() AT TIME ZONE 'UTC')::date
  );
$$;

CREATE FUNCTION guard_manual_professional_snapshot() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.educational_institution IS NULL AND EXISTS (
    SELECT 1 FROM psychologist_profiles
    WHERE user_id = NEW.owner_user_id AND manual_accreditation_required
  ) THEN
    RAISE EXCEPTION 'Structured manual credential required' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER require_manual_professional_snapshot
  BEFORE INSERT ON professional_credential_versions
  FOR EACH ROW EXECUTE FUNCTION guard_manual_professional_snapshot();

CREATE FUNCTION guard_manual_professional_decision() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM professional_credential_versions v WHERE
      (v.owner_user_id,v.version) = (NEW.owner_user_id,NEW.credential_version)
      AND v.educational_institution IS NOT NULL
  ) AND NOT EXISTS (
    SELECT 1 FROM professional_manual_reviews r WHERE
      (r.owner_user_id,r.credential_version,r.reviewer_user_id,r.reviewer_role,r.owner_message) =
      (NEW.owner_user_id,NEW.credential_version,NEW.reviewer_user_id,NEW.reviewer_role,NEW.owner_message)
      AND (
        (NEW.outcome = 'approved' AND r.outcome = 'approved' AND NEW.evidence_reference = r.id::text
          AND NEW.valid_from = r.checked_on AND NEW.valid_until = (r.checked_on + interval '12 months')::date)
        OR (NEW.outcome = 'rejected' AND r.outcome IN ('returned','rejected'))
      )
  ) THEN
    RAISE EXCEPTION 'Structured review required for this credential version' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER require_manual_professional_decision
  BEFORE INSERT ON professional_credential_decisions
  FOR EACH ROW EXECUTE FUNCTION guard_manual_professional_decision();

CREATE FUNCTION guard_manual_professional_activation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.manual_accreditation_required THEN
      RAISE EXCEPTION 'Manual accreditation enrollment is preserved' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.manual_onboarded_at IS NOT NULL
       OR (NEW.manual_accreditation_required AND NEW.approval_status <> 'pending_review') THEN
      RAISE EXCEPTION 'Invalid initial manual accreditation state' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.manual_accreditation_required IS DISTINCT FROM OLD.manual_accreditation_required
     OR NEW.manual_onboarded_at IS DISTINCT FROM OLD.manual_onboarded_at
     OR (OLD.manual_accreditation_required AND NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
    RAISE EXCEPTION 'Manual accreditation state is managed by the database' USING ERRCODE = '23514';
  END IF;
  IF NEW.manual_accreditation_required AND NEW.manual_onboarded_at IS NULL AND NEW.approval_status = 'active' THEN
    IF NOT has_current_manual_accreditation(NEW.user_id) THEN
      RAISE EXCEPTION 'Current manual accreditation required before first activation' USING ERRCODE = '23514';
    END IF;
    NEW.manual_onboarded_at := clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER require_manual_professional_accreditation
  BEFORE INSERT OR UPDATE OR DELETE ON psychologist_profiles
  FOR EACH ROW EXECUTE FUNCTION guard_manual_professional_activation();

REVOKE ALL ON professional_manual_reviews, professional_manual_license_claims FROM PUBLIC;
REVOKE ALL ON FUNCTION has_current_manual_accreditation(TEXT), guard_manual_professional_activation() FROM PUBLIC;
REVOKE ALL ON FUNCTION guard_manual_professional_snapshot() FROM PUBLIC;
REVOKE ALL ON FUNCTION guard_manual_professional_decision() FROM PUBLIC;

-- The ordinary sandbox API remains separate from both attributed clients.
DO $$
DECLARE
  api_role TEXT := current_setting('psicopanel.consultation_legacy_client',true);
BEGIN
  IF api_role IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_roles r WHERE r.rolname=api_role AND r.rolcanlogin
      AND NOT (r.rolsuper OR r.rolinherit OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls)
      AND NOT EXISTS (SELECT 1 FROM pg_auth_members m WHERE r.oid IN (m.roleid,m.member))
      AND NOT has_function_privilege(r.oid,'public.admission_consultation(text,integer,text,jsonb)','EXECUTE')
      AND has_table_privilege(r.oid,'public.psychologist_profiles','UPDATE')
  ) THEN RAISE EXCEPTION 'Unsafe ordinary accreditation API role'; END IF;
  EXECUTE format('GRANT SELECT ON psicopanel_schema_migrations,professional_general_approaches TO %I',api_role);
  EXECUTE format('GRANT SELECT,INSERT ON professional_public_ids,professional_credential_versions,
    professional_credential_decisions,professional_review_internal_notes,professional_account_messages,
    professional_manual_reviews TO %I',api_role);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON professional_publication_profiles,professional_credential_validity,
    professional_manual_license_claims,professional_photographs TO %I',api_role);
  EXECUTE format('GRANT SELECT,INSERT,DELETE ON professional_profile_approaches TO %I',api_role);
  EXECUTE format('GRANT EXECUTE ON FUNCTION has_current_manual_accreditation(TEXT) TO %I',api_role);
END $$;
