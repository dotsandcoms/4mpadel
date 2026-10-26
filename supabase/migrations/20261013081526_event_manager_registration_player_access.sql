-- The Event Manager UI honours module_permissions.event-mgmt.allowedEvents,
-- but registration/payment RLS previously checked only organiser/co-admin/org
-- ownership. Assigned managers therefore saw a successful empty response.
SET LOCAL lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.can_manage_event(p_event_id bigint)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
    SELECT public.is_super_admin((SELECT auth.email()))
        OR (
            (SELECT auth.uid()) IS NOT NULL
            AND (SELECT public.account_is_active())
            AND EXISTS (
                SELECT 1 FROM public.admin_sidebar_permissions permissions
                WHERE lower(permissions.email) = lower((SELECT auth.email()))
                  AND (
                      -- Explicit assignments also grant the tab in hasPermission.
                      COALESCE(permissions.module_permissions->'event-mgmt'->'allowedEvents', '[]'::jsonb)
                          @> jsonb_build_array(p_event_id)
                      OR (
                          'event-mgmt' = ANY(permissions.allowed_tabs)
                          -- An empty/missing list means Full Access in Admin Manager.
                          AND COALESCE(permissions.module_permissions->'event-mgmt'->'allowedEvents', '[]'::jsonb) = '[]'::jsonb
                      )
                  )
            )
        )
        OR (
            (SELECT auth.uid()) IS NOT NULL
            AND (SELECT public.account_is_active())
            AND EXISTS (
                SELECT 1 FROM public.calendar c
                WHERE c.id = p_event_id
                  AND (
                      public.can_manage_calendar_event(c.organisation_id, c.club_id)
                      OR
                      lower(c.organiser_email) = lower((SELECT auth.email()))
                      OR EXISTS (
                          SELECT 1 FROM unnest(c.event_co_admins) AS admin_email
                          WHERE lower(admin_email) = lower((SELECT auth.email()))
                      )
                      OR (
                          c.organisation_id IS NOT NULL
                          AND (
                              EXISTS (
                                  SELECT 1 FROM public.organisation_members om
                                  WHERE om.organisation_id = c.organisation_id
                                    AND lower(om.user_email) = lower((SELECT auth.email()))
                                    AND om.role IN ('owner', 'admin')
                              )
                              OR EXISTS (
                                  SELECT 1 FROM public.organisations o
                                  JOIN public.players p ON p.id = o.created_by
                                  WHERE o.id = c.organisation_id
                                    AND lower(p.email) = lower((SELECT auth.email()))
                              )
                          )
                      )
                  )
            )
        );
$function$;
REVOKE ALL ON FUNCTION public.can_manage_event(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_event(bigint) TO authenticated, service_role;

-- Keep this lookup outside the Data API. Definer execution avoids recursively
-- applying player/registration policies while checking a manager's event scope.
CREATE SCHEMA IF NOT EXISTS private;
CREATE OR REPLACE FUNCTION private.can_read_event_player(p_email text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
    SELECT (SELECT auth.uid()) IS NOT NULL
        AND (SELECT public.account_is_active())
        AND (
            EXISTS (
                SELECT 1 FROM public.event_registrations r
                WHERE (lower(r.email) = lower(p_email) OR lower(r.partner_email) = lower(p_email))
                  AND public.can_manage_event(r.event_id)
            )
            OR EXISTS (
                SELECT 1 FROM public.tournament_participants participant
                WHERE lower(participant.email) = lower(p_email)
                  AND public.can_manage_event(participant.event_id)
            )
        );
$function$;
REVOKE ALL ON FUNCTION private.can_read_event_player(text) FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_read_event_player(text) TO authenticated;

CREATE POLICY "Event managers read registered player profiles"
ON public.players FOR SELECT TO authenticated
USING (private.can_read_event_player(email));

-- RankedIn/legacy Event Manager screens read participant rows as well.
CREATE POLICY "Event managers read managed participants"
ON public.tournament_participants FOR SELECT TO authenticated
USING (public.can_manage_event(event_id));

NOTIFY pgrst, 'reload schema';
