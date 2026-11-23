\set ON_ERROR_STOP on
DO $$ BEGIN
  IF current_database() <> 'fourm_club_google_unlink_test' OR to_regclass('public.clubs') IS NOT NULL
    OR EXISTS (SELECT 1 FROM pg_namespace WHERE nspname IN ('auth','private')) THEN
    RAISE EXCEPTION 'Use an empty disposable fourm_club_google_unlink_test database.';
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
  id uuid PRIMARY KEY, name text, slug text, address text, city text, province text, country text, lat double precision, lng double precision,
  website_url text, contact_phone text, opening_hours jsonb NOT NULL DEFAULT '{}', cover_image_url text, gallery jsonb NOT NULL DEFAULT '[]',
  updated_at timestamptz DEFAULT now()
);
\ir ../supabase/migrations/20260803_google_places_enrichment.sql
\ir ../supabase/migrations/20260803_club_google_matches.sql
\ir ../supabase/migrations/20261120081907_review_exact_club_google_unlink.sql

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
CREATE FUNCTION pg_temp.abort_match_reset() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('fixture.fail_reset',true)='true' THEN RAISE EXCEPTION 'Synthetic match reset failure'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fixture_no_match_reset BEFORE UPDATE ON public.club_google_matches FOR EACH ROW EXECUTE FUNCTION pg_temp.abort_match_reset();

SELECT pg_temp.expect(has_function_privilege('authenticated','public.review_club_google_unlink(text,uuid,uuid,text,uuid,text)','EXECUTE'),'authenticated API signature');
SELECT pg_temp.expect(NOT has_function_privilege('anon','public.review_club_google_unlink(text,uuid,uuid,text,uuid,text)','EXECUTE'),'anonymous denied');
SELECT pg_temp.expect(NOT has_function_privilege('service_role','public.review_club_google_unlink(text,uuid,uuid,text,uuid,text)','EXECUTE'),'worker denied');
SELECT set_config('fixture.active','true',true);
SELECT set_config('fixture.email','owner@example.invalid',true);

DO $$
DECLARE
  applicant uuid := '00000000-0000-4000-8000-000000000001';
  linked uuid := '00000000-0000-4000-8000-000000000002';
  other uuid := '00000000-0000-4000-8000-000000000003';
  no_proof uuid := '00000000-0000-4000-8000-000000000004';
  applicant_match uuid := '10000000-0000-4000-8000-000000000001';
  linked_match uuid := '10000000-0000-4000-8000-000000000002';
  no_proof_match uuid := '10000000-0000-4000-8000-000000000004';
  reviews_at timestamptz := '2026-10-04T12:00:00Z';
  review jsonb;
  receipt jsonb;
BEGIN
  INSERT INTO public.clubs(id,name,slug,address,contact_phone,opening_hours,gallery,lat,google_place_id,google_maps_url,google_synced_at)
  VALUES
    (applicant,'Requested Club','requested-club',NULL,NULL,'{}','[]',NULL,NULL,NULL,NULL),
    (linked,'Actual Holder','actual-holder','Imported address','Staff phone','{"mon":{"open":"09:00","close":"18:00"}}',
      '[{"url":"https://example.invalid/photo","caption":"Imported"}]',0,'exact-place','https://maps.google.com/?cid=1',reviews_at),
    (other,'Unrelated Club','unrelated-club','No provenance',NULL,'{}','[]',NULL,'other-place',NULL,reviews_at),
    (no_proof,'Legacy Link','legacy-link','Possibly manual',NULL,'{}','[]',NULL,'legacy-place',NULL,reviews_at);
  INSERT INTO public.club_google_matches(id,club_id,match_status,review_status,google_place_id,fill_fields,meta_fields)
  VALUES
    (applicant_match,applicant,'conflict','pending','exact-place','{}','{"google_place_id":"exact-place"}'),
    (linked_match,linked,'matched','applied','exact-place',
      '{"name":"Actual Holder","address":"Imported address","contact_phone":"Old phone","opening_hours":{"mon":{"close":"18:00","open":"09:00"}},"gallery":[{"caption":"Imported","url":"https://example.invalid/photo"}],"lat":0}',
      '{"google_place_id":"exact-place","google_maps_url":"https://maps.google.com/?cid=1","google_synced_at":"2026-10-04T12:00:00Z"}'),
    (no_proof_match,no_proof,'matched','applied','legacy-place','{"address":"Possibly manual"}',
      '{"google_place_id":"legacy-place","google_synced_at":"2026-10-05T12:00:00Z"}');

  PERFORM pg_temp.rejects(format('SELECT public.review_club_google_unlink(%L,%L,%L)','review-conflict',applicant,applicant_match),'Verified platform');
  PERFORM set_config('fixture.email','admin@example.invalid',true);
  PERFORM set_config('fixture.active','false',true);
  PERFORM pg_temp.rejects(format('SELECT public.review_club_google_unlink(%L,%L,%L)','review-delist',linked,linked_match),'Verified platform');
  PERFORM set_config('fixture.active','true',true);
  PERFORM pg_temp.rejects(format('SELECT public.review_club_google_unlink(%L,%L,%L)','review-delist',linked,applicant_match),'no longer available');
  PERFORM pg_temp.rejects(format('SELECT public.review_club_google_unlink(%L,%L,%L)','delist',linked,linked_match),'Review the exact');

  review := public.review_club_google_unlink('review-conflict',applicant,applicant_match);
  PERFORM pg_temp.expect(review->'source'->>'id'=applicant::text AND review->'target'->>'id'=linked::text,'exact applicant and holder');
  PERFORM pg_temp.expect(review->>'provenance_confirmed'='true' AND review->'patch'->'opening_hours'='{}'
    AND review->'patch'->'gallery'='[]' AND review->'patch' ? 'lat','canonical JSON and numeric imported fields reset');
  PERFORM pg_temp.expect(review->'preserved' ? 'contact_phone' AND NOT (review->'patch') ? 'name','changed and non-profile fields are kept');
  PERFORM pg_temp.expect((SELECT google_place_id='exact-place' FROM public.clubs WHERE id=linked),'preview has no writes');
  PERFORM pg_temp.rejects(format('SELECT public.review_club_google_unlink(%L,%L,%L,%L,%L)','conflict',applicant,applicant_match,review->>'token',other),'holding this Google listing changed');

  UPDATE public.clubs SET address='Staff address after review' WHERE id=linked;
  PERFORM pg_temp.rejects(format('SELECT public.review_club_google_unlink(%L,%L,%L,%L,%L)','conflict',applicant,applicant_match,review->>'token',linked),'club or Google listing changed');
  review := public.review_club_google_unlink('review-conflict',applicant,applicant_match);
  PERFORM set_config('fixture.fail_reset','true',true);
  PERFORM pg_temp.rejects(format('SELECT public.review_club_google_unlink(%L,%L,%L,%L,%L)','conflict',applicant,applicant_match,review->>'token',linked),'Synthetic match reset failure');
  PERFORM pg_temp.expect((SELECT google_place_id='exact-place' FROM public.clubs WHERE id=linked),'match update failure rolls back profile unlink');
  PERFORM set_config('fixture.fail_reset','false',true);
  receipt := public.review_club_google_unlink('conflict',applicant,applicant_match,review->>'token',linked);
  PERFORM pg_temp.expect(receipt->>'status'='unlinked' AND receipt->'target'->>'id'=linked::text,'exact holder unlinked');
  PERFORM pg_temp.expect((SELECT google_place_id IS NULL AND google_maps_url IS NULL AND address='Staff address after review'
    AND contact_phone='Staff phone' AND opening_hours='{}' AND gallery='[]' AND lat IS NULL AND name='Actual Holder'
    FROM public.clubs WHERE id=linked),'protected staff changes and valid empty containers');
  PERFORM pg_temp.expect((SELECT review_status='pending' AND google_place_id='exact-place' FROM public.club_google_matches WHERE id=applicant_match),'applicant proposal stays pending');
  PERFORM pg_temp.expect((SELECT review_status='pending' AND google_place_id IS NULL AND fill_fields='{}' FROM public.club_google_matches WHERE id=linked_match),'old holder resets to a clean queue row');
  PERFORM pg_temp.expect(public.review_club_google_unlink('review-conflict',applicant,applicant_match)->>'status'='available','already-free listing is visible without write');
  PERFORM pg_temp.rejects(format('SELECT public.review_club_google_unlink(%L,%L,%L,%L,%L)','conflict',applicant,applicant_match,review->>'token',linked),'holding this Google listing changed');

  review := public.review_club_google_unlink('review-conflict',applicant,applicant_match,NULL,NULL,'other-place');
  PERFORM pg_temp.expect(review->'target'->>'id'=other::text AND review->'target'->'match_id'='null'::jsonb,'manual candidate resolves a holder without a queue row');
  PERFORM public.review_club_google_unlink('conflict',applicant,applicant_match,review->>'token',other,'other-place');
  PERFORM pg_temp.expect((SELECT google_place_id IS NULL AND address='No provenance' FROM public.clubs WHERE id=other),'untracked profile fields remain untouched');

  review := public.review_club_google_unlink('review-delist',no_proof,no_proof_match);
  PERFORM pg_temp.expect(review->>'provenance_confirmed'='false' AND review->'preserved' ? 'address','unverified timestamp preserves profile value');
  PERFORM public.review_club_google_unlink('delist',no_proof,no_proof_match,review->>'token',no_proof);
  PERFORM pg_temp.expect((SELECT google_place_id IS NULL AND address='Possibly manual' FROM public.clubs WHERE id=no_proof),'delist removes only exact unverified link metadata');
END $$;
SELECT 'Reviewed exact Google unlink checks passed' AS result;
ROLLBACK;
