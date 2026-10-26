-- A deadline closes entry creation, not payment of an existing active entry.
CREATE OR REPLACE FUNCTION private.assert_registration_deadline(
    p_event_id bigint, p_division_id uuid, p_division text, p_email text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    closes_at timestamptz;
    target_id uuid;
    target_name text;
BEGIN
    -- Serialize with capacity reservations, withdrawals and manager team changes.
    PERFORM 1 FROM public.calendar WHERE id = p_event_id FOR UPDATE;
    SELECT d.id, d.name, COALESCE(d.entries_close_at, c.registration_closes_at)
    INTO target_id, target_name, closes_at
    FROM public.calendar c LEFT JOIN public.tournament_divisions d
      ON d.event_id = c.id AND (d.id = p_division_id OR (p_division_id IS NULL AND lower(trim(d.name)) = lower(trim(p_division))))
    WHERE c.id = p_event_id ORDER BY d.id LIMIT 1;
    IF closes_at IS NULL OR closes_at > clock_timestamp() THEN RETURN; END IF;
    IF EXISTS (
        SELECT 1 FROM public.event_registrations r
        WHERE r.event_id = p_event_id AND lower(trim(r.email)) = lower(trim(p_email))
          AND lower(COALESCE(r.status, '')) <> 'withdrawn'
          AND (r.division_id = target_id OR (r.division_id IS NULL
              AND lower(trim(r.division)) = lower(trim(COALESCE(target_name, p_division)))))
    ) THEN RETURN; END IF;
    RAISE EXCEPTION 'Registration has closed. Only existing active entries can be paid; no new entries or partners can be added.';
END;
$$;

CREATE OR REPLACE FUNCTION private.enforce_registration_deadline()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    IF lower(COALESCE(NEW.status, '')) = 'withdrawn' THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' AND (NEW.event_id, NEW.division_id, NEW.division, NEW.email, NEW.status)
        IS NOT DISTINCT FROM (OLD.event_id, OLD.division_id, OLD.division, OLD.email, OLD.status)
    THEN RETURN NEW; END IF;
    PERFORM private.assert_registration_deadline(NEW.event_id, NEW.division_id, NEW.division, NEW.email);
    RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_registration_deadline
BEFORE INSERT OR UPDATE ON public.event_registrations
FOR EACH ROW EXECUTE FUNCTION private.enforce_registration_deadline();

-- Reject an expired cart before charging, including uncapped divisions and old
-- browser/native clients. Paying an existing entry never needs a new place.
CREATE OR REPLACE FUNCTION private.enforce_payment_registration_deadline()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE entry jsonb;
BEGIN
    IF NEW.status = 'processing' AND NEW.metadata->>'source' = 'manual_event'
        AND jsonb_typeof(NEW.metadata->'registration_rows') = 'array' THEN
        FOR entry IN SELECT value FROM jsonb_array_elements(NEW.metadata->'registration_rows')
            ORDER BY value->>'event_id', value->>'division_id' LOOP
            PERFORM private.assert_registration_deadline((entry->>'event_id')::bigint,
                (entry->>'division_id')::uuid, entry->>'division', entry->>'email');
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_payment_registration_deadline
BEFORE INSERT ON public.payments
FOR EACH ROW EXECUTE FUNCTION private.enforce_payment_registration_deadline();

REVOKE ALL ON FUNCTION private.assert_registration_deadline(bigint,uuid,text,text),
    private.enforce_registration_deadline(), private.enforce_payment_registration_deadline()
    FROM PUBLIC, anon, authenticated;
NOTIFY pgrst, 'reload schema';

-- Reserve uncapped tournament entries before payment too, so an in-progress
-- checkout remains an existing entry when the closing time passes.
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
