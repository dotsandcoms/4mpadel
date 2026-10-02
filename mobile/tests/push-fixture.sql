-- Minimal schema for isolated notification integration tests; never run on production.
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF; END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
CREATE TABLE players(id bigserial primary key,email text,name text);
CREATE TABLE calendar(id bigserial primary key,event_name text,event_status text default 'active');
CREATE TABLE tournament_divisions(id uuid primary key default gen_random_uuid(),event_id bigint,name text,cancelled_at timestamptz);
CREATE TABLE event_registrations(id uuid primary key default gen_random_uuid(),event_id bigint,division_id uuid,email text,full_name text,partner_email text,partner_name text,registered_by text,status text default 'registered',payment_status text default 'pending',division text);
CREATE TABLE draws(id uuid primary key default gen_random_uuid(),event_id bigint,division_id uuid,status text);
