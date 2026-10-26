-- LOCAL CANDIDATE ONLY: not applied to staging or production.
-- Closes the verified authenticated-write=true policies without removing public
-- reads. Platform authority matches ClubManager's Groups entry point: current
-- exact-email super admin or a direct Clubs module grant. Delegated club/org
-- association editing remains held pending its own reviewed server contract.
-- This is NOT an atomic group-branding/member/venue-cascade implementation and
-- does not make the other club profile/storage/member policies safe by itself.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY['club_groups','club_organisations'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=target AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'Expected RLS-enabled public.%', target;
    END IF;
    -- Refuse drift from the deployed broad-write contract this candidate fixes.
    IF NOT EXISTS (
      SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=target
        AND p.polname=CASE target WHEN 'club_groups' THEN 'Authenticated manage club groups' ELSE 'Authenticated manage club organisations' END
        AND p.polcmd='*' AND p.polpermissive
        AND p.polroles=ARRAY['authenticated'::regrole::oid]
        AND pg_get_expr(p.polqual,p.polrelid)='true'
        AND pg_get_expr(p.polwithcheck,p.polrelid)='true'
    ) THEN
      RAISE EXCEPTION 'Unexpected write-policy contract for public.%', target;
    END IF;
  END LOOP;
END $$;

CREATE SCHEMA club_relationship_guard;
REVOKE ALL ON SCHEMA club_relationship_guard FROM PUBLIC, anon, authenticated;

CREATE FUNCTION club_relationship_guard.platform_manager()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id=(SELECT auth.uid()) AND u.deleted_at IS NULL AND u.email IS NOT NULL
      AND (
        public.is_super_admin(u.email) IS TRUE
        OR (
          SELECT count(*)=1 AND bool_and('clubs'=ANY(coalesce(p.allowed_tabs,ARRAY[]::text[])))
          FROM public.admin_sidebar_permissions p
          WHERE lower(p.email)=lower(u.email)
        )
      )
  );
$$;
REVOKE ALL ON FUNCTION club_relationship_guard.platform_manager() FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA club_relationship_guard TO anon, authenticated;
GRANT EXECUTE ON FUNCTION club_relationship_guard.platform_manager() TO anon, authenticated;

-- Restrictive guards compose with EVERY existing/future permissive policy.
-- SELECT is deliberately unaffected, including public directory reads.
CREATE POLICY platform_relationship_insert ON public.club_organisations AS RESTRICTIVE
  FOR INSERT TO anon, authenticated WITH CHECK ((SELECT club_relationship_guard.platform_manager()));
CREATE POLICY platform_relationship_update ON public.club_organisations AS RESTRICTIVE
  FOR UPDATE TO anon, authenticated USING ((SELECT club_relationship_guard.platform_manager()))
  WITH CHECK ((SELECT club_relationship_guard.platform_manager()));
CREATE POLICY platform_relationship_delete ON public.club_organisations AS RESTRICTIVE
  FOR DELETE TO anon, authenticated USING ((SELECT club_relationship_guard.platform_manager()));
CREATE POLICY platform_group_insert ON public.club_groups AS RESTRICTIVE
  FOR INSERT TO anon, authenticated WITH CHECK ((SELECT club_relationship_guard.platform_manager()));
CREATE POLICY platform_group_update ON public.club_groups AS RESTRICTIVE
  FOR UPDATE TO anon, authenticated USING ((SELECT club_relationship_guard.platform_manager()))
  WITH CHECK ((SELECT club_relationship_guard.platform_manager()));
CREATE POLICY platform_group_delete ON public.club_groups AS RESTRICTIVE
  FOR DELETE TO anon, authenticated USING ((SELECT club_relationship_guard.platform_manager()));
COMMIT;
