-- Fictitious isolated catalog and care context. Historical evidence stays immutable.
DO $$
DECLARE relation_name text; populated boolean;
BEGIN
  IF current_setting('psicopanel.migration_target',true) IS DISTINCT FROM '021'
    OR current_database() !~ '^psicopanel_episode_[a-z0-9_]+$'
    OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN
    RAISE EXCEPTION '021 requires the explicit isolated provisioning runner';
  END IF;
  FOR relation_name IN SELECT tablename FROM pg_tables WHERE schemaname='public'
    AND tablename NOT IN ('psicopanel_schema_migrations','admission_templates','consultation_schedule_guard')
    ORDER BY tablename LOOP
    EXECUTE format('LOCK TABLE public.%I IN ACCESS EXCLUSIVE MODE',relation_name);
    EXECUTE format('SELECT EXISTS(SELECT FROM public.%I)',relation_name) INTO populated;
    IF populated THEN RAISE EXCEPTION '021 requires an empty isolated destination'; END IF;
  END LOOP;
END $$;

ALTER TABLE admission_templates DROP CONSTRAINT admission_templates_id_check,
  ADD CONSTRAINT admission_fictional_template_identity CHECK (
    id IN ('fictional-adult-v1','fictional-initial-interview-v1','fictional-daily-wellbeing-v1','fictional-personal-changes-v1')
    AND (definition->>'id' IS NOT DISTINCT FROM id)
    AND (definition->'version' IS NOT DISTINCT FROM '1'::jsonb));

INSERT INTO admission_templates (id,definition) VALUES
  ('fictional-initial-interview-v1',
   '{"id":"fictional-initial-interview-v1","version":1,"title":"Entrevista inicial general","description":"Prueba una conversación inicial sobre el motivo y las expectativas.","fictional":true,"notice":"Plantilla de prueba. Usa datos ficticios","questions":[{"id":"reason","label":"¿Qué te gustaría conversar en este espacio?","type":"text","required":true,"maxLength":1000},{"id":"personalContext","label":"¿Qué de tu situación actual te gustaría compartir?","type":"text","required":true,"maxLength":1000},{"id":"expectations","label":"¿Qué esperas de las primeras conversaciones?","type":"text","required":true,"maxLength":1000},{"id":"initialGoals","label":"¿Qué te gustaría trabajar primero?","type":"text","required":true,"maxLength":1000}]}'::jsonb),
  ('fictional-daily-wellbeing-v1',
   '{"id":"fictional-daily-wellbeing-v1","version":1,"title":"Estrés y bienestar cotidiano","description":"Prueba preguntas sobre rutina, descanso y recursos cotidianos.","fictional":true,"notice":"Plantilla de prueba. Usa datos ficticios","questions":[{"id":"stressors","label":"¿Qué situaciones te han generado estrés últimamente?","type":"text","required":true,"maxLength":1000},{"id":"dailyHabits","label":"¿Cómo es un día habitual para ti?","type":"text","required":true,"maxLength":1000},{"id":"rest","label":"¿Cómo describirías tu sueño y descanso?","type":"text","required":true,"maxLength":1000},{"id":"supports","label":"¿Qué personas o actividades te ayudan en días difíciles?","type":"text","required":true,"maxLength":1000}]}'::jsonb),
  ('fictional-personal-changes-v1',
   '{"id":"fictional-personal-changes-v1","version":1,"title":"Cambios personales y adaptación","description":"Prueba la documentación de transiciones y apoyo percibido.","fictional":true,"notice":"Plantilla de prueba. Usa datos ficticios","questions":[{"id":"recentChanges","label":"¿Qué cambios recientes te gustaría comentar?","type":"text","required":true,"maxLength":1000},{"id":"difficulties","label":"¿Qué se te ha hecho difícil durante esos cambios?","type":"text","required":true,"maxLength":1000},{"id":"supportNetwork","label":"¿Con quién o con qué recursos puedes contar?","type":"text","required":true,"maxLength":1000},{"id":"currentNeeds","label":"¿Qué apoyo necesitas ahora y qué te gustaría lograr?","type":"text","required":true,"maxLength":1000}]}'::jsonb);

ALTER TABLE admission_directed_versions DROP CONSTRAINT admission_directed_versions_declarations_check,
  ADD CHECK(jsonb_typeof(declarations)='object' AND octet_length(declarations::text)<=25000);



CREATE FUNCTION admission_responses_valid(template text, responses jsonb, complete boolean) RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public AS $$
DECLARE questions jsonb;
BEGIN
  IF jsonb_typeof(responses) IS DISTINCT FROM 'object' OR octet_length(responses::text)>25000 THEN
    RETURN false;
  END IF;
  SELECT definition->'questions' INTO questions FROM public.admission_templates WHERE id=template;
  IF NOT FOUND THEN RETURN false; END IF;
  RETURN NOT EXISTS (
    SELECT 1 FROM jsonb_each(responses) answer
    WHERE jsonb_typeof(answer.value)<>'string' OR NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(questions) question
      WHERE question->>'id'=answer.key AND length(answer.value#>>'{}')<=(question->>'maxLength')::integer
    )
  ) AND (NOT complete OR NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(questions) question
    WHERE question->'required'='true'::jsonb
      AND NOT coalesce((responses->>(question->>'id')) ~ '[^[:space:]]',false)
  ));
END $$;

CREATE FUNCTION admission_response_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE template text;
BEGIN
  SELECT template_id INTO template FROM public.admission_assignments WHERE id=NEW.assignment_id;
  IF NOT public.admission_responses_valid(template,NEW.answers,TG_TABLE_NAME='admission_submissions') THEN
    RAISE EXCEPTION 'admission_conflict';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER admission_draft_response_guard BEFORE INSERT OR UPDATE ON admission_drafts
  FOR EACH ROW EXECUTE FUNCTION admission_response_guard();
CREATE TRIGGER admission_submission_response_guard BEFORE INSERT ON admission_submissions
  FOR EACH ROW EXECUTE FUNCTION admission_response_guard();

-- The public command keeps the isolated LOGIN capability and reuses the same
-- context and contact checks for the agreement-scoped preparation reader.
CREATE INDEX admission_preparations_agreement ON admission_preparations(agreement_id,created_by);



CREATE OR REPLACE FUNCTION admission_directed_version_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE latest integer; BEGIN
  PERFORM id FROM public.admission_assignments WHERE id=NEW.assignment_id FOR UPDATE;
  SELECT coalesce(max(revision),0) INTO latest FROM public.admission_directed_versions WHERE assignment_id=NEW.assignment_id;
  IF NEW.previous_revision IS DISTINCT FROM latest OR NEW.revision IS DISTINCT FROM latest+1 OR
    NOT public.admission_responses_valid(NEW.template_id,NEW.declarations,true) THEN RAISE EXCEPTION 'admission_conflict'; END IF;
  NEW.recorded_at:=clock_timestamp(); RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION admission_directed_command(actor text,sv integer,op text,p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c jsonb; a public.admission_assignments%ROWTYPE; prior public.admission_operations%ROWTYPE;
  result jsonb; assignment uuid; consent text; name text; latest integer; next_document integer; pending uuid;
BEGIN
  IF op NOT IN ('assign-directed','detail','summary','accept','revoke','directed-attest','directed-document','directed-request','directed-resolve','directed-validate','directed-record','directed-assess') THEN RAISE EXCEPTION 'admission_missing'; END IF;
  c:=public.admission_context(actor,sv,CASE WHEN op='assign-directed' THEN 'assign' ELSE op END,p);
  IF NOT coalesce((c->>'ownRead')::boolean,false) AND
    (NOT EXISTS(SELECT 1 FROM public.contact_verification_state WHERE user_id=c->>'account' AND channel='email' AND contact_digest=p->>'emailDigest') OR
     NOT EXISTS(SELECT 1 FROM public.contact_verification_state WHERE user_id=c->>'account' AND channel='sms' AND contact_digest=p->>'phoneDigest')) THEN RAISE EXCEPTION 'admission_missing'; END IF;
  IF op<>'assign-directed' THEN
    SELECT * INTO a FROM public.admission_assignments WHERE id=(p->>'id')::uuid FOR UPDATE;
    IF NOT FOUND OR a.consent_version<>'fictional-directed-v1' OR a.account_id IS DISTINCT FROM c->>'account' OR
      a.patient_id IS DISTINCT FROM c->>'patient' OR a.psychologist_id IS DISTINCT FROM c->>'psychologist' OR
      (a.state='revoked' AND NOT coalesce((c->>'ownRead')::boolean,false)) THEN RAISE EXCEPTION 'admission_missing'; END IF;
  END IF;
  IF op IN ('accept','directed-request') AND (c->>'role'<>'patient' OR actor IS DISTINCT FROM c->>'account') OR
    op IN ('assign-directed','directed-attest','directed-document','directed-resolve','directed-validate','directed-record','directed-assess') AND
      (c->>'role'<>'psychologist' OR actor IS DISTINCT FROM c->>'psychologist') THEN RAISE EXCEPTION 'admission_missing'; END IF;
  IF NOT coalesce((c->>'ownRead')::boolean,false) AND NOT EXISTS(
    SELECT 1 FROM public.clinical_episodes e JOIN public.clinical_episode_participants cp ON cp.episode_id=e.id
    WHERE e.id=CASE WHEN op='assign-directed' THEN (p->>'episodeId')::bigint ELSE a.episode_id END
      AND ((e.status='prepared' AND e.started_at IS NULL) OR (op='summary' AND e.status='active'))
      AND e.modality='individual' AND e.participant_two_id IS NULL AND e.finalized_at IS NULL
      AND e.psychologist_user_id=c->>'psychologist' AND cp.patient_id=c->>'patient' AND cp.psychologist_user_id=c->>'psychologist') THEN RAISE EXCEPTION 'admission_missing'; END IF;
  IF (p->>'sessionExpiresAt') IS NULL OR (p->>'sessionExpiresAt')::double precision<=extract(epoch FROM clock_timestamp()) THEN RAISE EXCEPTION 'admission_session'; END IF;
  IF op='summary' THEN
    RETURN jsonb_build_object('id',a.id,'mode','directed','episodeId',a.episode_id::text,'templateId',a.template_id,'agreementId',a.agreement_id,'preparedAt',
      (SELECT created_at FROM public.admission_preparations WHERE episode_id=a.episode_id),
      'episodeStatus',CASE WHEN a.state<>'revoked' THEN (SELECT status FROM public.clinical_episodes WHERE id=a.episode_id) END,
      'professionalName',a.professional_name,'state',a.state,'version',a.version,'reviewState',a.directed_review,
      'latestDocument',a.latest_document,'readOnly',a.state='revoked');
  ELSIF op='detail' THEN
    RETURN jsonb_build_object('id',a.id,'mode','directed','episodeId',a.episode_id::text,'template',(SELECT definition FROM public.admission_templates WHERE id=a.template_id),
      'professionalName',a.professional_name,'consentVersion',a.consent_version,'consentText',a.consent_text,'consentHash',a.consent_hash,
      'state',a.state,'version',a.version,'reviewState',a.directed_review,'latestDocument',a.latest_document,'readOnly',a.state='revoked',
      'attestation',(SELECT jsonb_build_object('authorId',actor_id,'recordedAt',recorded_at) FROM public.admission_directed_attestations WHERE assignment_id=a.id),
      'documents',coalesce((SELECT jsonb_agg(jsonb_build_object('revision',revision,'declarations',declarations,'authorId',author_id,'subjectId',patient_id,
        'source','professional_directed_interview','recordedAt',recorded_at) ORDER BY revision) FROM public.admission_directed_versions WHERE assignment_id=a.id),'[]'::jsonb),
      'requests',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'documentRevision',r.document_revision,'reason',r.reason,'authorId',r.actor_id,'recordedAt',r.recorded_at,
        'resolution',(SELECT jsonb_build_object('decision',d.decision,'explanation',d.explanation,'documentRevision',d.resulting_revision,'authorId',d.actor_id,'recordedAt',d.recorded_at)
          FROM public.admission_directed_resolutions d WHERE d.request_id=r.id)) ORDER BY r.recorded_at) FROM public.admission_directed_requests r WHERE r.assignment_id=a.id),'[]'::jsonb),
      'validations',coalesce((SELECT jsonb_agg(jsonb_build_object('documentRevision',document_revision,'authorId',actor_id,'recordedAt',recorded_at) ORDER BY recorded_at)
        FROM public.admission_directed_validations WHERE assignment_id=a.id),'[]'::jsonb));
  END IF;
  IF op NOT IN ('assign-directed','accept','revoke') AND (a.state<>'accepted' OR NOT EXISTS(
    SELECT 1 FROM public.admission_consents WHERE assignment_id=a.id AND actor_id=a.account_id AND consent_version=a.consent_version AND consent_hash=a.consent_hash)) THEN RAISE EXCEPTION 'admission_missing'; END IF;
  IF op IN ('directed-record','directed-assess') THEN
    IF a.latest_document=0 THEN RAISE EXCEPTION 'admission_missing'; END IF;
    PERFORM episode_id FROM public.episode_private_records WHERE episode_id=a.episode_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'admission_missing'; END IF;
    SELECT max(revision) INTO latest FROM public.episode_private_record_versions WHERE episode_id=a.episode_id;
  END IF;
  -- Expiration must be checked after every potentially blocking resource lock.
  IF (p->>'sessionExpiresAt') IS NULL OR (p->>'sessionExpiresAt')::double precision<=extract(epoch FROM clock_timestamp()) THEN RAISE EXCEPTION 'admission_session'; END IF;
  IF op='directed-record' THEN
    RETURN jsonb_build_object('episodeId',a.episode_id::text,'version',a.version,'expectedRevision',latest,'documentRevision',a.latest_document,
      'canAssess',a.directed_review IN ('documented','validated'),
      'current',(SELECT jsonb_build_object('revision',v.revision,'documentRevision',v.directed_revision,'riskLevel',v.risk_level,'context',v.professional_context,
        'authorId',v.authenticated_author_user_id,'recordedAt',v.recorded_at) FROM public.episode_private_record_versions v
        WHERE v.episode_id=a.episode_id AND v.assignment_id=a.id AND v.directed_revision=a.latest_document AND v.recording_kind='authenticated_directed_admission' ORDER BY v.revision DESC LIMIT 1),
      'history',coalesce((SELECT jsonb_agg(jsonb_build_object('revision',v.revision,'documentRevision',v.directed_revision,'riskLevel',v.risk_level,
        'context',v.professional_context,'authorId',v.authenticated_author_user_id,'recordedAt',v.recorded_at) ORDER BY v.revision DESC)
        FROM public.episode_private_record_versions v WHERE v.episode_id=a.episode_id AND v.assignment_id=a.id AND v.recording_kind='authenticated_directed_admission'),'[]'::jsonb));
  END IF;
  IF p->'confirmed' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'admission_conflict'; END IF;
  SELECT * INTO prior FROM public.admission_operations WHERE actor_id=actor AND operation_id=(p->>'operationId')::uuid;
  IF FOUND THEN
    IF prior.fingerprint IS DISTINCT FROM p->>'fingerprint' OR
      (op='assign-directed' AND NOT EXISTS(SELECT 1 FROM public.admission_assignments WHERE id=(prior.result->>'id')::uuid AND state<>'revoked')) OR
      (op NOT IN ('assign-directed','revoke') AND a.version IS DISTINCT FROM (prior.result->>'version')::integer) OR
      (op='directed-assess' AND latest IS DISTINCT FROM (prior.result->>'revision')::integer) THEN RAISE EXCEPTION 'admission_conflict'; END IF;
    RETURN prior.result;
  END IF;
  IF op NOT IN ('assign-directed','revoke') AND a.version IS DISTINCT FROM (p->>'expectedVersion')::integer THEN RAISE EXCEPTION 'admission_conflict'; END IF;
  IF op='assign-directed' THEN
    IF NOT EXISTS(SELECT 1 FROM public.admission_preparations WHERE episode_id=(p->>'episodeId')::bigint AND agreement_id=(p->>'agreementId')::uuid AND created_by=actor) OR
      NOT EXISTS(SELECT 1 FROM public.admission_templates WHERE id=p->>'templateId') OR EXISTS(SELECT 1 FROM public.admission_assignments WHERE episode_id=(p->>'episodeId')::bigint) THEN RAISE EXCEPTION 'admission_conflict'; END IF;
    assignment:=(p->>'newId')::uuid;
    SELECT btrim(first_name||' '||coalesce(last_name,'')) INTO name FROM public.users WHERE id=actor;
    consent:='Ensayo ficticio de entrevista individual dirigida. Profesional responsable: '||name||'. Esta entrevista usa la plantilla '||(SELECT definition->>'title' FROM public.admission_templates WHERE id=p->>'templateId')||' (versión 1). Acepto que este profesional realice la entrevista, declare su realización y documente mis declaraciones. El autor de la documentación es el profesional: no son respuestas escritas, enviadas ni ratificadas por mí. Cada versión que incorpore será visible para mí y para este profesional mientras mantenga permiso; no hay segunda publicación. Los borradores profesionales no incorporados no son visibles. Puedo consultar versiones incorporadas y solicitar rectificación motivada, que el profesional aceptará incorporando otra versión o rechazará con explicación; se conserva el original y la decisión. Autorizo valoraciones privadas de riesgo y contexto por versión exacta: solo el responsable autorizado las consulta, nunca se muestran automáticamente al paciente, terceros o backoffice. Puedo retirar el consentimiento y cualquiera de las partes puede cancelar la admisión. La revocación impide nuevas lecturas, escrituras y reintentos profesionales, sin archivo profesional implícito ni borrado automático. Conservo consulta autenticada de las versiones incorporadas y las correcciones destinadas a mí. Se conservan versiones, autoría y fechas; ARCO, custodia y retención jurídica siguen sus procesos separados. No autoriza expediente general, otros episodios, tratamiento, citas ni notas ordinarias; no acredita identidad física, asistencia por aceptar ni mínimos clínicos reales.';
    INSERT INTO public.admission_assignments(id,agreement_id,episode_id,account_id,patient_id,psychologist_id,template_id,professional_name,consent_version,consent_text,consent_hash,directed_review)
      VALUES(assignment,(p->>'agreementId')::uuid,(p->>'episodeId')::bigint,c->>'account',c->>'patient',actor,p->>'templateId',name,'fictional-directed-v1',consent,encode(sha256(convert_to(consent,'UTF8')),'hex'),'awaiting_document');
    result:=jsonb_build_object('id',assignment,'episodeId',p->>'episodeId','state','proposed','version',1);
  ELSIF op='accept' THEN
    IF a.state<>'proposed' OR p->>'consentHash' IS DISTINCT FROM a.consent_hash OR p->>'consentVersion' IS DISTINCT FROM a.consent_version THEN RAISE EXCEPTION 'admission_conflict'; END IF;
    INSERT INTO public.admission_consents(assignment_id,actor_id,consent_version,consent_hash) VALUES(a.id,actor,a.consent_version,a.consent_hash);
    UPDATE public.admission_assignments SET state='accepted',accepted_at=clock_timestamp(),version=version+1 WHERE id=a.id;
    result:=jsonb_build_object('id',a.id,'state','accepted','version',a.version+1);
  ELSIF op='revoke' THEN
    UPDATE public.admission_assignments SET state='revoked',revoked_at=clock_timestamp(),version=version+1 WHERE id=a.id;
    result:=jsonb_build_object('id',a.id,'state','revoked');
  ELSIF op='directed-attest' THEN
    IF EXISTS(SELECT 1 FROM public.admission_directed_attestations WHERE assignment_id=a.id) THEN RAISE EXCEPTION 'admission_conflict'; END IF;
    INSERT INTO public.admission_directed_attestations(assignment_id,actor_id,session_version) VALUES(a.id,actor,sv);
    UPDATE public.admission_assignments SET version=version+1 WHERE id=a.id;
    result:=jsonb_build_object('saved',true,'version',a.version+1);
  ELSIF op IN ('directed-document','directed-resolve') THEN
    IF a.latest_document IS DISTINCT FROM (p->>'expectedDocumentRevision')::integer THEN RAISE EXCEPTION 'admission_conflict'; END IF;
    IF op='directed-document' AND a.latest_document<>0 THEN RAISE EXCEPTION 'admission_conflict'; END IF;
    IF op='directed-resolve' THEN
      SELECT r.id INTO pending FROM public.admission_directed_requests r WHERE r.assignment_id=a.id AND r.id=(p->>'requestId')::uuid
        AND NOT EXISTS(SELECT 1 FROM public.admission_directed_resolutions d WHERE d.request_id=r.id);
      IF pending IS NULL OR p->>'decision' IS NULL OR p->>'decision' NOT IN ('accept','reject') OR
        length(btrim(coalesce(p->>'explanation',''))) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'admission_conflict'; END IF;
    END IF;
    next_document:=a.latest_document;
    IF op='directed-document' OR p->>'decision'='accept' THEN
      IF NOT EXISTS(SELECT 1 FROM public.admission_directed_attestations WHERE assignment_id=a.id) THEN RAISE EXCEPTION 'admission_conflict'; END IF;
      next_document:=a.latest_document+1;
      INSERT INTO public.admission_directed_versions(assignment_id,revision,previous_revision,episode_id,patient_id,psychologist_id,template_id,author_id,session_version,declarations)
        VALUES(a.id,next_document,a.latest_document,a.episode_id,a.patient_id,actor,a.template_id,actor,sv,p->'declarations');
    END IF;
    IF op='directed-resolve' THEN
      INSERT INTO public.admission_directed_resolutions(request_id,assignment_id,actor_id,decision,explanation,resulting_revision)
        VALUES(pending,a.id,actor,p->>'decision',p->>'explanation',next_document);
    END IF;
    UPDATE public.admission_assignments SET latest_document=next_document,directed_review='documented',version=version+1 WHERE id=a.id;
    result:=jsonb_build_object('saved',true,'documentRevision',next_document,'version',a.version+1);
  ELSIF op='directed-request' THEN
    IF EXISTS(SELECT 1 FROM public.admission_directed_requests r WHERE r.assignment_id=a.id AND NOT EXISTS(SELECT 1 FROM public.admission_directed_resolutions d WHERE d.request_id=r.id)) OR
      NOT EXISTS(SELECT 1 FROM public.admission_directed_versions WHERE assignment_id=a.id AND revision=(p->>'documentRevision')::integer) OR
      length(btrim(coalesce(p->>'reason',''))) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'admission_conflict'; END IF;
    INSERT INTO public.admission_directed_requests(id,assignment_id,document_revision,actor_id,reason)
      VALUES((p->>'operationId')::uuid,a.id,(p->>'documentRevision')::integer,actor,p->>'reason');
    UPDATE public.admission_assignments SET directed_review='correction_requested',version=version+1 WHERE id=a.id;
    result:=jsonb_build_object('saved',true,'requestId',p->>'operationId','version',a.version+1);
  ELSIF op IN ('directed-validate','directed-assess') THEN
    IF a.latest_document=0 OR a.latest_document IS DISTINCT FROM (p->>'documentRevision')::integer OR
      a.episode_id::text IS DISTINCT FROM p->>'episodeId' OR a.directed_review NOT IN ('documented','validated') THEN RAISE EXCEPTION 'admission_conflict'; END IF;
    IF op='directed-validate' THEN
      IF a.directed_review<>'documented' THEN RAISE EXCEPTION 'admission_conflict'; END IF;
      INSERT INTO public.admission_directed_validations(id,assignment_id,document_revision,actor_id,session_version)
        VALUES((p->>'operationId')::uuid,a.id,a.latest_document,actor,sv);
      UPDATE public.admission_assignments SET directed_review='validated',version=version+1 WHERE id=a.id;
      result:=jsonb_build_object('saved',true,'documentRevision',a.latest_document,'version',a.version+1);
    ELSE
      IF latest IS DISTINCT FROM (p->>'expectedRevision')::integer OR p->>'riskLevel' IS NULL OR p->>'riskLevel' NOT IN ('unevaluated','none','low','medium','high') OR
        jsonb_typeof(p->'context') IS DISTINCT FROM 'string' OR length(p->>'context')>10000 THEN RAISE EXCEPTION 'admission_conflict'; END IF;
      INSERT INTO public.episode_private_record_versions(episode_id,patient_id,professional_user_id,revision,previous_revision,risk_level,professional_context,
        recording_kind,assignment_id,directed_revision,authenticated_author_user_id,authenticated_session_version)
        VALUES(a.episode_id,a.patient_id,actor,latest+1,latest,p->>'riskLevel',p->>'context','authenticated_directed_admission',a.id,a.latest_document,actor,sv);
      result:=jsonb_build_object('saved',true,'revision',latest+1,'version',a.version);
    END IF;
  END IF;
  IF result IS NULL THEN RAISE EXCEPTION 'admission_missing'; END IF;
  INSERT INTO public.admission_operations(actor_id,operation_id,fingerprint,result) VALUES(actor,(p->>'operationId')::uuid,p->>'fingerprint',result);
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION admission_command(actor text,sv integer,op text,p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c jsonb; a public.admission_assignments%ROWTYPE; d public.admission_drafts%ROWTYPE; prior public.admission_operations%ROWTYPE; result jsonb; episode bigint; assignment uuid;
  consent text; name text; submitted integer; own_read boolean;
BEGIN
  IF op='care-context' THEN
    RETURN public.admission_care_context(actor,sv,p);
  END IF;
  IF op IN ('care-start','care-send','care-register') THEN
    RETURN public.admission_care_command(actor,sv,op,p);
  END IF;
  IF op='templates' THEN
    PERFORM public.admission_candidates(actor,sv,(p->>'sessionExpiresAt')::double precision);
    IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=actor AND role='psychologist') THEN
      RAISE EXCEPTION 'admission_missing';
    END IF;
    RETURN (SELECT jsonb_agg(definition ORDER BY CASE id
      WHEN 'fictional-initial-interview-v1' THEN 1 WHEN 'fictional-daily-wellbeing-v1' THEN 2 ELSE 3 END)
      FROM public.admission_templates WHERE id<>'fictional-adult-v1');
  END IF;
  IF op LIKE 'directed-%' OR op='assign-directed' OR EXISTS(SELECT 1 FROM public.admission_assignments WHERE id=(p->>'id')::uuid AND consent_version='fictional-directed-v1') THEN
    RETURN public.admission_directed_command(actor,sv,op,p);
  END IF;
  IF op IN ('record','assess') THEN RETURN public.admission_record_command(actor,sv,op,p); END IF;
  IF op NOT IN ('prepare','prepare-current','preparations','assign','detail','summary','draft','accept','save','submit','correct','validate','revoke') THEN RAISE EXCEPTION 'admission_missing'; END IF;
  c:=public.admission_context(actor,sv,CASE WHEN op IN ('prepare-current','preparations') THEN 'prepare' ELSE op END,p);
  own_read:=coalesce((c->>'ownRead')::boolean,false);
  IF NOT own_read AND (NOT EXISTS(SELECT 1 FROM public.contact_verification_state WHERE user_id=c->>'account' AND channel='email' AND contact_digest=p->>'emailDigest') OR
     NOT EXISTS(SELECT 1 FROM public.contact_verification_state WHERE user_id=c->>'account' AND channel='sms' AND contact_digest=p->>'phoneDigest')) THEN RAISE EXCEPTION 'admission_missing'; END IF;
  -- The same advisory barrier covers reads, preparation/assignment and revocation.
  IF op='preparations' THEN
    RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('episodeId',pr.episode_id::text,
        'agreementId',pr.agreement_id,'preparedAt',pr.created_at) ORDER BY pr.created_at DESC,pr.episode_id DESC)
      FROM public.admission_preparations pr
      JOIN public.clinical_episodes e ON e.id=pr.episode_id
      JOIN public.clinical_episode_participants cp ON cp.episode_id=e.id
      WHERE pr.agreement_id=(p->>'agreementId')::uuid AND pr.created_by=actor
        AND e.status='prepared' AND e.modality='individual' AND e.participant_two_id IS NULL
        AND e.started_at IS NULL AND e.finalized_at IS NULL AND e.psychologist_user_id=actor
        AND cp.patient_id=c->>'patient' AND cp.psychologist_user_id=actor
        AND NOT EXISTS(SELECT 1 FROM public.admission_assignments x WHERE x.episode_id=pr.episode_id)), '[]'::jsonb);
  END IF;
  IF op NOT IN ('prepare','prepare-current','assign') THEN
    SELECT * INTO a FROM public.admission_assignments WHERE id=(p->>'id')::uuid FOR UPDATE;
    IF NOT FOUND OR (a.state='revoked' AND NOT own_read) OR a.account_id IS DISTINCT FROM c->>'account' OR a.patient_id IS DISTINCT FROM c->>'patient' OR a.psychologist_id IS DISTINCT FROM c->>'psychologist' THEN RAISE EXCEPTION 'admission_missing'; END IF;
    episode:=a.episode_id;
  ELSE episode:=(p->>'episodeId')::bigint; END IF;
  IF NOT own_read AND op NOT IN ('prepare','prepare-current') AND NOT EXISTS(SELECT 1 FROM public.clinical_episodes e JOIN public.clinical_episode_participants cp ON cp.episode_id=e.id
    WHERE e.id=episode AND ((e.status='prepared' AND e.started_at IS NULL) OR (op='summary' AND e.status='active'))
      AND e.modality='individual' AND e.finalized_at IS NULL
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
    IF op NOT IN ('prepare','prepare-current','assign','revoke') AND a.version IS DISTINCT FROM (p->>'expectedVersion')::integer THEN RAISE EXCEPTION 'admission_conflict'; END IF;
  END IF;
  IF op IN ('prepare','prepare-current') THEN
    IF op='prepare-current' AND EXISTS (
      SELECT 1 FROM public.admission_preparations pr
      WHERE pr.agreement_id=(p->>'agreementId')::uuid AND pr.created_by=actor
        AND NOT EXISTS(SELECT 1 FROM public.admission_assignments x WHERE x.episode_id=pr.episode_id)
    ) THEN RAISE EXCEPTION 'admission_conflict'; END IF;
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
    consent:='Ensayo ficticio: acepto la modalidad autoadministrada y responder la plantilla '||
      (SELECT definition->>'title' FROM public.admission_templates WHERE id=p->>'templateId')||' (versión 1) para esta atención y enviar explícitamente mis respuestas a '||name||'. Mi borrador es privado. Solo mis envíos serán visibles para este profesional mientras siga vigente esta autorización. Puedo retirarla y cualquiera puede cancelar esta admisión. Esto no inicia tratamiento ni autoriza acceso al expediente legacy. No acredita mínimos ni suficiencia clínica. Autorizo además que el profesional responsable lea y registre valoraciones privadas de riesgo y contexto para esta admisión, vinculadas a cada envío exacto. Solo ese profesional puede consultarlas mientras conserve esta autorización; no se muestran al paciente, terceros ni backoffice. Las valoraciones y sus revisiones se conservan sin eliminación automática. Al retirar el consentimiento o revocarse la admisión se bloquean nuevas lecturas, escrituras y replays profesionales; no se concede acceso archivado. La valoración es independiente de la validación de entrevista y no activa tratamiento.';
    INSERT INTO public.admission_assignments(id,agreement_id,episode_id,account_id,patient_id,psychologist_id,template_id,professional_name,consent_version,consent_text,consent_hash)
      VALUES(assignment,(p->>'agreementId')::uuid,episode,c->>'account',c->>'patient',actor,p->>'templateId',name,'fictional-admission-v2',consent,encode(sha256(convert_to(consent,'UTF8')),'hex'));
    result:=jsonb_build_object('id',assignment,'version',1,'state','proposed','episodeId',episode::text);
  ELSIF op='summary' THEN
    result:=jsonb_build_object('id',a.id,'episodeId',a.episode_id::text,'templateId',a.template_id,'agreementId',a.agreement_id,'preparedAt',
      (SELECT created_at FROM public.admission_preparations WHERE episode_id=a.episode_id),
      'episodeStatus',CASE WHEN a.state<>'revoked' THEN (SELECT status FROM public.clinical_episodes WHERE id=a.episode_id) END,'professionalName',a.professional_name,'state',a.state,'version',a.version,'reviewState',a.review_state,'latestSubmission',a.latest_submission,'readOnly',own_read AND a.state='revoked');
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
        NOT public.admission_responses_valid(a.template_id,p->'answers',false) THEN RAISE EXCEPTION 'admission_conflict'; END IF;
      INSERT INTO public.admission_drafts(assignment_id,revision,answers) VALUES(a.id,coalesce(d.revision,0)+1,p->'answers')
        ON CONFLICT(assignment_id) DO UPDATE SET revision=excluded.revision,answers=excluded.answers;
      result:=jsonb_build_object('revision',coalesce(d.revision,0)+1);
    ELSIF op='submit' THEN
      IF a.review_state NOT IN ('awaiting_submission','correction_requested') OR d.revision IS DISTINCT FROM (p->>'expectedRevision')::integer OR
        NOT public.admission_responses_valid(a.template_id,d.answers,true) THEN RAISE EXCEPTION 'admission_conflict'; END IF;
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

-- A new review of the same directed document after a rejected correction
-- must not revive an earlier sufficiency or the treatment consent it supported.
ALTER TABLE consultation_sufficiency
  ADD COLUMN assignment_version integer NOT NULL CHECK (assignment_version > 0),
  DROP CONSTRAINT consultation_sufficiency_assignment_id_submission_key,
  DROP CONSTRAINT consultation_sufficiency_assignment_id_directed_revision_key,
  ADD UNIQUE (assignment_id, submission, assignment_version),
  ADD UNIQUE (assignment_id, directed_revision, assignment_version);

CREATE OR REPLACE FUNCTION admission_consultation(actor text, sv integer, op text, p jsonb) RETURNS jsonb
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
  selected_template_version text;
  day date;
  begins time;
  terms text;
  terms_version constant text := 'fictional-first-consultation-v1';
  criteria_revision constant text := 'fictional-sufficiency-v1';
  stamp timestamptz;
  private_note jsonb;
BEGIN
  IF op NOT IN ('status','summary','interview','care-review','sufficiency','consent','withdraw','revoke-admission','activate','book','complete','note') THEN
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
    OR (op IN ('interview','care-review','sufficiency','activate','book','complete','note') AND actor_is_patient) THEN
    RAISE EXCEPTION 'admission_missing';
  END IF;
  IF op<>'withdraw' AND (
    NOT EXISTS (SELECT 1 FROM public.contact_verification_state v WHERE v.user_id=a.account_id
      AND v.channel='email' AND v.contact_digest=p->>'emailDigest')
    OR NOT EXISTS (SELECT 1 FROM public.contact_verification_state v WHERE v.user_id=a.account_id
      AND v.channel='sms' AND v.contact_digest=p->>'phoneDigest')
  ) THEN RAISE EXCEPTION 'admission_missing'; END IF;
  SELECT * INTO e FROM public.clinical_episodes WHERE id=a.episode_id AND modality='individual'
    AND participant_one_id=a.patient_id AND psychologist_user_id=a.psychologist_id
    AND participant_two_id IS NULL AND finalized_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'admission_missing'; END IF;

  IF op='care-review' THEN
    RETURN public.admission_care_command(actor,sv,op,p);
  END IF;
  IF e.status='active' THEN
    SELECT c.* INTO consent FROM public.consultation_activations x
    JOIN public.consultation_consents c ON c.id=x.consent_id
    WHERE x.episode_id=e.id AND c.assignment_id=a.id;
    SELECT * INTO proof FROM public.consultation_sufficiency WHERE id=consent.sufficiency_id;
  ELSE
    SELECT t.definition->>'version' INTO selected_template_version FROM public.admission_templates t WHERE t.id=a.template_id;
    IF a.state='accepted' AND selected_template_version='1'
      AND EXISTS(SELECT 1 FROM public.admission_consents c WHERE c.assignment_id=a.id AND c.actor_id=a.account_id
        AND c.consent_hash=a.consent_hash AND c.consent_version=a.consent_version) THEN
      IF a.consent_version='fictional-directed-v1' AND a.directed_review='validated' AND EXISTS (
        SELECT 1 FROM public.admission_directed_validations v
        JOIN public.admission_directed_versions d ON d.assignment_id=v.assignment_id AND d.revision=v.document_revision
        WHERE d.episode_id=e.id AND d.template_id=a.template_id AND d.patient_id=a.patient_id
          AND d.author_id=a.psychologist_id AND public.admission_responses_valid(a.template_id,d.declarations,true) AND v.assignment_id=a.id AND v.document_revision=a.latest_document AND v.actor_id=a.psychologist_id
      ) THEN
        doc:=a.latest_document; mode:='directed';
      ELSIF a.consent_version='fictional-admission-v2' AND a.review_state='validated' AND EXISTS (
        SELECT 1 FROM public.admission_validations v
        JOIN public.admission_submissions d ON d.assignment_id=v.assignment_id AND d.number=v.submission
        WHERE d.episode_id=e.id AND d.template_id=a.template_id AND d.author_id=a.account_id
          AND public.admission_responses_valid(a.template_id,d.answers,true) AND v.assignment_id=a.id AND v.submission=a.latest_submission AND v.actor_id=a.psychologist_id
          AND v.episode_id=e.id AND v.patient_id=a.patient_id AND v.template_id=a.template_id
      ) THEN
        doc:=a.latest_submission; mode:='self';
      END IF;
    END IF;
    IF doc IS NOT NULL THEN
      SELECT * INTO proof FROM public.consultation_sufficiency s WHERE s.assignment_id=a.id
        AND s.template_id=a.template_id AND s.template_version=selected_template_version::integer
        AND s.assignment_version=a.version
        AND (mode='directed' AND s.directed_revision=doc OR mode='self' AND s.submission=doc);
      SELECT * INTO consent FROM public.consultation_consents c WHERE c.sufficiency_id=proof.id;
    END IF;
  END IF;
  accepted:=consent.id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.consultation_withdrawals w WHERE w.consent_id=consent.id
  );
  live:=e.status='active' AND accepted AND a.state='accepted';
  IF op='interview' THEN
    IF NOT live OR proof.id IS NULL OR proof.assignment_version<>a.version OR NOT EXISTS (
      SELECT 1 FROM public.admission_consents c WHERE c.assignment_id=a.id AND c.actor_id=a.account_id
        AND c.consent_hash=a.consent_hash AND c.consent_version=a.consent_version
    ) THEN RAISE EXCEPTION 'admission_missing'; END IF;
    IF proof.directed_revision IS NOT NULL THEN
      SELECT jsonb_build_object('answers',d.declarations,'recordedAt',d.recorded_at,'authorName',a.professional_name)
      INTO private_note FROM public.admission_directed_versions d
      WHERE d.assignment_id=a.id AND d.episode_id=e.id AND d.revision=proof.directed_revision
        AND d.revision=a.latest_document AND a.directed_review='validated' AND d.template_id=a.template_id
        AND d.patient_id=a.patient_id AND d.author_id=actor;
    ELSE
      SELECT jsonb_build_object('answers',d.answers,'recordedAt',d.submitted_at,'authorName',btrim(u.first_name||' '||coalesce(u.last_name,'')))
      INTO private_note FROM public.admission_submissions d JOIN public.users u ON u.id=d.author_id
      WHERE d.assignment_id=a.id AND d.episode_id=e.id AND d.number=proof.submission
        AND d.number=a.latest_submission AND a.review_state='validated' AND d.template_id=a.template_id
        AND d.patient_id=a.patient_id AND d.author_id=a.account_id;
    END IF;
    IF private_note IS NULL THEN RAISE EXCEPTION 'admission_missing'; END IF;
    IF (p->>'sessionExpiresAt')::double precision<=extract(epoch FROM clock_timestamp()) THEN
      RAISE EXCEPTION 'admission_session';
    END IF;
    RETURN private_note || jsonb_build_object('template',(SELECT definition FROM public.admission_templates WHERE id=a.template_id));
  END IF;
  terms:='Ensayo ficticio individual. Autorizo iniciar tratamiento con '
    ||a.professional_name||'. El alcance es una cita de 60 minutos y una nota privada '

    ||'de autoría profesional. Puedo retirar este consentimiento; la nota y su procedencia se conservan.';
  IF op NOT IN ('status','summary') AND p->'confirmed' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'admission_conflict'; END IF;
  IF op='sufficiency' THEN
    IF e.status<>'prepared' OR doc IS NULL OR p->>'assignmentVersion' IS DISTINCT FROM a.version::text
      OR p->>'documentVersion' IS DISTINCT FROM doc::text OR p->>'criteriaVersion' IS DISTINCT FROM criteria_revision THEN
      RAISE EXCEPTION 'admission_conflict';
    END IF;
    INSERT INTO public.consultation_sufficiency(assignment_id,episode_id,patient_id,author_id,template_id,
      criteria_version,template_version,assignment_version,submission,directed_revision)
      VALUES(a.id,e.id,a.patient_id,actor,a.template_id,criteria_revision,selected_template_version::integer,a.version,CASE WHEN mode='self' THEN doc END,
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
    IF live AND actor_is_patient THEN
      SELECT * INTO slot FROM public.consultation_appointments WHERE episode_id=e.id;
    END IF;
    RETURN jsonb_build_object('id',a.id,'episodeId',e.id::text,'professionalName',a.professional_name,
      'status',CASE WHEN e.status='active' AND NOT live THEN 'withdrawn' ELSE e.status END,
      'documentVersion',doc,'sufficiencyConfirmed',proof.id IS NOT NULL,
      'consentAccepted',accepted,'consentWithdrawn',consent.id IS NOT NULL AND NOT accepted,
      'appointment',CASE WHEN slot.id IS NOT NULL THEN jsonb_build_object(
        'date',slot.scheduled_date,'time',to_char(slot.scheduled_time,'HH24:MI'),
        'status',slot.status,'durationMinutes',slot.duration_minutes) END);
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


-- Safe labels for the exact patient-owned consent, even during suspension.
CREATE OR REPLACE FUNCTION public.admission_withdrawal_references(actor text, sv integer, expires double precision)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE subject text; references_list jsonb;
BEGIN
  SELECT u.patient_id INTO subject FROM public.users u
  WHERE u.id=actor AND u.role='patient' AND u.is_active AND u.session_version=sv
  FOR NO KEY UPDATE;
  IF subject IS NULL THEN RAISE EXCEPTION 'admission_missing'; END IF;
  IF expires IS NULL OR expires<=extract(epoch FROM clock_timestamp()) THEN
    RAISE EXCEPTION 'admission_session';
  END IF;

  SELECT coalesce((
    SELECT jsonb_agg(jsonb_build_object('assignmentId',a.id,'episodeId',a.episode_id::text,'consentId',c.id,
      'preparedAt',pr.created_at,'professionalName',a.professional_name)
      ORDER BY a.episode_id)
    FROM public.admission_assignments a
    JOIN public.admission_preparations pr ON pr.episode_id=a.episode_id AND pr.agreement_id=a.agreement_id
    JOIN public.consultation_consents c ON c.assignment_id=a.id AND c.episode_id=a.episode_id AND c.account_id=a.account_id
    JOIN public.consultation_sufficiency s ON s.id=c.sufficiency_id AND s.assignment_id=a.id AND s.episode_id=a.episode_id
    JOIN public.clinical_episodes e ON e.id=a.episode_id
    WHERE a.account_id=actor AND a.patient_id=subject
      AND (EXISTS (SELECT 1 FROM public.consultation_activations x WHERE x.consent_id=c.id AND x.episode_id=e.id)
        OR (e.status='prepared' AND (
          s.assignment_version=a.version-CASE WHEN a.state='revoked' THEN 1 ELSE 0 END
          AND (s.submission=a.latest_submission OR s.directed_revision=a.latest_document))))
      AND NOT EXISTS (SELECT 1 FROM public.consultation_withdrawals w WHERE w.consent_id=c.id)
  ),'[]'::jsonb) INTO references_list;
  IF expires<=extract(epoch FROM clock_timestamp()) THEN RAISE EXCEPTION 'admission_session'; END IF;
  RETURN references_list;
END $$;

-- Lock once and reuse the existing per-assignment projection. The patient
-- reads their own retained contributions even if the agreement is no longer live.
CREATE FUNCTION admission_care_context(actor text, sv integer, p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  typed_role text;
  candidate uuid;
  found_count integer:=0;
  assignments jsonb:='[]'::jsonb;
  preparations jsonb;
BEGIN
  SELECT role INTO typed_role FROM public.users WHERE id=actor AND is_active AND session_version=sv;
  IF NOT FOUND THEN RAISE EXCEPTION 'admission_session'; END IF;
  IF typed_role='psychologist' THEN
    preparations:=public.admission_command(actor,sv,'preparations',p);
  ELSIF typed_role='patient' THEN
    PERFORM id FROM public.users WHERE id=actor AND role='patient' AND is_active AND session_version=sv FOR NO KEY UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'admission_session'; END IF;
  ELSE
    RAISE EXCEPTION 'admission_missing';
  END IF;
  IF coalesce((p->>'sessionExpiresAt')::double precision,0)<=extract(epoch FROM clock_timestamp()) THEN
    RAISE EXCEPTION 'admission_session';
  END IF;
  FOR candidate IN
    SELECT a.id FROM public.admission_assignments a JOIN public.users u ON u.id=actor
    WHERE a.agreement_id=(p->>'agreementId')::uuid AND (
      (typed_role='patient' AND a.account_id=actor AND a.patient_id=u.patient_id)
      OR (typed_role='psychologist' AND a.psychologist_id=actor AND a.state<>'revoked')
    ) ORDER BY a.created_at DESC,a.id LIMIT 101
  LOOP
    found_count:=found_count+1;
    IF found_count>100 THEN RAISE EXCEPTION 'admission_context_limit'; END IF;
    BEGIN
      assignments:=assignments||jsonb_build_array(public.admission_command(actor,sv,'summary',p||jsonb_build_object('id',candidate)));
    EXCEPTION WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM<>'admission_missing' THEN RAISE; END IF;
    END;
  END LOOP;
  IF (p->>'sessionExpiresAt')::double precision<=extract(epoch FROM clock_timestamp()) THEN
    RAISE EXCEPTION 'admission_session';
  END IF;
  RETURN jsonb_build_object('assignments',assignments)
    || CASE WHEN typed_role='psychologist' THEN jsonb_build_object('preparations',preparations,
      'templates',public.admission_command(actor,sv,'templates',p)) ELSE '{}'::jsonb END;
END $$;

-- One receipt and one PostgreSQL transaction per deliberate action. The existing
-- writers still perform actor, version, document and revocation checks.
CREATE FUNCTION admission_care_command(actor text, sv integer, op text, p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  ctx jsonb;
  a public.admission_assignments%ROWTYPE;
  prior public.admission_operations%ROWTYPE;
  candidates jsonb;
  child jsonb;
  result jsonb;
  revision jsonb;
  episode text;
  directed boolean;
  scope_op text;
BEGIN
  IF op NOT IN ('care-start','care-send','care-register','care-review')
    OR p->'confirmed' IS DISTINCT FROM 'true'::jsonb OR p->>'operationId' IS NULL
    OR p->>'fingerprint' IS NULL OR length(p->>'fingerprint')<>64 THEN
    RAISE EXCEPTION 'admission_conflict';
  END IF;
  scope_op:=CASE op WHEN 'care-start' THEN 'assign' WHEN 'care-send' THEN 'submit' ELSE 'validate' END;
  ctx:=public.admission_context(actor,sv,scope_op,p);
  IF NOT EXISTS(SELECT 1 FROM public.contact_verification_state WHERE user_id=ctx->>'account' AND channel='email' AND contact_digest=p->>'emailDigest')
    OR NOT EXISTS(SELECT 1 FROM public.contact_verification_state WHERE user_id=ctx->>'account' AND channel='sms' AND contact_digest=p->>'phoneDigest') THEN
    RAISE EXCEPTION 'admission_missing';
  END IF;
  IF op<>'care-start' THEN
    SELECT * INTO a FROM public.admission_assignments WHERE id=(p->>'id')::uuid FOR UPDATE;
    IF NOT FOUND OR a.state<>'accepted' OR a.account_id IS DISTINCT FROM ctx->>'account'
      OR a.patient_id IS DISTINCT FROM ctx->>'patient' OR a.psychologist_id IS DISTINCT FROM ctx->>'psychologist'
      OR NOT EXISTS (SELECT 1 FROM public.admission_consents c WHERE c.assignment_id=a.id
        AND c.actor_id=a.account_id AND c.consent_hash=a.consent_hash AND c.consent_version=a.consent_version) THEN
      RAISE EXCEPTION 'admission_missing';
    END IF;
    directed:=a.consent_version='fictional-directed-v1';
    IF (op='care-register' AND NOT directed) OR (op='care-send' AND directed) THEN
      RAISE EXCEPTION 'admission_missing';
    END IF;
  END IF;
  SELECT * INTO prior FROM public.admission_operations WHERE actor_id=actor AND operation_id=(p->>'operationId')::uuid;
  IF FOUND THEN
    IF prior.fingerprint IS DISTINCT FROM p->>'fingerprint' THEN RAISE EXCEPTION 'admission_conflict'; END IF;
    IF op='care-start' AND NOT EXISTS (SELECT 1 FROM public.admission_assignments x
      WHERE x.id=(prior.result->>'id')::uuid AND x.agreement_id=(p->>'agreementId')::uuid
        AND x.psychologist_id=actor AND x.state<>'revoked') THEN RAISE EXCEPTION 'admission_missing'; END IF;
    -- A receipt describes a committed act. The client reloads current state.
    RETURN prior.result;
  END IF;

  IF op<>'care-start' AND NOT EXISTS (
    SELECT 1 FROM public.clinical_episodes e JOIN public.clinical_episode_participants cp ON cp.episode_id=e.id
    WHERE e.id=a.episode_id AND e.status='prepared' AND e.modality='individual'
      AND e.participant_two_id IS NULL AND e.started_at IS NULL AND e.finalized_at IS NULL
      AND e.psychologist_user_id=a.psychologist_id AND cp.psychologist_user_id=a.psychologist_id
      AND cp.patient_id=a.patient_id
  ) THEN RAISE EXCEPTION 'admission_missing'; END IF;

  child:=p||jsonb_build_object('operationId',gen_random_uuid());
  IF op='care-start' THEN
    IF p->>'mode' IS NULL OR p->>'mode' NOT IN ('self','directed')
      OR p->>'templateId' IS NULL OR p->>'templateId'='fictional-adult-v1'
      OR NOT EXISTS (SELECT 1 FROM public.admission_templates WHERE id=p->>'templateId') THEN
      RAISE EXCEPTION 'admission_conflict';
    END IF;
    -- Under the agreement barrier another tab may already have started the
    -- interview. Require the clinician to resume that confirmed assignment.
    IF EXISTS (SELECT 1 FROM public.admission_assignments x JOIN public.clinical_episodes e ON e.id=x.episode_id
      WHERE x.agreement_id=(p->>'agreementId')::uuid AND x.state<>'revoked' AND e.status='prepared') THEN
      RAISE EXCEPTION 'admission_conflict';
    END IF;
    candidates:=public.admission_command(actor,sv,'preparations',p);
    episode:=p->>'episodeId';
    IF episode IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(candidates) v WHERE v->>'episodeId'=episode) THEN
      RAISE EXCEPTION 'admission_missing';
    ELSIF episode IS NULL AND jsonb_array_length(candidates)>1 THEN
      RAISE EXCEPTION 'admission_preparation_choice';
    ELSIF episode IS NULL AND jsonb_array_length(candidates)=1 THEN
      episode:=candidates->0->>'episodeId';
    ELSIF episode IS NULL THEN
      revision:=public.admission_command(actor,sv,'prepare-current',child);
      episode:=revision->>'episodeId';
    END IF;
    result:=public.admission_command(actor,sv,CASE WHEN p->>'mode'='directed' THEN 'assign-directed' ELSE 'assign' END,
      child||jsonb_build_object('operationId',gen_random_uuid(),'episodeId',episode));
  ELSIF op='care-send' THEN
    IF NOT public.admission_responses_valid(a.template_id,p->'answers',true) THEN
      RAISE EXCEPTION 'admission_conflict';
    END IF;
    revision:=public.admission_command(actor,sv,'save',child);
    result:=public.admission_command(actor,sv,'submit',child||jsonb_build_object(
      'operationId',gen_random_uuid(),'expectedRevision',revision->'revision'));
  ELSIF op='care-register' THEN
    IF a.latest_document<>0 OR p->>'expectedVersion' IS DISTINCT FROM a.version::text THEN
      RAISE EXCEPTION 'admission_conflict';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.admission_directed_attestations WHERE assignment_id=a.id) THEN
      revision:=public.admission_directed_command(actor,sv,'directed-attest',child);
      child:=child||jsonb_build_object('expectedVersion',revision->'version');
    END IF;
    result:=public.admission_directed_command(actor,sv,'directed-document',child||jsonb_build_object(
      'operationId',gen_random_uuid(),'expectedDocumentRevision',0));
  ELSE
    IF p->>'assignmentVersion' IS DISTINCT FROM a.version::text OR p->>'documentVersion' IS NULL THEN
      RAISE EXCEPTION 'admission_conflict';
    END IF;
    IF (directed AND a.directed_review='validated' AND p->>'documentVersion'=a.latest_document::text)
      OR (NOT directed AND a.review_state='validated' AND p->>'documentVersion'=a.latest_submission::text) THEN
      revision:=jsonb_build_object('version',a.version);
    ELSE
      revision:=public.admission_command(actor,sv,CASE WHEN directed THEN 'directed-validate' ELSE 'validate' END,
        child||jsonb_build_object('expectedVersion',a.version,'episodeId',a.episode_id::text,
          'submission',p->'documentVersion','documentRevision',p->'documentVersion'));
    END IF;
    PERFORM public.admission_consultation(actor,sv,'sufficiency',p||jsonb_build_object('assignmentVersion',revision->'version'));
    result:=jsonb_build_object('saved',true);
  END IF;
  IF (p->>'sessionExpiresAt')::double precision<=extract(epoch FROM clock_timestamp()) THEN
    RAISE EXCEPTION 'admission_session';
  END IF;
  INSERT INTO public.admission_operations(actor_id,operation_id,fingerprint,result)
    VALUES(actor,(p->>'operationId')::uuid,p->>'fingerprint',result);
  RETURN result;
END $$;

DO $$
DECLARE owner_name text; signature text;
BEGIN
  SELECT proowner::regrole::text INTO owner_name
  FROM pg_proc WHERE oid='public.admission_command(text,integer,text,jsonb)'::regprocedure;
  FOREACH signature IN ARRAY ARRAY['admission_responses_valid(text,jsonb,boolean)','admission_response_guard()','admission_care_command(text,integer,text,jsonb)',
    'admission_care_context(text,integer,jsonb)'] LOOP
    EXECUTE format('ALTER FUNCTION public.%s OWNER TO %I',signature,owner_name);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC',signature);
  END LOOP;
END $$;
