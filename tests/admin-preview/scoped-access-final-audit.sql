-- READ-ONLY diagnostic. Run in Supabase SQL Editor, not as a migration.
-- One result includes all policies (including restrictive policies), privileges,
-- RLS flags and the remaining event-management helper definitions.
-- Contains metadata only; no player, payment or membership rows are queried.
WITH targets(name) AS (
  VALUES ('admin_sidebar_permissions'), ('calendar'), ('tournament_divisions'),
    ('commerce_config'), ('event_activity_log'), ('event_creation_audit'),
    ('payments'), ('event_registrations'), ('tournament_participants'),
    ('organisation_members'), ('club_members'), ('federation_members')
)
SELECT jsonb_build_object(
  'tables', (
    SELECT jsonb_agg(jsonb_build_object(
      'table', c.relname, 'rls_enabled', c.relrowsecurity,
      'rls_forced', c.relforcerowsecurity,
      'owner', pg_get_userbyid(c.relowner)
    ))
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname IN (SELECT name FROM targets)
      AND c.relkind IN ('r', 'p')
  ),
  'all_target_policies', (
    SELECT jsonb_agg(to_jsonb(p)) FROM pg_policies p
    WHERE schemaname = 'public' AND tablename IN (SELECT name FROM targets)
  ),
  'api_table_grants', (
    SELECT jsonb_agg(to_jsonb(g)) FROM (
      SELECT table_name, grantee, privilege_type
      FROM information_schema.table_privileges
      WHERE table_schema = 'public' AND table_name IN (SELECT name FROM targets)
        AND grantee IN ('anon', 'authenticated', 'PUBLIC')
    ) g
  ),
  'api_column_grants', (
    SELECT jsonb_agg(to_jsonb(g)) FROM (
      SELECT table_name, column_name, grantee, privilege_type
      FROM information_schema.column_privileges
      WHERE table_schema = 'public' AND table_name IN (SELECT name FROM targets)
        AND grantee IN ('anon', 'authenticated', 'PUBLIC')
    ) g
  ),
  'event_helper_definitions', (
    SELECT jsonb_agg(jsonb_build_object(
      'name', p.proname, 'definition', pg_get_functiondef(p.oid),
      'execute_acl', p.proacl
    ))
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND p.proname IN ('can_manage_event', 'can_manage_calendar_event',
        'is_organisation_member', 'is_org_member', 'get_player_id_by_email')
  ),
  'target_triggers', (
    SELECT jsonb_agg(jsonb_build_object(
      'table', c.relname, 'trigger', t.tgname,
      'definition', pg_get_triggerdef(t.oid),
      'function_definition', pg_get_functiondef(t.tgfoid)
    ))
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal
      AND c.relname IN (SELECT name FROM targets)
  )
) AS scoped_access_audit;
