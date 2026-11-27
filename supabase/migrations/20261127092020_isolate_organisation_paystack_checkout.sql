BEGIN;

-- The public flag only tells checkout to use the server-controlled route. A
-- paused route remains marked so checkout cannot fall back to 4M by mistake.
ALTER TABLE public.calendar ADD COLUMN paystack_subaccount_checkout boolean NOT NULL DEFAULT false;

CREATE FUNCTION private.stamp_event_paystack_checkout() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
    new.paystack_subaccount_checkout:=EXISTS (
        SELECT 1 FROM private.event_paystack_routes WHERE event_id=new.id
    );
    RETURN new;
END $$;
CREATE TRIGGER stamp_event_paystack_checkout
BEFORE INSERT OR UPDATE OF paystack_subaccount_checkout ON public.calendar
FOR EACH ROW EXECUTE FUNCTION private.stamp_event_paystack_checkout();

CREATE FUNCTION private.sync_event_paystack_checkout() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
    IF tg_op='DELETE' THEN
        UPDATE public.calendar SET paystack_subaccount_checkout=false WHERE id=old.event_id;
    ELSE
        UPDATE public.calendar SET paystack_subaccount_checkout=true WHERE id=new.event_id;
    END IF;
    RETURN NULL;
END $$;
CREATE TRIGGER sync_event_paystack_checkout
AFTER INSERT OR DELETE ON private.event_paystack_routes
FOR EACH ROW EXECUTE FUNCTION private.sync_event_paystack_checkout();
UPDATE public.calendar c SET paystack_subaccount_checkout=true
FROM private.event_paystack_routes r WHERE r.event_id=c.id;

REVOKE ALL ON FUNCTION private.stamp_event_paystack_checkout(), private.sync_event_paystack_checkout()
    FROM PUBLIC,anon,authenticated,service_role;

-- A weekly form can be opened on a different occurrence. Scope the charge
-- to the dates its entry fees actually cover. Top-ups have no cover array.
CREATE OR REPLACE FUNCTION private.routed_paystack_event(p_event bigint, p_meta jsonb) RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
    WITH entries AS (
        SELECT coalesce(nullif(item->>'event_id',''),p_event::text) AS event_key
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_meta->'covers')='array' THEN p_meta->'covers' ELSE '[]' END) item
        WHERE item->>'type'='entry'
    )
    SELECT min(r.event_id) FROM private.event_paystack_routes r
    WHERE (r.event_id=p_event AND NOT EXISTS (SELECT 1 FROM entries))
       OR EXISTS (SELECT 1 FROM entries WHERE event_key=r.event_id::text)
$$;

CREATE OR REPLACE FUNCTION public.prepare_paystack_split(p_payment uuid, p_funding_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
    p public.payments;
    a private.organisation_paystack_accounts;
    s private.payment_paystack_splits;
    routing private.event_paystack_routes;
    q private.event_checkout_security_quotes;
    event_key bigint;
    entry_cents bigint;
    total_cents bigint;
    canonical_cents bigint;
    fee_percent numeric;
    price_division uuid;
    cart_item jsonb;
    child_event bigint;
    destination_domain text;
BEGIN
    SELECT * INTO p FROM public.payments WHERE id=p_payment;
    IF p.id IS NULL OR p.payment_type<>'event_entry_fee' OR p.payment_method<>'paystack'
        OR p.status NOT IN ('pending','processing') THEN RAISE EXCEPTION 'Start a new tournament checkout.'; END IF;
    SELECT * INTO s FROM private.payment_paystack_splits WHERE reference=p.reference;
    IF s.reference IS NOT NULL THEN RETURN to_jsonb(s); END IF;
    event_key:=private.routed_paystack_event(p.event_id,p.metadata);
    IF event_key IS NULL THEN RETURN NULL; END IF;
    IF event_key IS DISTINCT FROM p.event_id THEN
        RAISE EXCEPTION 'Pay for this tournament separately from its event page.';
    END IF;
    SELECT * INTO routing FROM private.event_paystack_routes WHERE event_id=event_key;
    PERFORM 1 FROM public.organisations WHERE id=routing.organisation_id FOR SHARE;
    SELECT * INTO routing FROM private.event_paystack_routes WHERE event_id=event_key FOR SHARE;
    SELECT * INTO a FROM private.organisation_paystack_accounts WHERE organisation_id=routing.organisation_id;
    destination_domain:=CASE WHEN p.is_test THEN 'test' ELSE 'live' END;
    IF routing.paused OR a.code IS NULL OR a.domain IS DISTINCT FROM destination_domain
        OR (destination_domain='live' AND p_funding_confirmed IS DISTINCT FROM true)
        OR NOT EXISTS (SELECT 1 FROM public.calendar c WHERE c.id=p.event_id AND c.organisation_id=routing.organisation_id)
    THEN RAISE EXCEPTION 'Online payments are paused for this tournament. Contact the organiser.'; END IF;

    SELECT * INTO q FROM private.event_checkout_security_quotes WHERE payment_id=p.id;
    IF q.payment_id IS NULL OR q.original_amount<>p.amount THEN
        RAISE EXCEPTION 'A verified server quote is required for this checkout.';
    END IF;
    IF p.metadata->>'source'='division_switch' THEN
        entry_cents:=round(q.required_amount*100);
    ELSE
        entry_cents:=0;
        FOR cart_item IN SELECT value FROM jsonb_array_elements(p.metadata->'covers') WHERE value->>'type'='entry' LOOP
            child_event:=coalesce((cart_item->>'event_id')::bigint,p.event_id);
            IF child_event IS DISTINCT FROM p.event_id THEN
                RAISE EXCEPTION 'Pay for this tournament separately from its event page.';
            END IF;
            SELECT (x->>'division_id')::uuid INTO price_division
                FROM jsonb_array_elements(coalesce(p.metadata->'registration_rows','[]')) x
                WHERE coalesce((x->>'event_id')::bigint,p.event_id)=child_event
                    AND lower(trim(x->>'email'))=lower(trim(cart_item->>'email')) AND x->>'division'=cart_item->>'division'
                LIMIT 1;
            IF price_division IS NULL THEN
                SELECT r.division_id INTO price_division FROM public.event_registrations r
                WHERE r.event_id=child_event AND lower(trim(r.email))=lower(trim(cart_item->>'email'))
                    AND r.division=cart_item->>'division' AND r.status IS DISTINCT FROM 'withdrawn'
                ORDER BY r.created_at DESC LIMIT 1;
            END IF;
            entry_cents:=entry_cents+round(private.current_entry_fee(child_event,price_division,cart_item->>'division')*100);
        END LOOP;
    END IF;
    -- Licence-only baskets continue to settle through the primary account.
    IF entry_cents=0 AND p.amount=q.license_amount THEN RETURN jsonb_build_object('licenceOnly',true); END IF;
    SELECT coalesce(c.event_fee_percent,0) INTO fee_percent FROM public.commerce_config c WHERE c.id='default';
    total_cents:=round(p.amount*100);
    canonical_cents:=entry_cents+round(q.license_amount*100)
        +CASE WHEN p.metadata->>'source'='division_switch' THEN 0 ELSE round(entry_cents*fee_percent/100) END;
    -- Native and current web quote the fee on the basket. Older event checkout
    -- rounds by entry. Both totals must be backed by server pricing.
    IF entry_cents IS NULL OR entry_cents<=0 OR canonical_cents IS NULL
        OR total_cents NOT IN (canonical_cents,round(q.required_amount*100))
        OR total_cents<entry_cents+round(q.license_amount*100)
        OR (fee_percent=0 AND total_cents<>canonical_cents) THEN
        RAISE EXCEPTION 'Review the tournament price and start a new checkout.';
    END IF;

    INSERT INTO private.payment_paystack_splits(reference,payment_id,organisation_id,event_id,code,domain,provider_id,amount_cents,retained_cents)
    VALUES(p.reference,p.id,routing.organisation_id,event_key,a.code,a.domain,a.provider_id,round(p.amount*100),round(p.amount*100)-entry_cents)
    ON CONFLICT (reference) DO NOTHING;
    SELECT * INTO s FROM private.payment_paystack_splits WHERE reference=p.reference;
    RETURN to_jsonb(s);
END $$;

CREATE OR REPLACE FUNCTION private.guard_paystack_organisation_split() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
    s private.payment_paystack_splits;
    r private.event_paystack_routes;
BEGIN
    IF tg_op='UPDATE' AND (new.id,new.event_id,new.reference,new.payment_method,new.payment_type,new.is_test) IS DISTINCT FROM
        (old.id,old.event_id,old.reference,old.payment_method,old.payment_type,old.is_test)
        AND EXISTS (SELECT 1 FROM private.payment_paystack_splits WHERE payment_id=old.id) THEN
        RAISE EXCEPTION 'The tournament payment destination is fixed.';
    END IF;
    IF new.metadata ?| ARRAY['organisation_paystack','organisation_paystack_required'] THEN
        new.metadata:=new.metadata-ARRAY['organisation_paystack','organisation_paystack_required'];
    END IF;
    IF new.payment_method IS DISTINCT FROM 'paystack' THEN RETURN new; END IF;
    IF new.payment_type IS DISTINCT FROM 'event_entry_fee' THEN
        -- A mixed checkout issues licence ledger children. They keep the
        -- parent refund route even if the tournament is later paused.
        IF new.reference LIKE 'LIC-%' AND new.metadata ? 'parent_reference' AND EXISTS (
            SELECT 1 FROM private.payment_paystack_splits s
            JOIN public.payments parent ON parent.id=s.payment_id
            WHERE s.reference=new.metadata->>'parent_reference' AND parent.event_id=new.event_id
                AND s.verified_at IS NOT NULL
        ) THEN
            new.metadata:=new.metadata||jsonb_build_object('organisation_paystack_required',true);
        END IF;
        RETURN new;
    END IF;
    IF tg_op='INSERT' THEN PERFORM 1 FROM public.calendar WHERE id=new.event_id FOR SHARE; END IF;
    SELECT * INTO r FROM private.event_paystack_routes WHERE event_id=private.routed_paystack_event(new.event_id,new.metadata);
    IF r.event_id IS NULL AND NOT (tg_op='UPDATE' AND old.metadata ? 'organisation_paystack_required') THEN RETURN new; END IF;
    SELECT * INTO s FROM private.payment_paystack_splits WHERE reference=new.reference;
    IF s.reference IS NOT NULL THEN
        IF (new.id,new.event_id,coalesce(new.is_test,false)) IS DISTINCT FROM
            (s.payment_id,(SELECT p.event_id FROM public.payments p WHERE p.id=s.payment_id),s.domain='test') THEN
            RAISE EXCEPTION 'The tournament payment destination is fixed.';
        END IF;
        IF new.status IN ('success','refunded') AND s.verified_at IS NULL THEN
            RAISE EXCEPTION 'The Paystack subaccount split must be verified before marking this entry paid.';
        END IF;
        new.metadata:=(coalesce(new.metadata,'{}')-ARRAY['parent_reference','parent_payment_id'])
            ||jsonb_build_object('organisation_paystack_required',true);
        IF s.verified_at IS NOT NULL THEN
            new.metadata:=new.metadata||jsonb_build_object('organisation_paystack',jsonb_build_object(
                'organisation_id',s.organisation_id,'entry_cents',s.amount_cents-s.retained_cents,
                'processing_cents',s.fee_cents,'net_cents',s.organiser_cents));
        END IF;
        RETURN new;
    END IF;
    IF r.event_id IS NULL OR (tg_op='UPDATE' AND old.created_at<r.starts_at
        AND old.metadata->>'organisation_paystack_required' IS DISTINCT FROM 'true') THEN RETURN new; END IF;
    IF tg_op='INSERT' AND NOT private.worker_write() AND current_setting('fourm.preparing_web_paystack_split',true) IS DISTINCT FROM 'on'
        AND new.status IN ('pending','processing','success') THEN
        RAISE EXCEPTION 'Refresh this page and use the tournament’s secure checkout.';
    END IF;
    IF new.status IN ('success','refunded') AND NOT EXISTS (
        SELECT 1 FROM private.event_checkout_security_quotes q
        WHERE q.payment_id=new.id AND q.license_amount>0 AND q.license_amount=q.original_amount
            AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(new.metadata->'covers','[]')) x WHERE x->>'type'='entry')
    ) THEN RAISE EXCEPTION 'A verified Paystack split is required for this tournament.'; END IF;
    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(new.metadata->'covers')='array' THEN new.metadata->'covers' ELSE '[]' END
        ) item WHERE item->>'type'='license'
    ) AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(new.metadata->'covers')='array' THEN new.metadata->'covers' ELSE '[]' END
        ) item WHERE item->>'type'='entry'
    ) THEN RETURN new; END IF;
    new.metadata:=coalesce(new.metadata,'{}')||jsonb_build_object('organisation_paystack_required',true);
    RETURN new;
END $$;

CREATE OR REPLACE FUNCTION public.claim_paystack_split_refund(p_reference text, p_refund_id uuid,
    p_amount_cents bigint, p_funding_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
    s private.payment_paystack_splits;
    r public.payment_refunds;
    existing private.paystack_split_refund_claims;
    item_type text;
    committed bigint;
    cap bigint;
BEGIN
    SELECT * INTO s FROM private.payment_paystack_splits WHERE reference=p_reference FOR UPDATE;
    IF NOT FOUND THEN RETURN NULL; END IF;
    IF s.verified_at IS NULL OR (s.domain='live' AND p_funding_confirmed IS DISTINCT FROM true) THEN
        RAISE EXCEPTION 'This refund needs Paystack funding review before it can be sent.';
    END IF;
    SELECT * INTO r FROM public.payment_refunds WHERE id=p_refund_id;
    IF r.id IS NULL OR round(r.amount*100) IS DISTINCT FROM p_amount_cents OR p_amount_cents<=0
        OR r.currency IS DISTINCT FROM 'ZAR' OR r.paystack_reference IS DISTINCT FROM s.reference
        OR NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.id=r.payment_id
            AND (p.id=s.payment_id OR p.metadata->>'parent_reference'=s.reference))
    THEN RAISE EXCEPTION 'The refund does not match the original Paystack payment.'; END IF;

    SELECT * INTO existing FROM private.paystack_split_refund_claims WHERE refund_id=p_refund_id;
    IF existing.refund_id IS NULL THEN
        item_type:=coalesce(r.metadata->>'cover_type','entry');
        IF item_type NOT IN ('entry','license') THEN RAISE EXCEPTION 'Choose a valid refund item.'; END IF;
        IF EXISTS (SELECT 1 FROM private.paystack_split_refund_claims c JOIN public.payment_refunds f ON f.id=c.refund_id
            WHERE c.reference=s.reference AND c.cover_type=item_type AND f.event_registration_id=r.event_registration_id
                AND f.reason=r.reason AND c.amount_cents=p_amount_cents) THEN
            RAISE EXCEPTION 'This refund is already recorded. Review the original refund.';
        END IF;
        SELECT coalesce(sum(c.amount_cents),0) INTO committed FROM private.paystack_split_refund_claims c
            WHERE c.reference=s.reference AND c.cover_type=item_type;
        cap:=CASE WHEN item_type='entry' THEN s.amount_cents-s.retained_cents ELSE s.retained_cents END;
        IF committed+p_amount_cents>cap THEN RAISE EXCEPTION 'The refund exceeds the amount available for this payment item.'; END IF;
        INSERT INTO private.paystack_split_refund_claims(refund_id,reference,amount_cents,cover_type)
        VALUES(p_refund_id,p_reference,p_amount_cents,item_type);
    ELSIF existing.reference IS DISTINCT FROM p_reference OR existing.amount_cents IS DISTINCT FROM p_amount_cents THEN
        RAISE EXCEPTION 'The original refund amount and payment reference are fixed.';
    END IF;
    UPDATE public.payment_refunds SET metadata=coalesce(metadata,'{}')||jsonb_build_object('organisation_paystack_refund',true)
    WHERE id=p_refund_id AND metadata->>'organisation_paystack_refund' IS DISTINCT FROM 'true';
    RETURN jsonb_build_object('reference','ORGREF-'||p_refund_id::text,'domain',s.domain,
        'fundedBy',CASE WHEN coalesce(existing.cover_type,item_type)='entry' THEN 'organiser' ELSE '4m' END);
END $$;

-- Keep the claim label across provider response updates so an ambiguous
-- webhook cannot be allocated through the old approximate matching path.
CREATE FUNCTION private.preserve_paystack_split_refund_marker() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
    IF old.metadata->>'organisation_paystack_refund'='true' THEN
        new.metadata:=coalesce(new.metadata,'{}')||jsonb_build_object('organisation_paystack_refund',true);
    END IF;
    RETURN new;
END $$;
CREATE TRIGGER preserve_paystack_split_refund_marker
BEFORE UPDATE OF metadata ON public.payment_refunds
FOR EACH ROW WHEN (old.metadata->>'organisation_paystack_refund'='true')
EXECUTE FUNCTION private.preserve_paystack_split_refund_marker();
REVOKE ALL ON FUNCTION private.preserve_paystack_split_refund_marker() FROM PUBLIC,anon,authenticated,service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
