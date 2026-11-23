-- Preserve the original checkout component when a paid entry changes division.
BEGIN;
SET LOCAL lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.claim_event_refund_retry(
    p_refund_id uuid, p_event_id bigint, p_registration_id uuid, p_payment_id uuid,
    p_amount numeric, p_previous_id text, p_previous_retry text, p_method text,
    p_transaction_ref text, p_transaction_id text, p_transaction_cents bigint, p_domain text, p_actor text,
    p_reconcile_only boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
    refund public.payment_refunds%ROWTYPE;
    claim jsonb;
    previous jsonb;
    ledger public.payments%ROWTYPE;
    entry_division text;
    reserved numeric;
    component text;
    component_amount text;
    matching_aliases bigint;
BEGIN
    IF p_method IS NULL OR p_method NOT IN ('paystack', 'manual', 'cash') OR nullif(p_actor, '') IS NULL
       OR (p_method = 'paystack' AND (nullif(p_transaction_ref, '') IS NULL OR p_transaction_id !~ '^[0-9]+$'
           OR p_transaction_id IS NULL OR p_transaction_cents IS NULL OR p_transaction_cents <= 0
           OR p_domain IS NULL OR p_domain NOT IN ('live', 'test')))
       OR (p_reconcile_only IS TRUE AND (p_method <> 'paystack' OR p_previous_id IS NULL)) THEN
        RAISE EXCEPTION 'Refund retry requires verified original payment evidence.' USING ERRCODE = '22023';
    END IF;

    SELECT r.* INTO refund
      FROM public.payment_refunds r
      JOIN public.event_registrations e ON e.id = r.event_registration_id
      JOIN public.payments p ON p.id = r.payment_id AND p.event_id = e.event_id
     WHERE r.id = p_refund_id AND e.event_id = p_event_id AND e.id = p_registration_id AND p.id = p_payment_id
       AND r.status = 'failed' AND r.amount = p_amount AND r.amount > 0 AND r.currency = 'ZAR'
       AND r.paystack_refund_id IS NOT DISTINCT FROM p_previous_id
       AND r.metadata->'reviewed_retry'->>'reference' IS NOT DISTINCT FROM p_previous_retry
       AND r.metadata->'reviewed_retry'->>'phase' IS DISTINCT FROM 'held'
       AND coalesce(nullif(lower(p.payment_method), ''), 'paystack') = p_method
       AND p.status = 'success'
     FOR UPDATE OF r;
    IF NOT FOUND THEN RETURN NULL; END IF;

    SELECT p.* INTO ledger FROM public.payments p WHERE p.id = p_payment_id;
    IF p_method = 'paystack' AND coalesce(nullif(btrim(ledger.metadata->>'parent_reference'), ''),
        CASE WHEN ledger.reference LIKE 'LIC-%' THEN substr(ledger.reference, 5) ELSE ledger.reference END) IS DISTINCT FROM p_transaction_ref THEN
        RETURN NULL;
    END IF;

    -- Different failed rows can share a ledger receipt or a checkout. Serialize
    -- the allowance calculation and reservation on the original gateway charge.
    -- Cash refunds are serialized on their ledger payment instead.
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
        CASE WHEN p_method = 'paystack' THEN '4m-refund:' || p_domain || ':' || p_transaction_ref
             ELSE '4m-refund:ledger:' || p_payment_id::text END, 0));

    IF p_reconcile_only IS NOT TRUE THEN
        SELECT coalesce(sum(r.amount), 0) INTO reserved FROM public.payment_refunds r
         WHERE r.payment_id = p_payment_id AND r.id <> refund.id
           AND (r.status IS DISTINCT FROM 'failed' OR r.metadata->'verified_switch_reservation' = 'true'::jsonb);
        IF ledger.amount IS NULL OR reserved + refund.amount > ledger.amount THEN
            RETURN jsonb_build_object('unavailable', 'ledger_allowance');
        END IF;

        IF p_method = 'paystack' THEN
            SELECT coalesce(sum(r.amount), 0) INTO reserved
              FROM public.payment_refunds r
              JOIN public.payments p ON p.id = r.payment_id
             WHERE r.id <> refund.id
               AND (r.status IS DISTINCT FROM 'failed' OR r.metadata->'verified_switch_reservation' = 'true'::jsonb)
               AND (r.paystack_reference = p_transaction_ref OR coalesce(nullif(btrim(p.metadata->>'parent_reference'), ''),
                    CASE WHEN p.reference LIKE 'LIC-%' THEN substr(p.reference, 5) ELSE p.reference END) = p_transaction_ref)
               AND coalesce(r.metadata->'reviewed_retry'->>'domain', CASE
                    WHEN p.is_test IS TRUE OR p.metadata->>'is_test' = 'true' THEN 'test'
                    WHEN p.is_test IS FALSE OR p.metadata->>'is_test' = 'false' THEN 'live'
                    ELSE p_domain END) = p_domain;
            IF (reserved + refund.amount) * 100 > p_transaction_cents THEN
                RETURN jsonb_build_object('unavailable', 'gateway_allowance');
            END IF;
        END IF;

        component := nullif(refund.metadata->>'cover_type', '');
        IF component = 'entry' OR component IS NULL THEN
            -- The projected ordinal counts top-level entry covers. Use the
            -- original checkout price even if the active division has changed.
            SELECT count(*), min(ledger.metadata->'division_entry_fees'->>(cover.value->>'division'))
              INTO matching_aliases, component_amount
              FROM jsonb_array_elements(CASE WHEN jsonb_typeof(ledger.metadata->'verified_entry_transfers') = 'array'
                       THEN ledger.metadata->'verified_entry_transfers' ELSE '[]'::jsonb END) AS alias(value)
              LEFT JOIN (
                  SELECT value, row_number() OVER (ORDER BY ordinal) AS position
                  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(ledger.metadata->'covers') = 'array'
                           THEN ledger.metadata->'covers' ELSE '[]'::jsonb END) WITH ORDINALITY AS item(value, ordinal)
                  WHERE value->>'type' = 'entry'
              ) AS cover ON jsonb_typeof(alias.value->'cover_position') = 'number'
                       AND alias.value->>'cover_position' = cover.position::text
                       AND alias.value->>'event_id' = p_event_id::text
                       AND CASE WHEN nullif(cover.value->>'division_id', '') IS NOT NULL
                           THEN cover.value->>'division_id' = coalesce(alias.value->>'original_division_id', alias.value->>'division_id')
                           ELSE cover.value->>'division' = coalesce(alias.value->>'original_division', alias.value->>'division') END
             WHERE alias.value->>'registration_id' = p_registration_id::text;
            IF matching_aliases > 0 THEN
                component := 'entry';
                IF matching_aliases <> 1 OR (component_amount ~ '^[0-9]+(\.[0-9]{1,2})?$') IS NOT TRUE THEN
                    RETURN jsonb_build_object('unavailable', 'component_allowance');
                END IF;
            ELSIF component = 'entry' OR refund.reason = 'division_switch' THEN
                component := 'entry';
                SELECT e.division INTO entry_division FROM public.event_registrations e WHERE e.id = p_registration_id;
                component_amount := ledger.metadata->'division_entry_fees'->>entry_division;
            END IF;
        ELSIF component = 'license' AND jsonb_typeof(ledger.metadata->'line_items') = 'array' THEN
            SELECT CASE WHEN count(*) = 1 THEN max(item->>'amount') END INTO component_amount
              FROM jsonb_array_elements(ledger.metadata->'line_items') item
             WHERE coalesce(item->>'label', item->>'type', '') ~* 'licen[cs]e';
        END IF;
        IF component_amount ~ '^[0-9]+(\.[0-9]{1,2})?$' THEN
            SELECT coalesce(sum(r.amount), 0) INTO reserved FROM public.payment_refunds r
             WHERE r.payment_id = p_payment_id AND r.event_registration_id = p_registration_id
               AND r.id <> refund.id
               AND (r.status IS DISTINCT FROM 'failed' OR r.metadata->'verified_switch_reservation' = 'true'::jsonb)
               AND (r.metadata->>'cover_type' = component
                    OR (component = 'entry' AND nullif(r.metadata->>'cover_type', '') IS NULL));
            IF reserved + refund.amount > component_amount::numeric THEN
                RETURN jsonb_build_object('unavailable', 'component_allowance');
            END IF;
        END IF;
    END IF;

    previous := refund.metadata->'reviewed_retry';
    claim := jsonb_build_object(
        'reference', '4m-refund-' || replace(gen_random_uuid()::text, '-', ''),
        'phase', 'held', 'transaction_reference', p_transaction_ref,
        'transaction_id', p_transaction_id, 'original_amount_cents', p_transaction_cents, 'domain', p_domain, 'method', p_method,
        'requested_by', p_actor, 'claimed_at', clock_timestamp(), 'previous_id', p_previous_id
    );
    UPDATE public.payment_refunds
       SET status = 'needs_attention', paystack_refund_id = NULL, processed_at = NULL,
           paystack_reference = coalesce(p_transaction_ref, refund.paystack_reference),
           metadata = coalesce(refund.metadata, '{}'::jsonb) || jsonb_build_object(
               'reviewed_retry', claim,
               'reviewed_retry_history', coalesce(refund.metadata->'reviewed_retry_history', '[]'::jsonb)
                   || CASE WHEN previous IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(previous) END
           )
     WHERE id = refund.id;
    RETURN claim;
END;
$$;

COMMIT;
