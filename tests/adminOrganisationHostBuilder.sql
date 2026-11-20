\set ON_ERROR_STOP on
do $$ begin
  if current_database() <> 'fourm_admin_organisation_host_test' or to_regclass('public.calendar') is not null then
    raise exception 'Use the empty disposable fourm_admin_organisation_host_test database';
  end if;
end $$;
begin;
do $$ begin
  if not exists (select from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create schema auth;
create function auth.email() returns text language sql stable as $$ select current_setting('host_test.actor',true) $$;
create function auth.uid() returns uuid language sql stable as $$ select 'a22b0451-e2da-4a84-bcb1-7d89af0598b4'::uuid $$;
create function public.account_is_active() returns boolean language sql stable as $$ select auth.email() <> 'inactive@example.invalid' $$;
create function public.is_super_admin(text) returns boolean language sql stable as $$ select $1 = 'platform@example.invalid' $$;
create table public.organisation_members(organisation_id uuid,user_email text,role text);
create table public.organisations(id uuid primary key, name text, status text, contact_email text, contact_phone text,
 logo_url text, website_url text, federation_id uuid, payment_account_number text);
create table public.clubs(id uuid primary key, name text, short_name text, status text, address text, city text);
create table public.club_organisations(organisation_id uuid,club_id uuid);
create table public.calendar(id bigint primary key, organisation_id uuid, club_id uuid, venue text, venues text[],
 is_manual boolean, event_status text);

insert into public.organisations values
  ('11111111-1111-1111-1111-111111111111','First approved host','approved',null,null,null,null,null,'private-wallet'),
  ('22222222-2222-2222-2222-222222222222','Different host','approved',null,null,null,null,null,'foreign-wallet'),
  ('33333333-3333-3333-3333-333333333333','Pending host','pending',null,null,null,null,null,null);
insert into public.clubs values
  ('aaaaaaaa-1111-1111-1111-111111111111','Home courts','Home','active','One Address','First City'),
  ('bbbbbbbb-1111-1111-1111-111111111111','Other courts','Other','active','Other Address','Second City');
insert into public.organisation_members values
  ('11111111-1111-1111-1111-111111111111',' OWNER@example.invalid ','owner'),
  ('11111111-1111-1111-1111-111111111111','admin@example.invalid','admin'),
  ('11111111-1111-1111-1111-111111111111','inactive@example.invalid','owner'),
  ('11111111-1111-1111-1111-111111111111','staff@example.invalid','staff'),
  ('22222222-2222-2222-2222-222222222222','actor-other@example.invalid','owner');
insert into public.club_organisations values
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222','bbbbbbbb-1111-1111-1111-111111111111');
insert into public.calendar values
  (11,'11111111-1111-1111-1111-111111111111',null,'Custom venue',array['Custom venue'],true,'active'),
  (12,'22222222-2222-2222-2222-222222222222',null,'Other',array['Other'],true,'active'),
  (13,'11111111-1111-1111-1111-111111111111','bbbbbbbb-1111-1111-1111-111111111111','Other courts',array['Other courts'],true,'active'),
  (14,'11111111-1111-1111-1111-111111111111',null,'Cancelled venue',null,true,'cancelled'),
  (15,'11111111-1111-1111-1111-111111111111',null,'Imported venue',null,false,'active');
\ir ../supabase/migrations/20261120054121_scoped_organisation_host_event_builder.sql

set local role authenticated;
select set_config('host_test.actor','staff@example.invalid',true);
do $$ begin
  begin
    perform public.admin_organisation_host_builder('11111111-1111-1111-1111-111111111111'); raise exception 'Staff entered host editor';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('host_test.actor','inactive@example.invalid',true);
do $$ begin
  begin
    perform public.admin_organisation_host_builder('11111111-1111-1111-1111-111111111111'); raise exception 'Inactive owner entered host editor';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('host_test.actor','actor_other@example.invalid',true);
do $$ begin
  begin
    perform public.admin_organisation_host_builder('22222222-2222-2222-2222-222222222222'); raise exception 'Different email matched the owner';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('host_test.actor','owner@example.invalid',true);
do $$
declare
  host uuid := '11111111-1111-1111-1111-111111111111';
  outsider uuid := '22222222-2222-2222-2222-222222222222';
  other_club uuid := 'bbbbbbbb-1111-1111-1111-111111111111';
  home_club uuid := 'aaaaaaaa-1111-1111-1111-111111111111';
  review jsonb;
  rejected_id bigint;
begin
  if has_function_privilege('anon','public.admin_organisation_host_builder(uuid,bigint,text[],uuid)','EXECUTE')
      or has_function_privilege('service_role','public.admin_organisation_host_builder(uuid,bigint,text[],uuid)','EXECUTE')
  then raise exception 'Unexpected execute grant'; end if;
  review := public.admin_organisation_host_builder(host, null, array['Home courts','Custom venue'], home_club);
  if review->'organisation'->>'id' <> host::text or review->>'platform' <> 'false' or
    jsonb_array_length(review->'clubs') <> 1 or review::text like '%wallet%' or review::text like '%Other courts%'
    then raise exception 'Host capability leaked unrelated or sensitive records'; end if;
  perform public.admin_organisation_host_builder(host,11,array['Other synthetic custom venue'],null);
  perform public.admin_organisation_host_builder(host,13,array['Other courts'],other_club);
  begin
    perform public.admin_organisation_host_builder(outsider); raise exception 'Owner entered another organisation';
  exception when insufficient_privilege then null;
  end;
  foreach rejected_id in array array[12,14,15] loop
    begin
      perform public.admin_organisation_host_builder(host,rejected_id); raise exception 'Ineligible event was editable';
    exception when raise_exception then
      if sqlerrm not like 'Choose one%' then raise; end if;
    end;
  end loop;
  begin
    perform public.admin_organisation_host_builder(host,null,array['Other, street'],null); raise exception 'Foreign venue slipped through alias';
  exception when raise_exception then
    if sqlerrm not like 'This venue would link%' then raise; end if;
  end;
  begin
    perform public.admin_organisation_host_builder(host,null,array['Custom'],other_club); raise exception 'Foreign explicit club was accepted';
  exception when raise_exception then
    if sqlerrm not like 'Choose a club linked%' then raise; end if;
  end;
  begin
    perform public.admin_organisation_host_builder(host,11,array['Home'],home_club); raise exception 'Changing stored club was permitted';
  exception when raise_exception then
    if sqlerrm not like 'Contact a Calendar administrator%' then raise; end if;
  end;
end $$;
select set_config('host_test.actor','admin@example.invalid',true);
select public.admin_organisation_host_builder('11111111-1111-1111-1111-111111111111',11)->>'event_id';
select set_config('host_test.actor','platform@example.invalid',true);
do $$ begin
  if public.admin_organisation_host_builder('22222222-2222-2222-2222-222222222222',12)->>'platform' <> 'true' then
    raise exception 'Platform host-review capability was not returned';
  end if;
  begin
    perform public.admin_organisation_host_builder('33333333-3333-3333-3333-333333333333'); raise exception 'Pending host was accepted';
  exception when raise_exception then
    if sqlerrm not like 'Choose the approved organisation%' then raise; end if;
  end;
end $$;
rollback;
