-- Isolated fictitious bilateral workflow. Never writes legacy relationships or clinical data.
DO $$ BEGIN
  IF current_setting('psicopanel.migration_target',true) IS DISTINCT FROM '013' THEN
    RAISE EXCEPTION 'Use explicit migration runner target 013';
  END IF;
END $$;

CREATE TABLE bilateral_restrictions (
  psychologist_id text PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  state text NOT NULL DEFAULT 'disabled' CHECK (state IN ('enabled','suspended','disabled')),
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  justification text NOT NULL CHECK (length(justification) BETWEEN 1 AND 300)
);
-- No backfill: absence of an explicit restriction row means disabled.
CREATE TABLE bilateral_references (
  id uuid PRIMARY KEY, kind text NOT NULL CHECK (kind IN ('professional','recipient')),
  psychologist_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  account_id text REFERENCES users(id) ON DELETE RESTRICT,
  patient_id text REFERENCES patients(id) ON DELETE RESTRICT,
  purpose text NOT NULL DEFAULT 'individual_linkage' CHECK (purpose='individual_linkage'),
  digest text UNIQUE CHECK (digest IS NULL OR length(digest)=64),
  binding_digest text CHECK(length(binding_digest)=64),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL, consumed_at timestamptz,
  CHECK (expires_at=created_at+interval '24 hours'),
  CHECK ((digest IS NULL)=(binding_digest IS NULL)),
  CHECK ((kind='professional' AND account_id IS NULL AND patient_id IS NULL) OR
    (kind='recipient' AND account_id IS NOT NULL AND patient_id IS NOT NULL))
);
CREATE TABLE bilateral_attempts (
  id uuid PRIMARY KEY, psychologist_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  operation_id uuid NOT NULL, fingerprint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL, processed_at timestamptz,
  contact_envelope jsonb, reference_digest text, proposal jsonb NOT NULL, withdrawn_at timestamptz,
  UNIQUE(psychologist_id,operation_id), CHECK (expires_at=created_at+interval '336 hours')
);
CREATE TABLE bilateral_resend_jobs (
  id uuid PRIMARY KEY, attempt_id uuid NOT NULL REFERENCES bilateral_attempts(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), processed_at timestamptz
);
CREATE TABLE bilateral_invitations (
  id uuid PRIMARY KEY REFERENCES bilateral_attempts(id) ON DELETE RESTRICT,
  psychologist_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  account_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  patient_id text NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  reference_id uuid NOT NULL UNIQUE REFERENCES bilateral_references(id) ON DELETE RESTRICT,
  purpose text NOT NULL CHECK (purpose='individual_linkage'),
  state text NOT NULL CHECK (state IN ('pending','accepted','declined','withdrawn','expired','invalidated')),
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  issued_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
  terminal_at timestamptz, resends integer NOT NULL DEFAULT 0 CHECK (resends BETWEEN 0 AND 3),
  professional_name text NOT NULL,
  conditions_version text NOT NULL, conditions_text text NOT NULL, conditions_hash text NOT NULL,
  declaration_version text NOT NULL, declaration_text text NOT NULL,
  CHECK (expires_at=issued_at+interval '336 hours'),
  CHECK ((state='pending')=(terminal_at IS NULL))
);
CREATE UNIQUE INDEX bilateral_one_pending ON bilateral_invitations(psychologist_id,account_id,patient_id,purpose) WHERE state='pending';
CREATE TABLE bilateral_agreements (
  id uuid PRIMARY KEY, invitation_id uuid NOT NULL UNIQUE REFERENCES bilateral_invitations(id) ON DELETE RESTRICT,
  psychologist_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  account_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  patient_id text NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  purpose text NOT NULL CHECK (purpose='individual_linkage'),
  state text NOT NULL DEFAULT 'completed' CHECK (state IN ('completed','unlinked')),
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  completed_at timestamptz NOT NULL, unlinked_at timestamptz,
  CHECK ((state='completed')=(unlinked_at IS NULL))
);
CREATE UNIQUE INDEX bilateral_one_agreement ON bilateral_agreements(psychologist_id,account_id,patient_id,purpose) WHERE state='completed';
CREATE TABLE bilateral_blocks (
  id uuid NOT NULL UNIQUE,
  account_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  psychologist_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  blocked_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(account_id,psychologist_id)
);
CREATE TABLE bilateral_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invitation_id uuid REFERENCES bilateral_invitations(id) ON DELETE RESTRICT,
  actor_id text REFERENCES users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('issued','accepted','declined','withdrawn','expired','invalidated','unlinked','blocked','unblocked','resent')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- Exact account, not an email alias: a valid directed reference is required before charging a recipient.
CREATE TABLE bilateral_delivery_budget (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  psychologist_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX bilateral_recipient_window ON bilateral_delivery_budget(account_id,created_at);
CREATE INDEX bilateral_sender_window ON bilateral_attempts(psychologist_id,created_at);
CREATE TABLE bilateral_notices (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  invitation_id uuid NOT NULL REFERENCES bilateral_invitations(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE bilateral_operations (
  actor_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  operation_id uuid NOT NULL, fingerprint text NOT NULL,
  result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(actor_id,operation_id)
);

-- Serialize only this small, fictitious workflow after account/profile/identity locks.
-- Revocators already hold their changed source row; they never acquire account rows here.
CREATE FUNCTION bilateral_invalidate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
DECLARE target text; psy text;
BEGIN
  PERFORM pg_advisory_xact_lock(73013,1);
  IF TG_TABLE_NAME='bilateral_restrictions' THEN
    IF NEW.state='disabled' THEN psy:=NEW.psychologist_id; END IF;
  ELSIF TG_TABLE_NAME='psychologist_profiles' THEN
    IF NEW.approval_status IS DISTINCT FROM OLD.approval_status AND NEW.approval_status<>'active' THEN
      -- Suspension freezes acceptance but does not invalidate; other approval loss is definitive.
      IF NEW.approval_status<>'suspended' THEN psy:=OLD.user_id; END IF;
    END IF;
  ELSIF TG_TABLE_NAME='users' THEN
    IF ROW(NEW.email,NEW.patient_id,NEW.role,NEW.is_active,NEW.first_name,NEW.last_name)
       IS DISTINCT FROM ROW(OLD.email,OLD.patient_id,OLD.role,OLD.is_active,OLD.first_name,OLD.last_name) THEN
      target:=OLD.id; IF OLD.role='psychologist' THEN psy:=OLD.id; END IF;
    END IF;
  ELSIF TG_TABLE_NAME='patients' THEN
    IF ROW(NEW.phone,NEW.global_birth_date,NEW.first_name,NEW.last_name)
      IS DISTINCT FROM ROW(OLD.phone,OLD.global_birth_date,OLD.first_name,OLD.last_name) THEN
      FOR target IN SELECT id FROM public.users WHERE patient_id=OLD.id LOOP
        UPDATE public.bilateral_references SET digest=NULL,binding_digest=NULL WHERE account_id=target;
        WITH changed AS (UPDATE public.bilateral_invitations SET state='invalidated',version=version+1,
          terminal_at=clock_timestamp() WHERE account_id=target AND state='pending' RETURNING id)
          INSERT INTO public.bilateral_events(invitation_id,action) SELECT id,'invalidated' FROM changed;
      END LOOP;
    END IF;
  ELSE
    target:=OLD.user_id;
  END IF;
  IF target IS NOT NULL OR psy IS NOT NULL THEN
    UPDATE public.bilateral_references SET digest=NULL,binding_digest=NULL WHERE account_id=target OR psychologist_id=psy;
    WITH changed AS (UPDATE public.bilateral_invitations SET state='invalidated',version=version+1,
      terminal_at=clock_timestamp() WHERE state='pending' AND (account_id=target OR psychologist_id=psy) RETURNING id)
      INSERT INTO public.bilateral_events(invitation_id,action) SELECT id,'invalidated' FROM changed;
  END IF;
  UPDATE public.bilateral_attempts a SET contact_envelope=NULL,reference_digest=NULL FROM public.bilateral_invitations i
    WHERE i.id=a.id AND i.state<>'pending';
  RETURN NULL;
END $$;
CREATE TRIGGER bilateral_account_change AFTER UPDATE OF email,patient_id,role,is_active,first_name,last_name ON users FOR EACH ROW EXECUTE FUNCTION bilateral_invalidate();
CREATE TRIGGER bilateral_identity_change AFTER UPDATE OF phone,global_birth_date,first_name,last_name ON patients FOR EACH ROW EXECUTE FUNCTION bilateral_invalidate();
CREATE TRIGGER bilateral_verification_change AFTER UPDATE OR DELETE ON contact_verification_state FOR EACH ROW EXECUTE FUNCTION bilateral_invalidate();
CREATE TRIGGER bilateral_approval_change AFTER UPDATE OF approval_status ON psychologist_profiles FOR EACH ROW EXECUTE FUNCTION bilateral_invalidate();
CREATE TRIGGER bilateral_restriction_change AFTER INSERT OR UPDATE ON bilateral_restrictions FOR EACH ROW EXECUTE FUNCTION bilateral_invalidate();

-- Metadata discovery never authorizes a command. Command re-runs this under the same transaction.
CREATE FUNCTION bilateral_context(actor text,sv integer,op text,p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a record; pac text; psy text; patient text; u record; identity record; status text; source_ref record;
BEGIN
  IF op IN ('process','process-resend') THEN
    SELECT psychologist_id INTO actor FROM public.bilateral_attempts WHERE id=(p->>'id')::uuid AND (op='process-resend' OR processed_at IS NULL);
    IF actor IS NULL THEN RETURN '{}'::jsonb; END IF;
  END IF;
  IF op IN ('recipient-reference','preflight') THEN
    SELECT psychologist_id INTO psy FROM public.bilateral_references WHERE digest=p->>'professionalDigest'
      AND kind='professional' AND expires_at>clock_timestamp();
    pac:=actor;
  ELSIF op='process' THEN
    SELECT r.psychologist_id,r.account_id,r.patient_id INTO psy,pac,patient
      FROM public.bilateral_references r JOIN public.bilateral_attempts t ON t.reference_digest=r.digest
      WHERE t.id=(p->>'id')::uuid AND r.kind='recipient';
  ELSIF op IN ('accept','decline','withdraw','process-resend','block') THEN
    SELECT psychologist_id,account_id,patient_id INTO psy,pac,patient FROM public.bilateral_invitations WHERE id=(p->>'id')::uuid;
    IF psy IS NULL AND op='withdraw' THEN SELECT psychologist_id INTO psy FROM public.bilateral_attempts WHERE id=(p->>'id')::uuid; END IF;
  ELSIF op='unblock' THEN
    SELECT psychologist_id,account_id INTO psy,pac FROM public.bilateral_blocks WHERE id=(p->>'id')::uuid;
    IF pac IS NULL AND EXISTS(SELECT 1 FROM public.bilateral_operations WHERE actor_id=actor AND operation_id=(p->>'operationId')::uuid AND result->>'blocked'='false') THEN pac:=actor; END IF;
  ELSIF op='resend' THEN
    SELECT psychologist_id INTO psy FROM public.bilateral_attempts WHERE id=(p->>'id')::uuid;
  ELSIF op='unlink' THEN
    SELECT psychologist_id,account_id,patient_id INTO psy,pac,patient FROM public.bilateral_agreements WHERE id=(p->>'id')::uuid;
  END IF;
  PERFORM id FROM public.users WHERE id=ANY(ARRAY[actor,psy,pac]) ORDER BY id FOR NO KEY UPDATE;
  SELECT id,role,is_active,session_version,patient_id,email,first_name,last_name INTO a FROM public.users WHERE id=actor;
  IF NOT FOUND OR NOT a.is_active OR (op NOT IN ('process','process-resend') AND a.session_version<>sv) THEN
    IF op IN ('process','process-resend') THEN RETURN '{}'::jsonb; END IF;
    RAISE EXCEPTION 'bilateral_session' USING ERRCODE='P0001';
  END IF;
  IF a.role NOT IN ('patient','psychologist') THEN RAISE EXCEPTION 'bilateral_forbidden' USING ERRCODE='P0001'; END IF;
  IF a.role='psychologist' THEN
    SELECT approval_status INTO status FROM public.psychologist_profiles WHERE user_id=actor FOR NO KEY UPDATE;
    IF status IS DISTINCT FROM 'active' THEN
      IF op IN ('process','process-resend') THEN RETURN '{}'::jsonb; END IF;
      RAISE EXCEPTION 'bilateral_forbidden' USING ERRCODE='P0001';
    END IF;
  END IF;
  IF psy IS NOT NULL THEN
    PERFORM user_id FROM public.psychologist_profiles WHERE user_id=psy FOR NO KEY UPDATE;
  END IF;
  SELECT id,patient_id,email,is_active,role INTO u FROM public.users WHERE id=pac;
  patient:=u.patient_id;
  SELECT id,phone,to_char(global_birth_date,'YYYY-MM-DD') AS birth_date INTO identity FROM public.patients WHERE id=patient FOR NO KEY UPDATE;
  PERFORM pg_advisory_xact_lock(73013,1);
  IF op IN ('accept','decline','block','unblock') AND (a.role<>'patient' OR actor IS DISTINCT FROM pac) OR
     op IN ('withdraw','resend') AND (a.role<>'psychologist' OR actor IS DISTINCT FROM psy) OR
     op='unlink' AND actor IS DISTINCT FROM pac AND actor IS DISTINCT FROM psy THEN
    RAISE EXCEPTION 'bilateral_missing' USING ERRCODE='P0001';
  END IF;
  IF op IN ('recipient-reference','preflight') AND a.role<>'patient' OR op IN ('professional-reference','issue','sent') AND a.role<>'psychologist'
     OR op IN ('received','blocks') AND a.role<>'patient' THEN
    RAISE EXCEPTION 'bilateral_forbidden' USING ERRCODE='P0001';
  END IF;
  SELECT digest,binding_digest,kind INTO source_ref FROM public.bilateral_references
    WHERE digest=CASE WHEN op IN ('recipient-reference','preflight') THEN p->>'professionalDigest'
      WHEN op='process' THEN (SELECT reference_digest FROM public.bilateral_attempts WHERE id=(p->>'id')::uuid) ELSE NULL END;
  RETURN jsonb_build_object('referenceDigest',source_ref.digest,'referenceBindingDigest',source_ref.binding_digest,'referenceKind',source_ref.kind,'actor',actor,'role',a.role,'psychologist',psy,'account',pac,'patient',patient,
    'email',u.email,'phone',identity.phone,'birthDate',identity.birth_date,'active',u.is_active,'patientRole',u.role,'professionalName',(SELECT btrim(first_name||' '||coalesce(last_name,'')) FROM public.users WHERE id=coalesce(psy,actor)));
END $$;

CREATE FUNCTION bilateral_expire() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(73013,1);
  WITH changed AS (UPDATE public.bilateral_invitations SET state='expired',version=version+1,terminal_at=clock_timestamp()
    WHERE state='pending' AND expires_at<=clock_timestamp() RETURNING id)
    INSERT INTO public.bilateral_events(invitation_id,action) SELECT id,'expired' FROM changed;
  UPDATE public.bilateral_references SET digest=NULL,binding_digest=NULL WHERE digest IS NOT NULL AND (expires_at<=clock_timestamp() OR consumed_at IS NOT NULL);
  UPDATE public.bilateral_attempts a SET contact_envelope=NULL,reference_digest=NULL
    WHERE expires_at<=clock_timestamp() OR processed_at IS NOT NULL AND NOT EXISTS
      (SELECT 1 FROM public.bilateral_invitations i WHERE i.id=a.id AND state='pending');
  UPDATE public.bilateral_attempts a SET contact_envelope=NULL,reference_digest=NULL FROM public.bilateral_invitations i
    WHERE i.id=a.id AND i.state<>'pending';
END $$;
CREATE TABLE bilateral_sender_budget (
  actor_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX bilateral_sender_budget_window ON bilateral_sender_budget(actor_id,created_at);

CREATE FUNCTION bilateral_command(actor text,sv integer,op text,p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c jsonb; result jsonb; prior record; inv record; agr record; ref record; restriction text;
  stamp timestamptz; proposal uuid; n integer; eligible boolean; receipt uuid; professional_name text;
BEGIN
  IF op IN ('accept','decline','withdraw','resend','block','unblock','unlink','recipient-reference') AND p->'confirmed' IS DISTINCT FROM 'true'::jsonb OR
    op='issue' AND (p->'declared' IS DISTINCT FROM 'true'::jsonb OR p->'proposed' IS DISTINCT FROM 'true'::jsonb) THEN
    RAISE EXCEPTION 'bilateral_forbidden' USING ERRCODE='P0001';
  END IF;
  c:=public.bilateral_context(actor,sv,op,p);
  IF c='{}'::jsonb THEN
    IF op IN ('process','process-resend') THEN
      UPDATE public.bilateral_attempts SET processed_at=clock_timestamp(),contact_envelope=NULL,reference_digest=NULL
        WHERE id=(p->>'id')::uuid;
      UPDATE public.bilateral_resend_jobs SET processed_at=clock_timestamp() WHERE id=(p->>'jobId')::uuid;
    END IF;
    RETURN '{}'::jsonb;
  END IF;
  actor:=c->>'actor';
  PERFORM public.bilateral_expire();
  stamp:=clock_timestamp();
  IF op NOT IN ('process','process-resend','sent','received','agreements','blocks','notices','preflight') THEN
    SELECT * INTO prior FROM public.bilateral_operations WHERE actor_id=actor AND operation_id=(p->>'operationId')::uuid;
    IF FOUND THEN
      IF prior.fingerprint<>p->>'fingerprint' THEN RAISE EXCEPTION 'bilateral_conflict' USING ERRCODE='P0001'; END IF;
      -- Reauthorize above, and return current state from the inbox rather than replaying an obsolete grant.
      IF op IN ('professional-reference','recipient-reference') THEN RETURN prior.result||'{"replayed":true}'::jsonb; END IF;
      IF op='accept' THEN
        SELECT * INTO agr FROM public.bilateral_agreements WHERE invitation_id=(p->>'id')::uuid;
        RETURN jsonb_build_object('agreementId',agr.id,'status',agr.state,'admission','pending','admissionAuthorization','not_granted','treatment','not_activated');
      END IF;
      RETURN prior.result;
    END IF;
  END IF;
  SELECT state INTO restriction FROM public.bilateral_restrictions WHERE psychologist_id=coalesce(c->>'psychologist',actor);
  eligible:=c->>'patientRole'='patient' AND (c->>'active')::boolean AND p->>'email'=lower(btrim(c->>'email'))
    AND p->>'phone'=c->>'phone' AND (p->>'adult')::boolean AND (c->>'birthDate')::date<=((stamp AT TIME ZONE 'America/Mexico_City')::date)
    AND extract(year FROM age((stamp AT TIME ZONE 'America/Mexico_City')::date,(c->>'birthDate')::date))>=18
    AND EXISTS(SELECT 1 FROM public.contact_verification_state WHERE user_id=c->>'account' AND channel='email' AND contact_digest=p->>'emailDigest')
    AND EXISTS(SELECT 1 FROM public.contact_verification_state WHERE user_id=c->>'account' AND channel='sms' AND contact_digest=p->>'phoneDigest');
  IF op='preflight' THEN
    IF p->'referenceAuthenticated' IS DISTINCT FROM 'true'::jsonb OR c->>'psychologist' IS NULL OR restriction IS DISTINCT FROM 'enabled' OR NOT coalesce(eligible,false) OR
      NOT EXISTS(SELECT 1 FROM public.users u JOIN public.psychologist_profiles pp ON pp.user_id=u.id WHERE u.id=c->>'psychologist' AND u.is_active AND u.role='psychologist' AND pp.approval_status='active') THEN
      RAISE EXCEPTION 'bilateral_unavailable' USING ERRCODE='P0001';
    END IF;
    RETURN jsonb_build_object('professionalName',c->>'professionalName','purpose','individual_linkage');
  END IF;
  IF op IN ('professional-reference','recipient-reference') THEN
    IF op='professional-reference' THEN
      IF restriction IS DISTINCT FROM 'enabled' THEN RAISE EXCEPTION 'bilateral_forbidden' USING ERRCODE='P0001'; END IF;
      UPDATE public.bilateral_references SET digest=NULL,binding_digest=NULL WHERE kind='professional' AND psychologist_id=actor;
      INSERT INTO public.bilateral_references(id,kind,psychologist_id,digest,binding_digest,created_at,expires_at)
        VALUES((p->>'referenceId')::uuid,'professional',actor,p->>'digest',p->>'bindingDigest',stamp,stamp+interval '24 hours');
      result:=jsonb_build_object('referenceCreated',true,'expiresAt',stamp+interval '24 hours');
    ELSE
      IF p->'referenceAuthenticated' IS DISTINCT FROM 'true'::jsonb OR restriction IS DISTINCT FROM 'enabled' OR NOT coalesce(eligible,false) OR c->>'psychologist' IS NULL OR
        NOT EXISTS(SELECT 1 FROM public.users u JOIN public.psychologist_profiles pp ON pp.user_id=u.id
          WHERE u.id=c->>'psychologist' AND u.role='psychologist' AND u.is_active AND pp.approval_status='active') THEN
        RAISE EXCEPTION 'bilateral_unavailable' USING ERRCODE='P0001';
      END IF;
      -- Replacing this directed reference is irreversible, even if contacts are subsequently restored.
      UPDATE public.bilateral_references SET digest=NULL,binding_digest=NULL WHERE kind='recipient' AND account_id=actor AND psychologist_id=c->>'psychologist';
      INSERT INTO public.bilateral_references(id,kind,psychologist_id,account_id,patient_id,digest,binding_digest,created_at,expires_at)
        VALUES((p->>'referenceId')::uuid,'recipient',c->>'psychologist',actor,c->>'patient',p->>'digest',p->>'bindingDigest',stamp,stamp+interval '24 hours');
      SELECT btrim(first_name||' '||coalesce(last_name,'')) INTO professional_name FROM public.users WHERE id=c->>'psychologist';
      result:=jsonb_build_object('referenceCreated',true,'professionalName',professional_name,'purpose','individual_linkage','expiresAt',stamp+interval '24 hours');
    END IF;
  ELSIF op='issue' THEN
    IF restriction IS DISTINCT FROM 'enabled' THEN RAISE EXCEPTION 'bilateral_forbidden' USING ERRCODE='P0001'; END IF;
    IF (SELECT count(*) FROM public.bilateral_sender_budget WHERE actor_id=actor AND created_at>stamp-interval '10 minutes')>=5 OR
       (SELECT count(*) FROM public.bilateral_sender_budget WHERE actor_id=actor AND created_at>stamp-interval '24 hours')>=20 THEN
      RAISE EXCEPTION 'bilateral_quota' USING ERRCODE='P0001';
    END IF;
    INSERT INTO public.bilateral_sender_budget(actor_id,created_at) VALUES(actor,stamp);
    INSERT INTO public.bilateral_attempts(id,psychologist_id,operation_id,fingerprint,created_at,expires_at,contact_envelope,reference_digest,proposal)
      VALUES((p->>'receiptId')::uuid,actor,(p->>'operationId')::uuid,p->>'fingerprint',stamp,stamp+interval '336 hours',p->'contactEnvelope',p->>'referenceDigest',p->'proposal');
    result:=jsonb_build_object('receiptId',p->>'receiptId','status','received');
  ELSIF op='resend' THEN
    IF (SELECT count(*) FROM public.bilateral_sender_budget WHERE actor_id=actor AND created_at>stamp-interval '10 minutes')>=5 OR
      (SELECT count(*) FROM public.bilateral_sender_budget WHERE actor_id=actor AND created_at>stamp-interval '24 hours')>=20 THEN
      RAISE EXCEPTION 'bilateral_quota' USING ERRCODE='P0001';
    END IF;
    INSERT INTO public.bilateral_sender_budget(actor_id,created_at) VALUES(actor,stamp);
    INSERT INTO public.bilateral_resend_jobs(id,attempt_id,created_at) VALUES((p->>'operationId')::uuid,(p->>'id')::uuid,stamp);
    result:=jsonb_build_object('status','received');
  ELSIF op='process' THEN
    SELECT * INTO prior FROM public.bilateral_attempts WHERE id=(p->>'id')::uuid FOR UPDATE;
    IF prior.processed_at IS NOT NULL THEN RETURN '{}'::jsonb; END IF;
    UPDATE public.bilateral_attempts SET processed_at=stamp,reference_digest=NULL WHERE id=prior.id;
    SELECT * INTO ref FROM public.bilateral_references WHERE digest=prior.reference_digest AND kind='recipient' AND expires_at>stamp FOR UPDATE;
    IF p->'referenceAuthenticated' IS DISTINCT FROM 'true'::jsonb OR ref.id IS NULL OR NOT coalesce(eligible,false) OR restriction IS DISTINCT FROM 'enabled' OR prior.expires_at<=stamp OR
      ref.psychologist_id<>actor OR ref.patient_id IS DISTINCT FROM c->>'patient' OR
      EXISTS(SELECT 1 FROM public.bilateral_blocks WHERE account_id=ref.account_id AND psychologist_id=actor) OR
      EXISTS(SELECT 1 FROM public.bilateral_invitations WHERE psychologist_id=actor AND account_id=ref.account_id AND
        (state='pending' OR issued_at>stamp-interval '24 hours' OR state='declined' AND terminal_at>stamp-interval '7 days')) OR
      EXISTS(SELECT 1 FROM public.bilateral_agreements WHERE psychologist_id=actor AND account_id=ref.account_id AND state='completed') OR
      (SELECT count(*) FROM public.bilateral_invitations WHERE psychologist_id=actor AND state='pending')>=50 OR
      (SELECT count(*) FROM public.bilateral_delivery_budget WHERE account_id=ref.account_id AND created_at>stamp-interval '24 hours')>=3 OR
      (SELECT count(*) FROM public.bilateral_delivery_budget WHERE account_id=ref.account_id AND created_at>stamp-interval '168 hours')>=10 THEN
      UPDATE public.bilateral_attempts SET contact_envelope=NULL WHERE id=prior.id;
      RETURN '{}'::jsonb;
    END IF;
    UPDATE public.bilateral_references SET digest=NULL,binding_digest=NULL,consumed_at=stamp WHERE id=ref.id;
    SELECT btrim(first_name||' '||coalesce(last_name,'')) INTO professional_name FROM public.users WHERE id=actor;
    INSERT INTO public.bilateral_invitations(id,psychologist_id,account_id,patient_id,reference_id,purpose,state,issued_at,expires_at,
      professional_name,conditions_version,conditions_text,conditions_hash,declaration_version,declaration_text)
      VALUES(prior.id,actor,ref.account_id,ref.patient_id,ref.id,'individual_linkage','pending',prior.created_at,prior.expires_at,
        professional_name,prior.proposal->>'conditionsVersion',prior.proposal->>'conditionsText',prior.proposal->>'conditionsHash',prior.proposal->>'declarationVersion',prior.proposal->>'declarationText');
    INSERT INTO public.bilateral_delivery_budget(account_id,psychologist_id,created_at) VALUES(ref.account_id,actor,stamp);
    INSERT INTO public.bilateral_events(invitation_id,actor_id,action,created_at) VALUES(prior.id,actor,'issued',stamp);
    -- Atomic local simulator, no external I/O or navigation token. Never exposes delivery status to sender.
    INSERT INTO public.bilateral_notices(account_id,invitation_id,created_at) VALUES(ref.account_id,prior.id,stamp);
    RETURN '{}'::jsonb;
  ELSIF op IN ('sent','received','agreements','blocks','notices') THEN
    IF op='sent' THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'version',1,'status',
        CASE WHEN a.withdrawn_at IS NOT NULL THEN 'withdrawn' WHEN i.state IN ('accepted','declined','withdrawn') THEN i.state WHEN a.expires_at<=stamp THEN 'expired' ELSE 'received' END,
        'createdAt',a.created_at,'expiresAt',a.expires_at) ORDER BY a.created_at DESC),'[]'::jsonb) INTO result
        FROM public.bilateral_attempts a LEFT JOIN public.bilateral_invitations i ON i.id=a.id WHERE a.psychologist_id=actor;
    ELSIF op='received' THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'version',i.version,'status',i.state,'professionalName',i.professional_name,
        'purpose',i.purpose,'conditionsVersion',i.conditions_version,'conditionsText',i.conditions_text,'conditionsHash',i.conditions_hash,
        'expiresAt',i.expires_at,'acceptanceAvailable',i.state='pending' AND r.state='enabled' AND u.is_active AND pp.approval_status='active') ORDER BY i.issued_at DESC),'[]'::jsonb) INTO result
        FROM public.bilateral_invitations i JOIN public.users u ON u.id=i.psychologist_id
        JOIN public.psychologist_profiles pp ON pp.user_id=u.id LEFT JOIN public.bilateral_restrictions r ON r.psychologist_id=u.id
        WHERE i.account_id=actor;
    ELSIF op='agreements' THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object('id',g.id,'version',g.version,'status',g.state,'completedAt',g.completed_at,'unlinkedAt',g.unlinked_at,
        'professionalName',i.professional_name,'purpose',g.purpose,'conditionsText',i.conditions_text,'conditionsVersion',i.conditions_version,
        'admission','pending','admissionAuthorization','not_granted','treatment','not_activated') ORDER BY g.completed_at DESC),'[]'::jsonb) INTO result
        FROM public.bilateral_agreements g JOIN public.bilateral_invitations i ON i.id=g.invitation_id WHERE actor IN (g.account_id,g.psychologist_id);
    ELSIF op='blocks' THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object('id',b.id,
        'professionalName',btrim(u.first_name||' '||coalesce(u.last_name,'')))),'[]'::jsonb) INTO result
        FROM public.bilateral_blocks b JOIN public.users u ON u.id=b.psychologist_id WHERE b.account_id=actor;
    ELSE
      SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'message','Hay una acción disponible en tu cuenta','createdAt',created_at)),'[]'::jsonb)
        INTO result FROM public.bilateral_notices WHERE account_id=actor;
    END IF;
    RETURN result;
  ELSIF op='unblock' THEN
    DELETE FROM public.bilateral_blocks WHERE id=(p->>'id')::uuid AND account_id=actor;
    result:=jsonb_build_object('blocked',false);
  ELSIF op='unlink' THEN
    SELECT * INTO agr FROM public.bilateral_agreements WHERE id=(p->>'id')::uuid FOR UPDATE;
    IF agr.id IS NULL THEN RAISE EXCEPTION 'bilateral_missing' USING ERRCODE='P0001'; END IF;
    IF agr.state='completed' THEN
      IF agr.version<>(p->>'expectedVersion')::integer THEN RAISE EXCEPTION 'bilateral_conflict' USING ERRCODE='P0001'; END IF;
      UPDATE public.bilateral_agreements SET state='unlinked',version=version+1,unlinked_at=stamp WHERE id=agr.id;
      INSERT INTO public.bilateral_events(invitation_id,actor_id,action,created_at) VALUES(agr.invitation_id,actor,'unlinked',stamp);
      INSERT INTO public.bilateral_notices(account_id,invitation_id,created_at)
        VALUES(CASE WHEN actor=agr.account_id THEN agr.psychologist_id ELSE agr.account_id END,agr.invitation_id,stamp);
    END IF;
    result:=jsonb_build_object('id',agr.id,'status','unlinked','admissionAuthorization','not_granted','treatment','not_activated');
  ELSE
    SELECT * INTO inv FROM public.bilateral_invitations WHERE id=(p->>'id')::uuid FOR UPDATE;
    IF op='process-resend' THEN
      UPDATE public.bilateral_resend_jobs SET processed_at=stamp WHERE id=(p->>'jobId')::uuid AND processed_at IS NULL;
      IF NOT FOUND OR inv.id IS NULL THEN RETURN '{}'::jsonb; END IF;
    END IF;
    IF inv.id IS NULL THEN
      -- A suppressed sender receipt still permits neutral withdrawal/resend.
      IF op IN ('withdraw','resend') AND EXISTS(SELECT 1 FROM public.bilateral_attempts WHERE id=(p->>'id')::uuid AND psychologist_id=actor) THEN
        IF op='withdraw' THEN UPDATE public.bilateral_attempts SET processed_at=stamp,withdrawn_at=stamp,contact_envelope=NULL,reference_digest=NULL WHERE id=(p->>'id')::uuid; END IF;
        result:=jsonb_build_object('status',CASE op WHEN 'withdraw' THEN 'withdrawn' ELSE 'received' END);
      ELSE RAISE EXCEPTION 'bilateral_missing' USING ERRCODE='P0001'; END IF;
    ELSIF op='withdraw' THEN
      IF inv.state IN ('accepted','declined') THEN RAISE EXCEPTION 'bilateral_conflict' USING ERRCODE='P0001'; END IF;
      IF inv.state='pending' THEN
        UPDATE public.bilateral_invitations SET state='withdrawn',version=version+1,terminal_at=stamp WHERE id=inv.id;
        INSERT INTO public.bilateral_events(invitation_id,actor_id,action,created_at) VALUES(inv.id,actor,'withdrawn',stamp);
      END IF;
      UPDATE public.bilateral_attempts SET withdrawn_at=stamp,processed_at=stamp,contact_envelope=NULL,reference_digest=NULL WHERE id=inv.id;
      result:=jsonb_build_object('status','withdrawn');
    ELSIF op IN ('block','unblock') THEN
      IF op='block' THEN
        INSERT INTO public.bilateral_blocks(id,account_id,psychologist_id,blocked_at) VALUES((p->>'operationId')::uuid,actor,inv.psychologist_id,stamp) ON CONFLICT DO NOTHING;
        UPDATE public.bilateral_references SET digest=NULL,binding_digest=NULL WHERE account_id=actor AND psychologist_id=inv.psychologist_id;
        WITH changed AS (UPDATE public.bilateral_invitations SET state='invalidated',version=version+1,terminal_at=stamp
          WHERE account_id=actor AND psychologist_id=inv.psychologist_id AND state='pending' RETURNING id)
          INSERT INTO public.bilateral_events(invitation_id,actor_id,action,created_at) SELECT id,actor,'invalidated',stamp FROM changed;
      ELSE DELETE FROM public.bilateral_blocks WHERE account_id=actor AND psychologist_id=inv.psychologist_id; END IF;
      INSERT INTO public.bilateral_events(invitation_id,actor_id,action,created_at) VALUES(inv.id,actor,CASE op WHEN 'block' THEN 'blocked' ELSE 'unblocked' END,stamp);
      result:=jsonb_build_object('blocked',op='block');
    ELSIF op='process-resend' THEN
      -- A neutral receipt in every case, including expired, blocked or recipient-limited.
      IF restriction='enabled' AND coalesce(eligible,false) AND inv.state='pending' AND inv.resends<3 AND
        NOT EXISTS(SELECT 1 FROM public.bilateral_blocks WHERE account_id=inv.account_id AND psychologist_id=actor) AND
        (SELECT count(*) FROM public.bilateral_delivery_budget WHERE account_id=inv.account_id AND created_at>stamp-interval '24 hours')<3 AND
        (SELECT count(*) FROM public.bilateral_delivery_budget WHERE account_id=inv.account_id AND created_at>stamp-interval '168 hours')<10 THEN
        UPDATE public.bilateral_invitations SET resends=resends+1 WHERE id=inv.id;
        INSERT INTO public.bilateral_delivery_budget(account_id,psychologist_id,created_at) VALUES(inv.account_id,actor,stamp);
        INSERT INTO public.bilateral_notices(account_id,invitation_id,created_at) VALUES(inv.account_id,inv.id,stamp);
        INSERT INTO public.bilateral_events(invitation_id,actor_id,action,created_at) VALUES(inv.id,actor,'resent',stamp);
      END IF;
      RETURN '{}'::jsonb;
    ELSE
      IF inv.state='accepted' AND op='accept' THEN
        SELECT * INTO agr FROM public.bilateral_agreements WHERE invitation_id=inv.id;
        result:=jsonb_build_object('agreementId',agr.id,'status',agr.state,'admission','pending','admissionAuthorization','not_granted','treatment','not_activated');
      ELSE
        IF inv.state<>'pending' OR inv.version<>(p->>'expectedVersion')::integer OR stamp>=inv.expires_at THEN
          RAISE EXCEPTION 'bilateral_conflict' USING ERRCODE='P0001';
        END IF;
        IF op='accept' THEN
          IF restriction IS DISTINCT FROM 'enabled' OR NOT coalesce(eligible,false) OR
             inv.patient_id IS DISTINCT FROM c->>'patient' OR
             NOT EXISTS(SELECT 1 FROM public.users u JOIN public.psychologist_profiles pp ON pp.user_id=u.id WHERE u.id=inv.psychologist_id AND u.is_active AND u.role='psychologist' AND pp.approval_status='active') OR
             EXISTS(SELECT 1 FROM public.bilateral_blocks WHERE account_id=actor AND psychologist_id=inv.psychologist_id) OR
             inv.conditions_version<>p->>'conditionsVersion' OR inv.conditions_hash<>p->>'conditionsHash' THEN
            RAISE EXCEPTION 'bilateral_conflict' USING ERRCODE='P0001';
          END IF;
          UPDATE public.bilateral_invitations SET state='accepted',version=version+1,terminal_at=stamp WHERE id=inv.id;
          INSERT INTO public.bilateral_agreements(id,invitation_id,psychologist_id,account_id,patient_id,purpose,completed_at)
            VALUES((p->>'agreementId')::uuid,inv.id,inv.psychologist_id,inv.account_id,inv.patient_id,inv.purpose,stamp);
          result:=jsonb_build_object('agreementId',p->>'agreementId','status','completed','admission','pending','admissionAuthorization','not_granted','treatment','not_activated');
        ELSIF op IN ('decline','withdraw') THEN
          UPDATE public.bilateral_invitations SET state=CASE op WHEN 'decline' THEN 'declined' ELSE 'withdrawn' END,version=version+1,terminal_at=stamp WHERE id=inv.id;
          result:=jsonb_build_object('status',CASE op WHEN 'decline' THEN 'declined' ELSE 'withdrawn' END);
        ELSE RAISE EXCEPTION 'bilateral_forbidden' USING ERRCODE='P0001'; END IF;
        INSERT INTO public.bilateral_events(invitation_id,actor_id,action,created_at)
          VALUES(inv.id,actor,CASE op WHEN 'accept' THEN 'accepted' WHEN 'decline' THEN 'declined' ELSE 'withdrawn' END,stamp);
      END IF;
    END IF;
  END IF;
  PERFORM public.bilateral_expire();
  INSERT INTO public.bilateral_operations(actor_id,operation_id,fingerprint,result,created_at)
    VALUES(actor,(p->>'operationId')::uuid,p->>'fingerprint',result,stamp);
  RETURN result;
END $$;

-- Worker discovery is intentionally narrow and contains no plaintext contact or reference.
CREATE FUNCTION bilateral_queue() RETURNS TABLE(id uuid,receipt_id uuid,kind text,contact_envelope jsonb)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT a.id,a.id,'process'::text,a.contact_envelope FROM public.bilateral_attempts a WHERE a.processed_at IS NULL
  UNION ALL
  SELECT j.id,j.attempt_id,'process-resend'::text,a.contact_envelope FROM public.bilateral_resend_jobs j
    JOIN public.bilateral_attempts a ON a.id=j.attempt_id WHERE j.processed_at IS NULL
  LIMIT 20
$$;

-- Only fictitious operational retention. No automatic purge of completed/unlinked agreement evidence.
CREATE FUNCTION bilateral_cleanup() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  PERFORM public.bilateral_expire();
  DELETE FROM public.bilateral_sender_budget WHERE created_at<=clock_timestamp()-interval '7 days';
  DELETE FROM public.bilateral_delivery_budget WHERE created_at<=clock_timestamp()-interval '7 days';
  DELETE FROM public.bilateral_resend_jobs WHERE processed_at<=clock_timestamp()-interval '7 days';
  DELETE FROM public.bilateral_operations WHERE created_at<=clock_timestamp()-interval '90 days';
  DELETE FROM public.bilateral_notices WHERE created_at<=clock_timestamp()-interval '14 days';
  DELETE FROM public.bilateral_events e USING public.bilateral_invitations i
    WHERE e.invitation_id=i.id AND i.terminal_at<=clock_timestamp()-interval '90 days'
    AND NOT EXISTS(SELECT 1 FROM public.bilateral_agreements g WHERE g.invitation_id=i.id);
  DELETE FROM public.bilateral_invitations i WHERE terminal_at<=clock_timestamp()-interval '90 days'
    AND NOT EXISTS(SELECT 1 FROM public.bilateral_agreements g WHERE g.invitation_id=i.id);
  DELETE FROM public.bilateral_attempts a WHERE created_at<=clock_timestamp()-interval '90 days'
    AND NOT EXISTS(SELECT 1 FROM public.bilateral_invitations i WHERE i.id=a.id);
  DELETE FROM public.bilateral_references r WHERE expires_at<=clock_timestamp() AND digest IS NULL
    AND NOT EXISTS(SELECT 1 FROM public.bilateral_invitations i WHERE i.reference_id=r.id);
END $$;

-- Separate NOLOGIN owner, no inheritance/membership, no clinical grants.
-- Functions remain ungranted: provisioning a distinct restricted LOGIN is explicit and separate.
DO $$
DECLARE owner_name text:='bilateral_owner_'||substr(md5(current_database()),1,16); obj record;
BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=owner_name) THEN RAISE EXCEPTION 'Bilateral owner already exists'; END IF;
  EXECUTE format('CREATE ROLE %I NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',owner_name);
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I',owner_name);
  EXECUTE format('GRANT SELECT(id,role,is_active,session_version,patient_id,email,first_name,last_name), UPDATE(id) ON public.users TO %I',owner_name);
  EXECUTE format('GRANT SELECT(id,phone,global_birth_date,first_name,last_name), UPDATE(id) ON public.patients TO %I',owner_name);
  EXECUTE format('GRANT SELECT(user_id,approval_status), UPDATE(user_id) ON public.psychologist_profiles TO %I',owner_name);
  EXECUTE format('GRANT SELECT ON public.contact_verification_state TO %I',owner_name);
  FOR obj IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname LIKE 'bilateral\_%' ESCAPE '\' AND c.relkind='r' LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC',obj.relname);
    EXECUTE format('ALTER TABLE public.%I OWNER TO %I',obj.relname,owner_name);
  END LOOP;
  FOR obj IN SELECT c.relname FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND starts_with(c.relname,'bilateral_') AND c.relkind='S' LOOP
    EXECUTE format('REVOKE ALL ON SEQUENCE public.%I FROM PUBLIC',obj.relname);
  END LOOP;
  FOR obj IN SELECT p.oid::regprocedure AS name FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE 'bilateral\_%' ESCAPE '\' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',obj.name);
    EXECUTE format('ALTER FUNCTION %s OWNER TO %I',obj.name,owner_name);
  END LOOP;
END $$;
