-- EMERGENCY ROLLBACK ONLY: restores the audited broad privilege state.
-- Do not run unless this stage was applied and rollback is authorised.
BEGIN;
SET LOCAL lock_timeout = '5s';
DROP POLICY "Rebuild scoped division access" ON public.tournament_divisions;
DROP POLICY "Rebuild division insert guard" ON public.tournament_divisions;
DROP POLICY "Rebuild division update guard" ON public.tournament_divisions;
DROP POLICY "Rebuild division delete guard" ON public.tournament_divisions;
DROP POLICY "Rebuild scoped activity read" ON public.event_activity_log;
DROP POLICY "Rebuild activity read guard" ON public.event_activity_log;
DROP POLICY "Rebuild scoped attribution read" ON public.event_creation_audit;
DROP POLICY "Rebuild attribution read guard" ON public.event_creation_audit;
DROP FUNCTION admin_rebuild_security.can_access_event(bigint);
DROP SCHEMA admin_rebuild_security;
GRANT TRUNCATE, REFERENCES, TRIGGER ON TABLE
  public.admin_sidebar_permissions, public.calendar, public.tournament_divisions,
  public.commerce_config, public.event_activity_log, public.event_creation_audit,
  public.payments, public.event_registrations, public.tournament_participants,
  public.organisation_members, public.club_members, public.federation_members
TO anon, authenticated;
COMMIT;
