\set ON_ERROR_STOP on
-- Disposable local Postgres only. Fixtures and DDL are rolled back.
DO $$ BEGIN IF current_setting('port') <> '55443' THEN
    RAISE EXCEPTION 'Run only on the disposable instance on port 55443';
END IF; END $$;
BEGIN;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid;
$$;
CREATE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'email';
$$;
CREATE FUNCTION public.account_is_active() RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT auth.uid() IS NOT NULL AND auth.email() <> 'inactive@example.com';
$$;
CREATE FUNCTION public.can_manage_event(event_id bigint) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT auth.email() IN ('manager@example.com', 'inactive@example.com') AND event_id = 101;
$$;
CREATE TABLE public.calendar(id bigint PRIMARY KEY, event_status text DEFAULT 'active');
CREATE TABLE public.tournament_divisions(id uuid PRIMARY KEY, event_id bigint, name text);
CREATE TABLE public.event_registrations(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id bigint, email text, full_name text, phone text,
    partner_name text, partner_email text, partner_payment_status text, division text, division_id uuid,
    status text DEFAULT 'registered', payment_status text DEFAULT 'paid', payment_method text DEFAULT 'paystack',
    registered_by text, pay_token uuid DEFAULT gen_random_uuid(), tshirt_size text DEFAULT 'M', license_status text
);
CREATE TABLE public.payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), amount numeric, metadata jsonb);
CREATE TABLE public.payment_refunds(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), amount numeric);
CREATE TABLE public.draws(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id bigint, division_id uuid, status text DEFAULT 'draft');
CREATE TABLE public.draw_entries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), draw_id uuid, source_registration_id uuid);
CREATE TABLE public.event_activity_log(event_id bigint, actor_email text, actor_role text, action text, category text, summary text, details jsonb);
ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY manager_read ON public.event_registrations FOR SELECT TO authenticated USING(public.can_manage_event(event_id));
GRANT USAGE ON SCHEMA public, auth TO authenticated;
GRANT SELECT ON public.event_registrations, public.event_activity_log, public.payments TO authenticated;
\ir ../supabase/migrations/20261017144329_manage_registration_teams.sql
\ir ../supabase/migrations/20261017150227_complete_partial_registration_teams.sql

CREATE FUNCTION pg_temp.expect(condition boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF; END $$;
CREATE FUNCTION pg_temp.as_user(email text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub','00000000-0000-0000-0000-000000000099','email',email)::text, true);
END $$;
CREATE FUNCTION pg_temp.change_team(action text DEFAULT 'merge', other_id uuid DEFAULT '00000000-0000-0000-0000-000000000002', division_key text DEFAULT 'id:00000000-0000-0000-0000-000000000010') RETURNS jsonb LANGUAGE sql AS $$
    SELECT public.manage_registration_team(action, '00000000-0000-0000-0000-000000000001', other_id, division_key);
$$;
CREATE FUNCTION pg_temp.must_fail(message text, action text DEFAULT 'merge', other_id uuid DEFAULT '00000000-0000-0000-0000-000000000002', division_key text DEFAULT 'id:00000000-0000-0000-0000-000000000010') RETURNS void LANGUAGE plpgsql AS $$ BEGIN
    BEGIN PERFORM pg_temp.change_team(action, other_id, division_key);
    EXCEPTION WHEN OTHERS THEN
        IF position(message IN SQLERRM) = 0 THEN RAISE EXCEPTION 'Wrong failure: % (expected %)', SQLERRM, message; END IF;
        RETURN;
    END;
    RAISE EXCEPTION 'Expected failure: %', message;
END $$;

INSERT INTO public.calendar VALUES(101,'active'),(102,'active');
INSERT INTO public.tournament_divisions VALUES('00000000-0000-0000-0000-000000000010',101,'Ladies'),('00000000-0000-0000-0000-000000000011',101,'Mixed');
INSERT INTO public.event_registrations(id,event_id,email,full_name,division,division_id,partner_name,registered_by,license_status) VALUES
('00000000-0000-0000-0000-000000000001',101,'amira@example.com','Amira Safieddine','Old Ladies','00000000-0000-0000-0000-000000000010',NULL,'amira@example.com','temporary'),
('00000000-0000-0000-0000-000000000002',101,'caterina@example.com','Caterina Frazzitta','Ladies','00000000-0000-0000-0000-000000000010','Amira','caterina@example.com','none');
INSERT INTO public.payments(amount,metadata) VALUES (800,'{"email":"amira@example.com","reference":"amira-paid"}'), (800,'{"email":"caterina@example.com","reference":"caterina-paid"}');
CREATE TEMP TABLE original_entries AS SELECT to_jsonb(r)-'partner_name'-'partner_email'-'partner_payment_status' AS value FROM public.event_registrations r;
CREATE TEMP TABLE original_payments AS SELECT * FROM public.payments;

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('player@example.com');
SELECT pg_temp.must_fail('cannot manage entries');
SELECT pg_temp.as_user('inactive@example.com');
SELECT pg_temp.must_fail('active event-manager');
SELECT pg_temp.as_user('manager@example.com');
SELECT pg_temp.must_fail('two different', 'merge', '00000000-0000-0000-0000-000000000001');
SELECT pg_temp.must_fail('same event', 'merge', '00000000-0000-0000-0000-000000000099');
SELECT pg_temp.must_fail('same division', 'merge', '00000000-0000-0000-0000-000000000002', 'id:stale');
SELECT pg_temp.must_fail('no longer a team','split');
SELECT pg_temp.must_fail('Choose merge or split',NULL);
RESET ROLE;

UPDATE public.event_registrations SET division_id='00000000-0000-0000-0000-000000000011' WHERE email='caterina@example.com';
SELECT pg_temp.must_fail('same division');
UPDATE public.event_registrations SET division_id='00000000-0000-0000-0000-000000000010',event_id=102 WHERE email='caterina@example.com';
SELECT pg_temp.must_fail('same event');
UPDATE public.event_registrations SET event_id=101,status='withdrawn' WHERE email='caterina@example.com';
SELECT pg_temp.must_fail('Withdrawn');
UPDATE public.event_registrations SET status='registered' WHERE email='caterina@example.com';
UPDATE public.event_registrations SET email=' AMIRA@EXAMPLE.COM ' WHERE full_name='Caterina Frazzitta';
SELECT pg_temp.must_fail('two different players');
UPDATE public.event_registrations SET email='caterina@example.com' WHERE full_name='Caterina Frazzitta';
INSERT INTO public.event_registrations(event_id,email,full_name,division_id) VALUES(101,'third@example.com','Third','00000000-0000-0000-0000-000000000010');
UPDATE public.event_registrations SET partner_email='caterina@example.com' WHERE email='third@example.com';
SELECT pg_temp.must_fail('already linked');
UPDATE public.event_registrations SET partner_email=NULL,email='caterina@example.com' WHERE email='third@example.com';
SELECT pg_temp.must_fail('duplicate active');
DELETE FROM public.event_registrations WHERE full_name='Third';
INSERT INTO public.draws(event_id,division_id) VALUES(101,'00000000-0000-0000-0000-000000000010');
SELECT pg_temp.must_fail('generated draw');
DELETE FROM public.draws;
INSERT INTO public.draws(event_id,division_id) VALUES(101,'00000000-0000-0000-0000-000000000011');
INSERT INTO public.draw_entries(draw_id,source_registration_id) SELECT id,'00000000-0000-0000-0000-000000000002' FROM public.draws;
SELECT pg_temp.must_fail('generated draw');
DELETE FROM public.draw_entries;
DELETE FROM public.draws;

-- Simulate an error on the second write: the first write must roll back too.
-- Reproduce the live incident: Caterina reserved Amira before Amira entered solo.
UPDATE public.event_registrations SET partner_email='amira@example.com',partner_payment_status='paid' WHERE email='caterina@example.com';
CREATE FUNCTION pg_temp.reject_second_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.email='caterina@example.com' THEN RAISE EXCEPTION 'simulated write failure'; END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER reject_second BEFORE UPDATE ON public.event_registrations FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_second_update();
SELECT pg_temp.must_fail('simulated write failure');
SELECT pg_temp.expect((SELECT count(*) FROM public.event_registrations WHERE partner_email IS NOT NULL)=1,'failed completion retains only the original reservation');
SELECT pg_temp.expect((SELECT partner_email IS NULL FROM public.event_registrations WHERE email='amira@example.com'),'failed completion does not leave a partial first write');
DROP TRIGGER reject_second ON public.event_registrations;

SET LOCAL ROLE authenticated;
SELECT pg_temp.change_team();
SELECT pg_temp.expect((SELECT partner_email FROM public.event_registrations WHERE email='amira@example.com')='caterina@example.com','Amira points to Caterina');
SELECT pg_temp.expect((SELECT partner_email FROM public.event_registrations WHERE email='caterina@example.com')='amira@example.com','Caterina points to Amira');
SELECT pg_temp.must_fail('already linked');
RESET ROLE;
INSERT INTO public.draws(event_id,division_id) VALUES(101,'00000000-0000-0000-0000-000000000010');
SELECT pg_temp.must_fail('generated draw','split');
DELETE FROM public.draws;
SET LOCAL ROLE authenticated;
SELECT pg_temp.change_team('split');
SELECT pg_temp.expect((SELECT count(*) FROM public.event_registrations WHERE partner_email IS NULL AND partner_name IS NULL AND partner_payment_status IS NULL)=2,'split clears both sides');
SELECT pg_temp.must_fail('no longer a team','split');
RESET ROLE;

SELECT pg_temp.expect(NOT EXISTS((SELECT to_jsonb(r)-'partner_name'-'partner_email'-'partner_payment_status' FROM public.event_registrations r) EXCEPT (SELECT value FROM original_entries)),'individual registrations unchanged');
SELECT pg_temp.expect(NOT EXISTS((SELECT * FROM public.payments) EXCEPT (SELECT * FROM original_payments)),'payments unchanged');
SELECT pg_temp.expect((SELECT count(*) FROM public.payment_refunds)=0,'no refunds');
SELECT pg_temp.expect((SELECT count(*) FROM public.event_activity_log)=2,'exactly one audit per successful action');
SELECT pg_temp.expect((SELECT bool_and(actor_email='manager@example.com' AND actor_role='ADMIN') FROM public.event_activity_log),'actor recorded');

-- Legacy names resolve to the same division ID; pending fees are not marked paid.
UPDATE public.event_registrations SET division_id=NULL,division=' LADIES ',payment_status='pending',partner_email='absent@example.com' WHERE email='caterina@example.com';
SELECT pg_temp.change_team();
SELECT pg_temp.expect((SELECT partner_payment_status FROM public.event_registrations WHERE email='amira@example.com')='pending','pending fee preserved');
SELECT pg_temp.change_team('split');
-- Existing one-way teams can be split safely too.
UPDATE public.event_registrations SET partner_email='caterina@example.com' WHERE email='amira@example.com';
-- Complete the opposite direction too; payment and registration data still stay.
SELECT pg_temp.change_team();
SELECT pg_temp.expect((SELECT count(*) FROM public.event_registrations WHERE partner_email IS NOT NULL)=2,'opposite one-way reservation completes');
SELECT pg_temp.change_team('split');
UPDATE public.event_registrations SET partner_email='caterina@example.com' WHERE email='amira@example.com';
SELECT pg_temp.change_team('split');
UPDATE public.calendar SET event_status='cancelled' WHERE id=101;
SELECT pg_temp.must_fail('cancelled');
SELECT pg_temp.expect(NOT has_function_privilege('anon','public.manage_registration_team(text,uuid,uuid,text)','execute'),'anonymous execution revoked');
SELECT pg_temp.expect(NOT has_function_privilege('anon','private.manage_registration_team(text,uuid,uuid,text)','execute'),'private implementation also denies anonymous calls');
SELECT pg_temp.expect(NOT has_function_privilege('authenticated','private.registration_team_division_key(public.event_registrations)','execute'),'internal roster helper is not exposed');
ROLLBACK;
\echo 'Registration merge/split checks passed'
