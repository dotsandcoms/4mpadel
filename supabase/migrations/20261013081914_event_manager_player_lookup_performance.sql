-- Resolve the authorised event/player set once per query. A correlated helper
-- on every player row makes broad Event Manager profile reads too expensive.
SET LOCAL lock_timeout = '3s';
CREATE OR REPLACE FUNCTION private.managed_event_player_emails()
RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
    WITH managed_events AS MATERIALIZED (
        SELECT c.id
        FROM public.calendar c
        WHERE (SELECT auth.uid()) IS NOT NULL
          AND (SELECT public.account_is_active())
          AND public.can_manage_event(c.id)
    )
    SELECT lower(r.email)
    FROM public.event_registrations r
    JOIN managed_events e ON e.id = r.event_id
    WHERE r.email IS NOT NULL
    UNION
    SELECT lower(r.partner_email)
    FROM public.event_registrations r
    JOIN managed_events e ON e.id = r.event_id
    WHERE r.partner_email IS NOT NULL
    UNION
    SELECT lower(p.email)
    FROM public.tournament_participants p
    JOIN managed_events e ON e.id = p.event_id
    WHERE p.email IS NOT NULL;
$function$;
REVOKE ALL ON FUNCTION private.managed_event_player_emails() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.managed_event_player_emails() TO authenticated;

ALTER POLICY "Event managers read registered player profiles"
ON public.players
USING (lower(email) IN (SELECT private.managed_event_player_emails()));

DROP FUNCTION private.can_read_event_player(text);
NOTIFY pgrst, 'reload schema';
