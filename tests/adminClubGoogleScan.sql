\set ON_ERROR_STOP on
-- Run only in a disposable empty database.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE SCHEMA auth;
CREATE SCHEMA private;
GRANT USAGE ON SCHEMA auth, private TO authenticated;
CREATE FUNCTION auth.email() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('fixture.email',true) $$;
CREATE FUNCTION private.permission_actor_active() RETURNS boolean LANGUAGE sql AS $$ SELECT current_setting('fixture.active',true) = 'yes' $$;
CREATE FUNCTION public.is_super_admin(text) RETURNS boolean LANGUAGE sql AS $$ SELECT $1 = 'platform@example.invalid' $$;

CREATE TABLE public.clubs (
  id uuid PRIMARY KEY, name text, status text, city text, province text, country text, address text, lat numeric,
  lng numeric, website_url text, contact_phone text, opening_hours jsonb, google_place_id text, google_maps_url text
);
GRANT SELECT, UPDATE ON public.clubs TO service_role;
\ir ../supabase/migrations/20260803_club_google_matches.sql
\ir ../supabase/migrations/20261120080959_reviewed_club_google_scan.sql

CREATE FUNCTION pg_temp.expect(actual boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF actual IS DISTINCT FROM true THEN RAISE EXCEPTION 'Test failed: %', label; END IF;
END $$;
CREATE FUNCTION pg_temp.id(value integer) RETURNS uuid LANGUAGE sql AS $$
  SELECT ('01234567-0000-4000-8000-' || lpad(value::text,12,'0'))::uuid
$$;

INSERT INTO public.clubs (id,name,status,google_place_id,google_maps_url) VALUES
  (pg_temp.id(1),'Open fixture','published',NULL,NULL),
  (pg_temp.id(2),'Private application','pending',NULL,NULL),
  (pg_temp.id(3),'Existing place','4m_premium','already-linked',NULL),
  (pg_temp.id(4),'Existing Maps link','published',NULL,'https://maps.google.com/maps/example'),
  (pg_temp.id(5),'Already awaiting review','4m_approved',NULL,NULL),
  (pg_temp.id(6),'Reviewed dismissal','4m_approved',NULL,NULL),
  (pg_temp.id(7),'Later fixture','4m_approved',NULL,NULL),
  (pg_temp.id(8),'Changed during scan','published',NULL,NULL),
  (pg_temp.id(9),'Linked during scan','published',NULL,NULL),
  (pg_temp.id(10),'Reviewed during scan','published',NULL,NULL),
  (pg_temp.id(11),'Suspended fixture','suspended',NULL,NULL);
INSERT INTO public.club_google_matches (club_id,match_status,review_status,google_name) VALUES
  (pg_temp.id(5),'low_confidence','pending','Pending review evidence'),
  (pg_temp.id(6),'matched','dismissed','Original dismissed result');

SELECT pg_temp.expect(NOT has_function_privilege('anon','public.club_google_scan_authorised()','EXECUTE'),'anonymous denied on role check');
SELECT pg_temp.expect(NOT has_function_privilege('authenticated','public.club_google_scan_candidates(uuid,integer)','EXECUTE'),'browser denied candidate read');
SELECT pg_temp.expect(NOT has_function_privilege('authenticated','public.club_google_scan_enqueue(uuid,text,jsonb)','EXECUTE'),'browser denied queue insert');
SELECT pg_temp.expect(has_function_privilege('service_role','public.club_google_scan_enqueue(uuid,text,jsonb)','EXECUTE'),'worker can insert');

SET ROLE authenticated;
SET fixture.email = 'platform@example.invalid';
SET fixture.active = 'yes';
SELECT pg_temp.expect(public.club_google_scan_authorised(),'live platform actor authorised');
SET fixture.active = 'no';
SELECT pg_temp.expect(NOT public.club_google_scan_authorised(),'revoked platform actor denied');
SET fixture.active = 'yes';
SET fixture.email = 'standalone-clubs@example.invalid';
SELECT pg_temp.expect(NOT public.club_google_scan_authorised(),'standalone Clubs denied on legacy platform-only scan');
RESET ROLE;

SET ROLE service_role;
SELECT pg_temp.expect(public.club_google_scan_candidates(NULL,1)->0->>'id' = pg_temp.id(1)::text,'published unlinked candidate');
SELECT pg_temp.expect(public.club_google_scan_candidates(NULL,1)->1->>'id' = pg_temp.id(7)::text,'lookahead excludes private, linked and reviewed rows');
SELECT pg_temp.expect(jsonb_array_length(public.club_google_scan_candidates(pg_temp.id(7),2)) = 3,'keyset progress and bound');
SELECT public.club_google_scan_candidates(NULL,12)->0->>'row_version' AS verified_version \gset
SELECT pg_temp.expect(public.club_google_scan_enqueue(pg_temp.id(1),:'verified_version',
  '{ "match_status":"matched", "google_place_id":"place-fixture", "review_status":"applied" }'),'safe insert');
SELECT pg_temp.expect(NOT public.club_google_scan_enqueue(pg_temp.id(1),:'verified_version',
  '{ "match_status":"no_match" }'),'duplicate scan cannot replace prior candidate');
SELECT pg_temp.expect((SELECT review_status='pending' AND google_place_id='place-fixture' FROM public.club_google_matches WHERE club_id=pg_temp.id(1)),'worker cannot mark review applied');
SELECT candidate->>'row_version' AS before_edit FROM jsonb_array_elements(public.club_google_scan_candidates(NULL,12)) AS candidate
  WHERE candidate->>'id' = pg_temp.id(8)::text \gset
SELECT candidate->>'row_version' AS before_link FROM jsonb_array_elements(public.club_google_scan_candidates(NULL,12)) AS candidate
  WHERE candidate->>'id' = pg_temp.id(9)::text \gset
SELECT candidate->>'row_version' AS before_review FROM jsonb_array_elements(public.club_google_scan_candidates(NULL,12)) AS candidate
  WHERE candidate->>'id' = pg_temp.id(10)::text \gset
RESET ROLE;

UPDATE public.clubs SET name='Edited name' WHERE id=pg_temp.id(8);
UPDATE public.clubs SET google_maps_url='https://maps.google.com/maps/now-linked' WHERE id=pg_temp.id(9);
INSERT INTO public.club_google_matches (club_id,match_status,review_status,google_name)
  VALUES (pg_temp.id(10),'matched','applied','Review won the race');
SET ROLE service_role;
SELECT pg_temp.expect(NOT public.club_google_scan_enqueue(pg_temp.id(8),:'before_edit',
  '{"match_status":"matched"}'),'stale provider result cannot replace a changed club snapshot');
SELECT pg_temp.expect(NOT public.club_google_scan_enqueue(pg_temp.id(9),:'before_link',
  '{"match_status":"matched"}'),'link added during scan prevents queue insert');
SELECT pg_temp.expect(NOT public.club_google_scan_enqueue(pg_temp.id(10),:'before_review',
  '{"match_status":"matched"}'),'review changed during scan stays authoritative');
SELECT pg_temp.expect((SELECT review_status='dismissed' AND google_name='Original dismissed result'
  FROM public.club_google_matches WHERE club_id=pg_temp.id(6)),'existing reviewed data preserved');
SELECT pg_temp.expect((SELECT review_status='applied' AND google_name='Review won the race'
  FROM public.club_google_matches WHERE club_id=pg_temp.id(10)),'concurrently reviewed data preserved');
RESET ROLE;
