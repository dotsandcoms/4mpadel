-- Synthetic fixtures only. Compose after member-add.sql inside one rollback.
BEGIN;
INSERT INTO auth.users(id,email) VALUES('99200000-0000-0000-0000-000000000001','add-admin@example.invalid'),('99200000-0000-0000-0000-000000000002','add-custom@example.invalid');
INSERT INTO public.admin_sidebar_permissions(email,role) VALUES('add-admin@example.invalid','super_admin'),('add-custom@example.invalid','custom');
INSERT INTO public.clubs(id,name,short_name) VALUES('99200000-0000-0000-0000-000000000003','Synthetic add member','Synthetic');
INSERT INTO public.players(id,name,email) OVERRIDING SYSTEM VALUE VALUES(-992001,'Synthetic player',' ADD-PLAYER@example.invalid '),(-992002,'Rollback player','rollback-player@example.invalid');
SELECT set_config('test.add_player',jsonb_build_object('id',id,'name',name,'email',email)::text,true) FROM public.players WHERE id=-992001;
SELECT set_config('test.rollback_player',jsonb_build_object('id',id,'name',name,'email',email)::text,true) FROM public.players WHERE id=-992002;
SET LOCAL ROLE anon;
DO $$ BEGIN
  PERFORM public.preview_add_club_member('99200000-0000-0000-0000-000000000010','99200000-0000-0000-0000-000000000003',-992001,'owner',current_setting('test.add_player')::jsonb);
  RAISE EXCEPTION 'Anonymous add allowed';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','',true);
DO $$ BEGIN
  PERFORM public.preview_add_club_member('99200000-0000-0000-0000-000000000010','99200000-0000-0000-0000-000000000003',-992001,'owner',current_setting('test.add_player')::jsonb);
  RAISE EXCEPTION 'Unsigned add allowed';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
SELECT set_config('request.jwt.claim.sub','99200000-0000-0000-0000-000000000002',true);
DO $$ BEGIN
  PERFORM public.preview_add_club_member('99200000-0000-0000-0000-000000000010','99200000-0000-0000-0000-000000000003',-992001,'owner',current_setting('test.add_player')::jsonb);
  RAISE EXCEPTION 'Custom admin add allowed';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
SELECT set_config('request.jwt.claim.sub','99200000-0000-0000-0000-000000000001',true);
DO $$ DECLARE result jsonb; BEGIN
  BEGIN
    PERFORM public.preview_add_club_member('99200000-0000-0000-0000-000000000010','99200000-0000-0000-0000-000000000003',-992001,'super_admin',current_setting('test.add_player')::jsonb);
    RAISE EXCEPTION 'Invalid role allowed';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.preview_add_club_member('99200000-0000-0000-0000-000000000010','99200000-0000-0000-0000-000000000003',-992001,'owner',jsonb_set(current_setting('test.add_player')::jsonb,'{name}','"Old name"'));
    RAISE EXCEPTION 'Stale player accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  result:=public.preview_add_club_member('99200000-0000-0000-0000-000000000010','99200000-0000-0000-0000-000000000003',-992001,'owner',current_setting('test.add_player')::jsonb);
  IF result->'member'->>'user_email'<>'add-player@example.invalid' OR result->>'notification'<>'pending' THEN RAISE EXCEPTION 'Wrong member/notification'; END IF;
  result:=public.preview_add_club_member('99200000-0000-0000-0000-000000000010','99200000-0000-0000-0000-000000000003',-992001,'owner',current_setting('test.add_player')::jsonb);
  IF result->>'already_applied'<>'true' THEN RAISE EXCEPTION 'Retry not idempotent'; END IF;
  BEGIN
    PERFORM public.preview_add_club_member('99200000-0000-0000-0000-000000000010','99200000-0000-0000-0000-000000000003',-992001,'staff',current_setting('test.add_player')::jsonb);
    RAISE EXCEPTION 'Operation changed intent';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  BEGIN
    PERFORM public.preview_add_club_member('99200000-0000-0000-0000-000000000011','99200000-0000-0000-0000-000000000003',-992001,'admin',current_setting('test.add_player')::jsonb);
    RAISE EXCEPTION 'Duplicate membership overwritten';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    PERFORM * FROM club_preview_private.member_add_notifications;
    RAISE EXCEPTION 'Private outbox exposed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
UPDATE public.admin_sidebar_permissions SET role='custom' WHERE email='add-admin@example.invalid';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  PERFORM public.preview_add_club_member('99200000-0000-0000-0000-000000000010','99200000-0000-0000-0000-000000000003',-992001,'owner',current_setting('test.add_player')::jsonb);
  RAISE EXCEPTION 'Revoked admin replayed';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
RESET ROLE;
UPDATE public.admin_sidebar_permissions SET role='super_admin' WHERE email='add-admin@example.invalid';
CREATE FUNCTION club_preview_private.fail_member_add_outbox_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic outbox failure'; END $$;
CREATE TRIGGER fail_member_add_outbox_test BEFORE INSERT ON club_preview_private.member_add_notifications FOR EACH ROW EXECUTE FUNCTION club_preview_private.fail_member_add_outbox_test();
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  PERFORM public.preview_add_club_member('99200000-0000-0000-0000-000000000012','99200000-0000-0000-0000-000000000003',-992002,'admin',current_setting('test.rollback_player')::jsonb);
  RAISE EXCEPTION 'Outbox failure committed';
EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Synthetic outbox failure' THEN RAISE; END IF; END $$;
RESET ROLE;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.club_members WHERE club_id='99200000-0000-0000-0000-000000000003' AND player_id=-992002) THEN RAISE EXCEPTION 'Membership escaped rollback'; END IF;
  IF EXISTS(SELECT 1 FROM club_preview_private.member_add_operations WHERE operation_id='99200000-0000-0000-0000-000000000012') THEN RAISE EXCEPTION 'Audit escaped rollback'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.club_members WHERE club_id='99200000-0000-0000-0000-000000000003' AND player_id=-992001 AND role='owner') THEN RAISE EXCEPTION 'Duplicate changed role'; END IF;
  IF (SELECT count(*) FROM club_preview_private.member_add_notifications WHERE operation_id='99200000-0000-0000-0000-000000000010')<>1 THEN RAISE EXCEPTION 'Duplicate notification'; END IF;
  IF NOT EXISTS(SELECT 1 FROM club_preview_private.member_add_notifications WHERE operation_id='99200000-0000-0000-0000-000000000010' AND template='club_member_added' AND payload='{"clubName":"Synthetic","role":"owner","playerName":"Synthetic player"}'::jsonb AND delivery_status='pending') THEN RAISE EXCEPTION 'Notification source parity failed'; END IF;
END $$;
SELECT 'PASS: synthetic member add, authority, snapshot, duplicate, idempotency and outbox rollback checks' AS verification;
ROLLBACK;
