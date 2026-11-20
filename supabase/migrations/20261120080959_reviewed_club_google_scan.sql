BEGIN;

CREATE FUNCTION public.club_google_scan_authorised()
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT coalesce(private.permission_actor_active(), false)
    AND coalesce(public.is_super_admin(auth.email()), false)
$$;

CREATE FUNCTION public.club_google_scan_candidates(p_after uuid DEFAULT NULL, p_limit integer DEFAULT 12)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(candidate) ORDER BY candidate.id), '[]'::jsonb)
  FROM (
    SELECT c.id, c.xmin::text AS row_version, c.name, c.city, c.province, c.country,
      c.address, c.lat, c.lng, c.website_url, c.contact_phone, c.opening_hours
    FROM public.clubs c
    WHERE (p_after IS NULL OR c.id > p_after)
      AND c.status IN ('published','4m_approved','4m_premium')
      AND nullif(btrim(c.google_place_id), '') IS NULL
      AND nullif(btrim(c.google_maps_url), '') IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.club_google_matches m WHERE m.club_id = c.id)
    ORDER BY c.id
    LIMIT (greatest(1, least(24, coalesce(p_limit, 12))) + 1)
  ) candidate
$$;

CREATE FUNCTION public.club_google_scan_enqueue(p_club_id uuid, p_row_version text, p_match jsonb)
RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  current_version text;
  candidate_status text := p_match->>'match_status';
BEGIN
  IF p_club_id IS NULL OR p_row_version IS NULL OR p_match IS NULL
    OR jsonb_typeof(p_match) <> 'object' OR octet_length(p_match::text) > 32768
    OR candidate_status IS NULL OR candidate_status NOT IN ('matched','low_confidence','no_match','conflict') THEN
    RAISE EXCEPTION 'Invalid Google scan result.' USING ERRCODE = '22023';
  END IF;
  -- Use lock order compatible with reviewed matches. The snapshot also keeps
  -- a provider result from being attached after a club changed during search.
  SELECT c.xmin::text INTO current_version
  FROM public.clubs c
  WHERE c.id = p_club_id AND c.status IN ('published','4m_approved','4m_premium')
    AND nullif(btrim(c.google_place_id), '') IS NULL
    AND nullif(btrim(c.google_maps_url), '') IS NULL
  FOR UPDATE;
  IF NOT FOUND OR current_version IS DISTINCT FROM p_row_version THEN RETURN false; END IF;

  INSERT INTO public.club_google_matches (club_id, match_status, review_status, google_place_id, google_name, google_address,
    confidence, fill_fields, meta_fields, business_status, conflict_note)
  VALUES (p_club_id, candidate_status, 'pending', p_match->>'google_place_id', p_match->>'google_name', p_match->>'google_address',
    (p_match->>'confidence')::numeric, coalesce(p_match->'fill_fields','{}'::jsonb), coalesce(p_match->'meta_fields','{}'::jsonb),
    p_match->>'business_status', p_match->>'conflict_note')
  ON CONFLICT (club_id) DO NOTHING;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.club_google_scan_authorised() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.club_google_scan_authorised() TO authenticated;
REVOKE ALL ON FUNCTION public.club_google_scan_candidates(uuid,integer), public.club_google_scan_enqueue(uuid,text,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.club_google_scan_candidates(uuid,integer), public.club_google_scan_enqueue(uuid,text,jsonb)
  TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
