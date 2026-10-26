-- STAGING CANDIDATE ONLY. Not an automatic Supabase migration.
-- Scope: division writes, event-log reads, excess API-role privileges.
-- Does NOT fix calendar writes, payment integrity, public calendar fields,
-- legacy hard-coded super admins, or legacy identity-helper wildcard matching.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM (VALUES ('tournament_divisions'), ('event_activity_log'), ('event_creation_audit')) AS expected(name)
    LEFT JOIN pg_catalog.pg_class c ON c.oid = to_regclass('public.' || expected.name)
    WHERE c.oid IS NULL OR NOT c.relrowsecurity
  ) THEN RAISE EXCEPTION 'Required scoped tables must exist with RLS enabled'; END IF;
END $$;

-- Refuse to overwrite a previous installation or silently accept schema drift.
CREATE SCHEMA admin_rebuild_security;
REVOKE ALL ON SCHEMA admin_rebuild_security FROM PUBLIC;
GRANT USAGE ON SCHEMA admin_rebuild_security TO authenticated, service_role;

CREATE FUNCTION admin_rebuild_security.can_access_event(p_event_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT auth.uid() IS NOT NULL
    AND NULLIF(auth.jwt() ->> 'email', '') IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.calendar c WHERE c.id = p_event_id AND (
        -- Preserve deployed organiser/co-admin/organisation-creator authority.
        public.can_manage_event(c.id)
        -- Preserve organisation and club management relationships.
        OR public.can_manage_calendar_event(c.organisation_id, c.club_id)
        -- A direct event assignment is an independent, event-specific grant.
        -- Empty/malformed arrays never imply global access here.
        OR EXISTS (
          SELECT 1 FROM public.admin_sidebar_permissions p
          WHERE lower(p.email) = lower(auth.jwt() ->> 'email')
            AND EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(
                CASE WHEN jsonb_typeof(p.module_permissions #> '{event-mgmt,allowedEvents}') = 'array'
                  THEN p.module_permissions #> '{event-mgmt,allowedEvents}'
                  ELSE '[]'::jsonb END
              ) AS assigned(id)
              WHERE assigned.id = c.id::text
            )
        )
      )
    );
$$;
REVOKE ALL ON FUNCTION admin_rebuild_security.can_access_event(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_rebuild_security.can_access_event(bigint) TO authenticated, service_role;

-- Guards are RESTRICTIVE, so an older permissive policy cannot bypass them.
-- A matching permissive policy also supports directly assigned event managers.
CREATE POLICY "Rebuild scoped division access" ON public.tournament_divisions
  FOR ALL TO authenticated
  USING (admin_rebuild_security.can_access_event(event_id))
  WITH CHECK (admin_rebuild_security.can_access_event(event_id));
CREATE POLICY "Rebuild division insert guard" ON public.tournament_divisions
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (admin_rebuild_security.can_access_event(event_id));
CREATE POLICY "Rebuild division update guard" ON public.tournament_divisions
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (admin_rebuild_security.can_access_event(event_id))
  WITH CHECK (admin_rebuild_security.can_access_event(event_id));
CREATE POLICY "Rebuild division delete guard" ON public.tournament_divisions
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (admin_rebuild_security.can_access_event(event_id));

CREATE POLICY "Rebuild scoped activity read" ON public.event_activity_log
  FOR SELECT TO authenticated USING (admin_rebuild_security.can_access_event(event_id));
CREATE POLICY "Rebuild activity read guard" ON public.event_activity_log
  AS RESTRICTIVE FOR SELECT TO authenticated USING (admin_rebuild_security.can_access_event(event_id));
CREATE POLICY "Rebuild scoped attribution read" ON public.event_creation_audit
  FOR SELECT TO authenticated USING (admin_rebuild_security.can_access_event(event_id));
CREATE POLICY "Rebuild attribution read guard" ON public.event_creation_audit
  AS RESTRICTIVE FOR SELECT TO authenticated USING (admin_rebuild_security.can_access_event(event_id));

-- No data is deleted. These privileges are not needed for normal API CRUD.
-- postgres/service_role ownership and grants are left untouched.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE
  public.admin_sidebar_permissions, public.calendar, public.tournament_divisions,
  public.commerce_config, public.event_activity_log, public.event_creation_audit,
  public.payments, public.event_registrations, public.tournament_participants,
  public.organisation_members, public.club_members, public.federation_members
FROM anon, authenticated;

-- Fail the transaction if inheritance or PUBLIC still supplies these grants.
DO $$ DECLARE target text; api_role text; capability text; BEGIN
  FOREACH target IN ARRAY ARRAY['admin_sidebar_permissions','calendar','tournament_divisions',
    'commerce_config','event_activity_log','event_creation_audit','payments',
    'event_registrations','tournament_participants','organisation_members','club_members','federation_members'] LOOP
    FOREACH api_role IN ARRAY ARRAY['anon','authenticated'] LOOP
      FOREACH capability IN ARRAY ARRAY['TRUNCATE','REFERENCES','TRIGGER'] LOOP
        IF has_table_privilege(api_role, 'public.' || target, capability) THEN
          RAISE EXCEPTION 'Unexpected inherited privilege: %.% for %', target, capability, api_role;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

COMMIT;
