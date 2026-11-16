\set ON_ERROR_STOP on
-- Disposable local instance only; schema, roles and fixtures all roll back.
DO $$ BEGIN IF current_database() <> 'fourm_data_api_grant_test'
    OR EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public') THEN
    RAISE EXCEPTION 'Use the empty disposable local fourm_data_api_grant_test database';
END IF; END $$;
BEGIN;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,deleted_at timestamptz);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT NULLIF(NULLIF(current_setting('request.jwt.claims',true),'')::jsonb->>'sub','')::uuid;
$$;
CREATE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('request.jwt.claims',true),'')::jsonb->>'email';
$$;
CREATE TABLE public.admin_sidebar_permissions(email text PRIMARY KEY,role text,allowed_tabs text[],module_permissions jsonb);
CREATE TABLE public.players(id bigint PRIMARY KEY,email text);
CREATE TABLE public.organisations(id uuid PRIMARY KEY,created_by bigint);
CREATE TABLE public.organisation_members(organisation_id uuid,user_email text,role text);
CREATE TABLE public.club_members(club_id uuid,user_email text,role text);
CREATE TABLE public.calendar(id bigint PRIMARY KEY,organisation_id uuid,club_id uuid,organiser_email text,event_co_admins text[]);
CREATE TABLE public.event_registrations(id uuid PRIMARY KEY,event_id bigint,email text,partner_email text,registered_by text,status text);
CREATE TABLE public.tournament_participants(id bigint,event_id bigint,email text);
CREATE TABLE public.payments(id uuid PRIMARY KEY,reference text UNIQUE,player_id bigint,event_id bigint,metadata jsonb);
CREATE TABLE public.payment_refunds(id integer PRIMARY KEY,payment_id uuid,paystack_reference text,event_registration_id uuid,initiated_by text);
CREATE FUNCTION public.account_is_active() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
    SELECT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid() AND deleted_at IS NULL);
$$;
CREATE FUNCTION public.is_super_admin(actor text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
    SELECT EXISTS(SELECT 1 FROM public.admin_sidebar_permissions WHERE lower(email)=lower(actor) AND role='super_admin');
$$;
CREATE FUNCTION public.can_manage_calendar_event(p_org uuid,p_club uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
    SELECT EXISTS(SELECT 1 FROM public.organisation_members WHERE organisation_id=p_org AND lower(user_email)=lower(auth.email()) AND role IN ('owner','admin'))
        OR EXISTS(SELECT 1 FROM public.club_members WHERE club_id=p_club AND lower(user_email)=lower(auth.email()) AND role IN ('owner','admin'));
$$;
\ir ../supabase/migrations/20261013081526_event_manager_registration_player_access.sql

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_refunds ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.reject_nested_refund_rls() RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Nested payment RLS must not run during refund reads'; END $$;
CREATE POLICY reject_nested_payments ON public.payments FOR SELECT TO authenticated USING(public.reject_nested_refund_rls());
CREATE POLICY "Admins can read refunds" ON public.payment_refunds FOR SELECT USING(auth.email() IN(SELECT email FROM public.admin_sidebar_permissions));
CREATE POLICY "Players can read own refunds" ON public.payment_refunds FOR SELECT USING(EXISTS(SELECT 1 FROM public.payments p WHERE p.id=payment_id));
CREATE POLICY "Users can read own refunds" ON public.payment_refunds FOR SELECT USING(payment_id IN(SELECT id FROM public.payments));
CREATE POLICY account_must_exist ON public.payment_refunds FOR ALL TO authenticated
    USING((SELECT public.account_is_active())) WITH CHECK((SELECT public.account_is_active()));
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO anon,authenticated,service_role;

INSERT INTO auth.users(id,email) VALUES
('00000000-0000-0000-0000-000000000001','manager@example.com'),
('00000000-0000-0000-0000-000000000002','payer@example.com'),
('00000000-0000-0000-0000-000000000003','outsider@example.com'),
('00000000-0000-0000-0000-000000000004','super@example.com');
INSERT INTO auth.users VALUES('00000000-0000-0000-0000-000000000005','deleted@example.com',now());
INSERT INTO public.admin_sidebar_permissions VALUES
('manager@example.com','custom',ARRAY['event-mgmt'],'{"event-mgmt":{"allowedEvents":[101]}}'),
('gallery@example.com','custom',ARRAY['gallery'],'{}'),
('full@example.com','custom',ARRAY['event-mgmt'],'{}'),
('super@example.com','super_admin',ARRAY[]::text[],'{}'),
('deleted@example.com','super_admin',ARRAY[]::text[],'{}');
INSERT INTO public.calendar VALUES(101,NULL,NULL,'organiser@example.com',ARRAY['coadmin@example.com']), (102,NULL,NULL,NULL,NULL);
INSERT INTO public.players VALUES(1,'payer@example.com'),(2,'other@example.com');
INSERT INTO public.event_registrations VALUES
('00000000-0000-0000-0000-000000000010',101,'entrant@example.com','partner@example.com','booker@example.com','withdrawn'),
('00000000-0000-0000-0000-000000000011',102,'other@example.com',NULL,NULL,'registered');
INSERT INTO public.payments VALUES
('00000000-0000-0000-0000-000000000020','historical-ref',1,101,'{}'),
('00000000-0000-0000-0000-000000000021','unrelated',2,102,'{}'),
('00000000-0000-0000-0000-000000000022','metadata-payer',NULL,102,'{"email":"metadata@example.com"}'),
('00000000-0000-0000-0000-000000000023','metadata-registrant',NULL,102,'{"registrant_email":"registrant@example.com"}');
INSERT INTO public.payment_refunds VALUES
(1,'00000000-0000-0000-0000-000000000020',NULL,'00000000-0000-0000-0000-000000000010','server'),
(2,NULL,'historical-ref',NULL,'server'),
(3,NULL,NULL,'00000000-0000-0000-0000-000000000010','server'),
(4,'00000000-0000-0000-0000-000000000021',NULL,'00000000-0000-0000-0000-000000000011','server'),
(5,'00000000-0000-0000-0000-000000000022',NULL,NULL,'server'),
(6,'00000000-0000-0000-0000-000000000023',NULL,NULL,'server'),
(7,NULL,NULL,NULL,'initiator@example.com'),
(8,NULL,NULL,NULL,'server');

\ir ../supabase/migrations/20261027080748_optimize_refund_read_authorization.sql
CREATE FUNCTION pg_temp.expect(condition boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.as_user(email text,uid text DEFAULT '00000000-0000-0000-0000-000000000001') RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',uid,'email',email,'role','authenticated','user_metadata',jsonb_build_object('role','super_admin'))::text,true);
END $$;
CREATE FUNCTION pg_temp.denied(query text,message text DEFAULT 'permission denied') RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    BEGIN EXECUTE query; EXCEPTION WHEN OTHERS THEN
        IF position(message IN SQLERRM)=0 THEN RAISE EXCEPTION 'Wrong error: %',SQLERRM; END IF;
        RETURN;
    END;
    RAISE EXCEPTION 'Expected denial: %',query;
END $$;
SELECT pg_temp.expect((SELECT count(*) FROM public.payment_refunds)=8,'migration preserves all refund data');
SELECT pg_temp.expect((SELECT permissive='RESTRICTIVE' FROM pg_policies WHERE tablename='payment_refunds' AND policyname='account_must_exist'),'active account is an additional requirement');
SELECT pg_temp.expect(NOT has_function_privilege('anon','private.can_read_payment_refund(uuid,text,uuid,text)','EXECUTE'),'anonymous private helper denied');
SELECT pg_temp.expect(NOT has_table_privilege('authenticated','public.payment_refunds','INSERT') AND NOT has_table_privilege('authenticated','public.payment_refunds','UPDATE') AND NOT has_table_privilege('authenticated','public.payment_refunds','DELETE'),'clients cannot mutate refunds');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('manager@example.com');
SELECT pg_temp.expect((SELECT array_agg(id ORDER BY id) FROM public.payment_refunds)=ARRAY[1,2,3],'assigned manager sees payment, reference-only and withdrawn registration refunds only');
SELECT pg_temp.denied('SELECT * FROM public.payments','Nested payment RLS');
SELECT pg_temp.as_user('organiser@example.com');
SELECT pg_temp.expect((SELECT count(*) FROM public.payment_refunds)=3,'direct organiser receives same event scope');
SELECT pg_temp.as_user('coadmin@example.com');
SELECT pg_temp.expect((SELECT count(*) FROM public.payment_refunds)=3,'coadmin receives same event scope');
SELECT pg_temp.as_user('payer@example.com','00000000-0000-0000-0000-000000000002');
SELECT pg_temp.expect((SELECT array_agg(id ORDER BY id) FROM public.payment_refunds)=ARRAY[1,2],'payer sees payment/ref-only refunds');
SELECT pg_temp.as_user('entrant@example.com');
SELECT pg_temp.expect((SELECT array_agg(id ORDER BY id) FROM public.payment_refunds)=ARRAY[1,3],'entrant retains withdrawn registration refunds');
SELECT pg_temp.as_user('partner@example.com');
SELECT pg_temp.expect((SELECT count(*) FROM public.payment_refunds)=2,'linked partner retains registration visibility');
SELECT pg_temp.as_user('booker@example.com');
SELECT pg_temp.expect((SELECT count(*) FROM public.payment_refunds)=2,'original registrant retains registration visibility');
SELECT pg_temp.as_user('METADATA@example.com');
SELECT pg_temp.expect((SELECT array_agg(id) FROM public.payment_refunds)=ARRAY[5],'metadata payer matches exactly, case-insensitively');
SELECT pg_temp.as_user('registrant@example.com');
SELECT pg_temp.expect((SELECT array_agg(id) FROM public.payment_refunds)=ARRAY[6],'metadata registrant ownership preserved');
SELECT pg_temp.as_user('initiator@example.com');
SELECT pg_temp.expect((SELECT array_agg(id) FROM public.payment_refunds)=ARRAY[7],'initiator can see orphaned historical refund');
SELECT pg_temp.as_user('outsider@example.com','00000000-0000-0000-0000-000000000003');
SELECT pg_temp.expect((SELECT count(*) FROM public.payment_refunds)=0,'active outsider and forged user_metadata grant no access');
SELECT pg_temp.as_user('gallery@example.com');
SELECT pg_temp.expect((SELECT count(*) FROM public.payment_refunds)=0,'unrelated admin module grants no finance access');
SELECT pg_temp.as_user('full@example.com');
SELECT pg_temp.expect(EXISTS(SELECT 1 FROM public.payment_refunds WHERE id=4),'unrestricted event manager retains access');
SELECT pg_temp.as_user('super@example.com','00000000-0000-0000-0000-000000000004');
SELECT pg_temp.expect((SELECT count(*) FROM public.payment_refunds)=8,'active super admin retains all refunds');
SELECT pg_temp.as_user('deleted@example.com','00000000-0000-0000-0000-000000000005');
SELECT pg_temp.expect((SELECT count(*) FROM public.payment_refunds)=0,'deleted super admin is denied');
SELECT pg_temp.as_user('payer@example.com',NULL);
SELECT pg_temp.expect((SELECT count(*) FROM public.payment_refunds)=0,'email without authenticated identity is denied');
SELECT pg_temp.denied('DELETE FROM public.payment_refunds');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.expect((SELECT count(*) FROM public.payment_refunds)=0,'anonymous refund reads are denied');
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
INSERT INTO public.payment_refunds(id,initiated_by) VALUES(9,'server');
SELECT pg_temp.expect((SELECT count(*) FROM public.payment_refunds)=9,'trusted refund worker still writes and reads');
RESET ROLE;
ROLLBACK;
\echo 'Refund read authorization checks passed'
