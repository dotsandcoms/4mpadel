-- Complete a pre-existing reservation between the selected pair without allowing
-- either player to leave a third active teammate. Preserve existing RPC grants.
CREATE OR REPLACE FUNCTION private.manage_registration_team(
    p_action text, p_registration_id uuid, p_other_registration_id uuid, p_division_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    first_entry public.event_registrations;
    second_entry public.event_registrations;
    entry public.event_registrations;
    division_key text;
    locked_event_id bigint;
    event_state text;
    change_details jsonb;
BEGIN
    IF auth.uid() IS NULL OR NOT COALESCE(public.account_is_active(), false) THEN
        RAISE EXCEPTION 'Sign in with an active event-manager account.';
    END IF;
    IF p_action IS NULL OR p_action NOT IN ('merge', 'split') THEN
        RAISE EXCEPTION 'Choose merge or split.';
    END IF;
    IF p_registration_id IS NULL OR p_other_registration_id IS NULL OR p_registration_id = p_other_registration_id THEN
        RAISE EXCEPTION 'Select two different registrations.';
    END IF;
    SELECT * INTO first_entry FROM public.event_registrations WHERE id = p_registration_id;
    IF NOT FOUND OR NOT COALESCE(public.can_manage_event(first_entry.event_id), false) THEN
        RAISE EXCEPTION 'You cannot manage entries for this event.';
    END IF;

    -- Match the lock order used by paid-partner replacement. Serialise team edits
    -- and re-read the roster so two managers cannot pair the same player twice.
    locked_event_id := first_entry.event_id;
    SELECT event_status INTO event_state FROM public.calendar WHERE id = locked_event_id FOR UPDATE;
    IF NOT FOUND OR event_state = 'cancelled' THEN
        RAISE EXCEPTION 'This event is unavailable or cancelled.';
    END IF;
    PERFORM 1 FROM public.event_registrations WHERE event_id = first_entry.event_id ORDER BY id FOR UPDATE;
    SELECT * INTO first_entry FROM public.event_registrations WHERE id = p_registration_id;
    SELECT * INTO second_entry FROM public.event_registrations WHERE id = p_other_registration_id;
    IF first_entry.id IS NULL OR second_entry.id IS NULL OR first_entry.event_id IS DISTINCT FROM locked_event_id
        OR first_entry.event_id IS DISTINCT FROM second_entry.event_id THEN
        RAISE EXCEPTION 'Both entries must belong to the same event. Refresh and try again.';
    END IF;
    division_key := private.registration_team_division_key(first_entry);
    IF division_key = 'name:' OR division_key IS DISTINCT FROM p_division_key
        OR division_key IS DISTINCT FROM private.registration_team_division_key(second_entry) THEN
        RAISE EXCEPTION 'Both entries must still be in the same division. Refresh and try again.';
    END IF;
    IF lower(COALESCE(first_entry.status, '')) = 'withdrawn' OR lower(COALESCE(second_entry.status, '')) = 'withdrawn' THEN
        RAISE EXCEPTION 'Withdrawn entries cannot be merged or split. Refresh and try again.';
    END IF;
    IF NULLIF(trim(first_entry.email), '') IS NULL OR NULLIF(trim(second_entry.email), '') IS NULL
        OR lower(trim(first_entry.email)) = lower(trim(second_entry.email)) THEN
        RAISE EXCEPTION 'Select two different players with email addresses.';
    END IF;

    -- A one-way reservation between the selected two is repairable. A complete
    -- mutual team is already merged; links to third players remain blocked below.
    IF p_action = 'merge'
        AND lower(trim(COALESCE(first_entry.partner_email, ''))) = lower(trim(second_entry.email))
        AND lower(trim(COALESCE(second_entry.partner_email, ''))) = lower(trim(first_entry.email)) THEN
        RAISE EXCEPTION 'These players are already linked as a team. Refresh and try again.';
    END IF;

    FOR entry IN SELECT * FROM public.event_registrations WHERE id IN (first_entry.id, second_entry.id)
    LOOP
        IF EXISTS (
            SELECT 1 FROM public.event_registrations r
            WHERE r.event_id = first_entry.event_id AND r.id <> entry.id
                AND lower(COALESCE(r.status, '')) <> 'withdrawn'
                AND private.registration_team_division_key(r) = division_key
                AND lower(trim(r.email)) = lower(trim(entry.email))
        ) THEN RAISE EXCEPTION 'A player has duplicate active entries in this division. Resolve them before changing teams.'; END IF;
        IF EXISTS (
            SELECT 1 FROM public.event_registrations r
            WHERE r.event_id = first_entry.event_id AND r.id <> entry.id
                AND r.id NOT IN (first_entry.id, second_entry.id)
                AND lower(COALESCE(r.status, '')) <> 'withdrawn'
                AND private.registration_team_division_key(r) = division_key
                AND (lower(trim(r.email)) = lower(trim(entry.partner_email))
                     OR lower(trim(r.partner_email)) = lower(trim(entry.email)))
        ) THEN RAISE EXCEPTION 'A selected player is already linked to another active entry. Refresh and try again.'; END IF;
    END LOOP;
    IF p_action = 'split'
        AND lower(trim(COALESCE(first_entry.partner_email, ''))) <> lower(trim(second_entry.email))
        AND lower(trim(COALESCE(second_entry.partner_email, ''))) <> lower(trim(first_entry.email)) THEN
        RAISE EXCEPTION 'These players are no longer a team. Refresh and try again.';
    END IF;

    -- Draw entries are snapshots. Require the existing draw to be cleared first.
    IF EXISTS (
        SELECT 1 FROM public.draws d WHERE d.event_id = first_entry.event_id AND d.status <> 'archived'
            AND (('id:' || d.division_id::text) = division_key OR EXISTS (
                SELECT 1 FROM public.draw_entries e WHERE e.draw_id = d.id
                    AND e.source_registration_id IN (first_entry.id, second_entry.id)
            ))
    ) THEN RAISE EXCEPTION 'This division already has a generated draw. Clear or archive the draw before changing teams.'; END IF;

    change_details := jsonb_build_object(
        'registration_ids', jsonb_build_array(first_entry.id, second_entry.id),
        'division_key', division_key,
        'previous_partners', jsonb_build_array(
            jsonb_build_object('registration_id', first_entry.id, 'partner_name', first_entry.partner_name, 'partner_email', first_entry.partner_email),
            jsonb_build_object('registration_id', second_entry.id, 'partner_name', second_entry.partner_name, 'partner_email', second_entry.partner_email))
    );
    IF p_action = 'merge' THEN
        UPDATE public.event_registrations SET partner_name = second_entry.full_name,
            partner_email = second_entry.email, partner_payment_status = second_entry.payment_status
        WHERE id = first_entry.id;
        UPDATE public.event_registrations SET partner_name = first_entry.full_name,
            partner_email = first_entry.email, partner_payment_status = first_entry.payment_status
        WHERE id = second_entry.id;
    ELSE
        UPDATE public.event_registrations SET partner_name = NULL, partner_email = NULL, partner_payment_status = NULL
        WHERE id IN (first_entry.id, second_entry.id);
    END IF;
    INSERT INTO public.event_activity_log(event_id, actor_email, actor_role, action, category, summary, details)
    VALUES (first_entry.event_id, auth.email(), 'ADMIN', 'admin.team_' || CASE WHEN p_action = 'merge' THEN 'merged' ELSE 'split' END,
        'ADMIN', CASE WHEN p_action = 'merge' THEN 'Merged ' ELSE 'Split ' END || first_entry.full_name || ' & ' || second_entry.full_name,
        change_details);
    RETURN change_details;
END;
$$;

NOTIFY pgrst, 'reload schema';
