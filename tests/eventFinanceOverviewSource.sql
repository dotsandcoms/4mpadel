\set ON_ERROR_STOP on
DO $$ BEGIN IF current_setting('port') <> '55446' THEN
    RAISE EXCEPTION 'Run only on the disposable instance on port 55446';
END IF; END $$;
BEGIN;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
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
    SELECT auth.email() IN ('manager@example.com','inactive@example.com') AND event_id IN (101,103);
$$;
CREATE FUNCTION public.player_license_eligibility(player_id bigint,event_id bigint) RETURNS jsonb LANGUAGE sql STABLE AS $$
    SELECT jsonb_build_object('full', player_id=1, 'temporary', player_id=2 AND event_id=101);
$$;
CREATE TABLE public.calendar(id bigint PRIMARY KEY,is_manual boolean,entry_fee numeric,category_fees jsonb,
    early_bird_fee numeric,early_bird_ends_at timestamptz,organiser_interim_payments jsonb,organiser_settlement_confirmation jsonb);
CREATE TABLE public.admin_sidebar_permissions(email text,allowed_tabs text[],module_permissions jsonb);
CREATE TABLE public.event_registrations(id uuid DEFAULT gen_random_uuid(),event_id bigint,email text,status text);
CREATE TABLE public.tournament_participants(id uuid DEFAULT gen_random_uuid(),event_id bigint,class_name text,is_paid boolean,profile_id bigint,full_name text,email text);
CREATE TABLE public.payments(id uuid DEFAULT gen_random_uuid(),event_id bigint,reference text,metadata jsonb);
CREATE TABLE public.tournament_divisions(id uuid DEFAULT gen_random_uuid(),event_id bigint,entry_fee numeric);
CREATE TABLE public.payment_refunds(id uuid DEFAULT gen_random_uuid(),payment_id uuid,event_registration_id uuid,paystack_reference text);
CREATE TABLE public.players(id bigint,email text);
GRANT USAGE ON SCHEMA public,auth TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_payment_scope ON public.payments FOR SELECT TO authenticated USING(reference <> 'RLS-HIDDEN');
\ir ../supabase/migrations/20261110072130_event_finance_overview_source.sql
\ir ../supabase/migrations/20261110073604_optimize_event_finance_summary.sql

CREATE FUNCTION pg_temp.expect(condition boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF; END $$;
CREATE FUNCTION pg_temp.as_user(email text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub','00000000-0000-0000-0000-000000000099','email',email)::text,true);
END $$;
CREATE FUNCTION pg_temp.must_fail(message text,ids bigint[]) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
    BEGIN PERFORM public.event_finance_overview_source(ids);
    EXCEPTION WHEN OTHERS THEN
        IF position(message IN SQLERRM)=0 THEN RAISE EXCEPTION 'Wrong failure: %',SQLERRM; END IF;
        RETURN;
    END;
    RAISE EXCEPTION 'Expected failure: %',message;
END $$;
INSERT INTO public.calendar(id,is_manual) VALUES(101,true),(102,true),(103,false);
INSERT INTO public.players VALUES(1,'Full@Example.com'),(2,'temp@example.com');
INSERT INTO public.event_registrations(event_id,email,status)
    SELECT 101,'player'||n||'@example.com','registered' FROM generate_series(1,1501) n;
INSERT INTO public.event_registrations(id,event_id,email,status) VALUES
 ('00000000-0000-0000-0000-000000000001',101,' Full@Example.com ','registered'),
 ('00000000-0000-0000-0000-000000000002',101,'temp@example.com','withdrawn'),
 ('00000000-0000-0000-0000-000000000003',102,'other@example.com','registered');
INSERT INTO public.payments(id,event_id,reference,metadata) VALUES
 ('00000000-0000-0000-0000-000000000011',101,'PAID','{"note":"linked T1234567890123"}'),
 ('00000000-0000-0000-0000-000000000012',101,'STRING','"{\"paystack_ref\":\"legacy-ref\"}"'),
 ('00000000-0000-0000-0000-000000000013',102,'OTHER','{}'),
 ('00000000-0000-0000-0000-000000000014',101,'RLS-HIDDEN','{}');
INSERT INTO public.payment_refunds(payment_id,event_registration_id,paystack_reference) VALUES
 ('00000000-0000-0000-0000-000000000011',null,null),
 (null,'00000000-0000-0000-0000-000000000002',null),
 (null,null,'T1234567890123'),(null,null,'legacy-ref'),(null,null,'OTHER');
INSERT INTO public.tournament_participants(event_id,profile_id,full_name) VALUES(103,2,'Temp Player');
INSERT INTO public.admin_sidebar_permissions VALUES
 ('finance@example.com',ARRAY['finance'],'{"finance":{"allowedEvents":[102]}}');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('manager@example.com');
SELECT pg_temp.expect(jsonb_array_length(public.event_finance_overview_source(ARRAY[101])->'registrations')=1503,'reads beyond API row cap');
SELECT pg_temp.expect(jsonb_array_length(public.event_finance_overview_source(ARRAY[101])->'payments')=2,'retains caller payment RLS');
SELECT pg_temp.expect(jsonb_array_length(public.event_finance_overview_source(ARRAY[101])->'refunds')=4,'all three refund links, including withdrawn and legacy aliases');
SELECT pg_temp.expect((SELECT bool_or((l->'eligibility'->>'full')::boolean) FROM jsonb_array_elements(public.event_finance_overview_source(ARRAY[101])->'licenses') l),'case-insensitive licence lookup');
SELECT pg_temp.expect(jsonb_array_length(public.event_finance_overview_source(ARRAY[101,101])->'events')=1,'deduplicates requested events');
SELECT pg_temp.expect(jsonb_array_length(public.event_finance_overview_source(ARRAY[103])->'participants')=1,'RankedIn participant source');
SELECT pg_temp.must_fail('access denied',ARRAY[101,102]);
SELECT pg_temp.must_fail('access denied',ARRAY[999]);
SELECT pg_temp.must_fail('between 1 and 25',ARRAY[]::bigint[]);
SELECT pg_temp.must_fail('between 1 and 25',ARRAY[NULL]::bigint[]);
SELECT pg_temp.must_fail('between 1 and 25',ARRAY(SELECT n FROM generate_series(1,26) n));
SELECT pg_temp.as_user('finance@example.com');
SELECT pg_temp.expect(jsonb_array_length(public.event_finance_overview_source(ARRAY[102])->'events')=1,'assigned finance read access');
SELECT pg_temp.must_fail('access denied',ARRAY[101]);
SELECT pg_temp.as_user('inactive@example.com');
SELECT pg_temp.must_fail('active account',ARRAY[101]);
SELECT pg_temp.as_user('player@example.com');
SELECT pg_temp.must_fail('access denied',ARRAY[101]);
RESET ROLE;
SELECT pg_temp.expect(NOT has_function_privilege('anon','public.event_finance_overview_source(bigint[])','EXECUTE'),'no anonymous summary source');
SELECT pg_temp.expect(NOT has_function_privilege('service_role','public.event_finance_overview_source(bigint[])','EXECUTE'),'no worker bypass path');
ROLLBACK;
