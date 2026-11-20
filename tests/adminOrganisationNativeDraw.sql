\set ON_ERROR_STOP on
do $$ begin
  if current_database() <> 'fourm_organisation_native_draw_test' or to_regclass('public.draws') is not null then
    raise exception 'Use the empty disposable fourm_organisation_native_draw_test database';
  end if;
end $$;
begin;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create schema auth;
grant usage on schema auth to authenticated, anon;
create function auth.email() returns text language sql stable as $$ select nullif(current_setting('host_draw.email', true), '') $$;
create function auth.uid() returns uuid language sql stable as $$ select case when auth.email() is not null then '11111111-1111-4111-8111-111111111111'::uuid end $$;
create function public.account_is_active() returns boolean language sql stable as $$ select auth.email() is distinct from 'inactive@example.invalid' $$;
create function public.is_super_admin(email text) returns boolean language sql stable as $$ select false $$;
create function public.is_4m_admin() returns boolean language sql stable as $$ select false $$;
create function public.is_org_admin(id bigint) returns boolean language sql stable as $$ select false $$;
create table public.organisations(id uuid primary key,status text);
create table public.organisation_members(organisation_id uuid,user_email text,role text);
create table public.calendar(id bigint primary key,organization_id bigint,organisation_id uuid,is_manual boolean,event_status text);
create table public.tournament_divisions(id uuid primary key,event_id bigint references public.calendar,is_active boolean);
create table public.event_registrations(id uuid primary key);
create table public.players(id bigint primary key);

\ir ../supabase/migrations/20260819_native_draw_data_model.sql
alter table public.draw_matches add column is_featured boolean default false;
\ir ../supabase/migrations/20261120070002_reviewed_organisation_native_draw_actions.sql
\ir ../supabase/migrations/20261120120915_scope_reviewed_organisation_draw_plates.sql

insert into public.organisations values
  ('aaaaaaaa-1111-4111-8111-111111111111','approved'), ('bbbbbbbb-2222-4222-8222-222222222222','approved');
insert into public.organisation_members values
  ('aaaaaaaa-1111-4111-8111-111111111111',' OWNER@example.invalid ','owner'),
  ('aaaaaaaa-1111-4111-8111-111111111111','host-admin@example.invalid','admin'),
  ('aaaaaaaa-1111-4111-8111-111111111111','staff@example.invalid','staff'),
  ('aaaaaaaa-1111-4111-8111-111111111111','inactive@example.invalid','owner'),
  ('bbbbbbbb-2222-4222-8222-222222222222','other-admin@example.invalid','owner');
insert into public.calendar values
  (101,null,'aaaaaaaa-1111-4111-8111-111111111111',true,'active'),
  (102,null,'bbbbbbbb-2222-4222-8222-222222222222',true,'active');
insert into public.tournament_divisions values
  ('11111111-0000-4000-8000-000000000101',101,true), ('11111111-0000-4000-8000-000000000102',102,true);
insert into public.draws(id,event_id,division_id,format,status,updated_at)
values ('22222222-0000-4000-8000-000000000101',101,'11111111-0000-4000-8000-000000000101','knockout','published','2035-01-20T00:00:00Z'),
       ('22222222-0000-4000-8000-000000000102',102,'11111111-0000-4000-8000-000000000102','knockout','published','2035-01-20T00:00:00Z');
insert into public.draw_entries(id,draw_id,team_name,player_one_name)
values ('33333333-0000-4000-8000-000000000001','22222222-0000-4000-8000-000000000101','One','Player One'),
       ('33333333-0000-4000-8000-000000000002','22222222-0000-4000-8000-000000000101','Two','Player Two');
insert into public.draw_matches(id,draw_id,stage,round_code,round_label,round_number,bracket_position,entry_one_id,entry_two_id,status,scheduled_start,updated_at)
values ('44444444-0000-4000-8000-000000000101','22222222-0000-4000-8000-000000000101','knockout','final','Final',1,1,
        '33333333-0000-4000-8000-000000000001','33333333-0000-4000-8000-000000000002','scheduled','2035-01-21T00:00:00Z','2035-01-20T00:00:00Z'),
       ('44444444-0000-4000-8000-000000000102','22222222-0000-4000-8000-000000000102','knockout','final','Final',1,1,
        null,null,'pending',null,'2035-01-20T00:00:00Z');

set local role authenticated;
do $$
declare
  org uuid := 'aaaaaaaa-1111-4111-8111-111111111111';
  own_draw uuid := '22222222-0000-4000-8000-000000000101';
  foreign_draw uuid := '22222222-0000-4000-8000-000000000102';
  own_match uuid := '44444444-0000-4000-8000-000000000101';
  foreign_match uuid := '44444444-0000-4000-8000-000000000102';
  first_version timestamptz := '2035-01-20T00:00:00Z';
  match_version timestamptz;
  receipt jsonb;
  actor text;
begin
  foreach actor in array array['staff@example.invalid','inactive@example.invalid','other-admin@example.invalid','host_admin@example.invalid',''] loop
    perform set_config('host_draw.email',actor,true);
    begin
      perform public.native_manage_organisation_draw(org,101,own_draw,first_version,'feature',own_match,first_version);
      raise exception 'Unapproved actor successfully performed a host operation';
    exception when insufficient_privilege then null;
    end;
  end loop;
  perform set_config('host_draw.email','owner@example.invalid',true);
  if has_function_privilege('anon','public.native_manage_organisation_draw(uuid,bigint,uuid,timestamptz,text,uuid,timestamptz,jsonb)','EXECUTE')
    or has_function_privilege('service_role','public.native_manage_organisation_draw(uuid,bigint,uuid,timestamptz,text,uuid,timestamptz,jsonb)','EXECUTE')
    then raise exception 'Unexpected client grant'; end if;
  begin
    perform public.native_manage_organisation_draw(org,102,foreign_draw,first_version,'feature',foreign_match,first_version);
    raise exception 'Foreign event host was accepted';
  exception when raise_exception then if sqlerrm not like 'Choose an active event owned%' then raise; end if;
  end;
  begin
    perform public.native_manage_organisation_draw(org,101,foreign_draw,first_version,'feature',foreign_match,first_version);
    raise exception 'Foreign draw was accepted';
  exception when raise_exception then if sqlerrm not like 'Choose an active published draw%' then raise; end if;
  end;
  begin
    perform public.native_manage_organisation_draw(org,101,own_draw,first_version,'feature',foreign_match,first_version);
    raise exception 'Foreign match was accepted';
  exception when raise_exception then if sqlerrm not like 'The reviewed match changed%' then raise; end if;
  end;
  begin
    perform public.native_manage_organisation_draw(org,101,own_draw,first_version,'rank');
    raise exception 'Org gained global ranking authority';
  exception when insufficient_privilege then null;
  end;
  receipt := public.native_manage_organisation_draw(org,101,own_draw,first_version,'live',own_match,first_version);
  if receipt->>'status' <> 'in_progress' or receipt->>'match_id' <> own_match::text then raise exception 'Live receipt incorrect'; end if;
  begin
    perform public.native_manage_organisation_draw(org,101,own_draw,first_version,'feature',own_match,first_version);
    raise exception 'Stale reviewed match was accepted';
  exception when raise_exception then if sqlerrm not like 'The reviewed match changed%' then raise; end if;
  end;
  select updated_at into match_version from public.draw_matches where id=own_match;
  perform set_config('host_draw.email','host-admin@example.invalid',true);
  receipt := public.native_manage_organisation_draw(org,101,own_draw,first_version,'live',own_match,match_version);
  if receipt->>'status' <> 'scheduled' then raise exception 'Clearing live did not restore scheduled'; end if;
  select updated_at into match_version from public.draw_matches where id=own_match;
  receipt := public.native_manage_organisation_draw(org,101,own_draw,first_version,'feature',own_match,match_version);
  if receipt->>'featured' <> 'true' or coalesce((select is_featured from public.draw_matches where id=foreign_match),true) then
    raise exception 'Featuring changed the wrong match';
  end if;
  begin
    perform public.native_manage_organisation_draw(org,101,own_draw,first_version,'complete',null,null,'{}');
    raise exception 'Unresolved draw was completed';
  exception when raise_exception then if sqlerrm not like 'The reviewed results changed%' then raise; end if;
  end;
end $$;
reset role;
update public.draw_matches set status='completed',updated_at='2035-01-20T02:00:00Z'
  where id='44444444-0000-4000-8000-000000000101';
set local role authenticated;
do $$
declare
  receipt jsonb;
  reviewed jsonb := '{"44444444-0000-4000-8000-000000000101":["completed","2035-01-20T02:00:00Z"]}';
begin
  begin
    perform public.native_manage_organisation_draw('aaaaaaaa-1111-4111-8111-111111111111',101,
      '22222222-0000-4000-8000-000000000101','2035-01-20T00:00:00Z','complete',null,null,
      '{"44444444-0000-4000-8000-000000000101":["completed","2035-01-20T01:00:00Z"]}');
    raise exception 'Stale completion version was accepted';
  exception when raise_exception then if sqlerrm not like 'The reviewed results changed%' then raise; end if;
  end;
  receipt := public.native_manage_organisation_draw('aaaaaaaa-1111-4111-8111-111111111111',101,
    '22222222-0000-4000-8000-000000000101','2035-01-20T00:00:00Z','complete',null,null,reviewed);
  if receipt->>'status' <> 'completed'
    or (select status from public.draws where id='22222222-0000-4000-8000-000000000102') <> 'published' then
    raise exception 'Completion changed the wrong draw';
  end if;
end $$;

reset role;
insert into public.tournament_divisions values ('11111111-0000-4000-8000-000000000103',101,true);
insert into public.organisations values ('cccccccc-3333-4333-8333-333333333333','pending');
insert into public.organisation_members values ('cccccccc-3333-4333-8333-333333333333','owner@example.invalid','owner');
insert into public.calendar values
  (104,null,'aaaaaaaa-1111-4111-8111-111111111111',true,'cancelled'),
  (105,null,'aaaaaaaa-1111-4111-8111-111111111111',false,'active'),
  (106,null,'cccccccc-3333-4333-8333-333333333333',true,'active');
insert into public.draws(id,event_id,division_id,format,status,scoring_rules,updated_at)
values ('22222222-0000-4000-8000-000000000103',101,'11111111-0000-4000-8000-000000000103',
    'knockout','completed','{"plate_mode":"triple"}','2035-01-20T00:00:00Z');
insert into public.draw_entries(draw_id, team_name, player_one_name, seed_number)
select '22222222-0000-4000-8000-000000000103'::uuid, 'Team ' || n, 'Player ' || n,n from generate_series(1,12)n;
insert into public.draw_matches(draw_id,stage,round_code,round_label,round_number,bracket_position,
    entry_one_id,entry_two_id,winner_entry_id,loser_entry_id,status,result_type,updated_at)
select a.draw_id,'knockout','r4','Round of 16',1,(a.seed_number+1)/2,a.id,b.id,a.id,b.id,
    'completed','played','2035-01-20T01:00:00Z'
from public.draw_entries a join public.draw_entries b on b.draw_id=a.draw_id and b.seed_number=a.seed_number+1
where a.draw_id='22222222-0000-4000-8000-000000000103' and a.seed_number % 2=1;

set local role authenticated;
do $$
declare
  org uuid := 'aaaaaaaa-1111-4111-8111-111111111111';
  eligible uuid := '22222222-0000-4000-8000-000000000101';
  main_id uuid := '22222222-0000-4000-8000-000000000103';
  foreign_draw uuid := '22222222-0000-4000-8000-000000000102';
  first_version timestamptz := '2035-01-20T00:00:00Z';
  versions jsonb;
  receipt jsonb;
  version timestamptz;
  silver_id uuid;
  actor text;
  unavailable bigint;
begin
  if has_function_privilege('anon','public.native_manage_organisation_draw_plate(uuid,bigint,uuid,timestamptz,text,jsonb)','EXECUTE')
    or has_function_privilege('service_role','public.native_manage_organisation_draw_plate(uuid,bigint,uuid,timestamptz,text,jsonb)','EXECUTE')
    or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private'
      and p.proname in ('native_enable_reviewed_silver_plate','native_create_reviewed_linked_plate')
      and has_function_privilege('authenticated',p.oid,'EXECUTE'))
    then raise exception 'Plates exposed beyond the scoped RPC'; end if;
  foreach actor in array array['staff@example.invalid','inactive@example.invalid','other-admin@example.invalid','host_admin@example.invalid',''] loop
    perform set_config('host_draw.email',actor,true);
    begin
      perform public.native_manage_organisation_draw_plate(org,101,main_id,first_version,'create-plate','{}');
      raise exception 'Unapproved current actor could create a plate';
    exception when insufficient_privilege then null;
    end;
  end loop;
  perform set_config('host_draw.email','owner@example.invalid',true);
  foreach unavailable in array array[104,105,106]::bigint[] loop
    begin
      perform public.native_manage_organisation_draw_plate(
        case when unavailable=106 then 'cccccccc-3333-4333-8333-333333333333'::uuid else org end,
        unavailable,main_id,first_version,'create-plate','{}');
      raise exception 'A cancelled, imported or unapproved event could create a plate';
    exception when insufficient_privilege then null;
    end;
  end loop;
  begin
    perform public.native_manage_organisation_draw_plate(org,102,foreign_draw,first_version,'enable-silver');
    raise exception 'Foreign organisation draw could be amended';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.native_manage_organisation_draw_plate(org,101,foreign_draw,first_version,'enable-silver');
    raise exception 'Foreign event draw ID could be substituted';
  exception when raise_exception then if sqlerrm not like 'Choose an eligible published main draw%' then raise; end if;
  end;
  begin
    perform public.native_enable_silver_plate(101,eligible,first_version);
    raise exception 'Organisation could invoke the platform RPC';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.native_manage_organisation_draw_plate(org,101,eligible,first_version,'enable-silver');
    raise exception 'Stale Silver settings could be applied';
  exception when raise_exception then if sqlerrm not like 'The draw changed.%' then raise; end if;
  end;
  select updated_at into version from public.draws where id=eligible;
  receipt := public.native_manage_organisation_draw_plate(org,101,eligible,version,'enable-silver');
  if receipt->>'source_draw_id' <> eligible::text or receipt->>'plate_mode' <> 'double'
    or receipt->>'organisation_id' <> org::text or receipt->>'updated_at'=version::text
    or exists (select 1 from public.draws where event_id=101 and draw_kind='silver') then
      raise exception 'Enabling Silver did not make just the reviewed draw setting change';
  end if;

  select jsonb_object_agg(id::text,updated_at) into versions from public.draw_matches where draw_id=main_id;
  perform set_config('host_draw.email','host-admin@example.invalid',true);
  begin
    perform public.native_manage_organisation_draw_plate(org,101,main_id,first_version,'create-plate','{}');
    raise exception 'An unreviewed set of opening results could create a plate';
  exception when raise_exception then if sqlerrm not like 'The opening matches changed%' then raise; end if;
  end;
  receipt := public.native_manage_organisation_draw_plate(org,101,main_id,first_version,'create-plate',versions);
  silver_id := (receipt->>'id')::uuid;
  if receipt->>'kind' <> 'silver' or receipt->>'entry_count' <> '6'
    or (select status from public.draws where id=silver_id) <> 'published'
    or (select array_agg(team_name order by seed_number) from public.draw_entries where draw_id=silver_id)
      is distinct from array['Team 2','Team 4','Team 6','Team 8','Team 10','Team 12']
    or (select count(*) from public.draw_matches
          where draw_id=silver_id and round_number=2 and (entry_one_id is not null or entry_two_id is not null)) <> 2 then
    raise exception 'The host Silver plate did not preserve the reviewed losers, seed order or bye routing';
  end if;
  receipt := public.native_manage_organisation_draw_plate(org,101,main_id,first_version,'create-plate',versions);
  if receipt->>'created' <> 'false' or receipt->>'id' <> silver_id::text then raise exception 'Identical review duplicated a plate'; end if;
end $$;

reset role;
update public.draw_matches m set winner_entry_id=entry_one_id,loser_entry_id=entry_two_id,
  status='completed',result_type='played',updated_at='2035-01-20T03:00:00Z'
where m.draw_id=(select id from public.draws where event_id=101 and draw_kind='silver')
  and m.round_number=1 and m.entry_one_id is not null and m.entry_two_id is not null;

set local role authenticated;
do $$
declare
  org uuid := 'aaaaaaaa-1111-4111-8111-111111111111';
  source_draw public.draws;
  versions jsonb;
  receipt jsonb;
  bronze_id uuid;
begin
  select * into source_draw from public.draws where event_id=101 and draw_kind='silver';
  select jsonb_object_agg(id::text,updated_at) into versions
    from public.draw_matches where draw_id=source_draw.id and round_number=1;
  receipt := public.native_manage_organisation_draw_plate(org,101,source_draw.id,source_draw.updated_at,'create-plate',versions);
  bronze_id := (receipt->>'id')::uuid;
  if receipt->>'kind' <> 'bronze' or receipt->>'entry_count' <> '2'
    or (select scoring_rules->>'parent_draw_id' from public.draws where id=bronze_id) <> source_draw.id::text
    or (select count(*) from public.draw_matches where draw_id=bronze_id) <> 1
    or exists (select 1 from public.draws where event_id=102 and draw_kind in ('silver','bronze')) then
    raise exception 'The host Bronze plate used an incorrect parent or event';
  end if;
end $$;
rollback;
