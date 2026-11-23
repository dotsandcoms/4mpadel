\set ON_ERROR_STOP on
do $$ begin
  if current_database() <> 'fourm_admin_club_group_team_test' or to_regclass('public.clubs') is not null then
    raise exception 'Use an empty disposable fourm_admin_club_group_team_test database';
  end if;
  if not exists(select from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create schema auth;
create schema private;
grant usage on schema private to authenticated;
create table auth.users (
  id uuid primary key default gen_random_uuid(), email text not null, deleted_at timestamptz,
  email_confirmed_at timestamptz, is_anonymous boolean default false, banned_until timestamptz
);
create function auth.email() returns text language sql as $$select current_setting('fixture.actor',true)$$;
create function public.is_super_admin(actor text) returns boolean language sql as $$select actor='admin@example.invalid'$$;
create function private.permission_actor_active() returns boolean language sql as $$select current_setting('fixture.active',true)='yes'$$;
create table public.players (id bigint primary key, name text not null, email text not null);
create table public.club_groups (id uuid primary key, name text not null);
create table public.clubs (id uuid primary key, name text not null, group_id uuid references public.club_groups(id));
create table public.club_members (
  id uuid primary key default gen_random_uuid(), club_id uuid not null references public.clubs(id),
  player_id bigint references public.players(id), user_email text not null, role text not null, unique(club_id,user_email)
);
\ir ../supabase/migrations/20261119113710_admin_club_group_bulk_team_access.sql

create function pg_temp.expect(ok boolean, description text) returns void language plpgsql
as $$begin if ok is distinct from true then raise exception 'Assertion failed: %', description; end if; end$$;
create function pg_temp.rejects(statement text, expected text) returns void language plpgsql
as $$begin
  begin execute statement;
  exception when others then
    if position(expected in sqlerrm)>0 then return; end if;
    raise exception 'Expected %; received %', expected, sqlerrm;
  end;
  raise exception 'Expected rejection: %', expected;
end$$;

select pg_temp.expect(not has_function_privilege('anon','public.admin_club_group_team_access(uuid,bigint,text,jsonb)','EXECUTE'),'anon denied');
set fixture.active='yes';
set fixture.actor='tenant@example.invalid';
set role authenticated;
select pg_temp.rejects($deny$select public.admin_club_group_team_access()$deny$,'Current platform super-admin access is required');
reset role;
set fixture.actor='admin@example.invalid';
set role authenticated;
select pg_temp.expect((public.admin_club_group_team_access()->>'can_assign')::boolean,'authenticated platform capability');
reset role;

insert into public.players values(7,'Reviewed player','teammate@example.invalid');
insert into auth.users(email,email_confirmed_at) values('teammate@example.invalid',now());
insert into public.club_groups values('20000000-0000-4000-8000-000000000001','Fixture group');
insert into public.clubs values
 ('30000000-0000-4000-8000-000000000001','First','20000000-0000-4000-8000-000000000001'),
 ('30000000-0000-4000-8000-000000000002','Second','20000000-0000-4000-8000-000000000001'),
 ('30000000-0000-4000-8000-000000000003','Other',null);
insert into public.club_members values('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',7,'teammate@example.invalid','owner');

do $test$
declare
  group_id uuid := '20000000-0000-4000-8000-000000000001';
  first_id uuid := '30000000-0000-4000-8000-000000000001';
  second_id uuid := '30000000-0000-4000-8000-000000000002';
  other_id uuid := '30000000-0000-4000-8000-000000000003';
  review jsonb;
  result jsonb;
begin
  review := jsonb_build_object('group_name','Fixture group','player_name','Reviewed player','player_email','teammate@example.invalid',
    'venues',jsonb_build_array(jsonb_build_object('id',first_id,'name','First','member',null),
      jsonb_build_object('id',second_id,'name','Second','member',(select to_jsonb(m)-'club_id' from public.club_members m where m.club_id=second_id))));
  update public.club_members set role='staff' where club_id=second_id;
  perform pg_temp.rejects(format('select public.admin_club_group_team_access(%L,7,%L,%L)',group_id,'admin',review),'reviewed venue membership changed');
  perform pg_temp.expect(not exists(select from public.club_members m where m.club_id=first_id),'stale later venue rolls back earlier update');
  update public.club_members set role='owner' where club_id=second_id;
  result := public.admin_club_group_team_access(group_id,7,'admin',review);
  perform pg_temp.expect(result->'changed'=jsonb_build_array(first_id),'updates selected missing membership only');
  perform pg_temp.expect(result->'preserved'=jsonb_build_array(second_id),'retains exact existing owner');
  perform pg_temp.expect((select role='owner' from public.club_members m where m.club_id=second_id),'owner role never demoted');
  perform pg_temp.expect(not exists(select from public.club_members m where m.club_id=other_id),'foreign venue untouched');
end
$test$;
