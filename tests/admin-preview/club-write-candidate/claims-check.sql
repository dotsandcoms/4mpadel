\set ON_ERROR_STOP on
-- Capture original request snapshots before any decision for genuine retries.
SELECT set_config('test.claim_' || right(id::text,1), jsonb_build_object('club_id',club_id,'requester_email',requester_email,'requester_player_id',requester_player_id,'status',status)::text, false)
FROM public.club_claim_requests WHERE id IN ('30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000003');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',false);
DO $$ BEGIN
  PERFORM public.preview_decide_club_claim('30000000-0000-0000-0000-000000000001','approved',NULL,'20000000-0000-0000-0000-000000000002',current_setting('test.claim_1')::jsonb);
  RAISE EXCEPTION 'Custom user approved a claim';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
SELECT public.preview_decide_club_claim('30000000-0000-0000-0000-000000000001','approved',NULL,'20000000-0000-0000-0000-000000000002',current_setting('test.claim_1')::jsonb);
DO $$ DECLARE result jsonb; BEGIN
  result := public.preview_decide_club_claim('30000000-0000-0000-0000-000000000001','approved',NULL,'20000000-0000-0000-0000-000000000002',current_setting('test.claim_1')::jsonb);
  IF result->>'already_applied'<>'true' THEN RAISE EXCEPTION 'Retry was not idempotent'; END IF;
END $$;
DO $$ BEGIN
  PERFORM public.preview_decide_club_claim('30000000-0000-0000-0000-000000000001','rejected','Changed mind','20000000-0000-0000-0000-000000000002',current_setting('test.claim_1')::jsonb);
  RAISE EXCEPTION 'Conflicting decision accepted';
EXCEPTION WHEN serialization_failure THEN NULL; END $$;
DO $$ BEGIN
  PERFORM public.preview_decide_club_claim('30000000-0000-0000-0000-000000000002','approved',NULL,'20000000-0000-0000-0000-000000000002',current_setting('test.claim_2')::jsonb);
  RAISE EXCEPTION 'Wrong player identity accepted';
EXCEPTION WHEN invalid_parameter_value THEN NULL; END $$;
DO $$ BEGIN
  PERFORM public.preview_decide_club_claim('30000000-0000-0000-0000-000000000003','rejected','','20000000-0000-0000-0000-000000000002',current_setting('test.claim_3')::jsonb);
  RAISE EXCEPTION 'Empty feedback accepted';
EXCEPTION WHEN invalid_parameter_value THEN NULL; END $$;
SELECT public.preview_decide_club_claim('30000000-0000-0000-0000-000000000003','rejected','Please provide evidence of club ownership.','20000000-0000-0000-0000-000000000002',current_setting('test.claim_3')::jsonb);
RESET ROLE;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.club_members)<>1 THEN RAISE EXCEPTION 'Wrong membership count'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.club_members WHERE user_email='claimant@example.invalid' AND role='owner' AND player_id=1) THEN RAISE EXCEPTION 'Owner not assigned'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.clubs WHERE name='Claim club' AND status='published' AND verified) THEN RAISE EXCEPTION 'Club not published'; END IF;
  IF (SELECT count(*) FROM club_preview_private.claim_notifications WHERE delivery_status='pending')<>2 THEN RAISE EXCEPTION 'Incorrect queued notifications'; END IF;
  IF (SELECT count(*) FROM club_preview_private.claim_decisions)<>2 THEN RAISE EXCEPTION 'Incorrect decision audit'; END IF;
  IF has_function_privilege('anon','public.preview_decide_club_claim(uuid,text,text,uuid,jsonb)','execute') THEN RAISE EXCEPTION 'Anonymous execute allowed'; END IF;
END $$;
