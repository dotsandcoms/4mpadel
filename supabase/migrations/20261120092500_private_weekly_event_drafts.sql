-- An unfinished series has no Calendar rows, links, registrations or checkouts.
CREATE TABLE private.admin_weekly_event_drafts (
  id uuid PRIMARY KEY,
  organisation_id uuid REFERENCES public.organisations(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  weeks integer NOT NULL CHECK (weeks BETWEEN 2 AND 26),
  fields jsonb NOT NULL,
  published_ids bigint[]
);

ALTER TABLE private.admin_weekly_event_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.admin_weekly_event_drafts FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.admin_weekly_event_draft(
  p_action text, p_id uuid DEFAULT NULL, p_host uuid DEFAULT NULL,
  p_revision integer DEFAULT 0, p_weeks integer DEFAULT NULL, p_fields jsonb DEFAULT NULL,
  p_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET timezone = 'Africa/Johannesburg'
AS $$
DECLARE
  draft private.admin_weekly_event_drafts%rowtype;
  fields jsonb;
  event public.calendar%rowtype;
  organisation uuid;
  venue_names text[];
  offset_days integer;
  occurrence date;
  occurrence_fields jsonb;
  calendar_columns text;
  calendar_values text;
  slug text;
  candidate_slug text;
  event_id bigint;
  linked_club uuid;
  event_ids bigint[] := '{}';
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(public.account_is_active(), false) THEN
    RAISE EXCEPTION 'An active Calendar or organisation admin account is required.' USING ERRCODE = '42501';
  END IF;
  IF p_host IS NULL THEN
    IF NOT coalesce(public.is_super_admin(auth.email()), false) THEN
      RAISE EXCEPTION 'Current platform Calendar access is required.' USING ERRCODE = '42501';
    END IF;
  ELSE
    PERFORM public.admin_organisation_host_builder(p_host);
  END IF;

  IF p_action = 'list' THEN
    RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', d.id, 'organisation_id', d.organisation_id, 'revision', d.revision, 'weeks', d.weeks,
      'name', d.fields->>'event_name', 'start_date', d.fields->>'start_date'
    ) ORDER BY d.updated_at DESC, d.id) FROM private.admin_weekly_event_drafts d
      WHERE d.published_ids IS NULL AND (p_host IS NULL OR d.organisation_id = p_host)), '[]'::jsonb);
  END IF;
  IF p_id IS NULL OR p_action IS NULL OR p_action NOT IN ('load', 'save', 'publish', 'discard') THEN
    RAISE EXCEPTION 'Choose a weekly draft action.';
  END IF;

  -- The identifier also serialises retries when no draft row exists yet.
  PERFORM pg_advisory_xact_lock(hashtextextended('admin-weekly:' || p_id::text, 0));
  SELECT * INTO draft FROM private.admin_weekly_event_drafts WHERE id = p_id FOR UPDATE;
  IF draft.id IS NOT NULL AND p_host IS NOT NULL AND draft.organisation_id IS DISTINCT FROM p_host THEN
    RAISE EXCEPTION 'This weekly draft is unavailable.' USING ERRCODE = '42501';
  END IF;
  IF p_action = 'load' THEN
    IF draft.id IS NULL OR draft.published_ids IS NOT NULL THEN
      RAISE EXCEPTION 'This weekly draft is unavailable.';
    END IF;
    RETURN jsonb_build_object('id', draft.id, 'organisation_id', draft.organisation_id,
      'revision', draft.revision, 'weeks', draft.weeks, 'fields', draft.fields);
  END IF;
  IF p_action = 'publish' AND draft.published_ids IS NOT NULL THEN
    RETURN jsonb_build_object('id', draft.id, 'published_ids', draft.published_ids);
  END IF;
  IF coalesce(draft.revision, 0) IS DISTINCT FROM p_revision OR draft.published_ids IS NOT NULL THEN
    RAISE EXCEPTION 'This draft changed. Reopen it to review the latest dates.' USING ERRCODE = '40001';
  END IF;
  IF p_action = 'discard' THEN
    IF draft.id IS NULL THEN RAISE EXCEPTION 'This weekly draft is unavailable.'; END IF;
    DELETE FROM private.admin_weekly_event_drafts WHERE id = p_id;
    RETURN jsonb_build_object('id', p_id);
  END IF;
  IF p_weeks IS NULL OR p_weeks NOT BETWEEN 2 AND 26 OR jsonb_typeof(p_fields) IS DISTINCT FROM 'object'
    OR octet_length(p_fields::text) > 262144 THEN
    RAISE EXCEPTION 'Review the event and choose between 2 and 26 weeks.';
  END IF;

  SELECT coalesce(jsonb_object_agg(key, value), '{}'::jsonb) INTO fields FROM jsonb_each(p_fields)
  WHERE key = ANY (ARRAY[
    'event_name','slug','organisation_id','organiser_name','organiser_logo_url','organiser_badge_text',
    'city','venue','venues','address','start_date','start_time','end_time','description','balls','courts',
    'indoor_outdoor','courts_count','tournament_director','referees','rules_regs','withdrawal_substitution',
    'cut_off_times','draw_released','contact_details','organiser_phone','organiser_email','organiser_website',
    'payment_method','payment_bank_name','payment_account_name','payment_account_number','payment_branch_code',
    'payment_reference_note','external_payment_url','player_gift_type','player_gift_types','default_match_format',
    'custom_image_url','poster_image_url','poster_document_url','organiser_kit_url','media_gallery_urls','sponsor_logos',
    'registration_opens_at','registration_closes_at','allow_payments_after_close','registration_access',
    'early_bird_ends_at','early_bird_fee','entry_fee','is_visible','collect_tshirt_size','allow_tshirt_logo_upload',
    'allow_tshirt_sponsor_name','entry_fee_notes','golden_point','scoring_point','max_teams_capacity',
    'partner_requirement','back_draw_options','event_co_admins','weekly_payment_policy'
  ]);
  event := jsonb_populate_record(NULL::public.calendar, fields);
  organisation := event.organisation_id;
  IF p_host IS NOT NULL AND organisation IS DISTINCT FROM p_host THEN
    RAISE EXCEPTION 'This event must remain with the selected organisation.' USING ERRCODE = '42501';
  END IF;
  IF draft.id IS NOT NULL AND draft.organisation_id IS DISTINCT FROM organisation THEN
    RAISE EXCEPTION 'This draft must remain with its original host organisation.';
  END IF;
  IF nullif(btrim(event.event_name), '') IS NULL OR event.start_date IS NULL OR NOT isfinite(event.start_date)
    OR event.start_time IS NULL OR nullif(btrim(event.city), '') IS NULL
    OR nullif(btrim(event.venue), '') IS NULL OR coalesce(cardinality(event.venues), 0) NOT BETWEEN 1 AND 25
    OR NOT coalesce(event.payment_method IN ('platform', 'eft', 'external', 'free'), false)
    OR NOT coalesce(event.weekly_payment_policy IN ('pay_now', 'allow_reserve'), false)
    OR NOT coalesce(event.registration_access IN ('code', 'public'), false) THEN
    RAISE EXCEPTION 'Review the event name, venue, city, dates, payment and access settings.';
  END IF;
  venue_names := event.venues || ARRAY[event.venue];
  IF organisation IS NOT NULL THEN
    PERFORM public.admin_organisation_host_builder(organisation, NULL, venue_names);
  END IF;

  IF p_action = 'save' THEN
    INSERT INTO private.admin_weekly_event_drafts(id, organisation_id, revision, weeks, fields)
      VALUES (p_id, organisation, p_revision + 1, p_weeks, fields)
      ON CONFLICT (id) DO UPDATE SET revision = excluded.revision, weeks = excluded.weeks,
        fields = excluded.fields, updated_at = clock_timestamp();
    RETURN jsonb_build_object('id', p_id, 'revision', p_revision + 1, 'weeks', p_weeks);
  END IF;

  IF event.registration_access = 'code' AND coalesce(char_length(btrim(p_code)), 0) NOT BETWEEN 6 AND 64 THEN
    RAISE EXCEPTION 'Enter the 6–64 character access code for the published series.';
  END IF;
  IF event.registration_opens_at IS NULL OR event.registration_closes_at IS NULL
    OR NOT isfinite(event.registration_opens_at) OR NOT isfinite(event.registration_closes_at)
    OR event.registration_opens_at >= event.registration_closes_at
    OR event.early_bird_ends_at > event.registration_closes_at THEN
    RAISE EXCEPTION 'Review the registration opening, closing and early-bird times.';
  END IF;
  IF nullif(btrim(event.contact_details), '') IS NULL OR
    (nullif(btrim(event.organiser_email), '') IS NULL AND nullif(btrim(event.organiser_phone), '') IS NULL) THEN
    RAISE EXCEPTION 'Enter a contact person and an email or phone number.';
  END IF;
  IF event.payment_method <> 'free' AND (event.entry_fee IS NULL OR event.entry_fee < 0) THEN
    RAISE EXCEPTION 'Choose a valid weekly entry fee.';
  END IF;
  slug := trim(both '-' FROM left(regexp_replace(lower(coalesce(nullif(btrim(event.slug), ''), event.event_name)), '[^a-z0-9]+', '-', 'g'), 100));
  fields := fields || jsonb_build_object(
    'is_manual', true, 'is_weekly', true, 'is_quick_event', false, 'series_id', p_id,
    'sapa_status', 'None', 'tournament_tag', 'Social', 'sanction_status', 'approved',
    'sanction_requested', false, 'federation_sanction_status', 'not_requested',
    'is_visible', event.is_visible IS TRUE, 'allow_payments', event.payment_method <> 'free',
    'entry_fee', CASE WHEN event.payment_method = 'free' THEN 0 ELSE event.entry_fee END,
    'finance_managed', event.payment_method = 'platform', 'license_required_default', false,
    'allow_temporary_license', false
  );
  FOR week IN 0..(p_weeks - 1) LOOP
    offset_days := week * 7;
    occurrence := event.start_date + offset_days;
    candidate_slug := coalesce(nullif(slug, ''), 'weekly-event') || '-' || to_char(occurrence, 'YYYY-MM-DD');
    PERFORM pg_advisory_xact_lock(hashtextextended('calendar-slug:' || candidate_slug, 0));
    IF EXISTS (SELECT 1 FROM public.calendar c WHERE c.slug = candidate_slug) THEN
      candidate_slug := candidate_slug || '-' || p_id::text;
    END IF;
    IF EXISTS (SELECT 1 FROM public.calendar c WHERE c.slug = candidate_slug) THEN
      RAISE EXCEPTION 'A Calendar event already uses this series link. Review the event slug.';
    END IF;
    occurrence_fields := fields || jsonb_build_object('start_date', occurrence, 'end_date', occurrence,
      'slug', candidate_slug, 'event_dates', to_char(occurrence, 'FMDD FMMonth YYYY'),
      'registration_opens_at', event.registration_opens_at + make_interval(days => offset_days),
      'registration_closes_at', event.registration_closes_at + make_interval(days => offset_days),
      'early_bird_ends_at', event.early_bird_ends_at + make_interval(days => offset_days));
    -- The selected keys come solely from the allowlist and server-owned fields above.
    SELECT string_agg(format('%I', key), ', ' ORDER BY key), string_agg(format('c.%I', key), ', ' ORDER BY key)
      INTO calendar_columns, calendar_values FROM jsonb_object_keys(occurrence_fields) AS keys(key);
    EXECUTE format('INSERT INTO public.calendar (%s) SELECT %s FROM jsonb_populate_record(NULL::public.calendar, $1) AS c RETURNING id, club_id',
      calendar_columns, calendar_values) INTO event_id, linked_club USING occurrence_fields;
    IF organisation IS NOT NULL AND linked_club IS NOT NULL THEN
      PERFORM public.admin_organisation_host_builder(organisation, NULL, venue_names, linked_club);
    END IF;
    IF event.registration_access = 'code' THEN
      PERFORM public.set_event_access_code(event_id, true, btrim(p_code));
    END IF;
    event_ids := array_append(event_ids, event_id);
  END LOOP;

  -- Keep a minimal publish receipt so a retry cannot create duplicate weeks.
  INSERT INTO private.admin_weekly_event_drafts(id, organisation_id, revision, weeks, fields, published_ids)
    VALUES (p_id, organisation, p_revision + 1, p_weeks, '{}'::jsonb, event_ids)
    ON CONFLICT (id) DO UPDATE SET revision = excluded.revision, weeks = excluded.weeks,
      fields = excluded.fields, published_ids = excluded.published_ids, updated_at = clock_timestamp();
  RETURN jsonb_build_object('id', p_id, 'published_ids', event_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_weekly_event_draft(text, uuid, uuid, integer, integer, jsonb, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_weekly_event_draft(text, uuid, uuid, integer, integer, jsonb, text) TO authenticated;
NOTIFY pgrst, 'reload schema';
