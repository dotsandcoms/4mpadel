-- Follow-up to 20260807_critical_rls_pii_lockdown.sql: that migration
-- correctly locked down event_registrations/tournament_participants to
-- "own row or admin" for SELECT, but two legitimate public flows broke:
--
-- 1. Several pages show a PUBLIC "who's registered" list / entry count for
--    an event (visible to logged-out visitors too) by querying the base
--    tables directly. Those now return 0 rows for anon and 1 row for a
--    regular logged-in user, instead of everyone entered. Fix: extend
--    event_registrations_public with one-way hashed email/partner_email/
--    registered_by columns (sha256 of the lowercased address) so the
--    existing client-side de-dup/pairing logic — which only ever does
--    equality/set-membership checks on these fields, never displays them —
--    keeps working without ever shipping a real email address to anon.
--
-- 2. tournament_participants writes (INSERT/UPDATE) are now admin-only
--    (`Admins manage participants`, cmd=ALL). But EventDetails.jsx's own
--    checkout-completion flow (finalizeRegistrationEmailsAndSync ->
--    insertParticipant) writes to this table for the paying user and their
--    partner right after a normal public registration/payment — a
--    non-admin caller's insert/update now silently fails under RLS, so a
--    paid entrant can end up missing from the tournament draw entirely.
--    Fix: a narrow SECURITY DEFINER RPC that performs exactly that
--    find-or-create, scoped to the exact event/division/name the caller
--    already knows (same trust boundary as grant_partner_full_license).

CREATE OR REPLACE VIEW public.event_registrations_public AS
SELECT
    id, event_id, full_name, partner_name, division, division_id, status,
    payment_status, created_at,
    CASE WHEN NULLIF(email, '') IS NOT NULL
         THEN encode(digest(lower(email), 'sha256'), 'hex') END AS email_hash,
    CASE WHEN NULLIF(partner_email, '') IS NOT NULL
         THEN encode(digest(lower(partner_email), 'sha256'), 'hex') END AS partner_email_hash,
    CASE WHEN NULLIF(registered_by, '') IS NOT NULL
         THEN encode(digest(lower(registered_by), 'sha256'), 'hex') END AS registered_by_hash
FROM public.event_registrations
WHERE status <> 'withdrawn';

GRANT SELECT ON public.event_registrations_public TO anon, authenticated;

-- tournament_participants.id is uuid, not bigint.
DROP FUNCTION IF EXISTS public.upsert_tournament_participant(bigint, text, text, text, bigint, boolean);

CREATE OR REPLACE FUNCTION public.upsert_tournament_participant(
    p_event_id bigint,
    p_full_name text,
    p_email text,
    p_class_name text,
    p_profile_id bigint,
    p_is_paid boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id uuid;
BEGIN
    SELECT id INTO v_id
    FROM public.tournament_participants
    WHERE event_id = p_event_id
      AND full_name ILIKE p_full_name
      AND class_name ILIKE p_class_name
    LIMIT 1;

    IF v_id IS NOT NULL THEN
        UPDATE public.tournament_participants
        SET is_paid = p_is_paid, last_synced_at = now()
        WHERE id = v_id;
    ELSE
        INSERT INTO public.tournament_participants
            (event_id, full_name, email, class_name, profile_id, is_paid, last_synced_at)
        VALUES (p_event_id, p_full_name, p_email, p_class_name, p_profile_id, p_is_paid, now())
        RETURNING id INTO v_id;
    END IF;

    RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_tournament_participant(bigint, text, text, text, bigint, boolean) TO anon, authenticated;
