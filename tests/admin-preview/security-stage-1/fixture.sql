-- SYNTHETIC LOCAL DATABASE ONLY. Never run this against Supabase.
-- Legacy helper bodies below are minimal test doubles, not a production clone.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT (auth.jwt() ->> 'sub')::uuid;
$$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE TABLE public.admin_sidebar_permissions(email text PRIMARY KEY, role text, module_permissions jsonb);
CREATE TABLE public.calendar(id bigint PRIMARY KEY, organisation_id uuid, club_id uuid, organiser_email text);
CREATE TABLE public.tournament_divisions(id bigint PRIMARY KEY, event_id bigint REFERENCES public.calendar, name text);
CREATE TABLE public.event_activity_log(id bigint PRIMARY KEY, event_id bigint REFERENCES public.calendar);
CREATE TABLE public.event_creation_audit(id bigint PRIMARY KEY, event_id bigint REFERENCES public.calendar);
CREATE TABLE public.organisation_members(user_email text, organisation_id uuid, role text);
CREATE TABLE public.club_members(user_email text, club_id uuid, role text);
CREATE TABLE public.federation_members(id bigint);
CREATE TABLE public.commerce_config(id bigint);
CREATE TABLE public.payments(id bigint);
CREATE TABLE public.event_registrations(id bigint);
CREATE TABLE public.tournament_participants(id bigint);
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
CREATE FUNCTION public.can_manage_event(event_id bigint) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT EXISTS(SELECT 1 FROM public.admin_sidebar_permissions WHERE email=auth.jwt()->>'email' AND role='super_admin')
    OR EXISTS(SELECT 1 FROM public.calendar WHERE id=event_id AND organiser_email=auth.jwt()->>'email');
$$;
CREATE FUNCTION public.can_manage_calendar_event(org_id uuid, target_club_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT EXISTS(SELECT 1 FROM public.organisation_members WHERE organisation_id=org_id AND user_email=auth.jwt()->>'email' AND role IN ('owner','admin'))
    OR EXISTS(SELECT 1 FROM public.club_members WHERE club_id=target_club_id AND user_email=auth.jwt()->>'email' AND role IN ('owner','admin'));
$$;
CREATE FUNCTION public.is_4m_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT EXISTS(SELECT 1 FROM public.admin_sidebar_permissions WHERE email=auth.jwt()->>'email');
$$;
ALTER TABLE public.tournament_divisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_creation_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin write tournament_divisions" ON public.tournament_divisions FOR ALL USING ((auth.jwt()->>'role')='authenticated') WITH CHECK ((auth.jwt()->>'role')='authenticated');
CREATE POLICY "Public can view divisions" ON public.tournament_divisions FOR SELECT USING (true);
CREATE POLICY "Read event activity log" ON public.event_activity_log FOR SELECT TO authenticated USING(public.is_4m_admin());
CREATE POLICY "Admins can view event creator attribution" ON public.event_creation_audit FOR SELECT TO authenticated USING(public.is_4m_admin());
INSERT INTO public.admin_sidebar_permissions VALUES
 ('assigned@example.com','custom','{"event-mgmt":{"allowedEvents":[1,"2"]}}'),
 ('unrelated@example.com','custom','{}'),
 ('malformed@example.com','custom','{"event-mgmt":{"allowedEvents":"all"}}'),
 ('super@example.com','super_admin','{}');
INSERT INTO public.calendar VALUES
 (1,NULL,NULL,NULL),
 (2,NULL,NULL,NULL),
 (3,'11111111-1111-1111-1111-111111111111',NULL,NULL),
 (4,NULL,'22222222-2222-2222-2222-222222222222',NULL),
 (5,NULL,NULL,'organiser@example.com');
INSERT INTO public.organisation_members VALUES ('org@example.com','11111111-1111-1111-1111-111111111111','admin');
INSERT INTO public.club_members VALUES ('club@example.com','22222222-2222-2222-2222-222222222222','owner');
INSERT INTO public.tournament_divisions SELECT id,id,'Original' FROM public.calendar;
INSERT INTO public.event_activity_log SELECT id,id FROM public.calendar;
INSERT INTO public.event_creation_audit SELECT id,id FROM public.calendar;
