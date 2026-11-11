\set ON_ERROR_STOP on
\ir permission-boundaries.sql
reset role;
select set_config('request.jwt.claims','{}',false);
create role postgres superuser;
set session authorization postgres;
create extension if not exists "uuid-ossp";
\ir fixtures/private-record-columns.sql
\ir fixtures/payment-security-pricing.sql
create function private.managed_event_player_emails() returns setof text language sql stable security definer set search_path='' as $$select r.email from public.event_registrations r where public.can_manage_event(r.event_id)$$;
grant execute on function private.managed_event_player_emails() to authenticated;
create function public.can_manage_licenses() returns boolean language sql stable security definer set search_path='' as $$select private.admin_module('licenses')$$;
\ir ../supabase/migrations/20261111043810_verified_payment_and_registration_integrity.sql
update private.security_release_state set integrity_enabled=true;
\ir ../supabase/migrations/20261111053342_optimize_private_record_scope_checks.sql
\ir ../supabase/migrations/20261111053948_set_based_authorized_event_scopes.sql
\ir ../supabase/migrations/20261111054457_retain_global_finance_scope_for_unassigned_receipts.sql
insert into public.players(id,name,email,approved) values(1,'Player One','actor1@example.test',true),(2,'Player Two','actor2@example.test',true),(3,'Player Three','actor3@example.test',true);
update public.calendar set is_visible=true,sanction_status='approved',start_date=date '2026-11-20',entry_fee=300,allow_payments=true,payment_method='platform',allow_temporary_license=true where id in(101,102);
update public.tournament_divisions set entry_fee=300 where event_id=101;
insert into public.calendar(id,event_name,start_date,is_visible,sanction_status,payment_method,allow_payments,entry_fee) values(103,'Free Open',date '2026-11-20',true,'approved','free',false,0);
insert into public.commerce_config values('default',5,2,120,true);
insert into public.license_seasons values(2026,650,500,true,date '2026-01-01'),(2027,650,500,true,date '2026-11-01');
create policy fixture_registration_access on public.event_registrations for all to authenticated using(true) with check(true);
create policy fixture_payment_access on public.payments for all to authenticated using(true) with check(true);
grant select,insert,update,delete on public.event_registrations,public.payments to authenticated,service_role;
-- Real old policies are deliberately more permissive than needed: the new
-- restrictive scopes and triggers must still enforce the security boundary.
insert into public.event_registrations(id,event_id,email,full_name,partner_email,division_id,division,registered_by,payment_status) values
 ('80000000-0000-0000-0000-000000000001',101,'actor1@example.test','Player One','actor3@example.test','50000000-0000-0000-0000-000000000001','Division A','actor1@example.test','pending'),
 ('80000000-0000-0000-0000-000000000003',101,'actor3@example.test','Player Three','actor1@example.test','50000000-0000-0000-0000-000000000001','Division A','actor1@example.test','pending');
create function pg_temp.reject(query text,label text) returns void language plpgsql as $$begin begin execute query;exception when others then perform pg_temp.expect(true,label);return;end;raise exception 'FAIL: % was accepted',label;end $$;
set role authenticated;
select pg_temp.identity(1);
select pg_temp.reject($q$update public.event_registrations set payment_status='paid' where email='actor1@example.test'$q$,'raw paid registration forgery');
select pg_temp.reject($q$update public.event_registrations set refund_amount=300 where email='actor1@example.test'$q$,'raw refund amount forgery');
select pg_temp.reject($q$insert into public.payments(player_id,event_id,amount,status,payment_type,reference,metadata) values(1,101,300,'success','event_entry_fee','forged-paid','{"registrant_email":"actor1@example.test"}')$q$,'raw successful payment forgery');
select pg_temp.reject($q$insert into public.payments(player_id,event_id,amount,status,payment_type,reference,metadata) values(3,101,300,'processing','event_entry_fee','foreign-owner','{"registrant_email":"actor1@example.test"}')$q$,'foreign payment ownership');
insert into public.payments(id,player_id,event_id,amount,status,payment_type,reference,metadata) values
 ('90000000-0000-0000-0000-000000000001',1,101,315,'processing','event_entry_fee','valid-entry','{"source":"manual_event","registrant_email":"actor1@example.test","covers":[{"type":"entry","email":"actor1@example.test","division":"Division A"}]}');
select pg_temp.expect((select status='processing' from public.payments where reference='valid-entry'),'legitimate entry checkout preserved');
select pg_temp.reject($q$insert into public.payments(player_id,event_id,amount,status,payment_type,reference,metadata) values(1,101,1,'processing','event_entry_fee','underpaid','{"source":"manual_event","registrant_email":"actor1@example.test","covers":[{"type":"entry","email":"actor1@example.test","division":"Division A"}]}')$q$,'client pricing ignored; underpayment rejected');
select pg_temp.reject($q$update public.payments set status='success' where reference='valid-entry'$q$,'raw pending-to-success forgery');
select pg_temp.reject($q$update public.payments set amount=1 where reference='valid-entry'$q$,'raw saved amount tampering');
select pg_temp.reject($q$update public.payments set metadata='{"registrant_email":"actor1@example.test","covers":[]}' where reference='valid-entry'$q$,'raw saved cart tampering');
select pg_temp.reject($q$select public.payment_verification_context('valid-entry')$q$,'verification context is not a client endpoint');
insert into public.payments(id,player_id,event_id,amount,status,payment_type,reference,metadata) values
 ('90000000-0000-0000-0000-000000000002',1,101,630,'processing','event_entry_fee','valid-pair','{"source":"manual_event","registrant_email":"actor1@example.test","covers":[{"type":"entry","email":"actor1@example.test","division":"Division A"},{"type":"entry","email":"actor3@example.test","division":"Division A"}]}');
select pg_temp.expect((select amount=630 from public.payments where reference='valid-pair'),'partner payment covers both actual entries');
insert into public.event_registrations(event_id,email,division,registered_by,payment_status) values(103,'actor1@example.test','Free','actor1@example.test','paid');
select pg_temp.expect((select payment_status='paid' from public.event_registrations where event_id=103),'free event remains paid without a provider');
reset role;
select set_config('request.jwt.claims','{}',false);
update public.tournament_divisions set entry_fee=400 where event_id=101;
set role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',false);
update public.payments set status='success' where reference='valid-entry';
select pg_temp.expect((select status='success' from public.payments where reference='valid-entry'),'captured checkout survives a later entry price change');
select pg_temp.expect(public.payment_verification_context('valid-entry')->>'amount'='315.00','verification uses original charge amount');
update public.event_registrations set payment_status='paid',payment_method='paystack' where email='actor1@example.test' and event_id=101;
select pg_temp.expect((select partner_payment_status='paid' from public.event_registrations where email='actor3@example.test'),'partner paid badge follows the actual payment');
reset role;
select set_config('request.jwt.claims','{}',false);
update public.tournament_divisions set entry_fee=300 where event_id=101;
set role authenticated;
select pg_temp.identity(2);
update public.event_registrations set payment_status='paid',payment_method='cash' where email='actor3@example.test' and event_id=101;
select pg_temp.expect((select payment_status='paid' from public.event_registrations where email='actor3@example.test'),'own event admin can confirm cash');
select pg_temp.expect(not exists(select 1 from public.payments where event_id=102),'foreign event stays outside the admin scope');
reset role;
select 'Payment security DB: '||count(*)||' total assertions passed' from checks;
-- Bundled licence prices come from the catalogue, never from client line items.
set role authenticated;
select pg_temp.identity(1);
insert into public.payments(id,player_id,event_id,amount,status,payment_type,reference,metadata) values
 ('90000000-0000-0000-0000-000000000004',1,101,437.40,'processing','event_entry_fee','entry-temp','{"source":"manual_event","registrant_email":"actor1@example.test","covers":[{"type":"entry","email":"actor1@example.test","division":"Division A"},{"type":"license","email":"actor1@example.test","license":"temporary"}],"line_items":[{"label":"SAPA licence","amount":1}]}');
select pg_temp.expect((select metadata->'server_license_items'->0->>'amount'='122.40' from public.payments where reference='entry-temp'),'temporary licence amount is captured from server configuration');
select pg_temp.reject($q$insert into public.payments(player_id,event_id,amount,status,payment_type,reference,metadata) values(1,101,316,'processing','event_entry_fee','entry-underlicensed','{"source":"manual_event","registrant_email":"actor1@example.test","covers":[{"type":"entry","email":"actor1@example.test","division":"Division A"},{"type":"license","email":"actor1@example.test","license":"temporary"}]}')$q$,'bundled licence cannot be underpaid');
insert into public.payments(id,player_id,event_id,amount,status,payment_type,reference,metadata) values
 ('90000000-0000-0000-0000-000000000005',1,103,122.40,'processing','event_entry_fee','free-temp','{"source":"manual_event","registrant_email":"actor1@example.test","covers":[{"type":"license","email":"actor1@example.test","license":"temporary"}],"registration_rows":[{"event_id":103,"email":"actor1@example.test","division":"Free","registered_by":"actor1@example.test"}]}');
select pg_temp.expect((select jsonb_array_length(metadata->'server_free_entries')=1 from public.payments where reference='free-temp'),'licence-only charge retains genuinely free event entry');
reset role;
select set_config('request.jwt.claims','{}',false);
update public.commerce_config set temp_license_price=200;
set role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',false);
update public.payments set status='success' where reference='entry-temp';
select pg_temp.expect((select metadata->'server_license_items'->0->>'amount'='122.40' from public.payments where reference='entry-temp'),'captured licence quote survives later price changes');
insert into public.payments(player_id,event_id,amount,status,payment_type,reference,metadata) values(1,101,122.40,'success','temp_license','LIC-entry-temp','{"parent_reference":"entry-temp"}');
update public.payments set amount=315,metadata=jsonb_set(metadata||'{"split_recorded":true}', '{covers}','[{"type":"entry","email":"actor1@example.test","division":"Division A"}]') where reference='entry-temp';
select pg_temp.expect(public.payment_verification_context('entry-temp')->>'amount'='437.40','replayed verification uses original total after a valid licence split');
update public.payments set status='success' where reference='entry-temp';
select pg_temp.expect((select amount=315 from public.payments where reference='entry-temp'),'licence split replay remains idempotent');
select pg_temp.reject($q$update public.payments set amount=1 where reference='entry-temp'$q$,'trusted worker cannot silently rewrite a captured checkout amount');
reset role;
select set_config('request.jwt.claims','{}',false);
insert into public.annual_licenses values(1,2025,null);
update public.commerce_config set temp_license_price=120;
set role authenticated;
select pg_temp.identity(1);
insert into public.payments(player_id,event_id,amount,status,payment_type,reference,metadata) values
 (1,101,825,'processing','event_entry_fee','entry-renewal','{"source":"manual_event","registrant_email":"actor1@example.test","covers":[{"type":"entry","email":"actor1@example.test","division":"Division A"},{"type":"license","email":"actor1@example.test","license":"full","license_year":2027}]}');
select pg_temp.expect((select metadata->'server_license_items'->0->>'amount'='510.00' from public.payments where reference='entry-renewal'),'actual full licence renewal pricing is used for the covered player');
select pg_temp.expect(pg_temp.affected('update public.payments set status=''cancelled'' where reference=''entry-renewal''')=1,'unpaid checkout can still be cancelled');
reset role;
select 'Payment security DB: '||count(*)||' total assertions passed (including licence bundles)' from checks;

reset role;
select set_config('request.jwt.claims','{}',false);
update public.calendar set is_manual=false where id=101;
set role authenticated;
select pg_temp.identity(1);
insert into public.event_registrations(id,event_id,email,full_name,division,registered_by,payment_status)
 values('80000000-0000-0000-0000-000000000011',101,'actor1@example.test','Player One','New entry','actor1@example.test','pending');
select pg_temp.expect((select count(*)=1 and bool_and(not is_paid) from public.tournament_participants where metadata->>'registration_id'='80000000-0000-0000-0000-000000000011'),'normal registration creates a pending legacy roster entry without privileged RPC');
reset role;
set role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',false);
update public.event_registrations set payment_status='paid',payment_method='paystack' where id='80000000-0000-0000-0000-000000000011';
select pg_temp.expect((select count(*)=1 and bool_and(is_paid) from public.tournament_participants where metadata->>'registration_id'='80000000-0000-0000-0000-000000000011'),'verified payment updates the same roster entry');
update public.event_registrations set payment_status='paid' where id='80000000-0000-0000-0000-000000000011';
select pg_temp.expect((select count(*)=1 from public.tournament_participants where metadata->>'registration_id'='80000000-0000-0000-0000-000000000011'),'roster sync replay is idempotent');
update public.event_registrations set status='withdrawn' where id='80000000-0000-0000-0000-000000000011';
select pg_temp.expect(not exists(select 1 from public.tournament_participants where metadata->>'registration_id'='80000000-0000-0000-0000-000000000011'),'withdrawal removes only the derived roster record');
reset role;
select 'Payment security DB: '||count(*)||' assertions passed (licences and roster sync)' from checks;

reset role;
select set_config('request.jwt.claims','{}',false);
create schema if not exists extensions;
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
-- Reproduce the dangerous legacy automatic view grants before correcting them.
grant all on public.players_public,public.event_registrations_public,public.tournament_participants_public,public.club_members_public to anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.log_event_activity(p_event_id bigint, p_action text, p_category text, p_summary text, p_details jsonb DEFAULT '{}'::jsonb, p_actor_role text DEFAULT 'ADMIN'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_email TEXT;
    v_allowed BOOLEAN;
BEGIN
    IF p_event_id IS NULL OR COALESCE(p_action, '') = '' OR COALESCE(p_summary, '') = '' THEN
        RAISE EXCEPTION 'event_id, action and summary are required';
    END IF;

    v_email := COALESCE(auth.jwt() ->> 'email', 'anonymous');

    v_allowed := is_4m_admin()
        OR EXISTS (
            SELECT 1 FROM public.calendar c
            WHERE c.id = p_event_id
              AND c.organisation_id IS NOT NULL
              AND is_org_admin(c.organisation_id)
        );

    IF NOT v_allowed THEN
        RAISE EXCEPTION 'Not allowed to log activity for this event';
    END IF;

    RETURN public._insert_event_activity(
        p_event_id,
        v_email,
        COALESCE(NULLIF(p_actor_role, ''), 'ADMIN'),
        p_action,
        p_category,
        p_summary,
        p_details
    );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.promote_finished_tier_recent_results()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    updated_count integer := 0;
BEGIN
    UPDATE public.calendar
    SET
        featured_result = true,
        show_in_recent_results = true
    WHERE COALESCE(end_date, start_date) IS NOT NULL
      AND COALESCE(end_date, start_date)::date < CURRENT_DATE
      AND sapa_status IN ('Gold', 'Super Gold', 'S Gold', 'Major')
      AND COALESCE(is_visible, true) = true
      AND (
          featured_result IS DISTINCT FROM true
          OR show_in_recent_results IS DISTINCT FROM true
      );

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.reassign_tournament_participant_division(p_event_id bigint, p_email text, p_full_name text, p_from_class text, p_to_class text, p_is_paid boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_email text := lower(trim(coalesce(p_email, '')));
    v_from text := trim(coalesce(p_from_class, ''));
    v_to text := trim(coalesce(p_to_class, ''));
    v_name text := COALESCE(NULLIF(trim(p_full_name), ''), 'Player');
    v_updated int := 0;
BEGIN
    IF p_event_id IS NULL OR v_to = '' THEN
        RAISE EXCEPTION 'event_id and target class are required';
    END IF;

    IF NOT (
        public.is_super_admin(auth.jwt() ->> 'email')
        OR public.can_manage_event(p_event_id)
    ) THEN
        RAISE EXCEPTION 'Not allowed to move participants for this event';
    END IF;

    -- Prefer in-place class rename so rankedin / profile ids are preserved.
    IF v_from <> '' THEN
        UPDATE public.tournament_participants
        SET class_name = v_to,
            email = COALESCE(NULLIF(v_email, ''), email),
            full_name = COALESCE(NULLIF(trim(p_full_name), ''), full_name),
            is_paid = COALESCE(p_is_paid, is_paid),
            last_synced_at = now()
        WHERE event_id = p_event_id
          AND class_name ILIKE v_from
          AND (
              (v_email <> '' AND email ILIKE v_email)
              OR full_name ILIKE v_name
          );
        GET DIAGNOSTICS v_updated = ROW_COUNT;
    END IF;

    IF v_updated = 0 THEN
        PERFORM public.upsert_tournament_participant(
            p_event_id,
            v_name,
            NULLIF(v_email, ''),
            v_to,
            NULL,
            COALESCE(p_is_paid, true)
        );
    END IF;

    -- Always clear leftovers on the old division (stale draw row).
    IF v_from <> '' THEN
        DELETE FROM public.tournament_participants
        WHERE event_id = p_event_id
          AND class_name ILIKE v_from
          AND (
              (v_email <> '' AND email ILIKE v_email)
              OR full_name ILIKE v_name
          );
    END IF;
END;
$function$
;
\ir ../supabase/migrations/20261111050311_public_catalogue_readonly_and_function_paths.sql
set role anon;
select pg_temp.expect(has_table_privilege(current_user,'public.players_public','select'),'public profile catalogue stays readable');
select pg_temp.expect(not has_table_privilege(current_user,'public.players_public','update'),'anonymous public view cannot update private player data');
select pg_temp.expect(not has_table_privilege(current_user,'public.tournament_participants_public','insert'),'anonymous public view cannot manufacture paid roster entries');
select pg_temp.expect(not has_function_privilege(current_user,'public.org_audit(text,text,text,uuid,jsonb)','execute'),'browser cannot forge privileged audit entries');
reset role;
set role authenticated;
select pg_temp.expect(not has_table_privilege(current_user,'public.event_registrations_public','update'),'authenticated view cannot bypass registration integrity');
reset role;
select pg_temp.expect((select proconfig @> array['search_path=pg_catalog, public, extensions, pg_temp'] from pg_proc where oid='public.org_audit(text,text,text,uuid,jsonb)'::regprocedure),'legacy definer functions use a fixed trusted search path');
select 'Payment security DB: '||count(*)||' assertions passed (including public view write bypasses)' from checks;

set role authenticated;
select pg_temp.identity(1);
select pg_temp.expect(public.promote_finished_tier_recent_results()=0,'ordinary homepage request cannot mutate shared promotion flags');
select pg_temp.expect(pg_temp.denied($q$select public.log_event_activity(102,'forged','update','false audit','{}','ADMIN')$q$),'ordinary caller cannot forge foreign event audit');
select pg_temp.expect(pg_temp.denied($q$select public.reassign_tournament_participant_division(102,'actor3@example.test','Player Three','Old','New',true)$q$),'ordinary caller cannot reassign foreign roster');
select pg_temp.identity(2);
select pg_temp.expect(pg_temp.denied($q$select public.reassign_tournament_participant_division(102,'actor3@example.test','Player Three','Old','New',true)$q$),'event manager cannot reassign another organisation roster');
reset role;
select 'Payment security DB: '||count(*)||' assertions passed (complete compatible rollout)' from checks;
reset role;
select set_config('request.jwt.claims','{}',false);
insert into public.tournament_divisions(id,event_id,name,entry_fee) values('50000000-0000-0000-0000-000000000003',101,'Upper',500);
insert into public.calendar(id,event_name,start_date,is_visible,sanction_status,payment_method,allow_payments,entry_fee,is_weekly,series_id) values
 (104,'Week one',current_date+8,true,'approved','platform',true,300,true,'30000000-0000-0000-0000-000000000004'),
 (105,'Week two',current_date+15,true,'approved','platform',true,300,true,'30000000-0000-0000-0000-000000000004');
set role authenticated;
select pg_temp.identity(1);
insert into public.payments(player_id,event_id,amount,status,payment_type,reference,metadata) values(1,101,200,'processing','event_entry_fee','valid-topup','{"source":"division_switch","registrant_email":"actor1@example.test","registration_id":"80000000-0000-0000-0000-000000000001","target_division_id":"50000000-0000-0000-0000-000000000003"}');
select pg_temp.expect((select amount=200 from public.payments where reference='valid-topup'),'legitimate higher-division fee difference remains payable');
select pg_temp.reject($q$insert into public.payments(player_id,event_id,amount,status,payment_type,reference,metadata) values(1,101,1,'processing','event_entry_fee','bad-topup','{"source":"division_switch","registrant_email":"actor1@example.test","registration_id":"80000000-0000-0000-0000-000000000001","target_division_id":"50000000-0000-0000-0000-000000000003"}')$q$,'division upgrade cannot underpay');
insert into public.payments(player_id,event_id,amount,status,payment_type,reference,metadata) values(1,104,630,'processing','event_entry_fee','valid-weekly','{"source":"manual_event","registrant_email":"actor1@example.test","covers":[{"type":"entry","email":"actor1@example.test","event_id":104,"division":"Open"},{"type":"entry","email":"actor1@example.test","event_id":105,"division":"Open"}],"registration_rows":[{"email":"actor1@example.test","event_id":104,"division":"Open"},{"email":"actor1@example.test","event_id":105,"division":"Open"}]}');
select pg_temp.expect((select amount=630 from public.payments where reference='valid-weekly'),'a checkout can cover two dates in the same weekly series');
select pg_temp.reject($q$insert into public.payments(player_id,event_id,amount,status,payment_type,reference,metadata) values(1,104,315,'processing','event_entry_fee','foreign-weekly','{"source":"manual_event","registrant_email":"actor1@example.test","covers":[{"type":"entry","email":"actor1@example.test","event_id":102,"division":"Open"}],"registration_rows":[{"email":"actor1@example.test","event_id":102,"division":"Open"}]}')$q$,'weekly checkout cannot include unrelated organisation event');
reset role;
select 'Payment security DB: '||count(*)||' assertions passed (including weekly and division top-ups)' from checks;
-- Add realistic ledger/entry volume; the viewer still sees only owned rows.
reset role;
select set_config('request.jwt.claims','{}',false);
insert into public.event_registrations(event_id,email,full_name,division,registered_by,payment_status)
 select 102,'load-'||n||'@example.test','Synthetic player '||n,'Open','load-'||n||'@example.test','pending' from generate_series(1,2000) n;
insert into public.payments(player_id,event_id,amount,status,payment_type,reference,metadata)
 select 3,102,300,'pending','event_entry_fee','load-'||n,jsonb_build_object('registrant_email','actor3@example.test') from generate_series(1,4000) n;
set role authenticated;
select pg_temp.identity(1);
set statement_timeout='1000ms';
select pg_temp.expect(not exists(select 1 from public.event_registrations where event_id=102),'2,000 foreign entries remain excluded under load');
select pg_temp.expect(not exists(select 1 from public.payments where event_id=102),'4,000 foreign payments remain excluded under load');
reset statement_timeout;
reset role;
select 'Payment security DB: '||count(*)||' assertions passed (2,000 entries / 4,000 payments)' from checks;

reset role;
select set_config('request.jwt.claims','{}',false);
update auth.users set deleted_at=null,banned_until=null where email='actor9@example.test';
insert into public.payments(player_id,event_id,amount,status,payment_type,reference,metadata) values(3,null,650,'pending','full_license','unassigned-license','{"registrant_email":"actor3@example.test"}');
set role authenticated;
select pg_temp.identity(1);
select pg_temp.expect(not exists(select 1 from public.payments where reference='unassigned-license'),'ordinary player cannot read another standalone licence receipt');
select pg_temp.identity(2);
select pg_temp.expect(not exists(select 1 from public.payments where reference='unassigned-license'),'scoped event manager cannot read unrelated standalone licence receipts');
select pg_temp.identity(9);
select pg_temp.expect(exists(select 1 from public.payments where reference='unassigned-license'),'Super Admin retains standalone licence receipt access');
reset role;
select set_config('request.jwt.claims','{}',false);
update public.admin_sidebar_permissions set allowed_tabs=array['finance'],module_permissions='{}' where email='actor10@example.test';
set role authenticated;
select pg_temp.identity(10);
select pg_temp.expect(not exists(select 1 from public.payments where reference='unassigned-license'),'Finance event scope does not expose unrelated standalone licence receipts');
reset role;
select 'Payment security DB: '||count(*)||' assertions passed (global and scoped finance)' from checks;

-- Historical entries may predate registered_by. Current register-only clients
\ir ../supabase/migrations/20261111055630_preserve_legacy_own_registration_retries.sql
-- fill that missing value on an upsert; they must not be able to claim a partner
-- row or replace an existing booking creator while doing so.
reset role;
select set_config('request.jwt.claims','{}',false);
insert into public.event_registrations(id,event_id,email,division,registered_by,partner_email,payment_status) values
 ('80000000-0000-0000-0000-000000000041',101,'actor1@example.test','Legacy own',null,null,'pending'),
 ('80000000-0000-0000-0000-000000000042',101,'actor3@example.test','Legacy partner',null,'actor1@example.test','pending'),
 ('80000000-0000-0000-0000-000000000043',101,'actor1@example.test','Existing booker','actor3@example.test',null,'pending');
set role authenticated;
select pg_temp.identity(1);
update public.event_registrations set registered_by='actor1@example.test',tshirt_size='M' where id='80000000-0000-0000-0000-000000000041';
select pg_temp.expect((select registered_by='actor1@example.test' and tshirt_size='M' from public.event_registrations where id='80000000-0000-0000-0000-000000000041'),'own legacy entry can be retried with the current client payload');
select pg_temp.reject($q$update public.event_registrations set registered_by='actor1@example.test' where id='80000000-0000-0000-0000-000000000042'$q$,'missing booker does not allow claiming a partner entry');
select pg_temp.reject($q$update public.event_registrations set registered_by='actor1@example.test' where id='80000000-0000-0000-0000-000000000043'$q$,'recorded booking creator cannot be replaced');
select pg_temp.reject($q$update public.event_registrations set payment_status='paid' where id='80000000-0000-0000-0000-000000000041'$q$,'legacy retry cannot manufacture a paid entry');
reset role;
select 'Payment security DB: '||count(*)||' assertions passed (legacy own-entry retries)' from checks;
