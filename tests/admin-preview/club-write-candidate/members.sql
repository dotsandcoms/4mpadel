-- STAGING CANDIDATE ONLY. Requires club_preview_private schema bootstrap.
-- No invitations, new memberships, email or changes to legacy policies.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE club_preview_private.member_operations (
  operation_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  club_id uuid NOT NULL,
  member_id uuid NOT NULL,
  action text NOT NULL CHECK(action IN ('change_role','remove')),
  requested_role text,
  expected_member jsonb NOT NULL,
  result jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE club_preview_private.member_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON club_preview_private.member_operations FROM PUBLIC,anon,authenticated;
CREATE FUNCTION club_preview_private.manage_club_member(p_operation_id uuid,p_club_id uuid,p_member_id uuid,p_action text,p_role text,p_expected_member jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid:=auth.uid(); actor_email text; permission_role text;
  member public.club_members%ROWTYPE; saved club_preview_private.member_operations%ROWTYPE;
  snapshot jsonb; result jsonb; keys text[]; owner_count bigint;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
  SELECT email INTO actor_email FROM auth.users WHERE id=actor FOR SHARE;
  IF actor_email IS NULL THEN RAISE EXCEPTION 'Account unavailable' USING ERRCODE='42501'; END IF;
  BEGIN
    SELECT role INTO STRICT permission_role FROM public.admin_sidebar_permissions WHERE lower(email)=lower(actor_email) FOR SHARE;
  EXCEPTION WHEN no_data_found OR too_many_rows THEN RAISE EXCEPTION 'Platform access required' USING ERRCODE='42501'; END;
  IF permission_role IS DISTINCT FROM 'super_admin' THEN RAISE EXCEPTION 'Platform access required' USING ERRCODE='42501'; END IF;
  IF p_operation_id IS NULL OR p_club_id IS NULL OR p_member_id IS NULL OR p_action IS NULL OR p_action NOT IN ('change_role','remove')
    OR (p_action='change_role' AND (p_role IS NULL OR p_role NOT IN ('owner','admin','staff')))
    OR (p_action='remove' AND p_role IS NOT NULL) OR jsonb_typeof(p_expected_member) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid membership action' USING ERRCODE='22023'; END IF;
  SELECT array_agg(key ORDER BY key) INTO keys FROM jsonb_object_keys(p_expected_member) key;
  IF keys IS DISTINCT FROM ARRAY['club_id','created_at','id','player_id','role','user_email']::text[]
    OR p_expected_member->>'id' IS DISTINCT FROM p_member_id::text
    OR p_expected_member->>'club_id' IS DISTINCT FROM p_club_id::text THEN
    RAISE EXCEPTION 'Complete original membership snapshot required' USING ERRCODE='22023'; END IF;
  -- Serialize identical operation UUIDs even if a caller changes the club ID.
  PERFORM pg_advisory_xact_lock(hashtextextended('club-member-operation:'||p_operation_id::text,0));
  SELECT * INTO saved FROM club_preview_private.member_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF saved.actor_id IS DISTINCT FROM actor OR saved.club_id IS DISTINCT FROM p_club_id OR saved.member_id IS DISTINCT FROM p_member_id
      OR saved.action IS DISTINCT FROM p_action OR saved.requested_role IS DISTINCT FROM p_role OR saved.expected_member IS DISTINCT FROM p_expected_member THEN
      RAISE EXCEPTION 'Operation ID already used for another action' USING ERRCODE='40001'; END IF;
    RETURN saved.result||jsonb_build_object('already_applied',true);
  END IF;
  -- All calls in this workflow lock the club before any membership row.
  PERFORM id FROM public.clubs WHERE id=p_club_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Club unavailable' USING ERRCODE='P0002'; END IF;
  SELECT * INTO member FROM public.club_members WHERE id=p_member_id AND club_id=p_club_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Membership unavailable; reload before continuing' USING ERRCODE='40001'; END IF;
  snapshot:=jsonb_build_object('id',member.id,'club_id',member.club_id,'player_id',member.player_id,'user_email',member.user_email,'role',member.role);
  IF snapshot IS DISTINCT FROM (p_expected_member-'created_at') OR member.created_at IS DISTINCT FROM (p_expected_member->>'created_at')::timestamptz THEN
    RAISE EXCEPTION 'Membership changed; reload before continuing' USING ERRCODE='40001'; END IF;
  -- Preserve legacy permission to remove/demote the last owner. Return the
  -- resulting count, rather than silently introducing a new business rule.
  IF p_action='remove' THEN DELETE FROM public.club_members WHERE id=p_member_id AND club_id=p_club_id;
  ELSE UPDATE public.club_members SET role=p_role WHERE id=p_member_id AND club_id=p_club_id RETURNING * INTO member; END IF;
  SELECT count(*) INTO owner_count FROM public.club_members WHERE club_id=p_club_id AND role='owner';
  result:=jsonb_build_object('operation_id',p_operation_id,'club_id',p_club_id,'member_id',p_member_id,'action',p_action,'role',p_role,'owner_count',owner_count,'no_owner',owner_count=0,
    'removed',p_action='remove','member',CASE WHEN p_action='remove' THEN NULL ELSE to_jsonb(member) END,'already_applied',false);
  INSERT INTO club_preview_private.member_operations(operation_id,actor_id,club_id,member_id,action,requested_role,expected_member,result)
    VALUES(p_operation_id,actor,p_club_id,p_member_id,p_action,p_role,p_expected_member,result);
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION club_preview_private.manage_club_member(uuid,uuid,uuid,text,text,jsonb) FROM PUBLIC,anon;
GRANT USAGE ON SCHEMA club_preview_private TO authenticated;
GRANT EXECUTE ON FUNCTION club_preview_private.manage_club_member(uuid,uuid,uuid,text,text,jsonb) TO authenticated;
CREATE FUNCTION public.preview_manage_club_member(p_operation_id uuid,p_club_id uuid,p_member_id uuid,p_action text,p_role text,p_expected_member jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog AS $$
  SELECT club_preview_private.manage_club_member(p_operation_id,p_club_id,p_member_id,p_action,p_role,p_expected_member);
$$;
REVOKE ALL ON FUNCTION public.preview_manage_club_member(uuid,uuid,uuid,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.preview_manage_club_member(uuid,uuid,uuid,text,text,jsonb) TO authenticated;
COMMIT;
