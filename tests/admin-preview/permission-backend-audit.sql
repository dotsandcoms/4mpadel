-- Manual verification only; NOT a migration. Do not apply through migrations.
-- Run in a trusted database SQL console. Returns schema/policy metadata, not user records.
-- Review output privately: policy expressions can contain legacy account identifiers.
BEGIN TRANSACTION READ ONLY;

-- Confirm the deployed permission schema instead of inferring it from history.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'admin_sidebar_permissions'
ORDER BY ordinal_position;

-- RLS enabled/forced and owner for permission and tenant-bound records.
SELECT n.nspname AS schema_name, c.relname AS table_name,
       c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced,
       pg_get_userbyid(c.relowner) AS table_owner
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  AND c.relname IN ('admin_sidebar_permissions', 'calendar', 'albums',
    'organisation_members', 'club_members', 'federation_members', 'payments', 'payment_refunds')
ORDER BY c.relname;

-- Every policy matters: permissive policies combine using OR.
SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN (
  'admin_sidebar_permissions', 'calendar', 'albums', 'organisation_members',
  'club_members', 'federation_members', 'payments', 'payment_refunds')
ORDER BY tablename, policyname;

SELECT grantee, table_name, privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public' AND table_name = 'admin_sidebar_permissions'
ORDER BY grantee, privilege_type;

-- Discover privileged permission helpers without executing them.
SELECT n.nspname AS schema_name, p.proname,
       pg_get_function_identity_arguments(p.oid) AS arguments,
       p.prosecdef AS security_definer, p.proconfig AS function_settings,
       p.proacl AS execute_acl
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prokind = 'f'
  AND (p.proname ILIKE '%admin%' OR p.proname ILIKE '%permission%')
ORDER BY p.proname;

ROLLBACK;
