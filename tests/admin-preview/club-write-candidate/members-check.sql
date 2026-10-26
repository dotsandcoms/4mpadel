-- Synthetic transaction only. Requires members.sql installed in disposable DB
-- or composed inside this rollback transaction. Never sends email.
BEGIN;
INSERT INTO auth.users(id,email) VALUES
('99100000-0000-0000-0000-000000000001','member-test-admin@example.invalid'),
('99100000-0000-0000-0000-000000000002','member-test-custom@example.invalid');
INSERT INTO public.admin_sidebar_permissions(email,role) VALUES
('member-test-admin@example.invalid','super_admin'),('member-test-custom@example.invalid','custom');
INSERT INTO public.clubs(id,name) VALUES('99100000-0000-0000-0000-000000000003','Synthetic membership tests');
INSERT INTO public.club_members(id,club_id,user_email,role) VALUES
('99100000-0000-0000-0000-000000000004','99100000-0000-0000-0000-000000000003','owner@example.invalid','owner'),
('99100000-0000-0000-0000-000000000005','99100000-0000-0000-0000-000000000003','staff@example.invalid','staff');
SELECT set_config('test.member_'||right(id::text,1),jsonb_build_object('id',id,'club_id',club_id,'player_id',player_id,'user_email',user_email,'role',role,'created_at',created_at)::text,true)
FROM public.club_members WHERE club_id='99100000-0000-0000-0000-000000000003';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','',true);
DO $$ BEGIN
  PERFORM public.preview_manage_club_member('99100000-0000-0000-0000-000000000010','99100000-0000-0000-0000-000000000003','99100000-0000-0000-0000-000000000005','change_role','admin',current_setting('test.member_5')::jsonb);
  RAISE EXCEPTION 'Unsigned actor changed membership';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
SELECT set_config('request.jwt.claim.sub','99100000-0000-0000-0000-000000000002',true);
DO $$ BEGIN
  PERFORM public.preview_manage_club_member('99100000-0000-0000-0000-000000000010','99100000-0000-0000-0000-000000000003','99100000-0000-0000-0000-000000000005','change_role','admin',current_setting('test.member_5')::jsonb);
  RAISE EXCEPTION 'Custom admin changed membership';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
SELECT set_config('request.jwt.claim.sub','99100000-0000-0000-0000-000000000001',true);
DO $$ DECLARE result jsonb; BEGIN
  BEGIN
    PERFORM public.preview_manage_club_member('99100000-0000-0000-0000-000000000010','99100000-0000-0000-0000-000000000099','99100000-0000-0000-0000-000000000005','change_role','admin',current_setting('test.member_5')::jsonb);
    RAISE EXCEPTION 'Cross-club snapshot accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.preview_manage_club_member('99100000-0000-0000-0000-000000000010','99100000-0000-0000-0000-000000000003','99100000-0000-0000-0000-000000000005','change_role','super_admin',current_setting('test.member_5')::jsonb);
    RAISE EXCEPTION 'Unsupported role accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.preview_manage_club_member('99100000-0000-0000-0000-000000000010','99100000-0000-0000-0000-000000000003','99100000-0000-0000-0000-000000000005','change_role','admin',jsonb_set(current_setting('test.member_5')::jsonb,'{role}','"owner"'));
    RAISE EXCEPTION 'Stale role accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  BEGIN
    PERFORM public.preview_manage_club_member('99100000-0000-0000-0000-000000000010','99100000-0000-0000-0000-000000000003','99100000-0000-0000-0000-000000000005','change_role','admin',jsonb_set(current_setting('test.member_5')::jsonb,'{user_email}','"wrong@example.invalid"'));
    RAISE EXCEPTION 'Stale identity accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  BEGIN
    PERFORM public.preview_manage_club_member('99100000-0000-0000-0000-000000000010','99100000-0000-0000-0000-000000000003','99100000-0000-0000-0000-000000000005','change_role','admin',jsonb_set(current_setting('test.member_5')::jsonb,'{created_at}','"2000-01-01T00:00:00Z"'));
    RAISE EXCEPTION 'Recreated membership accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  result:=public.preview_manage_club_member('99100000-0000-0000-0000-000000000010','99100000-0000-0000-0000-000000000003','99100000-0000-0000-0000-000000000005','change_role','admin',current_setting('test.member_5')::jsonb);
  IF result->'member'->>'role'<>'admin' THEN RAISE EXCEPTION 'Role not updated'; END IF;
  result:=public.preview_manage_club_member('99100000-0000-0000-0000-000000000010','99100000-0000-0000-0000-000000000003','99100000-0000-0000-0000-000000000005','change_role','admin',current_setting('test.member_5')::jsonb);
  IF result->>'already_applied'<>'true' THEN RAISE EXCEPTION 'Retry not idempotent'; END IF;
  BEGIN
    PERFORM public.preview_manage_club_member('99100000-0000-0000-0000-000000000010','99100000-0000-0000-0000-000000000003','99100000-0000-0000-0000-000000000005','change_role','owner',current_setting('test.member_5')::jsonb);
    RAISE EXCEPTION 'Reused operation changed intent';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  -- Last-owner removal remains permitted to preserve current business logic.
  result:=public.preview_manage_club_member('99100000-0000-0000-0000-000000000011','99100000-0000-0000-0000-000000000003','99100000-0000-0000-0000-000000000004','remove',NULL,current_setting('test.member_4')::jsonb);
  IF result->>'removed'<>'true' OR result->>'no_owner'<>'true' THEN RAISE EXCEPTION 'Removal/owner warning invalid'; END IF;
  result:=public.preview_manage_club_member('99100000-0000-0000-0000-000000000011','99100000-0000-0000-0000-000000000003','99100000-0000-0000-0000-000000000004','remove',NULL,current_setting('test.member_4')::jsonb);
  IF result->>'already_applied'<>'true' THEN RAISE EXCEPTION 'Removal retry failed'; END IF;
END $$;
RESET ROLE;
-- Authority is checked afresh even when replaying a committed operation.
UPDATE public.admin_sidebar_permissions SET role='custom' WHERE email='member-test-admin@example.invalid';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  PERFORM public.preview_manage_club_member('99100000-0000-0000-0000-000000000010','99100000-0000-0000-0000-000000000003','99100000-0000-0000-0000-000000000005','change_role','admin',current_setting('test.member_5')::jsonb);
  RAISE EXCEPTION 'Revoked admin replayed operation';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
DO $$ BEGIN
  PERFORM * FROM club_preview_private.member_operations;
  RAISE EXCEPTION 'Authenticated actor read private audit';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
RESET ROLE;
UPDATE public.admin_sidebar_permissions SET role='super_admin' WHERE email='member-test-admin@example.invalid';
SELECT set_config('test.member_current',jsonb_build_object('id',id,'club_id',club_id,'player_id',player_id,'user_email',user_email,'role',role,'created_at',created_at)::text,true) FROM public.club_members WHERE id='99100000-0000-0000-0000-000000000005';
SET LOCAL ROLE authenticated;
DO $$ DECLARE result jsonb; snapshot jsonb:=current_setting('test.member_current')::jsonb; BEGIN
  result:=public.preview_manage_club_member('99100000-0000-0000-0000-000000000013','99100000-0000-0000-0000-000000000003','99100000-0000-0000-0000-000000000005','change_role','owner',snapshot);
  IF result->'member'->>'role'<>'owner' THEN RAISE EXCEPTION 'Owner role failed'; END IF;
  snapshot:=jsonb_set(snapshot,'{role}','"owner"');
  result:=public.preview_manage_club_member('99100000-0000-0000-0000-000000000014','99100000-0000-0000-0000-000000000003','99100000-0000-0000-0000-000000000005','change_role','staff',snapshot);
  IF result->'member'->>'role'<>'staff' OR result->>'no_owner'<>'true' THEN RAISE EXCEPTION 'Last-owner demotion changed legacy behavior'; END IF;
  snapshot:=jsonb_set(snapshot,'{role}','"staff"');
  PERFORM public.preview_manage_club_member('99100000-0000-0000-0000-000000000015','99100000-0000-0000-0000-000000000003','99100000-0000-0000-0000-000000000005','change_role','admin',snapshot);
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN
  PERFORM public.preview_manage_club_member('99100000-0000-0000-0000-000000000016','99100000-0000-0000-0000-000000000003','99100000-0000-0000-0000-000000000005','remove',NULL,current_setting('test.member_current')::jsonb);
  RAISE EXCEPTION 'Anonymous execution allowed';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
RESET ROLE;
-- Audit failure must roll back the membership mutation too.
CREATE FUNCTION club_preview_private.fail_member_audit_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic audit failure'; END $$;
CREATE TRIGGER fail_member_audit_test BEFORE INSERT ON club_preview_private.member_operations FOR EACH ROW EXECUTE FUNCTION club_preview_private.fail_member_audit_test();
SELECT set_config('test.member_current',jsonb_build_object('id',id,'club_id',club_id,'player_id',player_id,'user_email',user_email,'role',role,'created_at',created_at)::text,true) FROM public.club_members WHERE id='99100000-0000-0000-0000-000000000005';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  PERFORM public.preview_manage_club_member('99100000-0000-0000-0000-000000000012','99100000-0000-0000-0000-000000000003','99100000-0000-0000-0000-000000000005','remove',NULL,current_setting('test.member_current')::jsonb);
  RAISE EXCEPTION 'Failed audit committed';
EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Synthetic audit failure' THEN RAISE; END IF; END $$;
RESET ROLE;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.club_members WHERE id='99100000-0000-0000-0000-000000000005' AND role='admin') THEN RAISE EXCEPTION 'Mutation escaped audit rollback'; END IF;
  IF (SELECT count(*) FROM club_preview_private.member_operations WHERE club_id='99100000-0000-0000-0000-000000000003')<>5 THEN RAISE EXCEPTION 'Wrong audit count'; END IF;
  IF has_function_privilege('anon','public.preview_manage_club_member(uuid,uuid,uuid,text,text,jsonb)','execute') THEN RAISE EXCEPTION 'Anonymous access granted'; END IF;
END $$;
SELECT 'PASS: synthetic member role/removal, snapshot, authority, retry and audit rollback checks' AS verification;
ROLLBACK;
