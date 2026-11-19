-- Isolated authenticated admission directed interviews only. No general clinical grant.
DO $$ DECLARE relation_name text; populated boolean; BEGIN
  IF current_setting('psicopanel.migration_target',true) IS DISTINCT FROM '017'
    OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN
    RAISE EXCEPTION '017 requires explicit isolated provisioning';
  END IF;
  -- 014 installs one immutable predefined template, not business/clinical data.
  -- Lock it too; only that configuration and the ledger may already contain rows.
  FOR relation_name IN SELECT tablename FROM pg_tables WHERE schemaname='public'
    AND tablename<>'psicopanel_schema_migrations' ORDER BY tablename LOOP
    EXECUTE format('LOCK TABLE public.%I IN ACCESS EXCLUSIVE MODE',relation_name);
    EXECUTE format('SELECT EXISTS(SELECT FROM public.%I)',relation_name) INTO populated;
    IF populated AND relation_name<>'admission_templates' THEN RAISE EXCEPTION '017 requires an empty isolated destination'; END IF;
  END LOOP;
END $$;

-- Directed documents never become patient-authored submissions.
ALTER TABLE admission_assignments DROP CONSTRAINT admission_assignments_consent_version_check;
ALTER TABLE admission_assignments ADD CHECK(consent_version IN ('fictional-admission-v1','fictional-admission-v2','fictional-directed-v1'));
ALTER TABLE admission_assignments ADD UNIQUE(id,consent_version);
ALTER TABLE admission_assignments ADD COLUMN latest_document integer NOT NULL DEFAULT 0 CHECK(latest_document>=0),
  ADD COLUMN directed_review text CHECK(directed_review IN ('awaiting_document','documented','correction_requested','validated')),
  ADD CHECK((consent_version='fictional-directed-v1' AND directed_review IS NOT NULL AND latest_submission=0 AND review_state='awaiting_submission') OR
    (consent_version<>'fictional-directed-v1' AND directed_review IS NULL AND latest_document=0));
CREATE TABLE admission_directed_attestations (
  assignment_id uuid PRIMARY KEY, actor_id text NOT NULL, session_version integer NOT NULL CHECK(session_version>=0),
  consent_version text NOT NULL DEFAULT 'fictional-directed-v1' CHECK(consent_version='fictional-directed-v1'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(assignment_id,actor_id) REFERENCES admission_assignments(id,psychologist_id) ON DELETE RESTRICT,
  FOREIGN KEY(assignment_id,consent_version) REFERENCES admission_assignments(id,consent_version) ON DELETE RESTRICT
);
CREATE TABLE admission_directed_versions (
  assignment_id uuid NOT NULL REFERENCES admission_directed_attestations(assignment_id) ON DELETE RESTRICT,
  revision integer NOT NULL CHECK(revision>0), previous_revision integer NOT NULL CHECK(previous_revision=revision-1 AND previous_revision>=0),
  episode_id bigint NOT NULL, patient_id text COLLATE "C" NOT NULL, psychologist_id text NOT NULL, template_id text NOT NULL,
  author_id text NOT NULL, session_version integer NOT NULL CHECK(session_version>=0),
  declarations jsonb NOT NULL CHECK(jsonb_typeof(declarations)='object' AND octet_length(declarations::text)<=12000),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(assignment_id,revision),
  FOREIGN KEY(assignment_id,author_id) REFERENCES admission_assignments(id,psychologist_id) ON DELETE RESTRICT,
  FOREIGN KEY(assignment_id,episode_id,patient_id,psychologist_id,template_id)
    REFERENCES admission_assignments(id,episode_id,patient_id,psychologist_id,template_id) ON DELETE RESTRICT
);
CREATE TABLE admission_directed_requests (
  id uuid PRIMARY KEY, assignment_id uuid NOT NULL, document_revision integer NOT NULL, actor_id text NOT NULL,
  reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 1000), recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(id,assignment_id),
  FOREIGN KEY(assignment_id,document_revision) REFERENCES admission_directed_versions(assignment_id,revision) ON DELETE RESTRICT,
  FOREIGN KEY(assignment_id,actor_id) REFERENCES admission_assignments(id,account_id) ON DELETE RESTRICT
);
CREATE TABLE admission_directed_resolutions (
  request_id uuid PRIMARY KEY, assignment_id uuid NOT NULL, actor_id text NOT NULL,
  decision text NOT NULL CHECK(decision IN ('accept','reject')), explanation text NOT NULL CHECK(length(btrim(explanation)) BETWEEN 1 AND 1000),
  resulting_revision integer NOT NULL, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(request_id,assignment_id) REFERENCES admission_directed_requests(id,assignment_id) ON DELETE RESTRICT,
  FOREIGN KEY(assignment_id,actor_id) REFERENCES admission_assignments(id,psychologist_id) ON DELETE RESTRICT,
  FOREIGN KEY(assignment_id,resulting_revision) REFERENCES admission_directed_versions(assignment_id,revision) ON DELETE RESTRICT
);
CREATE TABLE admission_directed_validations (
  id uuid PRIMARY KEY, assignment_id uuid NOT NULL, document_revision integer NOT NULL,
  actor_id text NOT NULL, session_version integer NOT NULL CHECK(session_version>=0), recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(assignment_id,document_revision) REFERENCES admission_directed_versions(assignment_id,revision) ON DELETE RESTRICT,
  FOREIGN KEY(assignment_id,actor_id) REFERENCES admission_assignments(id,psychologist_id) ON DELETE RESTRICT
);
DO $$ DECLARE obj text; BEGIN
  FOREACH obj IN ARRAY ARRAY['admission_directed_attestations','admission_directed_versions','admission_directed_requests','admission_directed_resolutions','admission_directed_validations'] LOOP
    EXECUTE format('CREATE TRIGGER admission_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.admission_immutable()',obj);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC',obj);
  END LOOP;
END $$;
-- Serialize/check the append independently of the command's optimistic checks.
CREATE FUNCTION admission_directed_version_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE latest integer; BEGIN
  PERFORM id FROM public.admission_assignments WHERE id=NEW.assignment_id FOR UPDATE;
  SELECT coalesce(max(revision),0) INTO latest FROM public.admission_directed_versions WHERE assignment_id=NEW.assignment_id;
  IF NEW.previous_revision IS DISTINCT FROM latest OR NEW.revision IS DISTINCT FROM latest+1 OR
    (SELECT count(*) FROM jsonb_object_keys(NEW.declarations))<>2 OR NOT coalesce(length(btrim(NEW.declarations->>'reason')) BETWEEN 1 AND 1000 AND length(btrim(NEW.declarations->>'context')) BETWEEN 1 AND 1000,false) OR EXISTS(SELECT 1 FROM jsonb_each(NEW.declarations) kv WHERE kv.key NOT IN ('reason','context') OR jsonb_typeof(kv.value)<>'string') THEN RAISE EXCEPTION 'admission_conflict'; END IF;
  NEW.recorded_at:=clock_timestamp(); RETURN NEW;
END $$;
CREATE TRIGGER admission_directed_version_guard BEFORE INSERT ON admission_directed_versions FOR EACH ROW EXECUTE FUNCTION admission_directed_version_guard();
DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='episode_private_record_versions'::regclass AND contype='c'
    AND pg_get_constraintdef(oid) LIKE '%recording_kind%' LOOP
    EXECUTE format('ALTER TABLE episode_private_record_versions DROP CONSTRAINT %I',c.conname);
  END LOOP;
END $$;
ALTER TABLE episode_private_record_versions ADD COLUMN directed_revision integer,
  ADD FOREIGN KEY(assignment_id,directed_revision) REFERENCES admission_directed_versions(assignment_id,revision) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE episode_private_record_versions ADD CHECK(
 (recording_kind IN ('initial_empty','sandbox_fixture') AND assignment_id IS NULL AND submission IS NULL AND directed_revision IS NULL
  AND authenticated_author_user_id IS NULL AND authenticated_session_version IS NULL AND
  ((revision=1 AND recording_kind='initial_empty' AND technical_author_user_id IS NULL AND risk_level='unevaluated' AND professional_context='') OR
   (revision>1 AND recording_kind='sandbox_fixture' AND technical_author_user_id=professional_user_id AND technical_author_user_id IS NOT NULL))) OR
 (revision>1 AND recording_kind IN ('authenticated_admission','authenticated_directed_admission') AND technical_author_user_id IS NULL
  AND assignment_id IS NOT NULL AND authenticated_author_user_id IS NOT NULL AND authenticated_author_user_id=professional_user_id
  AND authenticated_session_version IS NOT NULL AND
  ((recording_kind='authenticated_admission' AND submission IS NOT NULL AND directed_revision IS NULL) OR
   (recording_kind='authenticated_directed_admission' AND submission IS NULL AND directed_revision IS NOT NULL)))
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
    latest>0 AND (pg_trigger_depth()<>1 OR NEW.recording_kind NOT IN ('sandbox_fixture','authenticated_admission','authenticated_directed_admission')) THEN
    RAISE EXCEPTION 'episode_record_invalid';
  END IF;
  -- Server provenance; authenticated authorship is separately constrained.
  NEW.writer_login:=session_user; NEW.recorded_at:=clock_timestamp();
  RETURN NEW;
END $$;


CREATE FUNCTION admission_directed_command(actor text,sv integer,op text,p jsonb) RETURNS jsonb
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
      AND e.status='prepared' AND e.modality='individual' AND e.participant_two_id IS NULL AND e.started_at IS NULL AND e.finalized_at IS NULL
      AND e.psychologist_user_id=c->>'psychologist' AND cp.patient_id=c->>'patient' AND cp.psychologist_user_id=c->>'psychologist') THEN RAISE EXCEPTION 'admission_missing'; END IF;
  IF (p->>'sessionExpiresAt') IS NULL OR (p->>'sessionExpiresAt')::double precision<=extract(epoch FROM clock_timestamp()) THEN RAISE EXCEPTION 'admission_session'; END IF;
  IF op='summary' THEN
    RETURN jsonb_build_object('id',a.id,'mode','directed','episodeId',a.episode_id::text,'templateId',a.template_id,
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
      p->>'templateId' IS DISTINCT FROM 'fictional-adult-v1' OR EXISTS(SELECT 1 FROM public.admission_assignments WHERE episode_id=(p->>'episodeId')::bigint) THEN RAISE EXCEPTION 'admission_conflict'; END IF;
    assignment:=(p->>'newId')::uuid;
    SELECT btrim(first_name||' '||coalesce(last_name,'')) INTO name FROM public.users WHERE id=actor;
    consent:='Ensayo ficticio de entrevista individual dirigida. Sujeto paciente '||(c->>'patient')||', cuenta '||(c->>'account')||', profesional responsable '||name||' ('||actor||'), asignación '||assignment::text||', episodio preparado '||(p->>'episodeId')||', plantilla fictional-adult-v1. Acepto que este profesional realice la entrevista, declare su realización y documente mis declaraciones. El autor de la documentación es el profesional: no son respuestas escritas, enviadas ni ratificadas por mí. Cada versión que incorpore será visible para mí y para este profesional mientras mantenga permiso; no hay segunda publicación. Los borradores profesionales no incorporados no son visibles. Puedo consultar versiones incorporadas y solicitar rectificación motivada, que el profesional aceptará incorporando otra versión o rechazará con explicación; se conserva el original y la decisión. Autorizo valoraciones privadas de riesgo y contexto por versión exacta: solo el responsable autorizado las consulta, nunca se muestran automáticamente al paciente, terceros o backoffice. Puedo retirar el consentimiento y cualquiera de las partes puede cancelar la admisión. La revocación impide nuevas lecturas, escrituras y reintentos profesionales, sin archivo profesional implícito ni borrado automático. Conservo consulta autenticada de las versiones incorporadas y las correcciones destinadas a mí. Se conservan versiones, autoría y fechas; ARCO, custodia y retención jurídica siguen sus procesos separados. No autoriza expediente general, otros episodios, tratamiento, citas ni notas ordinarias; no acredita identidad física, asistencia por aceptar ni mínimos clínicos reales.';
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
  IF op LIKE 'directed-%' OR op='assign-directed' OR EXISTS(SELECT 1 FROM public.admission_assignments WHERE id=(p->>'id')::uuid AND consent_version='fictional-directed-v1') THEN
    RETURN public.admission_directed_command(actor,sv,op,p);
  END IF;
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


DO $$ DECLARE owner_name text; obj text; BEGIN
  SELECT proowner::regrole::text INTO owner_name FROM pg_proc WHERE oid='public.admission_command(text,integer,text,jsonb)'::regprocedure;
  FOREACH obj IN ARRAY ARRAY['admission_directed_attestations','admission_directed_versions','admission_directed_requests','admission_directed_resolutions','admission_directed_validations'] LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO %I',obj,owner_name);
  END LOOP;
  FOREACH obj IN ARRAY ARRAY['admission_directed_command(text,integer,text,jsonb)','admission_directed_version_guard()'] LOOP
    EXECUTE format('ALTER FUNCTION public.%s OWNER TO %I',obj,owner_name);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC',obj);
  END LOOP;
  EXECUTE format('GRANT INSERT(directed_revision) ON public.episode_private_record_versions TO %I',owner_name);
END $$;
