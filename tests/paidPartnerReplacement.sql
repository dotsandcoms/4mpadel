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
CREATE TABLE public.calendar(id bigint PRIMARY KEY, event_status text DEFAULT 'active', registration_closes_at timestamptz);
CREATE TABLE public.tournament_divisions(id uuid PRIMARY KEY, entries_close_at timestamptz);
CREATE TABLE public.players(id bigint PRIMARY KEY, name text, email text, contact_number text);
CREATE TABLE public.event_registrations(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id bigint, email text, full_name text, phone text,
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
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
\ir ../supabase/migrations/20261013130304_replace_paid_partner.sql

CREATE FUNCTION pg_temp.expect(condition boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF; END $$;
CREATE FUNCTION pg_temp.as_user(email text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub','00000000-0000-0000-0000-000000000001','email',email,'role','authenticated')::text, true);
END $$;
CREATE FUNCTION pg_temp.must_fail(owner_id uuid, expected_email text, player_id bigint, message text)
RETURNS void LANGUAGE plpgsql AS $$ BEGIN
    BEGIN
        PERFORM public.replace_paid_partner(owner_id, expected_email, player_id);
    EXCEPTION WHEN OTHERS THEN
        IF position(message IN SQLERRM) = 0 THEN RAISE EXCEPTION 'Wrong failure: % (expected %)', SQLERRM, message; END IF;
        RETURN;
    END;
    RAISE EXCEPTION 'Expected replacement to fail: %', message;
END $$;

INSERT INTO public.calendar VALUES (101,'active',NULL),(102,'active',NULL);
INSERT INTO public.tournament_divisions VALUES ('00000000-0000-0000-0000-000000000010', NULL);
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
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('owner@example.com');
SELECT pg_temp.expect((SELECT count(*) FROM public.get_paid_partner_replacements(101))=1,'payer can replace');
SELECT pg_temp.expect((SELECT count(*) FROM public.get_paid_partner_replacements(102))=0,'event scoped');
SELECT pg_temp.as_user('former@example.com');
SELECT pg_temp.expect((SELECT count(*) FROM public.get_paid_partner_replacements(101))=0,'covered partner cannot replace owner');
SELECT pg_temp.must_fail('00000000-0000-0000-0000-000000000001','former@example.com',3,'Only the player');
SELECT pg_temp.as_user('other@example.com');
SELECT pg_temp.must_fail('00000000-0000-0000-0000-000000000001','former@example.com',3,'Only the player');
SELECT pg_temp.as_user('admin@example.com');
SELECT pg_temp.expect((SELECT count(*) FROM public.get_paid_partner_replacements(101))=1,'event admin sees true owner');
SELECT pg_temp.as_user('owner@example.com');
SELECT pg_temp.must_fail('00000000-0000-0000-0000-000000000001','wrong@example.com',3,'partner has changed');
SELECT pg_temp.must_fail('00000000-0000-0000-0000-000000000001','former@example.com',1,'different partner');
RESET ROLE;

-- Registration attribution and paid flags are not proof when partners paid separately.
UPDATE public.payments SET metadata=jsonb_set(metadata,'{covers}','[{"type":"entry","email":"owner@example.com","division":"Ladies"}]');
INSERT INTO public.payments(event_id,player_id,amount,metadata) VALUES(101,2,800,'{"covers":[{"type":"entry","email":"former@example.com","division":"Ladies"}]}');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('owner@example.com');
SELECT pg_temp.expect((SELECT count(*) FROM public.get_paid_partner_replacements(101))=0,'separate payers denied');
SELECT pg_temp.must_fail('00000000-0000-0000-0000-000000000001','former@example.com',3,'owner paid for both');
RESET ROLE;
DELETE FROM public.payments WHERE player_id=2;
UPDATE public.payments SET metadata=(SELECT original_metadata FROM original);
UPDATE public.payments SET status='pending';
SELECT pg_temp.expect(NOT private.paid_partner_eligible('00000000-0000-0000-0000-000000000001'),'pending payment denied');
UPDATE public.payments SET status='success', payment_type='temp_license';
SELECT pg_temp.expect(NOT private.paid_partner_eligible('00000000-0000-0000-0000-000000000001'),'license payment denied');
UPDATE public.payments SET payment_type='event_entry_fee';
INSERT INTO public.payment_refunds(payment_id,event_registration_id,status,amount) VALUES
('00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000002','pending',800);
SELECT pg_temp.expect(NOT private.paid_partner_eligible('00000000-0000-0000-0000-000000000001'),'pending refund denied');
UPDATE public.payment_refunds SET status='failed';
SELECT pg_temp.expect(private.paid_partner_eligible('00000000-0000-0000-0000-000000000001'),'failed refund does not remove credit');
DELETE FROM public.payment_refunds;

UPDATE public.calendar SET event_status='cancelled' WHERE id=101;
SELECT pg_temp.expect(NOT private.paid_partner_eligible('00000000-0000-0000-0000-000000000001'),'cancelled event denied');
UPDATE public.calendar SET event_status='active' WHERE id=101;
UPDATE public.event_registrations SET division='Ladies Renamed';
SELECT pg_temp.expect(private.paid_partner_eligible('00000000-0000-0000-0000-000000000001'),'stable division ID survives rename');
UPDATE public.event_registrations SET division='Ladies';
UPDATE public.event_registrations SET payment_status='pending' WHERE email='former@example.com';
SELECT pg_temp.expect(NOT private.paid_partner_eligible('00000000-0000-0000-0000-000000000001'),'unpaid partner denied');
UPDATE public.event_registrations SET payment_status='paid' WHERE email='former@example.com';
INSERT INTO public.event_registrations(event_id,email,full_name,division,division_id)
VALUES(101,'new@example.com','Already Registered','Ladies','00000000-0000-0000-0000-000000000010');
SELECT pg_temp.must_fail('00000000-0000-0000-0000-000000000001','former@example.com',3,'already has an entry');
DELETE FROM public.event_registrations WHERE email='new@example.com';
-- The owner may have paid both spots in separate transactions, too.
UPDATE public.payments SET metadata=jsonb_set(metadata,'{covers}','[{"type":"entry","email":"owner@example.com","division":"Ladies"}]');
INSERT INTO public.payments(event_id,player_id,amount,metadata) VALUES(101,1,800,'{"covers":[{"type":"entry","email":"former@example.com","division":"Ladies"}]}');
SELECT pg_temp.expect(private.paid_partner_eligible('00000000-0000-0000-0000-000000000001'),'same owner with two payments qualifies');
DELETE FROM public.payments WHERE id<>'00000000-0000-0000-0000-000000000020';
UPDATE public.payments SET metadata=(SELECT original_metadata FROM original);

INSERT INTO public.draws(event_id,division_id) VALUES (101,'00000000-0000-0000-0000-000000000010');
INSERT INTO public.draw_entries(draw_id,source_registration_id) SELECT id,'00000000-0000-0000-0000-000000000001' FROM public.draws;
SELECT pg_temp.must_fail('00000000-0000-0000-0000-000000000001','former@example.com',3,'generated draw');
SELECT pg_temp.expect((SELECT email FROM public.event_registrations WHERE id='00000000-0000-0000-0000-000000000002')='former@example.com','failure leaves partner untouched');
DELETE FROM public.draw_entries;
DELETE FROM public.draws;
UPDATE public.calendar SET registration_closes_at=now()-interval '1 minute' WHERE id=101;
SET LOCAL ROLE authenticated;
SELECT pg_temp.must_fail('00000000-0000-0000-0000-000000000001','former@example.com',3,'Registration has closed');
SELECT pg_temp.as_user('admin@example.com');
SELECT public.replace_paid_partner('00000000-0000-0000-0000-000000000001','former@example.com',3);
RESET ROLE;

SELECT pg_temp.expect((SELECT count(*) FROM public.event_registrations)=2,'exactly two spots retained');
SELECT pg_temp.expect((SELECT count(*) FROM public.payments)=1 AND (SELECT count(*) FROM public.payment_refunds)=0,'no charge or refund');
SELECT pg_temp.expect((SELECT amount FROM public.payments)=1720,'amount retained');
SELECT pg_temp.expect((SELECT player_id FROM public.payments)=1,'original payer retained');
SELECT pg_temp.expect((SELECT reference FROM public.payments)=(SELECT reference FROM original),'transaction reference retained');
SELECT pg_temp.expect((SELECT metadata->'line_items' FROM public.payments)=(SELECT original_metadata->'line_items' FROM original),'receipt retained');
SELECT pg_temp.expect((SELECT metadata->'covers'->2->>'email' FROM public.payments)='former@example.com','license cover not transferred');
SELECT pg_temp.expect((SELECT player_id FROM public.temporary_licenses)=2,'license not transferred');
SELECT pg_temp.expect((SELECT metadata->'covers'->3->>'email' FROM public.payments)='former@example.com','other division unchanged');
SELECT pg_temp.expect((SELECT metadata->'covers'->1->>'email' FROM public.payments)='new@example.com','paid entry cover transferred');
SELECT pg_temp.expect((SELECT partner_email FROM public.event_registrations WHERE email='owner@example.com')='new@example.com','owner linked to new partner');
SELECT pg_temp.expect((SELECT partner_email FROM public.event_registrations WHERE email='new@example.com')='owner@example.com','new partner linked to owner');
SELECT pg_temp.expect((SELECT payment_status FROM public.event_registrations WHERE email='new@example.com')='paid','new partner paid');
SELECT pg_temp.expect((SELECT pay_token FROM public.event_registrations WHERE email='new@example.com')<>(SELECT pay_token FROM old_slot),'old payment token revoked');
SELECT pg_temp.expect((SELECT tshirt_size IS NULL AND NOT whatsapp_added FROM public.event_registrations WHERE email='new@example.com'),'personal choices reset');
SELECT pg_temp.expect((SELECT actor_role FROM public.event_activity_log WHERE action='partner_replaced')='ADMIN','admin audit');
UPDATE public.calendar SET registration_closes_at=NULL WHERE id=101;
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('owner@example.com');
SELECT pg_temp.expect((SELECT count(*) FROM public.get_paid_partner_replacements(101))=1,'eligible after transfer');
SELECT pg_temp.must_fail('00000000-0000-0000-0000-000000000001','former@example.com',4,'partner has changed');
SELECT public.replace_paid_partner('00000000-0000-0000-0000-000000000001','new@example.com',4);
RESET ROLE;
SELECT pg_temp.expect((SELECT jsonb_array_length(metadata->'partner_replacements') FROM public.payments)=2,'repeat replacement history');
SELECT pg_temp.expect((SELECT count(*) FROM public.event_activity_log WHERE action='partner_replaced')=2,'one audit per replacement');
SELECT pg_temp.expect((SELECT count(*) FROM public.payments)=1 AND (SELECT count(*) FROM public.payment_refunds)=0,'repeat transfer still free');
SELECT pg_temp.expect(NOT has_function_privilege('anon','public.replace_paid_partner(uuid,text,bigint)','execute'),'anonymous execution revoked');
ROLLBACK;
\echo 'Paid partner replacement checks passed'
