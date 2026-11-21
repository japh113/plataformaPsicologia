DO $$
DECLARE relation_name text; populated boolean;
BEGIN
  IF current_setting('psicopanel.migration_target',true) IS DISTINCT FROM '020'
      OR current_database() !~ '^psicopanel_episode_[a-z0-9_]+$'
      OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN
    RAISE EXCEPTION '020 requires explicit isolated provisioning';
  END IF;
  FOR relation_name IN SELECT tablename FROM pg_tables WHERE schemaname='public'
      AND tablename NOT IN ('psicopanel_schema_migrations','admission_templates','consultation_schedule_guard')
      ORDER BY tablename LOOP
    EXECUTE format('LOCK TABLE public.%I IN ACCESS EXCLUSIVE MODE',relation_name);
    EXECUTE format('SELECT EXISTS(SELECT FROM public.%I)',relation_name) INTO populated;
    IF populated THEN RAISE EXCEPTION '020 requires an empty isolated destination'; END IF;
  END LOOP;
END $$;

-- One snapshot for session, authorization and output. Keep identity out of
-- the historical agreement list, invitation receipts and ordinary pools.
CREATE FUNCTION public.bilateral_linked_patients(actor text, sv integer, expires double precision)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE linked jsonb;
BEGIN
  SELECT CASE WHEN r.state='enabled' THEN coalesce((
    SELECT jsonb_agg(jsonb_build_object('agreementId',g.id,'displayName',names.display_name)
      ORDER BY names.display_name,g.id)
    FROM public.bilateral_agreements g
    JOIN public.bilateral_invitations i ON i.id=g.invitation_id AND i.state='accepted'
      AND (i.psychologist_id,i.account_id,i.patient_id,i.purpose)=(g.psychologist_id,g.account_id,g.patient_id,g.purpose)
      -- This exact version includes permission to show the patient's name.
      AND i.conditions_version='fictional-individual-v2'
    JOIN public.users subject ON subject.id=g.account_id AND subject.patient_id=g.patient_id
      AND subject.role='patient' AND subject.is_active
    JOIN public.patients p ON p.id=g.patient_id
    CROSS JOIN LATERAL (SELECT nullif(btrim(concat_ws(' ',p.first_name,p.last_name)),'') AS display_name) names
    WHERE g.psychologist_id=actor AND g.state='completed' AND g.purpose='individual_linkage'
      AND names.display_name IS NOT NULL
      AND p.global_birth_date<=((statement_timestamp() AT TIME ZONE 'America/Mexico_City')::date - interval '18 years')::date
      -- Identity/contact writers revoke these rows when the current contact changes.
      AND EXISTS (SELECT 1 FROM public.contact_verification_state s WHERE s.user_id=subject.id AND s.channel='email')
      AND EXISTS (SELECT 1 FROM public.contact_verification_state s WHERE s.user_id=subject.id AND s.channel='sms')
  ),'[]'::jsonb) ELSE '[]'::jsonb END INTO linked
  FROM public.users professional
  JOIN public.psychologist_profiles pp ON pp.user_id=professional.id AND pp.approval_status='active'
  LEFT JOIN public.bilateral_restrictions r ON r.psychologist_id=professional.id
  WHERE professional.id=actor AND professional.role='psychologist' AND professional.is_active
    AND professional.session_version=sv;

  IF expires IS NULL OR expires<=extract(epoch FROM clock_timestamp()) THEN
    RAISE EXCEPTION 'bilateral_session' USING ERRCODE='P0001';
  END IF;
  IF linked IS NULL THEN RAISE EXCEPTION 'bilateral_forbidden' USING ERRCODE='P0001'; END IF;
  RETURN linked;
END $$;

REVOKE ALL ON FUNCTION public.bilateral_linked_patients(text,integer,double precision) FROM PUBLIC;
DO $$
DECLARE owner_name text;
BEGIN
  SELECT proowner::regrole::text INTO STRICT owner_name FROM pg_proc
    WHERE oid='public.bilateral_command(text,integer,text,jsonb)'::regprocedure;
  EXECUTE format('ALTER FUNCTION public.bilateral_linked_patients(text,integer,double precision) OWNER TO %I',owner_name);
END $$;
