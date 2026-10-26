-- Apply only to 4M Padel Staging (cefmzkwabdqqoagxhekc).
-- Custom draw testers can manage draws but the general registration policy
-- expects an event manager or super-admin. Allow only this sample event's rows.
CREATE POLICY "Sandbox draw managers read sample registrations"
ON public.event_registrations FOR SELECT TO authenticated
USING (event_id = 90000001 AND is_test = true AND public.can_manage_native_draw(event_id));
