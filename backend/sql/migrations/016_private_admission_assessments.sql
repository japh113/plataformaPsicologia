-- Isolated authenticated admission assessments only. No general clinical grant.
DO $$ DECLARE relation_name text; populated boolean; BEGIN
  IF current_setting('psicopanel.migration_target',true) IS DISTINCT FROM '016'
    OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN
    RAISE EXCEPTION '016 requires explicit isolated provisioning';
  END IF;
  -- 014 installs one immutable predefined template, not business/clinical data.
  -- Lock it too; only that configuration and the ledger may already contain rows.
  FOR relation_name IN SELECT tablename FROM pg_tables WHERE schemaname='public'
    AND tablename<>'psicopanel_schema_migrations' ORDER BY tablename LOOP
    EXECUTE format('LOCK TABLE public.%I IN ACCESS EXCLUSIVE MODE',relation_name);
    EXECUTE format('SELECT EXISTS(SELECT FROM public.%I)',relation_name) INTO populated;
    IF populated AND relation_name<>'admission_templates' THEN RAISE EXCEPTION '016 requires an empty isolated destination'; END IF;
  END LOOP;
END $$;

-- Authenticated admission assessments extend 015; fixture provenance stays distinct.
ALTER TABLE admission_assignments DROP CONSTRAINT admission_assignments_consent_version_check;
ALTER TABLE admission_assignments ADD CHECK(consent_version IN ('fictional-admission-v1','fictional-admission-v2'));
ALTER TABLE admission_assignments ADD UNIQUE(id,episode_id,patient_id,psychologist_id);
-- Only replace checks mentioning provenance; retain the previous_revision invariant.
DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='episode_private_record_versions'::regclass
    AND contype='c' AND pg_get_constraintdef(oid) LIKE '%recording_kind%' LOOP
    EXECUTE format('ALTER TABLE episode_private_record_versions DROP CONSTRAINT %I',c.conname);
  END LOOP;
END $$;
ALTER TABLE episode_private_record_versions
  ADD COLUMN assignment_id uuid,
  ADD COLUMN submission integer,
  ADD COLUMN authenticated_author_user_id text REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD COLUMN authenticated_session_version integer CHECK(authenticated_session_version>=0),
  ADD FOREIGN KEY(assignment_id,submission) REFERENCES admission_submissions(assignment_id,number) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD FOREIGN KEY(assignment_id,episode_id,patient_id,professional_user_id)
    REFERENCES admission_assignments(id,episode_id,patient_id,psychologist_id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE episode_private_record_versions ADD CHECK(
  (recording_kind IN ('initial_empty','sandbox_fixture') AND assignment_id IS NULL AND submission IS NULL
    AND authenticated_author_user_id IS NULL AND authenticated_session_version IS NULL AND
    ((revision=1 AND recording_kind='initial_empty' AND technical_author_user_id IS NULL AND risk_level='unevaluated' AND professional_context='') OR
     (revision>1 AND recording_kind='sandbox_fixture' AND technical_author_user_id=professional_user_id AND technical_author_user_id IS NOT NULL))) OR
  (revision>1 AND recording_kind='authenticated_admission' AND technical_author_user_id IS NULL
    AND assignment_id IS NOT NULL AND submission IS NOT NULL AND authenticated_author_user_id IS NOT NULL
    AND authenticated_author_user_id=professional_user_id AND authenticated_session_version IS NOT NULL)
);
CREATE OR REPLACE FUNCTION episode_record_version_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
DECLARE latest integer;
BEGIN
  IF current_setting('session_replication_role')<>'origin' THEN RAISE EXCEPTION 'episode_record_invalid'; END IF;
  -- Serialize per record. The SELECT after waiting sees the committed revision.
  PERFORM episode_id FROM public.episode_private_records WHERE episode_id=NEW.episode_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'episode_record_invalid'; END IF;
  SELECT coalesce(max(revision),0) INTO latest FROM public.episode_private_record_versions WHERE episode_id=NEW.episode_id;
  IF latest IS DISTINCT FROM NEW.previous_revision OR NEW.revision IS DISTINCT FROM latest+1 THEN
    RAISE EXCEPTION 'episode_record_conflict' USING ERRCODE='40001';
  END IF;
  IF latest=0 AND (pg_trigger_depth()<>2 OR NEW.recording_kind<>'initial_empty') OR
    latest>0 AND (pg_trigger_depth()<>1 OR NEW.recording_kind NOT IN ('sandbox_fixture','authenticated_admission')) THEN
    RAISE EXCEPTION 'episode_record_invalid';
  END IF;
  -- Server provenance; authenticated authorship is separately constrained.
  NEW.writer_login:=session_user; NEW.recorded_at:=clock_timestamp();
  RETURN NEW;
END $$;

-- Internal only: invoked by admission_command after the same identity/digest context.
CREATE FUNCTION admission_record_command(actor text,sv integer,op text,p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c jsonb; a public.admission_assignments%ROWTYPE; latest integer;
  prior public.admission_operations%ROWTYPE; result jsonb;
BEGIN
  IF op NOT IN ('record','assess') THEN RAISE EXCEPTION 'admission_missing'; END IF;
  c:=public.admission_context(actor,sv,op,p);
  IF c->>'role'<>'psychologist' OR c->>'psychologist' IS DISTINCT FROM actor OR
    NOT EXISTS(SELECT 1 FROM public.contact_verification_state WHERE user_id=c->>'account' AND channel='email' AND contact_digest=p->>'emailDigest') OR
    NOT EXISTS(SELECT 1 FROM public.contact_verification_state WHERE user_id=c->>'account' AND channel='sms' AND contact_digest=p->>'phoneDigest') THEN RAISE EXCEPTION 'admission_missing'; END IF;
  SELECT * INTO a FROM public.admission_assignments WHERE id=(p->>'id')::uuid FOR UPDATE;
  IF NOT FOUND OR a.state<>'accepted' OR a.psychologist_id IS DISTINCT FROM actor OR
    a.account_id IS DISTINCT FROM c->>'account' OR a.patient_id IS DISTINCT FROM c->>'patient' OR
    a.consent_version<>'fictional-admission-v2' OR a.latest_submission=0 OR NOT EXISTS(SELECT 1 FROM public.admission_consents
      WHERE assignment_id=a.id AND actor_id=a.account_id AND consent_version=a.consent_version AND consent_hash=a.consent_hash) OR
    NOT EXISTS(SELECT 1 FROM public.clinical_episodes e JOIN public.clinical_episode_participants cp ON cp.episode_id=e.id
      WHERE e.id=a.episode_id AND e.status='prepared' AND e.modality='individual' AND e.participant_two_id IS NULL
        AND e.started_at IS NULL AND e.finalized_at IS NULL AND e.psychologist_user_id=actor
        AND cp.patient_id=a.patient_id AND cp.psychologist_user_id=actor) THEN RAISE EXCEPTION 'admission_missing'; END IF;
  PERFORM episode_id FROM public.episode_private_records WHERE episode_id=a.episode_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'admission_missing'; END IF;
  -- All revokers share the held 013 barrier. Session expiration is checked after waits.
  IF (p->>'sessionExpiresAt') IS NULL OR (p->>'sessionExpiresAt')::double precision<=extract(epoch FROM clock_timestamp()) THEN RAISE EXCEPTION 'admission_session'; END IF;
  SELECT max(revision) INTO latest FROM public.episode_private_record_versions WHERE episode_id=a.episode_id;
  IF op='record' THEN
    -- No fixture values, technical authors or database LOGINs in this projection.
    result:=jsonb_build_object('episodeId',a.episode_id::text,'version',a.version,'expectedRevision',latest,
      'submission',a.latest_submission,'canAssess',a.latest_submission>0 AND a.review_state IN ('submitted','validated'),
      'current',CASE WHEN a.review_state IN ('submitted','validated') THEN
        (SELECT jsonb_build_object('revision',v.revision,'submission',v.submission,'riskLevel',v.risk_level,
          'context',v.professional_context,'authorId',v.authenticated_author_user_id,'recordedAt',v.recorded_at)
          FROM public.episode_private_record_versions v WHERE v.episode_id=a.episode_id AND v.assignment_id=a.id
            AND v.submission=a.latest_submission AND v.recording_kind='authenticated_admission' ORDER BY v.revision DESC LIMIT 1) ELSE NULL END,
      'history',coalesce((SELECT jsonb_agg(jsonb_build_object('revision',v.revision,'submission',v.submission,
        'riskLevel',v.risk_level,'context',v.professional_context,'authorId',v.authenticated_author_user_id,'recordedAt',v.recorded_at) ORDER BY v.revision DESC)
        FROM public.episode_private_record_versions v WHERE v.episode_id=a.episode_id AND v.assignment_id=a.id
          AND v.recording_kind='authenticated_admission'),'[]'::jsonb));
    RETURN result;
  END IF;
  IF p->'confirmed' IS DISTINCT FROM 'true'::jsonb OR a.latest_submission=0 OR a.review_state NOT IN ('submitted','validated') OR
    a.latest_submission IS DISTINCT FROM (p->>'submission')::integer OR a.episode_id::text IS DISTINCT FROM p->>'episodeId' OR
    NOT EXISTS(SELECT 1 FROM public.admission_submissions WHERE assignment_id=a.id AND number=a.latest_submission) THEN RAISE EXCEPTION 'admission_conflict'; END IF;
  -- Replays are authenticated/authorized above, and are obsolete after correction/new submission.
  SELECT * INTO prior FROM public.admission_operations WHERE actor_id=actor AND operation_id=(p->>'operationId')::uuid;
  IF FOUND THEN
    IF prior.fingerprint IS DISTINCT FROM p->>'fingerprint' OR latest IS DISTINCT FROM (prior.result->>'revision')::integer
      THEN RAISE EXCEPTION 'admission_conflict'; END IF;
    RETURN prior.result;
  END IF;
  -- Semantic conflict is P0001, never a transaction serialization retry.
  IF a.version IS DISTINCT FROM (p->>'expectedVersion')::integer OR latest IS DISTINCT FROM (p->>'expectedRevision')::integer OR
    p->>'riskLevel' IS NULL OR p->>'riskLevel' NOT IN ('unevaluated','none','low','medium','high') OR
    jsonb_typeof(p->'context') IS DISTINCT FROM 'string' OR length(p->>'context')>10000 THEN RAISE EXCEPTION 'admission_conflict'; END IF;
  INSERT INTO public.episode_private_record_versions(episode_id,patient_id,professional_user_id,revision,previous_revision,
    risk_level,professional_context,recording_kind,assignment_id,submission,authenticated_author_user_id,authenticated_session_version)
    VALUES(a.episode_id,a.patient_id,actor,latest+1,latest,p->>'riskLevel',p->>'context','authenticated_admission',a.id,a.latest_submission,actor,sv);
  -- Minimal concurrency receipt; no private values, author or dates.
  result:=jsonb_build_object('saved',true,'revision',latest+1);
  INSERT INTO public.admission_operations(actor_id,operation_id,fingerprint,result) VALUES(actor,(p->>'operationId')::uuid,p->>'fingerprint',result);
  RETURN result;
END $$;

-- Replaces only the current command; 014 remains byte-for-byte historical.
CREATE OR REPLACE FUNCTION admission_command(actor text,sv integer,op text,p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c jsonb; a public.admission_assignments%ROWTYPE; d public.admission_drafts%ROWTYPE; prior public.admission_operations%ROWTYPE; result jsonb; episode bigint; assignment uuid;
  consent text; name text; submitted integer; own_read boolean;
BEGIN
  IF op IN ('record','assess') THEN RETURN public.admission_record_command(actor,sv,op,p); END IF;
  IF op NOT IN ('prepare','assign','detail','summary','draft','accept','save','submit','correct','validate','revoke') THEN RAISE EXCEPTION 'admission_missing'; END IF;
  c:=public.admission_context(actor,sv,op,p);
  own_read:=coalesce((c->>'ownRead')::boolean,false);
  IF NOT own_read AND (NOT EXISTS(SELECT 1 FROM public.contact_verification_state WHERE user_id=c->>'account' AND channel='email' AND contact_digest=p->>'emailDigest') OR
     NOT EXISTS(SELECT 1 FROM public.contact_verification_state WHERE user_id=c->>'account' AND channel='sms' AND contact_digest=p->>'phoneDigest')) THEN RAISE EXCEPTION 'admission_missing'; END IF;
  IF op NOT IN ('prepare','assign') THEN
    SELECT * INTO a FROM public.admission_assignments WHERE id=(p->>'id')::uuid FOR UPDATE;
    IF NOT FOUND OR (a.state='revoked' AND NOT own_read) OR a.account_id IS DISTINCT FROM c->>'account' OR a.patient_id IS DISTINCT FROM c->>'patient' OR a.psychologist_id IS DISTINCT FROM c->>'psychologist' THEN RAISE EXCEPTION 'admission_missing'; END IF;
    episode:=a.episode_id;
  ELSE episode:=(p->>'episodeId')::bigint; END IF;
  IF NOT own_read AND op<>'prepare' AND NOT EXISTS(SELECT 1 FROM public.clinical_episodes e JOIN public.clinical_episode_participants cp ON cp.episode_id=e.id
    WHERE e.id=episode AND e.status='prepared' AND e.modality='individual' AND e.started_at IS NULL AND e.finalized_at IS NULL
      AND cp.patient_id=c->>'patient' AND cp.psychologist_user_id=c->>'psychologist' AND e.participant_two_id IS NULL) THEN RAISE EXCEPTION 'admission_missing'; END IF;
  IF (p->>'sessionExpiresAt') IS NULL OR (p->>'sessionExpiresAt')::double precision<=extract(epoch FROM clock_timestamp()) THEN RAISE EXCEPTION 'admission_session'; END IF;
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
    consent:='Ensayo ficticio: acepto responder la plantilla '||(p->>'templateId')||' para la asignación '||assignment::text||', episodio preparado '||episode::text||', y enviar explícitamente mis respuestas a '||name||'. Mi borrador es privado. Solo mis envíos serán visibles para este profesional mientras siga vigente esta autorización. Puedo retirarla y cualquiera puede cancelar esta admisión. Esto no inicia tratamiento ni autoriza acceso al expediente legacy. No acredita mínimos ni suficiencia clínica. Autorizo además que el profesional responsable lea y registre valoraciones privadas de riesgo y contexto para esta admisión, vinculadas a cada envío exacto. Solo ese profesional puede consultarlas mientras conserve esta autorización; no se muestran al paciente, terceros ni backoffice. Las valoraciones y sus revisiones se conservan sin eliminación automática. Al retirar el consentimiento o revocarse la admisión se bloquean nuevas lecturas, escrituras y replays profesionales; no se concede acceso archivado. La valoración es independiente de la validación de entrevista y no activa tratamiento.';
    INSERT INTO public.admission_assignments(id,agreement_id,episode_id,account_id,patient_id,psychologist_id,template_id,professional_name,consent_version,consent_text,consent_hash)
      VALUES(assignment,(p->>'agreementId')::uuid,episode,c->>'account',c->>'patient',actor,p->>'templateId',name,'fictional-admission-v2',consent,encode(sha256(convert_to(consent,'UTF8')),'hex'));
    result:=jsonb_build_object('id',assignment,'version',1,'state','proposed','episodeId',episode::text);
  ELSIF op='summary' THEN
    result:=jsonb_build_object('id',a.id,'episodeId',a.episode_id::text,'templateId',a.template_id,'professionalName',a.professional_name,'state',a.state,'version',a.version,'reviewState',a.review_state,'latestSubmission',a.latest_submission,'readOnly',own_read AND a.state='revoked');
  ELSIF op='detail' THEN
    result:=jsonb_build_object('id',a.id,'episodeId',a.episode_id::text,'template',(SELECT definition FROM public.admission_templates WHERE id=a.template_id),
      'professionalName',a.professional_name,'consentVersion',a.consent_version,'consentText',a.consent_text,'consentHash',a.consent_hash,
      'state',a.state,'version',a.version,'reviewState',a.review_state,'latestSubmission',a.latest_submission,'readOnly',own_read AND a.state='revoked',
      'submissions',coalesce((SELECT jsonb_agg(jsonb_build_object('number',s.number,'answers',s.answers,'submittedAt',s.submitted_at) ORDER BY s.number) FROM public.admission_submissions s WHERE s.assignment_id=a.id),'[]'::jsonb),
      'corrections',CASE WHEN own_read AND a.state='revoked' THEN '[]'::jsonb ELSE coalesce((SELECT jsonb_agg(jsonb_build_object('submission',r.submission,'message',r.message,'createdAt',r.created_at) ORDER BY r.submission) FROM public.admission_corrections r WHERE r.assignment_id=a.id),'[]'::jsonb) END,
      'validations',CASE WHEN own_read AND a.state='revoked' THEN '[]'::jsonb ELSE coalesce((SELECT jsonb_agg(jsonb_build_object('submission',v.submission,'episodeId',v.episode_id::text,'validatedAt',v.validated_at) ORDER BY v.submission) FROM public.admission_validations v WHERE v.assignment_id=a.id),'[]'::jsonb) END);
  ELSIF op='draft' AND own_read THEN
    IF a.state='proposed' THEN RAISE EXCEPTION 'admission_conflict'; END IF;
    SELECT * INTO d FROM public.admission_drafts WHERE assignment_id=a.id;
    result:=jsonb_build_object('revision',coalesce(d.revision,0),'answers',coalesce(d.answers,'{}'::jsonb));
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

DO $$ DECLARE admission_owner text; BEGIN
  SELECT proowner::regrole::text INTO admission_owner FROM pg_proc WHERE oid='public.admission_command(text,integer,text,jsonb)'::regprocedure;
  EXECUTE format('ALTER FUNCTION public.admission_record_command(text,integer,text,jsonb) OWNER TO %I',admission_owner);
  REVOKE ALL ON FUNCTION public.admission_record_command(text,integer,text,jsonb) FROM PUBLIC;
  EXECUTE format('GRANT SELECT,UPDATE(episode_id) ON public.episode_private_records TO %I',admission_owner);
  EXECUTE format('GRANT SELECT ON public.episode_private_record_versions TO %I',admission_owner);
  EXECUTE format('GRANT INSERT(episode_id,patient_id,professional_user_id,revision,previous_revision,risk_level,professional_context,recording_kind,assignment_id,submission,authenticated_author_user_id,authenticated_session_version) ON public.episode_private_record_versions TO %I',admission_owner);
END $$;
