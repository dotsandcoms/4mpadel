BEGIN;

CREATE TABLE private.organisation_paystack_accounts (
    organisation_id uuid PRIMARY KEY REFERENCES public.organisations(id) ON DELETE CASCADE,
    code text NOT NULL CHECK (code ~ '^ACCT_[A-Za-z0-9]+$'),
    provider_id bigint NOT NULL CHECK (provider_id>0),
    domain text NOT NULL CHECK (domain IN ('test','live')),
    business_name text NOT NULL,
    bank_name text,
    last_four text CHECK (last_four ~ '^[0-9]{4}$'),
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid NOT NULL,
    UNIQUE (domain, code)
);

CREATE TABLE private.event_paystack_routes (
    event_id bigint PRIMARY KEY REFERENCES public.calendar(id) ON DELETE CASCADE,
    organisation_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
    starts_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    paused boolean NOT NULL DEFAULT false
);

CREATE TABLE private.payment_paystack_splits (
    reference text PRIMARY KEY,
    payment_id uuid NOT NULL UNIQUE REFERENCES public.payments(id) ON DELETE RESTRICT,
    organisation_id uuid NOT NULL,
    event_id bigint NOT NULL,
    code text NOT NULL,
    domain text NOT NULL,
    provider_id bigint NOT NULL,
    amount_cents bigint NOT NULL,
    retained_cents bigint NOT NULL CHECK (retained_cents >= 0 AND retained_cents < amount_cents),
    checkout jsonb,
    fee_cents bigint,
    organiser_cents bigint,
    verified_at timestamptz
);

CREATE TABLE private.paystack_routing_audit (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id uuid NOT NULL,
    event_id bigint,
    action text NOT NULL,
    actor_id uuid,
    occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    details jsonb NOT NULL DEFAULT '{}'
);

ALTER TABLE private.organisation_paystack_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.event_paystack_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.payment_paystack_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.paystack_routing_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.organisation_paystack_accounts, private.event_paystack_routes,
    private.payment_paystack_splits, private.paystack_routing_audit FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.can_manage_paystack_subaccounts() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
    SELECT private.permission_actor_active() AND coalesce(public.is_super_admin(auth.email()), false)
$$;

-- Privileged calls originate from the Edge function after the caller has passed the live super-admin check.
CREATE FUNCTION public.manage_paystack_subaccounts(p_action text, p_org uuid DEFAULT NULL,
    p_payload jsonb DEFAULT '{}', p_actor uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
    a private.organisation_paystack_accounts;
    e public.calendar;
    routed private.event_paystack_routes;
    event_key bigint;
BEGIN
    IF p_action = 'list' THEN
        RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,
            'account',to_jsonb(a)-'updated_by') ORDER BY o.name,o.id),'[]')
            FROM public.organisations o LEFT JOIN private.organisation_paystack_accounts a ON a.organisation_id=o.id);
    END IF;
    IF p_org IS NULL THEN RAISE EXCEPTION 'Choose an organisation.'; END IF;
    PERFORM 1 FROM public.organisations WHERE id=p_org FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Organisation not found.'; END IF;
    SELECT * INTO a FROM private.organisation_paystack_accounts WHERE organisation_id=p_org;

    IF p_action = 'events' THEN
        RETURN jsonb_build_object('account',to_jsonb(a)-'updated_by','events',(
            SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.event_name,
                'startDate',c.start_date,'status',CASE WHEN r.paused THEN 'paused'
                WHEN r.event_id IS NOT NULL THEN 'enabled' ELSE 'off' END) ORDER BY c.start_date,c.id),'[]')
            FROM public.calendar c LEFT JOIN private.event_paystack_routes r ON r.event_id=c.id
            WHERE (r.organisation_id=p_org OR (c.organisation_id=p_org AND c.is_manual
                AND c.payment_method='platform' AND c.allow_payments IS DISTINCT FROM false
                AND c.registration_opens_at > now()
                AND NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.event_id=c.id AND p.payment_method='paystack')))
            AND c.start_date >= (now() AT TIME ZONE 'Africa/Johannesburg')::date
        ));
    ELSIF p_action = 'save' THEN
        PERFORM pg_advisory_xact_lock(hashtextextended((p_payload->>'domain')||':'||(p_payload->>'code'),1));
        IF EXISTS (SELECT 1 FROM private.paystack_routing_audit h
            WHERE h.action='link' AND h.organisation_id<>p_org
                AND h.details->>'code'=p_payload->>'code' AND h.details->>'domain'=p_payload->>'domain') THEN
            RAISE EXCEPTION 'This Paystack subaccount is already linked to another organisation.';
        END IF;
        IF a.updated_at IS DISTINCT FROM (p_payload->>'expectedVersion')::timestamptz THEN
            RAISE EXCEPTION 'The saved subaccount changed. Refresh and review it again.';
        END IF;
        IF a.code IS DISTINCT FROM p_payload->>'code' AND EXISTS (
            SELECT 1 FROM private.event_paystack_routes r JOIN public.calendar c ON c.id=r.event_id
            WHERE r.organisation_id=p_org AND NOT r.paused
                AND coalesce(c.end_date,c.start_date) >= (now() AT TIME ZONE 'Africa/Johannesburg')::date
        ) THEN RAISE EXCEPTION 'Pause all open tournaments before replacing this subaccount.'; END IF;
        INSERT INTO private.organisation_paystack_accounts(organisation_id,code,provider_id,domain,business_name,bank_name,last_four,updated_by)
        VALUES(p_org,p_payload->>'code',(p_payload->>'providerId')::bigint,p_payload->>'domain',p_payload->>'businessName',
            p_payload->>'bankName',p_payload->>'lastFour',p_actor)
        ON CONFLICT (organisation_id) DO UPDATE SET code=excluded.code, provider_id=excluded.provider_id, domain=excluded.domain,
            business_name=excluded.business_name, bank_name=excluded.bank_name, last_four=excluded.last_four,
            updated_by=excluded.updated_by, updated_at=clock_timestamp()
        RETURNING * INTO a;
        INSERT INTO private.paystack_routing_audit(organisation_id,action,actor_id,details)
        VALUES(p_org,'link',p_actor,jsonb_build_object('code',a.code,'domain',a.domain));
        RETURN to_jsonb(a)-'updated_by';
    ELSIF p_action IN ('enable','pause') THEN
        event_key := (p_payload->>'eventId')::bigint;
        SELECT * INTO e FROM public.calendar WHERE id=event_key FOR NO KEY UPDATE;
        SELECT * INTO routed FROM private.event_paystack_routes WHERE event_id=event_key FOR UPDATE;
        IF event_key IS NULL OR e.id IS NULL OR (p_action='enable' AND e.organisation_id IS DISTINCT FROM p_org)
            OR (routed.event_id IS NOT NULL AND routed.organisation_id IS DISTINCT FROM p_org) THEN
            RAISE EXCEPTION 'Choose a tournament for this organisation.';
        END IF;
        IF p_action = 'enable' THEN
            IF a.code IS NULL OR a.code IS DISTINCT FROM p_payload->>'verifiedCode'
                OR a.updated_at IS DISTINCT FROM (p_payload->>'verifiedVersion')::timestamptz THEN
                RAISE EXCEPTION 'Verify the current organisation subaccount before enabling routing.';
            END IF;
            IF NOT coalesce(e.is_manual,false) OR e.payment_method IS DISTINCT FROM 'platform'
                OR e.allow_payments IS FALSE OR e.event_status='cancelled' THEN
                RAISE EXCEPTION 'Choose a tournament that accepts 4M online entry payments.';
            END IF;
            IF routed.event_id IS NULL AND (e.registration_opens_at IS NULL OR e.registration_opens_at <= now() OR EXISTS (
                SELECT 1 FROM public.payments WHERE event_id=event_key AND payment_method='paystack'
            )) THEN RAISE EXCEPTION 'Enable routing before registration opens and before any Paystack checkout.'; END IF;
            INSERT INTO private.event_paystack_routes(event_id,organisation_id) VALUES(event_key,p_org)
            ON CONFLICT (event_id) DO UPDATE SET paused=false;
        ELSE
            UPDATE private.event_paystack_routes SET paused=true WHERE event_id=event_key AND NOT paused;
            IF NOT FOUND THEN RAISE EXCEPTION 'This tournament has no active Paystack subaccount routing.'; END IF;
        END IF;
        INSERT INTO private.paystack_routing_audit(organisation_id,event_id,action,actor_id,details)
        VALUES(p_org,event_key,p_action,p_actor,jsonb_build_object('code',a.code));
        RETURN jsonb_build_object('status',CASE WHEN p_action='enable' THEN 'enabled' ELSE 'paused' END);
    END IF;
    RAISE EXCEPTION 'Unknown Paystack subaccount action.';
EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'This Paystack subaccount is already linked to another organisation.';
END $$;

-- Any paid items in a weekly cart must use the same route. Return the first
-- configured event even for a legacy cart anchored to a different week.
CREATE FUNCTION private.routed_paystack_event(p_event bigint, p_meta jsonb) RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
    SELECT min(r.event_id) FROM private.event_paystack_routes r
    WHERE r.event_id=p_event OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_meta->'covers')='array'
            THEN p_meta->'covers' ELSE '[]' END) x
        WHERE x->>'event_id'=r.event_id::text AND x->>'type'='entry'
    )
$$;

CREATE FUNCTION public.prepare_web_paystack_split(p_payment jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
    p public.payments;
    existing public.payments;
    event_key bigint := (p_payment->>'event_id')::bigint;
    ref text := p_payment->>'reference';
    meta jsonb := p_payment->'metadata';
    actor_email text := lower(trim(auth.email()));
    payer bigint;
    scope_event bigint;
BEGIN
    IF NOT private.permission_actor_active() THEN RAISE EXCEPTION 'Sign in again to pay for this entry.' USING ERRCODE='42501'; END IF;
    scope_event := private.routed_paystack_event(event_key,meta);
    IF scope_event IS NULL THEN RETURN jsonb_build_object('legacy',true); END IF;
    IF EXISTS (SELECT 1 FROM private.event_paystack_routes WHERE event_id=scope_event AND paused) THEN
        RAISE EXCEPTION 'Online payments are paused for this tournament. Contact the organiser.';
    END IF;
    IF NOT coalesce(ref ~ '^[A-Za-z0-9.=-]{8,100}$',false)
        OR coalesce(meta->>'source','') NOT IN ('manual_event','division_switch') THEN
        RAISE EXCEPTION 'Start a new tournament checkout.';
    END IF;
    IF coalesce((p_payment->>'is_test')::boolean,false) AND NOT public.is_super_admin(actor_email) THEN
        RAISE EXCEPTION 'Test checkout is restricted to super admins.' USING ERRCODE='42501';
    END IF;
    IF lower(trim(meta->>'registrant_email')) IS DISTINCT FROM actor_email
        AND NOT coalesce(private.finance_event(event_key),false) THEN
        RAISE EXCEPTION 'Use your signed-in player profile to pay for this entry.' USING ERRCODE='42501';
    END IF;
    SELECT id INTO payer FROM public.players WHERE lower(trim(email))=lower(trim(meta->>'registrant_email')) ORDER BY id LIMIT 1;
    IF payer IS NULL THEN RAISE EXCEPTION 'A player profile is required.'; END IF;
    meta := (meta - ARRAY['split_recorded','license_split_done','registrations_persisted','native_authorization_url',
        'server_free_entries','server_license_items','registration_review_required','organisation_paystack','parent_reference','parent_payment_id'])
        || jsonb_build_object('email',lower(trim(meta->>'registrant_email')), 'reference',ref, 'event_id',event_key,
            'is_test',coalesce((p_payment->>'is_test')::boolean,false));
    PERFORM pg_advisory_xact_lock(hashtextextended(ref,0));
    SELECT * INTO existing FROM public.payments WHERE reference=ref;
    IF existing.id IS NULL THEN
        PERFORM set_config('fourm.preparing_web_paystack_split','on',true);
        INSERT INTO public.payments(player_id,event_id,amount,currency,status,payment_type,payment_method,reference,is_test,metadata)
        VALUES(payer,event_key,(p_payment->>'amount')::numeric,'ZAR','processing','event_entry_fee','paystack',ref,
            (meta->>'is_test')::boolean,meta) RETURNING * INTO p;
        PERFORM set_config('fourm.preparing_web_paystack_split','off',true);
    ELSE
        p := existing;
        IF p.player_id IS DISTINCT FROM payer OR p.event_id IS DISTINCT FROM event_key
            OR p.status NOT IN ('pending','processing') OR p.amount IS DISTINCT FROM (p_payment->>'amount')::numeric
            OR p.is_test IS DISTINCT FROM (meta->>'is_test')::boolean
            OR (p.metadata->'covers',p.metadata->'registration_rows',p.metadata->'solo_link_updates',p.metadata->'source',
                p.metadata->'registration_id',p.metadata->'target_division_id') IS DISTINCT FROM
               (meta->'covers',meta->'registration_rows',meta->'solo_link_updates',meta->'source',
                meta->'registration_id',meta->'target_division_id') THEN
            RAISE EXCEPTION 'This checkout has changed. Start a new checkout.';
        END IF;
    END IF;
    RETURN jsonb_build_object('paymentId',p.id);
END $$;

-- Resolve and pin the route from the saved payment, never from request metadata
-- or from the organisation's current account once the payment is initialized.
CREATE FUNCTION public.prepare_paystack_split(p_payment uuid, p_funding_confirmed boolean) RETURNS jsonb
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
            IF NOT EXISTS (
                SELECT 1 FROM private.event_paystack_routes r JOIN public.calendar c ON c.id=r.event_id
                WHERE r.event_id=child_event AND r.organisation_id=routing.organisation_id
                    AND c.organisation_id=routing.organisation_id AND NOT r.paused
            ) THEN RAISE EXCEPTION 'Pay for tournaments with different settlement settings separately.'; END IF;
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

CREATE FUNCTION public.paystack_split_checkout(p_reference text, p_checkout jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
    UPDATE private.payment_paystack_splits SET checkout=coalesce(checkout,p_checkout)
        WHERE reference=p_reference RETURNING checkout INTO result;
    RETURN result;
END $$;

CREATE FUNCTION public.verify_paystack_organisation_split(p_reference text, p_gateway jsonb) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s private.payment_paystack_splits;
    fee bigint;
    organiser bigint;
BEGIN
    SELECT * INTO s FROM private.payment_paystack_splits WHERE reference=p_reference FOR UPDATE;
    IF NOT FOUND THEN RETURN 'legacy'; END IF;
    fee := (p_gateway->'fees_split'->>'paystack')::bigint;
    organiser := (p_gateway->'fees_split'->>'subaccount')::bigint;
    IF p_gateway->>'status' IS DISTINCT FROM 'success' OR p_gateway->>'reference' IS DISTINCT FROM s.reference
        OR p_gateway->>'currency' IS DISTINCT FROM 'ZAR' OR p_gateway->>'domain' IS DISTINCT FROM s.domain
        OR (p_gateway->>'amount')::bigint IS DISTINCT FROM s.amount_cents
        OR p_gateway->'subaccount'->>'subaccount_code' IS DISTINCT FROM s.code
        OR (p_gateway->'fees_split'->>'integration')::bigint IS DISTINCT FROM s.retained_cents
        OR fee IS NULL OR fee<0 OR organiser IS DISTINCT FROM s.amount_cents-s.retained_cents-fee THEN
        UPDATE private.event_paystack_routes SET paused=true WHERE event_id=s.event_id AND NOT paused;
        INSERT INTO private.paystack_routing_audit(organisation_id,event_id,action,details)
        VALUES(s.organisation_id,s.event_id,'verification_mismatch',jsonb_build_object('reference',s.reference));
        RETURN 'review';
    END IF;
    UPDATE private.payment_paystack_splits SET fee_cents=fee, organiser_cents=organiser,
        verified_at=coalesce(verified_at,clock_timestamp()) WHERE reference=p_reference;
    RETURN 'verified';
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    UPDATE private.event_paystack_routes SET paused=true WHERE event_id=s.event_id AND NOT paused;
    INSERT INTO private.paystack_routing_audit(organisation_id,event_id,action,details)
    VALUES(s.organisation_id,s.event_id,'verification_mismatch',jsonb_build_object('reference',s.reference));
    RETURN 'review';
END $$;

CREATE FUNCTION public.paystack_split_refund_context(p_reference text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
    SELECT jsonb_build_object('domain',domain,'verified',verified_at IS NOT NULL,
        'entryCents',amount_cents-retained_cents,'organisationId',organisation_id)
    FROM private.payment_paystack_splits WHERE reference=p_reference
$$;

CREATE FUNCTION public.paystack_event_split_receipts(p_event_id bigint, p_references text[])
RETURNS TABLE(reference text, provider_id bigint, verified_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
    SELECT s.reference,s.provider_id,s.verified_at FROM private.payment_paystack_splits s
    JOIN public.payments p ON p.id=s.payment_id
    WHERE p.event_id=p_event_id AND s.domain='live' AND s.reference=ANY(p_references)
$$;

CREATE TABLE private.paystack_split_refund_claims (
    refund_id uuid PRIMARY KEY REFERENCES public.payment_refunds(id) ON DELETE RESTRICT,
    reference text NOT NULL REFERENCES private.payment_paystack_splits(reference) ON DELETE RESTRICT,
    amount_cents bigint NOT NULL CHECK (amount_cents>0),
    cover_type text NOT NULL CHECK (cover_type IN ('entry','license'))
);
CREATE INDEX ON private.paystack_split_refund_claims(reference);
ALTER TABLE private.paystack_split_refund_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.paystack_split_refund_claims FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.paystack_split_staff_permission(p_event_id bigint, p_email text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
    SELECT coalesce(public.is_super_admin(p_email),false) OR EXISTS (
        SELECT 1 FROM public.organisation_members m WHERE m.organisation_id=r.organisation_id
        AND lower(trim(m.user_email))=lower(trim(p_email)) AND m.role IN ('owner','admin')
    ) FROM private.event_paystack_routes r WHERE r.event_id=p_event_id
$$;

CREATE FUNCTION public.claim_paystack_split_refund(p_reference text, p_refund_id uuid,
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
    RETURN jsonb_build_object('reference','ORGREF-'||p_refund_id::text,'domain',s.domain,
        'fundedBy',CASE WHEN coalesce(existing.cover_type,item_type)='entry' THEN 'organiser' ELSE '4m' END);
END $$;

CREATE FUNCTION public.apply_paystack_split_refund(p_refund_id uuid, p_gateway jsonb, p_status text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c private.paystack_split_refund_claims;
    s private.payment_paystack_splits;
    transaction_ref text;
    reg_id uuid;
    refund_reason text;
BEGIN
    SELECT * INTO c FROM private.paystack_split_refund_claims WHERE refund_id=p_refund_id;
    IF c.refund_id IS NULL OR p_status NOT IN ('pending','processing','processed','failed','needs_attention') THEN RETURN false; END IF;
    SELECT * INTO s FROM private.payment_paystack_splits WHERE reference=c.reference;
    transaction_ref:=coalesce(p_gateway->'transaction'->>'reference',p_gateway->>'transaction_reference');
    IF (transaction_ref IS NOT NULL AND transaction_ref IS DISTINCT FROM s.reference)
        OR coalesce(p_gateway->>'refund_reference',p_gateway->>'reference') IS DISTINCT FROM 'ORGREF-'||p_refund_id::text
        OR p_gateway->>'domain' IS DISTINCT FROM s.domain OR p_gateway->>'currency' IS DISTINCT FROM 'ZAR'
        OR (p_gateway->>'amount')::bigint IS DISTINCT FROM c.amount_cents OR nullif(p_gateway->>'id','') IS NULL
        THEN RETURN false; END IF;
    UPDATE public.payment_refunds
    SET paystack_refund_id=p_gateway->>'id', status=p_status,
        processed_at=CASE WHEN p_status IN ('processed','failed') THEN coalesce(processed_at,clock_timestamp()) ELSE processed_at END,
        metadata=coalesce(metadata,'{}')||jsonb_build_object('refund_funded_by',CASE WHEN c.cover_type='entry' THEN 'organiser' ELSE '4m' END)
    WHERE id=c.refund_id AND (paystack_refund_id IS NULL OR paystack_refund_id=p_gateway->>'id')
        AND status IS DISTINCT FROM 'processed' AND (p_status<>'pending' OR status='pending')
    RETURNING event_registration_id,reason INTO reg_id,refund_reason;
    IF NOT FOUND THEN RETURN false; END IF;
    IF p_status='processed' AND c.cover_type='entry' AND refund_reason<>'division_switch' AND reg_id IS NOT NULL THEN
        -- A late callback cannot undo a paid re-entry or a successful division change.
        UPDATE public.event_registrations e SET payment_status='refunded',
            refunded_at=coalesce(e.refunded_at,clock_timestamp()),
            refund_amount=greatest(coalesce(e.refund_amount,0),(
                SELECT coalesce(sum(f.amount),0) FROM public.payment_refunds f
                WHERE f.event_registration_id=e.id AND f.status='processed'
                    AND f.reason<>'division_switch' AND f.metadata->>'cover_type'='entry'
            ))
        WHERE e.id=reg_id AND e.status='withdrawn';
    END IF;
    RETURN true;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN false;
END $$;

-- A routed receipt cannot contribute to a manual payout, including requests
-- made outside the event finance UI.
CREATE FUNCTION private.guard_manual_payout_for_split_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE collected numeric;
    refunded numeric;
    already_paid numeric;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM private.event_paystack_routes WHERE event_id=new.event_id) THEN RETURN new; END IF;
    SELECT coalesce(sum(p.amount),0) INTO collected FROM public.payments p
    WHERE p.event_id=new.event_id AND p.payment_type='event_entry_fee' AND p.status='success'
        AND NOT coalesce(p.is_test,false) AND p.payment_method<>'paystack'
        AND p.metadata->>'collection_recipient'='4m';
    SELECT coalesce(sum(f.amount),0) INTO refunded FROM public.payment_refunds f JOIN public.payments p ON p.id=f.payment_id
    WHERE p.event_id=new.event_id AND p.payment_method<>'paystack' AND p.metadata->>'collection_recipient'='4m'
        AND f.status IN ('processed','pending','processing','needs_attention','needs-attention');
    SELECT coalesce(sum((x->>'amount')::numeric),0) INTO already_paid FROM public.calendar e
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(e.organiser_interim_payments,'[]')) x WHERE e.id=new.event_id
        AND coalesce(x->>'status','paid') IN ('paid','success','processed','completed');
    IF new.amount>greatest(0,round((collected-refunded)*0.95,2)-already_paid) THEN
        RAISE EXCEPTION 'Only entry payments held by 4M are eligible for a manual payout.';
    END IF;
    RETURN new;
END $$;
CREATE TRIGGER guard_manual_payout_for_split_event BEFORE INSERT ON banking_private.payout_requests
FOR EACH ROW EXECUTE FUNCTION private.guard_manual_payout_for_split_event();

CREATE FUNCTION private.guard_paystack_organisation_split() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
    s private.payment_paystack_splits;
    r private.event_paystack_routes;
BEGIN
    IF tg_op='UPDATE' AND EXISTS (SELECT 1 FROM private.payment_paystack_splits WHERE payment_id=old.id)
        AND (new.id,new.event_id,new.reference,new.payment_method,new.payment_type,new.is_test) IS DISTINCT FROM
            (old.id,old.event_id,old.reference,old.payment_method,old.payment_type,old.is_test) THEN
        RAISE EXCEPTION 'The tournament payment destination is fixed.';
    END IF;
    IF new.payment_method IS DISTINCT FROM 'paystack' OR new.payment_type IS DISTINCT FROM 'event_entry_fee' THEN RETURN new; END IF;
    IF tg_op='INSERT' THEN PERFORM 1 FROM public.calendar WHERE id=new.event_id FOR SHARE; END IF;
    new.metadata:=coalesce(new.metadata,'{}')-'organisation_paystack';
    SELECT * INTO s FROM private.payment_paystack_splits WHERE reference=new.reference;
    IF s.reference IS NOT NULL THEN
        IF (new.id,new.event_id,coalesce(new.is_test,false)) IS DISTINCT FROM
            (s.payment_id,(SELECT p.event_id FROM public.payments p WHERE p.id=s.payment_id),s.domain='test') THEN
            RAISE EXCEPTION 'The tournament payment destination is fixed.';
        END IF;
        IF new.status IN ('success','refunded') AND s.verified_at IS NULL THEN
            RAISE EXCEPTION 'The Paystack subaccount split must be verified before marking this entry paid.';
        END IF;
        new.metadata:=new.metadata-ARRAY['parent_reference','parent_payment_id'];
        IF s.verified_at IS NOT NULL THEN
            new.metadata:=new.metadata||jsonb_build_object('organisation_paystack',jsonb_build_object(
                'organisation_id',s.organisation_id,'entry_cents',s.amount_cents-s.retained_cents,
                'processing_cents',s.fee_cents,'net_cents',s.organiser_cents));
        END IF;
        RETURN new;
    END IF;
    SELECT * INTO r FROM private.event_paystack_routes WHERE event_id=private.routed_paystack_event(new.event_id,new.metadata);
    IF r.event_id IS NULL OR (tg_op='UPDATE' AND old.created_at<r.starts_at) THEN RETURN new; END IF;
    IF tg_op='INSERT' AND NOT private.worker_write() AND current_setting('fourm.preparing_web_paystack_split',true) IS DISTINCT FROM 'on'
        AND new.status IN ('pending','processing','success') THEN
        RAISE EXCEPTION 'Refresh this page and use the tournament’s secure checkout.';
    END IF;
    IF new.status IN ('success','refunded') AND NOT EXISTS (
        SELECT 1 FROM private.event_checkout_security_quotes q
        WHERE q.payment_id=new.id AND q.license_amount>0 AND q.license_amount=q.original_amount
            AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(new.metadata->'covers','[]')) x WHERE x->>'type'='entry')
    ) THEN RAISE EXCEPTION 'A verified Paystack split is required for this tournament.'; END IF;
    RETURN new;
END $$;
CREATE TRIGGER guard_paystack_organisation_split BEFORE INSERT OR UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION private.guard_paystack_organisation_split();

REVOKE ALL ON FUNCTION private.routed_paystack_event(bigint,jsonb), private.guard_paystack_organisation_split(), private.guard_manual_payout_for_split_event()
    FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.can_manage_paystack_subaccounts(), public.prepare_web_paystack_split(jsonb)
    FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_paystack_subaccounts(), public.prepare_web_paystack_split(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.manage_paystack_subaccounts(text,uuid,jsonb,uuid), public.prepare_paystack_split(uuid,boolean),
    public.paystack_split_checkout(text,jsonb), public.verify_paystack_organisation_split(text,jsonb),
    public.paystack_split_refund_context(text), public.paystack_split_staff_permission(bigint,text),
    public.claim_paystack_split_refund(text,uuid,bigint,boolean),
    public.apply_paystack_split_refund(uuid,jsonb,text),
    public.paystack_event_split_receipts(bigint,text[]) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.manage_paystack_subaccounts(text,uuid,jsonb,uuid), public.prepare_paystack_split(uuid,boolean),
    public.paystack_split_checkout(text,jsonb), public.verify_paystack_organisation_split(text,jsonb),
    public.paystack_split_refund_context(text), public.paystack_split_staff_permission(bigint,text),
    public.claim_paystack_split_refund(text,uuid,bigint,boolean),
    public.apply_paystack_split_refund(uuid,jsonb,text),
    public.paystack_event_split_receipts(bigint,text[]) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
