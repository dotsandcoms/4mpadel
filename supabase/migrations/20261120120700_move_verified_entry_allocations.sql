BEGIN;

CREATE OR REPLACE FUNCTION private.project_verified_payment_entry_transfers()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    aliases jsonb;
BEGIN
    IF jsonb_typeof(new.metadata) = 'object' THEN
        new.metadata := new.metadata - 'verified_entry_transfers';
    END IF;
    IF tg_op = 'UPDATE' AND EXISTS (
        SELECT 1 FROM private.verified_payment_entry_transfers t WHERE t.payment_id = new.id AND t.event_id = new.event_id
    ) AND EXISTS (
        SELECT 1 FROM private.event_checkout_security_quotes q WHERE q.payment_id = new.id
          AND q.cart_hash = sha256(convert_to(private.checkout_cart(new)::text, 'UTF8'))
    ) THEN
        WITH covers AS (
            SELECT value, row_number() OVER (ORDER BY ordinal) AS entry_ordinal
            FROM jsonb_array_elements(CASE WHEN jsonb_typeof(new.metadata->'covers') = 'array'
                THEN new.metadata->'covers' ELSE '[]'::jsonb END) WITH ORDINALITY AS c(value, ordinal)
            WHERE value->>'type' = 'entry'
        )
        SELECT jsonb_agg(jsonb_build_object(
            'registration_id', t.registration_id, 'cover_position', t.cover_position,
            'event_id', t.event_id, 'division_id', t.division_id, 'division', t.division
        ) || CASE WHEN c.value->>'division' IS DISTINCT FROM t.division
                    OR (nullif(c.value->>'division_id', '') IS NOT NULL AND c.value->>'division_id' IS DISTINCT FROM t.division_id::text)
            THEN jsonb_build_object('original_division', c.value->>'division', 'original_division_id', c.value->>'division_id')
            ELSE '{}'::jsonb END ORDER BY t.cover_position) INTO aliases
        FROM private.verified_payment_entry_transfers t JOIN covers c ON c.entry_ordinal = t.cover_position
        WHERE t.payment_id = new.id AND t.event_id = new.event_id;
        IF aliases IS NOT NULL THEN
            new.metadata := new.metadata || jsonb_build_object('verified_entry_transfers', aliases);
        END IF;
    END IF;
    RETURN new;
END;
$$;

ALTER FUNCTION private.move_registration_division(uuid[], uuid, boolean) RENAME TO move_registration_division_before_transfer;
REVOKE ALL ON FUNCTION private.move_registration_division_before_transfer(uuid[], uuid, boolean)
    FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.move_registration_division(p_registration_ids uuid[], p_target_division_id uuid, p_reset_payment boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    source public.event_registrations;
    entry public.event_registrations;
    receipt public.payments;
    destination public.tournament_divisions;
    active_event bigint;
    hits integer;
    position integer;
BEGIN
    IF p_reset_payment IS NULL THEN
        RAISE EXCEPTION 'Choose whether to reset payment before moving.';
    END IF;
    SELECT * INTO source FROM public.event_registrations WHERE id = p_registration_ids[1];
    IF source.id IS NULL OR (NOT coalesce(private.worker_write(), false)
        AND (auth.uid() IS NULL OR NOT coalesce(public.account_is_active(), false) OR NOT coalesce(public.can_manage_event(source.event_id), false))) THEN
        RAISE EXCEPTION 'You cannot manage entries for this event.' USING ERRCODE = '42501';
    END IF;

    -- Match the lock order used by verified player replacement.
    active_event := source.event_id;
    PERFORM 1 FROM public.calendar WHERE id = active_event FOR UPDATE;
    SELECT * INTO destination FROM public.tournament_divisions WHERE id = p_target_division_id AND event_id = active_event;
    IF destination.id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.event_registrations moving JOIN public.event_registrations reserved ON reserved.event_id = moving.event_id
        WHERE moving.id = ANY(p_registration_ids) AND moving.event_id = active_event AND NOT (reserved.id = ANY(p_registration_ids))
            AND reserved.status IS DISTINCT FROM 'withdrawn' AND lower(btrim(reserved.partner_email)) = lower(btrim(moving.email))
            AND (reserved.division_id = destination.id OR (reserved.division_id IS NULL AND reserved.division = destination.name))
    ) THEN
        RAISE EXCEPTION 'A moving player already has a reserved partner spot in the target division.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM private.verified_payment_entry_transfers WHERE registration_id = ANY(p_registration_ids)) THEN
        PERFORM private.move_registration_division_before_transfer(p_registration_ids, p_target_division_id, p_reset_payment);
        RETURN;
    END IF;

    PERFORM 1 FROM public.event_registrations WHERE event_id = active_event ORDER BY id FOR UPDATE;
    PERFORM 1 FROM public.payments WHERE event_id = active_event ORDER BY id FOR UPDATE;
    IF EXISTS (
        SELECT 1 FROM private.verified_payment_entry_transfers t
        LEFT JOIN public.event_registrations r ON r.id = t.registration_id
        LEFT JOIN public.payments p ON p.id = t.payment_id
        LEFT JOIN private.event_checkout_security_quotes q ON q.payment_id = t.payment_id
        WHERE t.registration_id = ANY(p_registration_ids)
            AND (r.event_id IS DISTINCT FROM active_event OR t.event_id IS DISTINCT FROM r.event_id
                OR t.division_id IS DISTINCT FROM r.division_id OR t.division IS DISTINCT FROM r.division
                OR t.email IS DISTINCT FROM lower(btrim(r.email))
                OR q.cart_hash IS NULL OR q.cart_hash <> sha256(convert_to(private.checkout_cart(p)::text, 'UTF8')))
    ) THEN
        RAISE EXCEPTION 'The verified entry allocation changed. Review the payment before moving.' USING ERRCODE = '40001';
    END IF;

    -- Preserve a linked teammate's original quoted cover when the team moves
    -- together, including when only one slot had already been transferred.
    FOR entry IN SELECT * FROM public.event_registrations r
        WHERE r.event_id = active_event AND r.id = ANY(p_registration_ids) AND r.payment_status = 'paid' ORDER BY r.id
    LOOP
        FOR receipt IN SELECT p.* FROM public.payments p JOIN private.event_checkout_security_quotes q ON q.payment_id = p.id
            WHERE p.event_id = active_event AND p.status = 'success' AND p.payment_method = 'paystack' AND p.payment_type = 'event_entry_fee'
                AND p.metadata->>'source' = 'manual_event' AND p.amount > 0
                AND coalesce(p.is_test, false) = coalesce(entry.is_test, false)
                AND q.cart_hash = sha256(convert_to(private.checkout_cart(p)::text, 'UTF8'))
                AND NOT EXISTS (SELECT 1 FROM private.verified_payment_entry_transfers t WHERE t.payment_id = p.id AND t.registration_id = entry.id)
            ORDER BY p.id
        LOOP
            SELECT count(*), min(c.cover_ordinal) INTO hits, position
            FROM private.quoted_cover_positions(receipt.metadata, entry) c
            WHERE NOT EXISTS (SELECT 1 FROM private.verified_payment_entry_transfers t
                WHERE t.payment_id = receipt.id AND t.cover_position = c.cover_ordinal);
            IF hits > 1 THEN
                RAISE EXCEPTION 'Review the payment before moving. It needs one exact entry cover.';
            ELSIF hits = 1 THEN
                INSERT INTO private.verified_payment_entry_transfers(payment_id,registration_id,cover_position,event_id,division_id,division,email)
                VALUES(receipt.id,entry.id,position,entry.event_id,entry.division_id,entry.division,lower(btrim(entry.email)));
            END IF;
        END LOOP;
    END LOOP;

    PERFORM private.move_registration_division_before_transfer(p_registration_ids, p_target_division_id, p_reset_payment);

    UPDATE private.verified_payment_entry_transfers t SET division_id = r.division_id, division = r.division
    FROM public.event_registrations r
    WHERE r.id = t.registration_id AND t.registration_id = ANY(p_registration_ids) AND r.event_id = active_event;
    UPDATE public.payments p SET metadata = p.metadata WHERE p.event_id = active_event AND EXISTS (
        SELECT 1 FROM private.verified_payment_entry_transfers t WHERE t.payment_id = p.id AND t.registration_id = ANY(p_registration_ids)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.move_registration_division(p_registration_ids uuid[], p_target_division_id uuid, p_reset_payment boolean DEFAULT true)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
    SELECT private.move_registration_division(p_registration_ids, p_target_division_id, p_reset_payment);
$$;

REVOKE ALL ON FUNCTION private.move_registration_division(uuid[], uuid, boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.move_registration_division(uuid[], uuid, boolean) TO authenticated, service_role;

CREATE FUNCTION public.admin_reviewed_move_registration_division(
    p_event_id bigint, p_target_division_id uuid, p_entries jsonb, p_source_fee numeric, p_target_fee numeric
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    entry_ids uuid[];
    current_entries jsonb;
    current_source_fee numeric;
    current_target_fee numeric;
BEGIN
    IF auth.uid() IS NULL OR NOT coalesce(public.account_is_active(), false) OR NOT coalesce(public.can_manage_event(p_event_id), false) THEN
        RAISE EXCEPTION 'You cannot manage entries for this event.' USING ERRCODE = '42501';
    END IF;
    IF jsonb_typeof(p_entries) IS DISTINCT FROM 'array' OR jsonb_array_length(p_entries) NOT BETWEEN 1 AND 2 THEN
        RAISE EXCEPTION 'Review one active entry or one linked team.';
    END IF;
    SELECT array_agg((value->>'id')::uuid ORDER BY ordinal) INTO entry_ids
      FROM jsonb_array_elements(p_entries) WITH ORDINALITY AS input(value, ordinal);
    PERFORM 1 FROM public.calendar WHERE id=p_event_id AND event_status IS DISTINCT FROM 'cancelled' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'This event is unavailable or cancelled.'; END IF;
    PERFORM 1 FROM public.event_registrations WHERE event_id=p_event_id ORDER BY id FOR UPDATE;
    SELECT jsonb_agg(jsonb_build_object('id',r.id,'email',lower(btrim(r.email)),
        'division',r.division,'division_id',r.division_id,'status',r.status,'payment_status',r.payment_status,
        'partner_email',lower(btrim(coalesce(r.partner_email,'')))) ORDER BY selected.ordinal)
      INTO current_entries FROM unnest(entry_ids) WITH ORDINALITY AS selected(id,ordinal)
        JOIN public.event_registrations r ON r.id=selected.id AND r.event_id=p_event_id;
    IF current_entries IS DISTINCT FROM p_entries THEN
        RAISE EXCEPTION 'The reviewed entries changed. Close and refresh before moving.' USING ERRCODE = '40001';
    END IF;
    SELECT coalesce(d.entry_fee,0) INTO current_target_fee FROM public.tournament_divisions d
      WHERE d.id=p_target_division_id AND d.event_id=p_event_id FOR SHARE;
    SELECT coalesce(d.entry_fee,0) INTO current_source_fee FROM public.event_registrations r
      JOIN public.tournament_divisions d ON d.event_id=p_event_id
        AND (d.id=r.division_id OR (r.division_id IS NULL AND d.name=r.division)) WHERE r.id=entry_ids[1] FOR SHARE OF d;
    IF current_target_fee IS NULL OR current_target_fee IS DISTINCT FROM p_target_fee
        OR coalesce(current_source_fee,0) IS DISTINCT FROM p_source_fee THEN
        RAISE EXCEPTION 'The reviewed division or fees changed. Close and refresh before moving.' USING ERRCODE = '40001';
    END IF;
    PERFORM private.move_registration_division(entry_ids,p_target_division_id,true);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_reviewed_move_registration_division(bigint,uuid,jsonb,numeric,numeric) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_reviewed_move_registration_division(bigint,uuid,jsonb,numeric,numeric) TO authenticated;

CREATE FUNCTION private.verify_transferred_registration_division()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM private.verified_payment_entry_transfers t
        JOIN public.event_registrations r ON r.id = t.registration_id
        WHERE r.id = new.id AND (t.event_id IS DISTINCT FROM r.event_id
            OR ((t.division_id IS DISTINCT FROM r.division_id OR t.division IS DISTINCT FROM r.division)
                AND NOT (r.status IS NOT DISTINCT FROM 'withdrawn' AND r.division_id IS NULL
                    AND r.division IS NOT DISTINCT FROM '__archived__/' || r.id::text)))
    ) THEN
        RAISE EXCEPTION 'Move this verified entry through the reviewed division action.' USING ERRCODE = '42501';
    END IF;
    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER verify_transferred_registration_division
AFTER UPDATE ON public.event_registrations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
WHEN (old.event_id IS DISTINCT FROM new.event_id OR old.division_id IS DISTINCT FROM new.division_id OR old.division IS DISTINCT FROM new.division)
EXECUTE FUNCTION private.verify_transferred_registration_division();
REVOKE ALL ON FUNCTION private.verify_transferred_registration_division() FROM PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
