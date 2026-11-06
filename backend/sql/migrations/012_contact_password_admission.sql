-- Technical admission only. No demo backfill or changes to clinical authority.
DO $$ BEGIN
  IF current_setting('psicopanel.migration_target', true) IS DISTINCT FROM '012' THEN
    RAISE EXCEPTION 'Use explicit migration runner target 012';
  END IF;
END $$;

ALTER TABLE public.contact_change_events
  DROP CONSTRAINT contact_change_events_action_check,
  ADD CONSTRAINT contact_change_events_action_check CHECK (action IN (
    'password_failed','started','cancelled','replaced','reauthenticated','verified','confirmed','password_admitted'
  )),
  ADD CONSTRAINT contact_change_admission_without_request
    CHECK (action <> 'password_admitted' OR request_id IS NULL);

-- Bounded technical cleanup without scanning functional/security history.
CREATE INDEX contact_password_admission_retention
  ON public.contact_change_events(created_at,id) WHERE action='password_admitted';
