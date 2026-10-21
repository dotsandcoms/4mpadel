-- Scope the legacy lookup to exact verified participant/partner/registrant
-- identity or platform staff; general event-manager table policies are unchanged.
CREATE OR REPLACE FUNCTION public.check_my_registration(p_event_id bigint, p_email text)
RETURNS TABLE(id uuid, division text, payment_status text, partner_name text, full_name text, email text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $function$
  SELECT r.id,r.division,r.payment_status,r.partner_name,r.full_name,r.email
  FROM public.event_registrations r
  WHERE r.event_id=p_event_id AND lower(r.email)=lower(p_email)
    AND r.status<>'withdrawn'
    AND (
      current_user='service_role'
      OR lower(r.email)=lower((SELECT auth.email()))
      OR lower(r.partner_email)=lower((SELECT auth.email()))
      OR lower(r.registered_by)=lower((SELECT auth.email()))
      OR public.is_super_admin((SELECT auth.email()))
    );
$function$;
REVOKE ALL ON FUNCTION public.check_my_registration(bigint,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_my_registration(bigint,text) TO authenticated, service_role;
