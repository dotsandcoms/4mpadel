-- ONLY for a fresh disposable local database; not a Supabase project.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TABLE public.admin_sidebar_permissions(email text,role text);
CREATE TABLE public.clubs(id uuid PRIMARY KEY,name text,short_name text,tagline text,about text,city text,province text,country text,address text,website_url text,contact_email text,contact_phone text,whatsapp_number text,updated_at timestamptz,status text,verified boolean);
INSERT INTO auth.users VALUES ('10000000-0000-0000-0000-000000000001','admin@example.invalid'),('10000000-0000-0000-0000-000000000002','custom@example.invalid');
INSERT INTO public.admin_sidebar_permissions VALUES ('admin@example.invalid','super_admin'),('custom@example.invalid','custom');
INSERT INTO public.clubs(id,name,status,verified) VALUES('20000000-0000-0000-0000-000000000001','Original club','pending',false);
