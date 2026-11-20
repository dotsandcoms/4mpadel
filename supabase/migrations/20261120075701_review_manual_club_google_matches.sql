BEGIN;

-- One planner and transaction for stored and manually selected provider records.
CREATE FUNCTION private.review_club_google_match(
  p_action text, p_club_id uuid, p_match_id uuid, p_expected text, p_candidate jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  club public.clubs;
  match public.club_google_matches;
  updated public.clubs;
  existing jsonb;
  fill jsonb := '{}'::jsonb;
  metadata jsonb := '{}'::jsonb;
  proposed_fill jsonb;
  proposed_metadata jsonb;
  patch jsonb;
  previous_values jsonb;
  key text;
  value jsonb;
  place_id text;
  pasted_url text;
  candidate_kind text := p_candidate->>'kind';
  token text;
  decision text;
BEGIN
  IF NOT coalesce(private.permission_actor_active(), false)
    OR NOT coalesce(public.is_super_admin(auth.email()), false) THEN
    RAISE EXCEPTION 'Verified platform Clubs access is required.' USING ERRCODE = '42501';
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('review-apply','apply','review-dismiss','dismiss')
    OR p_club_id IS NULL OR p_match_id IS NULL THEN
    RAISE EXCEPTION 'Choose a recorded club match and action.';
  END IF;
  IF p_action IN ('apply','dismiss') AND p_expected IS NULL THEN
    RAISE EXCEPTION 'Review the club match before confirming.';
  END IF;
  IF p_candidate IS NOT NULL AND (p_action NOT IN ('review-apply','apply')
    OR jsonb_typeof(p_candidate) <> 'object' OR octet_length(p_candidate::text) > 16000
    OR NOT coalesce(candidate_kind IN ('place','link'),false)) THEN
    RAISE EXCEPTION 'Choose one listing or paste a Google Maps link for review.';
  END IF;
  SELECT * INTO club FROM public.clubs WHERE id = p_club_id FOR UPDATE;
  SELECT * INTO match FROM public.club_google_matches WHERE id = p_match_id AND club_id = p_club_id FOR UPDATE;
  IF club.id IS NULL OR match.id IS NULL OR match.review_status <> 'pending'
    OR nullif(btrim(club.google_place_id), '') IS NOT NULL OR nullif(btrim(club.google_maps_url), '') IS NOT NULL THEN
    RAISE EXCEPTION 'This pending Google match is no longer available. Reload Google Sync.';
  END IF;

  decision := CASE WHEN p_action IN ('review-apply','apply') THEN 'apply' ELSE 'dismiss' END;
  existing := to_jsonb(club);
  IF decision = 'apply' THEN
    IF p_candidate IS NULL THEN
      place_id := nullif(btrim(match.meta_fields->>'google_place_id'), '');
      IF place_id IS NULL OR place_id IS DISTINCT FROM match.google_place_id THEN
        RAISE EXCEPTION 'This match has no verified recorded listing to apply.';
      END IF;
      proposed_fill := match.fill_fields;
      proposed_metadata := match.meta_fields;
    ELSIF candidate_kind = 'place' THEN
      place_id := p_candidate->>'place_id';
      proposed_fill := p_candidate->'fields';
      IF place_id IS NULL OR place_id !~ '^[A-Za-z0-9_-]{1,255}$'
        OR NOT coalesce(length(nullif(btrim(p_candidate->>'name'),'')) BETWEEN 1 AND 400,false)
        OR length(coalesce(p_candidate->>'address','')) > 1000
        OR jsonb_typeof(proposed_fill) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'Choose a valid Google Places result.';
      END IF;
      proposed_metadata := jsonb_build_object('google_place_id',place_id,'google_maps_url',p_candidate->'url',
        'google_rating',p_candidate->'rating','google_ratings_total',p_candidate->'review_count');
    ELSE
      pasted_url := p_candidate->>'url';
      IF pasted_url IS NULL OR length(pasted_url) > 2048 OR pasted_url ~ '[[:space:]]' THEN
        RAISE EXCEPTION 'Paste a complete HTTPS Google Maps link.';
      END IF;
      proposed_fill := '{}'::jsonb;
      proposed_metadata := jsonb_build_object('google_maps_url',pasted_url);
    END IF;
    IF place_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.clubs WHERE google_place_id = place_id AND id <> p_club_id) THEN
      RAISE EXCEPTION 'This Google listing is linked to a different club. Resolve the conflict before applying.' USING ERRCODE = '23505';
    END IF;
    FOR key, value IN SELECT * FROM jsonb_each(proposed_fill) LOOP
      IF key IN ('address','city','province','country','lat','lng','website_url','contact_phone','opening_hours','cover_image_url','gallery')
        AND (p_candidate IS NULL OR key NOT IN ('cover_image_url','gallery'))
        AND value <> 'null'::jsonb
        AND (existing->key IS NULL OR existing->key IN ('null','""','{}','[]')) THEN
        fill := fill || jsonb_build_object(key, value);
      END IF;
    END LOOP;
    FOR key, value IN SELECT * FROM jsonb_each(proposed_metadata) LOOP
      IF key IN ('google_place_id','google_maps_url','google_rating','google_ratings_total') THEN
        metadata := metadata || jsonb_build_object(key, value);
      END IF;
    END LOOP;
    IF place_id IS NOT NULL THEN
      metadata := metadata || jsonb_build_object('google_place_id',place_id);
    END IF;
    IF (metadata->>'google_maps_url') IS NOT NULL
      AND (metadata->>'google_maps_url') !~* '^https://(maps[.]app[.]goo[.]gl/|maps[.]google[.]com/|(www[.])?google[.]com/maps([/?]|$))' THEN
      RAISE EXCEPTION 'The recorded Google Maps link is invalid.';
    END IF;
    patch := fill || metadata;
    updated := jsonb_populate_record(club, patch);
    IF (patch ? 'lat' AND updated.lat NOT BETWEEN -90 AND 90)
      OR (patch ? 'lng' AND updated.lng NOT BETWEEN -180 AND 180)
      OR updated.google_rating NOT BETWEEN 0 AND 5 OR updated.google_ratings_total < 0
      OR (patch ? 'opening_hours' AND jsonb_typeof(updated.opening_hours) <> 'object')
      OR (patch ? 'gallery' AND jsonb_typeof(updated.gallery) <> 'array') THEN
      RAISE EXCEPTION 'The recorded map or rating values are invalid.';
    END IF;
    IF (patch ? 'website_url' AND updated.website_url !~* '^https?://[^[:space:]]+$')
      OR (patch ? 'cover_image_url' AND updated.cover_image_url !~* '^https?://[^[:space:]]+$')
      OR (patch ? 'gallery' AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(updated.gallery) photo
        WHERE coalesce(photo->>'url','') !~* '^https?://[^[:space:]]+$'
      )) THEN
      RAISE EXCEPTION 'The recorded website or image links are invalid.';
    END IF;
  ELSE
    patch := '{}'::jsonb;
  END IF;

  token := md5((CASE WHEN p_candidate IS NULL THEN jsonb_build_array(auth.uid(), decision, existing, to_jsonb(match), patch)
    ELSE jsonb_build_array(auth.uid(), decision, existing, to_jsonb(match), patch, p_candidate) END)::text);
  IF p_action LIKE 'review-%' THEN
    SELECT coalesce(jsonb_object_agg(field,existing->field),'{}'::jsonb)
      INTO previous_values FROM jsonb_object_keys(patch) field;
    RETURN jsonb_build_object('club_id',club.id,'match_id',match.id,'name',club.name,
      'decision',decision,'token',token,'before',previous_values,'patch',patch);
  END IF;
  IF p_expected IS DISTINCT FROM token THEN
    RAISE EXCEPTION 'The club or Google match changed. Review it again.' USING ERRCODE = '40001';
  END IF;

  IF decision = 'apply' THEN
    UPDATE public.clubs SET
      address = updated.address, city = updated.city, province = updated.province, country = updated.country,
      lat = updated.lat, lng = updated.lng, website_url = updated.website_url, contact_phone = updated.contact_phone,
      opening_hours = updated.opening_hours, cover_image_url = updated.cover_image_url, gallery = updated.gallery,
      google_place_id = updated.google_place_id, google_maps_url = updated.google_maps_url,
      google_rating = updated.google_rating, google_ratings_total = updated.google_ratings_total,
      google_synced_at = now(), updated_at = now()
    WHERE id = club.id;
    UPDATE public.club_google_matches SET match_status = CASE WHEN candidate_kind = 'link' THEN 'no_match' ELSE 'matched' END,
      review_status = 'applied', reviewed_at = now(), conflict_note = NULL, fill_fields = fill,
      meta_fields = metadata || jsonb_build_object('google_synced_at',now()),
      google_place_id = CASE WHEN p_candidate IS NULL THEN match.google_place_id ELSE place_id END,
      google_name = CASE WHEN p_candidate IS NULL THEN match.google_name ELSE p_candidate->>'name' END,
      google_address = CASE WHEN p_candidate IS NULL THEN match.google_address ELSE p_candidate->>'address' END,
      confidence = CASE WHEN p_candidate IS NULL THEN match.confidence WHEN candidate_kind = 'place' THEN 1 ELSE NULL END,
      business_status = CASE WHEN p_candidate IS NULL THEN match.business_status
        WHEN p_candidate->>'business_status' IN ('OPERATIONAL','CLOSED_TEMPORARILY','CLOSED_PERMANENTLY') THEN p_candidate->>'business_status' END
    WHERE id = match.id AND club_id = club.id;
  ELSE
    UPDATE public.club_google_matches SET review_status = 'dismissed', reviewed_at = now()
    WHERE id = match.id AND club_id = club.id;
  END IF;
  RETURN jsonb_build_object('club_id',club.id,'match_id',match.id,'decision',decision);
END $$;

REVOKE ALL ON FUNCTION private.review_club_google_match(text,uuid,uuid,text,jsonb) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.review_club_google_match(p_action text,p_club_id uuid,p_match_id uuid,p_expected text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.review_club_google_match(p_action,p_club_id,p_match_id,p_expected,NULL);
$$;

CREATE FUNCTION public.review_manual_club_google_match(
  p_action text,p_club_id uuid,p_match_id uuid,p_candidate jsonb,p_expected text DEFAULT NULL
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.review_club_google_match(p_action,p_club_id,p_match_id,p_expected,coalesce(p_candidate,'{}'::jsonb));
$$;
REVOKE ALL ON FUNCTION public.review_manual_club_google_match(text,uuid,uuid,jsonb,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_manual_club_google_match(text,uuid,uuid,jsonb,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
