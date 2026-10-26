\set ON_ERROR_STOP on
-- Force an audit failure and prove the profile update is rolled back with it.
CREATE FUNCTION club_preview_private.fail_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic audit failure'; END $$;
CREATE TRIGGER fail_test_audit BEFORE INSERT ON club_preview_private.profile_audit FOR EACH ROW EXECUTE FUNCTION club_preview_private.fail_test_audit();
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
DO $$ BEGIN
  BEGIN
    PERFORM public.preview_update_club_profile('20000000-0000-0000-0000-000000000001','{"name":"Should roll back"}','{"name":"Updated club"}');
    RAISE EXCEPTION 'Save unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Synthetic audit failure' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.clubs WHERE name='Updated club') OR (SELECT count(*) FROM club_preview_private.profile_audit)<>1 THEN
    RAISE EXCEPTION 'Audit and update were not atomic'; END IF;
END $$;
DROP TRIGGER fail_test_audit ON club_preview_private.profile_audit;
DROP FUNCTION club_preview_private.fail_test_audit();
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','',false);
DO $$ BEGIN
  PERFORM public.preview_update_club_profile('20000000-0000-0000-0000-000000000001','{"name":"Unsigned"}','{"name":"Updated club"}');
  RAISE EXCEPTION 'Unsigned save succeeded';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
RESET ROLE;
INSERT INTO public.admin_sidebar_permissions VALUES('ADMIN@example.invalid','super_admin');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
DO $$ BEGIN
  PERFORM public.preview_update_club_profile('20000000-0000-0000-0000-000000000001','{"name":"Ambiguous"}','{"name":"Updated club"}');
  RAISE EXCEPTION 'Ambiguous role save succeeded';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
RESET ROLE;
