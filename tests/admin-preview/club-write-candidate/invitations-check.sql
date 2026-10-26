-- Synthetic only. Candidate and checks may be composed inside one rollback.
BEGIN;
INSERT INTO auth.users(id,email) VALUES('99300000-0000-0000-0000-000000000001','invite-admin@example.invalid'),('99300000-0000-0000-0000-000000000002','invite-custom@example.invalid');
INSERT INTO public.admin_sidebar_permissions(email,role) VALUES('invite-admin@example.invalid','super_admin'),('invite-custom@example.invalid','custom');
INSERT INTO public.clubs(id,name) VALUES('99300000-0000-0000-0000-000000000003','Synthetic invite club');
INSERT INTO public.players(id,name,email) OVERRIDING SYSTEM VALUE VALUES(-993001,'Synthetic invite player','Invited@example.invalid');
SELECT set_config('test.invite_club',jsonb_build_object('id',id,'name',name)::text,true) FROM public.clubs WHERE id='99300000-0000-0000-0000-000000000003';
SELECT set_config('test.invite_player',jsonb_build_object('id',id,'name',name,'email',email)::text,true) FROM public.players WHERE id=-993001;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','99300000-0000-0000-0000-000000000002',true);
DO $$ BEGIN
 PERFORM public.preview_create_club_invitation('99300000-0000-0000-0000-000000000010','99300000-0000-0000-0000-000000000003','invited@example.invalid',current_setting('test.invite_club')::jsonb,current_setting('test.invite_player')::jsonb);
 RAISE EXCEPTION 'Custom actor invited';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
SELECT set_config('request.jwt.claim.sub','99300000-0000-0000-0000-000000000001',true);
DO $$ DECLARE result jsonb; bad_email text; BEGIN
 FOREACH bad_email IN ARRAY ARRAY['bad email@example.invalid','two@example.invalid,other@example.invalid','missing-at.example.invalid','a@example','a@.invalid','a..b@example.invalid','a@-domain.invalid',repeat('a',65)||'@example.invalid','a@'||repeat('d',64)||'.invalid',E'bad\n@example.invalid',repeat('x',250)||'@example.invalid'] LOOP
  BEGIN
   PERFORM public.preview_create_club_invitation('99300000-0000-0000-0000-000000000010','99300000-0000-0000-0000-000000000003',bad_email,current_setting('test.invite_club')::jsonb,NULL);
   RAISE EXCEPTION 'Invalid recipient accepted: %',bad_email;
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 END LOOP;
 BEGIN
  PERFORM public.preview_create_club_invitation('99300000-0000-0000-0000-000000000010','99300000-0000-0000-0000-000000000003','invited@example.invalid',current_setting('test.invite_club')::jsonb,NULL);
  RAISE EXCEPTION 'Changed profile existence accepted';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 BEGIN
  PERFORM public.preview_create_club_invitation('99300000-0000-0000-0000-000000000010','99300000-0000-0000-0000-000000000003','invited@example.invalid',jsonb_set(current_setting('test.invite_club')::jsonb,'{name}','"Old name"'),current_setting('test.invite_player')::jsonb);
  RAISE EXCEPTION 'Changed club accepted';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 result:=public.preview_create_club_invitation('99300000-0000-0000-0000-000000000010','99300000-0000-0000-0000-000000000003',' INVITED@example.invalid ',current_setting('test.invite_club')::jsonb,current_setting('test.invite_player')::jsonb);
 IF result ? 'token' OR result->>'email'<>'invited@example.invalid' OR result->>'status'<>'pending' OR result->>'profile_setup_status'<>'not_required' THEN RAISE EXCEPTION 'Unsafe/wrong receipt'; END IF;
 result:=public.preview_create_club_invitation('99300000-0000-0000-0000-000000000010','99300000-0000-0000-0000-000000000003','invited@example.invalid',current_setting('test.invite_club')::jsonb,current_setting('test.invite_player')::jsonb);
 IF result->>'already_applied'<>'true' THEN RAISE EXCEPTION 'Retry not idempotent'; END IF;
 result:=public.preview_create_club_invitation('99300000-0000-0000-0000-000000000011','99300000-0000-0000-0000-000000000003','invited@example.invalid',current_setting('test.invite_club')::jsonb,current_setting('test.invite_player')::jsonb);
 IF result->>'already_applied'<>'false' THEN RAISE EXCEPTION 'Send another invite incorrectly deduplicated'; END IF;
 BEGIN
  PERFORM public.preview_create_club_invitation('99300000-0000-0000-0000-000000000010','99300000-0000-0000-0000-000000000003','no-profile@example.invalid',current_setting('test.invite_club')::jsonb,NULL);
  RAISE EXCEPTION 'Operation changed intent';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 result:=public.preview_create_club_invitation('99300000-0000-0000-0000-000000000012','99300000-0000-0000-0000-000000000003','no-profile@example.invalid',current_setting('test.invite_club')::jsonb,NULL);
 IF result->>'profile_setup_required'<>'true' OR result->>'profile_setup_status'<>'unconnected' OR result->>'notification_status'<>'pending' THEN RAISE EXCEPTION 'Profile setup falsely connected'; END IF;
 result:=public.preview_create_club_invitation('99300000-0000-0000-0000-000000000014','99300000-0000-0000-0000-000000000003','literal*name@example.invalid',current_setting('test.invite_club')::jsonb,NULL);
 IF result->>'email'<>'literal*name@example.invalid' THEN RAISE EXCEPTION 'Literal star recipient altered'; END IF;
 BEGIN
  PERFORM * FROM club_preview_private.invitation_notifications;
  RAISE EXCEPTION 'Private queue readable';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
UPDATE public.admin_sidebar_permissions SET role='custom' WHERE email='invite-admin@example.invalid';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 PERFORM public.preview_create_club_invitation('99300000-0000-0000-0000-000000000010','99300000-0000-0000-0000-000000000003','invited@example.invalid',current_setting('test.invite_club')::jsonb,current_setting('test.invite_player')::jsonb);
 RAISE EXCEPTION 'Revoked admin replayed';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
RESET ROLE;
UPDATE public.admin_sidebar_permissions SET role='super_admin' WHERE email='invite-admin@example.invalid';
CREATE FUNCTION club_preview_private.fail_invitation_outbox_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic invitation queue failure'; END $$;
CREATE TRIGGER fail_invitation_outbox_test BEFORE INSERT ON club_preview_private.invitation_notifications FOR EACH ROW EXECUTE FUNCTION club_preview_private.fail_invitation_outbox_test();
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 PERFORM public.preview_create_club_invitation('99300000-0000-0000-0000-000000000013','99300000-0000-0000-0000-000000000003','rollback-invite@example.invalid',current_setting('test.invite_club')::jsonb,NULL);
 RAISE EXCEPTION 'Queue failure committed';
EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Synthetic invitation queue failure' THEN RAISE; END IF; END $$;
RESET ROLE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.club_members WHERE club_id='99300000-0000-0000-0000-000000000003') THEN RAISE EXCEPTION 'Invitation granted access prematurely'; END IF;
 IF EXISTS(SELECT 1 FROM public.club_claim_invites WHERE club_id='99300000-0000-0000-0000-000000000003' AND email='rollback-invite@example.invalid') OR EXISTS(SELECT 1 FROM club_preview_private.invitation_operations WHERE operation_id='99300000-0000-0000-0000-000000000013') THEN RAISE EXCEPTION 'Failed queue leaked changes'; END IF;
 IF (SELECT count(*) FROM public.club_claim_invites WHERE club_id='99300000-0000-0000-0000-000000000003')<>4 THEN RAISE EXCEPTION 'Incorrect invitation count'; END IF;
 IF (SELECT count(*) FROM club_preview_private.invitation_notifications WHERE operation_id IN ('99300000-0000-0000-0000-000000000010','99300000-0000-0000-0000-000000000012') AND delivery_status='pending')<>2 THEN RAISE EXCEPTION 'Wrong queue count'; END IF;
 IF has_function_privilege('anon','public.preview_create_club_invitation(uuid,uuid,text,jsonb,jsonb)','execute') THEN RAISE EXCEPTION 'Anonymous invite privilege'; END IF;
END $$;
SELECT 'PASS: invitation authorization, recipient validation, snapshots, idempotency, no access grant and atomic rollback checks' AS result;
ROLLBACK;
