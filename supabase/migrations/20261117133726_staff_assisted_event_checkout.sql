-- Staff use their existing event finance scope and live session for assisted checkout.
-- Receipts remain owned by the player; verified payment is still required.
create or replace function private.reserve_division_places_before_payment() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status in('pending','processing') and new.payment_type='event_entry_fee' and new.metadata->>'source'='manual_event'
  and jsonb_typeof(new.metadata->'registration_rows')='array' then
  perform private.reserve_checkout_holds(new.metadata->'registration_rows',case when coalesce(private.finance_event(new.event_id),false) then lower(trim(auth.email()))
    else new.metadata->>'registrant_email' end,new.id);
 end if;
 return new;
end $$;

create or replace function public.event_checkout_state(p_reference text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.payments; expiry timestamptz; active boolean; saved_entry boolean;
begin
 if not private.permission_actor_active() then raise exception 'Sign in to check your checkout.' using errcode='42501';end if;
 select * into p from public.payments where reference=p_reference and (
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
 select * into p from public.payments where reference=p_reference and (
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
