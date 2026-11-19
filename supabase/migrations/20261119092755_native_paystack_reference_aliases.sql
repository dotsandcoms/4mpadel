begin;
set local lock_timeout = '3s';

-- Installed apps keep their original checkout token. The payments ledger keeps
-- the actual Paystack reference so webhooks, finance and refunds use one key.
create table private.native_checkout_references (
    app_reference text primary key check (app_reference ~* '^MOBILE-[a-f0-9]{8}-[a-f0-9-]{36}$'),
    payment_id uuid not null unique references public.payments(id) on delete cascade
);
alter table private.native_checkout_references enable row level security;
revoke all on table private.native_checkout_references from public, anon, authenticated, service_role;

create function private.native_checkout_gateway_reference(p_reference text) returns text
language sql stable set search_path = '' as $$
    select coalesce((
        select payment.reference
        from private.native_checkout_references alias
        join public.payments payment on payment.id = alias.payment_id
        where alias.app_reference = p_reference
    ), p_reference);
$$;
revoke all on function private.native_checkout_gateway_reference(text) from public, anon, authenticated, service_role;

-- Provider callbacks look up the app token. Confirmation can look up the same
-- pair in the other direction. Only the Edge Functions can call this resolver.
create function public.resolve_native_checkout_reference(p_reference text) returns jsonb
language sql stable security definer set search_path = '' as $$
    select jsonb_build_object('app_reference', alias.app_reference,
        'gateway_reference', payment.reference, 'event_id', payment.event_id)
    from private.native_checkout_references alias
    join public.payments payment on payment.id = alias.payment_id
    where payment.reference = private.native_checkout_gateway_reference(p_reference);
$$;

create function public.prepare_native_checkout_payment(
    p_app_reference text, p_gateway_reference text, p_player_id bigint,
    p_event_id bigint, p_amount numeric, p_is_test boolean, p_metadata jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare payment public.payments;
begin
    if p_app_reference is null or p_app_reference !~* '^MOBILE-[a-f0-9]{8}-[a-f0-9-]{36}$'
        or p_gateway_reference is null or (p_gateway_reference <> p_app_reference
        and p_gateway_reference !~ '^MOBILE-[A-Z0-9][A-Z0-9-]{0,35}-[0-9]{23}$') then
        raise exception 'Invalid native checkout reference.' using errcode = '22023';
    end if;

    -- Concurrent retries and a changed event name must still share one payment.
    perform pg_advisory_xact_lock(hashtextextended(p_app_reference, 0));
    select * into payment from public.payments
        where reference = private.native_checkout_gateway_reference(p_app_reference);
    if payment.id is not null then return to_jsonb(payment); end if;

    insert into public.payments (player_id, event_id, amount, currency, status,
        payment_type, payment_method, reference, is_test, metadata)
    values (p_player_id, p_event_id, p_amount, 'ZAR', 'processing',
        'event_entry_fee', 'paystack', p_gateway_reference, p_is_test,
        p_metadata || jsonb_build_object('reference', p_gateway_reference))
    returning * into payment;

    if p_gateway_reference <> p_app_reference then
        insert into private.native_checkout_references (app_reference, payment_id)
        values (p_app_reference, payment.id);
    end if;
    return to_jsonb(payment);
end $$;

-- Only update the URL field. A retry must not overwrite verification or ledger metadata.
create function public.save_native_checkout_url(p_reference text, p_url text) returns text
language sql security definer set search_path = '' as $$
    update public.payments
    set metadata = jsonb_set(metadata, '{native_authorization_url}',
        to_jsonb(coalesce(nullif(metadata->>'native_authorization_url', ''), p_url)))
    where reference = p_reference and payment_type = 'event_entry_fee' and metadata->>'source' = 'manual_event'
    returning metadata->>'native_authorization_url';
$$;

revoke all on function public.resolve_native_checkout_reference(text),
    public.prepare_native_checkout_payment(text,text,bigint,bigint,numeric,boolean,jsonb),
    public.save_native_checkout_url(text,text) from public, anon, authenticated, service_role;
grant execute on function public.resolve_native_checkout_reference(text),
    public.prepare_native_checkout_payment(text,text,bigint,bigint,numeric,boolean,jsonb),
    public.save_native_checkout_url(text,text) to service_role;

-- Preserve the existing ownership, event finance and hold checks for installed apps.
create or replace function public.event_checkout_state(p_reference text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.payments; expiry timestamptz; active boolean; saved_entry boolean;
begin
 if not private.permission_actor_active() then raise exception 'Sign in to check your checkout.' using errcode='42501';end if;
 select * into p from public.payments where reference=private.native_checkout_gateway_reference(p_reference) and (
  lower(trim(metadata->>'registrant_email'))=lower(trim(auth.email()))
  or (payment_type='event_entry_fee' and metadata->>'source'='manual_event'
   and coalesce(private.finance_event(event_id),false)));
 if p.id is null then raise exception 'No checkout was found for this account.' using errcode='42501';end if;
 if coalesce((p.metadata->>'registration_review_required')::boolean,false) then return jsonb_build_object('state','review','message','Payment received after checkout closed. Contact support before paying again.');end if;
 if p.status='success' then return jsonb_build_object('state','paid');end if;
 select count(*)>0 and bool_and(exists(select 1 from public.event_registrations r
  where r.event_id=coalesce(nullif(cover->>'event_id','')::bigint,p.event_id) and lower(trim(r.email))=lower(trim(cover->>'email'))
   and r.division=cover->>'division' and r.status='registered')) into saved_entry
  from jsonb_array_elements(coalesce(p.metadata->'covers','[]')) cover where cover->>'type'='entry';
 if saved_entry then return jsonb_build_object('state','awaiting_payment','existingEntry',true);end if;
 select max(expires_at),bool_and(state='active' and expires_at>clock_timestamp()) into expiry,active from private.event_checkout_holds where payment_id=p.id;
 return jsonb_build_object('state',case when coalesce(active,false) then 'awaiting_payment' else 'expired' end,'expiresAt',expiry);
end $$;

create or replace function public.cancel_event_checkout(p_reference text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.payments;
begin
 if not private.permission_actor_active() then raise exception 'Sign in to cancel your checkout.' using errcode='42501';end if;
 select * into p from public.payments where reference=private.native_checkout_gateway_reference(p_reference) and (
  lower(trim(metadata->>'registrant_email'))=lower(trim(auth.email()))
  or (payment_type='event_entry_fee' and metadata->>'source'='manual_event'
   and coalesce(private.finance_event(event_id),false))) for update;
 if p.id is null then raise exception 'No checkout was found for this account.' using errcode='42501';end if;
 if p.status='success' then return jsonb_build_object('released',false,'paymentReceived',true);end if;
 perform 1 from public.calendar where id=p.event_id for update;
 update private.event_checkout_holds set state='released',expires_at=least(expires_at,clock_timestamp()) where payment_id=p.id and state='active';
 return jsonb_build_object('released',true);
end $$;

notify pgrst,'reload schema';
commit;
