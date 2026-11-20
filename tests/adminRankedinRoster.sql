\set ON_ERROR_STOP on
do $$ begin
  if current_database() <> 'fourm_admin_rankedin_roster_test' or to_regclass('public.calendar') is not null then
    raise exception 'Use an empty disposable fourm_admin_rankedin_roster_test database.';
  end if;
  if not exists(select from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists(select from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists(select from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;
create schema auth;
grant usage on schema auth to authenticated;
create function auth.uid() returns uuid language sql as $$select 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'::uuid$$;
create function auth.email() returns text language sql as $$select current_setting('fixture.actor', true)$$;
create function public.is_super_admin(email text) returns boolean language sql as $$select email = 'platform@example.invalid'$$;
create function public.account_is_active() returns boolean language sql as $$select current_setting('fixture.active', true) = 'true'$$;
create function public.can_manage_event(event bigint) returns boolean language sql as $$select event in (41,42)$$;
create table public.calendar (
  id bigint primary key, rankedin_id text, rankedin_url text, is_manual boolean default false, event_status text default 'active'
);
create table public.players (id bigint primary key, rankedin_id text, email text);
create table public.tournament_participants (
  id uuid primary key default gen_random_uuid(), event_id bigint references public.calendar(id), rankedin_participant_id text,
  full_name text not null, class_name text, profile_id bigint references public.players(id), email text, is_paid boolean default false,
  is_test boolean default false, whatsapp_added boolean default false, metadata jsonb default '{}',
  last_synced_at timestamptz default now(), unique(event_id,rankedin_participant_id,class_name)
);
create table public.event_registrations (event_id bigint references public.calendar(id), division text, email text, status text, payment_status text);
create table public.payments (event_id bigint references public.calendar(id), metadata jsonb);
create table public.event_activity_log (event_id bigint, action text, details jsonb);
create function public.log_event_activity(
  p_event bigint, p_action text, p_category text, p_summary text, p_details jsonb, p_role text
) returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('fixture.audit_failure', true) = 'yes' then raise exception 'Audit fixture failure.'; end if;
  insert into public.event_activity_log values (p_event,p_action,p_details);
  return gen_random_uuid();
end $$;
grant select, update on public.calendar to authenticated;
grant select on public.players, public.event_registrations, public.payments, public.event_activity_log to authenticated;
grant select, insert, update, delete on public.tournament_participants to authenticated;
\ir ../supabase/migrations/20261120111700_admin_import_rankedin_participants.sql

create function pg_temp.expect(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Failed assertion: %', label; end if; end $$;
create function pg_temp.rejects(statement text, message text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if position(message in sqlerrm) > 0 then return; end if;
    raise exception 'Expected % but got %', message, sqlerrm;
  end;
  raise exception 'Expected rejection: %', message;
end $$;

insert into public.calendar (id,rankedin_id,rankedin_url,is_manual,event_status) values
  (41,null,'https://www.rankedin.com/en/tournament/300/fixture',false,'active'),
  (42,'301',null,false,'cancelled'), (43,'302',null,false,'active');
insert into public.players values
  (2,'200','exact@example.invalid'), (3,'201','first@example.invalid'), (4,'201','second@example.invalid');
insert into public.event_registrations values
  (41,'Open','ExAcT@example.invalid','registered','paid'),
  (43,'Open','first@example.invalid','registered','paid');
insert into public.tournament_participants (id,event_id,rankedin_participant_id,full_name,class_name,is_paid,metadata) values
  ('10000000-0000-4000-8000-000000000001',41,'100','Previous name','Open',false,'{"manual_unpaid":true}'),
  ('10000000-0000-4000-8000-000000000002',41,'101','Stale source only','Open',false,'{}'),
  ('10000000-0000-4000-8000-000000000003',41,'102','Protected receipt','Open',false,'{}'),
  ('10000000-0000-4000-8000-000000000004',41,'103','Paid participant','Open',true,'{}'),
  ('10000000-0000-4000-8000-000000000005',43,'101','Other event','Open',false,'{}');
insert into public.payments values (41,'{"line_items":[{"participant_id":"10000000-0000-4000-8000-000000000003"}]}');
select set_config('fixture.entries',
  '[{"id":"100","name":"New name","division":"Open"},{"id":"200","name":"Exact player","division":"Open"},{"id":"201","name":"Ambiguous player","division":"Open"}]',false);

select pg_temp.expect(not has_function_privilege('anon','public.admin_import_rankedin_participants(bigint,text,jsonb,text)','EXECUTE'),'anonymous denial');
select pg_temp.expect(not has_function_privilege('service_role','public.admin_import_rankedin_participants(bigint,text,jsonb,text)','EXECUTE'),'service credential cannot bypass platform actor');
set role authenticated;
set fixture.active = 'true';
set fixture.actor = 'organiser@example.invalid';
select pg_temp.rejects($$select public.admin_import_rankedin_participants(41,'300','[]')$$,'Current platform Event Manager');
set fixture.actor = 'platform@example.invalid';
select pg_temp.rejects($$select public.admin_import_rankedin_participants(43,'302','[]')$$,'Current platform Event Manager');
select pg_temp.rejects($$select public.admin_import_rankedin_participants(42,'301','[]')$$,'active RankedIn event');
select pg_temp.rejects($$select public.admin_import_rankedin_participants(41,'301','[]')$$,'link changed');
select pg_temp.rejects($$select public.admin_import_rankedin_participants(41,'300','[{"id":"200","name":"Missing division"}]')$$,'invalid or repeated');
select pg_temp.rejects($$select public.admin_import_rankedin_participants(41,'300','[{"id":"1","name":"One","division":"Open"},{"id":"1","name":"Two","division":" Open "}]')$$,'invalid or repeated');

select set_config('fixture.preview',public.admin_import_rankedin_participants(41,'300',current_setting('fixture.entries')::jsonb)::text,false);
select pg_temp.expect(jsonb_array_length(current_setting('fixture.preview')::jsonb->'changes') = 6,'exact add, update, removal and retention preview');
select pg_temp.expect(not (current_setting('fixture.preview')::jsonb->'changes'->0 ? 'email'),'preview excludes private match details');
select pg_temp.expect((select count(*) = 4 from public.tournament_participants where event_id = 41),'review performs no writes');
update public.tournament_participants set whatsapp_added = true where event_id = 41 and rankedin_participant_id = '101';
select pg_temp.rejects($$select public.admin_import_rankedin_participants(41,'300',current_setting('fixture.entries')::jsonb,current_setting('fixture.preview')::jsonb->>'token')$$,'payment evidence changed');
update public.tournament_participants set whatsapp_added = false where event_id = 41 and rankedin_participant_id = '101';
select set_config('fixture.preview',public.admin_import_rankedin_participants(41,'300',current_setting('fixture.entries')::jsonb)::text,false);
set fixture.audit_failure = 'yes';
select pg_temp.rejects($$select public.admin_import_rankedin_participants(41,'300',current_setting('fixture.entries')::jsonb,current_setting('fixture.preview')::jsonb->>'token')$$,'Audit fixture failure');
select pg_temp.expect((select count(*) = 4 from public.tournament_participants where event_id = 41)
  and (select full_name = 'Previous name' from public.tournament_participants where event_id = 41 and rankedin_participant_id = '100'),'audit failure rolls back roster writes');
set fixture.audit_failure = 'no';
select set_config('fixture.saved',public.admin_import_rankedin_participants(41,'300',current_setting('fixture.entries')::jsonb,current_setting('fixture.preview')::jsonb->>'token')::text,false);
select pg_temp.expect(current_setting('fixture.saved')::jsonb @> '{"inserted":2,"updated":1,"removed":1}','one atomic saved receipt');
select pg_temp.expect((select profile_id = 2 and is_paid and email = 'exact@example.invalid' from public.tournament_participants where event_id = 41 and rankedin_participant_id = '200'),'one exact provider identity and paid registration link');
select pg_temp.expect((select profile_id is null and not is_paid from public.tournament_participants where event_id = 41 and rankedin_participant_id = '201'),'ambiguous identity stays unlinked and unpaid');
select pg_temp.expect((select metadata->>'manual_unpaid' = 'true' and not is_paid from public.tournament_participants where event_id = 41 and rankedin_participant_id = '100'),'existing manual correction is preserved');
select pg_temp.expect((select count(*) = 2 from public.tournament_participants where event_id = 41 and rankedin_participant_id in ('102','103')),'financial records retained');
select pg_temp.expect((select count(*) = 1 from public.tournament_participants where event_id = 43 and rankedin_participant_id = '101'),'foreign record retained');
select pg_temp.rejects($$select public.admin_import_rankedin_participants(41,'300',current_setting('fixture.entries')::jsonb,current_setting('fixture.preview')::jsonb->>'token')$$,'payment evidence changed');
select pg_temp.expect((select count(*) = 1 from public.event_activity_log where event_id = 41),'replay does not duplicate the audit');
reset role;
