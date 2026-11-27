BEGIN;

-- Keep the list join alias distinct from the PL/pgSQL account variable.
CREATE OR REPLACE FUNCTION public.manage_paystack_subaccounts(p_action text, p_org uuid DEFAULT NULL,
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
            'account',to_jsonb(account_row)-'updated_by') ORDER BY o.name,o.id),'[]')
            FROM public.organisations o
            LEFT JOIN private.organisation_paystack_accounts account_row ON account_row.organisation_id=o.id);
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

COMMIT;
