\set ON_ERROR_STOP on
do $$ begin
  if current_database()<>'fourm_admin_registry_profile_test' or to_regclass('public.calendar') is not null
    or exists(select 1 from pg_namespace where nspname in ('auth','private')) then
    raise exception 'Use an empty disposable fourm_admin_registry_profile_test database.';
  end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create schema auth;
create schema private;
grant usage on schema private to authenticated;
create function auth.email() returns text language sql stable as $$ select current_setting('fixture.email',true) $$;
create function private.permission_actor_active() returns boolean language sql stable as
  $$ select current_setting('fixture.active',true)='yes' $$;
create function public.is_super_admin(email text) returns boolean language sql stable as
  $$ select email='platform@example.invalid' $$;
create function public.can_manage_event(event_id bigint) returns boolean language sql stable as $$
  select public.is_super_admin(auth.email()) or (event_id=11 and auth.email()='owner@example.invalid')
$$;
create function private.finance_event(event_id bigint) returns boolean language sql stable as
  $$ select private.permission_actor_active() and public.can_manage_event(event_id) $$;
create table public.calendar (
  id bigint primary key,organisation_id uuid,club_id uuid,is_manual boolean,event_status text,cancelled_at timestamptz
);
create table public.players (id bigint primary key,name text,email text);
create table public.event_registrations (
  id uuid primary key,event_id bigint references public.calendar,division_id uuid,division text,full_name text,email text,
  status text,payment_status text,payment_method text,withdrawn_at timestamptz,refunded_at timestamptz,refund_amount numeric,
  partner_email text,pay_token uuid default gen_random_uuid(),check (payment_method <> 'cash' or full_name <> 'Late failure')
);
create table public.payments (
  id uuid primary key,event_id bigint references public.calendar,amount numeric,
  status text,payment_type text,payment_method text,reference text,metadata jsonb
);
create table private.event_checkout_security_quotes (payment_id uuid primary key references public.payments);
create table public.payment_refunds (
  id uuid primary key default gen_random_uuid(),event_registration_id uuid references public.event_registrations,
  payment_id uuid references public.payments,status text
);
create table public.draws (id uuid primary key,event_id bigint references public.calendar,division_id uuid,status text);
create table public.draw_entries (draw_id uuid references public.draws,source_registration_id uuid references public.event_registrations);
create table public.event_activity_log (event_id bigint,actor_email text,actor_role text,action text,category text,summary text,details jsonb);
create function public._insert_event_activity(bigint,text,text,text,text,text,jsonb) returns void language sql as
  $$ insert into public.event_activity_log values($1,$2,$3,$4,$5,$6,$7) $$;
\ir ../mobile/supabase/migrations/20261111083129_correct_paid_manual_event_payment_method.sql
\ir ../supabase/migrations/20261120053234_admin_registry_profile_and_withdrawn_receipt.sql

insert into public.calendar values
  (11,'10000000-0000-0000-0000-000000000001',null,true,'published',null),
  (12,'10000000-0000-0000-0000-000000000002',null,true,'published',null),
  (13,null,null,false,'published',null);
insert into public.players values (5,'Canonical Player','PLAYER@example.invalid'),(6,'Other Player','other@example.invalid');
insert into public.event_registrations (id,event_id,division_id,division,full_name,email,status,payment_status,payment_method,withdrawn_at,partner_email) values
  ('20000000-0000-0000-0000-000000000001',11,'30000000-0000-0000-0000-000000000001','Open','Typo','player@example.invalid','registered','paid','manual',null,'partner@example.invalid'),
  ('20000000-0000-0000-0000-000000000002',11,'30000000-0000-0000-0000-000000000001','Open','Late failure','player@example.invalid','withdrawn','paid','manual','2026-11-01Z','partner@example.invalid'),
  ('20000000-0000-0000-0000-000000000003',12,'30000000-0000-0000-0000-000000000002','Open','Foreign player','player@example.invalid','withdrawn','paid','manual','2026-11-01Z',null);
insert into public.payments values
  ('40000000-0000-0000-0000-000000000001',11,120,'success','event_entry_fee','manual','Manual fixture',
    '{"registration_id":"20000000-0000-0000-0000-000000000002","source":"manual_event_admin","collection_recipient":"organiser","note":"Old note","ledger_identity":"retain"}'),
  ('40000000-0000-0000-0000-000000000002',11,120,'success','event_entry_fee','paystack','Provider fixture',
    '{"registration_id":"20000000-0000-0000-0000-000000000002","source":"manual_event"}'),
  ('40000000-0000-0000-0000-000000000003',12,120,'success','event_entry_fee','manual','Foreign fixture',
    '{"registration_id":"20000000-0000-0000-0000-000000000003","source":"manual_event_admin"}');
insert into private.event_checkout_security_quotes values ('40000000-0000-0000-0000-000000000002');

create function pg_temp.rejects(statement text,message text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if position(message in sqlerrm)>0 then return; end if;
    raise exception 'Expected %; received %',message,sqlerrm;
  end;
  raise exception 'Expected rejection: %',message;
end $$;

do $$
declare
  active_entry constant uuid:='20000000-0000-0000-0000-000000000001';
  withdrawn_entry constant uuid:='20000000-0000-0000-0000-000000000002';
  foreign_entry constant uuid:='20000000-0000-0000-0000-000000000003';
  manual_pay constant uuid:='40000000-0000-0000-0000-000000000001';
  provider_pay constant uuid:='40000000-0000-0000-0000-000000000002';
  foreign_pay constant uuid:='40000000-0000-0000-0000-000000000003';
  scope constant text:='org:10000000-0000-0000-0000-000000000001';
  profile_review jsonb:='{"entry_name":"Typo","entry_email":"player@example.invalid","profile_name":"Canonical Player","profile_email":"PLAYER@example.invalid","division":"Open","division_id":"30000000-0000-0000-0000-000000000001"}';
  receipt_review jsonb;
  profile_call text;
  receipt_call text;
  old_registration jsonb;
  provider jsonb;
  result jsonb;
begin
  assert has_function_privilege('authenticated','public.admin_align_registration_profile_name(bigint,uuid,bigint,text,jsonb)','execute');
  assert has_function_privilege('authenticated','public.admin_correct_withdrawn_registration_receipt(bigint,uuid,uuid,text,text,text,jsonb)','execute');
  assert not has_function_privilege('anon','public.admin_align_registration_profile_name(bigint,uuid,bigint,text,jsonb)','execute');
  assert not has_function_privilege('service_role','public.admin_correct_withdrawn_registration_receipt(bigint,uuid,uuid,text,text,text,jsonb)','execute');
  select to_jsonb(r) into old_registration from public.event_registrations r where id=active_entry;
  profile_call := format('select public.admin_align_registration_profile_name(11,%L,5,%L,%L)',active_entry,scope,profile_review);
  perform set_config('fixture.active','yes',true);
  perform set_config('fixture.email','other@example.invalid',true);
  perform pg_temp.rejects(profile_call,'Current Event Manager access');
  perform set_config('fixture.email','owner@example.invalid',true);
  perform pg_temp.rejects(format('select public.admin_align_registration_profile_name(11,%L,6,%L,%L)',active_entry,scope,profile_review),'same email is required');
  perform pg_temp.rejects(format('select public.admin_align_registration_profile_name(11,%L,5,%L,%L)',active_entry,'org:wrong',profile_review),'active event in this workspace');
  perform pg_temp.rejects(format('select public.admin_align_registration_profile_name(11,%L,5,%L,%L)',foreign_entry,scope,profile_review),'active registration in this event');
  perform pg_temp.rejects(format('select public.admin_align_registration_profile_name(11,%L,5,%L,%L)',withdrawn_entry,scope,profile_review),'active registration in this event');
  update public.players set name='Changed profile' where id=5;
  perform pg_temp.rejects(profile_call,'registration or profile changed');
  update public.players set name='Canonical Player' where id=5;
  insert into public.players values (7,'Duplicate','player@example.invalid');
  perform pg_temp.rejects(profile_call,'unique player profile');
  delete from public.players where id=7;
  insert into public.draws values ('50000000-0000-0000-0000-000000000001',11,'30000000-0000-0000-0000-000000000001','published');
  perform pg_temp.rejects(profile_call,'active draw');
  update public.draws set status='archived';
  set local role authenticated;
  result := public.admin_align_registration_profile_name(11,active_entry,5,scope,profile_review);
  reset role;
  assert result->>'full_name'='Canonical Player';
  assert (select to_jsonb(r)-'full_name'=old_registration-'full_name' from public.event_registrations r where id=active_entry);
  assert (select count(*)=1 from public.event_activity_log where action='admin.linked_profile');

  select to_jsonb(p) into provider from public.payments p where id=provider_pay;
  select jsonb_build_object('full_name',r.full_name,'email',r.email,'entry_method',r.payment_method,
    'amount',p.amount,'method',p.payment_method,'reference',p.reference,'metadata',p.metadata)
    into receipt_review from public.event_registrations r join public.payments p on p.id=manual_pay where r.id=withdrawn_entry;
  receipt_call := format('select public.admin_correct_withdrawn_registration_receipt(11,%L,%L,%L,%L,%L,%L)',
    withdrawn_entry,manual_pay,'cash','4m','Corrected fixture',receipt_review);
  perform pg_temp.rejects(receipt_call,'Current platform super-admin access');
  perform set_config('fixture.email','platform@example.invalid',true);
  perform pg_temp.rejects(format('select public.admin_correct_withdrawn_registration_receipt(11,%L,%L,%L,%L,%L,%L)',
    withdrawn_entry,provider_pay,'cash','4m','Corrected fixture',receipt_review),'successful manual receipt');
  perform pg_temp.rejects(format('select public.admin_correct_withdrawn_registration_receipt(11,%L,%L,%L,%L,%L,%L)',
    withdrawn_entry,foreign_pay,'cash','4m','Corrected fixture',receipt_review),'successful manual receipt');
  insert into public.payment_refunds(event_registration_id,payment_id,status) values (withdrawn_entry,manual_pay,'processing');
  perform pg_temp.rejects(receipt_call,'refund record');
  update public.payment_refunds set status='failed';
  update public.payments set metadata=metadata||'{"note":"Changed already"}' where id=manual_pay;
  perform pg_temp.rejects(receipt_call,'registration or receipt changed');
  update public.payments set metadata=receipt_review->'metadata' where id=manual_pay;
  begin
    perform public.admin_correct_withdrawn_registration_receipt(11,withdrawn_entry,manual_pay,'cash','4m','Corrected fixture',receipt_review);
    raise exception 'Expected rollback after receipt update';
  exception when check_violation then null; end;
  assert (select payment_method='manual' and metadata->>'note'='Old note' from public.payments where id=manual_pay);
  assert (select payment_method='manual' and status='withdrawn' from public.event_registrations where id=withdrawn_entry);
  select to_jsonb(r) into old_registration from public.event_registrations r where id=withdrawn_entry;
  set local role authenticated;
  result := public.admin_correct_withdrawn_registration_receipt(11,withdrawn_entry,manual_pay,'eft','4m','Verified EFT',receipt_review);
  reset role;
  assert result->>'paymentId'=manual_pay::text and result->>'method'='eft';
  assert (select payment_method='eft' and to_jsonb(r)-'payment_method'=old_registration-'payment_method'
    from public.event_registrations r where id=withdrawn_entry);
  assert (select amount=120 and status='success' and metadata->>'ledger_identity'='retain' and metadata->>'note'='Verified EFT'
    from public.payments where id=manual_pay);
  assert (select to_jsonb(p)=provider from public.payments p where id=provider_pay);
  assert (select count(*)=1 from public.event_activity_log where action='payment.method_corrected');
  perform pg_temp.rejects(receipt_call,'registration or receipt changed');
end $$;
