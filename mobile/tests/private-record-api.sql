\set ON_ERROR_STOP on
\ir permission-boundaries.sql
reset role;
select set_config('request.jwt.claims','{}',false);
create role postgres superuser;
set session authorization postgres;
create extension if not exists "uuid-ossp";
\ir fixtures/private-record-columns.sql
\ir fixtures/payment-security-pricing.sql
create extension if not exists pgcrypto;
create view public.club_members_public as  SELECT id,
    club_id,
    role,
    player_id,
    created_at
   FROM club_members;;
create view public.tournament_participants_public as  SELECT id,
    event_id,
    rankedin_participant_id,
    full_name,
    class_name,
    profile_id,
    is_paid
   FROM tournament_participants;;
create view public.event_registrations_public as  SELECT id,
    event_id,
    full_name,
    partner_name,
    division,
    division_id,
    status,
    payment_status,
    created_at,
        CASE
            WHEN (NULLIF(email, ''::text) IS NOT NULL) THEN encode(digest(lower(email), 'sha256'::text), 'hex'::text)
            ELSE NULL::text
        END AS email_hash,
        CASE
            WHEN (NULLIF(partner_email, ''::text) IS NOT NULL) THEN encode(digest(lower(partner_email), 'sha256'::text), 'hex'::text)
            ELSE NULL::text
        END AS partner_email_hash,
        CASE
            WHEN (NULLIF(registered_by, ''::text) IS NOT NULL) THEN encode(digest(lower(registered_by), 'sha256'::text), 'hex'::text)
            ELSE NULL::text
        END AS registered_by_hash
   FROM event_registrations
  WHERE (status <> 'withdrawn'::text);;
create view public.players_public as  SELECT id,
    name,
    rank_label,
    points,
    win_rate,
    image_url,
    created_at,
    home_club,
    age_group,
    nationality,
    category,
    level,
    bio,
    sponsors,
    gender,
    approved,
    skill_rating,
    age,
    match_form,
    rankings,
    rankedin_profile_url,
    rankedin_id,
    instagram_link,
    license_type,
    preferred_ranking,
    active_ranking_label,
    region,
    racket_brand,
    additional_images,
    club_id,
    account_type,
    court_side,
    playing_hand
   FROM players
  WHERE (approved = true);;
create table public.temporary_licenses(player_id bigint,event_id bigint,revoked_at timestamptz);
create function public.has_full_license(bigint,integer) returns boolean language sql as $$select false$$;
create function public.can_manage_licenses() returns boolean language sql stable security definer set search_path='' as $$select private.admin_module('licenses')$$;
create function private.managed_event_player_emails() returns setof text language sql stable security definer set search_path='' as $$select r.email from public.event_registrations r where public.can_manage_event(r.event_id)$$;
grant execute on function private.managed_event_player_emails() to authenticated;
\ir ../supabase/migrations/20261111043810_verified_payment_and_registration_integrity.sql
\ir ../supabase/migrations/20261111055630_preserve_legacy_own_registration_retries.sql
update private.security_release_state set integrity_enabled=true;
\ir ../docs/drafts/20261110110946_privacy_preserving_registration_and_payment_api.sql
reset role;
select set_config('request.jwt.claims','{}',false);
insert into public.players(id,name,email,approved) values(1,'Player One','actor1@example.test',true),(2,'Player Two','actor2@example.test',true),(3,'Player Three','actor3@example.test',true);
update public.calendar set is_visible=true,sanction_status='approved',entry_fee=300,allow_payments=true,payment_method='platform' where id in(101,102);
insert into public.calendar(id,event_name,is_visible,sanction_status,payment_method,allow_payments,entry_fee) values(103,'Free Open',true,'approved','free',false,0),(104,'Hidden event',false,'approved','free',false,0);
insert into public.event_registrations(id,event_id,email,full_name,partner_email,division,registered_by,phone,payment_status) values
 ('80000000-0000-0000-0000-000000000001',101,'actor1@example.test','Player One','actor3@example.test','Open','actor1@example.test','own-phone','pending'),
 ('80000000-0000-0000-0000-000000000003',101,'actor3@example.test','Player Three','actor1@example.test','Open','actor1@example.test','private-other-phone','pending');
insert into public.payments(id,event_id,player_id,amount,status,reference,metadata) values
 ('90000000-0000-0000-0000-000000000001',101,1,300,'processing','own-1','{"registrant_email":"actor1@example.test","covers":[{"type":"entry","email":"actor3@example.test"}]}'),
 ('90000000-0000-0000-0000-000000000002',102,3,300,'processing','foreign-1','{"registrant_email":"actor3@example.test"}');
set role authenticated;
select pg_temp.identity(1);
select pg_temp.expect((select count(*)=2 from public.read_my_registration_rows()),'own and registered-for partner entries remain available');
select pg_temp.expect((select email='player+3@contact.4mpadel.invalid' and phone is null and pay_token is null from public.read_my_registration_rows() where id='80000000-0000-0000-0000-000000000003'),'teammate record never returns private contact or invitation token');
select pg_temp.expect((select email='actor1@example.test' and phone='own-phone' and pay_token is not null from public.read_my_registration_rows() where id='80000000-0000-0000-0000-000000000001'),'own entry preserves own identity, contact and invite token');
select pg_temp.expect((select count(*)=1 from public.read_my_payment_rows()),'own payment read excludes foreign account');
select pg_temp.expect((select metadata->'covers'->0->>'email'='player+3@contact.4mpadel.invalid' from public.read_my_payment_rows()),'nested partner payment metadata is masked');
select pg_temp.expect(not exists(select 1 from public.read_calendar_rows() where id=104),'hidden calendar event not exposed');
select pg_temp.expect(jsonb_array_length(public.mutate_player_records('event_registrations','update','{"partner_name":"Updated partner"}','[{"method":"eq","args":["id","80000000-0000-0000-0000-000000000001"]}]'))=1,'own legitimate entry change preserved');
select pg_temp.expect(pg_temp.denied($q$select public.mutate_player_records('event_registrations','update','{"payment_status":"paid"}','[{"method":"eq","args":["id","80000000-0000-0000-0000-000000000001"]}]')$q$),'client cannot mark fee-paying entry paid');
select pg_temp.expect(pg_temp.denied($q$select public.mutate_player_records('payments','update','{"status":"success"}','[{"method":"eq","args":["id","90000000-0000-0000-0000-000000000001"]}]')$q$),'client cannot forge successful payment');
select pg_temp.expect(pg_temp.denied($q$select public.mutate_player_records('payments','update','{"amount":1}','[{"method":"eq","args":["id","90000000-0000-0000-0000-000000000001"]}]')$q$),'client cannot alter checkout amount');
select pg_temp.expect(jsonb_array_length(public.mutate_player_records('payments','update','{"status":"cancelled"}','[{"method":"eq","args":["id","90000000-0000-0000-0000-000000000001"]}]'))=1,'own abandoned checkout can be cancelled');
select pg_temp.expect(jsonb_array_length(public.mutate_player_records('payments','update','{"status":"cancelled"}','[{"method":"eq","args":["id","90000000-0000-0000-0000-000000000002"]}]'))=0,'foreign checkout cannot be changed');
select pg_temp.expect(jsonb_array_length(public.mutate_player_records('event_registrations','upsert','{"event_id":103,"email":"actor1@example.test","division":"Open","payment_status":"paid"}','[]','{"onConflict":"event_id,email,division"}'))=1,'free event can register with paid entry status');
select pg_temp.expect(jsonb_array_length(public.mutate_player_records('event_registrations','upsert','{"event_id":103,"email":"actor1@example.test","division":"Open","full_name":"Player One","payment_status":"paid"}','[]','{"onConflict":"event_id,email,division"}'))=1,'retry of free registration preserves one entry');
select pg_temp.identity(2);
select pg_temp.expect((select count(*)=2 from public.read_my_registration_rows()),'organisation manager retains own event roster');
select pg_temp.expect((select phone='private-other-phone' and email='actor3@example.test' from public.read_my_registration_rows() where id='80000000-0000-0000-0000-000000000003'),'authorised event manager retains roster contacts');
select pg_temp.expect(jsonb_array_length(public.mutate_player_records('event_registrations','update','{"payment_status":"paid","payment_method":"cash"}','[{"method":"eq","args":["id","80000000-0000-0000-0000-000000000001"]}]'))=1,'authorised event admin can record cash payment');
select pg_temp.expect(jsonb_array_length(public.mutate_player_records('payments','update','{"status":"success"}','[{"method":"eq","args":["id","90000000-0000-0000-0000-000000000002"]}]'))=0,'organisation manager cannot mark foreign event payment successful');
reset role;
set role authenticated;
select pg_temp.identity(1);
select pg_temp.expect((select email='player+3@contact.4mpadel.invalid' from public.find_registration_partner(p_search=>'Three')),'partner search exposes a player reference, never the private email');
select pg_temp.expect(not exists(select 1 from public.find_registration_partner(p_search=>'actor3@')),'partial private email is not a public search field');
select pg_temp.expect(not exists(select 1 from public.find_registration_partner(p_email=>'%@example.test')),'email lookup cannot enumerate with wildcards');
select pg_temp.expect((select email='player+3@contact.4mpadel.invalid' from public.find_registration_partner(p_email=>'player+3@contact.4mpadel.invalid')),'selected partner reference can be reloaded');
select pg_temp.expect((select partner_email='player+3@contact.4mpadel.invalid' from public.get_event_registrations_for_matching(101) where email='actor1@example.test'),'roster uses the same partner references as search');
select pg_temp.expect(pg_temp.denied($q$select * from public.get_event_registrations_for_matching(104)$q$),'roster lookup denies a hidden unrelated event');
select pg_temp.expect((select email='actor1@example.test' from public.check_my_registration(101,'actor1@example.test')),'own registration shortcut remains usable');
select pg_temp.expect((select email_hash<>encode(sha256(convert_to('actor3@example.test','UTF8')),'hex') from public.event_registrations_public where full_name='Player Three'),'public roster does not expose a guessable hash of the private email');
select pg_temp.expect((select email_hash=encode(sha256(convert_to('actor1@example.test','UTF8')),'hex') from public.event_registrations_public where id='80000000-0000-0000-0000-000000000001'),'own roster hash remains compatible with own-entry labels');
select pg_temp.expect((select count(*)=3 from public.players_public),'public profile catalogue remains available');
reset role;
set role anon;
select pg_temp.expect(pg_temp.denied($q$select * from public.find_registration_partner(p_search=>'Player')$q$),'anonymous partner search is not allowed');
select pg_temp.expect((select count(*)=3 from public.players_public),'anonymous public profile catalogue remains available');
select pg_temp.expect(not exists(select 1 from public.event_registrations_public where event_id=104),'anonymous public roster cannot expose hidden event data');
reset role;
select 'Private record API: '||count(*)||' total assertions passed' from checks;
