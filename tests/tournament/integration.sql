\set ON_ERROR_STOP on
do $$ begin
  if current_database() <> 'fourm_tournament_integration_test'
    or exists (select 1 from pg_namespace where nspname in ('auth','private'))
    or exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public') then
    raise exception 'Use an empty disposable fourm_tournament_integration_test database';
  end if;
end $$;
SET client_min_messages TO warning;
BEGIN;
\ir schema.sql
\ir ../../supabase/migrations/20260916110000_tournament_schedule.sql
\ir ../../supabase/migrations/20260916120000_tournament_operations.sql
\ir ../../supabase/migrations/20260916130000_tournament_preparation.sql
\ir ../../supabase/migrations/20261120071852_reconcile_hosted_tournament_event_year_licences.sql
\ir ../../supabase/migrations/20261120072537_scope_host_tournament_draw_preparation.sql
\ir ../../supabase/migrations/20261120074419_scope_host_tournament_rotation.sql
\ir ../../supabase/migrations/20261120075155_scope_host_fixed_group_qualification.sql
CREATE FUNCTION pg_temp.expect_denied(query text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE query; EXCEPTION WHEN insufficient_privilege THEN RETURN; END;
 RAISE EXCEPTION 'Expected permission denial: %',query;
END $$;
\ir fixtures.generated.sql
\ir event-year-licences.sql
\ir host-draw-preparation.sql
\ir host-rotation-preparation.sql
\ir host-group-qualification.sql
ROLLBACK;
