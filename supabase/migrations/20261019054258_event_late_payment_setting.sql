-- Preserve the current behaviour for existing and newly created events.
ALTER TABLE public.calendar ADD COLUMN allow_payments_after_close boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN public.calendar.allow_payments_after_close IS
    'Allow existing active entries to start payment after the effective registration closing date. New entries remain closed.';

-- Read-only check shared by reservations, resumed browser checkouts and payment
-- insertion. Keep calendar visibility and the caller's RLS permissions in force.
CREATE OR REPLACE FUNCTION public.assert_event_registration_payments_open(p_rows jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE entry jsonb;
BEGIN
    IF COALESCE(jsonb_typeof(p_rows), '') <> 'array' OR jsonb_array_length(p_rows) > 60 THEN
        RAISE EXCEPTION 'Choose valid registration entries';
    END IF;
    FOR entry IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
        IF EXISTS (
            SELECT 1 FROM public.calendar c LEFT JOIN public.tournament_divisions d
              ON d.event_id = c.id AND (d.id = (entry->>'division_id')::uuid
                OR (NULLIF(entry->>'division_id', '') IS NULL AND lower(trim(d.name)) = lower(trim(entry->>'division'))))
            WHERE c.id = (entry->>'event_id')::bigint
              AND NOT c.allow_payments_after_close
              AND COALESCE(d.entries_close_at, c.registration_closes_at) <= clock_timestamp()
        ) THEN
            RAISE EXCEPTION 'Payments have closed. Contact the organiser about your outstanding entry fees.';
        END IF;
    END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_event_registration_payments_open(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_event_registration_payments_open(jsonb) TO authenticated, service_role;

-- Check at checkout initiation. Confirmations for payments that already started
-- remain valid even if the organiser changes the switch while payment is open.
CREATE OR REPLACE FUNCTION private.enforce_payment_registration_deadline()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE entry jsonb; balance_entry jsonb;
BEGIN
    IF NEW.status = 'processing' AND NEW.metadata->>'source' = 'manual_event'
        AND jsonb_typeof(NEW.metadata->'registration_rows') = 'array' THEN
        FOR entry IN SELECT value FROM jsonb_array_elements(NEW.metadata->'registration_rows')
            ORDER BY value->>'event_id', value->>'division_id' LOOP
            PERFORM private.assert_registration_deadline((entry->>'event_id')::bigint,
                (entry->>'division_id')::uuid, entry->>'division', entry->>'email');
        END LOOP;
        PERFORM public.assert_event_registration_payments_open(NEW.metadata->'registration_rows');
    ELSIF NEW.status = 'processing' AND NEW.payment_type = 'event_entry_fee'
        AND NEW.metadata->>'source' = 'native_entry_balance' THEN
        SELECT to_jsonb(r) INTO balance_entry FROM public.event_registrations r
        WHERE r.id = (NEW.metadata->>'registration_id')::uuid;
        IF balance_entry IS NOT NULL THEN
            PERFORM private.assert_registration_deadline((balance_entry->>'event_id')::bigint,
                (balance_entry->>'division_id')::uuid, balance_entry->>'division', balance_entry->>'email');
            PERFORM public.assert_event_registration_payments_open(jsonb_build_array(balance_entry));
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_event_registration_places(p_rows jsonb, p_solo_links jsonb DEFAULT '[]'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
    item jsonb;
    incoming public.event_registrations;
    existing public.event_registrations;
    link jsonb;
BEGIN
    IF auth.uid() IS NULL AND current_user <> 'service_role'
        AND current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
        AND COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role', '') <> 'service_role'
    THEN RAISE EXCEPTION 'Sign in to reserve an entry'; END IF;
    IF COALESCE(jsonb_typeof(p_rows), '') <> 'array' OR jsonb_array_length(p_rows) > 60
        OR COALESCE(jsonb_typeof(p_solo_links), '') <> 'array' OR jsonb_array_length(p_solo_links) > 60 THEN
        RAISE EXCEPTION 'Choose valid registration entries';
    END IF;
    PERFORM public.assert_event_registration_payments_open(p_rows);
    FOR item IN SELECT value FROM jsonb_array_elements(p_rows)
        ORDER BY value->>'event_id', value->>'division_id', value->>'email' LOOP
        incoming := jsonb_populate_record(NULL::public.event_registrations, item);
        IF NOT EXISTS (
            SELECT 1 FROM public.tournament_divisions d JOIN public.calendar c ON c.id = d.event_id
            WHERE d.event_id = incoming.event_id
              AND NOT COALESCE(c.is_weekly, false) AND NOT COALESCE(c.is_quick_event, false)
              AND (d.id = incoming.division_id OR (incoming.division_id IS NULL AND lower(trim(d.name)) = lower(trim(incoming.division))))
        ) THEN CONTINUE; END IF;
        SELECT * INTO existing FROM public.event_registrations r
        WHERE r.event_id = incoming.event_id AND lower(trim(r.email)) = lower(trim(incoming.email))
          AND lower(COALESCE(r.status, '')) <> 'withdrawn'
          AND (r.division_id = incoming.division_id OR ((r.division_id IS NULL OR incoming.division_id IS NULL) AND lower(trim(r.division)) = lower(trim(incoming.division))))
        ORDER BY (r.payment_status = 'paid') DESC, r.created_at DESC LIMIT 1;
        IF existing.id IS NOT NULL THEN
            UPDATE public.event_registrations SET
                partner_name = incoming.partner_name, partner_email = incoming.partner_email,
                partner_payment_status = CASE WHEN existing.partner_payment_status = 'paid' THEN 'paid' ELSE 'pending' END
            WHERE id = existing.id;
        ELSE
            -- A withdrawn entry keeps its historical payment and invitation token.
            UPDATE public.event_registrations SET division = '__archived__/' || id::text, division_id = NULL
            WHERE event_id = incoming.event_id AND lower(trim(email)) = lower(trim(incoming.email))
                AND division = incoming.division AND lower(COALESCE(status, '')) = 'withdrawn';
            INSERT INTO public.event_registrations(event_id, division_id, division, full_name, email, phone,
                partner_name, partner_email, payment_status, payment_method, partner_payment_status,
                status, registered_by, tshirt_size, tshirt_sponsor_name, tshirt_logo_url, access_grant_id)
            VALUES (incoming.event_id, incoming.division_id, incoming.division, incoming.full_name, lower(trim(incoming.email)), incoming.phone,
                incoming.partner_name, incoming.partner_email, 'pending', incoming.payment_method,
                CASE WHEN NULLIF(trim(incoming.partner_email), '') IS NOT NULL THEN 'pending' END,
                'registered', incoming.registered_by, incoming.tshirt_size, incoming.tshirt_sponsor_name, incoming.tshirt_logo_url, incoming.access_grant_id);
        END IF;
    END LOOP;
    -- Complete one-way links only after the new entry exists. All writes roll
    -- back together on a capacity or RLS failure, including multi-division carts.
    FOR link IN SELECT value FROM jsonb_array_elements(p_solo_links) LOOP
        UPDATE public.event_registrations SET partner_name = link->>'partner_name', partner_email = link->>'partner_email'
        WHERE id = (link->>'id')::uuid
          AND EXISTS (SELECT 1 FROM public.tournament_divisions d WHERE d.id = division_id);
    END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
