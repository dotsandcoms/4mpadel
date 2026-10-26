-- LOCAL/STAGING CANDIDATE ONLY. Not an automatic migration. No legacy policy changes.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE SCHEMA club_preview_private;
REVOKE ALL ON SCHEMA club_preview_private FROM PUBLIC;
CREATE TABLE club_preview_private.profile_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  club_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  changed_fields text[] NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON club_preview_private.profile_audit FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.preview_update_club_profile(p_club_id uuid, p_changes jsonb, p_expected jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  actor uuid := auth.uid();
  actor_email text;
  permission_role text;
  current_row public.clubs%ROWTYPE;
  next_row public.clubs%ROWTYPE;
  field_name text;
  field_value jsonb;
  field_limit integer;
  changed_fields text[] := ARRAY[]::text[];
  expected_keys text[];
  allowed_fields constant text[] := ARRAY['name','short_name','tagline','about','city','province','country','address','website_url','contact_email','contact_phone','whatsapp_number'];
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501'; END IF;
  -- Resolve current identity server-side, never a caller-supplied email or JWT role.
  SELECT email INTO actor_email FROM auth.users WHERE id = actor;
  IF actor_email IS NULL THEN RAISE EXCEPTION 'Account unavailable' USING ERRCODE = '42501'; END IF;
  BEGIN
    SELECT role INTO STRICT permission_role FROM public.admin_sidebar_permissions
      WHERE lower(email) = lower(actor_email) FOR SHARE;
  EXCEPTION WHEN no_data_found OR too_many_rows THEN
    RAISE EXCEPTION 'Platform access required' USING ERRCODE = '42501';
  END;
  IF permission_role IS DISTINCT FROM 'super_admin' THEN RAISE EXCEPTION 'Platform access required' USING ERRCODE = '42501'; END IF;
  IF jsonb_typeof(p_changes) IS DISTINCT FROM 'object' OR jsonb_typeof(p_expected) IS DISTINCT FROM 'object'
    OR p_changes = '{}'::jsonb OR octet_length(p_changes::text) > 50000 THEN
    RAISE EXCEPTION 'Invalid profile patch' USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(key ORDER BY key) INTO changed_fields FROM jsonb_object_keys(p_changes) AS fields(key);
  SELECT array_agg(key ORDER BY key) INTO expected_keys FROM jsonb_object_keys(p_expected) AS fields(key);
  IF changed_fields IS DISTINCT FROM expected_keys OR NOT changed_fields <@ allowed_fields THEN
    RAISE EXCEPTION 'Only profile fields with matching original values are accepted' USING ERRCODE = '22023';
  END IF;
  FOR field_name, field_value IN SELECT * FROM jsonb_each(p_changes) LOOP
    IF jsonb_typeof(field_value) NOT IN ('string','null') THEN RAISE EXCEPTION 'Profile values must be text or null' USING ERRCODE = '22023'; END IF;
    field_limit := CASE field_name WHEN 'name' THEN 200 WHEN 'short_name' THEN 100 WHEN 'tagline' THEN 240
      WHEN 'about' THEN 10000 WHEN 'address' THEN 1000 WHEN 'website_url' THEN 2000
      WHEN 'contact_email' THEN 254 WHEN 'contact_phone' THEN 80 WHEN 'whatsapp_number' THEN 80 ELSE 150 END;
    IF length(p_changes->>field_name) > field_limit THEN RAISE EXCEPTION 'Profile field exceeds maximum length' USING ERRCODE = '22023'; END IF;
    p_changes := jsonb_set(p_changes, ARRAY[field_name], coalesce(to_jsonb(nullif(btrim(p_changes->>field_name),'')), 'null'::jsonb));
  END LOOP;
  IF p_changes ? 'name' AND p_changes->>'name' IS NULL THEN RAISE EXCEPTION 'Club name required' USING ERRCODE = '22023'; END IF;
  IF p_changes->>'website_url' IS NOT NULL AND p_changes->>'website_url' !~* '^https?://[^[:space:]/]+[^[:space:]]*$' THEN
    RAISE EXCEPTION 'HTTP(S) website required' USING ERRCODE = '22023'; END IF;
  IF p_changes->>'contact_email' IS NOT NULL AND p_changes->>'contact_email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Valid contact email required' USING ERRCODE = '22023'; END IF;
  SELECT * INTO current_row FROM public.clubs WHERE id = p_club_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Club unavailable' USING ERRCODE = 'P0002'; END IF;
  FOREACH field_name IN ARRAY changed_fields LOOP
    IF (to_jsonb(current_row)->field_name) IS DISTINCT FROM (p_expected->field_name) THEN
      RAISE EXCEPTION 'Club profile changed; reload before saving' USING ERRCODE = '40001';
    END IF;
  END LOOP;
  SELECT * INTO next_row FROM jsonb_populate_record(current_row, p_changes);
  UPDATE public.clubs SET name=next_row.name, short_name=next_row.short_name, tagline=next_row.tagline,
    about=next_row.about, city=next_row.city, province=next_row.province, country=next_row.country,
    address=next_row.address, website_url=next_row.website_url, contact_email=next_row.contact_email,
    contact_phone=next_row.contact_phone, whatsapp_number=next_row.whatsapp_number, updated_at=clock_timestamp()
    WHERE id=p_club_id RETURNING * INTO next_row;
  INSERT INTO club_preview_private.profile_audit(club_id,actor_id,changed_fields) VALUES(p_club_id,actor,changed_fields);
  RETURN jsonb_build_object('id',next_row.id,'updated_at',next_row.updated_at,'changed_fields',changed_fields);
END;
$$;
REVOKE ALL ON FUNCTION public.preview_update_club_profile(uuid,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_update_club_profile(uuid,jsonb,jsonb) TO authenticated;
COMMIT;
