\set ON_ERROR_STOP on
do $$ begin
  if current_database()<>'fourm_admin_membership_identity_test'
    or to_regclass('public.organisation_members') is not null
    or exists(select 1 from pg_namespace where nspname='auth') then
    raise exception 'Use an empty disposable fourm_admin_membership_identity_test database.';
  end if;
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;

create schema auth;
create function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('fixture.jwt',true),'')::jsonb,'{}'::jsonb) $$;
create table public.organisation_members(organisation_id uuid not null,user_email text not null,role text not null);
create table public.club_members(club_id uuid not null,user_email text not null,role text not null);
create table public.club_organisations(club_id uuid not null,organisation_id uuid not null);
create function public.is_organisation_member(p_organisation_id uuid) returns boolean
language sql stable security definer set search_path='public' as $$ select false $$;
create function public.is_organisation_admin(p_organisation_id uuid) returns boolean
language sql stable security definer set search_path='public' as $$ select false $$;
create function public.can_manage_club(p_club_id uuid) returns boolean
language sql stable security definer set search_path='public' as $$ select false $$;
grant execute on function public.is_organisation_member(uuid), public.is_organisation_admin(uuid), public.can_manage_club(uuid)
  to public,anon,authenticated,service_role;

create temp table routine_contract as
  select oid,proowner,proacl::text,provolatile,prosecdef,proconfig
  from pg_proc where oid in ('public.is_organisation_member(uuid)'::regprocedure,
    'public.is_organisation_admin(uuid)'::regprocedure,'public.can_manage_club(uuid)'::regprocedure);

\ir ../supabase/migrations/20261120061610_exact_organisation_club_membership_email.sql

-- The hosted Calendar permission composes both exact membership helpers.
create function public.can_manage_calendar_event(p_organisation_id uuid,p_club_id uuid) returns boolean
language sql stable as $$ select (p_organisation_id is not null and public.is_organisation_admin(p_organisation_id))
  or (p_club_id is not null and public.can_manage_club(p_club_id)) $$;

insert into public.organisation_members values
  ('10000000-0000-0000-0000-000000000001','Ops_%@example.invalid','owner'),
  ('10000000-0000-0000-0000-000000000001','Staff@example.invalid','staff'),
  ('10000000-0000-0000-0000-000000000002','Ops_Elsewhere@example.invalid','admin');
insert into public.club_members values
  ('20000000-0000-0000-0000-000000000001','Ops_%@example.invalid','admin'),
  ('20000000-0000-0000-0000-000000000001','Staff@example.invalid','staff'),
  ('20000000-0000-0000-0000-000000000003','Ops_Elsewhere@example.invalid','owner');
insert into public.club_organisations values
  ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000002');

do $$
declare
  own_org constant uuid:='10000000-0000-0000-0000-000000000001';
  foreign_org constant uuid:='10000000-0000-0000-0000-000000000002';
  own_club constant uuid:='20000000-0000-0000-0000-000000000001';
  linked_club constant uuid:='20000000-0000-0000-0000-000000000002';
  foreign_club constant uuid:='20000000-0000-0000-0000-000000000003';
begin
  assert (select count(*)=3 from routine_contract k join pg_proc p on p.oid=k.oid
    and p.proowner=k.proowner and p.proacl::text is not distinct from k.proacl
    and p.provolatile=k.provolatile and p.prosecdef=k.prosecdef and p.proconfig=k.proconfig);
  assert not has_table_privilege('authenticated','public.organisation_members','select');
  assert not has_table_privilege('authenticated','public.club_members','select');

  set local role authenticated;
  perform set_config('fixture.jwt','{"email":"oPS_%@example.invalid"}',true);
  assert public.is_organisation_member(own_org);
  assert public.is_organisation_admin(own_org);
  assert public.can_manage_club(own_club);
  assert public.can_manage_club(linked_club);
  assert public.can_manage_calendar_event(own_org,null);
  assert public.can_manage_calendar_event(null,linked_club);
  assert not public.is_organisation_member(foreign_org);
  assert not public.is_organisation_admin(foreign_org);
  assert not public.can_manage_club(foreign_club);
  assert not public.can_manage_calendar_event(foreign_org,foreign_club);

  perform set_config('fixture.jwt','{"email":"STAFF@example.invalid"}',true);
  assert public.is_organisation_member(own_org);
  assert not public.is_organisation_admin(own_org);
  assert not public.can_manage_club(own_club);
  assert not public.can_manage_club(linked_club);

  perform set_config('fixture.jwt','{"email":"ops_elsewhere@example.invalid"}',true);
  assert public.is_organisation_admin(foreign_org);
  assert public.can_manage_club(foreign_club);
  assert not public.can_manage_club(linked_club);
  reset role;

  set local role anon;
  perform set_config('fixture.jwt','{}',true);
  assert not public.is_organisation_member(own_org);
  assert not public.is_organisation_admin(own_org);
  assert not public.can_manage_club(own_club);
  assert not public.can_manage_club(null);
  reset role;
end $$;
