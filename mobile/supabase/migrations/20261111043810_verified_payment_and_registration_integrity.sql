-- Compatible security boundaries: preserve existing table/query contracts.
-- Apply only after the legacy permission-boundary migration.
begin;

create function private.finance_event(p_event bigint) returns boolean
language sql stable security definer set search_path='' as $$
  select private.permission_actor_active() and (
    public.is_super_admin(auth.email()) or (p_event is not null and public.can_manage_event(p_event)) or exists(
      select 1 from public.admin_sidebar_permissions a where lower(a.email)=lower(auth.email())
      and 'finance'=any(a.allowed_tabs) and (
        coalesce(a.module_permissions->'finance'->'allowedEvents','[]'::jsonb)='[]'::jsonb
        or a.module_permissions->'finance'->'allowedEvents' @> jsonb_build_array(p_event))
    )
  )
$$;

create function private.worker_write() returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(auth.jwt()->>'role','')='service_role' or (
    session_user in('postgres','supabase_admin') and current_setting('role',true) in('none','postgres','supabase_admin')
    and coalesce(auth.jwt(),'{}'::jsonb)='{}'::jsonb)
$$;

create function private.current_entry_fee(p_event bigint,p_division uuid,p_name text) returns numeric
language sql stable security definer set search_path='' as $$
  select case when c.payment_method='free' or c.allow_payments=false then 0
    when c.early_bird_ends_at>now() and c.early_bird_fee is not null then c.early_bird_fee
    else coalesce(d.entry_fee,(c.category_fees->>p_name)::numeric,c.entry_fee,0) end
  from public.calendar c left join lateral (
    select entry_fee from public.tournament_divisions d where d.event_id=c.id
      and (d.id=p_division or (p_division is null and lower(trim(d.name))=lower(trim(p_name))))
    order by d.id limit 1
  ) d on true where c.id=p_event
$$;

-- A quote is captured before checkout and retained across later price changes.
-- Only owner-run trigger code can read/write it; it is never a client API.
create table private.event_checkout_security_quotes(
 payment_id uuid primary key references public.payments(id) on delete cascade,
 cart_hash bytea not null,required_amount numeric not null,original_amount numeric not null,currency text not null,is_test boolean not null,
 license_amount numeric not null default 0,license_items jsonb not null default '[]',free_entries jsonb not null default '[]',
 created_at timestamptz not null default now()
);
alter table private.event_checkout_security_quotes enable row level security;
revoke all on private.event_checkout_security_quotes from public,anon,authenticated,service_role;

create function private.checkout_cart(p public.payments) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('event',p.event_id,'payer',p.player_id,'amount',p.amount,'currency',p.currency,'test',p.is_test,
  'source',p.metadata->'source','registrant',p.metadata->'registrant_email','covers',p.metadata->'covers',
  'rows',p.metadata->'registration_rows','links',p.metadata->'solo_link_updates',
  'registration',p.metadata->'registration_id','target',p.metadata->'target_division_id')
$$;

create function private.validate_event_checkout(p public.payments) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare meta jsonb:=coalesce(p.metadata,'{}'); cover jsonb; item jsonb; link jsonb; address text:=lower(trim(meta->>'registrant_email'));
 event bigint; chosen_division uuid; division_name text; fee numeric; base numeric; required numeric:=0; price numeric; person bigint;
 event_percent numeric; license_percent numeric; config public.commerce_config; parent public.calendar; selected public.calendar;
 reg public.event_registrations; target public.tournament_divisions; free_entries jsonb:='[]'; license_items jsonb:='[]'; license_total numeric:=0; quote jsonb; seen text[]:='{}'; key text;
begin
 select * into parent from public.calendar where id=p.event_id;
 if parent.id is null or nullif(address,'') is null or p.currency is distinct from 'ZAR' then raise exception 'Choose a valid event checkout.' using errcode='22023'; end if;
 if meta->>'source'<>'division_switch' and (coalesce(jsonb_typeof(meta->'covers'),'')<>'array' or jsonb_array_length(meta->'covers') not between 1 and 120) then
  raise exception 'Choose the entries or licences this payment covers.' using errcode='22023'; end if;
 if jsonb_typeof(coalesce(meta->'registration_rows','[]'))<>'array' or jsonb_array_length(coalesce(meta->'registration_rows','[]'))>120 or jsonb_typeof(coalesce(meta->'solo_link_updates','[]'))<>'array' or jsonb_array_length(coalesce(meta->'solo_link_updates','[]'))>120 then raise exception 'Choose valid checkout entries.'; end if;
 select * into config from public.commerce_config where id='default';
 if config.id is null then raise exception 'Checkout pricing is unavailable.'; end if;
 event_percent:=least(100,greatest(0,coalesce(config.event_fee_percent,0)));
 license_percent:=least(100,greatest(0,coalesce(config.license_fee_percent,0)));
 if meta->>'source'='division_switch' then
  select * into reg from public.event_registrations where id=(meta->>'registration_id')::uuid;
  select * into target from public.tournament_divisions where id=(meta->>'target_division_id')::uuid and event_id=p.event_id;
  if reg.id is null or target.id is null or reg.event_id<>p.event_id or lower(trim(reg.email)) is distinct from address or reg.payment_status is distinct from 'paid' then raise exception 'Choose your own paid entry and a valid division.' using errcode='42501'; end if;
  required:=greatest(0,private.current_entry_fee(p.event_id,target.id,target.name)-private.current_entry_fee(p.event_id,reg.division_id,reg.division));
 else
  for cover in select x.value from jsonb_array_elements(meta->'covers') x loop
   event:=coalesce(nullif(cover->>'event_id','')::bigint,p.event_id);
   select * into selected from public.calendar where id=event;
   if selected.id is null or (event<>p.event_id and not coalesce(parent.is_weekly and parent.series_id is not null and selected.series_id=parent.series_id,false)) then raise exception 'A payment cannot cover an unrelated event.' using errcode='42501'; end if;
   if nullif(trim(cover->>'email'),'') is null then raise exception 'Choose a valid player for every entry.'; end if;
   if lower(trim(cover->>'email'))<>address and not exists(select 1 from jsonb_array_elements(coalesce(meta->'registration_rows','[]')) r where lower(trim(r.value->>'email'))=lower(trim(cover->>'email')) and lower(trim(r.value->>'partner_email'))=address) and not exists(select 1 from public.event_registrations r where r.event_id=event and lower(trim(r.email))=lower(trim(cover->>'email')) and lower(trim(r.partner_email))=address and r.status is distinct from 'withdrawn') then raise exception 'Only your own entry or partner can be included.' using errcode='42501'; end if;
   key:=event||'|'||lower(trim(cover->>'email'))||'|'||coalesce(cover->>'type','')||'|'||coalesce(cover->>'division','');
   if key=any(seen) then raise exception 'An entry is duplicated in this payment.'; end if; seen:=array_append(seen,key);
   if cover->>'type'='entry' then
    division_name:=cover->>'division';chosen_division:=null;
    select nullif(r.value->>'division_id','')::uuid into chosen_division from jsonb_array_elements(coalesce(meta->'registration_rows','[]')) r
      where coalesce(nullif(r.value->>'event_id','')::bigint,p.event_id)=event and lower(trim(r.value->>'email'))=lower(trim(cover->>'email')) and r.value->>'division'=division_name limit 1;
    if chosen_division is null then select r.division_id into chosen_division from public.event_registrations r where r.event_id=event and lower(trim(r.email))=lower(trim(cover->>'email')) and r.division=division_name and r.status is distinct from 'withdrawn' order by r.created_at desc limit 1; end if;
    if not exists(select 1 from jsonb_array_elements(coalesce(meta->'registration_rows','[]')) r where coalesce(nullif(r.value->>'event_id','')::bigint,p.event_id)=event and lower(trim(r.value->>'email'))=lower(trim(cover->>'email')) and r.value->>'division'=division_name)
      and not exists(select 1 from public.event_registrations r where r.event_id=event and lower(trim(r.email))=lower(trim(cover->>'email')) and (r.division_id=chosen_division or r.division=division_name) and r.status is distinct from 'withdrawn') then raise exception 'A paid entry must match a registration.'; end if;
    if chosen_division is not null and not exists(select 1 from public.tournament_divisions d where d.id=chosen_division and d.event_id=event) then raise exception 'Choose a division from this event.'; end if;
    base:=private.current_entry_fee(event,chosen_division,division_name);
    if base is null or base<0 then raise exception 'Entry pricing is unavailable.'; end if;
    required:=required+round(base,2)+round(base*event_percent/100,2);
   elsif cover->>'type'='license' then
    select id into person from public.players where lower(trim(email))=lower(trim(cover->>'email')) order by id limit 1;
    if person is null then raise exception 'Choose a registered player for a SAPA licence.'; end if;
    if cover->>'license'='full' then
     quote:=public.full_license_quote(person,coalesce(nullif(cover->>'license_year','')::int,extract(year from parent.start_date)::int));
     if quote is null or not coalesce((quote->>'sales_open')::boolean,false) then raise exception 'Annual licence sales are unavailable.'; end if;
     price:=(quote->>'price')::numeric;
    elsif cover->>'license'='temporary' and config.temp_license_enabled and parent.allow_temporary_license is distinct from false then price:=config.temp_license_price;
    else raise exception 'Choose an available SAPA licence.'; end if;
    if price is null or price<0 then raise exception 'Licence pricing is unavailable.'; end if;
    price:=round(price,2)+round(price*license_percent/100,2);required:=required+price;license_total:=license_total+price;
    license_items:=license_items||jsonb_build_array(cover||jsonb_build_object('event_id',event,'amount',price));
   else raise exception 'Choose valid payment items.'; end if;
  end loop;
 end if;
 for item in select r.value from jsonb_array_elements(coalesce(meta->'registration_rows','[]')) r loop
  event:=coalesce(nullif(item->>'event_id','')::bigint,p.event_id);
  select * into selected from public.calendar where id=event;
  if selected.id is null or (event<>p.event_id and not coalesce(parent.is_weekly and parent.series_id is not null and selected.series_id=parent.series_id,false)) then raise exception 'A registration cannot belong to an unrelated event.' using errcode='42501'; end if;
  if lower(trim(item->>'email')) is distinct from address and lower(trim(item->>'partner_email')) is distinct from address then raise exception 'Only your own entry and its partner can be included.' using errcode='42501'; end if;
  if item->>'registered_by' is not null and lower(trim(item->>'registered_by'))<>address and not exists(select 1 from public.event_registrations r where r.event_id=event and lower(trim(r.email))=lower(trim(item->>'email')) and lower(trim(r.registered_by))=lower(trim(item->>'registered_by')) and r.status is distinct from 'withdrawn') then raise exception 'Registration ownership cannot change.' using errcode='42501'; end if;
  base:=private.current_entry_fee(event,nullif(item->>'division_id','')::uuid,item->>'division');
  if base=0 then free_entries:=free_entries||jsonb_build_array(jsonb_build_object('event_id',event,'email',lower(trim(item->>'email')),'division',item->>'division')); end if;
 end loop;
 for link in select l.value from jsonb_array_elements(coalesce(meta->'solo_link_updates','[]')) l loop
  select * into reg from public.event_registrations where id=(link->>'id')::uuid;
  if reg.id is null or reg.event_id<>p.event_id or (lower(trim(reg.email)) is distinct from address and lower(trim(reg.partner_email)) is distinct from address
    and not(reg.partner_email is null and lower(trim(link->>'partner_email'))=address and exists(select 1 from jsonb_array_elements(coalesce(meta->'registration_rows','[]')) r where lower(trim(r.value->>'email'))=address and lower(trim(r.value->>'partner_email'))=lower(trim(reg.email))))) then raise exception 'A partner link does not belong to this checkout.' using errcode='42501'; end if;
 end loop;
 if p.amount is null or p.amount+0.01<required or required<=0 then raise exception 'The payment amount does not match current checkout pricing.' using errcode='22023'; end if;
 return jsonb_build_object('required',required,'free_entries',free_entries,'license_amount',license_total,'license_items',license_items);
end $$;

-- Identity compatibility hooks; the later privacy cutover replaces these with
-- private reference resolvers without replacing financial validation.
create function private.canonical_checkout_contacts(p_value jsonb,p_event bigint) returns jsonb language sql immutable set search_path='' as $$select p_value$$;
create function private.canonical_entry_contact(p_value text,p_event bigint) returns text language sql immutable set search_path='' as $$select p_value$$;

create table private.security_release_state(id boolean primary key default true check(id),integrity_enabled boolean not null default false);
alter table private.security_release_state enable row level security;
revoke all on private.security_release_state from public,anon,authenticated,service_role;
insert into private.security_release_state(id) values(true);

create function private.guard_payment_integrity() returns trigger
language plpgsql security definer set search_path='' as $$
declare trusted boolean:=private.worker_write() or coalesce(private.finance_event(new.event_id),false)
 or (private.permission_actor_active() and new.payment_type in('membership','full_license','temp_license') and public.can_manage_licenses());
 address text:=lower(auth.email()); actor_player bigint; receipt private.event_checkout_security_quotes; calculated jsonb; fingerprint bytea; split_total numeric; split_covers jsonb;
begin
 if not (select integrity_enabled from private.security_release_state where id) then return new; end if;
 new.metadata:=private.canonical_checkout_contacts(new.metadata,new.event_id);
 if tg_op='INSERT' and new.metadata->>'source'='manual_event' and new.status in('pending','processing') then new.metadata:=new.metadata-'registrations_persisted'-'split_recorded'-'server_free_entries'-'server_license_items'; end if;
 if not trusted then
  if not private.permission_actor_active() then raise exception 'Sign in before saving a payment.' using errcode='42501'; end if;
  if tg_op='INSERT' then
   select id into actor_player from public.players where lower(trim(email))=address order by id limit 1;
   if lower(trim(new.metadata->>'registrant_email')) is distinct from address or (new.player_id is not null and new.player_id is distinct from actor_player)
     or new.status is null or new.status not in('pending','processing') or (coalesce(new.is_test,false) and not public.is_super_admin(address)) or new.amount is null or new.amount<0 then
    raise exception 'Only verified checkout or an authorised administrator can record paid entries.' using errcode='42501'; end if;
   new.created_at:=clock_timestamp();
   new.metadata:=coalesce(new.metadata,'{}')-'registrations_persisted'-'license_split_done'-'split_recorded'-'server_free_entries'-'server_license_items'-'native_authorization_url';
  elsif (to_jsonb(new)-'status') is distinct from (to_jsonb(old)-'status') or old.status not in('pending','processing','abandoned','cancelled') or new.status not in('abandoned','cancelled',old.status) then
   raise exception 'Payment details are managed by verified checkout.' using errcode='42501';
  end if;
 end if;
 if new.payment_type='event_entry_fee' and new.payment_method='paystack' and new.metadata->>'source' in('manual_event','division_switch') and new.status in('pending','processing','success') then
  fingerprint:=sha256(convert_to(private.checkout_cart(new)::text,'UTF8'));
  select * into receipt from private.event_checkout_security_quotes where payment_id=new.id;
  if receipt.payment_id is null then
   calculated:=private.validate_event_checkout(new);
   insert into private.event_checkout_security_quotes(payment_id,cart_hash,required_amount,original_amount,currency,is_test,free_entries,license_amount,license_items)
    values(new.id,fingerprint,(calculated->>'required')::numeric,new.amount,new.currency,coalesce(new.is_test,false),calculated->'free_entries',(calculated->>'license_amount')::numeric,calculated->'license_items');
   new.metadata:=new.metadata||jsonb_build_object('server_free_entries',calculated->'free_entries','server_license_items',calculated->'license_items');
  elsif receipt.cart_hash is distinct from fingerprint then
   if tg_op='UPDATE' and private.worker_write() and old.status='success' and new.status='success' and not coalesce((old.metadata->>'split_recorded')::boolean,false) and coalesce((new.metadata->>'split_recorded')::boolean,false) and receipt.license_amount>0 and new.amount=old.amount-receipt.license_amount
    and (to_jsonb(new)-array['metadata','amount'])=(to_jsonb(old)-array['metadata','amount'])
    and (new.metadata-array['covers','split_recorded','server_free_entries','server_license_items'])=(old.metadata-array['covers','split_recorded','server_free_entries','server_license_items']) then
     select coalesce(sum(child.amount),0) into split_total from public.payments child where child.metadata->>'parent_reference'=new.reference and child.status='success' and child.currency=new.currency and child.is_test is not distinct from new.is_test;
     if split_total<>receipt.license_amount or (new.metadata->'covers') is distinct from (select coalesce(jsonb_agg(c.value),'[]') from jsonb_array_elements(old.metadata->'covers') c where c.value->>'type'<>'license') then raise exception 'The licence split does not match the verified checkout.'; end if;
     update private.event_checkout_security_quotes set cart_hash=fingerprint where payment_id=new.id;
   else raise exception 'This checkout changed. Start a new payment review.' using errcode='22023'; end if;
   new.metadata:=new.metadata||jsonb_build_object('server_free_entries',receipt.free_entries,'server_license_items',receipt.license_items);
  else new.metadata:=new.metadata||jsonb_build_object('server_free_entries',receipt.free_entries,'server_license_items',receipt.license_items); end if;
 end if;
 return new;
end $$;
-- Quotes are written from a BEFORE trigger; postpone FK checking until the
-- payment insert itself has completed in this transaction.
alter table private.event_checkout_security_quotes drop constraint event_checkout_security_quotes_payment_id_fkey;
alter table private.event_checkout_security_quotes add foreign key(payment_id) references public.payments(id) on delete cascade deferrable initially deferred;
create trigger guard_payment_integrity before insert or update on public.payments for each row execute function private.guard_payment_integrity();

create function private.guard_registration_integrity() returns trigger
language plpgsql security definer set search_path='' as $$
declare address text:=lower(auth.email()); fee numeric; trusted boolean:=private.worker_write() or coalesce(private.finance_event(new.event_id),false);
begin
 if not (select integrity_enabled from private.security_release_state where id) then return new; end if;
 new.email:=private.canonical_entry_contact(new.email,new.event_id);new.partner_email:=private.canonical_entry_contact(new.partner_email,new.event_id);new.registered_by:=private.canonical_entry_contact(new.registered_by,new.event_id);
 if not trusted then
  if not private.permission_actor_active() then raise exception 'Sign in before changing an entry.' using errcode='42501'; end if;
  if tg_op='INSERT' then
   if lower(trim(new.email)) is distinct from address and lower(trim(new.registered_by)) is distinct from address then raise exception 'You can only create entries for your own registration.' using errcode='42501'; end if;
   new.created_at:=clock_timestamp();new.pay_token:=gen_random_uuid();
   new.registered_by:=coalesce(new.registered_by,address);
   if lower(trim(new.registered_by))<>address or (coalesce(new.is_test,false) and not public.is_super_admin(address)) or coalesce(new.refund_amount,0)<>0 or new.refunded_at is not null or coalesce(new.whatsapp_added,false) then raise exception 'Only the event team can set administrative entry details.' using errcode='42501'; end if;
   if new.payment_status is null or new.payment_status not in('pending','unpaid','paid') then raise exception 'Choose a valid entry payment status.' using errcode='42501'; end if;
  else
   if new.id is distinct from old.id or new.event_id is distinct from old.event_id or new.email is distinct from old.email or new.registered_by is distinct from old.registered_by or new.created_at is distinct from old.created_at or new.is_test is distinct from old.is_test or new.pay_token is distinct from old.pay_token or new.refunded_at is distinct from old.refunded_at or new.refund_amount is distinct from old.refund_amount or new.whatsapp_added is distinct from old.whatsapp_added then raise exception 'Only the event team can change registration ownership or financial history.' using errcode='42501'; end if;
   if lower(old.email)<>address then new.phone:=old.phone; end if;
   if old.payment_status='paid' and (new.payment_status is distinct from old.payment_status or new.payment_method is distinct from old.payment_method) then raise exception 'Only the event team can reverse a paid entry.' using errcode='42501'; end if;
   if old.payment_status='paid' and (new.division_id is distinct from old.division_id or new.division is distinct from old.division) and private.current_entry_fee(new.event_id,new.division_id,new.division)>private.current_entry_fee(old.event_id,old.division_id,old.division) then raise exception 'Pay the division difference through checkout before moving.' using errcode='42501'; end if;
  end if;
  if tg_op='UPDATE' and new.payment_status is distinct from old.payment_status and new.payment_status not in('pending','unpaid','failed','paid') then raise exception 'Only the event team can record refunds.' using errcode='42501'; end if;
  fee:=private.current_entry_fee(new.event_id,new.division_id,new.division);
  if new.payment_status='paid' and (tg_op='INSERT' or old.payment_status is distinct from 'paid') and coalesce(fee,0)<>0 then raise exception 'Only a verified payment or the event team can mark this entry paid.' using errcode='42501'; end if;
 end if;
 -- Partner badges are derived from actual entries for all callers, including workers.
 if new.partner_email is null then new.partner_payment_status:=null;
 else select coalesce((select r.payment_status from public.event_registrations r where r.event_id=new.event_id and (r.division_id=new.division_id or ((r.division_id is null or new.division_id is null) and lower(trim(r.division))=lower(trim(new.division)))) and lower(trim(r.email))=lower(trim(new.partner_email)) and r.status is distinct from 'withdrawn' order by (r.payment_status='paid') desc,r.created_at desc limit 1),'pending') into new.partner_payment_status; end if;
 return new;
end $$;
create trigger guard_registration_integrity before insert or update on public.event_registrations for each row execute function private.guard_registration_integrity();

create function private.sync_registration_partner_status() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if pg_trigger_depth()>1 then return new; end if;
 update public.event_registrations r set partner_payment_status=case when new.status='withdrawn' then 'pending' else new.payment_status end
 where r.event_id=new.event_id and lower(trim(r.partner_email))=lower(trim(new.email))
 and (r.division_id=new.division_id or ((r.division_id is null or new.division_id is null) and lower(trim(r.division))=lower(trim(new.division))))
 and r.status is distinct from 'withdrawn' and r.partner_payment_status is distinct from case when new.status='withdrawn' then 'pending' else new.payment_status end;
 return new;
end $$;
create trigger sync_registration_partner_status after insert or update of payment_status,status,partner_email on public.event_registrations for each row execute function private.sync_registration_partner_status();

create function private.guard_player_server_fields() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not (select integrity_enabled from private.security_release_state where id) then return new; end if;
 if private.worker_write() or private.admin_module('players') then return new; end if;
 if new.id is distinct from old.id or new.email is distinct from old.email or new.approved is distinct from old.approved or new.points is distinct from old.points or new.rank_label is distinct from old.rank_label or new.rankings is distinct from old.rankings or new.win_rate is distinct from old.win_rate or new.match_form is distinct from old.match_form or new.skill_rating is distinct from old.skill_rating or new.account_type is distinct from old.account_type then raise exception 'Ranking and account status are managed by 4M Padel.' using errcode='42501'; end if;
 return new;
end $$;
create trigger guard_player_server_fields before update on public.players for each row execute function private.guard_player_server_fields();
revoke all on function private.finance_event(bigint),private.worker_write(),private.current_entry_fee(bigint,uuid,text),private.checkout_cart(public.payments),private.validate_event_checkout(public.payments),private.guard_payment_integrity(),private.guard_registration_integrity(),private.sync_registration_partner_status(),private.guard_player_server_fields(),private.canonical_checkout_contacts(jsonb,bigint),private.canonical_entry_contact(text,bigint) from public,anon,authenticated,service_role;
-- This boolean helper is evaluated by authenticated RLS policies; its schema
-- stays unexposed and it returns only the caller's own permission decision.
grant execute on function private.finance_event(bigint) to authenticated;
-- Exact identities close wildcard-email policy bypasses while retaining the
-- current table API and team/registrant reads until the privacy cutover.
create policy security_exact_registration_read on public.event_registrations as restrictive for select to authenticated using(private.permission_actor_active() and (private.finance_event(event_id) or lower(trim(email))=lower(auth.email()) or lower(trim(partner_email))=lower(auth.email()) or lower(trim(registered_by))=lower(auth.email())));
create policy security_exact_registration_update on public.event_registrations as restrictive for update to authenticated using(private.permission_actor_active() and (private.finance_event(event_id) or lower(trim(email))=lower(auth.email()) or lower(trim(partner_email))=lower(auth.email()) or lower(trim(registered_by))=lower(auth.email()))) with check(private.permission_actor_active() and (private.finance_event(event_id) or lower(trim(email))=lower(auth.email()) or lower(trim(partner_email))=lower(auth.email()) or lower(trim(registered_by))=lower(auth.email())));
create policy security_exact_payment_read on public.payments as restrictive for select to authenticated using(private.permission_actor_active() and (private.finance_event(event_id) or player_id=(select p.id from public.players p where lower(trim(p.email))=lower(auth.email()) order by p.id limit 1) or lower(trim(metadata->>'email'))=lower(auth.email()) or lower(trim(metadata->>'registrant_email'))=lower(auth.email())));
create policy security_exact_payment_update on public.payments as restrictive for update to authenticated using(private.permission_actor_active() and (private.finance_event(event_id) or player_id=(select p.id from public.players p where lower(trim(p.email))=lower(auth.email()) order by p.id limit 1) or lower(trim(metadata->>'email'))=lower(auth.email()) or lower(trim(metadata->>'registrant_email'))=lower(auth.email()))) with check(private.permission_actor_active() and (private.finance_event(event_id) or player_id=(select p.id from public.players p where lower(trim(p.email))=lower(auth.email()) order by p.id limit 1) or lower(trim(metadata->>'email'))=lower(auth.email()) or lower(trim(metadata->>'registrant_email'))=lower(auth.email())));
create policy security_scoped_payment_admin on public.payments for all to authenticated using(private.finance_event(event_id)) with check(private.finance_event(event_id));
create policy security_scoped_registration_finance_read on public.event_registrations for select to authenticated using(private.finance_event(event_id));
create policy security_scoped_registration_finance_update on public.event_registrations for update to authenticated using(private.finance_event(event_id)) with check(private.finance_event(event_id));

create function public.payment_verification_context(p_reference text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.payments; q private.event_checkout_security_quotes; total numeric;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Server verification only.' using errcode='42501'; end if;
 select * into p from public.payments where reference=p_reference;
 if p.id is null then raise exception 'Checkout not found.' using errcode='22023'; end if;
 select * into q from private.event_checkout_security_quotes where payment_id=p.id;
 total:=coalesce(q.original_amount,p.amount+case when coalesce((p.metadata->>'split_recorded')::boolean,false) then coalesce((select sum(child.amount) from public.payments child where child.metadata->>'parent_reference'=p.reference and child.status='success' and child.currency=p.currency),0) else 0 end);
 return jsonb_build_object('reference',p.reference,'amount',total,'currency',p.currency,'is_test',p.is_test);
end $$;
revoke all on function public.payment_verification_context(text) from public,anon,authenticated,service_role;
grant execute on function public.payment_verification_context(text) to service_role;
-- Maintain the legacy roster from a persisted entry, never a client-supplied
-- paid flag. This keeps older free/register-only clients working after the
-- unrestricted participant RPC is closed.
create function private.sync_verified_registration_participant() returns trigger
language plpgsql security definer set search_path='' as $$
declare participant uuid; profile bigint; candidates integer;
begin
 if not exists(select 1 from public.calendar c where c.id=new.event_id and c.is_manual is not true) or nullif(trim(new.full_name),'') is null then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended('registration-roster:'||new.event_id||':'||lower(trim(new.email)),0));
 select p.id into participant from public.tournament_participants p where p.event_id=new.event_id and p.metadata->>'registration_id'=new.id::text order by p.id limit 1;
 if participant is null then
  select count(*),min(p.id::text)::uuid into candidates,participant from public.tournament_participants p
  where p.event_id=new.event_id and lower(trim(p.class_name))=lower(trim(new.division))
   and (lower(trim(p.email))=lower(trim(new.email)) or (p.email is null and lower(trim(p.full_name))=lower(trim(new.full_name))));
  if candidates<>1 then participant:=null; end if;
 end if;
 if new.status='withdrawn' then
  delete from public.tournament_participants p where p.id=participant and p.metadata->>'source'='event_registration';
  return new;
 end if;
 select p.id into profile from public.players p where lower(trim(p.email))=lower(trim(new.email)) order by p.id limit 1;
 if participant is null then
  insert into public.tournament_participants(event_id,full_name,email,class_name,profile_id,is_paid,is_test,last_synced_at,metadata)
  values(new.event_id,new.full_name,new.email,new.division,profile,new.payment_status='paid',coalesce(new.is_test,false),now(),jsonb_build_object('source','event_registration','registration_id',new.id));
 else
  update public.tournament_participants p set full_name=new.full_name,email=new.email,class_name=new.division,profile_id=coalesce(profile,p.profile_id),is_paid=(new.payment_status='paid'),last_synced_at=now(),metadata=coalesce(p.metadata,'{}')||jsonb_build_object('registration_id',new.id)
  where p.id=participant;
 end if;
 return new;
end $$;
revoke all on function private.sync_verified_registration_participant() from public,anon,authenticated,service_role;
create trigger sync_verified_registration_participant after insert or update of payment_status,status,full_name,email,division,division_id on public.event_registrations for each row execute function private.sync_verified_registration_participant();

-- An email is an identity, never an ILIKE pattern. Preserve manager access to
-- participants in their assigned events and ordinary self-profile reads.
create policy security_exact_profile_read on public.players as restrictive for select to authenticated
 using(private.permission_actor_active() and (lower(trim(email))=lower(auth.email()) or public.is_super_admin(auth.email()) or lower(email) in(select private.managed_event_player_emails())));

notify pgrst,'reload schema';
commit;
