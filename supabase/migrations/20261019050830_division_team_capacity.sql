-- Team capacities apply to tournament divisions. A solo reserves one team
-- place, paid and pending entries both count, withdrawn entries do not.
-- Existing over-capacity divisions may shrink or complete pairs, but not grow.
CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.count_registration_places(p_rows jsonb)
RETURNS integer LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
    roster jsonb;
    entry jsonb;
    teammate jsonb;
    used text[] := ARRAY[]::text[];
    mutual_only boolean;
    pairs integer := 0;
BEGIN
    SELECT COALESCE(jsonb_agg(r ORDER BY r->>'key'), '[]'::jsonb) INTO roster
    FROM (
        SELECT DISTINCT ON (COALESCE(NULLIF(lower(trim(r->>'email')), ''), 'id:' || (r->>'id')))
            r || jsonb_build_object(
                'key', COALESCE(NULLIF(lower(trim(r->>'email')), ''), 'id:' || (r->>'id')),
                'partner', lower(trim(COALESCE(r->>'partner_email', '')))) AS r
        FROM jsonb_array_elements(p_rows) r
        WHERE lower(COALESCE(r->>'status', '')) <> 'withdrawn'
        ORDER BY COALESCE(NULLIF(lower(trim(r->>'email')), ''), 'id:' || (r->>'id')),
            (lower(COALESCE(r->>'payment_status', '')) = 'paid') DESC,
            (NULLIF(trim(r->>'partner_email'), '') IS NOT NULL) DESC,
            COALESCE(r->>'created_at', '') DESC, COALESCE(r->>'id', '') DESC
    ) deduped;
    FOREACH mutual_only IN ARRAY ARRAY[true, false] LOOP
        FOR entry IN SELECT value FROM jsonb_array_elements(roster) LOOP
            IF entry->>'key' = ANY(used) THEN CONTINUE; END IF;
            SELECT value INTO teammate FROM jsonb_array_elements(roster)
            WHERE value->>'key' <> entry->>'key' AND NOT (value->>'key' = ANY(used))
              AND CASE WHEN mutual_only THEN
                    entry->>'partner' = value->>'key' AND value->>'partner' = entry->>'key'
                  ELSE entry->>'partner' = value->>'key' OR value->>'partner' = entry->>'key' END
            ORDER BY value->>'key' LIMIT 1;
            IF teammate IS NOT NULL THEN
                used := used || ARRAY[entry->>'key', teammate->>'key'];
                pairs := pairs + 1;
            END IF;
        END LOOP;
    END LOOP;
    RETURN jsonb_array_length(roster) - pairs;
END;
$$;

CREATE OR REPLACE FUNCTION private.enforce_division_team_capacity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    target public.tournament_divisions;
    roster jsonb;
    before_count integer;
    after_count integer;
BEGIN
    IF TG_OP = 'UPDATE' AND
        (NEW.event_id, NEW.division_id, NEW.division, NEW.email, NEW.partner_email, NEW.status)
        IS NOT DISTINCT FROM
        (OLD.event_id, OLD.division_id, OLD.division, OLD.email, OLD.partner_email, OLD.status)
    THEN RETURN NEW; END IF;

    -- Use the same parent lock as manager merge/split and paid replacement RPCs.
    -- Withdrawals/deletions also take it so a waiting checkout sees the freed place.
    PERFORM 1 FROM public.calendar
    WHERE id IN (CASE WHEN TG_OP <> 'INSERT' THEN OLD.event_id END,
                 CASE WHEN TG_OP <> 'DELETE' THEN NEW.event_id END)
    ORDER BY id FOR UPDATE;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    IF lower(COALESCE(NEW.status, '')) = 'withdrawn' THEN RETURN NEW; END IF;
    IF EXISTS (SELECT 1 FROM public.calendar WHERE id = NEW.event_id
        AND (COALESCE(is_weekly, false) OR COALESCE(is_quick_event, false))) THEN RETURN NEW; END IF;

    SELECT * INTO target FROM public.tournament_divisions
    WHERE event_id = NEW.event_id
      AND (id = NEW.division_id OR (NEW.division_id IS NULL AND lower(trim(name)) = lower(trim(NEW.division))))
    ORDER BY id LIMIT 1;
    IF NEW.division_id IS NOT NULL AND target.id IS NULL THEN
        RAISE EXCEPTION 'Choose a valid division for this event';
    END IF;
    IF target.entry_limit IS NULL OR target.entry_limit <= 0 THEN RETURN NEW; END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb) INTO roster
    FROM public.event_registrations r
    WHERE r.event_id = NEW.event_id AND lower(COALESCE(r.status, '')) <> 'withdrawn'
      AND (r.division_id = target.id OR (r.division_id IS NULL AND lower(trim(r.division)) = lower(trim(target.name))));
    before_count := private.count_registration_places(roster);
    -- BEFORE INSERT also runs for UPSERTs: exclude an existing row with the same
    -- stable identity, so an update or gateway retry cannot consume another place.
    SELECT COALESCE(jsonb_agg(value), '[]'::jsonb) INTO roster
    FROM jsonb_array_elements(roster)
    WHERE value->>'id' <> NEW.id::text
      AND (TG_OP <> 'UPDATE' OR value->>'id' <> OLD.id::text);
    after_count := private.count_registration_places(roster || jsonb_build_array(to_jsonb(NEW)));
    IF after_count > target.entry_limit AND after_count > before_count THEN
        RAISE EXCEPTION '% is full (maximum % teams). Each solo entry reserves one team place.', target.name, target.entry_limit
            USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_division_team_capacity
BEFORE INSERT OR UPDATE OR DELETE ON public.event_registrations
FOR EACH ROW EXECUTE FUNCTION private.enforce_division_team_capacity();

-- Keep RLS and the caller's identity in force. Only explicit registration fields
-- are writable, and this endpoint can never mark an unpaid entry as paid.
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

-- Older website/mobile clients also insert a processing payment before opening
-- Paystack. Reserve inside that same transaction, so enforcement is effective
-- without requiring every player to refresh their app first.
CREATE OR REPLACE FUNCTION private.reserve_division_places_before_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
    IF NEW.status = 'processing' AND NEW.payment_type = 'event_entry_fee'
        AND NEW.metadata->>'source' = 'manual_event'
        AND jsonb_typeof(NEW.metadata->'registration_rows') = 'array' THEN
        PERFORM public.reserve_event_registration_places(NEW.metadata->'registration_rows',
            COALESCE(NEW.metadata->'solo_link_updates', '[]'::jsonb));
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER reserve_division_places_before_payment
BEFORE INSERT ON public.payments
FOR EACH ROW EXECUTE FUNCTION private.reserve_division_places_before_payment();

COMMENT ON COLUMN public.tournament_divisions.entry_limit IS
    'Maximum team places for a tournament division. Each pair or solo uses one place; withdrawn entries do not count. NULL or <= 0 means unlimited.';
REVOKE ALL ON FUNCTION private.count_registration_places(jsonb), private.enforce_division_team_capacity(), private.reserve_division_places_before_payment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_event_registration_places(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_event_registration_places(jsonb, jsonb) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
