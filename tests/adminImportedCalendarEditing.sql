\set ON_ERROR_STOP on
do $$ begin
  if current_database() <> 'fourm_imported_calendar_test' or to_regclass('public.calendar') is not null then
    raise exception 'Use the empty disposable fourm_imported_calendar_test database';
  end if;
end $$;
begin;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;
create schema auth;
create function auth.email() returns text language sql stable as $$
  select nullif(current_setting('fixture.calendar_actor', true), '')
$$;
create function auth.uid() returns uuid language sql stable as $$
  select case when auth.email() is not null then '10000000-1000-1000-1000-100000000000'::uuid end
$$;
create function public.account_is_active() returns boolean language sql stable as $$
  select auth.email() <> 'inactive@example.invalid'
$$;
create function public.is_super_admin(address text) returns boolean language sql stable as $$
  select address in ('platform@example.invalid','inactive@example.invalid')
$$;
create table public.organisations(id uuid primary key, name text, status text not null);
create table public.calendar(
  id bigint primary key, event_name text, slug text, rankedin_id text, rankedin_url text, club_id uuid,
  is_manual boolean, is_quick_event boolean, event_status text, event_dates text, is_weekly boolean, series_id uuid,
  sapa_status text, tournament_tag text, points integer, description text, start_date date, end_date date,
  start_time time, end_time time, city text, venue text, address text, organisation_id uuid,
  organiser_name text, organiser_email text, organiser_phone text, organiser_website text, entry_fee numeric,
  allow_payments boolean, finance_managed boolean, is_visible boolean, featured_event boolean, featured_result boolean,
  show_in_recent_results boolean, is_spotlight boolean, featured_live boolean, is_league boolean, live_youtube_url text,
  youtube_playlist_url text, live_players text, next_match text, image_url text, custom_image_url text
);
create function public.fixture_calendar_club_trigger() returns trigger language plpgsql as $$
begin
  if new.club_id is null then new.club_id = '10000000-0000-4000-8000-000000000001'; end if;
  return new;
end $$;
create trigger fixture_calendar_club_trigger before update of venue on public.calendar
  for each row execute function public.fixture_calendar_club_trigger();
\ir ../supabase/migrations/20261120074010_review_imported_calendar_metadata.sql

insert into public.organisations values
  ('00000000-0000-4000-8000-000000000001','First approved org','approved'),
  ('00000000-0000-4000-8000-000000000002','Second approved org','approved'),
  ('00000000-0000-4000-8000-000000000003','Pending org','pending');
insert into public.calendar(id,event_name,slug,rankedin_id,rankedin_url,is_manual,is_quick_event,event_status,
  start_date,end_date,organisation_id,show_in_recent_results)
values
  (11,'Provider fixture','provider-fixture','755','https://www.rankedin.com/tournament/755',false,false,'active',
    '2035-03-04','2035-03-05','00000000-0000-4000-8000-000000000001',false),
  (12,'Manual fixture','manual-fixture',null,null,true,false,'active','2035-03-04','2035-03-05',null,false),
  (13,'Cancelled fixture','cancelled-fixture','756',null,false,false,'cancelled','2035-03-04','2035-03-05',null,false);

do $$
begin
  if has_function_privilege('anon','public.admin_review_imported_calendar_event(bigint,text,jsonb)','execute')
    or has_function_privilege('service_role','public.admin_review_imported_calendar_event(bigint,text,jsonb)','execute') then
    raise exception 'Imported editing has excess API privileges';
  end if;
end $$;
set local role authenticated;
select set_config('fixture.calendar_actor','tenant@example.invalid',true);
do $$ begin
  perform public.admin_review_imported_calendar_event(11);
  raise exception 'Tenant could read the platform editor';
exception when insufficient_privilege then null;
end $$;
select set_config('fixture.calendar_actor','inactive@example.invalid',true);
do $$ begin
  perform public.admin_review_imported_calendar_event(11);
  raise exception 'Inactive administrator could read the platform editor';
exception when insufficient_privilege then null;
end $$;
select set_config('fixture.calendar_actor','platform@example.invalid',true);
do $$
declare
  source jsonb := public.admin_review_imported_calendar_event(11);
  version text := source->>'version';
  receipt jsonb;
begin
  if source#>>'{record,rankedin_id}' is distinct from '755' or length(version) is distinct from 32 then
    raise exception 'Incorrect provider review record';
  end if;
  begin
    perform public.admin_review_imported_calendar_event(12);
    raise exception 'A manual event opened the imported editor';
  exception when raise_exception then
    if sqlerrm <> 'Choose an active imported calendar event' then raise; end if;
  end;
  begin
    perform public.admin_review_imported_calendar_event(13);
    raise exception 'A cancelled event opened the imported editor';
  exception when raise_exception then
    if sqlerrm <> 'Choose an active imported calendar event' then raise; end if;
  end;
  begin
    perform public.admin_review_imported_calendar_event(11,version,'{"rankedin_id":"756"}');
    raise exception 'The provider link changed through metadata editing';
  exception when raise_exception then
    if sqlerrm <> 'Review valid calendar metadata changes' then raise; end if;
  end;
  begin
    perform public.admin_review_imported_calendar_event(11,version,'{"organisation_id":"00000000-0000-4000-8000-000000000003"}');
    raise exception 'A pending organisation could take over an event';
  exception when raise_exception then
    if sqlerrm <> 'Choose a current approved organisation' then raise; end if;
  end;
  begin
    perform public.admin_review_imported_calendar_event(11,version,'{"start_date":"2035-03-06"}');
    raise exception 'An invalid event date range was saved';
  exception when raise_exception then
    if sqlerrm <> 'Choose a valid event date and time range' then raise; end if;
  end;
  receipt := public.admin_review_imported_calendar_event(11,version,
    '{"event_name":"Renamed provider fixture","organisation_id":"00000000-0000-4000-8000-000000000002","end_date":"2035-03-07","featured_result":true}');
  if receipt->>'event_id' is distinct from '11' then raise exception 'Incorrect saved event receipt'; end if;
  begin
    perform public.admin_review_imported_calendar_event(11,version,'{"event_name":"Stale title"}');
    raise exception 'A stale review overwrote event metadata';
  exception when raise_exception then
    if sqlerrm <> 'The event changed after review' then raise; end if;
  end;
end $$;
reset role;
do $$
begin
  if not exists (select 1 from public.calendar where id = 11 and event_name = 'Renamed provider fixture'
    and organisation_id = '00000000-0000-4000-8000-000000000002'
    and slug = 'provider-fixture' and rankedin_id = '755' and event_dates = '4 - 7 March' and club_id is null
    and featured_result is true and show_in_recent_results is true) then
    raise exception 'The edit failed to preserve the exact imported event and update its published metadata';
  end if;
end $$;
rollback;
