-- STAGING CANDIDATE ONLY. Requires private schema bootstrap. No email delivery.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE club_preview_private.member_add_operations (
  operation_id uuid PRIMARY KEY, actor_id uuid NOT NULL, club_id uuid NOT NULL,
  player_id bigint NOT NULL, requested_role text NOT NULL,
  expected_player jsonb NOT NULL, result jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE club_preview_private.member_add_notifications (
  operation_id uuid PRIMARY KEY REFERENCES club_preview_private.member_add_operations(operation_id),
  recipient text NOT NULL, template text NOT NULL CHECK(template='club_member_added'),
  payload jsonb NOT NULL, delivery_status text NOT NULL DEFAULT 'pending' CHECK(delivery_status='pending'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE club_preview_private.member_add_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE club_preview_private.member_add_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON club_preview_private.member_add_operations,club_preview_private.member_add_notifications FROM PUBLIC,anon,authenticated;
CREATE FUNCTION club_preview_private.add_club_member(p_operation_id uuid,p_club_id uuid,p_player_id bigint,p_role text,p_expected_player jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=auth.uid(); actor_email text; permission_role text; keys text[];
  saved club_preview_private.member_add_operations%ROWTYPE; player public.players%ROWTYPE;
  club public.clubs%ROWTYPE; member public.club_members%ROWTYPE; recipient text; result jsonb;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
  SELECT email INTO actor_email FROM auth.users WHERE id=actor FOR SHARE;
  IF actor_email IS NULL THEN RAISE EXCEPTION 'Account unavailable' USING ERRCODE='42501'; END IF;
  BEGIN
    SELECT role INTO STRICT permission_role FROM public.admin_sidebar_permissions WHERE lower(email)=lower(actor_email) FOR SHARE;
  EXCEPTION WHEN no_data_found OR too_many_rows THEN RAISE EXCEPTION 'Platform access required' USING ERRCODE='42501'; END;
  IF permission_role IS DISTINCT FROM 'super_admin' THEN RAISE EXCEPTION 'Platform access required' USING ERRCODE='42501'; END IF;
  IF p_operation_id IS NULL OR p_club_id IS NULL OR p_player_id IS NULL OR p_role IS NULL OR p_role NOT IN ('owner','admin','staff') OR jsonb_typeof(p_expected_player) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid add-member request' USING ERRCODE='22023'; END IF;
  SELECT array_agg(key ORDER BY key) INTO keys FROM jsonb_object_keys(p_expected_player) key;
  IF keys IS DISTINCT FROM ARRAY['email','id','name']::text[] OR p_expected_player->>'id' IS DISTINCT FROM p_player_id::text THEN
    RAISE EXCEPTION 'Complete selected player snapshot required' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('club-member-add:'||p_operation_id::text,0));
  SELECT * INTO saved FROM club_preview_private.member_add_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF saved.actor_id IS DISTINCT FROM actor OR saved.club_id IS DISTINCT FROM p_club_id OR saved.player_id IS DISTINCT FROM p_player_id OR saved.requested_role IS DISTINCT FROM p_role OR saved.expected_player IS DISTINCT FROM p_expected_player THEN
      RAISE EXCEPTION 'Operation ID already used for another action' USING ERRCODE='40001'; END IF;
    RETURN saved.result||jsonb_build_object('already_applied',true);
  END IF;
  SELECT * INTO club FROM public.clubs WHERE id=p_club_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Club unavailable' USING ERRCODE='P0002'; END IF;
  SELECT * INTO player FROM public.players WHERE id=p_player_id FOR SHARE;
  IF NOT FOUND OR jsonb_build_object('id',player.id,'name',player.name,'email',player.email) IS DISTINCT FROM p_expected_player THEN
    RAISE EXCEPTION 'Selected player changed; search again before adding' USING ERRCODE='40001'; END IF;
  recipient:=lower(btrim(player.email));
  IF recipient IS NULL OR recipient='' THEN RAISE EXCEPTION 'Player has no email address' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM public.club_members WHERE club_id=p_club_id AND lower(btrim(user_email))=recipient) THEN
    RAISE EXCEPTION 'This player email already has club access; manage the existing membership' USING ERRCODE='23505'; END IF;
  INSERT INTO public.club_members(club_id,player_id,user_email,role) VALUES(p_club_id,p_player_id,recipient,p_role) RETURNING * INTO member;
  result:=jsonb_build_object('operation_id',p_operation_id,'club_id',p_club_id,'member_id',member.id,'member',to_jsonb(member),'notification','pending','already_applied',false);
  INSERT INTO club_preview_private.member_add_operations(operation_id,actor_id,club_id,player_id,requested_role,expected_player,result)
    VALUES(p_operation_id,actor,p_club_id,p_player_id,p_role,p_expected_player,result);
  INSERT INTO club_preview_private.member_add_notifications(operation_id,recipient,template,payload)
    VALUES(p_operation_id,recipient,'club_member_added',jsonb_build_object('clubName',coalesce(nullif(club.short_name,''),club.name),'role',p_role,'playerName',coalesce(player.name,'')));
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION club_preview_private.add_club_member(uuid,uuid,bigint,text,jsonb) FROM PUBLIC,anon;
GRANT USAGE ON SCHEMA club_preview_private TO authenticated;
GRANT EXECUTE ON FUNCTION club_preview_private.add_club_member(uuid,uuid,bigint,text,jsonb) TO authenticated;
CREATE FUNCTION public.preview_add_club_member(p_operation_id uuid,p_club_id uuid,p_player_id bigint,p_role text,p_expected_player jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog AS $$
  SELECT club_preview_private.add_club_member(p_operation_id,p_club_id,p_player_id,p_role,p_expected_player);
$$;
REVOKE ALL ON FUNCTION public.preview_add_club_member(uuid,uuid,bigint,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.preview_add_club_member(uuid,uuid,bigint,text,jsonb) TO authenticated;
COMMIT;
