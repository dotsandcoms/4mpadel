\set ON_ERROR_STOP on
do $$ begin
    if current_database() <> 'fourm_reviewed_club_decisions_test'
        or to_regclass('public.clubs') is not null then raise exception 'Use the empty disposable club decisions test database'; end if;
end $$;
do $$ begin
    if not exists (select from pg_roles where rolname='anon') then create role anon; end if;
    if not exists (select from pg_roles where rolname='authenticated') then create role authenticated; end if;
    if not exists (select from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;

create schema auth;
grant usage on schema auth to authenticated;
create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('fixture.actor',true),'')::uuid $$;
create function auth.email() returns text language sql stable as $$
    select current_setting('fixture.email',true) $$;
create function public.account_is_active() returns boolean language sql stable as $$
    select current_setting('fixture.active',true) = 'true' $$;
create function public.is_super_admin(email text) returns boolean language sql stable as $$
    select email = 'platform@example.test' $$;

create table public.players (id bigint primary key, email text not null);
create table public.clubs (
    id uuid primary key, name text not null, status text not null, contact_email text, contacts jsonb,
    created_by bigint references public.players, updated_at timestamptz default now(), verified boolean default false,
    approved_at timestamptz, rejection_notes text
);
create table public.club_claim_requests (
    id uuid primary key, club_id uuid not null references public.clubs, requester_email text not null,
    requester_player_id bigint references public.players, full_name text, contact_phone text, primary_role text, notes text,
    status text not null default 'pending', created_at timestamptz default now(), reviewed_at timestamptz, rejection_notes text
);
create table public.club_members (
    id uuid primary key default gen_random_uuid(), club_id uuid not null references public.clubs,
    player_id bigint references public.players, user_email text not null, role text not null,
    unique (club_id,user_email)
);
alter table public.players enable row level security;
alter table public.clubs enable row level security;
alter table public.club_claim_requests enable row level security;
alter table public.club_members enable row level security;
grant select,update on public.clubs,public.club_claim_requests,public.players to authenticated;
grant select,update,insert on public.club_members to authenticated;
create policy fixture_platform on public.players to authenticated using (public.is_super_admin(auth.email()));
create policy fixture_platform on public.clubs to authenticated using (public.is_super_admin(auth.email()));
create policy fixture_platform on public.club_claim_requests to authenticated using (public.is_super_admin(auth.email()));
create policy fixture_platform on public.club_members to authenticated using (public.is_super_admin(auth.email()))
    with check (public.is_super_admin(auth.email()) and user_email <> 'denied@example.test');

\ir ../supabase/migrations/20261120113500_admin_reviewed_club_decisions.sql

begin;
insert into public.players values (1,'applicant@example.test'),(2,'claimant@example.test'),(3,'denied@example.test');
insert into public.clubs(id,name,status,contact_email,contacts,created_by,updated_at) values
('10000000-0000-4000-8000-000000000001','Application','pending',null,
 '[{"email":"applicant@example.test"},{"email":"later@example.test","is_primary":false}]',1,'2026-11-20 08:00:00+00'),
('10000000-0000-4000-8000-000000000002','Claim club','unclaimed',null,null,null,'2026-11-20 08:00:00+00'),
('10000000-0000-4000-8000-000000000003','Denied owner','draft',null,null,null,'2026-11-20 08:00:00+00'),
('10000000-0000-4000-8000-000000000004','No owner listed','in_review',null,'[]',null,'2026-11-20 08:00:00+00'),
('10000000-0000-4000-8000-000000000005','Denied application','pending','denied@example.test',null,3,'2026-11-20 08:00:00+00');
insert into public.club_claim_requests(id,club_id,requester_email,requester_player_id,full_name,contact_phone,primary_role,notes,created_at) values
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','claimant@example.test',2,'Claimant',null,'owner',null,'2026-11-20 07:00:00+00'),
('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','denied@example.test',3,'Denied claimant',null,'owner','Check access','2026-11-20 07:00:00+00'),
('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','applicant@example.test',1,'Another claimant',null,'owner',null,'2026-11-20 07:00:00+00');
insert into public.club_members(id,club_id,player_id,user_email,role) values
('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',null,' Claimant@example.test ','staff'),
('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000004',2,'claimant@example.test','admin');

select set_config('fixture.actor','40000000-0000-4000-8000-000000000001',true);
select set_config('fixture.active','true',true);
select set_config('fixture.email','tenant@example.test',true);
set local role authenticated;

do $$
declare
    signature text := 'public.admin_reviewed_club_decision(text,uuid,text,jsonb,uuid,jsonb,text)';
    target uuid := '10000000-0000-4000-8000-000000000002';
begin
    if has_function_privilege('anon',signature,'execute') or has_function_privilege('service_role',signature,'execute')
        or not has_function_privilege('authenticated',signature,'execute') then raise exception 'Incorrect RPC grants'; end if;
    if (select prosecdef from pg_proc where oid = signature::regprocedure) then raise exception 'Decision should obey existing row policies'; end if;
    begin
        perform public.admin_reviewed_club_decision('application',target,'approved','{}');
        raise exception 'Tenant could submit a platform review';
    exception when insufficient_privilege then null; end;
    perform set_config('fixture.email','platform@example.test',true);
    perform set_config('fixture.active','false',true);
    begin
        perform public.admin_reviewed_club_decision('application',target,'approved','{}');
        raise exception 'Inactive administrator could submit a review';
    exception when insufficient_privilege then null; end;
    perform set_config('fixture.active','true',true);
    perform set_config('fixture.actor','',true);
    begin
        perform public.admin_reviewed_club_decision('application',target,'approved','{}');
        raise exception 'Missing signed-in identity could submit a review';
    exception when insufficient_privilege then null; end;
    perform set_config('fixture.actor','40000000-0000-4000-8000-000000000001',true);
end $$;

do $$
declare
    application_id uuid := '10000000-0000-4000-8000-000000000001';
    claim_club uuid := '10000000-0000-4000-8000-000000000002';
    denied_club uuid := '10000000-0000-4000-8000-000000000003';
    no_email_club uuid := '10000000-0000-4000-8000-000000000004';
    denied_application uuid := '10000000-0000-4000-8000-000000000005';
    claimant_id uuid := '20000000-0000-4000-8000-000000000001';
    denied_claim uuid := '20000000-0000-4000-8000-000000000002';
    rejected_claim uuid := '20000000-0000-4000-8000-000000000003';
    app_review jsonb := '{"name":"Application","status":"pending","contact_email":null,"contacts":[{"email":"applicant@example.test"},{"email":"later@example.test","is_primary":false}],"created_by":1,"updated_at":"2026-11-20T08:00:00Z"}';
    claim_review jsonb := '{"name":"Claim club","status":"unclaimed","updated_at":"2026-11-20T10:00:00+02:00"}';
    denied_review jsonb := '{"name":"Denied owner","status":"draft","updated_at":"2026-11-20T08:00:00Z"}';
    recipient_review jsonb := jsonb_build_object('club_id',claim_club,'requester_email','claimant@example.test',
        'requester_player_id',2,'status','pending','full_name','Claimant','contact_phone',null,
        'primary_role','owner','notes',null,'created_at','2026-11-20T07:00:00Z');
    denied_recipient jsonb := recipient_review || jsonb_build_object('club_id',denied_club,'requester_email','denied@example.test',
        'requester_player_id',3,'full_name','Denied claimant','notes','Check access');
    receipt jsonb;
begin
    begin
        perform public.admin_reviewed_club_decision('claim',claim_club,'approved',claim_review,denied_claim,denied_recipient);
        raise exception 'Decision crossed a club boundary';
    exception when serialization_failure then null; end;
    begin
        perform public.admin_reviewed_club_decision('claim',claim_club,'approved',
            claim_review || '{"name":"Old reviewed name"}', claimant_id, recipient_review);
        raise exception 'Changed club submitted';
    exception when serialization_failure then null; end;
    begin
        perform public.admin_reviewed_club_decision('claim',claim_club,'approved',claim_review,claimant_id,
            recipient_review || '{"requester_email":"changed@example.test"}');
        raise exception 'Changed recipient submitted';
    exception when serialization_failure then null; end;
    begin
        perform public.admin_reviewed_club_decision('claim',denied_club,'approved',denied_review,denied_claim,denied_recipient);
        raise exception 'Denied owner assignment completed';
    exception when insufficient_privilege then null; end;
    if (select status from public.clubs where id=denied_club) is distinct from 'draft'
        or (select status from public.club_claim_requests where id=denied_claim) is distinct from 'pending'
        or exists (select from public.club_members where club_id=denied_club)
        then raise exception 'Failed owner assignment did not roll back all changes'; end if;

    begin
        perform public.admin_reviewed_club_decision('application',denied_application,'approved',
            '{"name":"Denied application","status":"pending","contact_email":"denied@example.test","contacts":null,"created_by":3,"updated_at":"2026-11-20T08:00:00Z"}');
        raise exception 'An application with a denied owner assignment completed';
    exception when insufficient_privilege then null; end;
    if not exists (select from public.clubs where id=denied_application and status='pending' and not verified and approved_at is null) then
        raise exception 'Failed application owner assignment published the club';
    end if;

    receipt := public.admin_reviewed_club_decision('application',application_id,'approved',app_review);
    if receipt is distinct from jsonb_build_object('club_id',application_id,'status','published','claim_id',null,'club_published',true,'owner_granted',true)
        or not exists (select from public.clubs where id=application_id and status='published' and verified and approved_at is not null)
        or not exists (select from public.club_members where club_id=application_id and user_email='applicant@example.test' and player_id=1 and role='owner')
        then raise exception 'Application approval did not publish and grant the recorded owner: %', receipt; end if;

    receipt := public.admin_reviewed_club_decision('claim',claim_club,'approved',claim_review,claimant_id,recipient_review);
    if receipt is distinct from jsonb_build_object('club_id',claim_club,'status','approved','claim_id',claimant_id,'club_published',true,'owner_granted',true)
        or not exists (select from public.club_claim_requests where id=claimant_id and status='approved' and reviewed_at is not null)
        or not exists (select from public.clubs where id=claim_club and status='published' and verified)
        or (select count(*) from public.club_members where club_id=claim_club) <> 1
        or not exists (select from public.club_members where id='30000000-0000-4000-8000-000000000001' and role='owner' and player_id=2)
        or not exists (select from public.club_members where club_id=no_email_club and role='admin')
        then raise exception 'Claim approval did not commit a consistent owner and club: %', receipt; end if;
    begin
        perform public.admin_reviewed_club_decision('claim',claim_club,'approved',
            claim_review || '{"status":"published"}',claimant_id,recipient_review);
        raise exception 'An already applied claim should not succeed again';
    exception when serialization_failure then null; end;
    receipt := public.admin_reviewed_club_decision('claim',claim_club,'rejected',claim_review || '{"status":"published"}',rejected_claim,
        recipient_review || '{"requester_email":"applicant@example.test","requester_player_id":1,"full_name":"Another claimant"}',
        '  Existing owner confirmed  ');
    if receipt->>'status' is distinct from 'rejected' or (receipt->>'owner_granted')::boolean
        or not exists (select from public.club_claim_requests where id=rejected_claim and status='rejected' and rejection_notes='Existing owner confirmed')
        or (select count(*) from public.club_members where club_id=claim_club) <> 1
        then raise exception 'Rejection modified membership or lost feedback: %', receipt; end if;
    receipt := public.admin_reviewed_club_decision('application',no_email_club,'approved',
        '{"name":"No owner listed","status":"in_review","contact_email":null,"contacts":[],"created_by":null,"updated_at":"2026-11-20T08:00:00Z"}');
    if receipt->>'status' is distinct from 'published' or (receipt->>'owner_granted')::boolean then
        raise exception 'An application without a recorded owner could not publish: %', receipt;
    end if;
end $$;

rollback;
