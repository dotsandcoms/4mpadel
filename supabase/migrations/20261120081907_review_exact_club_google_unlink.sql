BEGIN;

CREATE FUNCTION public.review_club_google_unlink(
  p_action text, p_club_id uuid, p_match_id uuid, p_expected text DEFAULT NULL,
  p_target_club_id uuid DEFAULT NULL, p_place_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  source_club public.clubs;
  source_match public.club_google_matches;
  target_club public.clubs;
  target_match public.club_google_matches;
  changed_club public.clubs;
  holder_id uuid;
  place_id text;
  recorded_sync_at timestamptz;
  provenance boolean := false;
  existing jsonb;
  patch jsonb;
  previous_values jsonb;
  untouched text[] := '{}';
  field text;
  imported jsonb;
  review_token text;
  reviewing boolean := p_action IN ('review-delist','review-conflict');
  conflict boolean := p_action IN ('review-conflict','conflict');
  decision text;
  response jsonb;
BEGIN
  IF NOT coalesce(private.permission_actor_active(),false)
    OR NOT coalesce(public.is_super_admin(auth.email()),false) THEN
    RAISE EXCEPTION 'Verified platform Clubs access is required.' USING ERRCODE = '42501';
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('review-delist','delist','review-conflict','conflict')
    OR p_club_id IS NULL OR p_match_id IS NULL
    OR (reviewing AND (p_target_club_id IS NOT NULL OR p_expected IS NOT NULL))
    OR (NOT reviewing AND (p_target_club_id IS NULL OR p_expected IS NULL))
    OR (NOT conflict AND p_place_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Review the exact Google listing before unlinking it.';
  END IF;

  -- Resolve the holder from the exact Place ID. The current holder and
  -- source proposal are checked again after taking the same stable club lock
  -- ordering as the Club lifecycle operation.
  IF conflict THEN
    SELECT * INTO source_match FROM public.club_google_matches WHERE id=p_match_id AND club_id=p_club_id;
    place_id := coalesce(p_place_id,source_match.google_place_id);
    IF source_match.id IS NULL OR place_id IS NULL OR place_id !~ '^[A-Za-z0-9_-]{1,255}$' THEN
      RAISE EXCEPTION 'Choose a pending match with an exact Google Place ID.';
    END IF;
    SELECT c.id INTO holder_id FROM public.clubs c WHERE c.google_place_id=place_id AND c.id<>p_club_id;
  ELSE
    holder_id := p_club_id;
  END IF;
  IF NOT reviewing AND holder_id IS DISTINCT FROM p_target_club_id THEN
    RAISE EXCEPTION 'The club holding this Google listing changed. Review it again.' USING ERRCODE='40001';
  END IF;

  PERFORM 1 FROM public.clubs WHERE id IN (p_club_id,holder_id) ORDER BY id FOR UPDATE;
  SELECT * INTO source_club FROM public.clubs WHERE id=p_club_id;
  SELECT * INTO source_match FROM public.club_google_matches WHERE id=p_match_id AND club_id=p_club_id FOR UPDATE;
  IF source_club.id IS NULL OR source_match.id IS NULL THEN
    RAISE EXCEPTION 'This club or Google match is no longer available. Reload Google Sync.';
  END IF;
  decision := CASE WHEN conflict THEN 'conflict' ELSE 'delist' END;
  response := jsonb_build_object('club_id',p_club_id,'match_id',p_match_id,'decision',decision,
    'source',jsonb_build_object('id',source_club.id,'name',source_club.name,'slug',source_club.slug),'place_id',place_id);

  IF conflict THEN
    IF source_match.review_status <> 'pending'
      OR nullif(btrim(source_club.google_place_id),'') IS NOT NULL
      OR nullif(btrim(source_club.google_maps_url),'') IS NOT NULL
      OR coalesce(p_place_id,source_match.google_place_id) IS DISTINCT FROM place_id THEN
      RAISE EXCEPTION 'The pending Google match changed. Review it again.' USING ERRCODE='40001';
    END IF;
    IF holder_id IS NULL THEN
      IF EXISTS (SELECT 1 FROM public.clubs c WHERE c.google_place_id=place_id AND c.id<>p_club_id) THEN
        RAISE EXCEPTION 'The club holding this Google listing changed. Review it again.' USING ERRCODE='40001';
      END IF;
      RETURN response || jsonb_build_object('status','available');
    END IF;
  END IF;

  SELECT * INTO target_club FROM public.clubs WHERE id=holder_id;
  IF target_club.id IS NULL
    OR (conflict AND target_club.google_place_id IS DISTINCT FROM place_id)
    OR (nullif(btrim(target_club.google_place_id),'') IS NULL AND nullif(btrim(target_club.google_maps_url),'') IS NULL) THEN
    RAISE EXCEPTION 'The Google listing changed. Review it again.' USING ERRCODE='40001';
  END IF;
  SELECT * INTO target_match FROM public.club_google_matches WHERE club_id=holder_id FOR UPDATE;

  -- A proposal created by a scan proves neither import nor ownership of a
  -- profile value. Require a recorded apply, matching current listing and
  -- timestamp, then compare each imported value independently.
  IF target_match.review_status='applied' AND target_club.google_synced_at IS NOT NULL THEN
    BEGIN
      recorded_sync_at := (target_match.meta_fields->>'google_synced_at')::timestamptz;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
      recorded_sync_at := NULL;
    END;
    provenance := coalesce(recorded_sync_at=target_club.google_synced_at AND (
      (target_club.google_place_id IS NOT NULL AND target_match.google_place_id=target_club.google_place_id
        AND target_match.meta_fields->>'google_place_id'=target_club.google_place_id)
      OR (target_club.google_place_id IS NULL AND target_match.google_place_id IS NULL
        AND target_match.meta_fields->>'google_maps_url'=target_club.google_maps_url)
    ),false);
  END IF;

  existing := to_jsonb(target_club);
  patch := jsonb_build_object('google_place_id',NULL,'google_maps_url',NULL,'google_rating',NULL,
    'google_ratings_total',NULL,'google_synced_at',NULL);
  FOR field, imported IN SELECT * FROM jsonb_each(
    CASE WHEN jsonb_typeof(target_match.fill_fields)='object' THEN target_match.fill_fields ELSE '{}'::jsonb END
  ) ORDER BY key LOOP
    IF field IN ('address','city','province','country','lat','lng','website_url','contact_phone','opening_hours','cover_image_url','gallery')
      AND existing->field IS NOT NULL AND existing->field<>'null'::jsonb THEN
      IF provenance AND existing->field=imported THEN
        patch := patch || jsonb_build_object(field,CASE WHEN field='opening_hours' THEN '{}'::jsonb
          WHEN field='gallery' THEN '[]'::jsonb ELSE 'null'::jsonb END);
      ELSE
        untouched := array_append(untouched,field);
      END IF;
    END IF;
  END LOOP;
  SELECT coalesce(jsonb_object_agg(key,value),'{}'::jsonb) INTO patch
    FROM jsonb_each(patch) WHERE existing->key IS DISTINCT FROM value;
  SELECT coalesce(jsonb_object_agg(key,existing->key),'{}'::jsonb) INTO previous_values FROM jsonb_object_keys(patch) key;

  review_token := md5(jsonb_build_array(auth.uid(),decision,place_id,to_jsonb(source_club),to_jsonb(source_match),
    to_jsonb(target_club),to_jsonb(target_match),patch)::text);
  response := response || jsonb_build_object('target',jsonb_build_object('id',target_club.id,'name',target_club.name,
    'slug',target_club.slug,'match_id',target_match.id),'provenance_confirmed',provenance);
  IF reviewing THEN
    RETURN response || jsonb_build_object('status','review','token',review_token,'before',previous_values,'patch',patch,'preserved',untouched);
  END IF;
  IF p_expected IS DISTINCT FROM review_token THEN
    RAISE EXCEPTION 'The club or Google listing changed. Review it again.' USING ERRCODE='40001';
  END IF;

  changed_club := jsonb_populate_record(target_club,patch);
  UPDATE public.clubs SET
    google_place_id=NULL, google_maps_url=NULL, google_rating=NULL, google_ratings_total=NULL, google_synced_at=NULL,
    address=changed_club.address, city=changed_club.city, province=changed_club.province, country=changed_club.country,
    lat=changed_club.lat, lng=changed_club.lng, website_url=changed_club.website_url, contact_phone=changed_club.contact_phone,
    opening_hours=changed_club.opening_hours, cover_image_url=changed_club.cover_image_url, gallery=changed_club.gallery, updated_at=now()
  WHERE id=holder_id;
  IF target_match.id IS NOT NULL THEN
    UPDATE public.club_google_matches SET match_status='no_match', review_status='pending', google_place_id=NULL,
      google_name=NULL, google_address=NULL, confidence=NULL, fill_fields='{}', meta_fields='{}', business_status=NULL,
      conflict_note=NULL, reviewed_at=NULL WHERE id=target_match.id AND club_id=holder_id;
  END IF;
  RETURN response || jsonb_build_object('status','unlinked');
END $$;

REVOKE ALL ON FUNCTION public.review_club_google_unlink(text,uuid,uuid,text,uuid,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_club_google_unlink(text,uuid,uuid,text,uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
