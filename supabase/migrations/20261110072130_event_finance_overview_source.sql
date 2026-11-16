-- One consistent, bounded read for the summary worker. This deliberately keeps
-- caller RLS and existing finance reconciliation; it does not grant table access.
SET LOCAL lock_timeout = '3s';
CREATE OR REPLACE FUNCTION public.event_finance_overview_source(p_event_ids bigint[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
    ids bigint[];
    events jsonb;
    registrations jsonb;
    participants jsonb;
    payments jsonb;
    divisions jsonb;
    refunds jsonb;
    licenses jsonb;
    payment jsonb;
    meta jsonb;
    refs text[] := ARRAY[]::text[];
    actor_email text := lower(trim(auth.email()));
BEGIN
    IF auth.uid() IS NULL OR NOT COALESCE(public.account_is_active(), false) THEN
        RAISE EXCEPTION 'Sign in with an active account' USING ERRCODE = '42501';
    END IF;
    IF p_event_ids IS NULL OR cardinality(p_event_ids) NOT BETWEEN 1 AND 25
        OR EXISTS (SELECT 1 FROM unnest(p_event_ids) id WHERE id IS NULL OR id <= 0) THEN
        RAISE EXCEPTION 'Choose between 1 and 25 events' USING ERRCODE = '22023';
    END IF;
    SELECT array_agg(DISTINCT id) INTO ids FROM unnest(p_event_ids) id;
    IF EXISTS (
        SELECT 1 FROM unnest(ids) id
        WHERE NOT COALESCE(public.can_manage_event(id), false)
          AND NOT EXISTS (
              SELECT 1 FROM public.admin_sidebar_permissions permission
              WHERE lower(permission.email) = actor_email
                AND 'finance' = ANY(permission.allowed_tabs)
                AND (COALESCE(permission.module_permissions->'finance'->'allowedEvents', '[]'::jsonb) = '[]'::jsonb
                    OR permission.module_permissions->'finance'->'allowedEvents' @> jsonb_build_array(id))
          )
    ) THEN RAISE EXCEPTION 'Event finance access denied' USING ERRCODE = '42501'; END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(e)), '[]'::jsonb) INTO events FROM (
        SELECT id, is_manual, entry_fee, category_fees, early_bird_fee, early_bird_ends_at,
            organiser_interim_payments, organiser_settlement_confirmation
        FROM public.calendar WHERE id = ANY(ids)
    ) e;
    IF jsonb_array_length(events) <> cardinality(ids) THEN
        RAISE EXCEPTION 'Event finance access denied' USING ERRCODE = '42501';
    END IF;
    SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb) INTO registrations
    FROM public.event_registrations r JOIN public.calendar c ON c.id = r.event_id
    WHERE r.event_id = ANY(ids) AND c.is_manual IS TRUE;
    SELECT COALESCE(jsonb_agg(to_jsonb(p)), '[]'::jsonb) INTO participants FROM (
        SELECT p.id, p.event_id, p.class_name, p.is_paid, p.profile_id, p.full_name, p.email
        FROM public.tournament_participants p JOIN public.calendar c ON c.id = p.event_id
        WHERE p.event_id = ANY(ids) AND c.is_manual IS NOT TRUE
    ) p;
    SELECT COALESCE(jsonb_agg(to_jsonb(p)), '[]'::jsonb) INTO payments
    FROM public.payments p WHERE p.event_id = ANY(ids);
    SELECT COALESCE(jsonb_agg(to_jsonb(d)), '[]'::jsonb) INTO divisions
    FROM public.tournament_divisions d WHERE d.event_id = ANY(ids);

    -- Match the same three refund links as buildEventSettlements, including
    -- reference aliases and legacy JSON-string metadata. Withdrawals stay here.
    FOR payment IN SELECT value FROM jsonb_array_elements(payments) LOOP
        meta := payment->'metadata';
        IF jsonb_typeof(meta) = 'string' THEN
            BEGIN meta := (meta #>> '{}')::jsonb;
            EXCEPTION WHEN invalid_text_representation THEN meta := '{}'::jsonb; END;
        END IF;
        refs := refs || ARRAY[payment->>'reference', meta->>'paystack_ref'];
        refs := refs || ARRAY(SELECT match[1] FROM regexp_matches(
            COALESCE(meta->>'note', '') || ' ' || COALESCE(meta->>'payment_note', ''), 'T[0-9]{10,}', 'g') match);
    END LOOP;
    SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb) INTO refunds
    FROM public.payment_refunds r
    WHERE r.payment_id IN (SELECT (p->>'id')::uuid FROM jsonb_array_elements(payments) p)
       OR r.event_registration_id IN (
            SELECT (r->>'id')::uuid FROM jsonb_array_elements(registrations) r
            UNION SELECT (p->>'id')::uuid FROM jsonb_array_elements(participants) p)
       OR r.paystack_reference = ANY(refs);

    WITH identities AS (
        SELECT DISTINCT (r->>'event_id')::bigint AS event_id, lower(trim(r->>'email')) AS identity,
            profile.id AS player_id
        FROM jsonb_array_elements(registrations) r
        LEFT JOIN LATERAL (SELECT p.id FROM public.players p
            WHERE lower(p.email) = lower(trim(r->>'email')) ORDER BY p.id DESC LIMIT 1) profile ON true
        WHERE NULLIF(trim(r->>'email'), '') IS NOT NULL
        UNION
        SELECT DISTINCT (p->>'event_id')::bigint, p->>'profile_id', (p->>'profile_id')::bigint
        FROM jsonb_array_elements(participants) p WHERE p->>'profile_id' IS NOT NULL
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object('event_id', event_id, 'identity', identity,
        'eligibility', CASE WHEN player_id IS NOT NULL THEN public.player_license_eligibility(player_id, event_id) END)), '[]'::jsonb)
    INTO licenses FROM identities;

    RETURN jsonb_build_object('events', events, 'registrations', registrations, 'participants', participants,
        'payments', payments, 'divisions', divisions, 'refunds', refunds, 'licenses', licenses);
END;
$$;
REVOKE ALL ON FUNCTION public.event_finance_overview_source(bigint[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.event_finance_overview_source(bigint[]) TO authenticated;
NOTIFY pgrst, 'reload schema';
