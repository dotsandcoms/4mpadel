-- Disposable local test database only. Minimal host schema; native tables use real migrations.
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('sub',auth.uid(),'email',(SELECT email FROM auth.users WHERE id=auth.uid())) $$;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT SELECT ON auth.users TO authenticated;
CREATE TABLE calendar(id bigint PRIMARY KEY,event_name text,start_date date,end_date date,venue text,slug text,is_manual boolean DEFAULT true,organization_id uuid);
CREATE TABLE tournament_divisions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_id bigint REFERENCES calendar(id),name text,sort_order integer DEFAULT 0,is_active boolean DEFAULT true,entry_fee numeric DEFAULT 0);
CREATE TABLE event_registrations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_id bigint,division_id uuid REFERENCES tournament_divisions(id),division text,full_name text,email text,partner_name text,partner_email text,payment_status text,status text DEFAULT 'registered');
CREATE TABLE players(id bigint PRIMARY KEY,name text,email text,license_type text,points numeric);
CREATE TABLE temporary_licenses(id uuid DEFAULT gen_random_uuid(),player_id bigint,event_id bigint);
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
