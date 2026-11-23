\set ON_ERROR_STOP on
do $$ begin
  if current_database() <> 'fourm_admin_calendar_weekly_series_test' or to_regclass('public.calendar') is not null then
    raise exception 'Use the empty disposable fourm_admin_calendar_weekly_series_test database';
  end if;
end $$;
begin;
do $$ begin
  if not exists (select from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create schema auth;
grant usage on schema auth to authenticated;
create function auth.email() returns text language sql stable as $$ select current_setting('series_test.actor', true) $$;
create function auth.uid() returns uuid language sql stable as $$ select 'a22b0451-e2da-4a84-bcb1-7d89af0598b4'::uuid $$;
create function public.account_is_active() returns boolean language sql stable as $$ select auth.email() <> 'inactive@example.invalid' $$;
create function public.is_super_admin(text) returns boolean language sql stable as $$ select $1 <> 'tenant@example.invalid' $$;

create table public.calendar (
  id bigint primary key, event_name text, start_date date, registration_closes_at timestamptz, is_visible boolean,
  event_status text, updated_at timestamptz, series_id uuid, organisation_id uuid, club_id uuid,
  organiser_name text, organiser_email text, is_weekly boolean, is_manual boolean
);
grant select, update on public.calendar to authenticated;
alter table public.calendar enable row level security;
create policy fixture_calendar on public.calendar for all to authenticated using (public.is_super_admin(auth.email())) with check (public.is_super_admin(auth.email()));
\ir ../supabase/migrations/20261120052642_verified_calendar_weekly_series_visibility.sql

insert into public.calendar (id,event_name,start_date,is_visible,event_status,series_id,organisation_id,club_id,organiser_name,organiser_email,is_weekly,is_manual)
values
  (11,'Week 1','2035-03-09',false,'active','a7026ddc-1b70-45f1-a1a1-23d99f3d284e','4aa19ee0-4f73-4853-a205-130fc72cbf56','56deb1d2-2570-4634-b6f0-67cd38589a8b','Host',null,true,true),
  (12,'Week 2','2035-03-16',true,'active','a7026ddc-1b70-45f1-a1a1-23d99f3d284e','4aa19ee0-4f73-4853-a205-130fc72cbf56','56deb1d2-2570-4634-b6f0-67cd38589a8b','Host',null,true,true),
  (13,'Different series','2035-03-23',true,'active',null,'31471323-46c7-4bf4-a788-d963056013e8',null,'Other',null,false,true),
  (14,'Different organiser','2035-03-23',false,'active','cdcf7568-60c5-409b-94c4-739548fa2517',null,null,'Other','other@example.invalid',true,true),
  (15,'Unlinked host','2035-03-30',false,'active','cdcf7568-60c5-409b-94c4-739548fa2517',null,null,'Host','host@example.invalid',true,true);

set local role authenticated;
select set_config('series_test.actor','tenant@example.invalid',true);
do $$ begin
  begin
    perform public.admin_calendar_weekly_series_visibility(11); raise exception 'Tenant could view series';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('series_test.actor','inactive@example.invalid',true);
do $$ begin
  begin
    perform public.admin_calendar_weekly_series_visibility(11); raise exception 'Inactive admin could view series';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('series_test.actor','platform@example.invalid',true);

do $$
declare
  review jsonb;
  receipt jsonb;
begin
  if has_function_privilege('anon','public.admin_calendar_weekly_series_visibility(bigint,jsonb,boolean)','EXECUTE')
      or has_function_privilege('service_role','public.admin_calendar_weekly_series_visibility(bigint,jsonb,boolean)','EXECUTE') then
    raise exception 'Unauthorised role has execute grant';
  end if;
  begin
    perform public.admin_calendar_weekly_series_visibility(14); raise exception 'Unrelated organisers sharing a series were visible';
  exception when raise_exception then
    if sqlerrm not like 'The linked series membership or host changed%' then raise; end if;
  end;
  review := public.admin_calendar_weekly_series_visibility(11);
  if review->'occurrences'->0->>'id' <> '11' or jsonb_array_length(review->'occurrences') <> 2
      or (select is_visible from public.calendar where id=11) then raise exception 'Review was inaccurate or wrote visibility'; end if;

  update public.calendar set event_status='cancelled' where id=12;
  begin
    perform public.admin_calendar_weekly_series_visibility(11,review->'occurrences',true); raise exception 'Stale occurrence was written';
  exception when raise_exception then
    if sqlerrm not like 'The weekly series changed after review%' then raise; end if;
  end;
  if (select is_visible from public.calendar where id=11) then raise exception 'Stale rejection partially updated the series'; end if;
  update public.calendar set event_status='active' where id=12;

  update public.calendar set series_id=(review->>'series_id')::uuid, is_weekly=true where id=13;
  begin
    perform public.admin_calendar_weekly_series_visibility(11,review->'occurrences',true); raise exception 'Cross-tenant occurrence was written';
  exception when raise_exception then
    if sqlerrm not like 'The linked series membership or host changed%' then raise; end if;
  end;
  update public.calendar set series_id=null, is_weekly=false where id=13;

  update public.calendar set organisation_id='e18bb516-8d12-4bc2-8b3d-626dc1d340da' where id in (11,12);
  begin
    perform public.admin_calendar_weekly_series_visibility(11,review->'occurrences',true); raise exception 'Moved series was written using old host review';
  exception when raise_exception then
    if sqlerrm not like 'The weekly series changed after review%' then raise; end if;
  end;
  review := public.admin_calendar_weekly_series_visibility(11);
  receipt := public.admin_calendar_weekly_series_visibility(11,review->'occurrences',true);
  if receipt->>'source_id' <> '11' or receipt->>'updated_count' <> '2' or receipt->>'is_visible' <> 'true'
      or (select count(*) from public.calendar where id in (11,12) and is_visible) <> 2 then
    raise exception 'Approved visibility did not update both exact occurrences';
  end if;
  review := public.admin_calendar_weekly_series_visibility(12);
  receipt := public.admin_calendar_weekly_series_visibility(12,review->'occurrences',false);
  if receipt->>'is_visible' <> 'false' or (select count(*) from public.calendar where id in (11,12) and is_visible) <> 0
      or not (select is_visible from public.calendar where id=13) then
    raise exception 'Hide did not keep the unrelated event unchanged';
  end if;
end $$;
rollback;
