-- Disposable local PostgreSQL fixture only. Never run on an existing Supabase project.
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto SCHEMA extensions;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz,is_anonymous boolean DEFAULT false);
CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid,not_after timestamptz,factor_id uuid);
CREATE TABLE auth.mfa_factors(id uuid,user_id uuid,factor_type text,status text);
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (auth.jwt()->>'sub')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO authenticated;
CREATE TABLE public.organisations(id uuid PRIMARY KEY,name text,status text);
CREATE TABLE public.organisation_members(organisation_id uuid,user_email text,role text);
CREATE TABLE public.calendar(id bigint PRIMARY KEY,organisation_id uuid,event_name text,organiser_interim_payments jsonb);
CREATE TABLE public.admin_sidebar_permissions(email text,role text);
CREATE FUNCTION public.is_super_admin(email text) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM public.admin_sidebar_permissions p WHERE lower(p.email)=lower($1) AND role='super_admin') $$;
-- Local Vault stand-in supplies a server-only key; encryption under test is real pgcrypto.
CREATE SCHEMA vault;
CREATE TABLE vault.secrets(id uuid DEFAULT gen_random_uuid(),name text UNIQUE,secret text);
CREATE VIEW vault.decrypted_secrets AS SELECT id,name,secret AS decrypted_secret FROM vault.secrets;
CREATE FUNCTION vault.create_secret(secret text,name text,description text) RETURNS uuid LANGUAGE sql AS $$ INSERT INTO vault.secrets(secret,name) VALUES($1,$2) RETURNING id $$;
