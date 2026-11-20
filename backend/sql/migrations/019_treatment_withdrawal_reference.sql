-- Read-only withdrawal references for the current patient, independently of professional access.
DO $$
DECLARE relation_name text; populated boolean;
BEGIN
  IF current_setting('psicopanel.migration_target',true) IS DISTINCT FROM '019'
      OR current_database() !~ '^psicopanel_episode_[a-z0-9_]+$'
      OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN
    RAISE EXCEPTION '019 requires explicit isolated provisioning';
  END IF;
  FOR relation_name IN SELECT tablename FROM pg_tables WHERE schemaname='public'
      AND tablename<>'psicopanel_schema_migrations' ORDER BY tablename LOOP
    EXECUTE format('LOCK TABLE public.%I IN ACCESS EXCLUSIVE MODE',relation_name);
    EXECUTE format('SELECT EXISTS(SELECT FROM public.%I)',relation_name) INTO populated;
    IF populated AND relation_name NOT IN ('admission_templates','consultation_schedule_guard') THEN
      RAISE EXCEPTION '019 requires an empty isolated destination';
    END IF;
  END LOOP;
END $$;

CREATE FUNCTION public.admission_withdrawal_references(actor text, sv integer, expires double precision)
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
    SELECT jsonb_agg(jsonb_build_object('assignmentId',a.id,'episodeId',a.episode_id::text,'consentId',c.id)
      ORDER BY a.episode_id)
    FROM public.admission_assignments a
    JOIN public.consultation_consents c ON c.assignment_id=a.id AND c.episode_id=a.episode_id AND c.account_id=a.account_id
    JOIN public.consultation_sufficiency s ON s.id=c.sufficiency_id AND s.assignment_id=a.id AND s.episode_id=a.episode_id
    JOIN public.clinical_episodes e ON e.id=a.episode_id
    WHERE a.account_id=actor AND a.patient_id=subject
      AND (EXISTS (SELECT 1 FROM public.consultation_activations x WHERE x.consent_id=c.id AND x.episode_id=e.id)
        OR (e.status='prepared' AND (
          s.submission=a.latest_submission OR s.directed_revision=a.latest_document)))
      AND NOT EXISTS (SELECT 1 FROM public.consultation_withdrawals w WHERE w.consent_id=c.id)
  ),'[]'::jsonb) INTO references_list;
  IF expires<=extract(epoch FROM clock_timestamp()) THEN RAISE EXCEPTION 'admission_session'; END IF;
  RETURN references_list;
END $$;

REVOKE ALL ON FUNCTION public.admission_withdrawal_references(text,integer,double precision) FROM PUBLIC;
DO $$
DECLARE
  owner_name text := 'admission_owner_'||substr(md5(current_database()),1,16);
  login_name text := current_setting('psicopanel.admission_client',true);
BEGIN
  IF login_name IS NULL OR login_name !~ '^[a-z][a-z0-9_]{0,62}$' THEN RAISE EXCEPTION 'Invalid admission LOGIN'; END IF;
  EXECUTE format('ALTER FUNCTION public.admission_withdrawal_references(text,integer,double precision) OWNER TO %I',owner_name);
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.admission_withdrawal_references(text,integer,double precision) TO %I',login_name);
END $$;
