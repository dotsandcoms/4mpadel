-- Worker jobs contain private delivery context and must only be consumed by
-- the trusted Edge Function. Supabase's explicit client grants also need removal.
REVOKE ALL ON FUNCTION public.claim_push_deliveries() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_push_deliveries(text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_delivery_context(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_push_deliveries() TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_push_deliveries(text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.push_delivery_context(uuid) TO service_role;

-- Preserve the legacy API shape, but apply the caller's registration RLS.
-- Exact case-insensitive equality treats '%' and '_' as literal characters.
CREATE OR REPLACE FUNCTION public.check_my_registration(p_event_id bigint, p_email text)
RETURNS TABLE(id uuid, division text, payment_status text, partner_name text, full_name text, email text)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT r.id, r.division, r.payment_status, r.partner_name, r.full_name, r.email
  FROM public.event_registrations AS r
  WHERE r.event_id = p_event_id
    AND lower(r.email) = lower(p_email)
    AND r.status <> 'withdrawn';
$function$;
REVOKE ALL ON FUNCTION public.check_my_registration(bigint,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_my_registration(bigint,text) TO authenticated, service_role;
