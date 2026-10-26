-- STAGING CANDIDATE ONLY. Requires only the private schema bootstrap; not apply.sql.
-- CURRENT MAIN ClubManager application decisions, made atomic. No email delivery.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE club_preview_private.application_decisions (
  club_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  decision text NOT NULL CHECK (decision IN ('approved','rejected')),
  previous_status text NOT NULL,
  rejection_notes text,
  request_snapshot jsonb NOT NULL,
  notification_queued boolean NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE club_preview_private.application_notifications (
  club_id uuid PRIMARY KEY REFERENCES club_preview_private.application_decisions(club_id),
  recipient text NOT NULL,
  template text NOT NULL CHECK (template IN ('club_approved','club_rejected')),
  payload jsonb NOT NULL,
  delivery_status text NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending','sent','failed')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON club_preview_private.application_decisions, club_preview_private.application_notifications FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.preview_decide_club_application(p_club_id uuid, p_decision text, p_rejection_notes text, p_expected_application jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  actor uuid := auth.uid();
  actor_email text;
  permission_role text;
  club public.clubs%ROWTYPE;
  saved club_preview_private.application_decisions%ROWTYPE;
  primary_contact jsonb;
  recipient text;
  result_status text;
  snapshot_keys text[];
  current_snapshot jsonb;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501'; END IF;
  SELECT email INTO actor_email FROM auth.users WHERE id = actor FOR SHARE;
  IF actor_email IS NULL THEN RAISE EXCEPTION 'Account unavailable' USING ERRCODE = '42501'; END IF;
  BEGIN
    SELECT role INTO STRICT permission_role FROM public.admin_sidebar_permissions
      WHERE lower(email) = lower(actor_email) FOR SHARE;
  EXCEPTION WHEN no_data_found OR too_many_rows THEN
    RAISE EXCEPTION 'Platform access required' USING ERRCODE = '42501';
  END;
  IF permission_role IS DISTINCT FROM 'super_admin' THEN RAISE EXCEPTION 'Platform access required' USING ERRCODE = '42501'; END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'Invalid application decision' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(p_expected_application) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Reviewed application snapshot required' USING ERRCODE = '22023'; END IF;
  SELECT array_agg(key ORDER BY key) INTO snapshot_keys FROM jsonb_object_keys(p_expected_application) AS fields(key);
  IF snapshot_keys IS DISTINCT FROM ARRAY['contact_email','contacts','created_by','name','status']::text[] THEN
    RAISE EXCEPTION 'Snapshot must include exactly the reviewed application fields' USING ERRCODE = '22023'; END IF;
  p_rejection_notes := nullif(btrim(p_rejection_notes), '');
  IF (p_decision = 'rejected' AND p_rejection_notes IS NULL)
    OR (p_decision = 'approved' AND p_rejection_notes IS NOT NULL) OR length(p_rejection_notes) > 2000 THEN
    RAISE EXCEPTION 'Feedback is required for rejection only, maximum 2000 characters' USING ERRCODE = '22023'; END IF;
  SELECT * INTO club FROM public.clubs WHERE id = p_club_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Club unavailable' USING ERRCODE = 'P0002'; END IF;
  result_status := CASE p_decision WHEN 'approved' THEN 'published' ELSE 'rejected' END;
  SELECT * INTO saved FROM club_preview_private.application_decisions WHERE club_id = club.id;
  IF FOUND THEN
    IF saved.decision = p_decision AND saved.rejection_notes IS NOT DISTINCT FROM p_rejection_notes
      AND saved.request_snapshot = p_expected_application
      AND club.status = result_status AND club.rejection_notes IS NOT DISTINCT FROM p_rejection_notes
      AND (p_decision <> 'approved' OR (club.verified IS TRUE AND club.approved_at IS NOT NULL)) THEN
      RETURN jsonb_build_object('club_id',club.id,'status',club.status,'already_applied',true,
        'notification',CASE WHEN saved.notification_queued THEN 'queued' ELSE 'not_requested' END);
    END IF;
    RAISE EXCEPTION 'Application already reviewed; reload before continuing' USING ERRCODE = '40001';
  END IF;
  current_snapshot := jsonb_build_object('name',club.name,'status',club.status,'contact_email',club.contact_email,
    'contacts',club.contacts,'created_by',club.created_by);
  IF current_snapshot IS DISTINCT FROM p_expected_application THEN
    RAISE EXCEPTION 'Application changed since review; reload before continuing' USING ERRCODE = '40001'; END IF;
  IF lower(btrim(club.status)) NOT IN ('pending','in_review') OR club.status IS NULL THEN
    RAISE EXCEPTION 'Only pending club applications can be reviewed' USING ERRCODE = '40001'; END IF;
  -- Match applicantEmail: truthy contact_email, otherwise first primary contact,
  -- otherwise first contact. Do not substitute an unrelated player/email lookup.
  recipient := nullif(club.contact_email, '');
  IF recipient IS NULL AND jsonb_typeof(club.contacts) = 'array' THEN
    SELECT item INTO primary_contact FROM jsonb_array_elements(club.contacts) WITH ORDINALITY AS contacts(item, ordinal)
      WHERE item->'is_primary' IS NOT NULL AND item->'is_primary' NOT IN ('null'::jsonb,'false'::jsonb,'0'::jsonb,'""'::jsonb)
      ORDER BY ordinal LIMIT 1;
    IF primary_contact IS NULL THEN primary_contact := club.contacts->0; END IF;
    recipient := nullif(primary_contact->>'email', '');
  END IF;
  IF p_decision = 'approved' THEN
    UPDATE public.clubs SET status = 'published', verified = true,
      approved_at = clock_timestamp(), rejection_notes = NULL WHERE id = club.id;
    IF recipient IS NOT NULL THEN
      -- Source allows a null created_by; membership remains email-linked.
      INSERT INTO public.club_members(club_id,player_id,user_email,role)
        VALUES(club.id,club.created_by,lower(recipient),'owner')
        ON CONFLICT (club_id,user_email) DO UPDATE SET player_id = EXCLUDED.player_id, role = EXCLUDED.role;
    END IF;
  ELSE
    UPDATE public.clubs SET status = 'rejected', rejection_notes = p_rejection_notes WHERE id = club.id;
  END IF;
  INSERT INTO club_preview_private.application_decisions(club_id,actor_id,decision,previous_status,rejection_notes,request_snapshot,notification_queued)
    VALUES(club.id,actor,p_decision,club.status,p_rejection_notes,p_expected_application,recipient IS NOT NULL);
  IF recipient IS NOT NULL THEN
    INSERT INTO club_preview_private.application_notifications(club_id,recipient,template,payload)
      VALUES(club.id,recipient,CASE p_decision WHEN 'approved' THEN 'club_approved' ELSE 'club_rejected' END,
        CASE p_decision WHEN 'approved' THEN jsonb_build_object('clubName',club.name)
          ELSE jsonb_build_object('clubName',club.name,'notes',p_rejection_notes) END);
  END IF;
  RETURN jsonb_build_object('club_id',club.id,'status',result_status,'already_applied',false,
    'notification',CASE WHEN recipient IS NOT NULL THEN 'queued' ELSE 'not_requested' END);
END;
$$;
REVOKE ALL ON FUNCTION public.preview_decide_club_application(uuid,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_decide_club_application(uuid,text,text,jsonb) TO authenticated;
COMMIT;
