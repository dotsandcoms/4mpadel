-- A held retry consumes the ledger allowance before any external request.
-- Keep the claim on the existing event refund row, with no client write grant.
BEGIN;
SET LOCAL lock_timeout = '3s';

CREATE UNIQUE INDEX uq_payment_refunds_reviewed_retry_reference
    ON public.payment_refunds ((metadata->'reviewed_retry'->>'reference'))
    WHERE metadata->'reviewed_retry'->>'reference' IS NOT NULL;

CREATE FUNCTION public.claim_event_refund_retry(
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
         WHERE r.payment_id = p_payment_id AND r.status IS DISTINCT FROM 'failed';
        IF ledger.amount IS NULL OR reserved + refund.amount > ledger.amount THEN
            RETURN jsonb_build_object('unavailable', 'ledger_allowance');
        END IF;

        IF p_method = 'paystack' THEN
            SELECT coalesce(sum(r.amount), 0) INTO reserved
              FROM public.payment_refunds r
              JOIN public.payments p ON p.id = r.payment_id
             WHERE r.status IS DISTINCT FROM 'failed'
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

        component := refund.metadata->>'cover_type';
        IF component = 'entry' THEN
            SELECT e.division INTO entry_division FROM public.event_registrations e WHERE e.id = p_registration_id;
            component_amount := ledger.metadata->'division_entry_fees'->>entry_division;
        ELSIF component = 'license' AND jsonb_typeof(ledger.metadata->'line_items') = 'array' THEN
            SELECT CASE WHEN count(*) = 1 THEN max(item->>'amount') END INTO component_amount
              FROM jsonb_array_elements(ledger.metadata->'line_items') item
             WHERE coalesce(item->>'label', item->>'type', '') ~* 'licen[cs]e';
        END IF;
        IF component_amount ~ '^[0-9]+(\.[0-9]{1,2})?$' THEN
            SELECT coalesce(sum(r.amount), 0) INTO reserved FROM public.payment_refunds r
             WHERE r.payment_id = p_payment_id AND r.event_registration_id = p_registration_id
               AND r.status IS DISTINCT FROM 'failed' AND r.metadata->>'cover_type' = component;
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

CREATE FUNCTION public.apply_event_refund_retry_evidence(
    p_refund_id uuid, p_event_id bigint, p_registration_id uuid, p_reference text,
    p_provider_id text, p_status text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
    refund public.payment_refunds%ROWTYPE;
    claim jsonb;
    new_status text;
    settled_time timestamptz;
BEGIN
    IF p_status IS NULL OR p_status NOT IN ('processing', 'processed', 'failed', 'needs_attention') THEN
        RAISE EXCEPTION 'Unknown refund outcome.' USING ERRCODE = '22023';
    END IF;
    SELECT r.* INTO refund
      FROM public.payment_refunds r
      JOIN public.event_registrations e ON e.id = r.event_registration_id
      JOIN public.payments p ON p.id = r.payment_id AND p.event_id = e.event_id
     WHERE r.id = p_refund_id AND e.event_id = p_event_id AND e.id = p_registration_id
       AND r.metadata->'reviewed_retry'->>'reference' = p_reference
     FOR UPDATE OF r;
    IF NOT FOUND THEN RETURN NULL; END IF;

    claim := refund.metadata->'reviewed_retry';
    IF (claim->>'method' = 'paystack' AND (p_provider_id IS NULL OR p_provider_id !~ '^[0-9]+$'))
       OR (claim->>'method' IN ('cash', 'manual') AND (p_provider_id IS NOT NULL OR p_status <> 'processed'))
       OR (refund.paystack_refund_id IS NOT NULL AND refund.paystack_refund_id IS DISTINCT FROM p_provider_id) THEN
        RETURN NULL;
    END IF;

    new_status := p_status;
    IF refund.status = 'processed' OR (refund.status = 'failed' AND p_status <> 'processed') THEN
        new_status := refund.status;
    END IF;
    IF claim->>'phase' = 'verified' AND refund.status = new_status THEN
        RETURN jsonb_build_object('id', refund.id, 'status', refund.status, 'paystack_refund_id', refund.paystack_refund_id);
    END IF;

    settled_time := CASE WHEN new_status IN ('processed', 'failed') THEN clock_timestamp() END;
    UPDATE public.payment_refunds SET status = new_status, paystack_refund_id = p_provider_id,
           processed_at = settled_time,
           metadata = (refund.metadata - 'paystack_error') || jsonb_build_object(
               'reviewed_retry', claim || jsonb_build_object('phase', 'verified', 'provider_status', new_status, 'verified_at', clock_timestamp()),
               'retried_by', claim->>'requested_by', 'retried_at', claim->>'claimed_at')
     WHERE id = refund.id;

    IF new_status = 'processed' AND refund.reason <> 'division_switch'
       AND refund.metadata->>'preserve_registration' IS DISTINCT FROM 'true' THEN
        -- Only withdrawn entries are financially closed. A historical refund of a
        -- prior entry must not mark a currently paid/re-entered registration refunded.
        PERFORM 1 FROM public.event_registrations e WHERE e.id = p_registration_id AND e.event_id = p_event_id FOR UPDATE;
        UPDATE public.event_registrations e
           SET payment_status = 'refunded', refunded_at = coalesce(e.refunded_at, settled_time),
               refund_amount = greatest(coalesce(e.refund_amount, 0), (
                   SELECT coalesce(sum(r.amount), 0) FROM public.payment_refunds r
                   WHERE r.event_registration_id = e.id AND r.status = 'processed' AND r.reason <> 'division_switch'
               ))
         WHERE e.id = p_registration_id AND e.event_id = p_event_id AND e.status = 'withdrawn';
    END IF;

    IF new_status = 'processed' AND refund.metadata->>'cover_type' = 'license' THEN
        -- Only revoke a licence connected to this exact receipt (or its verified
        -- checkout parent). A newer licence for the same event is independent.
        UPDATE public.temporary_licenses t SET revoked_at = settled_time
         WHERE t.event_id = p_event_id AND t.revoked_at IS NULL AND EXISTS (
            SELECT 1 FROM public.event_registrations e
            JOIN public.players player ON lower(player.email) = lower(e.email)
            WHERE e.id = p_registration_id AND e.event_id = p_event_id AND player.id = t.player_id
         ) AND (t.payment_id = refund.payment_id OR EXISTS (
            SELECT 1 FROM public.payments parent WHERE parent.id = t.payment_id
               AND parent.event_id = p_event_id AND parent.reference = claim->>'transaction_reference'
         ));
    END IF;
    RETURN jsonb_build_object('id', refund.id, 'status', new_status, 'paystack_refund_id', p_provider_id);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_event_refund_retry(uuid, bigint, uuid, uuid, numeric, text, text, text, text, text, bigint, text, text, boolean),
    public.apply_event_refund_retry_evidence(uuid, bigint, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_event_refund_retry(uuid, bigint, uuid, uuid, numeric, text, text, text, text, text, bigint, text, text, boolean),
    public.apply_event_refund_retry_evidence(uuid, bigint, uuid, text, text, text) TO service_role;
COMMIT;
