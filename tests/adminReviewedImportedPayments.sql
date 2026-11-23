\set ON_ERROR_STOP on
do $$ begin
  if current_database()<>'fourm_admin_imported_payment_test' or to_regclass('public.calendar') is not null
    or exists(select 1 from pg_namespace where nspname in ('auth','private')) then
    raise exception 'Use an empty disposable fourm_admin_imported_payment_test database.';
  end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create schema auth;
create schema private;
grant usage on schema private to authenticated;
create function auth.email() returns text language sql stable as $$ select current_setting('fixture.email',true) $$;
create function auth.uid() returns uuid language sql stable as $$ select md5(auth.email())::uuid $$;
create function private.permission_actor_active() returns boolean language sql stable as
  $$ select current_setting('fixture.active',true)='yes' $$;
create function public.is_super_admin(email text) returns boolean language sql stable as
  $$ select email='platform@example.invalid' $$;
create table public.players (id bigint primary key,email text);
create table public.calendar (
  id bigint primary key,organisation_id uuid,club_id uuid,is_manual boolean,event_name text,
  entry_fee numeric,event_status text,cancelled_at timestamptz
);
create table public.tournament_participants (
  id uuid primary key,event_id bigint references public.calendar,rankedin_participant_id text,full_name text,email text,
  class_name text, profile_id bigint references public.players,is_paid boolean default false,is_test boolean default false,
  metadata jsonb default '{}',
  check (full_name <> 'Correction rollback' or is_paid is true)
);
create table public.tournament_divisions (
  id uuid primary key, event_id bigint references public.calendar, name text, cancelled_at timestamptz
);
create table public.event_registrations (
  id uuid primary key,event_id bigint references public.calendar,division_id uuid references public.tournament_divisions,
  division text,full_name text,email text,status text,payment_status text,payment_method text,
  is_test boolean default false,withdrawn_at timestamptz,refunded_at timestamptz,refund_amount numeric
);
create table public.payments (
  id uuid primary key default gen_random_uuid(),event_id bigint references public.calendar,player_id bigint references public.players,
  amount numeric,currency text default 'ZAR',status text,payment_type text,payment_method text,reference text unique,
  metadata jsonb default '{}',is_test boolean default false
);
create table private.event_checkout_security_quotes (payment_id uuid primary key references public.payments);
\ir ../supabase/migrations/20261120023944_admin_reviewed_imported_participant_payment.sql

insert into public.players values (7,'player@example.invalid');
insert into public.calendar values
  (11,'10000000-0000-0000-0000-000000000001',null,false,'Imported cup',120,'published',null),
  (12,'10000000-0000-0000-0000-000000000002',null,false,'Foreign event',400,'published',null),
  (13,null,null,true,'Hosted event',400,'published',null),
  (14,null,null,false,'Cancelled event',400,'cancelled',now()),
  (15,null,null,false,'Free event',null,'published',null);
insert into public.tournament_divisions values
  ('40000000-0000-0000-0000-000000000001',11,'Mixed Open',null),
  ('40000000-0000-0000-0000-000000000002',11,'Cancelled division',now());
insert into public.event_registrations (id,event_id,division_id,division,full_name,email,status,payment_status,payment_method,withdrawn_at) values
  ('20000000-0000-0000-0000-000000000001',11,'40000000-0000-0000-0000-000000000001','Mixed Open','Fixture Player','player@example.invalid','registered','paid','manual',null),
  ('20000000-0000-0000-0000-000000000002',11,null,'Mixed Open','Fixture Player','other@example.invalid','registered','paid','manual',null),
  ('20000000-0000-0000-0000-000000000003',11,null,'Withdrawn','Fixture Player','player@example.invalid','withdrawn','paid','manual',now()),
  ('20000000-0000-0000-0000-000000000004',12,null,'Mixed Open','Fixture Player','player@example.invalid','registered','paid','manual',null);
insert into public.tournament_participants (id,event_id,rankedin_participant_id,full_name,email,class_name,profile_id,is_paid,is_test,metadata) values
  ('30000000-0000-0000-0000-000000000001',11,'010','Fixture Player','player@example.invalid','Mixed Open',7,false,false,'{"unrelated":"retain"}'),
  ('30000000-0000-0000-0000-000000000002',11,'020','Correction rollback','player@example.invalid','Mixed Open',7,true,false,'{"payment_method":"manual","registration_id":"20000000-0000-0000-0000-000000000001"}'),
  ('30000000-0000-0000-0000-000000000003',11,'030','Provider-backed','player@example.invalid','Mixed Open',7,true,false,'{"payment_method":"paystack"}'),
  ('30000000-0000-0000-0000-000000000004',11,'040','Withdrawn','player@example.invalid','Withdrawn',7,true,false,'{"registration_id":"20000000-0000-0000-0000-000000000003"}'),
  ('30000000-0000-0000-0000-000000000005',11,'050','Cancelled','player@example.invalid','Cancelled division',7,false,false,'{}'),
  ('30000000-0000-0000-0000-000000000006',11,'060','Legacy flag','player@example.invalid','Mixed Open',7,true,false,'{"payment_method":"manual"}'),
  ('30000000-0000-0000-0000-000000000007',11,'070','Conflicting event','player@example.invalid','Mixed Open',7,false,false,'{"registration_id":"20000000-0000-0000-0000-000000000004"}'),
  ('30000000-0000-0000-0000-000000000008',11,null,'Registration-only','player@example.invalid','Mixed Open',7,false,false,'{}'),
  ('30000000-0000-0000-0000-000000000009',12,'090','Other event','player@example.invalid','Mixed Open',7,true,false,'{"payment_method":"manual"}'),
  ('30000000-0000-0000-0000-000000000010',14,'100','Cancelled event','player@example.invalid','Mixed Open',7,false,false,'{}'),
  ('30000000-0000-0000-0000-000000000011',15,'110','Free test',null,'Mixed Open',null,false,true,'{}');
insert into public.payments (id,event_id,player_id,amount,status,payment_type,payment_method,reference,metadata) values
  ('50000000-0000-0000-0000-000000000001',11,7,120,'success','event_entry_fee','manual','MANUAL-RANKEDIN-fixture',
   '{"source":"admin_rankedin_payment","participant_id":"30000000-0000-0000-0000-000000000002","registration_id":"20000000-0000-0000-0000-000000000001"}'),
  ('50000000-0000-0000-0000-000000000002',11,7,120,'success','event_entry_fee','paystack','Fixture-provider',
   '{"participant_id":"30000000-0000-0000-0000-000000000003"}'),
  ('50000000-0000-0000-0000-000000000003',12,7,400,'success','event_entry_fee','manual','Manual - cross event fixture',
   '{"participant_id":"30000000-0000-0000-0000-000000000001"}');
insert into private.event_checkout_security_quotes values ('50000000-0000-0000-0000-000000000002');

create function pg_temp.rejects(event_id bigint,participant_id uuid,p_scope text,expected text,message text)
returns void language plpgsql as $$
begin
  begin perform public.admin_review_imported_participant_payment(event_id,participant_id,p_scope,expected,'Fixture note');
  exception when others then
    if position(message in sqlerrm)>0 then return; end if;
    raise exception 'Expected %; received %',message,sqlerrm;
  end;
  raise exception 'Expected rejection: %',message;
end $$;

do $$
declare
  mark_id constant uuid:='30000000-0000-0000-0000-000000000001';
  correct_id constant uuid:='30000000-0000-0000-0000-000000000002';
  provider_id constant uuid:='30000000-0000-0000-0000-000000000003';
  linked_entry constant uuid:='20000000-0000-0000-0000-000000000001';
  manual_receipt constant uuid:='50000000-0000-0000-0000-000000000001';
  provider_receipt constant uuid:='50000000-0000-0000-0000-000000000002';
  foreign_receipt constant uuid:='50000000-0000-0000-0000-000000000003';
  org_scope constant text:='org:10000000-0000-0000-0000-000000000001';
  review jsonb;
  result jsonb;
  token text;
  new_receipt uuid;
begin
  assert has_function_privilege('authenticated','public.admin_review_imported_participant_payment(bigint,uuid,text,text,text)','execute');
  assert not has_function_privilege('anon','public.admin_review_imported_participant_payment(bigint,uuid,text,text,text)','execute');
  assert not has_function_privilege('service_role','public.admin_review_imported_participant_payment(bigint,uuid,text,text,text)','execute');
  assert not has_table_privilege('authenticated','public.payments','UPDATE');
  perform set_config('fixture.active','yes',true);
  perform set_config('fixture.email','assigned@example.invalid',true);
  perform pg_temp.rejects(11,mark_id,'all',null,'Current platform super-admin access');
  perform set_config('fixture.active','no',true);
  perform set_config('fixture.email','platform@example.invalid',true);
  perform pg_temp.rejects(11,mark_id,'all',null,'Current platform super-admin access');
  perform set_config('fixture.active','yes',true);
  perform pg_temp.rejects(11,mark_id,'org:10000000-0000-0000-0000-000000000002',null,'within this workspace');
  perform pg_temp.rejects(12,mark_id,'all',null,'participant in this event');
  perform pg_temp.rejects(13,mark_id,'all',null,'within this workspace');
  perform pg_temp.rejects(14,'30000000-0000-0000-0000-000000000010','all',null,'Cancelled or withdrawn events');
  perform pg_temp.rejects(11,'30000000-0000-0000-0000-000000000004','all',null,'linked entry has been withdrawn');
  perform pg_temp.rejects(11,'30000000-0000-0000-0000-000000000005','all',null,'division has been cancelled');
  perform pg_temp.rejects(11,'30000000-0000-0000-0000-000000000007','all',null,'saved registration link');
  perform pg_temp.rejects(11,'30000000-0000-0000-0000-000000000008','all',null,'imported RankedIn participant');
  perform pg_temp.rejects(11,provider_id,'all',null,'separate payment evidence');
  assert (select status='success' from public.payments where id=provider_receipt);

  review := public.admin_review_imported_participant_payment(11,mark_id,org_scope);
  assert review->>'action'='mark' and (review->>'amount')::numeric=120;
  assert (select not is_paid from public.tournament_participants where id=mark_id);
  token := review->>'token';
  update public.calendar set entry_fee=130 where id=11;
  perform pg_temp.rejects(11,mark_id,org_scope,token,'changed after review');
  assert (select count(*)=0 from public.payments where event_id=11 and metadata->>'participant_id'=mark_id::text);

  set local role authenticated;
  review := public.admin_review_imported_participant_payment(11,mark_id,org_scope);
  result := public.admin_review_imported_participant_payment(11,mark_id,org_scope,review->>'token','EFT fixture');
  reset role;
  new_receipt := (result->>'payment_id')::uuid;
  assert result->>'action'='mark' and (result->>'is_paid')::boolean;
  assert (select amount=130 and status='success' and event_id=11 and metadata->>'note'='EFT fixture'
    and metadata->>'participant_id'=mark_id::text and payment_method='manual' from public.payments where id=new_receipt);
  assert (select is_paid and metadata->>'unrelated'='retain' and not (metadata->>'manual_unpaid')::boolean
    from public.tournament_participants where id=mark_id);
  perform pg_temp.rejects(11,mark_id,org_scope,review->>'token','changed after review');
  review := public.admin_review_imported_participant_payment(11,mark_id,org_scope);
  assert review->>'action'='unmark' and not (review->>'resets_registration')::boolean;
  result := public.admin_review_imported_participant_payment(11,mark_id,org_scope,review->>'token','Duplicate entry');
  assert not (result->>'is_paid')::boolean and (result->>'payment_id')::uuid=new_receipt;
  assert (select status='cancelled' from public.payments where id=new_receipt);
  assert (select status='success' from public.payments where id=foreign_receipt);
  assert (select count(*)=4 from public.event_registrations where payment_status='paid');

  review := public.admin_review_imported_participant_payment(11,correct_id,'all');
  assert (review->>'resets_registration')::boolean;
  begin
    perform public.admin_review_imported_participant_payment(11,correct_id,'all',review->>'token','Correction');
    raise exception 'expected the final participant write to roll back';
  exception when check_violation then null; end;
  assert (select status='success' from public.payments where id=manual_receipt);
  assert (select payment_status='paid' from public.event_registrations where id=linked_entry);
  assert (select is_paid from public.tournament_participants where id=correct_id);
  update public.tournament_participants set full_name='Fixture Player' where id=correct_id;
  review := public.admin_review_imported_participant_payment(11,correct_id,'all');
  result := public.admin_review_imported_participant_payment(11,correct_id,'all',review->>'token','Correction');
  assert (result->>'registration_reset')::boolean;
  assert (select status='cancelled' from public.payments where id=manual_receipt);
  assert (select payment_status='unpaid' from public.event_registrations where id=linked_entry);
  assert (select count(*)=3 from public.event_registrations where payment_status='paid');
  assert (select status='success' from public.payments where id=provider_receipt);

  review := public.admin_review_imported_participant_payment(11,'30000000-0000-0000-0000-000000000006','all');
  assert not (review->>'has_manual_receipt')::boolean;
  result := public.admin_review_imported_participant_payment(11,'30000000-0000-0000-0000-000000000006','all',review->>'token',null);
  assert result->>'payment_id' is null and not (result->>'is_paid')::boolean;
  assert (select count(*)=4 from public.payments);

  review := public.admin_review_imported_participant_payment(15,'30000000-0000-0000-0000-000000000011','all');
  assert (review->>'is_test')::boolean and (review->>'amount')::numeric=0;
  result := public.admin_review_imported_participant_payment(15,'30000000-0000-0000-0000-000000000011','all',review->>'token',null);
  assert (select is_test and amount=0 and player_id is null from public.payments where id=(result->>'payment_id')::uuid);
end $$;
