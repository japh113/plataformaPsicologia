-- Disposable, explicitly enabled adult self-admission only. No legacy clinical grants.
DO $$ DECLARE relation_name text; populated boolean; BEGIN
  IF current_setting('psicopanel.migration_target',true) IS DISTINCT FROM '014'
    OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN
    RAISE EXCEPTION '014 requires the explicit isolated provisioning runner';
  END IF;
  FOR relation_name IN SELECT tablename FROM pg_tables WHERE schemaname='public'
    AND tablename<>'psicopanel_schema_migrations' ORDER BY tablename LOOP
    EXECUTE format('LOCK TABLE public.%I IN ACCESS EXCLUSIVE MODE',relation_name);
    EXECUTE format('SELECT EXISTS(SELECT FROM public.%I)',relation_name) INTO populated;
    IF populated THEN RAISE EXCEPTION '014 requires an empty isolated destination'; END IF;
  END LOOP;
END $$;

CREATE TABLE admission_templates (
  id text PRIMARY KEY, definition jsonb NOT NULL,
  CHECK(id='fictional-adult-v1'), CHECK(jsonb_typeof(definition)='object')
);
INSERT INTO admission_templates VALUES ('fictional-adult-v1',
  '{"id":"fictional-adult-v1","version":1,"title":"Admisión individual ficticia","fictional":true,"notice":"Solo ensayo ficticio. Estos campos no acreditan mínimos ni suficiencia clínica y no habilitan tratamiento.","questions":[{"id":"reason","label":"Motivo ficticio para este ensayo","type":"text","required":true,"maxLength":1000},{"id":"context","label":"Contexto ficticio adicional","type":"text","required":true,"maxLength":1000}]}'::jsonb);
CREATE TABLE admission_preparations (
  episode_id bigint PRIMARY KEY REFERENCES clinical_episodes(id) ON DELETE RESTRICT,
  agreement_id uuid NOT NULL REFERENCES bilateral_agreements(id) ON DELETE RESTRICT,
  created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE admission_assignments (
  id uuid PRIMARY KEY, agreement_id uuid NOT NULL REFERENCES bilateral_agreements(id) ON DELETE RESTRICT,
  episode_id bigint NOT NULL UNIQUE REFERENCES admission_preparations(episode_id) ON DELETE RESTRICT,
  account_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  patient_id text COLLATE "C" NOT NULL, psychologist_id text NOT NULL,
  template_id text NOT NULL REFERENCES admission_templates(id) ON DELETE RESTRICT,
  professional_name text NOT NULL, consent_version text NOT NULL CHECK(consent_version='fictional-admission-v1'),
  consent_text text NOT NULL, consent_hash text NOT NULL CHECK(length(consent_hash)=64),
  state text NOT NULL DEFAULT 'proposed' CHECK(state IN ('proposed','accepted','revoked')),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), accepted_at timestamptz, revoked_at timestamptz,
  latest_submission integer NOT NULL DEFAULT 0 CHECK(latest_submission>=0),
  review_state text NOT NULL DEFAULT 'awaiting_submission' CHECK(review_state IN ('awaiting_submission','submitted','correction_requested','validated')),
  FOREIGN KEY(episode_id,patient_id,psychologist_id) REFERENCES clinical_episode_participants(episode_id,patient_id,psychologist_user_id) ON DELETE RESTRICT,
  UNIQUE(id,episode_id,patient_id,psychologist_id,template_id),
  UNIQUE(id,account_id), UNIQUE(id,psychologist_id),
  CHECK((state='revoked')=(revoked_at IS NOT NULL)), CHECK(state<>'accepted' OR accepted_at IS NOT NULL)
);
CREATE TABLE admission_consents (
  assignment_id uuid PRIMARY KEY REFERENCES admission_assignments(id) ON DELETE RESTRICT,
  actor_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  consent_version text NOT NULL, consent_hash text NOT NULL, accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(assignment_id,actor_id) REFERENCES admission_assignments(id,account_id) ON DELETE RESTRICT
);
-- Private revision NEVER changes assignment metadata visible to PSI.
CREATE TABLE admission_drafts (
  assignment_id uuid PRIMARY KEY REFERENCES admission_assignments(id) ON DELETE RESTRICT,
  revision integer NOT NULL CHECK(revision>0), answers jsonb NOT NULL, CHECK(jsonb_typeof(answers)='object')
);
CREATE TABLE admission_submissions (
  assignment_id uuid NOT NULL, number integer NOT NULL CHECK(number>0),
  episode_id bigint NOT NULL, patient_id text COLLATE "C" NOT NULL, psychologist_id text NOT NULL, template_id text NOT NULL,
  author_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT, source_revision integer NOT NULL CHECK(source_revision>0),
  answers jsonb NOT NULL CHECK(jsonb_typeof(answers)='object'), submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(assignment_id,number),
  FOREIGN KEY(assignment_id,author_id) REFERENCES admission_assignments(id,account_id) ON DELETE RESTRICT,
  FOREIGN KEY(assignment_id,episode_id,patient_id,psychologist_id,template_id)
    REFERENCES admission_assignments(id,episode_id,patient_id,psychologist_id,template_id) ON DELETE RESTRICT
);
CREATE TABLE admission_corrections (
  assignment_id uuid NOT NULL, submission integer NOT NULL, actor_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  message text NOT NULL CHECK(length(message) BETWEEN 1 AND 1000), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(assignment_id,actor_id) REFERENCES admission_assignments(id,psychologist_id) ON DELETE RESTRICT,
  PRIMARY KEY(assignment_id,submission), FOREIGN KEY(assignment_id,submission) REFERENCES admission_submissions(assignment_id,number) ON DELETE RESTRICT
);
CREATE TABLE admission_validations (
  assignment_id uuid NOT NULL, submission integer NOT NULL, episode_id bigint NOT NULL,
  patient_id text COLLATE "C" NOT NULL, psychologist_id text NOT NULL, template_id text NOT NULL,
  actor_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  validated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(assignment_id,submission),
  FOREIGN KEY(assignment_id,submission) REFERENCES admission_submissions(assignment_id,number) ON DELETE RESTRICT,
  FOREIGN KEY(assignment_id,episode_id,patient_id,psychologist_id,template_id)
    REFERENCES admission_assignments(id,episode_id,patient_id,psychologist_id,template_id) ON DELETE RESTRICT,
  CHECK(actor_id=psychologist_id)
);
CREATE TABLE admission_operations (
  actor_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT, operation_id uuid NOT NULL,
  fingerprint text NOT NULL CHECK(length(fingerprint)=64), result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(actor_id,operation_id)
);
CREATE FUNCTION admission_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN RAISE EXCEPTION 'admission_immutable'; END $$;
DO $$ DECLARE obj text; BEGIN
  FOREACH obj IN ARRAY ARRAY['admission_templates','admission_preparations','admission_consents','admission_submissions','admission_corrections','admission_validations','admission_operations'] LOOP
    EXECUTE format('CREATE TRIGGER admission_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.admission_immutable()',obj);
  END LOOP;
END $$;
CREATE FUNCTION admission_assignment_identity() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP<>'UPDATE' THEN RAISE EXCEPTION 'admission_immutable'; END IF;
  IF ROW(NEW.id,NEW.agreement_id,NEW.episode_id,NEW.account_id,NEW.patient_id,NEW.psychologist_id,NEW.template_id,NEW.professional_name,NEW.consent_version,NEW.consent_text,NEW.consent_hash,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.agreement_id,OLD.episode_id,OLD.account_id,OLD.patient_id,OLD.psychologist_id,OLD.template_id,OLD.professional_name,OLD.consent_version,OLD.consent_text,OLD.consent_hash,OLD.created_at)
    OR OLD.state='revoked' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'admission_immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER admission_identity BEFORE UPDATE OR DELETE ON admission_assignments FOR EACH ROW EXECUTE FUNCTION admission_assignment_identity();
CREATE TRIGGER admission_no_truncate BEFORE TRUNCATE ON admission_assignments FOR EACH STATEMENT EXECUTE FUNCTION admission_immutable();

-- Same barrier as 013. Source writers hold their own source row, then this lock;
-- they never acquire account/profile/identity locks from this trigger.
CREATE FUNCTION admission_revoke() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE account text; patient text; professional text; agreement uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(73013,1);
  IF TG_TABLE_NAME='users' THEN
    IF ROW(NEW.email,NEW.patient_id,NEW.role,NEW.is_active,NEW.first_name,NEW.last_name)
      IS NOT DISTINCT FROM ROW(OLD.email,OLD.patient_id,OLD.role,OLD.is_active,OLD.first_name,OLD.last_name) THEN RETURN NULL; END IF;
    account:=OLD.id; professional:=OLD.id;
  ELSIF TG_TABLE_NAME='patients' THEN
    IF ROW(NEW.phone,NEW.global_birth_date,NEW.first_name,NEW.last_name) IS NOT DISTINCT FROM ROW(OLD.phone,OLD.global_birth_date,OLD.first_name,OLD.last_name) THEN RETURN NULL; END IF;
    patient:=OLD.id;
  ELSIF TG_TABLE_NAME='psychologist_profiles' THEN
    IF TG_OP='UPDATE' AND NEW.approval_status='active' AND NEW.user_id=OLD.user_id THEN RETURN NULL; END IF;
    professional:=OLD.user_id;
  ELSIF TG_TABLE_NAME='contact_verification_state' THEN
    IF TG_OP='UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NULL; END IF;
    account:=OLD.user_id;
  ELSIF TG_TABLE_NAME='bilateral_restrictions' THEN
    IF TG_OP='UPDATE' AND NEW.psychologist_id IS DISTINCT FROM OLD.psychologist_id THEN
      UPDATE public.admission_assignments SET state='revoked',revoked_at=clock_timestamp(),version=version+1
        WHERE state<>'revoked' AND psychologist_id=OLD.psychologist_id;
    END IF;
    IF TG_OP<>'DELETE' AND NEW.state='enabled' THEN RETURN NULL; END IF;
    professional:=CASE WHEN TG_OP='DELETE' THEN OLD.psychologist_id ELSE NEW.psychologist_id END;
  ELSIF TG_TABLE_NAME='bilateral_blocks' THEN
    account:=NEW.account_id; professional:=NEW.psychologist_id;
    UPDATE public.admission_assignments SET state='revoked',revoked_at=clock_timestamp(),version=version+1
      WHERE state<>'revoked' AND account_id=account AND psychologist_id=professional;
    RETURN NULL;
  ELSIF TG_TABLE_NAME='bilateral_agreements' THEN
    IF NEW IS NOT DISTINCT FROM OLD THEN RETURN NULL; END IF;
    agreement:=OLD.id;
  END IF;
  UPDATE public.admission_assignments SET state='revoked',revoked_at=clock_timestamp(),version=version+1
    WHERE state<>'revoked' AND (account_id=account OR patient_id=patient OR psychologist_id=professional OR agreement_id=agreement);
  RETURN NULL;
END $$;
CREATE TRIGGER admission_account_change AFTER UPDATE ON users FOR EACH ROW EXECUTE FUNCTION admission_revoke();
CREATE TRIGGER admission_identity_change AFTER UPDATE ON patients FOR EACH ROW EXECUTE FUNCTION admission_revoke();
CREATE TRIGGER admission_profile_change AFTER UPDATE OR DELETE ON psychologist_profiles FOR EACH ROW EXECUTE FUNCTION admission_revoke();
CREATE TRIGGER admission_verification_change AFTER UPDATE OR DELETE ON contact_verification_state FOR EACH ROW EXECUTE FUNCTION admission_revoke();
CREATE TRIGGER admission_restriction_change AFTER INSERT OR UPDATE OR DELETE ON bilateral_restrictions FOR EACH ROW EXECUTE FUNCTION admission_revoke();
CREATE TRIGGER admission_agreement_change AFTER UPDATE ON bilateral_agreements FOR EACH ROW EXECUTE FUNCTION admission_revoke();
CREATE TRIGGER admission_block_change AFTER INSERT OR UPDATE ON bilateral_blocks FOR EACH ROW EXECUTE FUNCTION admission_revoke();

-- Internal identity context only. Not an HTTP projection and not an authorization result.
CREATE FUNCTION admission_context(actor text,sv integer,op text,p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE g record; a record; subject record; identity record; grant_id uuid;
BEGIN
  IF op IN ('prepare','assign') THEN grant_id:=(p->>'agreementId')::uuid;
  ELSE SELECT agreement_id INTO grant_id FROM public.admission_assignments WHERE id=(p->>'id')::uuid; END IF;
  SELECT * INTO g FROM public.bilateral_agreements WHERE id=grant_id;
  PERFORM id FROM public.users WHERE id=ANY(ARRAY[actor,g.account_id,g.psychologist_id]) ORDER BY id FOR NO KEY UPDATE;
  SELECT id,role,is_active,session_version,patient_id INTO a FROM public.users WHERE id=actor;
  IF NOT FOUND OR NOT a.is_active OR a.session_version IS DISTINCT FROM sv OR
    (p->>'sessionExpiresAt')::double precision<=extract(epoch FROM clock_timestamp()) THEN RAISE EXCEPTION 'admission_session'; END IF;
  IF a.role NOT IN ('patient','psychologist') THEN RAISE EXCEPTION 'admission_missing'; END IF;
  IF g.id IS NULL OR actor IS DISTINCT FROM g.account_id AND actor IS DISTINCT FROM g.psychologist_id OR
    op IN ('prepare','assign','correct','validate') AND actor IS DISTINCT FROM g.psychologist_id OR
    op IN ('accept','save','submit','draft') AND actor IS DISTINCT FROM g.account_id THEN RAISE EXCEPTION 'admission_missing'; END IF;
  PERFORM user_id FROM public.psychologist_profiles WHERE user_id=g.psychologist_id FOR NO KEY UPDATE;
  SELECT id,patient_id,email,role,is_active INTO subject FROM public.users WHERE id=g.account_id;
  SELECT id,phone,global_birth_date INTO identity FROM public.patients WHERE id=g.patient_id FOR NO KEY UPDATE;
  PERFORM pg_advisory_xact_lock(73013,1);
  IF (p->>'sessionExpiresAt') IS NULL OR (p->>'sessionExpiresAt')::double precision<=extract(epoch FROM clock_timestamp()) THEN RAISE EXCEPTION 'admission_session'; END IF;
  -- Re-read after waiting; an unlink or source revocation may have committed.
  IF NOT EXISTS(SELECT 1 FROM public.bilateral_agreements WHERE id=grant_id AND state='completed'
      AND account_id=g.account_id AND patient_id=g.patient_id AND psychologist_id=g.psychologist_id AND purpose='individual_linkage') OR
    NOT EXISTS(SELECT 1 FROM public.users u JOIN public.psychologist_profiles pp ON pp.user_id=u.id
      WHERE u.id=g.psychologist_id AND u.is_active AND u.role='psychologist' AND pp.approval_status='active') OR
    NOT EXISTS(SELECT 1 FROM public.bilateral_restrictions WHERE psychologist_id=g.psychologist_id AND state='enabled') OR
    EXISTS(SELECT 1 FROM public.bilateral_blocks WHERE account_id=g.account_id AND psychologist_id=g.psychologist_id) OR
    subject.role IS DISTINCT FROM 'patient' OR NOT subject.is_active OR subject.patient_id IS DISTINCT FROM g.patient_id OR
    identity.global_birth_date IS NULL OR identity.global_birth_date>((clock_timestamp() AT TIME ZONE 'America/Mexico_City')::date-interval '18 years')::date THEN
    RAISE EXCEPTION 'admission_missing';
  END IF;
  RETURN jsonb_build_object('account',g.account_id,'patient',g.patient_id,'psychologist',g.psychologist_id,
    'email',subject.email,'phone',identity.phone,'role',a.role);
END $$;
CREATE FUNCTION admission_command(actor text,sv integer,op text,p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c jsonb; a public.admission_assignments%ROWTYPE; d public.admission_drafts%ROWTYPE; prior public.admission_operations%ROWTYPE; result jsonb; episode bigint; assignment uuid;
  consent text; name text; submitted integer;
BEGIN
  IF op NOT IN ('prepare','assign','detail','summary','draft','accept','save','submit','correct','validate','revoke') THEN RAISE EXCEPTION 'admission_missing'; END IF;
  c:=public.admission_context(actor,sv,op,p);
  IF NOT EXISTS(SELECT 1 FROM public.contact_verification_state WHERE user_id=c->>'account' AND channel='email' AND contact_digest=p->>'emailDigest') OR
     NOT EXISTS(SELECT 1 FROM public.contact_verification_state WHERE user_id=c->>'account' AND channel='sms' AND contact_digest=p->>'phoneDigest') THEN RAISE EXCEPTION 'admission_missing'; END IF;
  IF op NOT IN ('prepare','assign') THEN
    SELECT * INTO a FROM public.admission_assignments WHERE id=(p->>'id')::uuid FOR UPDATE;
    IF NOT FOUND OR a.state='revoked' OR a.account_id IS DISTINCT FROM c->>'account' OR a.patient_id IS DISTINCT FROM c->>'patient' OR a.psychologist_id IS DISTINCT FROM c->>'psychologist' THEN RAISE EXCEPTION 'admission_missing'; END IF;
    episode:=a.episode_id;
  ELSE episode:=(p->>'episodeId')::bigint; END IF;
  IF op<>'prepare' AND NOT EXISTS(SELECT 1 FROM public.clinical_episodes e JOIN public.clinical_episode_participants cp ON cp.episode_id=e.id
    WHERE e.id=episode AND e.status='prepared' AND e.modality='individual' AND e.started_at IS NULL AND e.finalized_at IS NULL
      AND cp.patient_id=c->>'patient' AND cp.psychologist_user_id=c->>'psychologist' AND e.participant_two_id IS NULL) THEN RAISE EXCEPTION 'admission_missing'; END IF;
  IF op NOT IN ('detail','summary','draft') THEN
    IF p->'confirmed' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'admission_conflict'; END IF;
    SELECT * INTO prior FROM public.admission_operations WHERE actor_id=actor AND operation_id=(p->>'operationId')::uuid;
    IF FOUND THEN
      IF prior.fingerprint IS DISTINCT FROM p->>'fingerprint' THEN RAISE EXCEPTION 'admission_conflict'; END IF;
      IF op IN ('submit','correct','validate') AND (a.latest_submission IS DISTINCT FROM (prior.result->>'submission')::integer
        OR op='validate' AND a.review_state<>'validated' OR op='correct' AND a.review_state<>'correction_requested') THEN RAISE EXCEPTION 'admission_conflict'; END IF;
      RETURN prior.result;
    END IF;
    IF op NOT IN ('prepare','assign','revoke') AND a.version IS DISTINCT FROM (p->>'expectedVersion')::integer THEN RAISE EXCEPTION 'admission_conflict'; END IF;
  END IF;
  IF op='prepare' THEN
    IF (SELECT count(*) FROM public.admission_preparations WHERE created_by=actor AND created_at>clock_timestamp()-interval '24 hours')>=20 THEN RAISE EXCEPTION 'admission_quota'; END IF;
    INSERT INTO public.clinical_episodes(psychologist_user_id,modality,participant_one_id,created_by_user_id)
      VALUES(c->>'psychologist','individual',c->>'patient',actor) RETURNING id INTO episode;
    INSERT INTO public.admission_preparations(episode_id,agreement_id,created_by) VALUES(episode,(p->>'agreementId')::uuid,actor);
    result:=jsonb_build_object('episodeId',episode::text,'status','prepared');
  ELSIF op='assign' THEN
    IF NOT EXISTS(SELECT 1 FROM public.admission_preparations WHERE episode_id=episode AND agreement_id=(p->>'agreementId')::uuid AND created_by=actor) OR
      NOT EXISTS(SELECT 1 FROM public.admission_templates WHERE id=p->>'templateId') OR EXISTS(SELECT 1 FROM public.admission_assignments WHERE episode_id=episode) THEN RAISE EXCEPTION 'admission_conflict'; END IF;
    assignment:=(p->>'newId')::uuid;
    SELECT btrim(first_name||' '||coalesce(last_name,'')) INTO name FROM public.users WHERE id=actor;
    consent:='Ensayo ficticio: acepto responder la plantilla '||(p->>'templateId')||' para la asignación '||assignment::text||', episodio preparado '||episode::text||', y enviar explícitamente mis respuestas a '||name||'. Mi borrador es privado. Solo mis envíos serán visibles para este profesional mientras siga vigente esta autorización. Puedo retirarla y cualquiera puede cancelar esta admisión. Esto no inicia tratamiento ni autoriza acceso al expediente legacy. No acredita mínimos ni suficiencia clínica.';
    INSERT INTO public.admission_assignments(id,agreement_id,episode_id,account_id,patient_id,psychologist_id,template_id,professional_name,consent_version,consent_text,consent_hash)
      VALUES(assignment,(p->>'agreementId')::uuid,episode,c->>'account',c->>'patient',actor,p->>'templateId',name,'fictional-admission-v1',consent,encode(sha256(convert_to(consent,'UTF8')),'hex'));
    result:=jsonb_build_object('id',assignment,'version',1,'state','proposed','episodeId',episode::text);
  ELSIF op='summary' THEN
    result:=jsonb_build_object('id',a.id,'episodeId',a.episode_id::text,'templateId',a.template_id,'professionalName',a.professional_name,'state',a.state,'version',a.version,'reviewState',a.review_state,'latestSubmission',a.latest_submission);
  ELSIF op='detail' THEN
    result:=jsonb_build_object('id',a.id,'episodeId',a.episode_id::text,'template',(SELECT definition FROM public.admission_templates WHERE id=a.template_id),
      'professionalName',a.professional_name,'consentVersion',a.consent_version,'consentText',a.consent_text,'consentHash',a.consent_hash,
      'state',a.state,'version',a.version,'reviewState',a.review_state,'latestSubmission',a.latest_submission,
      'submissions',coalesce((SELECT jsonb_agg(jsonb_build_object('number',s.number,'answers',s.answers,'submittedAt',s.submitted_at) ORDER BY s.number) FROM public.admission_submissions s WHERE s.assignment_id=a.id),'[]'::jsonb),
      'corrections',coalesce((SELECT jsonb_agg(jsonb_build_object('submission',r.submission,'message',r.message,'createdAt',r.created_at) ORDER BY r.submission) FROM public.admission_corrections r WHERE r.assignment_id=a.id),'[]'::jsonb),
      'validations',coalesce((SELECT jsonb_agg(jsonb_build_object('submission',v.submission,'episodeId',v.episode_id::text,'validatedAt',v.validated_at) ORDER BY v.submission) FROM public.admission_validations v WHERE v.assignment_id=a.id),'[]'::jsonb));
  ELSIF op='revoke' THEN
    UPDATE public.admission_assignments SET state='revoked',revoked_at=clock_timestamp(),version=version+1 WHERE id=a.id;
    result:=jsonb_build_object('id',a.id,'state','revoked');
  ELSIF op='accept' THEN
    IF a.state<>'proposed' OR p->>'consentHash' IS DISTINCT FROM a.consent_hash OR p->>'consentVersion' IS DISTINCT FROM a.consent_version THEN RAISE EXCEPTION 'admission_conflict'; END IF;
    INSERT INTO public.admission_consents(assignment_id,actor_id,consent_version,consent_hash) VALUES(a.id,actor,a.consent_version,a.consent_hash);
    UPDATE public.admission_assignments SET state='accepted',accepted_at=clock_timestamp(),version=version+1 WHERE id=a.id;
    result:=jsonb_build_object('id',a.id,'state','accepted','version',a.version+1);
  ELSE
    IF a.state<>'accepted' OR NOT EXISTS(SELECT 1 FROM public.admission_consents WHERE assignment_id=a.id AND actor_id=a.account_id AND consent_hash=a.consent_hash) THEN RAISE EXCEPTION 'admission_conflict'; END IF;
    IF op IN ('draft','save','submit') THEN SELECT * INTO d FROM public.admission_drafts WHERE assignment_id=a.id; END IF;
    IF op='draft' THEN
      result:=jsonb_build_object('revision',coalesce(d.revision,0),'answers',coalesce(d.answers,'{}'::jsonb));
    ELSIF op='save' THEN
      IF a.review_state NOT IN ('awaiting_submission','correction_requested') OR coalesce(d.revision,0) IS DISTINCT FROM (p->>'expectedRevision')::integer OR
        jsonb_typeof(p->'answers') IS DISTINCT FROM 'object' OR octet_length((p->'answers')::text)>12000 OR
        EXISTS(SELECT 1 FROM jsonb_each(p->'answers') kv WHERE kv.key NOT IN ('reason','context') OR jsonb_typeof(kv.value)<>'string' OR length(kv.value#>>'{}')>1000) THEN RAISE EXCEPTION 'admission_conflict'; END IF;
      INSERT INTO public.admission_drafts(assignment_id,revision,answers) VALUES(a.id,coalesce(d.revision,0)+1,p->'answers')
        ON CONFLICT(assignment_id) DO UPDATE SET revision=excluded.revision,answers=excluded.answers;
      result:=jsonb_build_object('revision',coalesce(d.revision,0)+1);
    ELSIF op='submit' THEN
      IF a.review_state NOT IN ('awaiting_submission','correction_requested') OR d.revision IS DISTINCT FROM (p->>'expectedRevision')::integer OR
        NOT coalesce(length(btrim(d.answers->>'reason'))>0 AND length(btrim(d.answers->>'context'))>0,false) THEN RAISE EXCEPTION 'admission_conflict'; END IF;
      submitted:=a.latest_submission+1;
      INSERT INTO public.admission_submissions(assignment_id,number,episode_id,patient_id,psychologist_id,template_id,author_id,source_revision,answers)
        VALUES(a.id,submitted,a.episode_id,a.patient_id,a.psychologist_id,a.template_id,actor,d.revision,d.answers);
      UPDATE public.admission_assignments SET latest_submission=submitted,review_state='submitted',version=version+1 WHERE id=a.id;
      result:=jsonb_build_object('id',a.id,'submission',submitted,'version',a.version+1);
    ELSIF op IN ('correct','validate') THEN
      IF a.latest_submission=0 OR a.latest_submission IS DISTINCT FROM (p->>'submission')::integer OR (op='validate' AND a.review_state<>'submitted' OR op='correct' AND a.review_state NOT IN ('submitted','validated')) OR
        a.episode_id::text IS DISTINCT FROM p->>'episodeId' THEN RAISE EXCEPTION 'admission_conflict'; END IF;
      IF op='correct' THEN
        IF length(btrim(p->>'message')) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'admission_conflict'; END IF;
        INSERT INTO public.admission_corrections(assignment_id,submission,actor_id,message) VALUES(a.id,a.latest_submission,actor,p->>'message');
        UPDATE public.admission_assignments SET review_state='correction_requested',version=version+1 WHERE id=a.id;
      ELSE
        INSERT INTO public.admission_validations(assignment_id,submission,episode_id,patient_id,psychologist_id,template_id,actor_id)
          VALUES(a.id,a.latest_submission,a.episode_id,a.patient_id,a.psychologist_id,a.template_id,actor);
        UPDATE public.admission_assignments SET review_state='validated',version=version+1 WHERE id=a.id;
      END IF;
      result:=jsonb_build_object('id',a.id,'submission',a.latest_submission,'version',a.version+1,'reviewState',CASE op WHEN 'correct' THEN 'correction_requested' ELSE 'validated' END);
    END IF;
  END IF;
  IF result IS NULL THEN RAISE EXCEPTION 'admission_missing'; END IF;
  IF op NOT IN ('detail','summary','draft') THEN INSERT INTO public.admission_operations(actor_id,operation_id,fingerprint,result) VALUES(actor,(p->>'operationId')::uuid,p->>'fingerprint',result); END IF;
  RETURN result;
END $$;

CREATE FUNCTION admission_candidates(actor text,sv integer,expires double precision) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF expires IS NULL OR expires<=extract(epoch FROM clock_timestamp()) OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=actor AND is_active AND session_version=sv AND role IN ('patient','psychologist')) THEN RAISE EXCEPTION 'admission_session'; END IF;
  RETURN coalesce((SELECT jsonb_agg(id ORDER BY id) FROM (SELECT id FROM public.admission_assignments WHERE (account_id=actor OR psychologist_id=actor) AND state<>'revoked' ORDER BY id LIMIT 100) own),'[]'::jsonb);
END $$;

DO $$ DECLARE owner_name text:='admission_owner_'||substr(md5(current_database()),1,16); obj record; BEGIN
  EXECUTE format('CREATE ROLE %I NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',owner_name);
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I',owner_name);
  EXECUTE format('GRANT SELECT(id,role,is_active,session_version,patient_id,email,first_name,last_name),UPDATE(id) ON public.users TO %I',owner_name);
  EXECUTE format('GRANT SELECT(id,phone,global_birth_date,first_name,last_name),UPDATE(id) ON public.patients TO %I',owner_name);
  EXECUTE format('GRANT SELECT(user_id,approval_status),UPDATE(user_id) ON public.psychologist_profiles TO %I',owner_name);
  EXECUTE format('GRANT SELECT ON public.contact_verification_state,public.bilateral_agreements,public.bilateral_restrictions,public.bilateral_blocks,public.clinical_episodes,public.clinical_episode_participants TO %I',owner_name);
  EXECUTE format('GRANT INSERT(psychologist_user_id,modality,participant_one_id,created_by_user_id) ON public.clinical_episodes TO %I',owner_name);
  EXECUTE format('GRANT USAGE ON SEQUENCE public.clinical_episodes_id_seq TO %I',owner_name);
  FOR obj IN SELECT c.relname FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND starts_with(c.relname,'admission_') AND c.relkind='r' LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC',obj.relname);
    EXECUTE format('ALTER TABLE public.%I OWNER TO %I',obj.relname,owner_name);
  END LOOP;
  FOR obj IN SELECT p.oid::regprocedure AS name FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND starts_with(p.proname,'admission_') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',obj.name);
    EXECUTE format('ALTER FUNCTION %s OWNER TO %I',obj.name,owner_name);
  END LOOP;
END $$;
