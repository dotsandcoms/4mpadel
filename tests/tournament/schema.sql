-- Disposable local test database only. Minimal host schema; native tables use real migrations.
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA auth;
CREATE SCHEMA private;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('sub',auth.uid(),'email',(SELECT email FROM auth.users WHERE id=auth.uid())) $$;
CREATE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS $$ SELECT auth.jwt()->>'email' $$;
CREATE FUNCTION account_is_active() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT EXISTS(
 SELECT 1 FROM auth.users WHERE id=auth.uid() AND COALESCE(raw_user_meta_data->>'inactive','false')='false'
) $$;
GRANT USAGE ON SCHEMA auth TO authenticated,anon;
GRANT SELECT ON auth.users TO authenticated;
CREATE TABLE calendar(id bigint PRIMARY KEY,event_name text,start_date date,end_date date,venue text,slug text,is_manual boolean DEFAULT true,organization_id uuid,organisation_id uuid,event_status text,is_visible boolean DEFAULT true);
CREATE TABLE organisations(id uuid PRIMARY KEY,status text);
CREATE TABLE organisation_members(organisation_id uuid REFERENCES organisations(id),user_email text,role text);
CREATE TABLE tournament_divisions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_id bigint REFERENCES calendar(id),name text,sort_order integer DEFAULT 0,is_active boolean DEFAULT true,entry_fee numeric DEFAULT 0);
CREATE TABLE event_registrations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_id bigint,division_id uuid REFERENCES tournament_divisions(id),division text,full_name text,email text,partner_name text,partner_email text,payment_status text,status text DEFAULT 'registered');
CREATE TABLE players(id bigint PRIMARY KEY,name text,email text,license_type text,points numeric);
CREATE TABLE annual_licenses(player_id bigint,season_year integer,valid_from date,revoked_at timestamptz,PRIMARY KEY(player_id,season_year));
CREATE TABLE temporary_licenses(id uuid DEFAULT gen_random_uuid(),player_id bigint,event_id bigint,revoked_at timestamptz);
-- Minimal fixture interface for the deployed event-year licence queries.
CREATE FUNCTION has_full_license(p_player_id bigint,p_year integer) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM public.annual_licenses a WHERE a.player_id=p_player_id AND a.revoked_at IS NULL
  AND a.valid_from<=make_date(p_year,12,31) AND a.season_year>=p_year)
$$;
CREATE FUNCTION player_license_eligibility(p_player_id bigint,p_event_id bigint) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('year',extract(year FROM c.start_date)::integer,
  'full',public.has_full_license(p_player_id,extract(year FROM c.start_date)::integer),
  'temporary',EXISTS(SELECT 1 FROM public.temporary_licenses t WHERE t.player_id=p_player_id AND t.event_id=c.id AND t.revoked_at IS NULL))
 FROM public.calendar c WHERE c.id=p_event_id
$$;
CREATE FUNCTION is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT auth.uid()='00000000-0000-4000-8000-000000000001'::uuid $$;
CREATE FUNCTION is_4m_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT is_super_admin() $$;
CREATE FUNCTION is_org_admin(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
\ir ../../supabase/migrations/20260819_native_draw_data_model.sql
ALTER TABLE draw_matches ADD COLUMN court_name text;
ALTER TABLE draw_matches ADD COLUMN americano_fixture_key text;
ALTER TABLE draws DROP CONSTRAINT draws_format_check;
ALTER TABLE draws ADD CONSTRAINT draws_format_check CHECK(format IN('knockout','group_knockout','group_only','americano'));
CREATE TABLE event_play_days(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_id bigint,play_date date,start_time time,end_time time,courts_count integer,match_duration_minutes integer,minimum_break_minutes integer,is_active boolean DEFAULT true,is_removed boolean DEFAULT false,UNIQUE(event_id,play_date));
\ir ../../supabase/migrations/20260910180000_match_timing_constraints.sql
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
\ir ../../supabase/migrations/20260916090000_tournament_compatibility.sql
\ir ../../supabase/migrations/20260916100000_tournament_manager.sql

GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON public.draws,public.draw_matches,public.draw_groups,public.draw_entries TO anon;
