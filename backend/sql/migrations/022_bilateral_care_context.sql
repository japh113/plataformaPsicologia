DO $$
DECLARE relation_name text; populated boolean;
BEGIN
  IF current_setting('psicopanel.migration_target',true) IS DISTINCT FROM '022'
      OR current_database() !~ '^psicopanel_episode_[a-z0-9_]+$'
      OR NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN
    RAISE EXCEPTION '022 requires explicit isolated provisioning';
  END IF;
  FOR relation_name IN SELECT tablename FROM pg_tables WHERE schemaname='public'
      AND tablename NOT IN ('psicopanel_schema_migrations','admission_templates','consultation_schedule_guard')
      ORDER BY tablename LOOP
    EXECUTE format('LOCK TABLE public.%I IN ACCESS EXCLUSIVE MODE',relation_name);
    EXECUTE format('SELECT EXISTS(SELECT FROM public.%I)',relation_name) INTO populated;
    IF populated THEN RAISE EXCEPTION '022 requires an empty isolated destination'; END IF;
  END LOOP;
END $$;

CREATE FUNCTION public.bilateral_care_context(actor text, sv integer, expires double precision)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor_role text; linked jsonb; matches jsonb;
BEGIN
  IF sv IS NULL OR expires IS NULL OR expires<=extract(epoch FROM clock_timestamp()) THEN
    RAISE EXCEPTION 'bilateral_session' USING ERRCODE='P0001';
  END IF;
  actor_role := public.bilateral_context(actor,sv,'agreements','{}'::jsonb)->>'role';
  IF actor_role='psychologist' THEN
    linked := public.bilateral_linked_patients(actor,sv,expires);
    SELECT coalesce(jsonb_agg(jsonb_build_object('agreementId',g.id,'invitationId',g.invitation_id)),'[]'::jsonb)
      INTO matches FROM public.bilateral_agreements g
      JOIN jsonb_array_elements(linked) l ON l->>'agreementId'=g.id::text
      WHERE g.psychologist_id=actor;
  ELSIF actor_role='patient' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('agreementId',g.id,'invitationId',g.invitation_id)),'[]'::jsonb)
      INTO matches FROM public.bilateral_agreements g JOIN public.bilateral_invitations i ON i.id=g.invitation_id
      WHERE g.account_id=actor AND i.account_id=actor AND i.state='accepted';
  ELSE
    RAISE EXCEPTION 'bilateral_forbidden' USING ERRCODE='P0001';
  END IF;
  IF expires<=extract(epoch FROM clock_timestamp()) THEN
    RAISE EXCEPTION 'bilateral_session' USING ERRCODE='P0001';
  END IF;
  RETURN jsonb_build_object('agreements',matches);
END $$;

REVOKE ALL ON FUNCTION public.bilateral_care_context(text,integer,double precision) FROM PUBLIC;
DO $$
DECLARE owner_name text;
BEGIN
  SELECT proowner::regrole::text INTO STRICT owner_name FROM pg_proc
    WHERE oid='public.bilateral_command(text,integer,text,jsonb)'::regprocedure;
  EXECUTE format('ALTER FUNCTION public.bilateral_care_context(text,integer,double precision) OWNER TO %I',owner_name);
END $$;
