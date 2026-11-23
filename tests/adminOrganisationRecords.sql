\set ON_ERROR_STOP on
-- Run against a separate empty local fixture database, never a shared project.
do $$ begin
  if current_database() <> 'fourm_admin_organisation_test' or to_regclass('public.organisations') is not null then
    raise exception 'Use an empty disposable fourm_admin_organisation_test database';
  end if;
  if not exists(select from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create schema auth;
create schema private;
create schema banking_private;
grant usage on schema private to authenticated;
create table auth.users (
  id uuid default gen_random_uuid() primary key, email text not null, deleted_at timestamptz,
  email_confirmed_at timestamptz, is_anonymous boolean default false, banned_until timestamptz
);
create function auth.email() returns text language sql
  as $$select current_setting('fixture.actor',true)$$;
create function public.is_super_admin(actor text) returns boolean language sql
  as $$select actor='admin@example.invalid'$$;
create function private.permission_actor_active() returns boolean language sql
  as $$select current_setting('fixture.active',true)='yes'$$;
create table public.players (id bigint primary key, email text not null);
create table public.organisations (
  id uuid primary key, name text not null, slug text not null unique, contact_email text not null,
  created_by bigint references public.players(id), status text, verified boolean, approved_at timestamptz
);
create table public.organisation_members (
  id uuid default gen_random_uuid() primary key, organisation_id uuid not null references public.organisations(id) on delete cascade,
  player_id bigint references public.players(id), user_email text not null check(user_email <> 'blocked-owner@example.invalid'),
  role text not null, unique(organisation_id,user_email)
);
create table public.calendar (id bigint primary key, organisation_id uuid references public.organisations(id) on delete set null);
create table public.albums (id uuid default gen_random_uuid() primary key, organisation_id uuid references public.organisations(id) on delete set null);
create table public.club_organisations (organisation_id uuid references public.organisations(id) on delete cascade);
create table banking_private.accounts (organisation_id uuid references public.organisations(id) on delete cascade);
create table banking_private.payout_requests (organisation_id uuid references public.organisations(id) on delete cascade);
\ir ../supabase/migrations/20261119112616_admin_organisation_records.sql

create function pg_temp.expect(ok boolean, description text) returns void language plpgsql
as $$begin if ok is distinct from true then raise exception 'Assertion failed: %', description; end if; end$$;
create function pg_temp.rejects(statement text, expected text) returns void language plpgsql
as $$
begin
  begin
    execute statement;
  exception when others then
    if position(expected in sqlerrm)>0 then return; end if;
    raise exception 'Expected %; received %', expected, sqlerrm;
  end;
  raise exception 'Expected rejection: %', expected;
end
$$;

insert into public.players values(7,'owner@example.invalid'),(8,'teammate@example.invalid'),(9,'blocked-owner@example.invalid');
insert into auth.users(email,email_confirmed_at) values
 ('owner@example.invalid',now()),('teammate@example.invalid',now()),('blocked-owner@example.invalid',now());
select pg_temp.expect(not has_function_privilege('anon','public.admin_organisation_records(text,uuid,jsonb,jsonb)','EXECUTE'),'anon execute denied');
select pg_temp.expect(has_function_privilege('authenticated','public.admin_organisation_records(text,uuid,jsonb,jsonb)','EXECUTE'),'authenticated execute granted');
set fixture.active='yes';
set fixture.actor='tenant@example.invalid';
set role authenticated;
select pg_temp.rejects($$select public.admin_organisation_records('capability')$$,'Current platform super-admin access is required');
reset role;
set fixture.actor='admin@example.invalid';
set fixture.active='no';
set role authenticated;
select pg_temp.rejects($$select public.admin_organisation_records('capability')$$,'Current platform super-admin access is required');
reset role;
set fixture.active='yes';

do $test$
declare
  target uuid := '10000000-0000-4000-8000-000000000001';
  failed uuid := '10000000-0000-4000-8000-000000000002';
  owner public.organisation_members;
  added public.organisation_members;
  expected jsonb := '{"name":"Fixture host","status":"approved"}';
  draft jsonb := '{"name":"Fixture host","slug":"fixture-host","player_id":7,"email":"owner@example.invalid"}';
begin
  perform pg_temp.expect((public.admin_organisation_records('capability')->>'can_manage')::boolean,'platform capability');
  perform pg_temp.rejects(format('select public.admin_organisation_records(%L,%L,%L,%L)','create',failed,'{}',
    '{"name":"Blocked","slug":"blocked","player_id":9,"email":"blocked-owner@example.invalid"}'),'check constraint');
  perform pg_temp.expect(not exists(select 1 from public.organisations where id=failed),'owner insert failure rolls back organisation');
  perform pg_temp.rejects(format('select public.admin_organisation_records(%L,%L,%L,%L)','create',failed,'{}',
    '{"name":"Mismatch","slug":"mismatch","player_id":7,"email":"teammate@example.invalid"}'),'existing, verified player account');
  perform pg_temp.expect((public.admin_organisation_records('create',target,'{}',draft)->>'id')::uuid=target,'organisation created');
  perform pg_temp.expect((public.admin_organisation_records('create',target,'{}',draft)->>'reused')::boolean,'same reviewed create is idempotent');
  select * into owner from public.organisation_members where organisation_id=target and role='owner';
  perform pg_temp.expect(owner.player_id=7 and owner.user_email='owner@example.invalid','correct owner only');
  perform pg_temp.rejects(format('select public.admin_organisation_records(%L,%L,%L,%L)','remove_member',target,expected||jsonb_build_object('member',to_jsonb(owner)),'{}'),'final owner');
  perform public.admin_organisation_records('add_member',target,expected,'{"role":"staff","player_id":8,"email":"teammate@example.invalid"}');
  select * into added from public.organisation_members where organisation_id=target and player_id=8;
  perform pg_temp.expect(added.role='staff','new member has exact selected role');
  perform public.admin_organisation_records('change_role',target,expected||jsonb_build_object('member',to_jsonb(added)),'{"role":"admin"}');
  perform pg_temp.rejects(format('select public.admin_organisation_records(%L,%L,%L,%L)','remove_member',target,expected||jsonb_build_object('member',to_jsonb(added)),'{}'),'member changed');
  select * into added from public.organisation_members where organisation_id=target and player_id=8;
  perform public.admin_organisation_records('remove_member',target,expected||jsonb_build_object('member',to_jsonb(added)),'{}');
  perform pg_temp.expect(not exists(select 1 from public.organisation_members where id=added.id),'exact membership removed');
  insert into public.calendar values(1,target);
  insert into public.albums(organisation_id) values(target);
  insert into public.club_organisations values(target);
  insert into banking_private.payout_requests values(target);
  perform pg_temp.rejects(format('select public.admin_organisation_records(%L,%L,%L,%L)','delete',target,expected,'{"confirmation":"Fixture host"}'),'banking or payout records');
  perform pg_temp.expect((select organisation_id=target from public.calendar where id=1),'payout guard keeps associations');
  delete from banking_private.payout_requests where organisation_id=target;
  perform public.admin_organisation_records('delete',target,expected,'{"confirmation":"Fixture host"}');
  perform pg_temp.expect((select organisation_id is null from public.calendar where id=1),'event retained and unlinked');
  perform pg_temp.expect((select organisation_id is null from public.albums),'album retained and unlinked');
  perform pg_temp.expect(not exists(select 1 from public.club_organisations),'club authority removed');
  perform pg_temp.expect(not exists(select 1 from public.organisation_members),'memberships removed');
end
$test$;
