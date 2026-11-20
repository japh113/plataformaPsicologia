-- First individual consultation, exclusively on a fresh fictional installation.
DO $$
DECLARE t text; populated boolean;
BEGIN
  IF current_setting('psicopanel.migration_target',true) IS DISTINCT FROM '018'
      OR current_database() !~ '^psicopanel_episode_[a-z0-9_]+$'
      OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN
    RAISE EXCEPTION '018 requires explicit isolated provisioning';
  END IF;
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public'
      AND tablename<>'psicopanel_schema_migrations' ORDER BY tablename LOOP
    EXECUTE format('LOCK TABLE public.%I IN ACCESS EXCLUSIVE MODE',t);
    EXECUTE format('SELECT EXISTS(SELECT FROM public.%I)',t) INTO populated;
    -- 014 contributes one immutable template before business data exists.
    IF populated AND t<>'admission_templates' THEN
      RAISE EXCEPTION '018 requires an empty isolated destination';
    END IF;
  END LOOP;
END $$;

CREATE TABLE consultation_sufficiency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL,
  episode_id bigint NOT NULL,
  patient_id text COLLATE "C" NOT NULL,
  author_id text NOT NULL,
  template_id text NOT NULL,
  template_version integer NOT NULL DEFAULT 1 CHECK(template_version=1),
  criteria_version text NOT NULL CHECK (criteria_version='fictional-sufficiency-v1'),
  submission integer, directed_revision integer,
  declared_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (num_nonnulls(submission,directed_revision)=1),
  UNIQUE(assignment_id,submission), UNIQUE(assignment_id,directed_revision),
  UNIQUE(id,assignment_id,episode_id),
  FOREIGN KEY(assignment_id,episode_id,patient_id,author_id,template_id)
    REFERENCES admission_assignments(id,episode_id,patient_id,psychologist_id,template_id),
  FOREIGN KEY(assignment_id,submission) REFERENCES admission_validations(assignment_id,submission),
  FOREIGN KEY(assignment_id,directed_revision) REFERENCES admission_directed_versions(assignment_id,revision)
);
CREATE TABLE consultation_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sufficiency_id uuid NOT NULL,
  assignment_id uuid NOT NULL,
  episode_id bigint NOT NULL,
  account_id text NOT NULL,
  professional_id text NOT NULL,
  version text NOT NULL CHECK(version='fictional-first-consultation-v1'),
  terms text NOT NULL,
  terms_hash text NOT NULL CHECK(terms_hash=encode(sha256(convert_to(terms,'UTF8')),'hex')),
  accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(sufficiency_id), UNIQUE(id,episode_id),
  FOREIGN KEY(sufficiency_id,assignment_id,episode_id) REFERENCES consultation_sufficiency(id,assignment_id,episode_id),
  FOREIGN KEY(assignment_id,account_id) REFERENCES admission_assignments(id,account_id),
  FOREIGN KEY(assignment_id,professional_id) REFERENCES admission_assignments(id,psychologist_id)
);
CREATE TABLE consultation_withdrawals (
  consent_id uuid PRIMARY KEY REFERENCES consultation_consents(id),
  withdrawn_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE consultation_activations (
  episode_id bigint PRIMARY KEY REFERENCES clinical_episodes(id),
  consent_id uuid NOT NULL UNIQUE,
  activated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(consent_id,episode_id) REFERENCES consultation_consents(id,episode_id)
);

CREATE TABLE consultation_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id bigint NOT NULL UNIQUE REFERENCES consultation_activations(episode_id),
  patient_id text COLLATE "C" NOT NULL,
  professional_id text NOT NULL,
  scheduled_date date NOT NULL,
  scheduled_time time NOT NULL CHECK (scheduled_time < time '24:00' AND
    extract(minute FROM scheduled_time)=0 AND extract(second FROM scheduled_time)=0),
  duration_minutes integer NOT NULL DEFAULT 60 CHECK(duration_minutes=60),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  CHECK ((status='completed')=(completed_at IS NOT NULL)),
  UNIQUE(patient_id,scheduled_date,scheduled_time),
  UNIQUE(professional_id,scheduled_date,scheduled_time),
  UNIQUE(patient_id,professional_id,scheduled_date),
  UNIQUE(id,episode_id,patient_id,professional_id),
  FOREIGN KEY(episode_id,patient_id,professional_id)
    REFERENCES clinical_episode_participants(episode_id,patient_id,psychologist_user_id)
);

CREATE TABLE consultation_notes (
  appointment_id uuid PRIMARY KEY,
  episode_id bigint NOT NULL,
  patient_id text COLLATE "C" NOT NULL,
  author_id text NOT NULL,
  audience text NOT NULL DEFAULT 'professional_private' CHECK(audience='professional_private'),
  provenance_version text NOT NULL DEFAULT 'fictional-professional-original-v1'
    CHECK(provenance_version='fictional-professional-original-v1'),
  content text NOT NULL CHECK(length(btrim(content)) BETWEEN 1 AND 10000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(appointment_id,episode_id,patient_id,author_id)
    REFERENCES consultation_appointments(id,episode_id,patient_id,professional_id)
);

CREATE FUNCTION consultation_note_origin() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF current_user<>(SELECT proowner::regrole::text FROM pg_proc
      WHERE oid='public.admission_consultation(text,integer,text,jsonb)'::regprocedure)
    OR NOT EXISTS(SELECT 1 FROM public.consultation_appointments a WHERE a.id=NEW.appointment_id
        AND a.episode_id=NEW.episode_id AND a.professional_id=NEW.author_id AND a.patient_id=NEW.patient_id
        AND a.status='completed') THEN
    RAISE EXCEPTION 'admission_immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER consultation_note_origin BEFORE INSERT ON consultation_notes
  FOR EACH ROW EXECUTE FUNCTION consultation_note_origin();

-- A single write lock serializes the two schedulers and coverage changes.
-- The row update also makes a stale snapshot fail at higher isolation levels.
CREATE FUNCTION consultation_preserve_appointment() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF current_user<>(SELECT proowner::regrole::text FROM pg_proc
      WHERE oid='public.admission_consultation(text,integer,text,jsonb)'::regprocedure)
    OR TG_OP='DELETE' OR (TG_OP='INSERT' AND NEW.status<>'pending')
    OR (TG_OP='UPDATE' AND (OLD.status<>'pending' OR NEW.status<>'completed' OR
      (to_jsonb(NEW)-'status'-'completed_at')<>(to_jsonb(OLD)-'status'-'completed_at'))) THEN
    RAISE EXCEPTION 'admission_immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER consultation_preserve_appointment BEFORE INSERT OR UPDATE OR DELETE ON consultation_appointments
  FOR EACH ROW EXECUTE FUNCTION consultation_preserve_appointment();
CREATE TRIGGER consultation_appointments_no_truncate BEFORE TRUNCATE ON consultation_appointments
  FOR EACH STATEMENT EXECUTE FUNCTION admission_immutable();

CREATE TABLE consultation_schedule_guard (lock_id boolean PRIMARY KEY CHECK(lock_id), tick boolean NOT NULL);
INSERT INTO consultation_schedule_guard VALUES(true,false);
CREATE FUNCTION consultation_lock_schedule() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  UPDATE public.consultation_schedule_guard SET tick=NOT tick WHERE lock_id;
  RETURN NULL;
END $$;

CREATE FUNCTION consultation_slot_covered(professional text, day date, starts time) RETURNS boolean
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM public.psychologist_availability_exceptions e
    WHERE e.psychologist_user_id=professional AND e.exception_date=day
  ) THEN EXISTS (
    SELECT 1 FROM public.psychologist_availability_exceptions e
    JOIN public.psychologist_availability_exception_blocks b USING(psychologist_user_id,exception_date)
    WHERE e.psychologist_user_id=professional AND e.exception_date=day AND NOT e.is_unavailable
      AND b.start_time<=starts AND day+b.end_time>=day+starts+interval '60 minutes'
  ) ELSE EXISTS (
    SELECT 1 FROM public.psychologist_availability_blocks b
    WHERE b.psychologist_user_id=professional AND b.weekday=extract(dow FROM day)
      AND b.start_time<=starts AND day+b.end_time>=day+starts+interval '60 minutes'
  ) END;
$$;

-- Legacy association identifies a scheduling constraint, never historic authorship.
CREATE FUNCTION consultation_legacy_collision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP='UPDATE' AND (NEW.patient_id,NEW.scheduled_date,NEW.scheduled_time,NEW.status)
      IS NOT DISTINCT FROM (OLD.patient_id,OLD.scheduled_date,OLD.scheduled_time,OLD.status) THEN
    RETURN NEW;
  END IF;
  IF (TG_OP='INSERT' OR (NEW.patient_id,NEW.scheduled_date,NEW.scheduled_time)
      IS DISTINCT FROM (OLD.patient_id,OLD.scheduled_date,OLD.scheduled_time))
    AND (NEW.scheduled_time>=time '24:00' OR extract(minute FROM NEW.scheduled_time)<>0
      OR extract(second FROM NEW.scheduled_time)<>0) THEN
    RAISE EXCEPTION 'consultation_full_hour';
  END IF;
  IF NEW.status IN ('pending','completed') AND EXISTS (
    SELECT 1 FROM public.consultation_appointments a
    WHERE a.scheduled_date=NEW.scheduled_date AND (
      (a.patient_id=NEW.patient_id AND (a.scheduled_date+a.scheduled_time,a.scheduled_date+a.scheduled_time+interval '60 minutes')
        OVERLAPS (NEW.scheduled_date+NEW.scheduled_time,NEW.scheduled_date+NEW.scheduled_time+interval '60 minutes'))
      OR EXISTS (
        SELECT 1 FROM public.psychologist_patient_access spa
        WHERE spa.patient_id=NEW.patient_id AND spa.psychologist_user_id=a.professional_id
          AND (a.patient_id=NEW.patient_id OR
            (a.scheduled_date+a.scheduled_time,a.scheduled_date+a.scheduled_time+interval '60 minutes')
            OVERLAPS (NEW.scheduled_date+NEW.scheduled_time,NEW.scheduled_date+NEW.scheduled_time+interval '60 minutes'))
      )
    )
  ) THEN RAISE EXCEPTION 'consultation_slot_unavailable'; END IF;
  RETURN NEW;
END $$;
CREATE UNIQUE INDEX consultation_legacy_patient_day
  ON appointments(patient_id,scheduled_date) WHERE episode_id IS NULL AND status IN ('pending','completed');
CREATE TRIGGER consultation_schedule_lock BEFORE INSERT OR UPDATE ON appointments
  FOR EACH STATEMENT EXECUTE FUNCTION consultation_lock_schedule();
CREATE TRIGGER consultation_legacy_collision BEFORE INSERT OR UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION consultation_legacy_collision();

CREATE FUNCTION consultation_preserve_coverage() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.consultation_appointments a
    WHERE a.professional_id IN (
      CASE WHEN TG_OP<>'INSERT' THEN OLD.psychologist_user_id END,
      CASE WHEN TG_OP<>'DELETE' THEN NEW.psychologist_user_id END
    ) AND a.status='pending'
      AND a.scheduled_date+a.scheduled_time+interval '60 minutes'>clock_timestamp() AT TIME ZONE 'America/Los_Angeles'
      AND NOT public.consultation_slot_covered(a.professional_id,a.scheduled_date,a.scheduled_time)
  ) THEN RAISE EXCEPTION 'consultation_slot_unavailable'; END IF;
  RETURN NULL;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['psychologist_availability_blocks','psychologist_availability_exceptions',
      'psychologist_availability_exception_blocks'] LOOP
    EXECUTE format('CREATE TRIGGER consultation_schedule_lock BEFORE INSERT OR UPDATE OR DELETE ON public.%I
      FOR EACH STATEMENT EXECUTE FUNCTION public.consultation_lock_schedule()',t);
    EXECUTE format('CREATE CONSTRAINT TRIGGER consultation_preserve_coverage AFTER INSERT OR UPDATE OR DELETE ON public.%I
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.consultation_preserve_coverage()',t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION enforce_clinical_episode_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'prepared' THEN RAISE EXCEPTION 'EPISODE_INTEGRITY: An episode must be prepared first'; END IF;
  ELSIF NEW IS DISTINCT FROM OLD AND NOT (
    current_user=(SELECT proowner::regrole::text FROM pg_proc
      WHERE oid='public.admission_consultation(text,integer,text,jsonb)'::regprocedure)
    AND NEW.modality='individual' AND OLD.status='prepared' AND NEW.status='active'
    AND (to_jsonb(NEW)-'status'-'started_at')=(to_jsonb(OLD)-'status'-'started_at')
    AND EXISTS (SELECT 1 FROM public.consultation_activations a WHERE a.episode_id=OLD.id AND a.activated_at=NEW.started_at)
  ) THEN RAISE EXCEPTION 'EPISODE_INTEGRITY: Invalid lifecycle transition'; END IF;
  RETURN NEW;
END $$;
ALTER TABLE clinical_episodes DROP CONSTRAINT clinical_episodes_prepared_check,
  ADD CONSTRAINT clinical_episodes_first_consultation_check CHECK (
    finalized_at IS NULL AND (status='prepared' AND started_at IS NULL OR
      status='active' AND modality='individual' AND started_at IS NOT NULL)
  );
CREATE TRIGGER consultation_prepare_only BEFORE INSERT ON clinical_episodes
  FOR EACH ROW EXECUTE FUNCTION enforce_clinical_episode_identity();

CREATE FUNCTION admission_consultation(actor text, sv integer, op text, p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  a public.admission_assignments%ROWTYPE;
  e public.clinical_episodes%ROWTYPE;
  proof public.consultation_sufficiency%ROWTYPE;
  consent public.consultation_consents%ROWTYPE;
  slot public.consultation_appointments%ROWTYPE;
  ctx jsonb;
  actor_is_patient boolean;
  accepted boolean;
  live boolean;
  doc integer;
  mode text;
  template_version text;
  day date;
  begins time;
  terms text;
  terms_version constant text := 'fictional-first-consultation-v1';
  criteria_revision constant text := 'fictional-sufficiency-v1';
  stamp timestamptz;
  private_note jsonb;
BEGIN
  IF op NOT IN ('status','summary','sufficiency','consent','withdraw','revoke-admission','activate','book','complete','note') THEN
    RAISE EXCEPTION 'admission_missing';
  END IF;
  -- Derive withdrawal authority from the current patient account even during
  -- a professional restriction. Other operations use the full 014 barrier.
  ctx:=public.admission_context(actor,sv,CASE WHEN op='withdraw' THEN 'detail' ELSE 'consultation' END,p);
  SELECT * INTO a FROM public.admission_assignments WHERE id=(p->>'id')::uuid FOR UPDATE;
  IF NOT FOUND OR ctx->>'account' IS DISTINCT FROM a.account_id OR ctx->>'patient' IS DISTINCT FROM a.patient_id
    OR ctx->>'psychologist' IS DISTINCT FROM a.psychologist_id THEN RAISE EXCEPTION 'admission_missing'; END IF;
  actor_is_patient:=ctx->>'role'='patient';
  IF (op IN ('consent','withdraw') AND NOT actor_is_patient)
    OR (op IN ('sufficiency','activate','book','complete','note') AND actor_is_patient) THEN
    RAISE EXCEPTION 'admission_missing';
  END IF;
  IF op<>'withdraw' AND (
    NOT EXISTS (SELECT 1 FROM public.contact_verification_state v WHERE v.user_id=a.account_id
      AND v.channel='email' AND v.contact_digest=p->>'emailDigest')
    OR NOT EXISTS (SELECT 1 FROM public.contact_verification_state v WHERE v.user_id=a.account_id
      AND v.channel='sms' AND v.contact_digest=p->>'phoneDigest')
  ) THEN RAISE EXCEPTION 'admission_missing'; END IF;
  SELECT * INTO e FROM public.clinical_episodes WHERE id=a.episode_id AND modality='individual'
    AND participant_one_id=a.patient_id AND psychologist_user_id=a.psychologist_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'admission_missing'; END IF;

  IF e.status='active' THEN
    SELECT c.* INTO consent FROM public.consultation_activations x
    JOIN public.consultation_consents c ON c.id=x.consent_id
    WHERE x.episode_id=e.id AND c.assignment_id=a.id;
    SELECT * INTO proof FROM public.consultation_sufficiency WHERE id=consent.sufficiency_id;
  ELSE
    SELECT t.definition->>'version' INTO template_version FROM public.admission_templates t WHERE t.id=a.template_id;
    IF a.state='accepted' AND a.template_id='fictional-adult-v1' AND template_version='1'
      AND EXISTS(SELECT 1 FROM public.admission_consents c WHERE c.assignment_id=a.id AND c.actor_id=a.account_id
        AND c.consent_hash=a.consent_hash AND c.consent_version=a.consent_version) THEN
      IF a.consent_version='fictional-directed-v1' AND a.directed_review='validated' AND EXISTS (
        SELECT 1 FROM public.admission_directed_validations v
        WHERE v.assignment_id=a.id AND v.document_revision=a.latest_document AND v.actor_id=a.psychologist_id
      ) THEN
        doc:=a.latest_document; mode:='directed';
      ELSIF a.consent_version='fictional-admission-v2' AND a.review_state='validated' AND EXISTS (
        SELECT 1 FROM public.admission_validations v
        WHERE v.assignment_id=a.id AND v.submission=a.latest_submission AND v.actor_id=a.psychologist_id
          AND v.episode_id=e.id AND v.patient_id=a.patient_id AND v.template_id=a.template_id
      ) THEN
        doc:=a.latest_submission; mode:='self';
      END IF;
    END IF;
    IF doc IS NOT NULL THEN
      SELECT * INTO proof FROM public.consultation_sufficiency s WHERE s.assignment_id=a.id
        AND (mode='directed' AND s.directed_revision=doc OR mode='self' AND s.submission=doc);
      SELECT * INTO consent FROM public.consultation_consents c WHERE c.sufficiency_id=proof.id;
    END IF;
  END IF;
  accepted:=consent.id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.consultation_withdrawals w WHERE w.consent_id=consent.id
  );
  live:=e.status='active' AND accepted AND a.state='accepted';
  terms:='Ensayo ficticio individual. Autorizo iniciar tratamiento en el episodio '||e.id||' con '
    ||a.professional_name||' ('||a.psychologist_id||'). El alcance es una cita de 60 minutos y una nota privada '
    ||'de autoría profesional. Puedo retirar este consentimiento; la nota y su procedencia se conservan.';
  IF op NOT IN ('status','summary') AND p->'confirmed' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'admission_conflict'; END IF;
  IF op='sufficiency' THEN
    IF e.status<>'prepared' OR doc IS NULL OR p->>'assignmentVersion' IS DISTINCT FROM a.version::text
      OR p->>'documentVersion' IS DISTINCT FROM doc::text OR p->>'criteriaVersion' IS DISTINCT FROM criteria_revision THEN
      RAISE EXCEPTION 'admission_conflict';
    END IF;
    INSERT INTO public.consultation_sufficiency(assignment_id,episode_id,patient_id,author_id,template_id,
      criteria_version,submission,directed_revision)
      VALUES(a.id,e.id,a.patient_id,actor,a.template_id,criteria_revision,CASE WHEN mode='self' THEN doc END,
        CASE WHEN mode='directed' THEN doc END) ON CONFLICT DO NOTHING;
  ELSIF op='consent' THEN
    IF e.status<>'prepared' OR proof.id IS NULL OR p->>'sufficiencyId' IS DISTINCT FROM proof.id::text
      OR p->>'consentVersion' IS DISTINCT FROM terms_version
      OR p->>'consentHash' IS DISTINCT FROM encode(sha256(convert_to(terms,'UTF8')),'hex') THEN
      RAISE EXCEPTION 'admission_conflict';
    END IF;
    IF consent.id IS NOT NULL AND NOT accepted THEN RAISE EXCEPTION 'admission_conflict'; END IF;
    INSERT INTO public.consultation_consents(sufficiency_id,assignment_id,episode_id,account_id,professional_id,version,terms,terms_hash)
      VALUES(proof.id,a.id,e.id,actor,a.psychologist_id,terms_version,terms,encode(sha256(convert_to(terms,'UTF8')),'hex'))
      ON CONFLICT DO NOTHING;
  ELSIF op='withdraw' THEN
    -- Scope withdrawal to the exact consent even if the admission has changed.
    INSERT INTO public.consultation_withdrawals(consent_id)
      SELECT c.id FROM public.consultation_consents c
      WHERE c.assignment_id=a.id AND c.account_id=actor AND c.id::text=p->>'consentId'
      ON CONFLICT DO NOTHING;
    IF NOT FOUND AND NOT EXISTS (
      SELECT 1 FROM public.consultation_withdrawals w JOIN public.consultation_consents c ON c.id=w.consent_id
      WHERE c.assignment_id=a.id AND c.account_id=actor AND c.id::text=p->>'consentId'
    ) THEN RAISE EXCEPTION 'admission_missing'; END IF;
  ELSIF op='revoke-admission' THEN
    IF e.status<>'active' OR a.state<>'accepted' OR p->>'assignmentVersion' IS DISTINCT FROM a.version::text THEN
      RAISE EXCEPTION 'admission_conflict';
    END IF;
    UPDATE public.admission_assignments SET state='revoked',revoked_at=clock_timestamp(),version=version+1 WHERE id=a.id;
  ELSIF op='activate' THEN
    IF e.status<>'prepared' OR NOT accepted OR p->>'consentId' IS DISTINCT FROM consent.id::text THEN
      RAISE EXCEPTION 'admission_conflict';
    END IF;
    stamp:=clock_timestamp();
    INSERT INTO public.consultation_activations VALUES(e.id,consent.id,stamp);
    UPDATE public.clinical_episodes SET status='active',started_at=stamp WHERE id=e.id AND status='prepared';
    IF NOT FOUND THEN RAISE EXCEPTION 'admission_conflict'; END IF;
  ELSIF op IN ('book','complete','note') THEN
    IF NOT live THEN RAISE EXCEPTION 'admission_missing'; END IF;
    SELECT * INTO slot FROM public.consultation_appointments WHERE episode_id=e.id;
    IF op='book' THEN
      IF slot.id IS NOT NULL THEN RAISE EXCEPTION 'admission_conflict'; END IF;
      IF p->>'date' IS NULL OR p->>'date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        OR p->>'time' IS NULL OR p->>'time' !~ '^([01][0-9]|2[0-3]):00$' THEN RAISE EXCEPTION 'admission_conflict'; END IF;
      day:=(p->>'date')::date; begins:=(p->>'time')::time;
      UPDATE public.consultation_schedule_guard SET tick=NOT tick WHERE lock_id;
      IF NOT public.consultation_slot_covered(actor,day,begins) OR EXISTS (
        SELECT 1 FROM public.appointments legacy
        WHERE legacy.episode_id IS NULL AND legacy.scheduled_date=day AND legacy.status IN ('pending','completed')
          AND ((legacy.patient_id=a.patient_id AND
              (legacy.scheduled_date+legacy.scheduled_time,legacy.scheduled_date+legacy.scheduled_time+interval '60 minutes')
                OVERLAPS (day+begins,day+begins+interval '60 minutes'))
            OR EXISTS (SELECT 1 FROM public.psychologist_patient_access spa
              WHERE spa.patient_id=legacy.patient_id AND spa.psychologist_user_id=actor
              AND (legacy.patient_id=a.patient_id OR
                (legacy.scheduled_date+legacy.scheduled_time,legacy.scheduled_date+legacy.scheduled_time+interval '60 minutes')
                  OVERLAPS (day+begins,day+begins+interval '60 minutes'))))
      ) THEN RAISE EXCEPTION 'consultation_slot_unavailable'; END IF;
      BEGIN
        INSERT INTO public.consultation_appointments(episode_id,patient_id,professional_id,scheduled_date,scheduled_time)
          VALUES(e.id,a.patient_id,actor,day,begins);
      EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'consultation_slot_unavailable';
      END;
    ELSIF p->>'appointmentId' IS DISTINCT FROM slot.id::text OR slot.id IS NULL THEN
      RAISE EXCEPTION 'admission_missing';
    ELSIF op='complete' THEN
      stamp:=clock_timestamp();
      IF slot.scheduled_date+slot.scheduled_time>stamp AT TIME ZONE 'America/Los_Angeles' THEN
        RAISE EXCEPTION 'consultation_future';
      END IF;
      UPDATE public.consultation_appointments SET status='completed',completed_at=stamp
        WHERE id=slot.id AND status='pending';
    ELSE
      IF slot.status<>'completed' OR jsonb_typeof(p->'content') IS DISTINCT FROM 'string'
        OR length(btrim(p->>'content')) NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'admission_conflict'; END IF;
      INSERT INTO public.consultation_notes(appointment_id,episode_id,patient_id,author_id,content)
        VALUES(slot.id,e.id,a.patient_id,actor,btrim(p->>'content')) ON CONFLICT DO NOTHING;
      IF NOT FOUND THEN RAISE EXCEPTION 'admission_conflict'; END IF;
    END IF;
  END IF;
  IF (p->>'sessionExpiresAt') IS NULL OR (p->>'sessionExpiresAt')::double precision<=extract(epoch FROM clock_timestamp()) THEN
    RAISE EXCEPTION 'admission_session';
  END IF;
  IF op='summary' THEN
    RETURN jsonb_build_object('id',a.id,'episodeId',e.id::text,'professionalName',a.professional_name,
      'status',CASE WHEN e.status='active' AND NOT live THEN 'withdrawn' ELSE e.status END);
  ELSIF op<>'status' THEN
    RETURN jsonb_build_object('saved',true);
  END IF;

  IF live THEN
    SELECT * INTO slot FROM public.consultation_appointments WHERE episode_id=e.id;
    IF NOT actor_is_patient AND slot.id IS NOT NULL THEN
      SELECT jsonb_build_object('content',n.content,'recordedAt',n.created_at) INTO private_note
      FROM public.consultation_notes n WHERE n.appointment_id=slot.id AND n.episode_id=e.id AND n.author_id=actor
        AND n.patient_id=a.patient_id AND n.audience='professional_private';
    END IF;
  END IF;
  RETURN jsonb_build_object('id',a.id,'episodeId',e.id::text,'professionalName',a.professional_name,
    'status',CASE WHEN e.status='active' AND NOT live THEN 'withdrawn' ELSE e.status END,
    'admissionVersion',a.version,'documentVersion',doc,'sufficiencyId',proof.id,
    'criteriaVersion',criteria_revision,'consentId',consent.id,'consentAccepted',accepted,
    'consentVersion',terms_version,'consentTerms',terms,'consentHash',encode(sha256(convert_to(terms,'UTF8')),'hex'),
    'appointment',CASE WHEN slot.id IS NOT NULL THEN jsonb_build_object('id',slot.id,'date',slot.scheduled_date,
      'time',to_char(slot.scheduled_time,'HH24:MI'),'status',slot.status,'durationMinutes',slot.duration_minutes,
      'canComplete',NOT actor_is_patient AND slot.status='pending'
        AND slot.scheduled_date+slot.scheduled_time<=clock_timestamp() AT TIME ZONE 'America/Los_Angeles') END)
    || CASE WHEN NOT actor_is_patient THEN jsonb_build_object('note',private_note) ELSE '{}'::jsonb END;
END $$;

DO $$
DECLARE t text; f text;
  owner_name text := 'admission_owner_'||substr(md5(current_database()),1,16);
  login_name text := current_setting('psicopanel.admission_client',true);
BEGIN
  IF login_name IS NULL OR login_name !~ '^[a-z][a-z0-9_]{0,62}$' THEN RAISE EXCEPTION 'Invalid admission LOGIN'; END IF;
  FOREACH t IN ARRAY ARRAY['consultation_sufficiency','consultation_consents','consultation_withdrawals',
    'consultation_activations','consultation_notes','consultation_appointments','consultation_schedule_guard'] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC',t);
    EXECUTE format('ALTER TABLE public.%I OWNER TO %I',t,owner_name);
    IF t NOT IN ('consultation_appointments','consultation_schedule_guard') THEN
      EXECUTE format('CREATE TRIGGER consultation_preserved BEFORE UPDATE OR DELETE OR TRUNCATE ON public.%I
        FOR EACH STATEMENT EXECUTE FUNCTION public.admission_immutable()',t);
    END IF;
  END LOOP;
  FOREACH f IN ARRAY ARRAY['consultation_lock_schedule()','consultation_slot_covered(text,date,time)',
    'consultation_note_origin()','consultation_preserve_appointment()','consultation_legacy_collision()','consultation_preserve_coverage()','admission_consultation(text,integer,text,jsonb)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC',f);
    EXECUTE format('ALTER FUNCTION public.%s OWNER TO %I',f,owner_name);
  END LOOP;
  EXECUTE format('GRANT SELECT(id,episode_id,patient_id,scheduled_date,scheduled_time,status) ON public.appointments TO %I',owner_name);
  EXECUTE format('GRANT SELECT(patient_id,psychologist_user_id) ON public.psychologist_patient_access TO %I',owner_name);
  EXECUTE format('GRANT SELECT ON public.psychologist_availability_blocks,public.psychologist_availability_exceptions,
    public.psychologist_availability_exception_blocks TO %I',owner_name);
  EXECUTE format('GRANT UPDATE(status,started_at) ON public.clinical_episodes TO %I',owner_name);
  EXECUTE format('GRANT INSERT ON public.clinical_episode_history TO %I',owner_name);
  EXECUTE format('GRANT USAGE ON SEQUENCE public.clinical_episode_history_id_seq TO %I',owner_name);
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.admission_consultation(text,integer,text,jsonb) TO %I',login_name);
END $$;

-- Ordinary API connections on 018 can use existing clinical surfaces but
-- have no direct access to admission or consultation tables and commands.
DO $$
DECLARE t text;
  login_name text := current_setting('psicopanel.consultation_legacy_client',true);
BEGIN
  IF login_name IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_roles r WHERE r.rolname=login_name AND r.rolcanlogin
      AND NOT (r.rolsuper OR r.rolinherit OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls)
      AND NOT EXISTS(SELECT 1 FROM pg_auth_members m WHERE r.oid IN (m.roleid,m.member))
      AND NOT has_function_privilege(r.oid,'public.admission_consultation(text,integer,text,jsonb)','EXECUTE')
  ) THEN RAISE EXCEPTION 'Unsafe ordinary API role'; END IF;
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I',login_name);
  FOREACH t IN ARRAY ARRAY['users','psychologist_profiles','patients','care_relationships','psychologist_patient_access',
    'appointments','appointment_waitlist_entries','patient_clinical_notes','patient_tasks','clinical_record_history',
    'audit_logs','psychologist_availability','psychologist_availability_blocks','psychologist_availability_exceptions',
    'psychologist_availability_exception_blocks','contact_verification_state','contact_verification_challenges',
    'contact_change_requests','contact_change_notices','contact_change_events'] LOOP
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO %I',t,login_name);
  END LOOP;
  FOR t IN SELECT c.relname FROM pg_class c
    JOIN pg_depend d ON d.objid=c.oid AND d.deptype IN ('a','i')
    JOIN pg_class source ON source.oid=d.refobjid
    WHERE c.relnamespace='public'::regnamespace AND c.relkind='S'
      AND has_table_privilege(login_name,source.oid,'INSERT')
  LOOP
    EXECUTE format('GRANT USAGE ON SEQUENCE public.%I TO %I',t,login_name);
  END LOOP;
END $$;
