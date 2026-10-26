\set ON_ERROR_STOP on
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',false);
DO $$ BEGIN
  PERFORM public.preview_update_club_profile('20000000-0000-0000-0000-000000000001','{"name":"Forbidden"}','{"name":"Original club"}');
  RAISE EXCEPTION 'Custom user unexpectedly saved';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
SELECT public.preview_update_club_profile('20000000-0000-0000-0000-000000000001','{"name":"Updated club","city":"Cape Town"}','{"name":"Original club","city":null}');
DO $$ BEGIN
  PERFORM public.preview_update_club_profile('20000000-0000-0000-0000-000000000001','{"name":"Stale overwrite"}','{"name":"Original club"}');
  RAISE EXCEPTION 'Stale save unexpectedly succeeded';
EXCEPTION WHEN serialization_failure THEN NULL; END $$;
DO $$ BEGIN
  PERFORM public.preview_update_club_profile('20000000-0000-0000-0000-000000000001','{"status":"published"}','{"status":"pending"}');
  RAISE EXCEPTION 'Protected status unexpectedly saved';
EXCEPTION WHEN invalid_parameter_value THEN NULL; END $$;
DO $$ BEGIN
  PERFORM public.preview_update_club_profile('20000000-0000-0000-0000-000000000001','{"website_url":"javascript:alert(1)"}','{"website_url":null}');
  RAISE EXCEPTION 'Unsafe URL unexpectedly saved';
EXCEPTION WHEN invalid_parameter_value THEN NULL; END $$;
RESET ROLE;
DO $$ BEGIN
  IF (SELECT count(*) FROM club_preview_private.profile_audit) <> 1 THEN RAISE EXCEPTION 'Incorrect audit count'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.clubs WHERE name='Updated club' AND city='Cape Town' AND status='pending' AND verified=false) THEN RAISE EXCEPTION 'Unexpected club changes'; END IF;
  IF has_function_privilege('anon','public.preview_update_club_profile(uuid,jsonb,jsonb)','execute') THEN RAISE EXCEPTION 'Anonymous execute allowed'; END IF;
END $$;
