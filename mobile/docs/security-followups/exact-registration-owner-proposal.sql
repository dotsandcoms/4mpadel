-- Not deployed: automatic approval review rejected retaining event-manager access. Clarify the staff/organiser policy before changing broad registration RLS.
-- Valid email local parts can contain SQL LIKE wildcard characters. Ownership
-- compares literal emails, including partner and parent/registrant access.
ALTER POLICY "Authenticated read own or admin registrations" ON public.event_registrations
USING (
  lower((SELECT auth.jwt()->>'email')) = lower(email)
  OR lower((SELECT auth.jwt()->>'email')) = lower(partner_email)
  OR lower((SELECT auth.jwt()->>'email')) = lower(registered_by)
  OR public.is_super_admin((SELECT auth.jwt()->>'email'))
  OR public.can_manage_event(event_id)
);
ALTER POLICY "Authenticated update own or admin registrations" ON public.event_registrations
USING (
  lower((SELECT auth.jwt()->>'email')) = lower(email)
  OR lower((SELECT auth.jwt()->>'email')) = lower(partner_email)
  OR lower((SELECT auth.jwt()->>'email')) = lower(registered_by)
  OR public.is_super_admin((SELECT auth.jwt()->>'email'))
  OR public.can_manage_event(event_id)
)
WITH CHECK (
  lower((SELECT auth.jwt()->>'email')) = lower(email)
  OR lower((SELECT auth.jwt()->>'email')) = lower(partner_email)
  OR lower((SELECT auth.jwt()->>'email')) = lower(registered_by)
  OR public.is_super_admin((SELECT auth.jwt()->>'email'))
  OR public.can_manage_event(event_id)
);
