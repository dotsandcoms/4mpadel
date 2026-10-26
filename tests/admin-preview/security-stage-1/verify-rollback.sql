-- SYNTHETIC LOCAL DATABASE ONLY. Checks rollback without changing test data.
BEGIN;
DO $$ BEGIN
  IF to_regnamespace('admin_rebuild_security') IS NOT NULL THEN RAISE EXCEPTION 'Helper schema survived rollback'; END IF;
  IF EXISTS(SELECT 1 FROM pg_policies WHERE policyname LIKE 'Rebuild %') THEN RAISE EXCEPTION 'New policies survived rollback'; END IF;
  IF NOT has_table_privilege('authenticated','public.payments','TRUNCATE') THEN RAISE EXCEPTION 'Audited grants not restored'; END IF;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","email":"player@example.com","role":"authenticated"}',true);
DO $$ DECLARE affected int; BEGIN
  UPDATE public.tournament_divisions SET name='Rollback test' WHERE id=1;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'Original policy behaviour not restored'; END IF;
END $$;
ROLLBACK;
