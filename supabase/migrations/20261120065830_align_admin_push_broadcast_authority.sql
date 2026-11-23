BEGIN;

-- All broadcast RPCs use this private guard, including the resolver shared by
-- preview and send. Keep their signatures, delivery behavior and grants.
CREATE OR REPLACE FUNCTION private.require_broadcast_admin() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  address text := nullif(lower(btrim(auth.jwt()->>'email')), '');
  grant_count bigint;
  broadcast_grant boolean;
  player_count bigint;
  actor_player_id bigint;
BEGIN
  IF address IS NULL OR NOT coalesce(private.permission_actor_active(), false) THEN
    RAISE EXCEPTION 'Sign in to manage broadcasts' USING ERRCODE = '42501';
  END IF;
  IF public.is_super_admin(address) THEN
    RETURN;
  END IF;

  SELECT count(*), bool_or('email-broadcast' = ANY(grant_row.allowed_tabs))
    INTO grant_count, broadcast_grant
  FROM public.admin_sidebar_permissions grant_row
  WHERE lower(btrim(grant_row.email)) = address;

  IF grant_count <> 1 OR broadcast_grant IS DISTINCT FROM true
    OR EXISTS (SELECT 1 FROM public.organisation_members member WHERE lower(btrim(member.user_email)) = address)
    OR EXISTS (SELECT 1 FROM public.club_members member WHERE lower(btrim(member.user_email)) = address)
    OR EXISTS (SELECT 1 FROM public.federation_members member WHERE lower(btrim(member.user_email)) = address) THEN
    RAISE EXCEPTION 'Broadcast permission required' USING ERRCODE = '42501';
  END IF;

  SELECT count(*), min(player.id) INTO player_count, actor_player_id
  FROM public.players player
  WHERE lower(btrim(player.email)) = address;

  IF player_count > 1 OR EXISTS (
    SELECT 1 FROM public.organisations organisation
    WHERE organisation.created_by = actor_player_id AND organisation.status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Broadcast permission required' USING ERRCODE = '42501';
  END IF;
END $$;

COMMIT;
