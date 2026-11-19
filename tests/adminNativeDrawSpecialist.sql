\set ON_ERROR_STOP on
begin;

-- Run on an empty disposable local database, never on an existing project.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema auth;
grant usage on schema auth to authenticated, anon, service_role;
create function auth.email() returns text language sql stable as
$$ select nullif(current_setting('specialist.email', true), '') $$;
create function auth.uid() returns uuid language sql stable as
$$ select case when auth.email() is not null then '11111111-1111-4111-8111-111111111111'::uuid end $$;
create function public.account_is_active() returns boolean language sql stable as
$$ select auth.email() is distinct from 'inactive@example.invalid' $$;
create function public.is_super_admin(email text) returns boolean language sql stable as
$$ select email in ('admin@example.invalid', 'inactive@example.invalid') $$;
create function public.is_4m_admin() returns boolean language sql stable as
$$ select public.is_super_admin(auth.email()) $$;
create function public.is_org_admin(id bigint) returns boolean language sql stable as
$$ select id = 1000 and auth.email() = 'tenant@example.invalid' $$;

create table public.calendar(id bigint primary key, organization_id bigint, is_manual boolean, event_status text);
create table public.tournament_divisions(id uuid primary key, event_id bigint references public.calendar, is_active boolean);
create table public.event_registrations(id uuid primary key);
create table public.players(id bigint primary key);
grant select, update on public.calendar, public.tournament_divisions to authenticated;

\ir ../supabase/migrations/20260819_native_draw_data_model.sql
\ir ../supabase/migrations/20260903143000_event_play_days.sql
\ir ../supabase/migrations/20260910200000_resolve_draw_routes.sql
alter table public.event_play_days add column is_removed boolean not null default false;
\ir ../supabase/migrations/20261119111803_transactional_native_draw_specialist_actions.sql

insert into public.calendar values (101, 1000, true, 'active'), (102, 1001, true, 'active');
insert into public.tournament_divisions values
  ('11111111-1111-4111-8111-111111111112', 101, true),
  ('11111111-1111-4111-8111-111111111113', 102, true);
insert into public.draws(id, event_id, division_id, draw_kind, format, status, scoring_rules, updated_at)
values ('11111111-1111-4111-8111-111111111114', 101, '11111111-1111-4111-8111-111111111112',
        'main', 'knockout', 'published', '{"plate_mode":"triple"}', '2035-01-20T00:00:00Z');
insert into public.draw_entries(draw_id, team_name, player_one_name, seed_number)
select '11111111-1111-4111-8111-111111111114'::uuid, 'Team ' || n, 'Player ' || n, n
from generate_series(1, 8) n;
insert into public.draw_matches(draw_id, stage, round_code, round_label, round_number, bracket_position,
                                entry_one_id, entry_two_id, winner_entry_id, loser_entry_id, status, result_type, updated_at)
select a.draw_id, 'knockout', 'r3', 'Quarterfinals', 1, (a.seed_number + 1) / 2, a.id, b.id, a.id, b.id,
       'completed', 'played', '2035-01-20T01:00:00Z'
from public.draw_entries a join public.draw_entries b on b.draw_id = a.draw_id and b.seed_number = a.seed_number + 1
where a.seed_number % 2 = 1;

create function public.reject_test_plate_audit() returns trigger language plpgsql as $$
begin
  if current_setting('specialist.reject_audit', true) = 'on' then
    raise exception 'Fixture forced an audit failure';
  end if;
  return new;
end;
$$;
create trigger specialist_reject_audit before insert on public.draw_match_audit
  for each row execute function public.reject_test_plate_audit();

set local role authenticated;
select set_config('specialist.email', 'tenant@example.invalid', true);
do $$ begin
    if not public.can_manage_native_draw(101) then raise exception 'Tenant fixture lacks native authority'; end if;
    begin
      perform public.native_create_linked_plate(101, '11111111-1111-4111-8111-111111111114', null, '{}');
      raise exception 'Tenant unexpectedly created plate';
    exception when insufficient_privilege then null;
    end;
    begin
      perform public.native_save_event_play_days(101, '[]', '{}');
      raise exception 'Tenant unexpectedly saved play days';
    exception when insufficient_privilege then null;
    end;
end $$;
select set_config('specialist.email', 'inactive@example.invalid', true);
do $$ begin
    begin
      perform public.native_create_linked_plate(101, '11111111-1111-4111-8111-111111111114', null, '{}');
      raise exception 'Inactive administrator unexpectedly created plate';
    exception when insufficient_privilege then null;
    end;
end $$;
select set_config('specialist.email', 'admin@example.invalid', true);
do $$
declare
  main_id uuid := '11111111-1111-4111-8111-111111111114';
  silver_id uuid;
  bronze_id uuid;
  versions jsonb;
  receipt jsonb;
  clock_version timestamptz;
  changes integer;
  days jsonb := '[{"play_date":"2035-01-21","start_time":"09:00","end_time":"17:00","courts_count":2,
      "match_duration_minutes":45,"minimum_break_minutes":10,"is_active":true}]';
begin
  if has_function_privilege('anon', 'public.native_create_linked_plate(bigint,uuid,timestamptz,jsonb)', 'EXECUTE') then
      raise exception 'Anon unexpectedly has plate capability';
  end if;

  select jsonb_object_agg(id::text, updated_at) into versions from public.draw_matches where draw_id = main_id;
  begin
    perform public.native_create_linked_plate(102, main_id, '2035-01-20T00:00:00Z', versions);
    raise exception 'Cross-event request unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm not like 'Choose the published source draw%' then raise; end if;
  end;
  begin
    perform public.native_create_linked_plate(101, main_id, '2035-01-20T00:00:00Z', '{}');
    raise exception 'Stale request unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm not like 'The opening matches changed%' then raise; end if;
  end;

  perform set_config('specialist.reject_audit','on',true);
  begin
    perform public.native_create_linked_plate(101, main_id, '2035-01-20T00:00:00Z', versions);
    raise exception 'Forced final-stage failure unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'Fixture forced an audit failure' then raise; end if;
  end;
  if exists (select 1 from public.draws where event_id=101 and draw_kind='silver') then
    raise exception 'A failed plate operation left writes behind';
  end if;
  perform set_config('specialist.reject_audit','off',true);

  receipt := public.native_create_linked_plate(101, main_id, '2035-01-20T00:00:00Z', versions);
  silver_id := (receipt->>'id')::uuid;
  if receipt->>'kind' <> 'silver' or receipt->>'created' <> 'true'
      or (select array_agg(team_name order by seed_number) from public.draw_entries where draw_id = silver_id)
        is distinct from array['Team 2','Team 4','Team 6','Team 8']
      or (select count(*) from public.draw_matches where draw_id = silver_id and winner_to_match_id is not null) <> 2
      or (select count(*) from public.draw_match_audit a join public.draw_matches m on m.id = a.match_id where m.draw_id = silver_id) <> 1 then
    raise exception 'Silver seeds, routes or audit are incorrect';
  end if;
  receipt := public.native_create_linked_plate(101, main_id, '2035-01-20T00:00:00Z', versions);
  if receipt->>'created' <> 'false' or (receipt->>'id')::uuid <> silver_id then
    raise exception 'Retry did not return the existing plate';
  end if;

  update public.draw_matches set winner_entry_id=entry_one_id, loser_entry_id=entry_two_id,
    status='completed', result_type='played' where draw_id = silver_id and round_number = 1;
  select jsonb_object_agg(id::text, updated_at) into versions from public.draw_matches where draw_id = silver_id and round_number = 1;
  select updated_at into clock_version from public.draws where id = silver_id;
  receipt := public.native_create_linked_plate(101, silver_id, clock_version, versions);
  bronze_id := (receipt->>'id')::uuid;
  if receipt->>'kind' <> 'bronze' or receipt->>'entry_count' <> '2'
     or (select scoring_rules->>'parent_draw_id' from public.draws where id=bronze_id) <> silver_id::text
     or (select count(*) from public.draw_matches where draw_id=bronze_id) <> 1 then
    raise exception 'Incorrect Bronze source or bracket';
  end if;

  select public.native_save_event_play_days(101, days, '{"2035-01-21":null}') into changes;
  if changes <> 1 or (select match_duration_minutes from public.event_play_days where event_id=101 and play_date='2035-01-21') <> 45 then
    raise exception 'Play day did not save correctly';
  end if;
  select public.native_save_event_play_days(101, days, '{"2035-01-21":null}') into changes;
  if changes <> 0 then raise exception 'Identical play-day retry wrote an extra change'; end if;

  begin
    perform public.native_save_event_play_days(101, jsonb_set(days,'{0,courts_count}','3'), '{"2035-01-21":null}');
    raise exception 'Stale version unexpectedly changed play day';
  exception when raise_exception then
    if sqlerrm not like 'Play day % changed after review%' then raise; end if;
  end;
end $$;
reset role;
rollback;
