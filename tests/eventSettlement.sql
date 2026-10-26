\set ON_ERROR_STOP on
begin;
create schema if not exists auth;
create schema if not exists private;
do $$ begin if not exists(select from pg_roles where rolname='authenticated') then create role authenticated; end if; end $$;
create table public.calendar(id integer primary key, event_name text);
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid', true),'')::uuid $$;
create function auth.email() returns text language sql as $$ select current_setting('test.email', true) $$;
create function public.account_is_active() returns boolean language sql as $$ select current_setting('test.active', true)='true' $$;
create function public.is_super_admin(text) returns boolean language sql as $$ select $1='super@example.com' $$;
\i supabase/migrations/20261019132211_organiser_settlement_confirmation.sql
grant usage on schema public,auth,private to authenticated;
grant select,update,insert on public.calendar to authenticated;
insert into calendar(id,event_name) values(1,'Test event');
set local role authenticated;
select set_config('test.uid','00000000-0000-0000-0000-000000000001',true),set_config('test.email','manager@example.com',true),set_config('test.active','true',true);
do $$ begin
  begin update calendar set organiser_settlement_confirmation='{}' where id=1; raise exception 'Manager was allowed to confirm'; exception when insufficient_privilege then null; end;
  begin insert into calendar values(2,'Inserted event','{}'); raise exception 'Manager inserted a confirmation'; exception when insufficient_privilege then null; end;
end $$;
update calendar set event_name='Normal event edit still works' where id=1;
select set_config('test.email','super@example.com',true);
update calendar set organiser_settlement_confirmation='{"version":1}' where id=1;
select set_config('test.active','false',true);
do $$ begin
  begin update calendar set organiser_settlement_confirmation='{}' where id=1; raise exception 'Inactive super admin was allowed to confirm'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  if (select organiser_settlement_confirmation from calendar where id=1) <> '{"version":1}'::jsonb then raise exception 'Confirmation unexpectedly changed'; end if;
end $$;
rollback;
