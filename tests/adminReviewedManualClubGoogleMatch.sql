\set ON_ERROR_STOP on
DO $$ BEGIN
  IF current_database() <> 'fourm_manual_club_google_match_test' OR to_regclass('public.clubs') IS NOT NULL
    OR EXISTS (SELECT 1 FROM pg_namespace WHERE nspname IN ('auth','private')) THEN
    RAISE EXCEPTION 'Use an empty disposable fourm_manual_club_google_match_test database.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE SCHEMA auth;
CREATE SCHEMA private;
CREATE FUNCTION auth.email() RETURNS text LANGUAGE sql AS $$ SELECT nullif(current_setting('fixture.email',true),'') $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '90000000-0000-4000-8000-000000000001'::uuid $$;
CREATE FUNCTION private.permission_actor_active() RETURNS boolean LANGUAGE sql AS $$ SELECT current_setting('fixture.active',true)='true' $$;
CREATE FUNCTION public.is_super_admin(text) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='admin@example.invalid' $$;
CREATE TABLE public.clubs(
  id uuid PRIMARY KEY, name text, address text, city text, province text, country text, lat double precision, lng double precision,
  website_url text, contact_phone text, opening_hours jsonb NOT NULL DEFAULT '{}', cover_image_url text, gallery jsonb NOT NULL DEFAULT '[]',
  updated_at timestamptz DEFAULT now()
);
\ir ../supabase/migrations/20260803_google_places_enrichment.sql
\ir ../supabase/migrations/20260803_club_google_matches.sql
\ir ../supabase/migrations/20261120074810_review_club_google_matches_atomically.sql

CREATE FUNCTION pg_temp.expect(ok boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',message; END IF; END $$;
CREATE FUNCTION pg_temp.rejects(call text, expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE call;
  EXCEPTION WHEN OTHERS THEN
    IF strpos(SQLERRM,expected)=0 THEN RAISE EXCEPTION 'Expected %, got %',expected,SQLERRM; END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'Expected rejection: %',call;
END $$;

INSERT INTO public.clubs(id,name,city) VALUES
  ('10000000-0000-4000-8000-000000000001','Club A','Manually recorded city'),
  ('10000000-0000-4000-8000-000000000002','Club B',null),
  ('10000000-0000-4000-8000-000000000003','Club C',null);
INSERT INTO public.club_google_matches(id,club_id,match_status,review_status,google_place_id,meta_fields) VALUES
  ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','no_match','pending',null,'{}'),
  ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','conflict','pending','old-listing','{}'),
  ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','matched','pending','recorded-place','{"google_place_id":"recorded-place"}');
SELECT set_config('fixture.active','true',false);
SELECT set_config('fixture.email','admin@example.invalid',false);
SELECT public.review_club_google_match('review-apply','10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003')->>'token' AS old_token \gset

\ir ../supabase/migrations/20261120075701_review_manual_club_google_matches.sql

BEGIN;
SELECT pg_temp.expect(has_function_privilege('authenticated','public.review_manual_club_google_match(text,uuid,uuid,jsonb,text)','EXECUTE'),'manual authenticated grant');
SELECT pg_temp.expect(NOT has_function_privilege('anon','public.review_manual_club_google_match(text,uuid,uuid,jsonb,text)','EXECUTE'),'manual anonymous denial');
SELECT pg_temp.expect(NOT has_function_privilege('authenticated','private.review_club_google_match(text,uuid,uuid,text,jsonb)','EXECUTE'),'private planner remains restricted');
SELECT pg_temp.expect(public.review_club_google_match('review-apply','10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003')->>'token'=:'old_token','existing review token stays compatible');
SELECT public.review_club_google_match('apply','10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003',:'old_token');

DO $$
DECLARE
  north uuid := '10000000-0000-4000-8000-000000000001';
  south uuid := '10000000-0000-4000-8000-000000000002';
  north_match uuid := '20000000-0000-4000-8000-000000000001';
  south_match uuid := '20000000-0000-4000-8000-000000000002';
  place jsonb := '{"kind":"place","place_id":"fixture-place","name":"Fixture Courts","address":"1 Example Street","url":"https://maps.google.com/?cid=1","rating":4.6,"review_count":8,"fields":{"city":"Google city","address":"1 Example Street","lat":0,"lng":1,"name":"Should not replace club name"}}';
  link jsonb := '{"kind":"link","url":"https://maps.app.goo.gl/ExactLink?source=fixture"}';
  review jsonb;
BEGIN
  PERFORM set_config('fixture.email','club-owner@example.invalid',true);
  PERFORM pg_temp.rejects(format('SELECT public.review_manual_club_google_match(%L,%L,%L,%L)','review-apply',north,north_match,place),'Verified platform');
  PERFORM set_config('fixture.email','admin@example.invalid',true);
  PERFORM set_config('fixture.active','false',true);
  PERFORM pg_temp.rejects(format('SELECT public.review_manual_club_google_match(%L,%L,%L,%L)','review-apply',north,north_match,place),'Verified platform');
  PERFORM set_config('fixture.active','true',true);
  PERFORM pg_temp.rejects(format('SELECT public.review_manual_club_google_match(%L,%L,%L,%L)','review-apply',north,south_match,place),'no longer available');
  PERFORM pg_temp.rejects(format('SELECT public.review_manual_club_google_match(%L,%L,%L,%L)','review-apply',south,south_match,'{"kind":"link","url":"https://example.invalid/maps"}'),'Google Maps link is invalid');
  PERFORM pg_temp.rejects(format('SELECT public.review_manual_club_google_match(%L,%L,%L,%L)','review-apply',north,north_match,place||'{"place_id":"recorded-place"}'),'different club');
  review := public.review_manual_club_google_match('review-apply',north,north_match,place);
  PERFORM pg_temp.expect((review->'patch'->>'address')='1 Example Street' AND NOT (review->'patch') ? 'city','manual candidate previews exact missing fields');
  PERFORM pg_temp.expect((SELECT google_place_id IS NULL FROM public.clubs WHERE id=north),'review has no writes');
  PERFORM pg_temp.rejects(format('SELECT public.review_manual_club_google_match(%L,%L,%L,%L,%L)','apply',north,north_match,place||'{"name":"Different"}',review->>'token'),'changed');
  PERFORM public.review_manual_club_google_match('apply',north,north_match,place,review->>'token');
  PERFORM pg_temp.expect((SELECT google_place_id='fixture-place' AND name='Club A' AND city='Manually recorded city' AND lat=0 FROM public.clubs WHERE id=north),'exact selected place and untouched editor fields');
  PERFORM pg_temp.expect((SELECT google_place_id='fixture-place' AND google_name='Fixture Courts' AND review_status='applied' AND confidence=1 FROM public.club_google_matches WHERE id=north_match),'match records the selected listing');
  review := public.review_manual_club_google_match('review-apply',south,south_match,link);
  PERFORM pg_temp.expect((review->'patch')=jsonb_build_object('google_maps_url',link->>'url'),'pasted link changes only its exact URL');
  PERFORM public.review_manual_club_google_match('apply',south,south_match,link,review->>'token');
  PERFORM pg_temp.expect((SELECT google_maps_url=link->>'url' AND google_place_id IS NULL AND address IS NULL FROM public.clubs WHERE id=south),'link does not infer or write a Place ID');
  PERFORM pg_temp.expect((SELECT review_status='applied' AND google_place_id IS NULL FROM public.club_google_matches WHERE id=south_match),'stale match id is not kept for a manual URL');
END $$;
SELECT 'Manual Google match checks passed' AS result;
ROLLBACK;
