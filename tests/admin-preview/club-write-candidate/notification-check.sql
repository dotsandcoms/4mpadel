-- Synthetic SQL-only verification. Always rolls back; never calls an email API.
BEGIN;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM club_preview_private.claim_notifications WHERE delivery_status IN ('pending','processing'))
    OR EXISTS(SELECT 1 FROM club_preview_private.application_notifications WHERE delivery_status IN ('pending','processing')) THEN
    RAISE EXCEPTION 'Use an empty staging/disposable queue; refusing to claim existing jobs';
  END IF;
END $$;
INSERT INTO club_preview_private.claim_decisions(claim_id,actor_id,decision,request_snapshot)
VALUES('99000000-0000-0000-0000-000000000001','99000000-0000-0000-0000-000000000099','approved','{}');
INSERT INTO club_preview_private.claim_notifications(claim_id,recipient,template,payload)
VALUES('99000000-0000-0000-0000-000000000001','notification-test@example.invalid','club_claim_approved','{"clubName":"Synthetic only"}');
INSERT INTO club_preview_private.application_decisions(club_id,actor_id,decision,previous_status,request_snapshot,notification_queued)
VALUES('99000000-0000-0000-0000-000000000002','99000000-0000-0000-0000-000000000099','approved','in_review','{}',true);
INSERT INTO club_preview_private.application_notifications(club_id,recipient,template,payload)
VALUES('99000000-0000-0000-0000-000000000002','notification-test@example.invalid','club_approved','{"clubName":"Synthetic only"}');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
DO $$ BEGIN
  PERFORM public.preview_claim_club_notification('claim');
  RAISE EXCEPTION 'Authenticated role claimed delivery';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
DO $$ DECLARE first_job jsonb; next_job jsonb; result jsonb; BEGIN
  first_job:=public.preview_claim_club_notification('claim');
  IF first_job->>'delivery_status'<>'processing' OR (first_job->>'attempt_count')::int<>1 THEN RAISE EXCEPTION 'Lease not created'; END IF;
  IF public.preview_claim_club_notification('claim') IS NOT NULL THEN RAISE EXCEPTION 'Processing job claimed twice'; END IF;
  BEGIN
    PERFORM public.preview_finish_club_notification('claim',(first_job->>'id')::uuid,(first_job->>'attempt_token')::uuid,'sent');
    RAISE EXCEPTION 'Sent accepted without provider message ID';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.preview_finish_club_notification('claim',(first_job->>'id')::uuid,gen_random_uuid(),'sent');
    RAISE EXCEPTION 'Wrong token accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  PERFORM public.preview_finish_club_notification('claim',(first_job->>'id')::uuid,(first_job->>'attempt_token')::uuid,'failed','Synthetic known-not-sent');
  PERFORM public.preview_retry_club_notification('claim',(first_job->>'id')::uuid,(first_job->>'attempt_token')::uuid);
  next_job:=public.preview_claim_club_notification('claim');
  IF next_job->>'attempt_token'=first_job->>'attempt_token' OR next_job->>'idempotency_key'<>first_job->>'idempotency_key' OR (next_job->>'attempt_count')::int<>2 THEN RAISE EXCEPTION 'Retry identity/attempt invalid'; END IF;
  BEGIN
    PERFORM public.preview_finish_club_notification('claim',(first_job->>'id')::uuid,(first_job->>'attempt_token')::uuid,'sent');
    RAISE EXCEPTION 'Old attempt finished new lease';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  result:=public.preview_finish_club_notification('claim',(next_job->>'id')::uuid,(next_job->>'attempt_token')::uuid,'simulated');
  IF result->>'delivery_status'<>'simulated' THEN RAISE EXCEPTION 'Dry run marked as sent'; END IF;
  PERFORM public.preview_finish_club_notification('claim',(next_job->>'id')::uuid,(next_job->>'attempt_token')::uuid,'simulated');
  PERFORM set_config('test.application_job',public.preview_claim_club_notification('application')::text,true);
END $$;
RESET ROLE;
UPDATE club_preview_private.application_notifications SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE club_id='99000000-0000-0000-0000-000000000002';
SET LOCAL ROLE service_role;
DO $$ DECLARE job jsonb:=current_setting('test.application_job')::jsonb; BEGIN
  IF public.preview_claim_club_notification('application') IS NOT NULL THEN RAISE EXCEPTION 'Expired lease automatically resent'; END IF;
  BEGIN
    PERFORM public.preview_retry_club_notification('application',(job->>'id')::uuid,(job->>'attempt_token')::uuid);
    RAISE EXCEPTION 'Uncertain delivery retried';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM club_preview_private.application_notifications WHERE club_id='99000000-0000-0000-0000-000000000002' AND delivery_status='uncertain') THEN RAISE EXCEPTION 'Expired lease not uncertain'; END IF;
  IF has_function_privilege('authenticated','public.preview_finish_club_notification(text,uuid,uuid,text,text,text)','execute') OR has_function_privilege('anon','public.preview_retry_club_notification(text,uuid,uuid)','execute') THEN RAISE EXCEPTION 'Worker permission leak'; END IF;
END $$;
SELECT 'PASS: notification leases, token fencing, simulation, permissions and uncertain delivery checks; rolling back' AS notification_check;
ROLLBACK;
