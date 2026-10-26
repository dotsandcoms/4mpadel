\set ON_ERROR_STOP on
INSERT INTO public.clubs(id,name,status,verified) VALUES('20000000-0000-0000-0000-000000000004','Rollback club','unclaimed',false);
INSERT INTO public.club_claim_requests VALUES('30000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000004','claimant@example.invalid',1,'pending',null,null,null);
SELECT set_config('test.rollback_claim',jsonb_build_object('club_id',club_id,'requester_email',requester_email,'requester_player_id',requester_player_id,'status',status)::text,false)
FROM public.club_claim_requests WHERE id='30000000-0000-0000-0000-000000000004';
CREATE FUNCTION club_preview_private.fail_notification_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic outbox failure'; END $$;
CREATE TRIGGER fail_notification_test BEFORE INSERT ON club_preview_private.claim_notifications FOR EACH ROW EXECUTE FUNCTION club_preview_private.fail_notification_test();
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
DO $$ BEGIN
  BEGIN
    PERFORM public.preview_decide_club_claim('30000000-0000-0000-0000-000000000004','approved',NULL,'20000000-0000-0000-0000-000000000004',current_setting('test.rollback_claim')::jsonb);
    RAISE EXCEPTION 'Claim unexpectedly committed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Synthetic outbox failure' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.clubs WHERE name='Rollback club' AND status='unclaimed' AND verified=false) THEN RAISE EXCEPTION 'Club change leaked'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.club_claim_requests WHERE id='30000000-0000-0000-0000-000000000004' AND status='pending' AND reviewed_at IS NULL) THEN RAISE EXCEPTION 'Claim change leaked'; END IF;
  IF EXISTS(SELECT 1 FROM public.club_members WHERE club_id='20000000-0000-0000-0000-000000000004') THEN RAISE EXCEPTION 'Membership leaked'; END IF;
  IF EXISTS(SELECT 1 FROM club_preview_private.claim_decisions WHERE claim_id='30000000-0000-0000-0000-000000000004') THEN RAISE EXCEPTION 'Audit leaked'; END IF;
END $$;
DROP TRIGGER fail_notification_test ON club_preview_private.claim_notifications;
DROP FUNCTION club_preview_private.fail_notification_test();
