-- SYNTHETIC LOCAL DATABASE ONLY. Transactional checks use fixture identities.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","email":"assigned@example.com","role":"authenticated"}',true);
DO $$ DECLARE affected int; BEGIN
  IF NOT admin_rebuild_security.can_access_event(1) OR NOT admin_rebuild_security.can_access_event(2) THEN RAISE EXCEPTION 'Numeric/string assignments must work'; END IF;
  IF admin_rebuild_security.can_access_event(3) OR admin_rebuild_security.can_access_event(999) THEN RAISE EXCEPTION 'Unassigned/missing event authorised'; END IF;
  UPDATE public.tournament_divisions SET name='Assigned edit' WHERE event_id=1;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'Assigned update failed'; END IF;
  UPDATE public.tournament_divisions SET name='Forbidden' WHERE event_id=3;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>0 THEN RAISE EXCEPTION 'Cross-event update allowed'; END IF;
  DELETE FROM public.tournament_divisions WHERE event_id=3;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>0 THEN RAISE EXCEPTION 'Cross-event delete allowed'; END IF;
  BEGIN
    UPDATE public.tournament_divisions SET event_id=3 WHERE id=1;
    RAISE EXCEPTION 'Cross-event move allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.tournament_divisions VALUES(20,3,'Forbidden');
    RAISE EXCEPTION 'Cross-event insert allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  INSERT INTO public.tournament_divisions VALUES(21,1,'Assigned insert');
  DELETE FROM public.tournament_divisions WHERE id=21;
  IF (SELECT count(*) FROM public.event_activity_log)<>2 OR (SELECT count(*) FROM public.event_creation_audit)<>2 THEN RAISE EXCEPTION 'Log scope mismatch'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","email":"unrelated@example.com","role":"authenticated"}',true);
DO $$ DECLARE affected int; BEGIN
  UPDATE public.tournament_divisions SET name='Unrelated grant';
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>0 OR (SELECT count(*) FROM public.event_activity_log)<>0 THEN RAISE EXCEPTION 'Unrelated permission record bypassed scope'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","email":"player@example.com","role":"authenticated"}',true);
DO $$ DECLARE affected int; BEGIN
  UPDATE public.tournament_divisions SET name='Player edit';
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>0 THEN RAISE EXCEPTION 'Ordinary player bypassed scope'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","email":"malformed@example.com","role":"authenticated"}',true);
DO $$ BEGIN
  IF admin_rebuild_security.can_access_event(1) THEN RAISE EXCEPTION 'Malformed scope became global access'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{}',true);
DO $$ BEGIN
  IF admin_rebuild_security.can_access_event(1) THEN RAISE EXCEPTION 'Missing claims authorised'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","email":"org@example.com","role":"authenticated"}',true);
DO $$ BEGIN
  IF NOT admin_rebuild_security.can_access_event(3) OR admin_rebuild_security.can_access_event(4) THEN RAISE EXCEPTION 'Organisation scope mismatch'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","email":"club@example.com","role":"authenticated"}',true);
DO $$ BEGIN
  IF NOT admin_rebuild_security.can_access_event(4) OR admin_rebuild_security.can_access_event(3) THEN RAISE EXCEPTION 'Club scope mismatch'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","email":"organiser@example.com","role":"authenticated"}',true);
DO $$ BEGIN
  IF NOT admin_rebuild_security.can_access_event(5) OR admin_rebuild_security.can_access_event(1) THEN RAISE EXCEPTION 'Organiser scope mismatch'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","email":"super@example.com","role":"authenticated"}',true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.event_activity_log)<>5 THEN RAISE EXCEPTION 'Super admin lost event access'; END IF;
  IF has_table_privilege('authenticated','public.payments','TRUNCATE') OR has_table_privilege('anon','public.calendar','TRIGGER') THEN RAISE EXCEPTION 'Excess privileges remain'; END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims','{"role":"anon"}',true);
DO $$ DECLARE affected int; BEGIN
  IF (SELECT count(*) FROM public.tournament_divisions)<>5 THEN RAISE EXCEPTION 'Public division reading changed'; END IF;
  UPDATE public.tournament_divisions SET name='Anonymous edit';
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>0 THEN RAISE EXCEPTION 'Anonymous division write allowed'; END IF;
  BEGIN
    PERFORM admin_rebuild_security.can_access_event(1);
    RAISE EXCEPTION 'Anonymous helper execution allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE service_role;
UPDATE public.tournament_divisions SET name='Service write' WHERE id=1;
ROLLBACK;
