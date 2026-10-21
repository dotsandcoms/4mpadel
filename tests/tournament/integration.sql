\set ON_ERROR_STOP on
-- Run ONLY against the disposable local instance described in README.md.
DO $$ BEGIN IF current_setting('port')<>'55439' THEN RAISE EXCEPTION 'This test is restricted to the disposable instance on port 55439'; END IF; END $$;
SET client_min_messages TO warning;
BEGIN;
DROP SCHEMA public CASCADE;
DROP SCHEMA auth CASCADE;
CREATE SCHEMA public;
\ir schema.sql
\ir ../../supabase/migrations/20260916110000_tournament_schedule.sql
\ir ../../supabase/migrations/20260916120000_tournament_operations.sql
\ir ../../supabase/migrations/20260916130000_tournament_preparation.sql
CREATE FUNCTION pg_temp.expect_denied(query text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE query; EXCEPTION WHEN insufficient_privilege THEN RETURN; END;
 RAISE EXCEPTION 'Expected permission denial: %',query;
END $$;
\ir fixtures.generated.sql
ROLLBACK;
