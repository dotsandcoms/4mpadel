-- Transfer an already-paid partner spot. Never create a charge or refund.
-- Privileged implementations stay outside the Data API; public wrappers are invokers.
SET LOCAL lock_timeout = '5s';
CREATE SCHEMA IF NOT EXISTS private;

CREATE FUNCTION private.partner_entry_cover_matches(cover jsonb, meta jsonb, registration public.event_registrations)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
    SELECT cover->>'type' = 'entry'
        AND lower(trim(cover->>'email')) = lower(trim(registration.email))
        AND (
            (cover->>'division_id' IS NOT NULL AND cover->>'division_id' = registration.division_id::text)
            OR (cover->>'division_id' IS NULL AND EXISTS (
                SELECT 1 FROM jsonb_array_elements(COALESCE(meta->'registration_rows', '[]'::jsonb)) snapshot
                WHERE lower(trim(snapshot->>'email')) = lower(trim(registration.email))
                  AND snapshot->>'division' = cover->>'division'
                  AND snapshot->>'division_id' = registration.division_id::text
            ))
            OR (cover->>'division_id' IS NULL AND cover->>'division' = registration.division)
        );
$$;

CREATE FUNCTION private.paid_partner_eligible(p_owner_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT (SELECT auth.uid()) IS NOT NULL AND (SELECT public.account_is_active())
        AND EXISTS (
            SELECT 1 FROM public.event_registrations owner
            JOIN public.event_registrations partner
              ON partner.event_id = owner.event_id
             AND lower(trim(partner.email)) = lower(trim(owner.partner_email))
             AND lower(trim(partner.partner_email)) = lower(trim(owner.email))
             AND ((owner.division_id IS NOT NULL AND partner.division_id = owner.division_id)
                  OR (owner.division_id IS NULL AND partner.division_id IS NULL AND partner.division = owner.division))
            JOIN public.calendar event ON event.id = owner.event_id
            WHERE owner.id = p_owner_id AND owner.id <> partner.id
              AND owner.status = 'registered' AND partner.status = 'registered'
              AND owner.payment_status = 'paid' AND partner.payment_status = 'paid'
              AND COALESCE(event.event_status, 'active') <> 'cancelled'
              AND (lower(trim(owner.email)) = lower(trim((SELECT auth.email()))) OR public.can_manage_event(owner.event_id))
              -- Each entry must have a successful, positive entry payment by this owner.
              -- Two paid badges, a booking attribution, or a license charge are insufficient.
              AND NOT EXISTS (
                  SELECT 1 FROM (VALUES (owner), (partner)) AS entries(registration)
                  WHERE NOT EXISTS (
                      SELECT 1 FROM public.payments payment
                      LEFT JOIN public.players payer ON payer.id = payment.player_id
                      WHERE payment.event_id = owner.event_id AND payment.status = 'success' AND payment.amount > 0
                        AND COALESCE(payment.payment_type, '') NOT ILIKE '%license%'
                        AND COALESCE(payment.payment_type, '') <> 'membership'
                        AND payment.reference NOT LIKE 'LIC-%'
                        AND lower(trim(COALESCE(NULLIF(payer.email, ''), payment.metadata->>'registrant_email', payment.metadata->>'email')))
                            = lower(trim(owner.email))
                        AND EXISTS (
                            SELECT 1 FROM jsonb_array_elements(COALESCE(payment.metadata->'covers', '[]'::jsonb)) cover
                            WHERE private.partner_entry_cover_matches(cover, payment.metadata, entries.registration)
                        )
                        AND NOT EXISTS (
                            SELECT 1 FROM public.payment_refunds refund
                            WHERE refund.status <> 'failed'
                              AND COALESCE(refund.metadata->>'cover_type', 'entry') <> 'license'
                              AND (refund.event_registration_id = (entries.registration).id
                                   OR (refund.payment_id = payment.id AND refund.event_registration_id IS NULL))
                        )
                  )
              )
              AND NOT EXISTS (
                  SELECT 1 FROM public.payment_refunds refund
                  WHERE refund.event_registration_id IN (owner.id, partner.id)
                    AND refund.status <> 'failed'
                    AND COALESCE(refund.metadata->>'cover_type', 'entry') <> 'license'
              )
        );
$$;

CREATE FUNCTION public.get_paid_partner_replacements(p_event_id bigint)
RETURNS TABLE(owner_registration_id uuid, partner_registration_id uuid, owner_name text, partner_name text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
    SELECT owner.id, partner.id, owner.full_name, partner.full_name
    FROM public.event_registrations owner
    JOIN public.event_registrations partner ON partner.event_id = owner.event_id
      AND lower(trim(partner.email)) = lower(trim(owner.partner_email))
      AND ((owner.division_id IS NOT NULL AND partner.division_id = owner.division_id)
           OR (owner.division_id IS NULL AND partner.division_id IS NULL AND partner.division = owner.division))
    WHERE owner.event_id = p_event_id AND private.paid_partner_eligible(owner.id);
$$;

CREATE FUNCTION private.replace_paid_partner(p_owner_id uuid, p_expected_partner_email text, p_new_player_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    owner public.event_registrations;
    partner public.event_registrations;
    replacement public.players;
    event public.calendar;
    payment public.payments;
    transfer jsonb;
    new_covers jsonb;
    new_rows jsonb;
    manager boolean;
BEGIN
    IF auth.uid() IS NULL OR NOT public.account_is_active() THEN
        RAISE EXCEPTION 'Please sign in to replace a partner.';
    END IF;
    SELECT * INTO owner FROM public.event_registrations WHERE id = p_owner_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Entry not found.'; END IF;
    manager := COALESCE(public.can_manage_event(owner.event_id), false);
    IF NOT manager AND lower(trim(owner.email)) <> lower(trim(auth.email())) THEN
        RAISE EXCEPTION 'Only the player who paid for both spots or an event admin can replace this partner.';
    END IF;
    -- Serialize substitutions and conflicting new-entry inserts within this event.
    SELECT * INTO event FROM public.calendar WHERE id = owner.event_id FOR UPDATE;
    PERFORM 1 FROM public.event_registrations WHERE event_id = owner.event_id ORDER BY id FOR UPDATE;
    PERFORM 1 FROM public.payments WHERE event_id = owner.event_id ORDER BY id FOR UPDATE;
    SELECT * INTO owner FROM public.event_registrations WHERE id = p_owner_id;
    IF lower(trim(owner.partner_email)) IS DISTINCT FROM lower(trim(p_expected_partner_email)) THEN
        RAISE EXCEPTION 'The partner has changed. Refresh this entry before trying again.';
    END IF;
    IF NOT private.paid_partner_eligible(owner.id) THEN
        RAISE EXCEPTION 'Free replacement is only available when the team owner paid for both entries and neither entry has been refunded.';
    END IF;
    IF NOT manager AND (
        event.registration_closes_at < now() OR EXISTS (
            SELECT 1 FROM public.tournament_divisions division
            WHERE division.id = owner.division_id AND division.entries_close_at < now()
        )
    ) THEN RAISE EXCEPTION 'Registration has closed. Ask the event admin to replace your partner.'; END IF;
    SELECT * INTO partner FROM public.event_registrations r
    WHERE r.event_id = owner.event_id AND lower(trim(r.email)) = lower(trim(owner.partner_email))
      AND r.status = 'registered'
      AND ((owner.division_id IS NOT NULL AND r.division_id = owner.division_id)
           OR (owner.division_id IS NULL AND r.division_id IS NULL AND r.division = owner.division));
    SELECT * INTO replacement FROM public.players WHERE id = p_new_player_id FOR SHARE;
    IF NOT FOUND OR NULLIF(trim(replacement.email), '') IS NULL THEN
        RAISE EXCEPTION 'Select a player with a 4M profile and email address.';
    END IF;
    IF lower(trim(replacement.email)) IN (lower(trim(owner.email)), lower(trim(partner.email))) THEN
        RAISE EXCEPTION 'Select a different partner.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.event_registrations r
        WHERE r.event_id = owner.event_id AND lower(trim(r.email)) = lower(trim(replacement.email))
          AND ((owner.division_id IS NOT NULL AND r.division_id = owner.division_id) OR r.division = partner.division)
    ) THEN RAISE EXCEPTION 'This player already has an entry in this division. Choose another player.'; END IF;
    -- Draw snapshots are frozen: do not silently change a generated bracket's roster.
    IF EXISTS (
        SELECT 1 FROM public.draw_entries entry JOIN public.draws draw ON draw.id = entry.draw_id
        WHERE draw.event_id = owner.event_id AND draw.status <> 'archived'
          AND ((owner.division_id IS NOT NULL AND draw.division_id = owner.division_id)
               OR entry.source_registration_id IN (owner.id, partner.id))
    ) THEN RAISE EXCEPTION 'This division already has a generated draw. Ask the event admin to clear the draw before replacing a partner.'; END IF;

    transfer := jsonb_build_object('owner_registration_id', owner.id, 'partner_registration_id', partner.id,
        'previous_email', partner.email, 'previous_name', partner.full_name,
        'new_email', lower(trim(replacement.email)), 'new_name', replacement.name,
        'actor_email', auth.email(), 'replaced_at', now(), 'entry_fee', 0,
        'previous_registration', to_jsonb(partner) - 'pay_token');
    -- Reuse the paid slot ID and rotate its payment token. Personal kit/licensing
    -- choices belong to the former player, so they do not follow the entry spot.
    UPDATE public.event_registrations SET full_name = replacement.name, email = lower(trim(replacement.email)),
        phone = replacement.contact_number, registered_by = owner.email,
        partner_name = owner.full_name, partner_email = owner.email, partner_payment_status = 'paid',
        pay_token = gen_random_uuid(), whatsapp_added = false, tshirt_size = NULL,
        tshirt_logo_url = NULL, tshirt_sponsor_name = NULL,
        reminder_sent_at = NULL, close_reminder_sent_at = NULL,
        reminder_1d_sent_at = NULL, reminder_3d_sent_at = NULL, reminder_7d_sent_at = NULL
    WHERE id = partner.id;
    UPDATE public.event_registrations SET partner_name = replacement.name,
        partner_email = lower(trim(replacement.email)), partner_payment_status = 'paid'
    WHERE id = owner.id;

    -- Transfer only entry covers. Preserve payer, amount, reference, license covers,
    -- and receipt line items; append history for finance/auditing and repeat swaps.
    FOR payment IN SELECT * FROM public.payments p WHERE p.event_id = owner.event_id AND p.status = 'success'
        AND EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(p.metadata->'covers', '[]'::jsonb)) cover
                    WHERE private.partner_entry_cover_matches(cover, p.metadata, partner))
    LOOP
        SELECT jsonb_agg(CASE WHEN private.partner_entry_cover_matches(cover, payment.metadata, partner)
            THEN cover || jsonb_build_object('email', lower(trim(replacement.email)), 'division_id', partner.division_id)
            ELSE cover END ORDER BY position) INTO new_covers
        FROM jsonb_array_elements(payment.metadata->'covers') WITH ORDINALITY AS covers(cover, position);
        SELECT COALESCE(jsonb_agg(CASE
            WHEN lower(trim(row->>'email')) = lower(trim(partner.email))
                 AND (row->>'division_id' = partner.division_id::text OR row->>'division' = partner.division)
            THEN row || jsonb_build_object('email', lower(trim(replacement.email)), 'full_name', replacement.name,
                'phone', replacement.contact_number, 'registered_by', owner.email,
                'partner_name', owner.full_name, 'partner_email', owner.email,
                'tshirt_size', NULL, 'tshirt_logo_url', NULL, 'tshirt_sponsor_name', NULL)
            WHEN lower(trim(row->>'email')) = lower(trim(owner.email))
                 AND (row->>'division_id' = owner.division_id::text OR row->>'division' = owner.division)
            THEN row || jsonb_build_object('partner_name', replacement.name, 'partner_email', lower(trim(replacement.email)))
            ELSE row END ORDER BY position), '[]'::jsonb) INTO new_rows
        FROM jsonb_array_elements(COALESCE(payment.metadata->'registration_rows', '[]'::jsonb)) WITH ORDINALITY AS rows(row, position);
        UPDATE public.payments SET metadata = metadata || jsonb_build_object(
            'covers', new_covers, 'registration_rows', new_rows,
            'partner_replacements', COALESCE(metadata->'partner_replacements', '[]'::jsonb) || jsonb_build_array(transfer))
        WHERE id = payment.id;
    END LOOP;
    INSERT INTO public.event_activity_log(event_id, actor_email, actor_role, action, category, summary, details)
    VALUES(owner.event_id, auth.email(), CASE WHEN manager THEN 'ADMIN' ELSE 'PLAYER' END,
        'partner_replaced', 'REGISTRATION', partner.full_name || ' replaced by ' || replacement.name || ' — paid spot transferred, no charge or refund', transfer);
    RETURN transfer;
END;
$$;

CREATE FUNCTION public.replace_paid_partner(p_owner_id uuid, p_expected_partner_email text, p_new_player_id bigint)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
    SELECT private.replace_paid_partner(p_owner_id, p_expected_partner_email, p_new_player_id);
$$;

REVOKE ALL ON FUNCTION private.partner_entry_cover_matches(jsonb, jsonb, public.event_registrations) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.paid_partner_eligible(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.replace_paid_partner(uuid, text, bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_paid_partner_replacements(bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.replace_paid_partner(uuid, text, bigint) FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.paid_partner_eligible(uuid), private.replace_paid_partner(uuid, text, bigint),
    public.get_paid_partner_replacements(bigint), public.replace_paid_partner(uuid, text, bigint) TO authenticated;
NOTIFY pgrst, 'reload schema';
