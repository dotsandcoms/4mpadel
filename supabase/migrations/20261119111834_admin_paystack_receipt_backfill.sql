-- Reconcile only live receipts already verified by the server. The provider ID
-- and the gateway reference refer to the same charge, including legacy splits.
create table private.admin_paystack_backfill_audit (
    provider_id text primary key,
    gateway_reference text not null unique,
    payment_id uuid not null,
    actor_id uuid not null,
    action text not null check (action in ('entry', 'licence', 'unallocated')),
    event_id bigint,
    amount_minor bigint not null check (amount_minor > 0),
    reason text not null,
    recorded_at timestamptz not null default clock_timestamp()
);
alter table private.admin_paystack_backfill_audit enable row level security;
revoke all on private.admin_paystack_backfill_audit from public, anon, authenticated, service_role;

create function private.admin_paystack_event_plan(p_charge jsonb, p_player bigint, p_lock boolean)
returns jsonb language plpgsql set search_path = '' as $$
declare
    v_event bigint := (p_charge->>'event_id')::bigint;
    v_payer text := p_charge->>'payer_email';
    v_paid_at timestamptz := (p_charge->>'paid_at')::timestamptz;
    v_cover jsonb;
    v_email text;
    v_registration public.event_registrations;
    v_division public.tournament_divisions;
    v_payment public.payments;
    v_covers jsonb := '[]';
    v_entry_ids uuid[] := '{}';
    v_covered_emails text[] := '{}';
    v_cover_keys text[] := '{}';
    v_key text;
    v_quote jsonb;
    v_entry_minor bigint;
    v_event_percent numeric;
    v_base numeric;
    v_line_items jsonb := '[]';
    v_entry_total numeric := 0;
begin
    if p_player is null or v_event is null or coalesce(jsonb_typeof(p_charge->'covers'),'') <> 'array'
        or jsonb_array_length(p_charge->'covers') not between 1 and 24 then return null; end if;
    if p_lock then
        perform 1 from public.calendar c where c.id = v_event for update;
    end if;
    select least(100,greatest(0,coalesce(c.event_fee_percent,0))) into v_event_percent
    from public.commerce_config c where c.id = 'default';
    if v_event_percent is null then return null; end if;
    if not exists (select 1 from public.calendar c where c.id = v_event and c.is_manual is true
        and c.event_status is distinct from 'cancelled'
        and coalesce(c.payment_method, 'platform') = 'platform' and c.allow_payments is distinct from false)
    then return null; end if;

    for v_cover in select c.value from jsonb_array_elements(p_charge->'covers') c
        where c.value->>'type' = 'entry' order by c.value->>'email', c.value->>'division'
    loop
        if (v_cover->>'event_id')::bigint is distinct from v_event then return null; end if;
        v_email := v_cover->>'email';
        select d.* into v_division from public.tournament_divisions d
        where d.event_id = v_event and d.is_active is distinct from false and d.name = v_cover->>'division'
            and (v_cover->>'division_id' is null or d.id::text = v_cover->>'division_id');
        if not found or (
            select count(*) from public.tournament_divisions d where d.event_id = v_event
                and d.name = v_cover->>'division' and (v_cover->>'division_id' is null or d.id::text = v_cover->>'division_id')
        ) <> 1 then return null; end if;

        -- Only a unique existing entry available when this payment was made can
        -- receive the money. The current roster, capacity and partners stay intact.
        if (select count(*) from public.event_registrations r where r.event_id = v_event
            and lower(trim(r.email)) = v_email
            and (r.division_id = v_division.id or (r.division_id is null and r.division = v_division.name))
            and r.status = 'registered') <> 1 then return null; end if;
        select r.* into v_registration from public.event_registrations r where r.event_id = v_event
            and lower(trim(r.email)) = v_email
            and (r.division_id = v_division.id or (r.division_id is null and r.division = v_division.name))
            and r.status = 'registered' for update;
        if not found or v_registration.payment_status not in ('unpaid', 'pending', 'failed')
            or v_registration.payment_status is null or coalesce(v_registration.is_test,false)
            or v_registration.created_at is null or v_registration.created_at > v_paid_at
            or coalesce(v_registration.refund_amount,0) <> 0 or v_registration.refunded_at is not null
            or (v_cover->>'registration_id' is not null and v_registration.id::text <> v_cover->>'registration_id')
            or v_registration.id = any(v_entry_ids)
            or exists (select 1 from public.payment_refunds f where f.event_registration_id = v_registration.id
                and f.status is distinct from 'failed')
            or exists (select 1 from public.payments p where p.event_id = v_event and p.status = 'success'
                and p.payment_type = 'event_entry_fee' and not coalesce(p.is_test,false)
                and (p.metadata->>'registration_id' = v_registration.id::text or exists (
                    select 1 from jsonb_array_elements(case when jsonb_typeof(p.metadata->'covers')='array' then p.metadata->'covers' else '[]' end) c
                    where c->>'type' = 'entry' and lower(trim(c->>'email')) = v_email and c->>'division' = v_division.name
                )))
        then return null; end if;

        if v_email is distinct from v_payer and (
            lower(trim(v_registration.partner_email)) is distinct from v_payer or not exists (
                select 1 from public.event_registrations r where r.event_id = v_event
                and lower(trim(r.email)) = v_payer and lower(trim(r.partner_email)) = v_email
                and r.status = 'registered' and r.created_at <= v_paid_at and not coalesce(r.is_test,false)
                and (r.division_id = v_division.id or (r.division_id is null and r.division = v_division.name))
            )
        ) then return null; end if;

        v_base := private.current_entry_fee(v_event,v_division.id,v_division.name);
        if v_base is null or v_base <= 0 then return null; end if;
        v_base := round(v_base,2) + round(v_base*v_event_percent/100,2);
        v_entry_total := v_entry_total + v_base;
        v_line_items := v_line_items || jsonb_build_array(jsonb_build_object('label',coalesce(v_registration.full_name,'Player')||' — '||v_division.name,'amount',v_base));
        v_entry_ids := array_append(v_entry_ids, v_registration.id);
        v_covered_emails := array_append(v_covered_emails, v_email);
        v_covers := v_covers || jsonb_build_array(jsonb_build_object('type','entry','email',v_email,
            'event_id',v_event,'division',v_division.name,'division_id',v_division.id,'registration_id',v_registration.id));
    end loop;
    if cardinality(v_entry_ids) = 0 then return null; end if;

    for v_cover in select c.value from jsonb_array_elements(p_charge->'covers') c
        where c.value->>'type' = 'license' order by c.value->>'email'
    loop
        v_email := v_cover->>'email';
        v_key := v_email;
        if (v_cover->>'event_id')::bigint is distinct from v_event or not (v_email = any(v_covered_emails))
            or v_key = any(v_cover_keys)
            or (select count(*) from public.players p where lower(trim(p.email)) = v_email) <> 1
        then return null; end if;
        v_cover_keys := array_append(v_cover_keys, v_key);
        v_covers := v_covers || jsonb_build_array(v_cover || jsonb_build_object('event_id',v_event));
    end loop;
    if jsonb_array_length(v_covers) <> jsonb_array_length(p_charge->'covers') then return null; end if;

    -- Reuse checkout pricing, eligibility and payer/partner rules. A receipt
    -- that cannot be bound to those obligations remains unallocated.
    v_payment.event_id := v_event;
    v_payment.player_id := p_player;
    v_payment.amount := (p_charge->>'amount_minor')::numeric / 100;
    v_payment.currency := 'ZAR';
    v_payment.is_test := false;
    v_payment.metadata := jsonb_build_object('source','manual_event','registrant_email',v_payer,'covers',v_covers);
    begin
        v_quote := private.validate_event_checkout(v_payment);
    exception when invalid_parameter_value or insufficient_privilege or raise_exception then
        return null;
    end;
    if (v_quote->>'required')::numeric is distinct from v_payment.amount then return null; end if;
    v_entry_minor := (p_charge->>'amount_minor')::bigint - ((v_quote->>'license_amount')::numeric * 100)::bigint;
    if v_entry_minor < 1 or v_entry_total * 100 <> v_entry_minor then return null; end if;
    return jsonb_build_object('kind','entry','event_id',v_event,'player_id',p_player,
        'entry_amount_minor',v_entry_minor,'registration_ids',to_jsonb(v_entry_ids),
        'covers',v_covers,'line_items',v_line_items,'licence_items',v_quote->'license_items');
end;
$$;
revoke all on function private.admin_paystack_event_plan(jsonb,bigint,boolean) from public, anon, authenticated, service_role;

create function public.admin_paystack_receipt_backfill(p_actor uuid, p_charge jsonb, p_review jsonb default null, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_provider_id text := p_charge->>'provider_id';
    v_ref text := p_charge->>'gateway_reference';
    v_minor bigint := (p_charge->>'amount_minor')::bigint;
    v_paid_at timestamptz := (p_charge->>'paid_at')::timestamptz;
    v_email text := p_charge->>'payer_email';
    v_plan jsonb;
    v_profile bigint;
    v_purchase public.native_license_checkouts;
    v_event bigint;
    v_receipt uuid;
    v_saved private.admin_paystack_backfill_audit;
    v_licence jsonb;
    v_licence_index integer := 0;
    v_licence_player bigint;
    v_licence_payment_id uuid;
    v_licence_type text;
    v_gateway_metadata jsonb;
    v_payment_type text;
    v_reg_ids uuid[];
    v_count integer;
begin
    if coalesce(auth.jwt()->>'role','') <> 'service_role' or not exists (
        select 1 from auth.users u where u.id = p_actor and u.deleted_at is null and not coalesce(u.is_anonymous,false)
            and (u.banned_until is null or u.banned_until < clock_timestamp()) and public.is_super_admin(u.email)
    ) then raise exception 'Verified platform Finance access is required.' using errcode = '42501'; end if;
    if v_provider_id is null or v_provider_id !~ '^[0-9]{1,22}$'
        or v_ref is null or v_ref !~ '^[A-Za-z0-9._=-]{1,100}$'
        or v_minor is null or v_minor not between 1 and 9999999999 or v_paid_at is null
        or v_paid_at > clock_timestamp() + interval '5 minutes'
        or nullif(v_email,'') is null or length(v_email) > 254
    then raise exception 'The verified gateway receipt is invalid.' using errcode = '22023'; end if;

    if p_review is not null then
        if nullif(trim(p_reason),'') is null or length(trim(p_reason)) > 500
        then raise exception 'Enter a reason of at most 500 characters.' using errcode = '22023'; end if;
        perform pg_advisory_xact_lock(hashtextextended('admin-paystack-backfill:' || v_provider_id,0));
    end if;
    select * into v_saved from private.admin_paystack_backfill_audit a where a.provider_id = v_provider_id or a.gateway_reference = v_ref;
    if found then
        if v_saved.provider_id <> v_provider_id or v_saved.gateway_reference <> v_ref or v_saved.amount_minor <> v_minor
            or not exists (select 1 from public.payments p where p.id = v_saved.payment_id and p.status = 'success')
        then return jsonb_build_object('state','held','message','A previous reconciliation needs ledger review.'); end if;
        return jsonb_build_object('state','already_recorded','kind',v_saved.action,'payment_id',v_saved.payment_id);
    end if;

    -- The provider's current and legacy references and split aliases all
    -- block a second import. Do not overwrite old rows, including pending ones.
    if exists (select 1 from public.payments p where
        p.reference in (v_ref,v_provider_id,'LIC-'||v_ref,'LIC-'||v_provider_id)
        or p.metadata->>'paystack_ref' in (v_ref,v_provider_id)
        or p.metadata->>'client_reference' = v_ref
        or p.metadata->>'parent_reference' = v_ref
        or p.metadata->'original_trx'->>'id' in (v_ref,v_provider_id)
        or starts_with(p.reference,'LIC-'||v_ref||'-')
        or starts_with(p.reference,'REG-'||v_ref||'-')
        or starts_with(p.reference,'REG-PARTNER-'||v_ref||'-')
        or starts_with(p.reference,v_ref||'-'))
    then return jsonb_build_object('state','already_recorded','message','An existing payment or split uses this receipt.'); end if;
    if exists (select 1 from public.payment_refunds f where f.paystack_reference in (v_ref,v_provider_id) and f.status is distinct from 'failed')
    then return jsonb_build_object('state','held','message','A recorded refund requires review before this receipt can be imported.'); end if;

    select min(p.id) into v_profile from public.players p where lower(trim(p.email)) = v_email
    having count(*) = 1;
    select checkout.* into v_purchase from public.native_license_checkouts checkout where checkout.reference = v_ref for share;
    if found then
        if v_purchase.player_id is distinct from v_profile or v_purchase.amount * 100 <> v_minor
            or v_purchase.license_type not in ('full','temporary') or v_purchase.created_at > v_paid_at
            or (v_purchase.license_type = 'full' and v_purchase.license_year is null)
            or (v_purchase.license_type = 'temporary' and v_purchase.event_id is null)
            or not exists (select 1 from auth.users u where u.id = v_purchase.user_id and lower(trim(u.email)) = v_email)
        then return jsonb_build_object('state','held','message','The verified receipt does not match its saved licence checkout.'); end if;
        v_plan := jsonb_build_object('kind','licence','player_id',v_profile,'licence_type',v_purchase.license_type,
            'licence_year',v_purchase.license_year,'event_id',v_purchase.event_id);
    elsif p_charge->>'source' = 'manual_event' then
        v_plan := private.admin_paystack_event_plan(p_charge,v_profile,p_review is not null);
    end if;
    v_plan := coalesce(v_plan,jsonb_build_object('kind','unallocated','player_id',v_profile))
        || jsonb_build_object('provider_id',v_provider_id,'reference',v_ref,'amount_minor',v_minor,'paid_at',v_paid_at,'payer_email',v_email);
    if p_review is null then return jsonb_build_object('state','review','plan',v_plan); end if;
    if v_plan is distinct from p_review then return jsonb_build_object('state','changed','message','Receipt evidence changed. Review again.'); end if;

    v_event := (v_plan->>'event_id')::bigint;
    v_licence_type := v_plan->>'licence_type';
    v_payment_type := case v_plan->>'kind' when 'entry' then 'event_entry_fee' when 'licence' then
        case v_licence_type when 'temporary' then 'temp_license' else 'membership' end else 'other' end;
    v_gateway_metadata := jsonb_build_object('source',case v_plan->>'kind' when 'licence' then 'web_license_modal' else 'admin_paystack_backfill' end,
        'client_reference',v_ref,'provider_id',v_provider_id,'paystack_ref',case v_plan->>'kind' when 'licence' then v_provider_id else v_ref end,
        'verified_paid_at',v_paid_at,'verified_gateway_amount_minor',v_minor);
    if v_plan->>'kind' = 'licence' then
        v_gateway_metadata := v_gateway_metadata || jsonb_build_object('license_type',v_licence_type,'license_year',v_purchase.license_year,'event_id',v_event);
    elsif v_plan->>'kind' = 'entry' then
        v_gateway_metadata := v_gateway_metadata || jsonb_build_object('event_id',v_event,'registrant_email',v_email,'line_items',v_plan->'line_items','covers',
            (select jsonb_agg(c.value) from jsonb_array_elements(v_plan->'covers') c where c.value->>'type' = 'entry'));
    end if;

    insert into public.payments(player_id,event_id,amount,currency,status,payment_type,payment_method,reference,created_at,metadata,is_test)
    values (v_profile,case when v_licence_type='full' then null else v_event end,
        coalesce((v_plan->>'entry_amount_minor')::numeric,v_minor)/100,'ZAR','success',v_payment_type,'paystack',
        case v_plan->>'kind' when 'entry' then v_ref else v_provider_id end,v_paid_at,v_gateway_metadata,false)
    on conflict (reference) do nothing returning id into v_receipt;
    if v_receipt is null then return jsonb_build_object('state','already_recorded','message','An existing payment uses this receipt.'); end if;

    if v_plan->>'kind' = 'entry' then
        select array_agg(value::uuid) into v_reg_ids from jsonb_array_elements_text(v_plan->'registration_ids');
        update public.event_registrations set payment_status='paid', payment_method='paystack'
            where id = any(v_reg_ids) and event_id = v_event and status = 'registered' and payment_status in ('pending','unpaid','failed');
        get diagnostics v_count = row_count;
        if v_count <> cardinality(v_reg_ids) then
            raise exception 'A covered registration changed. Review the receipt again.' using errcode = '40001';
        end if;
        for v_licence in select value from jsonb_array_elements(v_plan->'licence_items') loop
            v_licence_index := v_licence_index + 1;
            select p.id into strict v_licence_player from public.players p where lower(trim(p.email)) = v_licence->>'email';
            v_licence_type := v_licence->>'license';
            insert into public.payments(player_id,event_id,amount,currency,status,payment_type,payment_method,reference,created_at,metadata,is_test)
            values(v_licence_player,v_event,(v_licence->>'amount')::numeric,'ZAR','success',
                case v_licence_type when 'temporary' then 'temp_license' else 'full_license' end,'paystack',
                'LIC-'||v_ref||'-backfill-'||v_licence_index,v_paid_at,
                jsonb_build_object('source','manual_event','registrations_persisted',true,'paystack_ref',v_ref,
                    'verified_paid_at',v_paid_at,'license_type',v_licence_type,'covers',jsonb_build_array(v_licence)),false)
            returning id into v_licence_payment_id;
            -- The parent contains only entry covers. Let the established issuer
            -- apply this single verified licence receipt before classifying it
            -- as a split child, which suppresses re-issuing on later updates.
            update public.payments set metadata = metadata || jsonb_build_object('parent_reference',v_ref)
                where id = v_licence_payment_id;
        end loop;
    end if;
    insert into private.admin_paystack_backfill_audit(provider_id,gateway_reference,payment_id,actor_id,action,event_id,amount_minor,reason)
    values(v_provider_id,v_ref,v_receipt,p_actor,v_plan->>'kind',v_event,v_minor,trim(p_reason));
    return jsonb_build_object('state','recorded','kind',v_plan->>'kind','payment_id',v_receipt);
end;
$$;
revoke all on function public.admin_paystack_receipt_backfill(uuid,jsonb,jsonb,text) from public, anon, authenticated, service_role;
grant execute on function public.admin_paystack_receipt_backfill(uuid,jsonb,jsonb,text) to service_role;

notify pgrst, 'reload schema';
