-- Run only in a disposable local PostgreSQL instance:
-- psql -X -h /tmp -p 55449 -d fourm_push_broadcast_test -f tests/pushBroadcast.sql
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() <> 'fourm_push_broadcast_test' OR to_regclass('public.push_outbox') IS NOT NULL
    OR EXISTS (SELECT 1 FROM pg_namespace WHERE nspname IN ('auth', 'private')) THEN
    RAISE EXCEPTION 'Use an empty disposable fourm_push_broadcast_test database.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE SCHEMA auth;
CREATE SCHEMA private;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (auth.jwt()->>'sub')::uuid $$;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,deleted_at timestamptz,banned_until timestamptz,is_anonymous boolean);
CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid,not_after timestamptz);
-- Mirror the installed session helper used by the wider legacy policy migration.
CREATE FUNCTION private.permission_actor_active() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u JOIN auth.sessions s ON s.user_id=u.id
    WHERE u.id=auth.uid() AND u.deleted_at IS NULL
      AND (u.banned_until IS NULL OR u.banned_until<now())
      AND NOT coalesce(u.is_anonymous,false)
      AND lower(u.email)=lower(auth.jwt()->>'email')
      AND s.id::text=auth.jwt()->>'session_id'
      AND (s.not_after IS NULL OR s.not_after>now())
  )
$$;
CREATE TABLE public.admin_sidebar_permissions(email text, role text, allowed_tabs text[]);
CREATE FUNCTION public.is_super_admin(text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT $1 = 'admin@example.test' $$;
CREATE TABLE public.players(id bigint PRIMARY KEY, name text, email text, notification_prefs jsonb DEFAULT '{}');
CREATE TABLE public.organisation_members(user_email text);
CREATE TABLE public.club_members(user_email text);
CREATE TABLE public.federation_members(user_email text);
CREATE TABLE public.organisations(created_by bigint,status text);
CREATE TABLE public.calendar(id bigint PRIMARY KEY, event_name text, start_date timestamptz, is_visible boolean DEFAULT true, sanction_status text);
CREATE TABLE public.event_registrations(id uuid DEFAULT gen_random_uuid(), event_id bigint, division_id uuid, email text, partner_email text, partner_name text, payment_status text, status text DEFAULT 'registered');
CREATE TABLE public.tournament_participants(event_id bigint, email text);
CREATE TABLE public.player_push_tokens(email text, token text, token_kind text DEFAULT 'expo');
CREATE TABLE public.push_outbox(id uuid DEFAULT gen_random_uuid(), email text, type text CONSTRAINT push_outbox_type_check CHECK(type = 'event_registration'), title text, body text, path text, data jsonb, status text, error text);
-- The migration has its own transaction.
COMMIT;
\ir ../supabase/migrations/20261021101301_admin_push_broadcasts.sql
\ir ../mobile/supabase/migrations/20261110091239_push_broadcast_home_and_paginated_history.sql
\ir ../supabase/migrations/20261120065830_align_admin_push_broadcast_authority.sql

BEGIN;
CREATE FUNCTION pg_temp.expect(condition boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',message; END IF; END $$;
CREATE FUNCTION pg_temp.rejects(statement text, expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE statement;
 EXCEPTION WHEN OTHERS THEN
  IF strpos(SQLERRM,expected) = 0 THEN RAISE EXCEPTION 'Expected %, got %',expected,SQLERRM; END IF;
  RETURN;
 END;
 RAISE EXCEPTION 'Expected rejection: %',statement;
END $$;

CREATE FUNCTION pg_temp.sign_in(p_email text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',jsonb_build_object('sub',u.id,'email',p_email,'session_id',s.id)::text,true)
  FROM auth.users u JOIN auth.sessions s ON s.user_id=u.id WHERE lower(u.email)=lower(p_email)
$$;

CREATE FUNCTION pg_temp.reject_all_broadcast_actions(reason text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.rejects('SELECT public.admin_push_broadcast_events()',reason);
  PERFORM pg_temp.rejects('SELECT public.admin_push_broadcast_players(''Alice'')',reason);
  PERFORM pg_temp.rejects('SELECT public.preview_push_broadcast()',reason);
  PERFORM pg_temp.rejects('SELECT public.list_push_broadcasts()',reason);
  PERFORM pg_temp.rejects('SELECT public.list_push_broadcasts_page(1)',reason);
  PERFORM pg_temp.rejects('SELECT public.send_push_broadcast(null,null,null,null,null)',reason);
END $$;

INSERT INTO public.calendar VALUES (101,'Spring open','2026-11-01',true,'approved'),(102,'Summer open','2026-12-01',true,'approved'),(103,'Private draft',null,false,null);
INSERT INTO public.players(id,name,email,notification_prefs) VALUES
 (1,'Alice',' Alice@example.test ','{}'), (2,'Bob','bob@example.test','{}'),
 (3,'Charlie','charlie@example.test','{"admin_broadcast":false}'), (4,'Dana','dana@example.test','{}'),
 (5,'Erin','erin@example.test','{"push_enabled":false}'), (6,'Solo','solo@example.test','{}'),
 (7,'Withdrawn','withdrawn@example.test','{}'), (8,'Synced','synced@example.test','{}');
INSERT INTO public.player_push_tokens(email,token)
 SELECT trim(lower(email)),'ExponentPushToken[' || id || ']' FROM public.players WHERE id <> 4;
INSERT INTO public.player_push_tokens VALUES('alice@example.test','ExponentPushToken[second]','expo');
INSERT INTO public.event_registrations(event_id,email,partner_email,partner_name,payment_status,status) VALUES
 (101,' ALICE@EXAMPLE.TEST ','bob@example.test','Bob','paid','registered'),
 (101,'charlie@example.test',null,null,'pending','registered'),
 (101,'dana@example.test',null,null,'paid','registered'),
 (101,'erin@example.test',null,null,'pending','registered'),
 (101,'withdrawn@example.test',null,null,'paid','withdrawn'),
 (102,'alice@example.test','bob@example.test','Bob','paid','registered'),
 (102,'solo@example.test',null,null,'pending','registered');
INSERT INTO public.tournament_participants VALUES (101,'ALICE@example.test'),(101,'withdrawn@example.test'),(101,'synced@example.test'),(101,null);
INSERT INTO auth.users(id,email) VALUES
  ('00000000-0000-0000-0000-000000000001','other@example.test'),
  ('00000000-0000-0000-0000-000000000002','custom@example.test'),
  ('00000000-0000-0000-0000-000000000003','admin@example.test');
INSERT INTO auth.sessions(id,user_id) SELECT gen_random_uuid(),id FROM auth.users;
INSERT INTO public.admin_sidebar_permissions VALUES ('CUSTOM@example.test','custom',ARRAY['email-broadcast']),('other@example.test','custom',ARRAY['players']);

SELECT pg_temp.expect(NOT has_function_privilege('anon','public.send_push_broadcast(uuid,text,text,text,text,bigint[],bigint[],text,text,text[])','EXECUTE'),'anon cannot send');
SELECT pg_temp.expect(has_function_privilege('authenticated','public.list_push_broadcasts_page(integer)','EXECUTE'),'existing authenticated history grant preserved');
SELECT pg_temp.expect(NOT has_function_privilege('authenticated','private.require_broadcast_admin()','EXECUTE'),'authority helper stays private');
SELECT pg_temp.expect(NOT has_function_privilege('authenticated','private.push_broadcast_audience(bigint[],bigint[],text,text,text[])','EXECUTE'),'internal resolver is private');
SELECT pg_temp.expect(NOT has_table_privilege('authenticated','public.push_broadcasts','SELECT'),'campaign table is private');
SELECT pg_temp.reject_all_broadcast_actions('Sign in');
SELECT pg_temp.sign_in('other@example.test');
SELECT pg_temp.reject_all_broadcast_actions('Broadcast permission required');
SELECT pg_temp.sign_in('custom@example.test');
INSERT INTO public.organisation_members VALUES (' Custom@example.test ');
SELECT pg_temp.reject_all_broadcast_actions('Broadcast permission required');
DELETE FROM public.organisation_members;
INSERT INTO public.club_members VALUES ('CUSTOM@example.test');
SELECT pg_temp.reject_all_broadcast_actions('Broadcast permission required');
DELETE FROM public.club_members;
INSERT INTO public.federation_members VALUES ('custom@example.test');
SELECT pg_temp.reject_all_broadcast_actions('Broadcast permission required');
DELETE FROM public.federation_members;
INSERT INTO public.players(id,name,email) VALUES (9,'Legacy organiser','CUSTOM@example.test');
INSERT INTO public.organisations VALUES (9,'approved');
SELECT pg_temp.reject_all_broadcast_actions('Broadcast permission required');
DELETE FROM public.organisations;
INSERT INTO public.players(id,name,email) VALUES (10,'Ambiguous profile','custom@example.test');
SELECT pg_temp.reject_all_broadcast_actions('Broadcast permission required');
DELETE FROM public.players WHERE id IN (9,10);
INSERT INTO public.admin_sidebar_permissions VALUES ('custom@example.test','custom',ARRAY['email-broadcast']);
SELECT pg_temp.reject_all_broadcast_actions('Broadcast permission required');
DELETE FROM public.admin_sidebar_permissions WHERE email='custom@example.test';
UPDATE auth.users SET deleted_at=now() WHERE email='custom@example.test';
SELECT pg_temp.reject_all_broadcast_actions('Sign in');
UPDATE auth.users SET deleted_at=NULL,banned_until=now()+interval '1 day' WHERE email='custom@example.test';
SELECT pg_temp.reject_all_broadcast_actions('Sign in');
UPDATE auth.users SET banned_until=NULL WHERE email='custom@example.test';
UPDATE auth.sessions SET not_after=now() WHERE user_id=auth.uid();
SELECT pg_temp.reject_all_broadcast_actions('Sign in');
UPDATE auth.sessions SET not_after=NULL WHERE user_id=auth.uid();
SELECT pg_temp.expect((SELECT count(*)=0 FROM public.push_outbox),'denied authority leaves the queue empty');
SELECT pg_temp.sign_in('admin@example.test');
INSERT INTO public.club_members VALUES ('admin@example.test');
SELECT pg_temp.expect((SELECT count(*)=3 FROM public.admin_push_broadcast_events()),'active platform admin retains access with a club membership');
DELETE FROM public.club_members;
SELECT pg_temp.sign_in('custom@example.test');
SELECT pg_temp.expect((SELECT count(*)=3 FROM public.admin_push_broadcast_events()),'broadcast-scoped admins can list events');
SELECT pg_temp.expect((SELECT count(*)=1 FROM public.admin_push_broadcast_players('ALICE')),'case-insensitive search');
SELECT pg_temp.expect((SELECT count(*)=0 FROM public.admin_push_broadcast_players('%')),'search does not treat wildcards as match-all');
SELECT pg_temp.expect((SELECT count(*)=0 FROM public.admin_push_broadcast_players('a')),'short search returns no players');

DO $$ DECLARE audience jsonb; result jsonb; campaign constant uuid := '10000000-0000-0000-0000-000000000001'; BEGIN
 audience := public.preview_push_broadcast(ARRAY[101,102],ARRAY[1,6]);
 PERFORM pg_temp.expect((audience->>'total')::int = 7,'deduplication across players, events and synced lists');
 PERFORM pg_temp.expect((audience->>'ready')::int = 4,'devices count people, not tokens');
 PERFORM pg_temp.expect((audience->>'disabled')::int = 2 AND (audience->>'no_device')::int = 1,'preference and device availability');
 PERFORM pg_temp.expect(NOT (audience->'recipients') @> '[{"email":"withdrawn@example.test"}]','synced list cannot re-add a withdrawal');
 PERFORM pg_temp.expect((audience->'recipients') @> '[{"email":"bob@example.test"}]','single-row partner included');
 PERFORM pg_temp.expect((public.preview_push_broadcast(ARRAY[101,102],ARRAY[1,6],'all','all',ARRAY[' ALICE@EXAMPLE.TEST '])->>'total')::int = 6,'exclusions normalise emails');
 PERFORM pg_temp.expect((public.preview_push_broadcast(ARRAY[101],ARRAY[]::bigint[],'paid','has_partner')->>'total')::int = 2,'paid partner filter includes both players and excludes synced');
 PERFORM pg_temp.expect((public.preview_push_broadcast(ARRAY[101],ARRAY[6],'paid','has_partner')->>'total')::int = 3,'individuals bypass event filters');
 PERFORM pg_temp.expect((public.preview_push_broadcast(ARRAY[101],ARRAY[]::bigint[],'pending','solo')->>'total')::int = 2,'pending solo filter');
 PERFORM pg_temp.rejects('SELECT public.preview_push_broadcast(p_payment=>''unknown'')','Invalid audience filter');
 PERFORM pg_temp.rejects('SELECT public.send_push_broadcast('''||campaign||''',''Hello'',''Message'',''https://example.test'',null)','supported app destination');
 PERFORM pg_temp.rejects('SELECT public.send_push_broadcast('''||campaign||''',''Hello'',''Message'',''/events/103'',null)','published event');
 PERFORM pg_temp.rejects('SELECT public.send_push_broadcast('''||campaign||''',''Hello'',''Message'',''/calendar'',null)','at least one recipient');
 PERFORM pg_temp.rejects('SELECT public.send_push_broadcast('''||campaign||''',''Hello'',''Message'',''/calendar'',null,p_player_ids=>ARRAY[3]::bigint[])','No selected recipients');
 PERFORM pg_temp.rejects('SELECT public.send_push_broadcast('''||campaign||''',repeat(''a'',81),''Message'',''/calendar'',null)','up to 80');
 PERFORM pg_temp.rejects('SELECT public.send_push_broadcast('''||campaign||''',''Hello'',''Message'',''/calendar'',''old'',ARRAY[101,102]::bigint[],ARRAY[1,6]::bigint[])','Audience changed');
 PERFORM pg_temp.expect((SELECT count(*)=0 FROM public.push_outbox),'rejected sends have no side effects');
 result := public.send_push_broadcast(campaign,'Hello','Message','/events/101',audience->>'fingerprint',ARRAY[101,102],ARRAY[1,6]);
 PERFORM pg_temp.expect((result->>'queued')::int = 4,'send queues only reachable players');
 PERFORM pg_temp.expect((SELECT count(*)=7 FROM public.push_outbox),'inbox receives all selected recipients');
 PERFORM pg_temp.expect((SELECT count(*)=4 FROM public.push_outbox WHERE status='pending'),'ready recipients are pending');
 PERFORM pg_temp.expect((SELECT count(*)=3 FROM public.push_outbox WHERE status='skipped'),'unreachable and opted-out recipients skipped');
 PERFORM pg_temp.expect((SELECT count(*)=1 FROM public.push_broadcasts),'campaign audit created');
 -- A safe retry succeeds even after availability has changed.
 DELETE FROM public.player_push_tokens WHERE email='alice@example.test';
 result := public.send_push_broadcast(campaign,'Hello','Message','/events/101',audience->>'fingerprint',ARRAY[101,102],ARRAY[1,6]);
 PERFORM pg_temp.expect((result->>'reused')::boolean AND (SELECT count(*)=7 FROM public.push_outbox),'idempotent retry creates no extra messages');
 PERFORM pg_temp.rejects('SELECT public.send_push_broadcast('''||campaign||''',''Changed'',''Message'',''/calendar'',null)','already used');
 PERFORM pg_temp.expect((public.list_push_broadcasts()->0->>'pending')::int = 4,'history reflects live outbox status');
END $$;
SELECT 'Push broadcast integration checks passed' AS result;
ROLLBACK;
