-- A checkout hold is private inventory, never an event registration.
-- Existing clients keep the reservation RPC, but only verified payment creates
-- a roster row. Expiry is enforced in queries even if cron is delayed.
create table private.event_checkout_policy (
  id boolean primary key default true check(id), activated_at timestamptz not null default now()
);
insert into private.event_checkout_policy(id) values(true);
create table private.event_checkout_holds (
  id uuid primary key default gen_random_uuid(),
  event_id bigint not null references public.calendar(id) on delete cascade,
  division_id uuid references public.tournament_divisions(id), division text not null,
  email text not null, owner_email text not null, payload jsonb not null,
  payment_id uuid references public.payments(id) deferrable initially deferred,
  created_at timestamptz not null default now(), expires_at timestamptz not null,
  state text not null default 'active' check(state in('active','released','expired','converted')),
  unique(event_id,email,division)
);
create index event_checkout_holds_active on private.event_checkout_holds(event_id,expires_at) where state='active';
create index event_checkout_holds_payment on private.event_checkout_holds(payment_id);
alter table private.event_checkout_holds enable row level security;
alter table private.event_checkout_policy enable row level security;
-- RPC-only private records. Even service_role uses the checked functions.
revoke all on private.event_checkout_holds,private.event_checkout_policy from public,anon,authenticated,service_role;

create function private.checkout_roster(p_event bigint,p_division uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(row),'[]') from (
  select to_jsonb(r) as row from public.event_registrations r
   where r.event_id=p_event and r.status is distinct from 'withdrawn'
    and (p_division is null or r.division_id=p_division or (r.division_id is null and r.division=(select name from public.tournament_divisions where id=p_division)))
  union all
  select h.payload||jsonb_build_object('id',h.id,'status','checkout_hold','payment_status','pending')
   from private.event_checkout_holds h where h.event_id=p_event and h.state='active' and h.expires_at>clock_timestamp()
    and (p_division is null or h.division_id=p_division)
 ) roster
$$;

create function private.assert_checkout_hold_capacity(p_event bigint,p_division uuid) returns void
language plpgsql security definer set search_path='' as $$
declare c public.calendar; d public.tournament_divisions; roster jsonb; baseline jsonb;
 maximum integer; used integer; previous integer; target uuid;
begin
 select * into c from public.calendar where id=p_event for update;
 if c.id is null then raise exception 'Choose a valid event.'; end if;
 if coalesce(c.is_quick_event,false) then maximum:=c.max_players;
 elsif coalesce(c.is_weekly,false) then maximum:=c.max_teams_capacity;
 else select * into d from public.tournament_divisions where event_id=p_event and id=p_division;
  maximum:=d.entry_limit;target:=d.id;
 end if;
 if coalesce(maximum,0)<=0 then return; end if;
 roster:=private.checkout_roster(p_event,target);
 select coalesce(jsonb_agg(to_jsonb(r)),'[]') into baseline from public.event_registrations r
  where r.event_id=p_event and r.status is distinct from 'withdrawn'
   and (target is null or r.division_id=target or (r.division_id is null and r.division=d.name));
 if coalesce(c.is_quick_event,false) then
  select count(distinct lower(trim(value->>'email'))) into used from jsonb_array_elements(roster);
  select count(distinct lower(trim(value->>'email'))) into previous from jsonb_array_elements(baseline);
 else used:=private.count_registration_places(roster);previous:=private.count_registration_places(baseline);end if;
 if used>maximum and used>previous then raise exception 'This event or division is full. No payment has been started.'; end if;
end $$;

create function private.reserve_checkout_holds(p_rows jsonb,p_owner text,p_payment uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare item jsonb; incoming public.event_registrations; c public.calendar; d public.tournament_divisions;
 existing private.event_checkout_holds; actor text:=lower(trim(auth.email())); worker boolean:=private.worker_write();
begin
 if not worker and (not private.permission_actor_active() or actor is distinct from lower(trim(p_owner))) then
  raise exception 'Sign in before starting registration.' using errcode='42501';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>120 then raise exception 'Choose valid registration entries.';end if;
 perform 1 from public.calendar where id in(select distinct (value->>'event_id')::bigint from jsonb_array_elements(p_rows)) order by id for update;
 perform public.assert_event_registration_payments_open(p_rows);
 for item in select value from jsonb_array_elements(p_rows) loop
  incoming:=jsonb_populate_record(null::public.event_registrations,item);
  incoming.email:=private.canonical_entry_contact(incoming.email,incoming.event_id);
  incoming.registered_by:=private.canonical_entry_contact(incoming.registered_by,incoming.event_id);
  select * into c from public.calendar where id=incoming.event_id;
  select * into d from public.tournament_divisions where event_id=c.id and
   (id=incoming.division_id or (incoming.division_id is null and name=incoming.division)) order by id limit 1;
  if c.id is null or coalesce(c.event_status,'')='cancelled' or (not coalesce(c.is_weekly,false) and not coalesce(c.is_quick_event,false) and d.id is null)
   then raise exception 'Choose an available event and division.';end if;
  if not worker and not coalesce(private.finance_event(c.id),false) then
   if c.is_visible is false or c.sanction_status in('pending','rejected') then raise exception 'This event is unavailable.';end if;
   if c.registration_access in('code','protected') and not coalesce(public.event_access_grant_valid(c.id,incoming.access_grant_id),false) then raise exception 'Unlock this event before registering.';end if;
   if lower(trim(incoming.email)) is distinct from actor and
    (lower(trim(incoming.registered_by)) is distinct from actor or lower(trim(incoming.partner_email)) is distinct from actor)
    then raise exception 'Choose your own registration or your selected partner.' using errcode='42501';end if;
  end if;
  if exists(select 1 from public.event_registrations r where r.event_id=c.id and lower(trim(r.email))=lower(trim(incoming.email))
    and r.status is distinct from 'withdrawn' and lower(coalesce(r.payment_status,'')) in('paid','comped','complimentary','waived')
    and (r.division_id=d.id or (r.division_id is null and r.division=incoming.division))) then continue;end if;
  select * into existing from private.event_checkout_holds where event_id=c.id and email=lower(trim(incoming.email)) and division=coalesce(d.name,incoming.division);
  if existing.state='active' and existing.expires_at>clock_timestamp() and existing.owner_email<>lower(trim(p_owner)) then
   raise exception 'This player already has an active checkout. Please wait for it to finish or expire.';end if;
  insert into private.event_checkout_holds(event_id,division_id,division,email,owner_email,payload,payment_id,expires_at)
   values(c.id,d.id,coalesce(d.name,incoming.division),lower(trim(incoming.email)),lower(trim(p_owner)),
    item||jsonb_build_object('email',incoming.email,'division',coalesce(d.name,incoming.division),'division_id',d.id),p_payment,clock_timestamp()+interval '30 minutes')
   on conflict(event_id,email,division) do update set owner_email=excluded.owner_email,payload=excluded.payload,payment_id=excluded.payment_id,
    expires_at=case when event_checkout_holds.state='active' and event_checkout_holds.expires_at>clock_timestamp() then event_checkout_holds.expires_at else excluded.expires_at end,state='active';
 end loop;
 for incoming in select * from jsonb_populate_recordset(null::public.event_registrations,p_rows) loop
  select * into d from public.tournament_divisions where event_id=incoming.event_id and (id=incoming.division_id or name=incoming.division) order by id limit 1;
  perform private.assert_checkout_hold_capacity(incoming.event_id,d.id);
 end loop;
end $$;

create or replace function public.reserve_event_registration_places(p_rows jsonb,p_solo_links jsonb default '[]') returns void
language plpgsql security definer set search_path='' as $$
begin
 -- Links and public roster rows are written only by verified finalisation.
 perform private.reserve_checkout_holds(p_rows,case when private.worker_write() then coalesce(lower(trim(auth.email())),lower(trim(p_rows->0->>'registered_by'))) else lower(trim(auth.email())) end);
end $$;

create or replace function private.reserve_division_places_before_payment() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status in('pending','processing') and new.payment_type='event_entry_fee' and new.metadata->>'source'='manual_event'
  and jsonb_typeof(new.metadata->'registration_rows')='array' then
  perform private.reserve_checkout_holds(new.metadata->'registration_rows',new.metadata->>'registrant_email',new.id);
 end if;
 return new;
end $$;

create function public.event_checkout_state(p_reference text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.payments; expiry timestamptz; active boolean;
begin
 if not private.permission_actor_active() then raise exception 'Sign in to check your checkout.' using errcode='42501';end if;
 select * into p from public.payments where reference=p_reference and lower(trim(metadata->>'registrant_email'))=lower(trim(auth.email()));
 if p.id is null then raise exception 'No checkout was found for this account.' using errcode='42501';end if;
 if coalesce((p.metadata->>'registration_review_required')::boolean,false) then return jsonb_build_object('state','review','message','Payment received after checkout closed. Contact support before paying again.');end if;
 if p.status='success' then return jsonb_build_object('state','paid');end if;
 select max(expires_at),bool_and(state='active' and expires_at>clock_timestamp()) into expiry,active from private.event_checkout_holds where payment_id=p.id;
 return jsonb_build_object('state',case when coalesce(active,false) then 'awaiting_payment' else 'expired' end,'expiresAt',expiry);
end $$;

create function public.cancel_event_checkout(p_reference text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.payments;
begin
 if not private.permission_actor_active() then raise exception 'Sign in to cancel your checkout.' using errcode='42501';end if;
 select * into p from public.payments where reference=p_reference and lower(trim(metadata->>'registrant_email'))=lower(trim(auth.email())) for update;
 if p.id is null then raise exception 'No checkout was found for this account.' using errcode='42501';end if;
 if p.status='success' then return jsonb_build_object('released',false,'paymentReceived',true);end if;
 perform 1 from public.calendar where id=p.event_id for update;
 update private.event_checkout_holds set state='released',expires_at=least(expires_at,clock_timestamp()) where payment_id=p.id and state='active';
 return jsonb_build_object('released',true);
end $$;

create function private.expire_event_checkout_holds() returns void
language sql security definer set search_path='' as $$
 update private.event_checkout_holds set state='expired' where state='active' and expires_at<=clock_timestamp()
$$;

revoke all on function private.checkout_roster(bigint,uuid),private.assert_checkout_hold_capacity(bigint,uuid),private.reserve_checkout_holds(jsonb,text,uuid),private.expire_event_checkout_holds() from public,anon,authenticated,service_role;
revoke all on function public.event_checkout_state(text),public.cancel_event_checkout(text) from public,anon,authenticated,service_role;
grant execute on function public.event_checkout_state(text),public.cancel_event_checkout(text) to authenticated,service_role;
revoke all on function public.reserve_event_registration_places(jsonb,jsonb) from public,anon;
grant execute on function public.reserve_event_registration_places(jsonb,jsonb) to authenticated,service_role;
revoke all on function private.reserve_division_places_before_payment() from public,anon,authenticated,service_role;

-- Called only after the worker has verified Paystack and claimed the receipt.
-- All roster writes share one transaction and the inventory's parent locks.
create function public.finalize_paid_event_checkout(p_payment_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.payments; item jsonb; incoming public.event_registrations; old_row public.event_registrations;
 saved public.event_registrations; h private.event_checkout_holds; paid boolean; free boolean;
 saved_rows jsonb:='[]'; reason text; activated timestamptz; target uuid;
begin
 if not private.worker_write() then raise exception 'Verified payment worker required.' using errcode='42501';end if;
 select * into p from public.payments where id=p_payment_id for update;
 if p.status is distinct from 'success' or p.metadata->>'source' is distinct from 'manual_event' then raise exception 'Verify payment before confirming registration.';end if;
 if coalesce((p.metadata->>'registrations_persisted')::boolean,false) then return jsonb_build_object('savedRows','[]'::jsonb,'persisted',false);end if;
 if coalesce((p.metadata->>'registration_review_required')::boolean,false) then
  return jsonb_build_object('savedRows','[]'::jsonb,'persisted',false,'needsReview',true);end if;
 select activated_at into activated from private.event_checkout_policy where id;
 perform 1 from public.calendar where id in(select distinct (value->>'event_id')::bigint
  from jsonb_array_elements(coalesce(p.metadata->'registration_rows','[]')) union select p.event_id) order by id for update;
 for item in select value from jsonb_array_elements(coalesce(p.metadata->'covers','[]')) where value->>'type'='entry' loop
  if not exists(select 1 from jsonb_array_elements(coalesce(p.metadata->'registration_rows','[]')) r
    where coalesce(nullif(r->>'event_id','')::bigint,p.event_id)=coalesce(nullif(item->>'event_id','')::bigint,p.event_id)
      and lower(trim(r->>'email'))=lower(trim(item->>'email')) and r->>'division'=item->>'division')
   and not exists(select 1 from public.event_registrations r where r.event_id=coalesce(nullif(item->>'event_id','')::bigint,p.event_id)
    and r.status='registered' and lower(trim(r.email))=lower(trim(item->>'email')) and r.division=item->>'division') then reason:='registration_changed';exit;end if;
 end loop;
 -- Validate the complete cart before writing even its first registration.
 for item in select value from jsonb_array_elements(coalesce(p.metadata->'registration_rows','[]')) loop
  incoming:=jsonb_populate_record(null::public.event_registrations,item);
  select exists(select 1 from jsonb_array_elements(coalesce(p.metadata->'covers','[]')) c where c->>'type'='entry'
    and coalesce((c->>'event_id')::bigint,p.event_id)=incoming.event_id and lower(trim(c->>'email'))=lower(trim(incoming.email)) and c->>'division'=incoming.division) into paid;
  select exists(select 1 from jsonb_array_elements(coalesce(p.metadata->'server_free_entries','[]')) r
    where (r->>'event_id')::bigint=incoming.event_id and lower(trim(r->>'email'))=lower(trim(incoming.email)) and r->>'division'=incoming.division) into free;
  if not paid and not free then continue;end if;
  if exists(select 1 from public.event_registrations r where r.event_id=incoming.event_id and lower(trim(r.email))=lower(trim(incoming.email))
    and r.status is distinct from 'withdrawn' and (r.division_id=incoming.division_id or r.division=incoming.division)) then continue;end if;
  select * into h from private.event_checkout_holds where payment_id=p.id and event_id=incoming.event_id
   and lower(private.canonical_entry_contact(email,event_id))=lower(trim(incoming.email))
   and (division_id=incoming.division_id or division=incoming.division);
  if (h.id is not null and (h.state is distinct from 'active' or h.expires_at<=clock_timestamp())) or (h.id is null and p.created_at>=activated) then
   reason:='checkout_expired_or_cancelled';exit;end if;
 end loop;
 if reason is null then
  begin
   for target in select distinct division_id from private.event_checkout_holds where payment_id=p.id and state='active' loop
    perform private.assert_checkout_hold_capacity(p.event_id,target);
   end loop;
  exception when others then reason:='capacity_changed';end;
 end if;
 if reason is not null then
  -- Keep the verified money in the ledger, flag it for finance review, and
  -- never overbook or send an entry confirmation for a late payment.
  update public.payments set metadata=metadata||jsonb_build_object('registration_review_required',true,'registration_review_reason',reason) where id=p.id;
  update private.event_checkout_holds set state='expired' where payment_id=p.id and state='active';
  return jsonb_build_object('savedRows','[]'::jsonb,'persisted',false,'needsReview',true);
 end if;
 for item in select value from jsonb_array_elements(coalesce(p.metadata->'registration_rows','[]')) loop
  incoming:=jsonb_populate_record(null::public.event_registrations,item);
  select * into old_row from public.event_registrations r where r.event_id=incoming.event_id and lower(trim(r.email))=lower(trim(incoming.email))
   and r.status is distinct from 'withdrawn' and (r.division_id=incoming.division_id or r.division=incoming.division)
   order by (r.payment_status='paid') desc,r.created_at desc limit 1;
  select exists(select 1 from jsonb_array_elements(coalesce(p.metadata->'covers','[]')) c where c->>'type'='entry'
    and coalesce((c->>'event_id')::bigint,p.event_id)=incoming.event_id and lower(trim(c->>'email'))=lower(trim(incoming.email)) and c->>'division'=incoming.division) into paid;
  select exists(select 1 from jsonb_array_elements(coalesce(p.metadata->'server_free_entries','[]')) r
    where (r->>'event_id')::bigint=incoming.event_id and lower(trim(r->>'email'))=lower(trim(incoming.email)) and r->>'division'=incoming.division) into free;
  -- A partner who has not paid must register/pay separately; naming a partner
  -- never creates an unpaid public registration on their behalf.
  if not paid and not free and coalesce(old_row.payment_status,'') not in('paid','comped','complimentary','waived') then continue;end if;
  if old_row.id is not null then
   update public.event_registrations set partner_name=incoming.partner_name,partner_email=incoming.partner_email,
    division=case when paid or free then incoming.division else old_row.division end,division_id=coalesce(incoming.division_id,old_row.division_id),
    payment_status=case when paid or free then 'paid' else old_row.payment_status end,
    payment_method=case when old_row.payment_status='paid' then old_row.payment_method when free then 'free' else 'paystack' end,
    status='registered',tshirt_size=coalesce(incoming.tshirt_size,old_row.tshirt_size),
    tshirt_sponsor_name=coalesce(incoming.tshirt_sponsor_name,old_row.tshirt_sponsor_name),tshirt_logo_url=coalesce(incoming.tshirt_logo_url,old_row.tshirt_logo_url)
    where id=old_row.id returning * into saved;
  else
   update public.event_registrations set division='__archived__/'||id::text,division_id=null
    where event_id=incoming.event_id and lower(trim(email))=lower(trim(incoming.email)) and division=incoming.division and status='withdrawn';
   insert into public.event_registrations(event_id,division_id,division,full_name,email,phone,partner_name,partner_email,
    payment_status,payment_method,status,registered_by,is_test,tshirt_size,tshirt_sponsor_name,tshirt_logo_url,access_grant_id)
   values(incoming.event_id,incoming.division_id,incoming.division,incoming.full_name,lower(trim(incoming.email)),incoming.phone,incoming.partner_name,incoming.partner_email,
    'paid',case when free then 'free' else 'paystack' end,'registered',lower(trim(p.metadata->>'registrant_email')),p.is_test,incoming.tshirt_size,incoming.tshirt_sponsor_name,incoming.tshirt_logo_url,incoming.access_grant_id)
   returning * into saved;
  end if;
  saved_rows:=saved_rows||jsonb_build_array(to_jsonb(saved));
 end loop;
 -- Payment-only carts also confirm their covered entries before any bundled
 -- licence trigger runs. This is part of the same atomic registration step.
 for item in select value from jsonb_array_elements(coalesce(p.metadata->'covers','[]')) where value->>'type'='entry' loop
  update public.event_registrations r set payment_status='paid',payment_method=case when r.payment_status='paid' then r.payment_method else 'paystack' end
   where r.event_id=coalesce(nullif(item->>'event_id','')::bigint,p.event_id) and lower(trim(r.email))=lower(trim(item->>'email'))
    and r.division=item->>'division' and r.status='registered';
 end loop;
 for item in select value from jsonb_array_elements(coalesce(p.metadata->'solo_link_updates','[]')) loop
  update public.event_registrations r set partner_name=item->>'partner_name',partner_email=item->>'partner_email'
   where r.id=(item->>'id')::uuid and r.status='registered' and r.payment_status in('paid','comped','complimentary','waived')
    and exists(select 1 from public.event_registrations peer where peer.event_id=r.event_id and peer.status='registered'
     and lower(trim(peer.email))=lower(trim(item->>'partner_email')) and (peer.division_id=r.division_id or peer.division=r.division));
 end loop;
 update private.event_checkout_holds held set state=case when exists(select 1 from public.event_registrations r
  where r.event_id=held.event_id and lower(trim(r.email))=lower(private.canonical_entry_contact(held.email,held.event_id)) and r.status='registered'
   and (r.division_id=held.division_id or r.division=held.division) and r.payment_status in('paid','comped','complimentary','waived')) then 'converted' else 'released' end
  where held.payment_id=p.id;
 update public.payments set metadata=metadata||jsonb_build_object('registrations_persisted',true) where id=p.id;
 return jsonb_build_object('savedRows',saved_rows,'persisted',true);
end $$;
revoke all on function public.finalize_paid_event_checkout(uuid) from public,anon,authenticated,service_role;
grant execute on function public.finalize_paid_event_checkout(uuid) to service_role;

create function private.require_paid_online_registration() returns trigger
language plpgsql security definer set search_path='' as $$
declare method text; fee numeric;
begin
 if new.status='withdrawn' then return new;end if;
 select coalesce(payment_method,case when allow_payments is false then 'free' else 'platform' end) into method from public.calendar where id=new.event_id;
 fee:=private.current_entry_fee(new.event_id,new.division_id,new.division);
 if method='platform' and coalesce(fee,0)>0 and coalesce(new.payment_method,'platform') in('platform','paystack')
  and coalesce(new.payment_status,'') not in('paid','comped','complimentary','waived') then
  raise exception 'Registration is only confirmed after successful payment. Start event registration to pay.' using errcode='42501';end if;
 return new;
end $$;
create trigger require_paid_online_registration before insert or update on public.event_registrations for each row execute function private.require_paid_online_registration();
revoke all on function private.require_paid_online_registration() from public,anon,authenticated,service_role;

-- Temporary licences are a required event-registration item, not a standalone
-- product. Keep captured historical quotes valid when callbacks arrive later.
alter function private.validate_event_checkout(public.payments) rename to validate_event_checkout_before_paid_registration;
create function private.validate_event_checkout(p public.payments) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; cover jsonb; address text; event bigint;
begin
 result:=private.validate_event_checkout_before_paid_registration(p);
 for cover in select value from jsonb_array_elements(coalesce(p.metadata->'covers','[]')) where value->>'type'='license' and value->>'license'='temporary' loop
  address:=lower(trim(cover->>'email'));event:=coalesce(nullif(cover->>'event_id','')::bigint,p.event_id);
  if not exists(select 1 from (select value as r from jsonb_array_elements(coalesce(p.metadata->'registration_rows','[]'))
    union all select to_jsonb(existing) from public.event_registrations existing where existing.event_id=event and existing.status='registered'
     and lower(trim(existing.email))=address) selected_row
    join public.tournament_divisions d on d.event_id=event and (d.id=nullif(r->>'division_id','')::uuid or d.name=r->>'division')
    where coalesce(nullif(r->>'event_id','')::bigint,p.event_id)=event and lower(trim(r->>'email'))=address and d.license_required
     and (private.current_entry_fee(event,d.id,d.name)=0 or exists(select 1 from jsonb_array_elements(p.metadata->'covers') c where c->>'type'='entry'
      and lower(trim(c->>'email'))=address and c->>'division'=d.name and coalesce(nullif(c->>'event_id','')::bigint,p.event_id)=event))) then
   raise exception 'A temporary licence is only available during registration for a division that requires it.';end if;
  if exists(select 1 from public.players player where lower(trim(player.email))=address and (public.has_full_license(player.id,extract(year from (select start_date from public.calendar where id=event))::integer)
   or exists(select 1 from public.temporary_licenses t where t.player_id=player.id and t.event_id=event and t.revoked_at is null))) then
   raise exception 'This player already has licence coverage for this event.';end if;
 end loop;
 return result;
end $$;
revoke all on function private.validate_event_checkout(public.payments),private.validate_event_checkout_before_paid_registration(public.payments) from public,anon,authenticated,service_role;

do $cron$ begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  perform cron.schedule('expire-event-checkout-holds','* * * * *','select private.expire_event_checkout_holds()');
 end if;
end $cron$;
notify pgrst,'reload schema';

CREATE OR REPLACE FUNCTION private.finalize_license_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c jsonb; v_player bigint; v_year integer; v_event bigint; v_type text; v_id uuid; v_saved record; v_calendar record; v_source text; v_required numeric; v_base numeric; v_percent numeric;
begin
 -- Event licences activate in the same transaction as the paid registration,
 -- never on the preliminary money-ledger claim or on an expired checkout.
 if new.metadata->>'source'='manual_event'
  and (not coalesce((new.metadata->>'registrations_persisted')::boolean,false) or coalesce((new.metadata->>'split_recorded')::boolean,false)) then return new;end if;
 if new.status<>'success' or coalesce(new.is_test,false) or new.currency<>'ZAR' then return new; end if;
 if coalesce(auth.role(),'')<>'service_role' and session_user not in ('postgres','supabase_admin') and not public.can_manage_licenses() then return new; end if;
 -- Parent event covers are authoritative; child ledger splits must not grant twice.
 if exists(select 1 from private.event_license_quotes where payment_id=new.id) and not private.event_license_quote_matches(new.id,new.amount,new.metadata) then
 insert into public.license_audit_log(player_id,action,reason,details) values(new.player_id,'payment_review','Payment does not match the saved server license quote',jsonb_build_object('payment_id',new.id));return new;end if;
 if new.metadata ? 'parent_reference' or new.metadata ? 'parent_payment_id' then return new; end if;
 select license_fee_percent,temp_license_price into v_percent,v_base from public.commerce_config where id='default';
 if jsonb_typeof(new.metadata->'covers')='array' then
 select sum(case when x->>'license'='full' then private.full_license_price(coalesce((x->>'player_id')::bigint,(select id from public.players where lower(email)=lower(x->>'email')),new.player_id),coalesce((x->>'license_year')::integer,(new.metadata->>'license_year')::integer,(select extract(year from start_date)::integer from public.calendar where id=coalesce((x->>'event_id')::bigint,new.event_id)))) else v_base end * (1+coalesce(v_percent,0)/100))
 into v_required from jsonb_array_elements(new.metadata->'covers') x where x->>'type'='license';
 if not private.event_license_quote_matches(new.id,new.amount,new.metadata) and new.amount+0.01<coalesce(v_required,0) and not (new.payment_method in('cash','eft') and public.can_manage_licenses()) then
 insert into public.license_audit_log(player_id,action,reason,details) values(new.player_id,'payment_review','Payment does not cover the server license prices',jsonb_build_object('payment_id',new.id));return new;
 end if;
 end if;

 for c in select value from jsonb_array_elements(case when jsonb_typeof(new.metadata->'covers')='array' then new.metadata->'covers' else '[]'::jsonb end) where value->>'type'='license'
 union all select jsonb_build_object('license',case when new.payment_type='temp_license' then 'temporary' else coalesce(new.metadata->>'license_type','full') end,'player_id',new.player_id,'event_id',new.event_id,'license_year',new.metadata->'license_year')
 where (new.payment_type in('membership','full_license','temp_license') or new.metadata->>'license_type' in('full','temporary')) and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof(new.metadata->'covers')='array' then new.metadata->'covers' else '[]'::jsonb end) x where x->>'type'='license')
 loop
 v_id:=null; v_type:=c->>'license'; v_player:=coalesce((c->>'player_id')::bigint,new.player_id);
 if c ? 'email' then select id into v_player from public.players where lower(email)=lower(c->>'email'); end if;
 if v_player is null then continue; end if;
 perform 1 from public.players where id=v_player for update;
 v_event:=coalesce((c->>'event_id')::bigint,new.event_id,(new.metadata->>'event_id')::bigint);
 v_year:=coalesce((c->>'license_year')::integer,(new.metadata->>'license_year')::integer);
 select * into v_saved from public.native_license_checkouts where reference=coalesce(new.metadata->>'client_reference',new.reference) and player_id=v_player;
 if found then
 if v_saved.amount<>new.amount then raise exception 'License payment amount does not match checkout'; end if;
 v_year:=v_saved.license_year; v_event:=v_saved.event_id; v_type:=v_saved.license_type;
 end if;
 select * into v_calendar from public.calendar where id=v_event; v_year:=coalesce(v_year,extract(year from v_calendar.start_date)::integer);
 if v_type='temporary' and new.payment_method='paystack'
  and not exists(select 1 from public.temporary_licenses where player_id=v_player and event_id=v_event)
  and not coalesce((v_saved.reference is not null and v_saved.created_at<(select activated_at from private.event_checkout_policy where id) and nullif(new.metadata->>'verified_paid_at','')::timestamptz<(select activated_at from private.event_checkout_policy where id)),false)
  and not (new.metadata->>'source'='manual_event' and coalesce((new.metadata->>'registrations_persisted')::boolean,false)
    and exists(select 1 from public.event_registrations r join public.tournament_divisions d on d.event_id=r.event_id and d.id=r.division_id
      join public.players player on lower(trim(player.email))=lower(trim(r.email))
      where player.id=v_player and r.event_id=v_event and r.status='registered' and r.payment_status='paid' and d.license_required)) then
  if not exists(select 1 from public.license_audit_log where action='payment_review' and details->>'payment_id'=new.id::text) then
   insert into public.license_audit_log(player_id,license_type,action,reason,details)
    values(v_player,'temporary','payment_review','Temporary licence requires a paid event registration',jsonb_build_object('payment_id',new.id));
  end if;
  continue;
 end if;

 if v_type='full' and v_saved.reference is null and not private.event_license_quote_matches(new.id,new.amount,new.metadata) and new.payment_method='paystack' and new.created_at>='2026-10-15T09:32:22Z'
 and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof(new.metadata->'covers')='array' then new.metadata->'covers' else '[]'::jsonb end)x where x->>'type'='license') then
 if not exists(select 1 from public.license_audit_log where action='payment_review' and details->>'payment_id'=new.id::text) then
 insert into public.license_audit_log(player_id,license_type,action,reason,details) values(v_player,v_type,'payment_review','Standalone license payment needs a server checkout record',jsonb_build_object('payment_id',new.id));end if;continue;
 end if;

 if v_type='full' then
 -- A bundled annual license must cover the actual event's calendar year.
 if v_event is not null and v_year is not null and not exists(select 1 from public.license_seasons s where s.year=v_year and s.coverage_starts_on<=v_calendar.start_date::date and make_date(s.year,12,31)>=v_calendar.start_date::date) then
 insert into public.license_audit_log(player_id,license_type,action,reason,details) values(v_player,'full','payment_review','License year does not match the event',jsonb_build_object('payment_id',new.id));continue;
 end if;
 -- Only pre-migration charges can be interpreted as yearless 2026 purchases.
 if v_year is null and new.created_at<'2026-10-15T09:32:22Z' then v_year:=2026; end if;
 if v_year is null or not exists(select 1 from public.license_seasons where year=v_year) then
 if not exists(select 1 from public.license_audit_log where action='payment_review' and details->>'payment_id'=new.id::text) then
 insert into public.license_audit_log(player_id,license_type,action,reason,details) values(v_player,'full','payment_review','Annual payment needs an explicit license year',jsonb_build_object('payment_id',new.id)); end if;
 continue;
 end if;
 if v_type='full' and v_saved.reference is null and not private.event_license_quote_matches(new.id,new.amount,new.metadata) and new.payment_method='paystack' and new.created_at>='2026-10-15T09:32:22Z' and not exists(select 1 from public.license_seasons where year=v_year and sales_open) then
 insert into public.license_audit_log(player_id,license_type,action,reason,details) values(v_player,'full','payment_review','Bundled annual license sales were closed; administrator review required',jsonb_build_object('payment_id',new.id));continue;
 end if;
 select private.full_license_price(v_player,v_year) into v_required;
 if v_saved.reference is null and not private.event_license_quote_matches(new.id,new.amount,new.metadata) and new.amount+0.01 < round(v_required*(1+coalesce(v_percent,0)/100),2) and not (new.payment_method in('cash','eft') and public.can_manage_licenses()) then
 insert into public.license_audit_log(player_id,license_type,action,reason,details) values(v_player,'full','payment_review','Annual payment below the server license price',jsonb_build_object('payment_id',new.id));continue;
 end if;
 insert into public.annual_licenses(player_id,season_year,source,payment_id) values(v_player,v_year,'payment',new.id) on conflict(player_id,season_year) do nothing returning id into v_id;
 -- Link evidence without restoring a revoked entitlement.
 update public.annual_licenses set payment_id=new.id,source=case when source='legacy' then 'payment' else source end where player_id=v_player and season_year=v_year and payment_id is null;
 elsif v_type='temporary' and v_event is not null then
 if v_saved.reference is null and not private.event_license_quote_matches(new.id,new.amount,new.metadata) and new.amount+0.01<round(v_base*(1+coalesce(v_percent,0)/100),2) and not (new.payment_method in('cash','eft') and public.can_manage_licenses()) then
 insert into public.license_audit_log(player_id,license_type,action,reason,details) values(v_player,'temporary','payment_review','Event license payment below server price',jsonb_build_object('payment_id',new.id));continue;
 end if;
 if not exists(select 1 from public.temporary_licenses where player_id=v_player and event_id=v_event) then
 insert into public.temporary_licenses(player_id,event_id,event_name,event_date,source,payment_id) values(v_player,v_event,v_calendar.event_name,coalesce(v_calendar.end_date,v_calendar.start_date),'payment',new.id) returning id into v_id;
 end if;
 end if;
 if v_type='temporary' and v_event is not null then update public.temporary_licenses set payment_id=new.id,source=case when source='legacy' then 'payment' else source end where player_id=v_player and event_id=v_event and revoked_at is null and payment_id is null;end if;
 if v_id is not null then insert into public.license_audit_log(player_id,license_id,license_type,action,reason,details) values(v_player,v_id,v_type,'payment','Verified license payment',jsonb_build_object('payment_id',new.id,'reference',new.reference)); end if;
 end loop;
 return new;
end $function$;
-- Convert only current/future abandoned online carts. Preserve paid, comped,
-- offline/manual and historical entries, and retain the original row as audit.
do $backfill$
declare activity_enabled boolean;
begin
 select exists(select 1 from pg_trigger where tgrelid='public.event_registrations'::regclass and tgname='trg_event_registration_activity' and tgenabled='O') into activity_enabled;
 if activity_enabled then alter table public.event_registrations disable trigger trg_event_registration_activity;end if;
 insert into private.event_checkout_holds(event_id,division_id,division,email,owner_email,payload,payment_id,created_at,expires_at,state)
 select distinct on(r.event_id,lower(trim(r.email)),r.division) r.event_id,r.division_id,r.division,lower(trim(r.email)),lower(trim(p.metadata->>'registrant_email')),
  to_jsonb(r)||jsonb_build_object('legacy_registration_id',r.id,'reason','unpaid_checkout_is_not_registration'),p.id,p.created_at,
  p.created_at+interval '30 minutes',case when p.status in('pending','processing') and p.created_at+interval '30 minutes'>clock_timestamp() then 'active' else 'expired' end
 from public.event_registrations r join public.calendar c on c.id=r.event_id
 join public.payments p on p.event_id=r.event_id and p.metadata->>'source'='manual_event'
  and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(p.metadata->'registration_rows')='array' then p.metadata->'registration_rows' else '[]'::jsonb end) item where lower(trim(item->>'email'))=lower(trim(r.email)) and item->>'division'=r.division)
 where nullif(trim(p.metadata->>'registrant_email'),'') is not null and r.status='registered' and r.payment_status in('pending','unpaid') and r.payment_method in('platform','paystack')
  and coalesce(c.end_date,c.start_date)>=(now() at time zone 'Africa/Johannesburg')::date
  and not exists(select 1 from public.payments settled cross join lateral jsonb_array_elements(case when jsonb_typeof(settled.metadata->'covers')='array' then settled.metadata->'covers' else '[]'::jsonb end) cover
   where settled.event_id=r.event_id and settled.status='success' and cover->>'type'='entry' and lower(trim(cover->>'email'))=lower(trim(r.email)) and cover->>'division'=r.division)
 order by r.event_id,lower(trim(r.email)),r.division,p.created_at desc
 on conflict(event_id,email,division) do nothing;
 update public.event_registrations r set status='withdrawn',withdrawn_at=clock_timestamp()
 where r.status='registered' and r.payment_status in('pending','unpaid') and exists(select 1 from private.event_checkout_holds h where h.payload->>'legacy_registration_id'=r.id::text);
 if activity_enabled then alter table public.event_registrations enable trigger trg_event_registration_activity;end if;
end $backfill$;

-- The public roster describes confirmed entries. Awaiting organiser-verified
-- payment can still be shown privately as "Awaiting payment".
create or replace view public.event_registrations_public as
 SELECT id,
    event_id,
    full_name,
    partner_name,
    division,
    division_id,
    status,
    payment_status,
    created_at,
        CASE
            WHEN NULLIF(email, ''::text) IS NOT NULL THEN encode(digest(lower(email), 'sha256'::text), 'hex'::text)
            ELSE NULL::text
        END AS email_hash,
        CASE
            WHEN NULLIF(partner_email, ''::text) IS NOT NULL THEN encode(digest(lower(partner_email), 'sha256'::text), 'hex'::text)
            ELSE NULL::text
        END AS partner_email_hash,
        CASE
            WHEN NULLIF(registered_by, ''::text) IS NOT NULL THEN encode(digest(lower(registered_by), 'sha256'::text), 'hex'::text)
            ELSE NULL::text
        END AS registered_by_hash
   FROM public.event_registrations
  WHERE status <> 'withdrawn'::text AND payment_status IN ('paid','comped','complimentary','waived');
grant select on public.event_registrations_public to anon,authenticated,service_role;

-- Recompile the caller so previously cached plans use the new licence checks.
do $recompile$ begin execute pg_get_functiondef('private.guard_payment_integrity()'::regprocedure);end $recompile$;
CREATE OR REPLACE FUNCTION private.enforce_division_team_capacity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    target public.tournament_divisions;
    roster jsonb;
    before_count integer;
    after_count integer;
BEGIN
  IF TG_OP='UPDATE' AND private.verified_email_change_context() THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' AND
        (NEW.event_id, NEW.division_id, NEW.division, NEW.email, NEW.partner_email, NEW.status)
        IS NOT DISTINCT FROM
        (OLD.event_id, OLD.division_id, OLD.division, OLD.email, OLD.partner_email, OLD.status)
    THEN RETURN NEW; END IF;

    -- Use the same parent lock as manager merge/split and paid replacement RPCs.
    -- Withdrawals/deletions also take it so a waiting checkout sees the freed place.
    PERFORM 1 FROM public.calendar
    WHERE id IN (CASE WHEN TG_OP <> 'INSERT' THEN OLD.event_id END,
                 CASE WHEN TG_OP <> 'DELETE' THEN NEW.event_id END)
    ORDER BY id FOR UPDATE;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    IF lower(COALESCE(NEW.status, '')) = 'withdrawn' THEN RETURN NEW; END IF;
    IF EXISTS (SELECT 1 FROM public.calendar WHERE id = NEW.event_id
        AND (COALESCE(is_weekly, false) OR COALESCE(is_quick_event, false))) THEN RETURN NEW; END IF;

    SELECT * INTO target FROM public.tournament_divisions
    WHERE event_id = NEW.event_id
      AND (id = NEW.division_id OR (NEW.division_id IS NULL AND lower(trim(name)) = lower(trim(NEW.division))))
    ORDER BY id LIMIT 1;
    IF NEW.division_id IS NOT NULL AND target.id IS NULL THEN
        RAISE EXCEPTION 'Choose a valid division for this event';
    END IF;
    IF target.entry_limit IS NULL OR target.entry_limit <= 0 THEN RETURN NEW; END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb) INTO roster
    FROM public.event_registrations r
    WHERE r.event_id = NEW.event_id AND lower(COALESCE(r.status, '')) <> 'withdrawn'
      AND (r.division_id = target.id OR (r.division_id IS NULL AND lower(trim(r.division)) = lower(trim(target.name))));

    roster := roster || (select coalesce(jsonb_agg(h.payload || jsonb_build_object('id',h.id,'status','checkout_hold','payment_status','pending',
      'email',private.canonical_entry_contact(h.email,h.event_id),
      'partner_email',private.canonical_entry_contact(h.payload->>'partner_email',h.event_id))),'[]')
      from private.event_checkout_holds h where h.event_id=NEW.event_id and h.state='active' and h.expires_at>clock_timestamp()
        and h.division_id=target.id);
    before_count := private.count_registration_places(roster);
    -- BEFORE INSERT also runs for UPSERTs: exclude an existing row with the same
    -- stable identity, so an update or gateway retry cannot consume another place.
    SELECT COALESCE(jsonb_agg(value), '[]'::jsonb) INTO roster
    FROM jsonb_array_elements(roster)
    WHERE value->>'id' <> NEW.id::text
      AND (TG_OP <> 'UPDATE' OR value->>'id' <> OLD.id::text);
    after_count := private.count_registration_places(roster || jsonb_build_array(to_jsonb(NEW)));
    IF after_count > target.entry_limit AND after_count > before_count THEN
        RAISE EXCEPTION '% is full (maximum % teams). Each solo entry reserves one team place.', target.name, target.entry_limit
            USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$function$;
