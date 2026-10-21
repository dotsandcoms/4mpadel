-- Event managers may substitute either player, regardless of who paid.
-- Keep the entry ID, fee, payer, receipts and refunds; transfer entry allocation only.
SET LOCAL lock_timeout = '5s';
CREATE SCHEMA IF NOT EXISTS private;

-- A manager substitution reuses an active place after entries close. New entries,
-- division moves and reactivations still go through the normal deadline check.
CREATE OR REPLACE FUNCTION private.enforce_registration_deadline()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    IF lower(COALESCE(NEW.status, '')) = 'withdrawn' THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' THEN
        IF (NEW.event_id, NEW.division_id, NEW.division, NEW.email, NEW.status)
            IS NOT DISTINCT FROM (OLD.event_id, OLD.division_id, OLD.division, OLD.email, OLD.status)
        THEN RETURN NEW; END IF;
        IF OLD.status = 'registered' AND NEW.status = 'registered'
            AND (NEW.event_id, NEW.division_id, NEW.division) IS NOT DISTINCT FROM (OLD.event_id, OLD.division_id, OLD.division)
            AND auth.uid() IS NOT NULL AND COALESCE(public.account_is_active(), false)
            AND COALESCE(public.can_manage_event(OLD.event_id), false)
        THEN RETURN NEW; END IF;
    END IF;
    PERFORM private.assert_registration_deadline(NEW.event_id, NEW.division_id, NEW.division, NEW.email);
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.enforce_registration_deadline() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION private.registration_entry_payment_matches(meta jsonb, entry public.event_registrations)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
    SELECT COALESCE(meta->>'registration_id' = entry.id::text OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(meta->'covers', '[]'::jsonb)) cover
        WHERE private.partner_entry_cover_matches(cover, meta, entry)
    ) OR (
        NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(meta->'covers', '[]'::jsonb)) cover WHERE cover->>'type' = 'entry')
        AND lower(trim(COALESCE(meta->>'email', meta->>'registrant_email'))) = lower(trim(entry.email))
        AND (meta->>'division_id' = entry.division_id::text OR meta->>'division' = entry.division)
    ), false);
$$;

CREATE FUNCTION private.transfer_registration_entry_metadata(
    meta jsonb, entry public.event_registrations, teammate public.event_registrations,
    replacement public.players, transfer jsonb
)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
    covers jsonb;
    snapshots jsonb;
BEGIN
    SELECT COALESCE(jsonb_agg(CASE WHEN private.partner_entry_cover_matches(cover, meta, entry)
        THEN cover || jsonb_build_object('email', lower(trim(replacement.email)), 'division', entry.division,
            'division_id', entry.division_id, 'registration_id', entry.id)
        ELSE cover END ORDER BY position), '[]'::jsonb) INTO covers
    FROM jsonb_array_elements(COALESCE(meta->'covers', '[]'::jsonb)) WITH ORDINALITY AS items(cover, position);
    -- Older admin/Paystack rows can identify the paid slot without covers[].
    IF private.registration_entry_payment_matches(meta, entry) AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(covers) cover
        WHERE cover->>'type' = 'entry' AND cover->>'registration_id' = entry.id::text
    ) THEN
        covers := covers || jsonb_build_array(jsonb_build_object('type', 'entry', 'email', lower(trim(replacement.email)),
            'division', entry.division, 'division_id', entry.division_id, 'registration_id', entry.id));
    END IF;
    SELECT COALESCE(jsonb_agg(CASE
        WHEN (row->>'id' = entry.id::text OR lower(trim(row->>'email')) = lower(trim(entry.email)))
            AND (row->>'division_id' = entry.division_id::text OR row->>'division' = entry.division)
        THEN row || jsonb_build_object('email', lower(trim(replacement.email)), 'full_name', replacement.name,
            'phone', replacement.contact_number, 'tshirt_size', NULL, 'tshirt_logo_url', NULL, 'tshirt_sponsor_name', NULL)
        WHEN teammate.id IS NOT NULL AND lower(trim(row->>'email')) = lower(trim(teammate.email))
            AND (row->>'division_id' = teammate.division_id::text OR row->>'division' = teammate.division)
        THEN row || jsonb_build_object('partner_name', replacement.name, 'partner_email', lower(trim(replacement.email)))
        ELSE row END ORDER BY position), '[]'::jsonb) INTO snapshots
    FROM jsonb_array_elements(COALESCE(meta->'registration_rows', '[]'::jsonb)) WITH ORDINALITY AS items(row, position);
    RETURN COALESCE(meta, '{}'::jsonb) || jsonb_build_object('covers', covers, 'registration_rows', snapshots,
        'player_replacements', COALESCE(meta->'player_replacements', '[]'::jsonb) || jsonb_build_array(transfer));
END;
$$;

CREATE FUNCTION private.replace_registration_player(
    p_registration_id uuid, p_expected_email text, p_expected_partner_email text, p_new_player_id bigint
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    entry public.event_registrations;
    teammate public.event_registrations;
    replacement public.players;
    payment public.payments;
    event_state text;
    locked_event_id bigint;
    division_key text;
    transfer jsonb;
    meta jsonb;
    inner_meta jsonb;
BEGIN
    IF auth.uid() IS NULL OR NOT COALESCE(public.account_is_active(), false) THEN
        RAISE EXCEPTION 'Sign in with an active event-manager account.';
    END IF;
    SELECT * INTO entry FROM public.event_registrations WHERE id = p_registration_id;
    IF NOT FOUND OR NOT COALESCE(public.can_manage_event(entry.event_id), false) THEN
        RAISE EXCEPTION 'You cannot manage entries for this event.';
    END IF;
    locked_event_id := entry.event_id;
    -- Match the lock order of the existing paid-partner and team-management RPCs.
    SELECT event_status INTO event_state FROM public.calendar WHERE id = locked_event_id FOR UPDATE;
    IF NOT FOUND OR event_state = 'cancelled' THEN RAISE EXCEPTION 'This event is unavailable or cancelled.'; END IF;
    PERFORM 1 FROM public.event_registrations WHERE event_id = locked_event_id ORDER BY id FOR UPDATE;
    PERFORM 1 FROM public.payments WHERE event_id = locked_event_id ORDER BY id FOR UPDATE;
    SELECT * INTO entry FROM public.event_registrations WHERE id = p_registration_id;
    IF entry.id IS NULL OR entry.event_id IS DISTINCT FROM locked_event_id
        OR lower(trim(entry.email)) IS DISTINCT FROM lower(trim(p_expected_email))
        OR NULLIF(lower(trim(entry.partner_email)), '') IS DISTINCT FROM NULLIF(lower(trim(p_expected_partner_email)), '') THEN
        RAISE EXCEPTION 'This entry or its partner has changed. Refresh and try again.';
    END IF;
    IF entry.status IS DISTINCT FROM 'registered' OR COALESCE(entry.payment_status, '') = 'refunded' THEN
        RAISE EXCEPTION 'Only active, non-refunded entries can be replaced.';
    END IF;
    division_key := private.registration_team_division_key(entry);
    IF division_key = 'name:' THEN RAISE EXCEPTION 'This entry needs a division before replacing a player.'; END IF;
    IF EXISTS (SELECT 1 FROM public.event_registrations r WHERE r.event_id = locked_event_id AND r.id <> entry.id
        AND r.status = 'registered' AND private.registration_team_division_key(r) = division_key
        AND lower(trim(r.email)) = lower(trim(entry.email))) THEN
        RAISE EXCEPTION 'This player has duplicate active entries. Resolve them before replacing the player.';
    END IF;
    IF (SELECT count(*) FROM public.event_registrations r WHERE r.event_id = locked_event_id
        AND r.id <> entry.id AND r.status = 'registered' AND private.registration_team_division_key(r) = division_key
        AND (lower(trim(r.email)) = lower(trim(entry.partner_email)) OR lower(trim(r.partner_email)) = lower(trim(entry.email)))) > 1 THEN
        RAISE EXCEPTION 'This player is linked to multiple entries. Resolve the team links before replacing them.';
    END IF;
    SELECT * INTO teammate FROM public.event_registrations r WHERE r.event_id = locked_event_id
        AND r.id <> entry.id AND r.status = 'registered' AND private.registration_team_division_key(r) = division_key
        AND (lower(trim(r.email)) = lower(trim(entry.partner_email)) OR lower(trim(r.partner_email)) = lower(trim(entry.email)));
    SELECT * INTO replacement FROM public.players WHERE id = p_new_player_id FOR SHARE;
    IF NOT FOUND OR NULLIF(trim(replacement.email), '') IS NULL THEN
        RAISE EXCEPTION 'Select a player with a 4M profile and email address.';
    END IF;
    IF lower(trim(replacement.email)) IN (lower(trim(entry.email)), lower(trim(teammate.email)), lower(trim(entry.partner_email))) THEN
        RAISE EXCEPTION 'Select a different player.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.event_registrations r WHERE r.event_id = locked_event_id
        AND private.registration_team_division_key(r) = division_key
        AND (lower(trim(r.email)) = lower(trim(replacement.email))
            OR (r.status = 'registered' AND r.id <> entry.id AND lower(trim(r.partner_email)) = lower(trim(replacement.email))))) THEN
        RAISE EXCEPTION 'This player already has an entry or a reserved partner spot in this division. Choose another player.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.draws d WHERE d.event_id = locked_event_id AND d.status <> 'archived'
        AND ('id:' || d.division_id::text = division_key OR EXISTS (
            SELECT 1 FROM public.draw_entries e WHERE e.draw_id = d.id AND e.source_registration_id IN (entry.id, teammate.id)
        ))) THEN RAISE EXCEPTION 'This division already has a generated draw. Clear or archive the draw before replacing a player.'; END IF;

    -- A successful refund or live checkout must not race with a substitution.
    IF EXISTS (SELECT 1 FROM public.payment_refunds r WHERE r.event_registration_id = entry.id
        AND r.status <> 'failed' AND COALESCE(r.metadata->>'cover_type', 'entry') <> 'license') THEN
        RAISE EXCEPTION 'This entry has a refund in progress or already processed. Resolve it before replacing the player.';
    END IF;
    FOR payment IN SELECT * FROM public.payments p WHERE p.event_id = locked_event_id
        AND COALESCE(p.payment_type, '') NOT ILIKE '%license%' AND COALESCE(p.payment_type, '') <> 'membership'
        AND COALESCE(p.reference, '') NOT LIKE 'LIC-%'
        AND NOT (jsonb_array_length(COALESCE(p.metadata->'covers', '[]'::jsonb)) > 0
            AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p.metadata->'covers') c WHERE c->>'type' IS DISTINCT FROM 'license'))
        AND (private.registration_entry_payment_matches(p.metadata, entry)
            OR private.registration_entry_payment_matches(p.metadata #> '{original_trx,metadata}', entry))
    LOOP
        IF payment.status IN ('processing', 'pending') THEN
            RAISE EXCEPTION 'This entry has an unfinished payment. Resolve it before replacing the player.';
        END IF;
        IF EXISTS (SELECT 1 FROM public.payment_refunds r WHERE r.payment_id = payment.id
            AND (r.event_registration_id = entry.id OR r.event_registration_id IS NULL)
            AND r.status <> 'failed' AND COALESCE(r.metadata->>'cover_type', 'entry') <> 'license') THEN
            RAISE EXCEPTION 'This entry has a refund in progress or already processed. Resolve it before replacing the player.';
        END IF;
    END LOOP;

    transfer := jsonb_build_object('registration_id', entry.id, 'teammate_registration_id', teammate.id,
        'previous_email', entry.email, 'previous_name', entry.full_name,
        'new_email', lower(trim(replacement.email)), 'new_name', replacement.name,
        'actor_email', auth.email(), 'replaced_at', now(), 'payment_status', entry.payment_status,
        'previous_registration', to_jsonb(entry) - 'pay_token');
    UPDATE public.event_registrations SET full_name = replacement.name, email = lower(trim(replacement.email)),
        phone = replacement.contact_number, registered_by = COALESCE(teammate.email, lower(trim(replacement.email))),
        pay_token = gen_random_uuid(), whatsapp_added = false,
        partner_name = COALESCE(teammate.full_name, entry.partner_name), partner_email = COALESCE(teammate.email, entry.partner_email),
        partner_payment_status = COALESCE(teammate.payment_status, entry.partner_payment_status),
        tshirt_size = NULL, tshirt_logo_url = NULL, tshirt_sponsor_name = NULL,
        reminder_sent_at = NULL, close_reminder_sent_at = NULL,
        reminder_1d_sent_at = NULL, reminder_3d_sent_at = NULL, reminder_7d_sent_at = NULL
    WHERE id = entry.id;
    UPDATE public.event_registrations SET partner_name = replacement.name, partner_email = lower(trim(replacement.email)),
        partner_payment_status = entry.payment_status,
        registered_by = CASE WHEN lower(trim(registered_by)) = lower(trim(entry.email)) THEN teammate.email ELSE registered_by END
    WHERE id = teammate.id;

    FOR payment IN SELECT * FROM public.payments p WHERE p.event_id = locked_event_id AND p.status = 'success'
        AND COALESCE(p.payment_type, '') NOT ILIKE '%license%' AND COALESCE(p.payment_type, '') <> 'membership'
        AND COALESCE(p.reference, '') NOT LIKE 'LIC-%'
        AND NOT (jsonb_array_length(COALESCE(p.metadata->'covers', '[]'::jsonb)) > 0
            AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p.metadata->'covers') c WHERE c->>'type' IS DISTINCT FROM 'license'))
        AND (private.registration_entry_payment_matches(p.metadata, entry)
            OR private.registration_entry_payment_matches(p.metadata #> '{original_trx,metadata}', entry))
    LOOP
        meta := private.transfer_registration_entry_metadata(payment.metadata, entry, teammate, replacement, transfer);
        inner_meta := payment.metadata #> '{original_trx,metadata}';
        IF jsonb_typeof(inner_meta) = 'object' THEN
            meta := jsonb_set(meta, '{original_trx,metadata}', private.transfer_registration_entry_metadata(inner_meta, entry, teammate, replacement, transfer));
        END IF;
        UPDATE public.payments SET metadata = meta WHERE id = payment.id;
    END LOOP;
    INSERT INTO public.event_activity_log(event_id, actor_email, actor_role, action, category, summary, details)
    VALUES(locked_event_id, auth.email(), 'ADMIN', 'admin.player_replaced', 'REGISTRATION',
        entry.full_name || ' replaced by ' || replacement.name || ' — existing entry transferred, no charge or refund', transfer);
    RETURN transfer;
END;
$$;

CREATE FUNCTION public.replace_registration_player(
    p_registration_id uuid, p_expected_email text, p_expected_partner_email text, p_new_player_id bigint
)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
    SELECT private.replace_registration_player(p_registration_id, p_expected_email, p_expected_partner_email, p_new_player_id);
$$;

REVOKE ALL ON FUNCTION private.registration_entry_payment_matches(jsonb, public.event_registrations),
    private.transfer_registration_entry_metadata(jsonb, public.event_registrations, public.event_registrations, public.players, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.replace_registration_player(uuid, text, text, bigint),
    public.replace_registration_player(uuid, text, text, bigint) FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.replace_registration_player(uuid, text, text, bigint),
    public.replace_registration_player(uuid, text, text, bigint) TO authenticated;
NOTIFY pgrst, 'reload schema';
