\set ON_ERROR_STOP on
-- Run only on the disposable PostgreSQL instance; all fixtures are rolled back.
DO $$ BEGIN IF current_setting('port') <> '55443' THEN
    RAISE EXCEPTION 'Use the disposable database on port 55443';
END IF; END $$;
BEGIN;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT NULLIF(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'sub', '')::uuid;
$$;
CREATE TABLE public.calendar(id bigint PRIMARY KEY, is_weekly boolean DEFAULT false, is_quick_event boolean DEFAULT false, registration_closes_at timestamptz);
CREATE TABLE public.tournament_divisions(id uuid PRIMARY KEY, event_id bigint, name text, entry_limit integer, entries_close_at timestamptz, entry_fee numeric DEFAULT 0);
CREATE TABLE public.event_registrations(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz DEFAULT now(), event_id bigint, division_id uuid,
    division text, full_name text, email text, phone text, partner_name text, partner_email text,
    payment_status text DEFAULT 'pending', payment_method text, partner_payment_status text, status text DEFAULT 'registered',
    registered_by text, tshirt_size text, tshirt_sponsor_name text, tshirt_logo_url text, access_grant_id uuid,
    UNIQUE(event_id,email,division)
);
CREATE TABLE public.payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), status text, payment_type text, metadata jsonb);
CREATE FUNCTION public.can_manage_event(event_id bigint) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false; $$;
ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_entries ON public.event_registrations TO authenticated USING (registered_by = 'owner') WITH CHECK (registered_by = 'owner');
GRANT USAGE ON SCHEMA public, auth TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
\ir ../supabase/migrations/20261019050830_division_team_capacity.sql
\ir ../supabase/migrations/20261019050836_registration_deadline_payment_access.sql
\ir ../supabase/migrations/20261019050841_atomic_division_capacity_moves.sql
\ir ../supabase/migrations/20261019054258_event_late_payment_setting.sql
CREATE FUNCTION pg_temp.expect(condition boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF; END $$;
CREATE FUNCTION pg_temp.must_fail(query text, message text DEFAULT 'is full') RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    BEGIN EXECUTE query;
    EXCEPTION WHEN OTHERS THEN
        IF position(message IN SQLERRM) = 0 THEN RAISE EXCEPTION 'Wrong error: %; expected %', SQLERRM, message; END IF;
        RETURN;
    END;
    RAISE EXCEPTION 'Expected failure: %', message;
END $$;
INSERT INTO public.calendar(id) VALUES(101),(102),(103);
INSERT INTO public.tournament_divisions(id,event_id,name,entry_limit) VALUES
('00000000-0000-0000-0000-000000000010',101,'Open',2),
('00000000-0000-0000-0000-000000000011',101,'Other',1),
('00000000-0000-0000-0000-000000000012',102,'Open',NULL),
('00000000-0000-0000-0000-000000000013',103,'Legacy',0);
INSERT INTO public.event_registrations(event_id,division_id,division,email,partner_email,registered_by) VALUES
(101,'00000000-0000-0000-0000-000000000010','Open','a','b','owner'),
(101,'00000000-0000-0000-0000-000000000010','Open','b','a','owner'),
(101,'00000000-0000-0000-0000-000000000010','Open','c',NULL,'owner');
SELECT pg_temp.expect(private.count_registration_places((SELECT jsonb_agg(to_jsonb(r)) FROM public.event_registrations r))=2,'pair plus pending solo uses two places');
SELECT pg_temp.must_fail($q$INSERT INTO public.event_registrations(event_id,division_id,division,email) VALUES(101,'00000000-0000-0000-0000-000000000010','Open','new')$q$);
SELECT pg_temp.must_fail($q$INSERT INTO public.event_registrations(event_id,division,email) VALUES(101,' open ','legacy-new')$q$);
-- Complete a solo, even at capacity; two mirror rows still use only one place.
INSERT INTO public.event_registrations(event_id,division_id,division,email,partner_email,registered_by) VALUES(101,'00000000-0000-0000-0000-000000000010','Open','d','c','owner');
UPDATE public.event_registrations SET partner_email='d' WHERE email='c';
-- A split fails atomically at capacity.
SELECT pg_temp.must_fail($q$UPDATE public.event_registrations SET partner_email=NULL WHERE email IN ('a','b')$q$);
SELECT pg_temp.expect((SELECT count(*) FROM public.event_registrations WHERE email IN ('a','b') AND partner_email IS NOT NULL)=2,'failed split retains original pair');
UPDATE public.event_registrations SET status='withdrawn' WHERE email='a';
SELECT pg_temp.must_fail($q$INSERT INTO public.event_registrations(event_id,division, email) VALUES(101,'Open','new')$q$);
UPDATE public.event_registrations SET status='withdrawn' WHERE email='b';
-- Full team withdrawal opens exactly one place; a new pair can take it.
INSERT INTO public.event_registrations(event_id,division, email,partner_email) VALUES(101,'Open','e','f'),(101,'Open','f','e');
SELECT pg_temp.must_fail($q$INSERT INTO public.event_registrations(event_id,division,email) VALUES(101,'Open','new')$q$);
UPDATE public.event_registrations SET status='withdrawn' WHERE email IN ('e','f');
UPDATE public.event_registrations SET partner_email=NULL WHERE email IN ('c','d');
SELECT pg_temp.expect(private.count_registration_places((SELECT jsonb_agg(to_jsonb(r)) FROM public.event_registrations r))=2,'split uses two places when space exists');
UPDATE public.event_registrations SET partner_email=CASE email WHEN 'c' THEN 'd' ELSE 'c' END WHERE email IN ('c','d');
INSERT INTO public.event_registrations(event_id,division,email) VALUES(101,'Open','g');
-- A solo withdrawal also releases its place; deletion behaves the same way.
UPDATE public.event_registrations SET status='withdrawn' WHERE email='g';
INSERT INTO public.event_registrations(event_id,division,email) VALUES(101,'Open','h');
DELETE FROM public.event_registrations WHERE email='h';
INSERT INTO public.event_registrations(event_id,division,email) VALUES(101,'Open','i');
-- Existing excess entries remain editable/payable, but cannot grow.
UPDATE public.tournament_divisions SET entry_limit=1 WHERE name='Open' AND event_id=101;
UPDATE public.event_registrations SET payment_status='paid' WHERE event_id=101;
UPDATE public.event_registrations SET partner_email='replacement' WHERE email='i';
SELECT pg_temp.must_fail($q$INSERT INTO public.event_registrations(event_id,division,email) VALUES(101,'Open','new')$q$);
INSERT INTO public.event_registrations(event_id,division,email,partner_email) VALUES(101,'Open','replacement','i');
-- Stable IDs remain authoritative after a rename; legacy name-only rows work.
UPDATE public.tournament_divisions SET name='Renamed' WHERE id='00000000-0000-0000-0000-000000000010';
SELECT pg_temp.must_fail($q$INSERT INTO public.event_registrations(event_id,division_id,division,email) VALUES(101,'00000000-0000-0000-0000-000000000010','Old name','new')$q$);
-- Separate divisions/events and unlimited caps stay independent.
INSERT INTO public.event_registrations(event_id,division_id,division,email) VALUES(101,'00000000-0000-0000-0000-000000000011','Other','new');
SELECT pg_temp.must_fail($q$UPDATE public.event_registrations SET division_id='00000000-0000-0000-0000-000000000010',division='Renamed' WHERE email='new'$q$);
INSERT INTO public.event_registrations(event_id,division_id,division,email) VALUES(102,'00000000-0000-0000-0000-000000000012','Open','u'),(102,'00000000-0000-0000-0000-000000000012','Open','v');
-- Normalized duplicates and third-player links cannot overcount or hide a team.
SELECT pg_temp.expect(private.count_registration_places('[{"id":"1","email":" A ","partner_email":"B"},{"id":"2","email":"b","partner_email":"a"},{"id":"3","email":"a"}]')=1,'case and duplicate mirrors');
SELECT pg_temp.expect(private.count_registration_places('[{"id":"1","email":"a","partner_email":"b"},{"id":"2","email":"b","partner_email":"a"},{"id":"3","email":"c","partner_email":"a"}]')=2,'third player reserves another place');
-- Payment creation reserves pending entries in its own transaction, before charge.
UPDATE public.tournament_divisions SET entry_limit=1 WHERE event_id=103;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000099","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.payments(status,payment_type,metadata) VALUES('processing','event_entry_fee','{"source":"manual_event","registration_rows":[{"event_id":103,"division_id":"00000000-0000-0000-0000-000000000013","division":"Legacy","email":"owner-a","partner_email":"owner-b","registered_by":"owner","payment_status":"paid"},{"event_id":103,"division_id":"00000000-0000-0000-0000-000000000013","division":"Legacy","email":"owner-b","partner_email":"owner-a","registered_by":"owner","payment_status":"paid"}]}');
SELECT pg_temp.expect((SELECT count(*) FROM public.event_registrations WHERE event_id=103 AND payment_status='pending')=2,'reservation cannot mark either player paid');
SELECT public.reserve_event_registration_places('[{"event_id":103,"division_id":"00000000-0000-0000-0000-000000000013","division":"Legacy","email":"owner-a","partner_email":"owner-b"}]');
SELECT pg_temp.expect((SELECT count(*) FROM public.event_registrations WHERE event_id=103)=2,'retry does not duplicate reservations');
SELECT pg_temp.must_fail($q$INSERT INTO public.payments(status,payment_type,metadata) VALUES('processing','event_entry_fee','{"source":"manual_event","registration_rows":[{"event_id":103,"division":"Legacy","email":"owner-c","registered_by":"owner"}]}')$q$);
SELECT pg_temp.expect((SELECT count(*) FROM public.payments)=1,'full division rejects payment creation');
RESET ROLE;
UPDATE public.tournament_divisions SET entry_limit=2 WHERE name='Other';
SET LOCAL ROLE authenticated;
SELECT pg_temp.must_fail($q$SELECT public.reserve_event_registration_places('[{"event_id":101,"division":"Other","email":"intruder","registered_by":"stranger"}]')$q$,'row-level security');
RESET ROLE;
SELECT pg_temp.expect(NOT has_function_privilege('anon','public.reserve_event_registration_places(jsonb,jsonb)','execute'),'anonymous reservations denied');
SELECT pg_temp.expect(NOT has_function_privilege('authenticated','private.count_registration_places(jsonb)','execute'),'private roster counter not exposed');
-- The native checkout creates payments using the service role without a user sub.
UPDATE public.tournament_divisions SET entry_limit=2 WHERE event_id=103;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
INSERT INTO public.payments(status,payment_type,metadata) VALUES('processing','event_entry_fee','{"source":"manual_event","registration_rows":[{"event_id":103,"division":"Legacy","email":"service-native","registered_by":"native"}]}');
RESET ROLE;
SELECT pg_temp.expect((SELECT count(*) FROM public.event_registrations WHERE email='service-native' AND payment_status='pending')=1,'native service role reserves before payment');
-- Any failure rolls back an entire multi-division reservation, including its
-- previously successful first entry and the payment row itself.
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
SELECT pg_temp.must_fail($q$INSERT INTO public.payments(status,payment_type,metadata) VALUES('processing','event_entry_fee','{"source":"manual_event","registration_rows":[{"event_id":101,"division":"Other","email":"cart-first","registered_by":"owner"},{"event_id":103,"division":"Legacy","email":"cart-last","registered_by":"owner"}]}')$q$);
RESET ROLE;
SELECT pg_temp.expect(NOT EXISTS(SELECT 1 FROM public.event_registrations WHERE email LIKE 'cart-%'),'multi-division reservation rolls back all places');
SELECT pg_temp.expect((SELECT count(*) FROM public.payments)=2,'failed cart creates no payment');
-- Closing entries never prevents payment, even at/above capacity. No new player
-- or partner can enter, including an expired checkout in an uncapped division.
UPDATE public.calendar SET registration_closes_at=now()-interval '1 hour' WHERE id IN (102,103);
UPDATE public.event_registrations SET payment_status='paid' WHERE email='owner-a';
SELECT pg_temp.expect((SELECT payment_status='paid' FROM public.event_registrations WHERE email='owner-a'),'existing capped entry can pay after close');
UPDATE public.tournament_divisions SET entry_limit=NULL WHERE event_id=103;
SELECT pg_temp.must_fail($q$INSERT INTO public.event_registrations(event_id,division,email) VALUES(103,'Legacy','too-late')$q$,'Registration has closed');
SELECT pg_temp.must_fail($q$INSERT INTO public.event_registrations(event_id,division,email,partner_email) VALUES(103,'Legacy','late-partner','owner-a')$q$,'Registration has closed');
SELECT pg_temp.must_fail($q$INSERT INTO public.payments(status,payment_type,metadata) VALUES('processing','event_entry_fee','{"source":"manual_event","registration_rows":[{"event_id":102,"division":"Open","email":"expired-cart"}]}')$q$,'Registration has closed');
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
INSERT INTO public.payments(status,payment_type,metadata) VALUES('processing','event_entry_fee','{"source":"manual_event","registration_rows":[{"event_id":103,"division":"Legacy","email":"owner-b"}]}');
RESET ROLE;
UPDATE public.event_registrations SET status='withdrawn' WHERE email='owner-b';
SELECT pg_temp.must_fail($q$UPDATE public.event_registrations SET status='registered' WHERE email='owner-b'$q$,'Registration has closed');
-- A per-division override follows the existing registration closing policy.
UPDATE public.tournament_divisions SET entries_close_at=now()+interval '1 hour' WHERE event_id=102;
INSERT INTO public.event_registrations(event_id,division_id,division,email) VALUES(102,'00000000-0000-0000-0000-000000000012','Open','override-open');
UPDATE public.tournament_divisions SET entries_close_at=now()-interval '1 hour' WHERE event_id=101 AND name='Other';
SELECT pg_temp.must_fail($q$INSERT INTO public.event_registrations(event_id,division,email) VALUES(101,'Other','division-closed')$q$,'Registration has closed');
-- Switching off late payments blocks new checkouts/resumes, preserves existing
-- entries and allows a payment already initiated to finish confirmation.
UPDATE public.calendar SET allow_payments_after_close=false WHERE id=103;
SELECT pg_temp.must_fail($q$SELECT public.reserve_event_registration_places('[{"event_id":103,"division":"Legacy","email":"owner-a"}]')$q$,'Payments have closed');
SELECT pg_temp.must_fail($q$INSERT INTO public.payments(status,payment_type,metadata) VALUES('processing','event_entry_fee','{"source":"manual_event","registration_rows":[{"event_id":103,"division":"Legacy","email":"owner-a"}]}')$q$,'Payments have closed');
SELECT pg_temp.must_fail($q$INSERT INTO public.payments(status,payment_type,metadata) SELECT 'processing','event_entry_fee',jsonb_build_object('source','native_entry_balance','registration_id',id) FROM public.event_registrations WHERE email='service-native'$q$,'Payments have closed');
UPDATE public.event_registrations SET payment_status='paid' WHERE email='service-native';
SELECT pg_temp.expect((SELECT payment_status='paid' FROM public.event_registrations WHERE email='service-native'),'already initiated payment can still be confirmed');
UPDATE public.calendar SET allow_payments_after_close=true WHERE id=103;
SELECT public.reserve_event_registration_places('[{"event_id":103,"division":"Legacy","email":"owner-a"}]');
SELECT pg_temp.must_fail($q$INSERT INTO public.payments(status,payment_type,metadata) VALUES('processing','event_entry_fee','{"source":"manual_event","registration_rows":[{"event_id":103,"division":"Legacy","email":"new-even-with-switch-on"}]}')$q$,'Registration has closed');
UPDATE public.calendar SET allow_payments_after_close=false WHERE id IN (101,102);
SELECT public.assert_event_registration_payments_open('[{"event_id":102,"division":"Open","email":"u"}]');
SELECT pg_temp.must_fail($q$SELECT public.assert_event_registration_payments_open('[{"event_id":101,"division":"Other","email":"new"}]')$q$,'Payments have closed');
SELECT pg_temp.expect(NOT has_function_privilege('anon','public.assert_event_registration_payments_open(jsonb)','execute'),'anonymous payment checks denied');

-- Team moves are atomic: a full target never parks/unlinks the original team.
INSERT INTO public.calendar(id) VALUES(104);
INSERT INTO public.tournament_divisions(id,event_id,name,entry_limit,entry_fee) VALUES
('00000000-0000-0000-0000-000000000020',104,'Source',2,100),
('00000000-0000-0000-0000-000000000021',104,'Target',1,200);
INSERT INTO public.event_registrations(id,event_id,division_id,division,email,partner_email,payment_status) VALUES
('00000000-0000-0000-0000-000000000030',104,'00000000-0000-0000-0000-000000000020','Source','move-a','move-b','paid'),
('00000000-0000-0000-0000-000000000031',104,'00000000-0000-0000-0000-000000000020','Source','move-b','move-a','paid');
INSERT INTO public.event_registrations(event_id,division_id,division,email) VALUES(104,'00000000-0000-0000-0000-000000000021','Target','full-target');
SELECT pg_temp.must_fail($q$SELECT public.move_registration_division(ARRAY['00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000031']::uuid[],'00000000-0000-0000-0000-000000000021')$q$);
SELECT pg_temp.expect((SELECT count(*) FROM public.event_registrations WHERE email IN ('move-a','move-b') AND division='Source' AND partner_email IS NOT NULL)=2,'failed move preserves original division and pairing');
DELETE FROM public.event_registrations WHERE email='full-target';
SELECT public.move_registration_division(ARRAY['00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000031']::uuid[],'00000000-0000-0000-0000-000000000021');
SELECT pg_temp.expect((SELECT count(*) FROM public.event_registrations WHERE email IN ('move-a','move-b') AND division='Target' AND partner_email IS NOT NULL AND payment_status='pending')=2,'successful move keeps one pair and marks higher fees pending');

-- Super-admin late additions use verified account permissions. Ordinary users,
-- event managers, inactive accounts and unsigned service calls retain deadlines.
CREATE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('request.jwt.claims',true),'')::jsonb->>'email';
$$;
CREATE TABLE auth.users(id uuid PRIMARY KEY, deleted_at timestamptz);
INSERT INTO auth.users VALUES
('00000000-0000-0000-0000-000000000099',NULL),
('00000000-0000-0000-0000-000000000098',now());
CREATE TABLE public.admin_sidebar_permissions(email text,role text);
INSERT INTO public.admin_sidebar_permissions VALUES('super@example.com','super_admin'),('manager@example.com','event_manager');
CREATE FUNCTION public.account_is_active() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
    SELECT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid() AND deleted_at IS NULL);
$$;
CREATE FUNCTION public.is_super_admin(user_email text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
    SELECT EXISTS(SELECT 1 FROM public.admin_sidebar_permissions WHERE email=user_email AND role='super_admin');
$$;
\ir ../supabase/migrations/20261019111524_super_admin_late_registration_override.sql
CREATE FUNCTION pg_temp.as_registration_user(email text,uid text DEFAULT '00000000-0000-0000-0000-000000000099') RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',uid,'email',email,'role','authenticated',
        'user_metadata',jsonb_build_object('role','super_admin'))::text,true);
END $$;
INSERT INTO public.calendar(id,registration_closes_at) VALUES(105,now()-interval '1 day'),(106,now()+interval '1 day');
INSERT INTO public.tournament_divisions(id,event_id,name,entry_limit,entries_close_at) VALUES
('00000000-0000-0000-0000-000000000050',105,'Closed Open',2,NULL),
('00000000-0000-0000-0000-000000000051',106,'Closed division',2,now()-interval '1 day');
SELECT pg_temp.as_registration_user('player@example.com');
SET LOCAL ROLE authenticated;
SELECT pg_temp.must_fail($q$INSERT INTO public.event_registrations(event_id,division,email,registered_by) VALUES(105,'Closed Open','ordinary-late','owner')$q$,'Registration has closed');
SELECT pg_temp.as_registration_user('manager@example.com');
SELECT pg_temp.must_fail($q$INSERT INTO public.event_registrations(event_id,division,email,registered_by) VALUES(105,'Closed Open','manager-late','owner')$q$,'Registration has closed');
SELECT pg_temp.as_registration_user('super@example.com',NULL);
SELECT pg_temp.must_fail($q$INSERT INTO public.event_registrations(event_id,division,email,registered_by) VALUES(105,'Closed Open','unsigned-late','owner')$q$,'Registration has closed');
SELECT pg_temp.as_registration_user('super@example.com','00000000-0000-0000-0000-000000000098');
SELECT pg_temp.must_fail($q$INSERT INTO public.event_registrations(event_id,division,email,registered_by) VALUES(105,'Closed Open','inactive-late','owner')$q$,'Registration has closed');
SELECT pg_temp.as_registration_user('super@example.com','00000000-0000-0000-0000-000000000097');
SELECT pg_temp.must_fail($q$INSERT INTO public.event_registrations(event_id,division,email,registered_by) VALUES(105,'Closed Open','missing-account-late','owner')$q$,'Registration has closed');
SELECT pg_temp.as_registration_user('super@example.com');
-- This is the same one-statement, two-row insertion as Add Team in the admin UI.
INSERT INTO public.event_registrations(event_id,division_id,division,email,partner_email,payment_status,registered_by) VALUES
(105,'00000000-0000-0000-0000-000000000050','Closed Open','admin-late-a','admin-late-b','pending','owner'),
(105,'00000000-0000-0000-0000-000000000050','Closed Open','admin-late-b','admin-late-a','pending','owner');
SELECT pg_temp.expect((SELECT count(*)=2 AND bool_and(payment_status='pending') FROM public.event_registrations WHERE email IN('admin-late-a','admin-late-b')),'active super admin adds both linked pending teammates after event closes');
RESET ROLE;
SELECT pg_temp.expect(private.count_registration_places((SELECT jsonb_agg(to_jsonb(r)) FROM public.event_registrations r WHERE event_id=105))=1,'late admin team consumes one team place');
SET LOCAL ROLE authenticated;
INSERT INTO public.event_registrations(event_id,division,email,registered_by) VALUES(105,'Closed Open','admin-late-solo','owner');
SELECT pg_temp.must_fail($q$INSERT INTO public.event_registrations(event_id,division,email,registered_by) VALUES(105,'Closed Open','over-capacity-admin','owner')$q$,'is full');
INSERT INTO public.event_registrations(event_id,division_id,division,email,registered_by) VALUES
(106,'00000000-0000-0000-0000-000000000051','Closed division','division-admin-late','owner');
SELECT pg_temp.expect((SELECT count(*)=1 FROM public.event_registrations WHERE email='division-admin-late'),'super admin also overrides a division closing time');
SELECT pg_temp.must_fail($q$INSERT INTO public.event_registrations(event_id,division,email,registered_by) VALUES(106,'Closed division','rls-denied','outside')$q$,'row-level security');
SELECT pg_temp.as_registration_user('manager@example.com');
SELECT pg_temp.must_fail($q$INSERT INTO public.event_registrations(event_id,division,email,registered_by) VALUES(106,'Closed division','division-manager-late','owner')$q$,'Registration has closed');
-- Existing entries can still be marked paid after close without granting any new entry.
UPDATE public.event_registrations SET payment_status='paid' WHERE email='admin-late-a';
SELECT pg_temp.expect((SELECT payment_status='paid' FROM public.event_registrations WHERE email='admin-late-a'),'existing entry remains payable after the admin override');
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
SELECT pg_temp.must_fail($q$INSERT INTO public.event_registrations(event_id,division,email) VALUES(106,'Closed division','service-late')$q$,'Registration has closed');
RESET ROLE;
SELECT pg_temp.expect(NOT has_function_privilege('authenticated','private.assert_registration_deadline(bigint,uuid,text,text)','execute'),'deadline helper remains private');
ROLLBACK;
\echo 'Division capacity checks passed'
