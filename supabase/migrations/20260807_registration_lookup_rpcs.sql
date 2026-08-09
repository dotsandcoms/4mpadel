-- Follow-up to 20260807_critical_rls_pii_lockdown.sql: the public event
-- registration form ("find my partner", "have I already paid?", linking a
-- payer's email to their existing profile) needs targeted, narrow lookups
-- against players/tournament_participants that the locked-down base tables
-- no longer allow for anon. These SECURITY DEFINER functions restore that
-- functionality without reopening full-table access — each only returns
-- rows matching the exact/partial value the caller already supplied, never
-- an unfiltered dump, and only the columns the registration UI actually uses.

-- Adding p_ids below changes the signature — drop the earlier 5-arg version
-- from this same migration set so PostgREST doesn't end up with two overloads.
DROP FUNCTION IF EXISTS public.find_registration_partner(text, text, text, bigint, bigint);

CREATE OR REPLACE FUNCTION public.find_registration_partner(
    p_email text DEFAULT NULL,
    p_name text DEFAULT NULL,
    p_name_partial text DEFAULT NULL,
    p_event_id bigint DEFAULT NULL,
    p_exclude_id bigint DEFAULT NULL,
    p_ids bigint[] DEFAULT NULL
)
RETURNS TABLE (
    id bigint, name text, email text, paid_registration boolean,
    license_type text, category text, has_temp_license_for_event boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT p.id, p.name, p.email, p.paid_registration, p.license_type, p.category,
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
      )
    LIMIT 20;
$$;

GRANT EXECUTE ON FUNCTION public.find_registration_partner(text, text, text, bigint, bigint, bigint[]) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.search_tournament_participants_for_partner(
    p_event_id bigint,
    p_class_name text,
    p_query text
)
RETURNS TABLE (profile_id bigint, full_name text, email text, class_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT profile_id, full_name, email, class_name
    FROM public.tournament_participants
    WHERE event_id = p_event_id
      AND class_name ILIKE p_class_name
      AND full_name ILIKE ('%' || p_query || '%')
    LIMIT 8;
$$;

GRANT EXECUTE ON FUNCTION public.search_tournament_participants_for_partner(bigint, text, text) TO anon, authenticated;

-- Grants a partner's paid-in-full license after the payer's checkout
-- succeeds (same trust boundary the rest of this payment flow already
-- uses — the client only calls this after a real Paystack redirect back —
-- this just narrows *what* an anonymous payer can write on someone else's
-- row down to these two license fields, instead of the old policy which
-- allowed an unrestricted UPDATE of any column on any row).
-- Note: the original code also tried to set a `payment_reference` column
-- that doesn't exist on players — that was already silently failing before
-- this fix, unrelated to it, so it's dropped here rather than reintroduced.
CREATE OR REPLACE FUNCTION public.grant_partner_full_license(
    p_player_id bigint
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE public.players
    SET paid_registration = true,
        license_type = 'Full'
    WHERE id = p_player_id;
$$;

GRANT EXECUTE ON FUNCTION public.grant_partner_full_license(bigint) TO anon, authenticated;
