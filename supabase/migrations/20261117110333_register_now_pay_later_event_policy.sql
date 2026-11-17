-- Reuse the existing payment-policy values for weekly and tournament events.
comment on column public.calendar.weekly_payment_policy is 'Manual event payment policy: pay_now or allow_reserve (register now, pay later).';
create function public.register_event_pay_later(p_rows jsonb,p_solo_links jsonb default '[]') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare incoming public.event_registrations; existing public.event_registrations; saved public.event_registrations;
 item jsonb; link jsonb; c public.calendar; result jsonb:='[]';
begin
 if auth.uid() is null then raise exception 'Sign in before registering.' using errcode='42501';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 60
  or jsonb_typeof(p_solo_links) is distinct from 'array' or jsonb_array_length(p_solo_links)>60 then raise exception 'Choose valid entries.';end if;
 perform 1 from public.calendar where id in(select (value->>'event_id')::bigint from jsonb_array_elements(p_rows)) order by id for update;
 for item in select value from jsonb_array_elements(p_rows) loop
  select * into c from public.calendar where id=(item->>'event_id')::bigint;
  if c.weekly_payment_policy is distinct from 'allow_reserve' or c.is_manual is distinct from true or c.payment_method is distinct from 'platform' then
   raise exception 'This event does not allow register now, pay later.' using errcode='42501';end if;
 end loop;
 -- Same account, access-code and capacity validation as online checkout.
 perform public.reserve_event_registration_places(p_rows);
 for item in select value from jsonb_array_elements(p_rows) loop
  incoming:=jsonb_populate_record(null::public.event_registrations,item);
  select * into existing from public.event_registrations r where r.event_id=incoming.event_id and lower(trim(r.email))=lower(trim(incoming.email))
   and r.status is distinct from 'withdrawn' and (r.division_id=incoming.division_id or r.division=incoming.division) order by r.created_at desc limit 1;
  if existing.id is not null then
   update public.event_registrations set partner_name=incoming.partner_name,partner_email=incoming.partner_email,
    tshirt_size=coalesce(incoming.tshirt_size,existing.tshirt_size),tshirt_sponsor_name=coalesce(incoming.tshirt_sponsor_name,existing.tshirt_sponsor_name),tshirt_logo_url=coalesce(incoming.tshirt_logo_url,existing.tshirt_logo_url)
    where id=existing.id returning * into saved;
  else
   update public.event_registrations set division='__archived__/'||id::text,division_id=null
    where event_id=incoming.event_id and lower(trim(email))=lower(trim(incoming.email)) and division=incoming.division and status='withdrawn';
   insert into public.event_registrations(event_id,division_id,division,full_name,email,phone,partner_name,partner_email,payment_status,payment_method,status,registered_by,tshirt_size,tshirt_sponsor_name,tshirt_logo_url,access_grant_id,is_test)
    values(incoming.event_id,incoming.division_id,incoming.division,incoming.full_name,lower(trim(incoming.email)),incoming.phone,incoming.partner_name,incoming.partner_email,
     case when incoming.payment_status='paid' then 'paid' else 'pending' end,coalesce(incoming.payment_method,'platform'),'registered',coalesce(incoming.registered_by,auth.email()),incoming.tshirt_size,incoming.tshirt_sponsor_name,incoming.tshirt_logo_url,incoming.access_grant_id,coalesce(incoming.is_test,false))
    returning * into saved;
  end if;
  result:=result||jsonb_build_array(to_jsonb(saved));
 end loop;
 for link in select value from jsonb_array_elements(p_solo_links) loop
  update public.event_registrations r set partner_name=link->>'partner_name',partner_email=link->>'partner_email'
   where r.id=(link->>'id')::uuid and r.event_id in(select (value->>'event_id')::bigint from jsonb_array_elements(p_rows));
 end loop;
 return result;
end $$;
revoke all on function public.register_event_pay_later(jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.register_event_pay_later(jsonb,jsonb) to authenticated;

create function private.convert_saved_registration_hold() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status='registered' then
  update private.event_checkout_holds set state='converted' where event_id=new.event_id and email=lower(trim(new.email))
   and (division_id=new.division_id or division=new.division) and state='active';
 end if;
 return new;
end $$;
revoke all on function private.convert_saved_registration_hold() from public,anon,authenticated,service_role;
create trigger convert_saved_registration_hold after insert or update on public.event_registrations for each row execute function private.convert_saved_registration_hold();

notify pgrst,'reload schema';
create or replace function public.event_checkout_state(p_reference text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.payments; expiry timestamptz; active boolean; saved_entry boolean;
begin
 if not private.permission_actor_active() then raise exception 'Sign in to check your checkout.' using errcode='42501';end if;
 select * into p from public.payments where reference=p_reference and lower(trim(metadata->>'registrant_email'))=lower(trim(auth.email()));
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


create or replace function private.enforce_payment_registration_deadline() returns trigger
language plpgsql security definer set search_path='' as $$
declare entry jsonb; balance_entry jsonb;
begin
 if private.verified_email_change_context() then return new;end if;
 if new.status='processing' and new.metadata->>'source'='manual_event' then
  for entry in select value from jsonb_array_elements(coalesce(new.metadata->'registration_rows','[]')) loop
   perform private.assert_registration_deadline((entry->>'event_id')::bigint,(entry->>'division_id')::uuid,entry->>'division',entry->>'email');
  end loop;
  perform public.assert_event_registration_payments_open(coalesce(new.metadata->'registration_rows','[]'));
  for entry in select value from jsonb_array_elements(coalesce(new.metadata->'covers','[]')) where value->>'type'='entry' loop
   select to_jsonb(r) into balance_entry from public.event_registrations r
    where r.event_id=coalesce(nullif(entry->>'event_id','')::bigint,new.event_id) and lower(trim(r.email))=lower(trim(entry->>'email'))
     and r.division=entry->>'division' and r.status='registered' limit 1;
   if balance_entry is not null then perform public.assert_event_registration_payments_open(jsonb_build_array(balance_entry));end if;
  end loop;
 elsif new.status='processing' and new.payment_type='event_entry_fee' and new.metadata->>'source'='native_entry_balance' then
  select to_jsonb(r) into balance_entry from public.event_registrations r where r.id=(new.metadata->>'registration_id')::uuid;
  if balance_entry is not null then
   perform private.assert_registration_deadline((balance_entry->>'event_id')::bigint,(balance_entry->>'division_id')::uuid,balance_entry->>'division',balance_entry->>'email');
   perform public.assert_event_registration_payments_open(jsonb_build_array(balance_entry));
  end if;
 end if;
 return new;
end $$;
