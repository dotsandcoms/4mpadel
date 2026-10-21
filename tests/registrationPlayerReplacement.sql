\set ON_ERROR_STOP on
-- Disposable local Postgres only. All fixture data and DDL roll back.
DO $$ BEGIN IF current_setting('port') <> '55443' THEN
    RAISE EXCEPTION 'Run only on the disposable instance on port 55443';
END IF; END $$;
BEGIN;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid;
$$;
CREATE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'email';
$$;
CREATE FUNCTION public.account_is_active() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT auth.uid() IS NOT NULL; $$;
CREATE FUNCTION public.can_manage_event(event_id bigint) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT auth.email() = 'admin@example.com' AND event_id = 101;
$$;
CREATE TABLE public.calendar(id bigint PRIMARY KEY, event_status text DEFAULT 'active', registration_closes_at timestamptz, is_weekly boolean DEFAULT false, is_quick_event boolean DEFAULT false);
CREATE TABLE public.tournament_divisions(id uuid PRIMARY KEY, event_id bigint, name text, entries_close_at timestamptz, entry_limit integer);
CREATE TABLE public.players(id bigint PRIMARY KEY, name text, email text, contact_number text);
CREATE TABLE public.event_registrations(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id bigint, email text, full_name text, phone text, created_at timestamptz DEFAULT now(), access_grant_id uuid,
    partner_name text, partner_email text, partner_payment_status text, division text, division_id uuid,
    status text DEFAULT 'registered', payment_status text DEFAULT 'paid', payment_method text DEFAULT 'paystack',
    registered_by text, pay_token uuid DEFAULT gen_random_uuid(), whatsapp_added boolean DEFAULT true,
    tshirt_size text DEFAULT 'M', tshirt_logo_url text, tshirt_sponsor_name text,
    reminder_sent_at timestamptz, close_reminder_sent_at timestamptz,
    reminder_1d_sent_at timestamptz, reminder_3d_sent_at timestamptz, reminder_7d_sent_at timestamptz,
    UNIQUE(event_id, email, division)
);
CREATE TABLE public.payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id bigint,
    player_id bigint, amount numeric, status text DEFAULT 'success', payment_type text DEFAULT 'event_entry_fee',
    reference text DEFAULT 'REGEV-test', metadata jsonb);
CREATE TABLE public.payment_refunds(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_id uuid,
    event_registration_id uuid, status text, metadata jsonb DEFAULT '{}', amount numeric);
CREATE TABLE public.draws(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id bigint, division_id uuid, status text DEFAULT 'draft');
CREATE TABLE public.draw_entries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), draw_id uuid, source_registration_id uuid);
CREATE TABLE public.event_activity_log(event_id bigint, actor_email text, actor_role text, action text, category text, summary text, details jsonb);
CREATE TABLE public.temporary_licenses(player_id bigint, event_id bigint);
GRANT USAGE ON SCHEMA public, auth TO authenticated;
GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO authenticated;
\ir ../supabase/migrations/20261013130304_replace_paid_partner.sql

\ir ../supabase/migrations/20261017144329_manage_registration_teams.sql
\ir ../supabase/migrations/20261019050830_division_team_capacity.sql
\ir ../supabase/migrations/20261019050836_registration_deadline_payment_access.sql
\ir ../supabase/migrations/20261020084211_event_manager_player_replacement.sql

CREATE FUNCTION pg_temp.expect(condition boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF; END $$;
CREATE FUNCTION pg_temp.as_user(email text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub','00000000-0000-0000-0000-000000000001','email',email,'role','authenticated')::text, true);
END $$;
INSERT INTO public.calendar(id,event_status,registration_closes_at) VALUES (101,'active',NULL),(102,'active',NULL);
INSERT INTO public.tournament_divisions(id,event_id,name,entries_close_at) VALUES ('00000000-0000-0000-0000-000000000010', 101, 'Ladies', NULL);
INSERT INTO public.players VALUES (1,'Owner','owner@example.com','111'), (2,'Former','former@example.com','222'),
    (3,'New','new@example.com','333'),(4,'Next','next@example.com','444'),(5,'Unrelated','other@example.com','555');
INSERT INTO public.event_registrations(id,event_id,email,full_name,partner_name,partner_email,division,division_id,registered_by,partner_payment_status)
VALUES ('00000000-0000-0000-0000-000000000001',101,'owner@example.com','Owner','Former','former@example.com','Ladies',
    '00000000-0000-0000-0000-000000000010','owner@example.com','paid'),
    ('00000000-0000-0000-0000-000000000002',101,'former@example.com','Former','Owner','owner@example.com','Ladies',
    '00000000-0000-0000-0000-000000000010','owner@example.com','paid');
INSERT INTO public.payments(id,event_id,player_id,amount,metadata) VALUES
('00000000-0000-0000-0000-000000000020',101,1,1720,'{
    "email":"owner@example.com", "registrant_email":"owner@example.com",
    "covers":[{"type":"entry","email":"owner@example.com","division":"Ladies"},
              {"type":"entry","email":"former@example.com","division":"Ladies"},
              {"type":"license","email":"former@example.com","license":"temporary"},
              {"type":"entry","email":"former@example.com","division":"Mixed"}],
    "division_entry_fees":{"Ladies":800},
    "line_items":[{"label":"Former — Ladies","amount":800}],
    "registration_rows":[{"email":"owner@example.com","full_name":"Owner","division":"Ladies","division_id":"00000000-0000-0000-0000-000000000010","partner_email":"former@example.com"},
                         {"email":"former@example.com","full_name":"Former","division":"Ladies","division_id":"00000000-0000-0000-0000-000000000010"}]
}');
INSERT INTO public.temporary_licenses VALUES(2,101);
CREATE TEMP TABLE original AS SELECT *, metadata AS original_metadata FROM public.payments;
CREATE TEMP TABLE old_slot AS SELECT * FROM public.event_registrations WHERE email='former@example.com';
CREATE FUNCTION pg_temp.replace_player(slot uuid DEFAULT '00000000-0000-0000-0000-000000000002', old_email text DEFAULT 'former@example.com', partner_email text DEFAULT 'owner@example.com', player bigint DEFAULT 3)
RETURNS jsonb LANGUAGE sql AS $$ SELECT public.replace_registration_player(slot,old_email,partner_email,player); $$;
CREATE FUNCTION pg_temp.must_fail(message text, slot uuid DEFAULT '00000000-0000-0000-0000-000000000002', old_email text DEFAULT 'former@example.com', partner_email text DEFAULT 'owner@example.com', player bigint DEFAULT 3)
RETURNS void LANGUAGE plpgsql AS $$ BEGIN
    BEGIN PERFORM pg_temp.replace_player(slot,old_email,partner_email,player);
    EXCEPTION WHEN OTHERS THEN
        IF position(message IN SQLERRM) = 0 THEN RAISE EXCEPTION 'Wrong failure: % (expected %)', SQLERRM, message; END IF;
        RETURN;
    END;
    RAISE EXCEPTION 'Expected failure: %',message;
END $$;
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('owner@example.com');
SELECT pg_temp.must_fail('cannot manage entries');
SELECT pg_temp.as_user('admin@example.com');
SELECT pg_temp.must_fail('has changed', old_email => 'stale@example.com');
SELECT pg_temp.must_fail('has changed', partner_email => NULL);
SELECT pg_temp.must_fail('different player', player => 2);
SELECT pg_temp.must_fail('different player', player => 1);
SELECT pg_temp.must_fail('4M profile', player => 99);
RESET ROLE;
INSERT INTO public.event_registrations(event_id,email,full_name,division,division_id)
VALUES(101,'new@example.com','Duplicate','Ladies','00000000-0000-0000-0000-000000000010');
SELECT pg_temp.must_fail('already has an entry');
DELETE FROM public.event_registrations WHERE email='new@example.com';
INSERT INTO public.draws(event_id,division_id) VALUES(101,'00000000-0000-0000-0000-000000000010');
SELECT pg_temp.must_fail('generated draw');
DELETE FROM public.draws;
INSERT INTO public.payment_refunds(event_registration_id,status,amount) VALUES('00000000-0000-0000-0000-000000000002','pending',800);
SELECT pg_temp.must_fail('refund in progress');
DELETE FROM public.payment_refunds;
INSERT INTO public.payment_refunds(payment_id,status,amount) VALUES('00000000-0000-0000-0000-000000000020','processed',800);
SELECT pg_temp.must_fail('refund in progress');
DELETE FROM public.payment_refunds;
UPDATE public.payments SET status='processing';
SELECT pg_temp.must_fail('unfinished payment');
UPDATE public.payments SET status='success';
UPDATE public.calendar SET event_status='cancelled' WHERE id=101;
SELECT pg_temp.must_fail('cancelled');
UPDATE public.calendar SET event_status='active' WHERE id=101;

-- A pending licence-only ledger split may retain the original entry snapshot.
-- It must never block a replacement or acquire an entry allocation.
INSERT INTO public.payments(id,event_id,player_id,amount,status,metadata) VALUES
('00000000-0000-0000-0000-000000000021',101,2,120,'pending',
'{"covers":[{"type":"license","email":"former@example.com"}],"original_trx":{"metadata":{"covers":[{"type":"entry","email":"former@example.com","division":"Ladies"}]}}}');
CREATE TEMP TABLE license_payment AS SELECT * FROM public.payments WHERE id='00000000-0000-0000-0000-000000000021';
-- Substitution must work at capacity and after entries have closed for managers.
UPDATE public.tournament_divisions SET entry_limit=1,entries_close_at=now()-interval '1 day';
CREATE FUNCTION pg_temp.sql_must_fail(query text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
    BEGIN EXECUTE query;
    EXCEPTION WHEN OTHERS THEN
        IF position('Registration has closed' IN SQLERRM)=0 THEN RAISE EXCEPTION 'Unexpected deadline failure: %',SQLERRM; END IF;
        RETURN;
    END;
    RAISE EXCEPTION 'The deadline was bypassed';
END $$;
UPDATE public.tournament_divisions SET entry_limit=NULL;
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('owner@example.com');
SELECT pg_temp.sql_must_fail($q$UPDATE public.event_registrations SET email='changed@example.com' WHERE id='00000000-0000-0000-0000-000000000002'$q$);
SELECT pg_temp.as_user('admin@example.com');
SELECT pg_temp.sql_must_fail($q$INSERT INTO public.event_registrations(event_id,email,full_name,division,division_id) VALUES(101,'brandnew@example.com','New entry','Ladies','00000000-0000-0000-0000-000000000010')$q$);
RESET ROLE;
INSERT INTO public.tournament_divisions(id,event_id,name,entries_close_at) VALUES('00000000-0000-0000-0000-000000000011',101,'Mixed',now()-interval '1 day');
SELECT pg_temp.sql_must_fail($q$UPDATE public.event_registrations SET division='Mixed',division_id='00000000-0000-0000-0000-000000000011' WHERE id='00000000-0000-0000-0000-000000000002'$q$);
UPDATE public.tournament_divisions SET entry_limit=1 WHERE name='Ladies';
-- Hugo/Zaheer case: reuse Zaheer's paid slot, retain Hugo as payer.
SET LOCAL ROLE authenticated;
SELECT pg_temp.replace_player();
RESET ROLE;
SELECT pg_temp.expect((SELECT email='new@example.com' AND payment_status='paid' AND partner_email='owner@example.com'
    AND pay_token<>(SELECT pay_token FROM old_slot) AND NOT whatsapp_added AND tshirt_size IS NULL
    FROM public.event_registrations WHERE id='00000000-0000-0000-0000-000000000002'),'paid slot and personal state');
SELECT pg_temp.expect((SELECT partner_email='new@example.com' FROM public.event_registrations WHERE email='owner@example.com'),'reciprocal partner');
SELECT pg_temp.expect(private.count_registration_places((SELECT jsonb_agg(to_jsonb(r)) FROM public.event_registrations r))=1,'full division still uses one place');
SELECT pg_temp.expect((SELECT to_jsonb(p)-'metadata' FROM public.payments p WHERE id='00000000-0000-0000-0000-000000000020')=(SELECT to_jsonb(p)-'metadata'-'original_metadata' FROM original p),'financial ledger unchanged');
SELECT pg_temp.expect((SELECT count(*) FROM public.temporary_licenses WHERE player_id=2)=1 AND (SELECT count(*) FROM public.temporary_licenses WHERE player_id=3)=0,'licence stays with former player');
SELECT pg_temp.expect((SELECT metadata->'covers'->1->>'email'='new@example.com' AND metadata->'covers'->2->>'email'='former@example.com'
    AND metadata->'covers'->3->>'email'='former@example.com' FROM public.payments WHERE id='00000000-0000-0000-0000-000000000020'),'entry allocation only; licence and other division unchanged');
SELECT pg_temp.expect((SELECT count(*) FROM public.event_activity_log WHERE action='admin.player_replaced')=1,'audited');
SELECT pg_temp.expect((SELECT to_jsonb(p) FROM public.payments p WHERE id='00000000-0000-0000-0000-000000000021')=(SELECT to_jsonb(p) FROM license_payment p),'licence ledger untouched');
DELETE FROM public.payments WHERE id='00000000-0000-0000-0000-000000000021';
SELECT pg_temp.must_fail('has changed');

-- The payer may also be replaced; original payer attribution must survive.
SET LOCAL ROLE authenticated;
SELECT pg_temp.replace_player('00000000-0000-0000-0000-000000000001','owner@example.com','new@example.com',4);
RESET ROLE;
SELECT pg_temp.expect((SELECT partner_email='next@example.com' FROM public.event_registrations WHERE email='new@example.com'),'either side can be replaced');
SELECT pg_temp.expect((SELECT player_id=1 AND metadata->>'email'='owner@example.com' AND amount=1720 FROM public.payments),'original payer and amount retained');

-- Separate payer, legacy registration-id-only manual receipts, and nested metadata.
UPDATE public.payments SET metadata='{"registration_id":"00000000-0000-0000-0000-000000000002","email":"new@example.com","division":"Ladies"}';
INSERT INTO public.payments(event_id,player_id,amount,metadata) VALUES(101,3,800,'{"original_trx":{"metadata":{"covers":[{"type":"entry","email":"new@example.com","division":"Ladies"},{"type":"license","email":"new@example.com"}]}}}');
SET LOCAL ROLE authenticated;
SELECT pg_temp.replace_player('00000000-0000-0000-0000-000000000002','new@example.com','next@example.com',5);
RESET ROLE;
SELECT pg_temp.expect((SELECT metadata->'covers'->0->>'email'='other@example.com' FROM public.payments WHERE player_id=1),'legacy entry receipt transferred');
SELECT pg_temp.expect((SELECT metadata#>>'{original_trx,metadata,covers,0,email}'='other@example.com'
    AND metadata#>>'{original_trx,metadata,covers,1,email}'='new@example.com' FROM public.payments WHERE player_id=3),'nested cover transferred without licence');

-- Unpaid solo entries remain unpaid and can be substituted without a team.
UPDATE public.tournament_divisions SET entry_limit=NULL;
UPDATE public.event_registrations SET partner_name=NULL,partner_email=NULL,partner_payment_status=NULL;
UPDATE public.event_registrations SET payment_status='pending' WHERE email='other@example.com';
DELETE FROM public.payments;
SET LOCAL ROLE authenticated;
SELECT pg_temp.replace_player('00000000-0000-0000-0000-000000000002','other@example.com',NULL,2);
RESET ROLE;
SELECT pg_temp.expect((SELECT payment_status='pending' FROM public.event_registrations WHERE email='former@example.com'),'unpaid status preserved');
SELECT pg_temp.expect((SELECT count(*) FROM public.payments)=0 AND (SELECT count(*) FROM public.payment_refunds)=0,'no charge or refund');
SELECT pg_temp.expect(NOT has_function_privilege('anon','public.replace_registration_player(uuid,text,text,bigint)','execute'),'anonymous access denied');
SELECT pg_temp.expect(NOT has_function_privilege('authenticated','private.transfer_registration_entry_metadata(jsonb,public.event_registrations,public.event_registrations,public.players,jsonb)','execute'),'helper access denied');
ROLLBACK;
