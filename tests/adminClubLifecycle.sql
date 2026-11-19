\set ON_ERROR_STOP on
do $$ begin
    if current_database() <> 'fourm_club_lifecycle_test'
        or to_regclass('public.clubs') is not null then raise exception 'Use the empty disposable club lifecycle test database'; end if;
end $$;

do $$ begin
    if not exists (select from pg_roles where rolname='anon') then create role anon; end if;
    if not exists (select from pg_roles where rolname='authenticated') then create role authenticated; end if;
    if not exists (select from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create schema auth;
create schema private;
grant usage on schema auth, private to authenticated;
create function auth.uid() returns uuid language sql stable as $$
select nullif(current_setting('fixture.actor',true),'')::uuid $$;
create function auth.email() returns text language sql stable as $$
select current_setting('fixture.email',true) $$;
create function public.account_is_active() returns boolean language sql stable as $$
select current_setting('fixture.active',true) = 'true' $$;
create function public.is_super_admin(email text) returns boolean language sql stable as $$
select email = 'platform@example.test' $$;

create table public.clubs (
    id uuid primary key, name text not null, short_name text, about text, city text, province text, country text,
    address text, lat numeric, lng numeric, website_url text, contact_email text, contact_phone text,
    whatsapp_number text, logo_url text, cover_image_url text, status text, updated_at timestamptz default now()
);
create table public.players (id int primary key, club_id uuid references public.clubs(id));
create table public.calendar (id int primary key, club_id uuid references public.clubs(id) on delete set null);
create table public.club_members (club_id uuid references public.clubs(id) on delete cascade, user_email text, role text);
create table public.club_organisations (club_id uuid references public.clubs(id) on delete cascade, organisation_id uuid);
create table public.club_claim_requests (club_id uuid references public.clubs(id) on delete cascade, requester_email text, status text);
create table public.club_claim_invites (club_id uuid references public.clubs(id) on delete cascade);
create table public.club_google_matches (club_id uuid references public.clubs(id) on delete cascade);
create table public.club_favourites (
    user_id uuid, club_id uuid references public.clubs(id) on delete cascade, created_at timestamptz default now(),
    primary key(user_id,club_id)
);

\ir ../supabase/migrations/20260803_merge_clubs_function.sql
\ir ../supabase/migrations/20261119112407_reviewed_club_lifecycle.sql

insert into public.clubs(id,name,city,status) values
('10000000-0000-4000-8000-000000000001','Source club','Coast','published'),
('10000000-0000-4000-8000-000000000002','Destination club','Coast','published'),
('10000000-0000-4000-8000-000000000003','Remove club','Inland','draft');
insert into public.players values (1,'10000000-0000-4000-8000-000000000001');
insert into public.calendar values (1,'10000000-0000-4000-8000-000000000001'), (2,'10000000-0000-4000-8000-000000000003');
insert into public.club_members values
('10000000-0000-4000-8000-000000000001','same@example.test','owner'),
('10000000-0000-4000-8000-000000000002','same@example.test','member'),
('10000000-0000-4000-8000-000000000001','incoming@example.test','member');
insert into public.club_favourites(user_id,club_id) values
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002'),
('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001');

begin;
select set_config('fixture.actor','30000000-0000-4000-8000-000000000001',true);
select set_config('fixture.active','true',true);
select set_config('fixture.email','tenant@example.test',true);
set local role authenticated;
do $$ begin
    begin
        perform public.manage_reviewed_club('review-delete','10000000-0000-4000-8000-000000000001');
        raise exception 'Tenant preview should be denied';
    exception when insufficient_privilege then null; end;
    if has_table_privilege('authenticated','private.club_lifecycle_audit','select') then raise exception 'Lifecycle audit must stay private'; end if;
end $$;
select set_config('fixture.email','platform@example.test',true);
do $$
declare
    source constant uuid := '10000000-0000-4000-8000-000000000001';
    target constant uuid := '10000000-0000-4000-8000-000000000002';
    removable constant uuid := '10000000-0000-4000-8000-000000000003';
    request constant uuid := '40000000-0000-4000-8000-000000000001';
    review jsonb;
    result jsonb;
begin
    review := public.manage_reviewed_club('review-delete', source);
    if review #>> '{source,players}' <> '1' then raise exception 'Linked player count is incorrect'; end if;
    begin
        perform public.manage_reviewed_club('delete', source, null, review, request);
        raise exception 'Club with players must be retained';
    exception when others then
        if sqlerrm not like '%linked players%' then raise; end if;
    end;
    review := public.manage_reviewed_club('review-merge', source, target);
    begin
        perform public.manage_reviewed_club('merge', source, target, jsonb_set(review,'{source,members}','0'), request);
        raise exception 'Stale review should be denied';
    exception when serialization_failure then null; end;
    result := public.manage_reviewed_club('merge', source, target, review, request);
    if result->>'events_moved' <> '1' or result->>'favourites_moved' <> '1'
        or result->>'members_skipped_duplicate' <> '1' then raise exception 'Unexpected merge result: %', result; end if;
    if public.manage_reviewed_club('merge', source, target, review, request) is distinct from result then
        raise exception 'Exact replay must return the committed result';
    end if;
    begin
        perform public.manage_reviewed_club('delete',removable,null,review,request);
        raise exception 'Reusing a request for a different action should be denied';
    exception when insufficient_privilege then null; end;
    review := public.manage_reviewed_club('review-delete', removable);
    perform public.manage_reviewed_club('delete', removable, null, review, '40000000-0000-4000-8000-000000000002');
end $$;
reset role;
do $$ begin
    if exists (select 1 from public.clubs where name in ('Source club','Remove club'))
        or (select count(*) from public.club_favourites) <> 2
        or not exists (select 1 from public.calendar c join public.clubs d on c.club_id=d.id where c.id=1 and d.name='Destination club')
        or not exists (select 1 from public.calendar where id=2 and club_id is null)
        or (select count(*) from private.club_lifecycle_audit) <> 2
        or (select role from public.club_members where user_email='same@example.test') <> 'member' then
        raise exception 'Lifecycle relationships and audit did not match the confirmed changes';
    end if;
end $$;
rollback;
