-- Candidate only. Requires the private schema bootstrap in isolated local/staging.
-- No email delivery is performed here. No existing RLS policies are changed.
BEGIN;
CREATE TABLE club_preview_private.claim_decisions (
  claim_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  decision text NOT NULL CHECK(decision IN ('approved','rejected')),
  request_snapshot jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE club_preview_private.claim_notifications (
  claim_id uuid PRIMARY KEY REFERENCES club_preview_private.claim_decisions(claim_id),
  recipient text NOT NULL,
  template text NOT NULL,
  payload jsonb NOT NULL,
  delivery_status text NOT NULL DEFAULT 'pending' CHECK(delivery_status IN ('pending','sent','failed')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON club_preview_private.claim_decisions,club_preview_private.claim_notifications FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.preview_decide_club_claim(p_claim_id uuid,p_decision text,p_rejection_notes text DEFAULT NULL,p_expected_club_id uuid DEFAULT NULL,p_expected_claim jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  actor uuid := auth.uid();
  actor_email text;
  permission_role text;
  claim public.club_claim_requests%ROWTYPE;
  club public.clubs%ROWTYPE;
  recipient text;
  player_email text;
  membership_id uuid;
  saved_decision text;
  saved_snapshot jsonb;
  field_name text;
  field_value jsonb;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
  SELECT email INTO actor_email FROM auth.users WHERE id=actor;
  BEGIN
    SELECT role INTO STRICT permission_role FROM public.admin_sidebar_permissions WHERE lower(email)=lower(actor_email) FOR SHARE;
  EXCEPTION WHEN no_data_found OR too_many_rows THEN
    RAISE EXCEPTION 'Platform access required' USING ERRCODE='42501';
  END;
  IF permission_role IS DISTINCT FROM 'super_admin' THEN RAISE EXCEPTION 'Platform access required' USING ERRCODE='42501'; END IF;
  IF p_expected_club_id IS NULL OR jsonb_typeof(p_expected_claim) IS DISTINCT FROM 'object'
    OR NOT (p_expected_claim ?& ARRAY['club_id','requester_email','requester_player_id','status'])
    OR p_expected_claim->>'club_id' IS DISTINCT FROM p_expected_club_id::text
    OR p_expected_claim->>'status' IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'Original pending claim snapshot required' USING ERRCODE='22023';
  END IF;
  FOR field_name IN SELECT jsonb_object_keys(p_expected_claim) LOOP
    IF field_name NOT IN ('id','club_id','requester_email','requester_player_id','status','full_name','contact_phone','primary_role','notes','created_at') THEN
      RAISE EXCEPTION 'Invalid claim snapshot field' USING ERRCODE='22023';
    END IF;
  END LOOP;
  IF p_decision IS NULL OR p_decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'Invalid claim decision' USING ERRCODE='22023'; END IF;
  p_rejection_notes := nullif(btrim(p_rejection_notes),'');
  IF (p_decision='rejected' AND p_rejection_notes IS NULL) OR length(p_rejection_notes)>2000
    OR (p_decision='approved' AND p_rejection_notes IS NOT NULL) THEN
    RAISE EXCEPTION 'Rejection feedback required only for rejection, maximum 2000 characters' USING ERRCODE='22023'; END IF;
  SELECT * INTO claim FROM public.club_claim_requests WHERE id=p_claim_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Claim unavailable' USING ERRCODE='P0002'; END IF;
  IF claim.club_id IS DISTINCT FROM p_expected_club_id THEN
    RAISE EXCEPTION 'Claim moved to another club; reload before continuing' USING ERRCODE='40001';
  END IF;
  IF claim.status IS DISTINCT FROM 'pending' THEN
    SELECT decision,request_snapshot INTO saved_decision,saved_snapshot FROM club_preview_private.claim_decisions WHERE claim_id=claim.id;
    IF saved_decision=p_decision AND saved_snapshot=p_expected_claim AND claim.status=p_decision AND claim.rejection_notes IS NOT DISTINCT FROM p_rejection_notes THEN
      RETURN jsonb_build_object('claim_id',claim.id,'status',claim.status,'already_applied',true);
    END IF;
    RAISE EXCEPTION 'Claim already reviewed; reload before continuing' USING ERRCODE='40001';
  END IF;
  FOR field_name,field_value IN SELECT key,value FROM jsonb_each(p_expected_claim) LOOP
    -- JSON timestamp spelling can differ between PostgREST and PostgreSQL.
    IF field_name='created_at' THEN
      IF (to_jsonb(claim)->>field_name)::timestamptz IS DISTINCT FROM (p_expected_claim->>field_name)::timestamptz THEN
        RAISE EXCEPTION 'Claim changed; reload before continuing' USING ERRCODE='40001';
      END IF;
      CONTINUE;
    END IF;
    IF to_jsonb(claim)->field_name IS DISTINCT FROM field_value THEN
      RAISE EXCEPTION 'Claim changed; reload before continuing' USING ERRCODE='40001';
    END IF;
  END LOOP;
  recipient := lower(btrim(claim.requester_email));
  IF recipient IS NULL OR recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Valid claimant email required' USING ERRCODE='22023'; END IF;
  SELECT * INTO club FROM public.clubs WHERE id=claim.club_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Club unavailable' USING ERRCODE='P0002'; END IF;
  IF p_decision='approved' THEN
    -- Do not associate a caller-selected player ID or guess an email match.
    -- Live workflow permits email-only owners. Validate a linked player only
    -- when the request actually has one; never invent or infer a player ID.
    IF claim.requester_player_id IS NOT NULL THEN
      SELECT email INTO player_email FROM public.players WHERE id=claim.requester_player_id FOR SHARE;
      IF player_email IS NULL OR lower(btrim(player_email))<>recipient THEN
        RAISE EXCEPTION 'Claimant player profile must match the claim email' USING ERRCODE='22023'; END IF;
    END IF;
    BEGIN
      SELECT id INTO STRICT membership_id FROM public.club_members WHERE club_id=club.id AND lower(user_email)=recipient FOR UPDATE;
    EXCEPTION WHEN no_data_found THEN membership_id:=NULL;
      WHEN too_many_rows THEN RAISE EXCEPTION 'Duplicate membership records need review' USING ERRCODE='22023';
    END;
    IF membership_id IS NULL THEN
      INSERT INTO public.club_members(club_id,player_id,user_email,role) VALUES(club.id,claim.requester_player_id,recipient,'owner');
    ELSE
      UPDATE public.club_members SET role='owner',player_id=claim.requester_player_id WHERE id=membership_id;
    END IF;
    IF club.status IN ('unclaimed','draft','archived') THEN
      UPDATE public.clubs SET status='published',verified=true,approved_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=club.id;
    END IF;
  END IF;
  UPDATE public.club_claim_requests SET status=p_decision,reviewed_at=clock_timestamp(),reviewed_by=actor,rejection_notes=p_rejection_notes WHERE id=claim.id;
  INSERT INTO club_preview_private.claim_decisions(claim_id,actor_id,decision,request_snapshot) VALUES(claim.id,actor,p_decision,p_expected_claim);
  INSERT INTO club_preview_private.claim_notifications(claim_id,recipient,template,payload)
    VALUES(claim.id,recipient,CASE p_decision WHEN 'approved' THEN 'club_claim_approved' ELSE 'club_claim_rejected' END,
      jsonb_build_object('clubName',club.name,'notes',p_rejection_notes));
  RETURN jsonb_build_object('claim_id',claim.id,'status',p_decision,'already_applied',false,'notification','pending');
END $$;
REVOKE ALL ON FUNCTION public.preview_decide_club_claim(uuid,text,text,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.preview_decide_club_claim(uuid,text,text,uuid,jsonb) TO authenticated;
COMMIT;
