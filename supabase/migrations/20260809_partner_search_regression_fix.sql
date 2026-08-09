-- Urgent follow-up: the RLS lockdown broke partner search in
-- ManualEventRegistration.jsx. That component had its own separate raw
-- `.from('players').or('name.ilike...,email.ilike...')` searches (two of
-- them: runPartnerSearch and runDivisionPartnerSearch) that were missed in
-- the original sweep (which only covered EventDetails.jsx's partner
-- search). Under the new players RLS (own row or admin only), those
-- searches now return nothing for any non-admin user, breaking the "Add a
-- partner" dropdown entirely.
--
-- Also fixes loadDivisionRegs in the same file, which fetched the full
-- event_registrations table (no email filter) to power partner-availability
-- / double-booking checks and payer-name resolution — silently broken the
-- same way, but failing toward "nothing blocks you" rather than a hard
-- error, so it wasn't immediately visible.

-- Extend find_registration_partner with a combined name-OR-email partial
-- search (p_search) and the extra display columns (image_url, level) the
-- partner search dropdown needs. Additive: existing callers keep working.
DROP FUNCTION IF EXISTS public.find_registration_partner(text, text, text, bigint, bigint, bigint[]);

CREATE OR REPLACE FUNCTION public.find_registration_partner(
    p_email text DEFAULT NULL,
    p_name text DEFAULT NULL,
    p_name_partial text DEFAULT NULL,
    p_event_id bigint DEFAULT NULL,
    p_exclude_id bigint DEFAULT NULL,
    p_ids bigint[] DEFAULT NULL,
    p_search text DEFAULT NULL
)
RETURNS TABLE (
    id bigint, name text, email text, paid_registration boolean,
    license_type text, category text, image_url text, level text,
    has_temp_license_for_event boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT p.id, p.name, p.email, p.paid_registration, p.license_type, p.category, p.image_url, p.level,
           EXISTS (
               SELECT 1 FROM public.temporary_licenses tl
               WHERE tl.player_id = p.id AND tl.event_id = p_event_id
           ) AS has_temp_license_for_event
    FROM public.players p
    WHERE (p_exclude_id IS NULL OR p.id <> p_exclude_id)
      AND (
          (p_email IS NOT NULL AND p.email ILIKE p_email)
          OR (p_name IS NOT NULL AND p.name ILIKE p_name)
          OR (p_name_partial IS NOT NULL AND p.name ILIKE ('%' || p_name_partial || '%'))
          OR (p_ids IS NOT NULL AND p.id = ANY(p_ids))
          OR (p_search IS NOT NULL AND (p.name ILIKE ('%' || p_search || '%') OR p.email ILIKE ('%' || p_search || '%')))
      )
    LIMIT 20;
$$;

GRANT EXECUTE ON FUNCTION public.find_registration_partner(text, text, text, bigint, bigint, bigint[], text) TO anon, authenticated;

-- Restores the per-event registrant list (raw email/partner_email/
-- registered_by) that ManualEventRegistration.jsx's partner-availability
-- and double-booking checks depend on. Scoped to one event_id per call
-- (not a full-table dump), matching the same "entry list is public for the
-- event you're viewing" model event_registrations_public already grants —
-- this just needs the raw (not hashed) fields because it compares against
-- a freshly-searched candidate partner's real email, which is only known
-- client-side.
CREATE OR REPLACE FUNCTION public.get_event_registrations_for_matching(p_event_id bigint)
RETURNS TABLE (
    id uuid, email text, full_name text, partner_name text, partner_email text,
    division_id uuid, division text, status text, registered_by text, payment_status text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT id, email, full_name, partner_name, partner_email, division_id, division, status, registered_by, payment_status
    FROM public.event_registrations
    WHERE event_id = p_event_id AND status <> 'withdrawn';
$$;

GRANT EXECUTE ON FUNCTION public.get_event_registrations_for_matching(bigint) TO anon, authenticated;

-- Narrow "which of these weekly events have I already registered for"
-- check, replacing a raw full-table fetch + client-side email filter.
CREATE OR REPLACE FUNCTION public.get_my_weekly_registration_ids(p_event_ids bigint[], p_email text)
RETURNS TABLE (event_id bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT event_id FROM public.event_registrations
    WHERE event_id = ANY(p_event_ids) AND email ILIKE p_email AND status <> 'withdrawn';
$$;

GRANT EXECUTE ON FUNCTION public.get_my_weekly_registration_ids(bigint[], text) TO anon, authenticated;
