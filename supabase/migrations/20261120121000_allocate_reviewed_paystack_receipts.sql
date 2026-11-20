-- Keep the initial unallocated receipt audit and append the reviewed allocation.
create table private.admin_paystack_backfill_allocations (
    provider_id text primary key references private.admin_paystack_backfill_audit(provider_id),
    actor_id uuid not null,
    action text not null check (action in ('entry', 'licence')),
    event_id bigint,
    reason text not null,
    recorded_at timestamptz not null default clock_timestamp()
);
alter table private.admin_paystack_backfill_allocations enable row level security;
revoke all on private.admin_paystack_backfill_allocations from public, anon, authenticated, service_role;

create or replace function public.admin_paystack_receipt_backfill(p_actor uuid, p_charge jsonb, p_review jsonb default null, p_reason text default null)
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
    v_unallocated public.payments;
    v_allocation_kind text;
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
        then return jsonb_build_object('state','held','message','A previous reconciliation needs ledger review.'); end if;
        -- Use the ledger row lock so the final refund and receipt checks see
        -- changes committed before the decision. The gateway is reverified by
        -- the caller before each attempt.
        select p.* into v_unallocated from public.payments p where p.id = v_saved.payment_id for update;
        if not found or v_unallocated.status is distinct from 'success'
        then return jsonb_build_object('state','held','message','A previous reconciliation needs ledger review.'); end if;
        select a.action into v_allocation_kind from private.admin_paystack_backfill_allocations a where a.provider_id = v_provider_id;
        if v_saved.action <> 'unallocated' or v_allocation_kind is not null
        then return jsonb_build_object('state','already_recorded','kind',coalesce(v_allocation_kind,v_saved.action),'payment_id',v_saved.payment_id); end if;
        if v_unallocated.payment_type is distinct from 'other' or v_unallocated.payment_method is distinct from 'paystack'
            or v_unallocated.event_id is not null or v_unallocated.currency is distinct from 'ZAR' or v_unallocated.is_test is distinct from false
            or v_unallocated.reference is distinct from v_provider_id or v_unallocated.amount * 100 is distinct from v_minor::numeric
            or v_unallocated.created_at is distinct from v_paid_at
            or (v_unallocated.metadata - 'verified_paid_at') is distinct from jsonb_build_object('source','admin_paystack_backfill','provider_id',v_provider_id,
                'client_reference',v_ref,'paystack_ref',v_ref,'verified_gateway_amount_minor',v_minor)
            or (v_unallocated.metadata->>'verified_paid_at')::timestamptz is distinct from v_paid_at
        then return jsonb_build_object('state','held','message','The recorded unallocated payment changed. Review it in the ledger.'); end if;
    end if;

    -- The provider's current and legacy references and split aliases all
    -- block a second import. Only the original audited unallocated row
    -- can be reconsidered.
    if exists (select 1 from public.payments p where p.id is distinct from v_unallocated.id and (
        p.reference in (v_ref,v_provider_id,'LIC-'||v_ref,'LIC-'||v_provider_id)
        or p.metadata->>'paystack_ref' in (v_ref,v_provider_id)
        or p.metadata->>'client_reference' = v_ref
        or p.metadata->>'parent_reference' = v_ref
        or p.metadata->'original_trx'->>'id' in (v_ref,v_provider_id)
        or starts_with(p.reference,'LIC-'||v_ref||'-')
        or starts_with(p.reference,'REG-'||v_ref||'-')
        or starts_with(p.reference,'REG-PARTNER-'||v_ref||'-')
        or starts_with(p.reference,v_ref||'-')))
    then return jsonb_build_object('state','already_recorded','message','An existing payment or split uses this receipt.'); end if;
    if exists (select 1 from public.payment_refunds f where f.status is distinct from 'failed'
        and (f.paystack_reference in (v_ref,v_provider_id) or f.payment_id = v_unallocated.id))
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
    if v_unallocated.id is not null then
        if v_plan is null or (v_unallocated.player_id is not null and v_unallocated.player_id is distinct from v_profile)
        then return jsonb_build_object('state','held','message','The receipt stays unallocated until it matches an existing entry or saved licence checkout.'); end if;
        v_plan := v_plan || jsonb_build_object('existing_payment_id',v_unallocated.id);
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

    if v_unallocated.id is null then
        insert into public.payments(player_id,event_id,amount,currency,status,payment_type,payment_method,reference,created_at,metadata,is_test)
        values (v_profile,case when v_licence_type='full' then null else v_event end,
            coalesce((v_plan->>'entry_amount_minor')::numeric,v_minor)/100,'ZAR','success',v_payment_type,'paystack',
            case v_plan->>'kind' when 'entry' then v_ref else v_provider_id end,v_paid_at,v_gateway_metadata,false)
        on conflict (reference) do nothing returning id into v_receipt;
    else
        update public.payments set player_id=v_profile,
            event_id=case when v_licence_type='full' then null else v_event end,
            amount=coalesce((v_plan->>'entry_amount_minor')::numeric,v_minor)/100,
            payment_type=v_payment_type,
            reference=case v_plan->>'kind' when 'entry' then v_ref else v_provider_id end,
            metadata=v_gateway_metadata
        where id=v_unallocated.id returning id into v_receipt;
    end if;
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
    if v_unallocated.id is not null then
        insert into private.admin_paystack_backfill_allocations(provider_id,actor_id,action,event_id,reason)
        values(v_provider_id,p_actor,v_plan->>'kind',v_event,trim(p_reason));
        return jsonb_build_object('state','recorded','kind',v_plan->>'kind','payment_id',v_receipt,
            'message','The existing receipt was allocated in the 4M ledger.');
    end if;
    insert into private.admin_paystack_backfill_audit(provider_id,gateway_reference,payment_id,actor_id,action,event_id,amount_minor,reason)
    values(v_provider_id,v_ref,v_receipt,p_actor,v_plan->>'kind',v_event,v_minor,trim(p_reason));
    return jsonb_build_object('state','recorded','kind',v_plan->>'kind','payment_id',v_receipt);
end;
$$;
revoke all on function public.admin_paystack_receipt_backfill(uuid,jsonb,jsonb,text) from public, anon, authenticated, service_role;
grant execute on function public.admin_paystack_receipt_backfill(uuid,jsonb,jsonb,text) to service_role;

notify pgrst, 'reload schema';
