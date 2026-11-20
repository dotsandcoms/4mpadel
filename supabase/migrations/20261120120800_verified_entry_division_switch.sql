BEGIN;

CREATE TABLE private.verified_entry_division_switches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_id uuid NOT NULL REFERENCES public.event_registrations(id) ON DELETE RESTRICT,
    event_id bigint NOT NULL,
    from_division_id uuid NOT NULL,
    from_division text NOT NULL,
    target_division_id uuid NOT NULL,
    target_division text NOT NULL,
    old_fee numeric NOT NULL,
    new_fee numeric NOT NULL,
    top_up_payment_id uuid UNIQUE REFERENCES public.payments(id) ON DELETE RESTRICT,
    gateway_reference text UNIQUE,
    gateway_domain text,
    gateway_transaction_id text,
    refund_id uuid UNIQUE REFERENCES public.payment_refunds(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (gateway_domain, gateway_transaction_id)
);
ALTER TABLE private.verified_entry_division_switches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.verified_entry_division_switches FROM PUBLIC, anon, authenticated, service_role;
CREATE INDEX verified_entry_division_switches_registration_idx
    ON private.verified_entry_division_switches(registration_id, created_at DESC, id);

CREATE FUNCTION private.verified_switch_source(p_entry public.event_registrations, p_payment_id uuid)
RETURNS TABLE (payment_id uuid, fee numeric, allowance numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT p.id, (p.metadata->'division_entry_fees'->>(cover.value->>'division'))::numeric,
        least(p.amount, greatest(0, q.required_amount - q.license_amount),
            greatest(0, q.original_amount - q.license_amount)) / counts.entries
    FROM private.verified_payment_entry_transfers t
    JOIN public.payments p ON p.id=t.payment_id AND p.event_id=t.event_id
    JOIN private.event_checkout_security_quotes q ON q.payment_id=p.id
        AND q.cart_hash=sha256(convert_to(private.checkout_cart(p)::text,'UTF8'))
    CROSS JOIN LATERAL (
        SELECT count(*) AS entries, count(DISTINCT value->>'division') AS divisions
        FROM jsonb_array_elements(p.metadata->'covers')
        WHERE value->>'type'='entry'
    ) counts
    CROSS JOIN LATERAL (
        SELECT value FROM jsonb_array_elements(p.metadata->'covers') WITH ORDINALITY AS c(value,ordinal)
        WHERE value->>'type'='entry' ORDER BY ordinal OFFSET t.cover_position-1 LIMIT 1
    ) cover
    WHERE t.registration_id=p_entry.id AND t.event_id=p_entry.event_id
        AND t.division_id IS NOT DISTINCT FROM p_entry.division_id AND t.division=p_entry.division
        AND t.email=lower(btrim(p_entry.email)) AND (p_payment_id IS NULL OR p.id=p_payment_id)
        AND p.status='success' AND p.payment_method='paystack' AND p.payment_type='event_entry_fee'
        AND p.currency='ZAR' AND p.metadata->>'source'='manual_event' AND p.amount>0
        AND coalesce(p.is_test,false)=coalesce(p_entry.is_test,false)
        AND counts.entries>0 AND counts.divisions=1
        AND p.metadata->'division_entry_fees'->>(cover.value->>'division') ~ '^[0-9]+(\.[0-9]{1,2})?$';
$$;

CREATE FUNCTION private.verified_entry_switch_quote(
    p_entry public.event_registrations, p_target_division_id uuid, p_top_up_reference text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    previous private.verified_entry_division_switches;
    event public.calendar;
    source public.tournament_divisions;
    target public.tournament_divisions;
    base record;
    count_base integer;
    current_fee numeric;
    target_fee numeric;
    already_refunded numeric;
    prior_adjustments numeric;
    target_roster jsonb;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM private.verified_payment_entry_transfers WHERE registration_id=p_entry.id) THEN
        RETURN NULL;
    END IF;

    SELECT * INTO previous FROM private.verified_entry_division_switches s
       WHERE s.registration_id=p_entry.id AND s.event_id=p_entry.event_id AND s.target_division_id=p_target_division_id
         AND ((p_top_up_reference IS NOT NULL AND s.gateway_reference=p_top_up_reference)
           OR (p_top_up_reference IS NULL AND p_entry.division_id=p_target_division_id))
       ORDER BY s.created_at DESC, s.id LIMIT 1;
    IF previous.id IS NOT NULL THEN
        RETURN jsonb_build_object('completed',true,'replayed',true,'from_division_id',previous.from_division_id,
            'from_division',previous.from_division,'division_id',previous.target_division_id,'division',previous.target_division,
            'old_fee',previous.old_fee,'new_fee',previous.new_fee,'delta',previous.new_fee-previous.old_fee,
            'charged_rands',greatest(0,previous.new_fee-previous.old_fee),'refund_id',previous.refund_id);
    END IF;

    IF NOT coalesce((SELECT verified_paid_replacements_enabled AND integrity_enabled
        FROM private.security_release_state WHERE id),false) THEN
        RAISE EXCEPTION 'Verified entry changes are unavailable until the billing update is enabled.' USING ERRCODE='42501';
    END IF;
    SELECT * INTO event FROM public.calendar WHERE id=p_entry.event_id;
    SELECT * INTO source FROM public.tournament_divisions d WHERE d.event_id=event.id
        AND (d.id=p_entry.division_id OR (p_entry.division_id IS NULL AND d.name=p_entry.division));
    SELECT * INTO target FROM public.tournament_divisions d WHERE d.id=p_target_division_id AND d.event_id=event.id;
    IF event.id IS NULL OR to_jsonb(event)->>'is_manual' IS DISTINCT FROM 'true'
        OR event.event_status='cancelled' OR p_entry.status IS DISTINCT FROM 'registered'
        OR p_entry.payment_status IS DISTINCT FROM 'paid' OR source.id IS NULL OR target.id IS NULL OR source.id=target.id
        OR to_jsonb(target)->>'is_active'='false' OR to_jsonb(target)->>'cancelled_at' IS NOT NULL THEN
        RAISE EXCEPTION 'Choose an available division for this paid entry.';
    END IF;
    IF least(event.registration_closes_at,source.entries_close_at,target.entries_close_at) <= now()
        OR (to_jsonb(event)->>'registration_opens_at')::timestamptz > now()
        OR coalesce((to_jsonb(event)->>'end_date')::date,(to_jsonb(event)->>'start_date')::date)
           < (now() AT TIME ZONE 'Africa/Johannesburg')::date THEN
        RAISE EXCEPTION 'Registration for this division change has closed.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.event_registrations r WHERE r.event_id=event.id
        AND (r.division_id=target.id OR (r.division_id IS NULL AND r.division=target.name))
        AND r.status IS DISTINCT FROM 'withdrawn'
        AND (lower(btrim(r.email))=lower(btrim(p_entry.email)) OR lower(btrim(r.partner_email))=lower(btrim(p_entry.email)))) THEN
        RAISE EXCEPTION 'You already have an entry or a reserved partner spot in that division.';
    END IF;
    IF target.entry_limit>0 AND NOT (coalesce(event.is_weekly,false) OR coalesce(event.is_quick_event,false)) THEN
        SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) INTO target_roster
          FROM public.event_registrations r WHERE r.event_id=event.id
            AND (r.division_id=target.id OR (r.division_id IS NULL AND r.division=target.name));
        IF private.count_registration_places(target_roster)>=target.entry_limit THEN
            RAISE EXCEPTION 'The target division is full.';
        END IF;
    END IF;

    SELECT count(*) INTO count_base FROM private.verified_switch_source(p_entry,NULL);
    SELECT * INTO base FROM private.verified_switch_source(p_entry,NULL) LIMIT 1;
    IF count_base<>1 OR base.fee>base.allowance THEN
        RAISE EXCEPTION 'The original entry credit needs reconciliation. Contact the organiser before changing divisions.';
    END IF;
    SELECT coalesce(sum(r.amount),0) INTO already_refunded FROM public.payment_refunds r
       WHERE r.event_registration_id=p_entry.id AND r.reason='division_switch'
         AND (r.status IS DISTINCT FROM 'failed'
           OR EXISTS (SELECT 1 FROM private.verified_entry_division_switches s WHERE s.refund_id=r.id));
    SELECT coalesce(sum(s.new_fee-s.old_fee),0) INTO prior_adjustments
       FROM private.verified_entry_division_switches s JOIN public.payments p ON p.id=s.top_up_payment_id
       WHERE s.registration_id=p_entry.id AND s.event_id=p_entry.event_id AND p.status='success' AND p.amount=s.new_fee-s.old_fee;
    IF EXISTS (SELECT 1 FROM public.payment_refunds r WHERE r.event_registration_id=p_entry.id
        AND r.reason IS DISTINCT FROM 'division_switch' AND r.status IS DISTINCT FROM 'failed'
        AND coalesce(r.metadata->>'cover_type','entry')='entry') THEN
        RAISE EXCEPTION 'This entry has another refund. Contact the organiser before changing divisions.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.payments p WHERE p.event_id=p_entry.event_id
        AND p.metadata->>'source'='native_entry_balance' AND p.metadata->>'registration_id'=p_entry.id::text
        AND p.status IN ('processing','success') AND coalesce(p.is_test,false)=coalesce(p_entry.is_test,false)) THEN
        RAISE EXCEPTION 'This entry has a separate balance payment. Contact the organiser before changing divisions.';
    END IF;
    current_fee := round(base.fee + prior_adjustments - already_refunded,2);
    target_fee := round(private.current_entry_fee(event.id,target.id,target.name),2);
    IF target_fee IS NULL OR target_fee<0 OR current_fee<0 THEN
        RAISE EXCEPTION 'Entry pricing is unavailable. Contact the organiser.';
    END IF;
    RETURN jsonb_build_object('from_division_id',source.id,'from_division',source.name,'division_id',target.id,
        'division',target.name,'old_fee',current_fee,'new_fee',target_fee,'delta',target_fee-current_fee);
END;
$$;

CREATE FUNCTION public.review_verified_entry_switch(
    p_event_id bigint, p_registration_id uuid, p_target_division_id uuid, p_actor_email text,
    p_event_manager boolean, p_top_up_reference text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    entry public.event_registrations;
BEGIN
    SELECT * INTO entry FROM public.event_registrations WHERE id=p_registration_id AND event_id=p_event_id;
    IF entry.id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM private.verified_payment_entry_transfers WHERE registration_id=entry.id) THEN
        RETURN NULL;
    END IF;
    IF entry.id IS NULL OR nullif(btrim(p_actor_email),'') IS NULL OR (p_event_manager IS NOT TRUE AND
        lower(btrim(p_actor_email)) IS DISTINCT FROM lower(btrim(entry.email))) THEN
        RAISE EXCEPTION 'You cannot change this entry.' USING ERRCODE='42501';
    END IF;
    RETURN private.verified_entry_switch_quote(entry,p_target_division_id,p_top_up_reference);
END;
$$;

CREATE FUNCTION public.commit_verified_entry_switch(
    p_event_id bigint, p_registration_id uuid, p_target_division_id uuid, p_actor_email text,
    p_event_manager boolean, p_top_up_reference text, p_expected_delta numeric, p_gateway jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    entry public.event_registrations;
    charge public.payments;
    original public.payments;
    quote jsonb;
    reviewed_delta numeric;
    original_fee numeric;
    reserved numeric;
    refund uuid;
    refund_reference text;
    gateway_domain_name text;
    from_id uuid;
BEGIN
    PERFORM 1 FROM public.calendar WHERE id=p_event_id FOR UPDATE;
    PERFORM 1 FROM public.event_registrations WHERE event_id=p_event_id ORDER BY id FOR UPDATE;
    PERFORM 1 FROM public.payments WHERE event_id=p_event_id ORDER BY id FOR UPDATE;
    PERFORM 1 FROM public.tournament_divisions WHERE event_id=p_event_id ORDER BY id FOR SHARE;
    quote:=public.review_verified_entry_switch(p_event_id,p_registration_id,p_target_division_id,
        p_actor_email,p_event_manager,p_top_up_reference);
    IF quote IS NULL THEN RAISE EXCEPTION 'This entry has no verified transfer.'; END IF;
    IF quote->>'completed'='true' THEN RETURN quote; END IF;
    reviewed_delta:=(quote->>'delta')::numeric;
    from_id:=(quote->>'from_division_id')::uuid;
    IF reviewed_delta IS DISTINCT FROM p_expected_delta THEN
        RAISE EXCEPTION 'The reviewed entry price changed. Refresh and review the amount.' USING ERRCODE='40001';
    END IF;
    SELECT * INTO entry FROM public.event_registrations WHERE id=p_registration_id AND event_id=p_event_id;
    IF reviewed_delta>0 THEN
        SELECT p.* INTO charge FROM public.payments p JOIN private.event_checkout_security_quotes q ON q.payment_id=p.id
         WHERE p.event_id=p_event_id AND p.reference=p_top_up_reference AND p.amount=reviewed_delta AND p.currency='ZAR'
           AND p.payment_type='event_entry_fee' AND p.payment_method='paystack' AND p.status IN ('pending','processing','success')
           AND coalesce(p.is_test,false)=coalesce(entry.is_test,false)
           AND p.metadata->>'source'='division_switch' AND p.metadata->>'registration_id'=p_registration_id::text
           AND p.metadata->>'target_division_id'=p_target_division_id::text
           AND (p.metadata->>'from_division_id'=from_id::text OR
               (p.metadata->>'from_division_id' IS NULL AND p.metadata->>'from_division'=quote->>'from_division'))
           AND lower(btrim(private.current_checkout_email(p.metadata->>'registrant_email',p.created_at)))=lower(btrim(entry.email))
           AND q.cart_hash=sha256(convert_to(private.checkout_cart(p)::text,'UTF8'));
        gateway_domain_name:=CASE WHEN charge.is_test IS TRUE THEN 'test' ELSE 'live' END;
        IF charge.id IS NULL OR p_gateway->>'reference' IS DISTINCT FROM charge.reference
            OR p_gateway->>'currency' IS DISTINCT FROM 'ZAR' OR p_gateway->>'domain' IS DISTINCT FROM gateway_domain_name
            OR p_gateway->>'amount' IS DISTINCT FROM (reviewed_delta*100)::bigint::text
            OR (p_gateway->>'id' ~ '^[1-9][0-9]*$') IS NOT TRUE
            OR lower(btrim(private.current_checkout_email(p_gateway->>'customer_email',charge.created_at)))
                IS DISTINCT FROM lower(btrim(entry.email))
            OR EXISTS(SELECT 1 FROM private.verified_entry_division_switches s
                WHERE s.top_up_payment_id=charge.id OR (s.gateway_domain=gateway_domain_name AND s.gateway_transaction_id=p_gateway->>'id')) THEN
            RAISE EXCEPTION 'The exact Paystack top-up is required for this entry and division.';
        END IF;
    ELSIF p_top_up_reference IS NOT NULL OR p_gateway IS NOT NULL THEN
        RAISE EXCEPTION 'This division change has no top-up to apply.';
    ELSIF reviewed_delta<0 THEN
        SELECT p.* INTO original FROM private.verified_switch_source(entry,NULL) b JOIN public.payments p ON p.id=b.payment_id;
        SELECT b.fee INTO original_fee FROM private.verified_switch_source(entry,original.id) b;
        refund_reference:=coalesce(nullif(btrim(original.metadata->>'parent_reference'),''),original.reference);
        gateway_domain_name:=CASE WHEN original.is_test IS TRUE THEN 'test' ELSE 'live' END;
        IF nullif(refund_reference,'') IS NULL THEN RAISE EXCEPTION 'The original payment needs reconciliation.'; END IF;
        PERFORM pg_advisory_xact_lock(hashtextextended('4m-refund:'||gateway_domain_name||':'||refund_reference,0));
        SELECT coalesce(sum(r.amount),0) INTO reserved FROM public.payment_refunds r
         WHERE r.payment_id=original.id AND r.event_registration_id=entry.id
           AND coalesce(r.metadata->>'cover_type','entry')='entry' AND (r.status IS DISTINCT FROM 'failed'
             OR EXISTS(SELECT 1 FROM private.verified_entry_division_switches s WHERE s.refund_id=r.id));
        IF original_fee IS NULL OR reserved-reviewed_delta>original_fee THEN
            RAISE EXCEPTION 'The price difference exceeds the available original entry credit. Contact the organiser.';
        END IF;
        SELECT coalesce(sum(r.amount),0) INTO reserved FROM public.payment_refunds r WHERE r.payment_id=original.id
            AND (r.status IS DISTINCT FROM 'failed' OR EXISTS(SELECT 1 FROM private.verified_entry_division_switches s WHERE s.refund_id=r.id));
        IF reserved-reviewed_delta>original.amount THEN
            RAISE EXCEPTION 'The price difference exceeds the available original payment. Contact the organiser.';
        END IF;
    END IF;

    PERFORM private.move_registration_division(ARRAY[entry.id],p_target_division_id,false);
    IF reviewed_delta<0 THEN
        INSERT INTO public.payment_refunds(payment_id,event_registration_id,paystack_reference,amount,currency,status,reason,initiated_by,metadata)
        VALUES(original.id,entry.id,refund_reference,-reviewed_delta,'ZAR','failed','division_switch',lower(btrim(p_actor_email)),
            jsonb_build_object('cover_type','entry','kind','division_switch_delta','method','paystack',
                'verify_failed',true,'verified_switch_reservation',true))
        RETURNING id INTO refund;
    END IF;
    INSERT INTO private.verified_entry_division_switches(registration_id,event_id,from_division_id,from_division,
        target_division_id,target_division,old_fee,new_fee,top_up_payment_id,gateway_reference,gateway_domain,gateway_transaction_id,refund_id)
    VALUES(entry.id,p_event_id,from_id,quote->>'from_division',p_target_division_id,quote->>'division',
        (quote->>'old_fee')::numeric,(quote->>'new_fee')::numeric,charge.id,charge.reference,
        CASE WHEN charge.id IS NOT NULL THEN gateway_domain_name END,p_gateway->>'id',refund);
    IF charge.id IS NOT NULL THEN UPDATE public.payments SET status='success' WHERE id=charge.id; END IF;
    IF refund IS NOT NULL THEN UPDATE public.payments SET metadata=metadata WHERE id=original.id; END IF;
    RETURN quote||jsonb_build_object('completed',true,'replayed',false,'charged_rands',greatest(0,reviewed_delta),'refund_id',refund);
END;
$$;

CREATE FUNCTION private.project_verified_division_switch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    allocation jsonb;
    rebates jsonb;
BEGIN
    IF jsonb_typeof(new.metadata)='object' THEN
        new.metadata:=new.metadata-ARRAY['verified_division_switch','verified_entry_switch_refunds'];
    END IF;
    IF tg_op='UPDATE' AND new.status IN ('success','refunded') AND new.metadata->>'source'='division_switch' THEN
        SELECT jsonb_build_object('registration_id',r.id,'event_id',r.event_id,'division_id',r.division_id,
            'division',r.division,'from_division_id',s.from_division_id,'amount',s.new_fee-s.old_fee)
          INTO allocation FROM private.verified_entry_division_switches s
          JOIN public.event_registrations r ON r.id=s.registration_id AND r.event_id=s.event_id
          JOIN private.event_checkout_security_quotes q ON q.payment_id=s.top_up_payment_id
         WHERE s.top_up_payment_id=new.id AND s.event_id=new.event_id AND s.gateway_reference=new.reference
            AND s.new_fee-s.old_fee=new.amount AND q.cart_hash=sha256(convert_to(private.checkout_cart(new)::text,'UTF8'));
        IF allocation IS NOT NULL THEN new.metadata:=new.metadata||jsonb_build_object('verified_division_switch',allocation); END IF;
    END IF;
    IF tg_op='UPDATE' AND new.status IN ('success','refunded') AND new.metadata->>'source'='manual_event' THEN
        SELECT jsonb_agg(jsonb_build_object('registration_id',rebate.registration_id,'event_id',new.event_id,
            'division_id',rebate.division_id,'amount',rebate.amount)) INTO rebates
        FROM (
            SELECT r.id AS registration_id,r.division_id,sum(f.amount) AS amount
            FROM private.verified_entry_division_switches s
            JOIN public.payment_refunds f ON f.id=s.refund_id AND f.payment_id=new.id
            JOIN public.event_registrations r ON r.id=s.registration_id AND r.event_id=s.event_id
            JOIN private.verified_payment_entry_transfers t ON t.payment_id=new.id AND t.registration_id=r.id
            JOIN private.event_checkout_security_quotes q ON q.payment_id=new.id
            WHERE s.event_id=new.event_id AND q.cart_hash=sha256(convert_to(private.checkout_cart(new)::text,'UTF8'))
                AND t.email=lower(btrim(r.email)) AND t.division_id=r.division_id
            GROUP BY r.id,r.division_id
        ) rebate;
        IF rebates IS NOT NULL THEN new.metadata:=new.metadata||jsonb_build_object('verified_entry_switch_refunds',rebates); END IF;
    END IF;
    RETURN new;
END;
$$;
CREATE TRIGGER verified_division_switch_projection BEFORE INSERT OR UPDATE ON public.payments
    FOR EACH ROW EXECUTE FUNCTION private.project_verified_division_switch();
UPDATE public.payments SET metadata=metadata-ARRAY['verified_division_switch','verified_entry_switch_refunds']
    WHERE metadata ?| ARRAY['verified_division_switch','verified_entry_switch_refunds'];

CREATE FUNCTION private.refresh_verified_division_switch_allocations()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    UPDATE public.payments p SET metadata=p.metadata FROM private.verified_entry_division_switches s
        WHERE s.registration_id=new.id AND s.top_up_payment_id=p.id;
    RETURN NULL;
END;
$$;
CREATE TRIGGER verified_division_switch_registration_update AFTER UPDATE ON public.event_registrations
    FOR EACH ROW WHEN (old.division_id IS DISTINCT FROM new.division_id OR old.division IS DISTINCT FROM new.division)
    EXECUTE FUNCTION private.refresh_verified_division_switch_allocations();

ALTER FUNCTION private.validate_event_checkout(public.payments) RENAME TO validate_event_checkout_before_verified_switch;
CREATE FUNCTION private.validate_event_checkout(p public.payments)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    entry public.event_registrations;
    quote jsonb;
    amount numeric;
BEGIN
    IF p.metadata->>'source'='division_switch' THEN
        SELECT * INTO entry FROM public.event_registrations
           WHERE id=(p.metadata->>'registration_id')::uuid AND event_id=p.event_id;
        IF entry.id IS NOT NULL AND EXISTS (SELECT 1 FROM private.verified_payment_entry_transfers WHERE registration_id=entry.id) THEN
            IF p.currency IS DISTINCT FROM 'ZAR' OR coalesce(p.is_test,false)<>coalesce(entry.is_test,false)
                OR lower(btrim(p.metadata->>'registrant_email')) IS DISTINCT FROM lower(btrim(entry.email))
                OR p.metadata ?| ARRAY['covers','registration_rows','solo_link_updates'] THEN
                RAISE EXCEPTION 'Choose an exact top-up for your own verified entry.' USING ERRCODE='42501';
            END IF;
            quote:=private.verified_entry_switch_quote(entry,(p.metadata->>'target_division_id')::uuid,NULL);
            amount:=(quote->>'delta')::numeric;
            IF quote->>'completed'='true' OR amount IS NULL OR amount<=0 OR p.amount IS DISTINCT FROM amount
               OR (p.metadata->>'from_division_id' IS DISTINCT FROM quote->>'from_division_id'
                 AND (p.metadata->>'from_division_id' IS NOT NULL OR p.metadata->>'from_division' IS DISTINCT FROM quote->>'from_division')) THEN
                RAISE EXCEPTION 'The top-up no longer matches the reviewed division change.';
            END IF;
            RETURN jsonb_build_object('required',amount,'free_entries','[]'::jsonb,'license_amount',0,'license_items','[]'::jsonb);
        END IF;
    END IF;
    RETURN private.validate_event_checkout_before_verified_switch(p);
END;
$$;

REVOKE ALL ON FUNCTION private.verified_switch_source(public.event_registrations,uuid),
    private.verified_entry_switch_quote(public.event_registrations,uuid,text), private.project_verified_division_switch(),
    private.refresh_verified_division_switch_allocations(), private.validate_event_checkout(public.payments),
    private.validate_event_checkout_before_verified_switch(public.payments),
    public.review_verified_entry_switch(bigint,uuid,uuid,text,boolean,text),
    public.commit_verified_entry_switch(bigint,uuid,uuid,text,boolean,text,numeric,jsonb)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_verified_entry_switch(bigint,uuid,uuid,text,boolean,text),
    public.commit_verified_entry_switch(bigint,uuid,uuid,text,boolean,text,numeric,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
