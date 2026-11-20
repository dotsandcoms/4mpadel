\set ON_ERROR_STOP on
DO $$ BEGIN
  IF current_database() <> 'fourm_club_google_match_test' OR to_regclass('public.clubs') IS NOT NULL
    OR EXISTS (SELECT 1 FROM pg_namespace WHERE nspname IN ('auth','private')) THEN
    RAISE EXCEPTION 'Use an empty disposable fourm_club_google_match_test database.';
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
  google_place_id text UNIQUE, google_maps_url text, google_rating numeric, google_ratings_total integer,
  google_synced_at timestamptz, updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.club_google_matches(
  id uuid PRIMARY KEY, club_id uuid NOT NULL REFERENCES public.clubs(id), match_status text,
  review_status text CHECK(review_status IN ('pending','applied','dismissed')),
  google_place_id text, fill_fields jsonb NOT NULL, meta_fields jsonb NOT NULL,
  conflict_note text, reviewed_at timestamptz
);
\ir ../supabase/migrations/20261120074810_review_club_google_matches_atomically.sql

BEGIN;
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
SELECT pg_temp.expect(has_function_privilege('authenticated','public.review_club_google_match(text,uuid,uuid,text)','EXECUTE'),'authenticated signature');
SELECT pg_temp.expect(NOT has_function_privilege('anon','public.review_club_google_match(text,uuid,uuid,text)','EXECUTE'),'anonymous grant absent');
SELECT set_config('fixture.active','true',true);
SELECT set_config('fixture.email','venue-owner@example.invalid',true);

DO $$
DECLARE
  north uuid := '00000000-0000-4000-8000-000000000001';
  south uuid := '00000000-0000-4000-8000-000000000002';
  north_match uuid := '10000000-0000-4000-8000-000000000001';
  south_match uuid := '10000000-0000-4000-8000-000000000002';
  review jsonb;
BEGIN
  INSERT INTO public.clubs(id,name,city) VALUES (north,'North Club','Recorded city'),(south,'South Club',null);
  INSERT INTO public.club_google_matches VALUES
    (north_match,north,'matched','pending','north-listing','{"city":"Suggested city","address":"1 Fixture Road","name":"Unsupported update"}',
      '{"google_place_id":"north-listing","google_maps_url":"https://maps.google.com/?cid=1","google_rating":4}',null,null),
    (south_match,south,'no_match','pending',null,'{}','{}',null,null);
  PERFORM pg_temp.rejects(format('SELECT public.review_club_google_match(%L,%L,%L)','review-apply',north,north_match),'Verified platform');
  PERFORM set_config('fixture.email','admin@example.invalid',true);
  PERFORM set_config('fixture.active','false',true);
  PERFORM pg_temp.rejects(format('SELECT public.review_club_google_match(%L,%L,%L)','review-apply',north,north_match),'Verified platform');
  PERFORM set_config('fixture.active','true',true);
  PERFORM pg_temp.rejects(format('SELECT public.review_club_google_match(%L,%L,%L)','review-apply',north,south_match),'no longer available');
  PERFORM pg_temp.rejects(format('SELECT public.review_club_google_match(%L,%L,%L)','apply',north,north_match),'before confirming');
  UPDATE public.clubs SET google_place_id='north-listing' WHERE id=south;
  PERFORM pg_temp.rejects(format('SELECT public.review_club_google_match(%L,%L,%L)','review-apply',north,north_match),'different club');
  UPDATE public.clubs SET google_place_id=NULL WHERE id=south;
  UPDATE public.club_google_matches SET fill_fields=fill_fields||'{"website_url":"not a URL"}' WHERE id=north_match;
  PERFORM pg_temp.rejects(format('SELECT public.review_club_google_match(%L,%L,%L)','review-apply',north,north_match),'website or image links are invalid');
  UPDATE public.club_google_matches SET fill_fields=fill_fields-'website_url' WHERE id=north_match;
  review := public.review_club_google_match('review-apply',north,north_match);
  PERFORM pg_temp.expect((review->'patch') ? 'address' AND NOT (review->'patch') ? 'city' AND NOT (review->'patch') ? 'name',
    'only whitelisted fields with empty club values are suggested');
  PERFORM pg_temp.expect((review->'before') ? 'address' AND (review->'before'->'address')='null'::jsonb,'review previews exact prior values');
  PERFORM pg_temp.expect((SELECT address IS NULL FROM public.clubs WHERE id=north),'review is read only');
  UPDATE public.clubs SET address='Manual address' WHERE id=north;
  PERFORM pg_temp.rejects(format('SELECT public.review_club_google_match(%L,%L,%L,%L)','apply',north,north_match,review->>'token'),'changed');
  PERFORM pg_temp.expect((SELECT review_status='pending' FROM public.club_google_matches WHERE id=north_match),'stale failure does not alter the match');
  review := public.review_club_google_match('review-apply',north,north_match);
  PERFORM public.review_club_google_match('apply',north,north_match,review->>'token');
  PERFORM pg_temp.expect((SELECT google_place_id='north-listing' AND address='Manual address' AND city='Recorded city' FROM public.clubs WHERE id=north),'apply preserves edited profile fields');
  PERFORM pg_temp.expect((SELECT review_status='applied' AND fill_fields='{}' FROM public.club_google_matches WHERE id=north_match),'review row records only fields written');
  PERFORM pg_temp.rejects(format('SELECT public.review_club_google_match(%L,%L,%L,%L)','apply',north,north_match,review->>'token'),'no longer available');
  review := public.review_club_google_match('review-dismiss',south,south_match);
  PERFORM public.review_club_google_match('dismiss',south,south_match,review->>'token');
  PERFORM pg_temp.expect((SELECT google_place_id IS NULL AND name='South Club' FROM public.clubs WHERE id=south),'dismiss preserves club');
  PERFORM pg_temp.expect((SELECT review_status='dismissed' FROM public.club_google_matches WHERE id=south_match),'exact pending match dismissed');
END $$;
SELECT 'Reviewed Google match checks passed' AS result;
ROLLBACK;
