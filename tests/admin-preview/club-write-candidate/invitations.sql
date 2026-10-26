-- STAGING CANDIDATE ONLY. No provider calls, OTP, access grants or deployment.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE club_preview_private.invitation_operations (
 operation_id uuid PRIMARY KEY, actor_id uuid NOT NULL, club_id uuid NOT NULL,
 recipient text NOT NULL, expected_club jsonb NOT NULL, expected_player jsonb,
 result jsonb NOT NULL, occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE club_preview_private.invitation_notifications (
 operation_id uuid PRIMARY KEY REFERENCES club_preview_private.invitation_operations(operation_id),
 invite_id uuid NOT NULL, recipient text NOT NULL,
 template text NOT NULL CHECK(template='club_claim_invite'), payload jsonb NOT NULL,
 delivery_status text NOT NULL DEFAULT 'pending' CHECK(delivery_status='pending'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE club_preview_private.invitation_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_preview_private.invitation_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON club_preview_private.invitation_operations,club_preview_private.invitation_notifications FROM PUBLIC,anon,authenticated;
CREATE FUNCTION club_preview_private.create_club_invitation(p_operation_id uuid,p_club_id uuid,p_email text,p_expected_club jsonb,p_expected_player jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $function$
DECLARE actor uuid:=auth.uid(); actor_email text; inviter_name text; permission_role text; recipient text:=lower(btrim(p_email));
 club public.clubs%ROWTYPE; player public.players%ROWTYPE; saved club_preview_private.invitation_operations%ROWTYPE;
 invite_id uuid; invite_created_at timestamptz; player_snapshot jsonb; result jsonb; keys text[]; email_parts text[]; local_part text; domain_part text;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 SELECT email,coalesce(nullif(raw_user_meta_data->>'full_name',''),'4M Padel Admin') INTO actor_email,inviter_name FROM auth.users WHERE id=actor FOR SHARE;
 IF actor_email IS NULL THEN RAISE EXCEPTION 'Account unavailable' USING ERRCODE='42501'; END IF;
 BEGIN
  SELECT role INTO STRICT permission_role FROM public.admin_sidebar_permissions WHERE lower(email)=lower(actor_email) FOR SHARE;
 EXCEPTION WHEN no_data_found OR too_many_rows THEN RAISE EXCEPTION 'Platform access required' USING ERRCODE='42501'; END;
 IF permission_role IS DISTINCT FROM 'super_admin' THEN RAISE EXCEPTION 'Platform access required' USING ERRCODE='42501'; END IF;
 email_parts:=string_to_array(recipient,'@'); local_part:=email_parts[1]; domain_part:=email_parts[2];
 IF p_operation_id IS NULL OR p_club_id IS NULL OR recipient IS NULL OR length(recipient)>254
  OR cardinality(email_parts)<>2 OR coalesce(length(local_part),0) NOT BETWEEN 1 AND 64
  OR local_part !~ $email$^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$$email$
  OR left(local_part,1)='.' OR right(local_part,1)='.' OR strpos(local_part,'..')>0
  OR coalesce(domain_part,'')='' OR strpos(domain_part,'.')=0
  OR EXISTS(SELECT 1 FROM unnest(string_to_array(domain_part,'.')) label WHERE label !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$')
  OR jsonb_typeof(p_expected_club) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'Invalid invitation request' USING ERRCODE='22023'; END IF;
 SELECT array_agg(key ORDER BY key) INTO keys FROM jsonb_object_keys(p_expected_club) key;
 IF keys IS DISTINCT FROM ARRAY['id','name']::text[] OR p_expected_club->>'id' IS DISTINCT FROM p_club_id::text THEN
  RAISE EXCEPTION 'Original club snapshot required' USING ERRCODE='22023'; END IF;
 IF p_expected_player IS NOT NULL THEN
  IF jsonb_typeof(p_expected_player) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid player snapshot' USING ERRCODE='22023'; END IF;
  SELECT array_agg(key ORDER BY key) INTO keys FROM jsonb_object_keys(p_expected_player) key;
  IF keys IS DISTINCT FROM ARRAY['email','id','name']::text[] THEN RAISE EXCEPTION 'Complete player snapshot required' USING ERRCODE='22023'; END IF;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('club-invitation:'||p_operation_id::text,0));
 SELECT * INTO saved FROM club_preview_private.invitation_operations WHERE operation_id=p_operation_id;
 IF FOUND THEN
  IF saved.actor_id IS DISTINCT FROM actor OR saved.club_id IS DISTINCT FROM p_club_id OR saved.recipient IS DISTINCT FROM recipient OR saved.expected_club IS DISTINCT FROM p_expected_club OR saved.expected_player IS DISTINCT FROM p_expected_player THEN
   RAISE EXCEPTION 'Operation ID already used for another invitation' USING ERRCODE='40001'; END IF;
  RETURN saved.result||jsonb_build_object('already_applied',true);
 END IF;
 SELECT * INTO club FROM public.clubs WHERE id=p_club_id FOR UPDATE;
 IF NOT FOUND OR jsonb_build_object('id',club.id,'name',club.name) IS DISTINCT FROM p_expected_club THEN RAISE EXCEPTION 'Club changed; reload before inviting' USING ERRCODE='40001'; END IF;
 BEGIN
  SELECT * INTO STRICT player FROM public.players WHERE lower(btrim(email))=recipient FOR SHARE;
  player_snapshot:=jsonb_build_object('id',player.id,'name',player.name,'email',player.email);
 EXCEPTION WHEN no_data_found THEN player_snapshot:=NULL;
  WHEN too_many_rows THEN RAISE EXCEPTION 'Multiple player profiles match this email; review before inviting' USING ERRCODE='22023';
 END;
 IF player_snapshot IS DISTINCT FROM p_expected_player THEN RAISE EXCEPTION 'Recipient profile changed; search again before inviting' USING ERRCODE='40001'; END IF;
 -- A distinct operation deliberately permits "Send another invite", matching
 -- the live flow. Only exact operation retries are deduplicated.
 INSERT INTO public.club_claim_invites(club_id,email,invited_by) VALUES(p_club_id,recipient,actor) RETURNING id,created_at INTO invite_id,invite_created_at;
 result:=jsonb_build_object('operation_id',p_operation_id,'club_id',p_club_id,'invite_id',invite_id,'email',recipient,'created_at',invite_created_at,'status','pending','notification_status','pending','profile_setup_required',player_snapshot IS NULL,'profile_setup_status',CASE WHEN player_snapshot IS NULL THEN 'unconnected' ELSE 'not_required' END,'already_applied',false);
 INSERT INTO club_preview_private.invitation_operations(operation_id,actor_id,club_id,recipient,expected_club,expected_player,result)
 VALUES(p_operation_id,actor,p_club_id,recipient,p_expected_club,p_expected_player,result);
 -- No token or URL is copied. A future reviewed consumer must resolve invite_id
 -- and trusted origin. Profile creation OTP remains explicitly unconnected.
 INSERT INTO club_preview_private.invitation_notifications(operation_id,invite_id,recipient,template,payload)
 VALUES(p_operation_id,invite_id,recipient,'club_claim_invite',jsonb_build_object('clubName',club.name,'inviterName',inviter_name,'profile_setup_required',player_snapshot IS NULL));
 RETURN result;
END $function$;
REVOKE ALL ON FUNCTION club_preview_private.create_club_invitation(uuid,uuid,text,jsonb,jsonb) FROM PUBLIC,anon;
GRANT USAGE ON SCHEMA club_preview_private TO authenticated;
GRANT EXECUTE ON FUNCTION club_preview_private.create_club_invitation(uuid,uuid,text,jsonb,jsonb) TO authenticated;
CREATE FUNCTION public.preview_create_club_invitation(p_operation_id uuid,p_club_id uuid,p_email text,p_expected_club jsonb,p_expected_player jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT club_preview_private.create_club_invitation(p_operation_id,p_club_id,p_email,p_expected_club,p_expected_player);
$$;
REVOKE ALL ON FUNCTION public.preview_create_club_invitation(uuid,uuid,text,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.preview_create_club_invitation(uuid,uuid,text,jsonb,jsonb) TO authenticated;
COMMIT;
