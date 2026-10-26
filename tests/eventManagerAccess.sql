\set ON_ERROR_STOP on
-- Disposable local database only; all fixtures and schema changes roll back.
DO $$ BEGIN
    IF current_setting('port') <> '55441' THEN
        RAISE EXCEPTION 'Run this test only on the disposable instance on port 55441';
    END IF;
END $$;
BEGIN;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, deleted_at timestamptz);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid;
$$;
CREATE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'email';
$$;
CREATE TABLE public.admin_sidebar_permissions (email text PRIMARY KEY, role text, allowed_tabs text[], module_permissions jsonb);
CREATE TABLE public.players (id bigint PRIMARY KEY, email text, name text);
CREATE TABLE public.organisations (id uuid PRIMARY KEY, created_by bigint);
CREATE TABLE public.organisation_members (organisation_id uuid, user_email text, role text);
CREATE TABLE public.club_members (club_id uuid, user_email text, role text);
CREATE TABLE public.calendar (id bigint PRIMARY KEY, organisation_id uuid, club_id uuid, organiser_email text, event_co_admins text[]);
CREATE TABLE public.event_registrations (id bigint PRIMARY KEY, event_id bigint, email text, partner_email text, registered_by text);
CREATE TABLE public.tournament_participants (id bigint PRIMARY KEY, event_id bigint, email text);
CREATE TABLE public.payments (id bigint PRIMARY KEY, event_id bigint, email text);
CREATE FUNCTION public.account_is_active() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
    SELECT EXISTS (SELECT 1 FROM auth.users WHERE id=auth.uid() AND deleted_at IS NULL);
$$;
CREATE FUNCTION public.is_super_admin(p_email text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
    SELECT EXISTS (SELECT 1 FROM public.admin_sidebar_permissions WHERE lower(email)=lower(p_email) AND role='super_admin');
$$;
CREATE FUNCTION public.can_manage_calendar_event(p_org uuid, p_club uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
    SELECT EXISTS (SELECT 1 FROM public.organisation_members WHERE organisation_id=p_org AND lower(user_email)=lower(auth.email()) AND role IN ('owner','admin'))
        OR EXISTS (SELECT 1 FROM public.club_members WHERE club_id=p_club AND lower(user_email)=lower(auth.email()) AND role IN ('owner','admin'));
$$;
\ir ../supabase/migrations/20261013081526_event_manager_registration_player_access.sql
\ir ../supabase/migrations/20261013081914_event_manager_player_lookup_performance.sql

ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_or_admin ON public.players FOR SELECT TO authenticated
    USING (lower(email)=lower(auth.email()) OR public.is_super_admin(auth.email()));
CREATE POLICY registration_access ON public.event_registrations FOR SELECT TO authenticated
    USING (lower(email)=lower(auth.email()) OR lower(partner_email)=lower(auth.email()) OR public.can_manage_event(event_id));
CREATE POLICY payment_access ON public.payments FOR SELECT TO authenticated
    USING (lower(email)=lower(auth.email()) OR public.can_manage_event(event_id));
CREATE POLICY participant_access ON public.tournament_participants FOR SELECT TO authenticated
    USING (lower(email)=lower(auth.email()) OR public.is_super_admin(auth.email()));
DO $$ DECLARE t text; BEGIN
    FOREACH t IN ARRAY ARRAY['players','event_registrations','tournament_participants','payments'] LOOP
        EXECUTE format('CREATE POLICY account_must_exist ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.account_is_active())) WITH CHECK ((SELECT public.account_is_active()))', t);
    END LOOP;
END $$;
GRANT USAGE ON SCHEMA public, auth TO authenticated;
GRANT SELECT ON public.players, public.event_registrations, public.tournament_participants, public.payments TO authenticated;

INSERT INTO auth.users(id,email)
SELECT ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid, email
FROM (VALUES (1,'assigned@example.com'),(2,'all@example.com'),(3,'owner@example.com'),(4,'admin@example.com'),(5,'viewer@example.com'),(6,'coadmin@example.com'),(7,'outsider@example.com'),(8,'super@example.com'),(9,'organiser@example.com'),(10,'club@example.com'),(11,'legacy@example.com'),(12,'modules-only@example.com'),(13,'under_score@example.com'),(14,'underXscore@example.com')) AS accounts(n,email);
INSERT INTO public.admin_sidebar_permissions VALUES
    ('assigned@example.com','custom',ARRAY['event-mgmt'],'{"event-mgmt":{"allowedEvents":[101]}}'),
    ('all@example.com','custom',ARRAY['event-mgmt'],'{}'),
    ('super@example.com','super_admin',ARRAY[]::text[],'{}'),
    ('modules-only@example.com','custom',ARRAY[]::text[],'{"event-mgmt":{"allowedEvents":[101]}}'),
    ('under_score@example.com','custom',ARRAY['event-mgmt'],'{"event-mgmt":{"allowedEvents":[101]}}');
INSERT INTO public.players VALUES (1,'PlayerA@example.com','Player A'),(2,'partner@example.com','Partner'),(3,'other@example.com','Other event'),(4,'legacy@example.com','Legacy owner'),(5,'assigned@example.com','Manager'),(6,'rankedin@example.com','Legacy participant');
INSERT INTO public.organisations VALUES ('00000000-0000-0000-0001-000000000001',4);
INSERT INTO public.organisation_members VALUES
    ('00000000-0000-0000-0001-000000000001','owner@example.com','owner'),
    ('00000000-0000-0000-0001-000000000001','admin@example.com','admin'),
    ('00000000-0000-0000-0001-000000000001','viewer@example.com','viewer');
INSERT INTO public.club_members VALUES ('00000000-0000-0000-0002-000000000001','club@example.com','admin');
INSERT INTO public.calendar VALUES
    (101,'00000000-0000-0000-0001-000000000001',NULL,'organiser@example.com',ARRAY['coadmin@example.com']),
    (102,NULL,NULL,NULL,ARRAY[]::text[]),
    (103,NULL,'00000000-0000-0000-0002-000000000001',NULL,ARRAY[]::text[]);
INSERT INTO public.event_registrations VALUES (1,101,'playera@example.com','partner@example.com',NULL),(2,102,'other@example.com',NULL,NULL);
INSERT INTO public.tournament_participants VALUES (1,101,'playera@example.com'),(2,102,'other@example.com'),(3,101,'rankedin@example.com');
INSERT INTO public.payments VALUES (1,101,'playera@example.com'),(2,102,'other@example.com');

CREATE FUNCTION pg_temp.expect(condition boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.as_user(n integer, email text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('request.jwt.claims',jsonb_build_object('sub','00000000-0000-0000-0000-'||lpad(n::text,12,'0'),'email',email,'role','authenticated')::text,true); END $$;
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user(1,'ASSIGNED@example.com');
SELECT pg_temp.expect(public.can_manage_event(101) AND NOT public.can_manage_event(102),'assigned event scope');
SELECT pg_temp.expect((SELECT count(*) FROM public.event_registrations)=1,'assigned registrations');
SELECT pg_temp.expect((SELECT count(*) FROM public.payments)=1,'assigned payments');
SELECT pg_temp.expect((SELECT count(*) FROM public.tournament_participants)=2,'assigned legacy participants');
SELECT pg_temp.expect((SELECT count(*) FROM public.players)=4,'linked player, partner, legacy participant and own profile only');
SELECT pg_temp.as_user(2,'all@example.com');
SELECT pg_temp.expect(public.can_manage_event(101) AND public.can_manage_event(102),'unrestricted event tab preserves full access');
SELECT pg_temp.as_user(3,'owner@example.com');
SELECT pg_temp.expect(public.can_manage_event(101) AND NOT public.can_manage_event(102),'organisation owner scope');
SELECT pg_temp.expect((SELECT count(*) FROM public.players)=3,'organisation player visibility');
SELECT pg_temp.as_user(4,'admin@example.com');
SELECT pg_temp.expect(public.can_manage_event(101),'organisation admin');
SELECT pg_temp.as_user(5,'viewer@example.com');
SELECT pg_temp.expect(NOT public.can_manage_event(101) AND (SELECT count(*) FROM public.players)=0,'organisation viewer denied management data');
SELECT pg_temp.as_user(6,'coadmin@example.com');
SELECT pg_temp.expect(public.can_manage_event(101),'event co-admin');
SELECT pg_temp.as_user(7,'outsider@example.com');
SELECT pg_temp.expect(NOT public.can_manage_event(101) AND (SELECT count(*) FROM public.players)=0 AND (SELECT count(*) FROM public.event_registrations)=0,'unassigned account denied');
SELECT pg_temp.as_user(8,'super@example.com');
SELECT pg_temp.expect(public.can_manage_event(101) AND public.can_manage_event(102) AND (SELECT count(*) FROM public.players)=6,'super admin unchanged');
SELECT pg_temp.as_user(9,'organiser@example.com');
SELECT pg_temp.expect(public.can_manage_event(101),'organiser');
SELECT pg_temp.as_user(10,'club@example.com');
SELECT pg_temp.expect(public.can_manage_event(103) AND NOT public.can_manage_event(101),'club manager scope');
SELECT pg_temp.as_user(11,'legacy@example.com');
SELECT pg_temp.expect(public.can_manage_event(101),'legacy organisation creator');
SELECT pg_temp.as_user(12,'modules-only@example.com');
SELECT pg_temp.expect(public.can_manage_event(101) AND NOT public.can_manage_event(102),'explicit assignment grants tab without allowed_tabs');
SELECT pg_temp.as_user(14,'underXscore@example.com');
SELECT pg_temp.expect(NOT public.can_manage_event(101),'underscore treated literally');
SELECT pg_temp.as_user(1,'assigned@example.com');
RESET ROLE;
UPDATE auth.users SET deleted_at=now() WHERE email='assigned@example.com';
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect(NOT public.can_manage_event(101) AND (SELECT count(*) FROM public.players)=0,'deleted account denied');
RESET ROLE;
SELECT pg_temp.expect(NOT has_function_privilege('anon','public.can_manage_event(bigint)','EXECUTE') AND NOT has_function_privilege('anon','private.managed_event_player_emails()','EXECUTE'),'anonymous helper access denied');
SELECT 'Event Manager access assertions passed' AS result;
ROLLBACK;
