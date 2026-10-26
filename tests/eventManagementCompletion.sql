\set ON_ERROR_STOP on
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
    SELECT auth.email() IN ('manager@example.com','inactive@example.com') AND event_id IN (101,103);
$$;
CREATE TABLE public.calendar(id bigint PRIMARY KEY, event_name text, finance_managed boolean DEFAULT true,
    start_date date, end_date date, event_status text DEFAULT 'active');
CREATE TABLE public.event_registrations(id uuid DEFAULT gen_random_uuid(), event_id bigint, payment_status text DEFAULT 'paid');
CREATE TABLE public.payments(id uuid DEFAULT gen_random_uuid(), amount numeric);
CREATE TABLE public.event_activity_log(event_id bigint, actor_email text, actor_role text, action text, category text, summary text, details jsonb);
GRANT USAGE ON SCHEMA public, auth TO authenticated;
\ir ../supabase/migrations/20261017150846_manual_event_management_completion.sql

CREATE FUNCTION pg_temp.expect(condition boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF; END $$;
CREATE FUNCTION pg_temp.as_user(email text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub','00000000-0000-0000-0000-000000000099','email',email)::text, true);
END $$;
CREATE FUNCTION pg_temp.must_fail(message text, event_id bigint DEFAULT 101, completed boolean DEFAULT true, expected timestamptz DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
    BEGIN PERFORM public.set_event_management_completed(event_id, completed, expected);
    EXCEPTION WHEN OTHERS THEN
        IF position(message IN SQLERRM)=0 THEN RAISE EXCEPTION 'Wrong failure: % (expected %)', SQLERRM, message; END IF;
        RETURN;
    END;
    RAISE EXCEPTION 'Expected failure: %', message;
END $$;
INSERT INTO public.calendar(id,event_name,finance_managed,start_date,end_date) VALUES
(101,'Nationals',true,'2026-10-16','2026-10-16'),(102,'Other manager event',true,'2026-09-01','2026-09-01'),(103,'Unmanaged',false,'2026-09-01','2026-09-01');
INSERT INTO public.event_registrations(event_id) VALUES(101);
INSERT INTO public.payments(amount) VALUES(800);
CREATE TEMP TABLE original_calendar AS SELECT * FROM public.calendar;
CREATE TEMP TABLE original_registrations AS SELECT * FROM public.event_registrations;
CREATE TEMP TABLE original_payments AS SELECT * FROM public.payments;
SELECT pg_temp.expect((SELECT count(*) FROM public.event_management_completion)=0,'past events are not auto-completed');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('player@example.com');
SELECT pg_temp.must_fail('cannot manage');
SELECT pg_temp.as_user('inactive@example.com');
SELECT pg_temp.must_fail('active event-manager');
SELECT pg_temp.as_user('manager@example.com');
SELECT pg_temp.must_fail('cannot manage',102);
SELECT pg_temp.must_fail('not enabled',103);
SELECT pg_temp.must_fail('Choose whether',101,NULL);
SELECT public.set_event_management_completed(101,true);
SELECT pg_temp.expect((SELECT completed_at IS NOT NULL AND completed_by=auth.uid() FROM public.event_management_completion WHERE event_id=101),'manager completes event');
SELECT pg_temp.must_fail('status changed');
-- Explicit repeated state is idempotent and does not add another audit.
SELECT public.set_event_management_completed(101,true,(SELECT completed_at FROM public.event_management_completion WHERE event_id=101));
RESET ROLE;
SELECT pg_temp.expect((SELECT count(*) FROM public.event_activity_log)=1,'one completion audit');
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('player@example.com');
SELECT pg_temp.expect((SELECT count(*) FROM public.event_management_completion)=0,'unrelated player cannot read manager state');
SELECT pg_temp.as_user('manager@example.com');
SELECT public.set_event_management_completed(101,false,(SELECT completed_at FROM public.event_management_completion WHERE event_id=101));
SELECT pg_temp.expect((SELECT completed_at IS NULL AND completed_by IS NULL FROM public.event_management_completion WHERE event_id=101),'reopen returns event to main list');
RESET ROLE;
SELECT pg_temp.expect((SELECT count(*) FROM public.event_activity_log)=2,'reopen audit');
SELECT pg_temp.expect(NOT EXISTS((SELECT * FROM public.calendar) EXCEPT (SELECT * FROM original_calendar)),'dates and public event status preserved');
SELECT pg_temp.expect(NOT EXISTS((SELECT * FROM public.event_registrations) EXCEPT (SELECT * FROM original_registrations)),'registration data preserved');
SELECT pg_temp.expect(NOT EXISTS((SELECT * FROM public.payments) EXCEPT (SELECT * FROM original_payments)),'payments preserved');
-- An audit-write failure must roll back the completion marker too.
CREATE FUNCTION pg_temp.reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'simulated audit failure'; END $$;
CREATE TRIGGER reject_audit BEFORE INSERT ON public.event_activity_log FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_audit();
SELECT pg_temp.must_fail('simulated audit failure');
SELECT pg_temp.expect((SELECT completed_at IS NULL FROM public.event_management_completion WHERE event_id=101),'completion rolls back with failed audit');
SELECT pg_temp.expect(NOT has_function_privilege('anon','public.set_event_management_completed(bigint,boolean,timestamptz)','execute'),'anonymous mutations denied');
SELECT pg_temp.expect(NOT has_table_privilege('authenticated','public.event_management_completion','UPDATE'),'direct writes denied');
SELECT pg_temp.expect(NOT has_table_privilege('anon','public.event_management_completion','SELECT'),'anonymous reads denied');
ROLLBACK;
\echo 'Manual event completion checks passed'
