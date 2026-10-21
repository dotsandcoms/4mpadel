begin;

-- Follow rows remain owner-only under RLS. Only the followed player may resolve
-- their incoming follows into approved public profiles through this helper.
create function profile_social.get_my_player_followers(
  p_player_id bigint, p_limit integer default 50, p_offset integer default 0
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  result jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.players owner
    join auth.users viewer on viewer.id = auth.uid()
      and viewer.email_confirmed_at is not null
      and lower(trim(viewer.email)) = lower(trim(owner.email))
    where owner.id = p_player_id
  ) then
    raise exception 'You can only view your own followers.' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 50
    or p_offset is null or p_offset < 0 then
    raise exception 'Invalid follower page.' using errcode = '22023';
  end if;

  with profiles as materialized (
    select f.user_id, f.created_at, profile.id, profile.name,
      profile.image_url, profile.home_club
    from public.local_player_follows f
    join auth.users follower on follower.id = f.user_id
    join lateral (
      select published.id, published.name, published.image_url, published.home_club
      from public.players account
      join public.players_public published on published.id = account.id
        and published.approved = true
      where lower(trim(account.email)) = lower(trim(follower.email))
      order by published.id limit 1
    ) profile on true
    where f.player_id = p_player_id
    order by f.created_at desc, f.user_id desc
    offset p_offset limit p_limit + 1
  ), page as (
    select * from profiles order by created_at desc, user_id desc limit p_limit
  )
  select jsonb_build_object(
    'followers', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id::text, 'name', coalesce(nullif(trim(name), ''), 'Player'), 'image_url', image_url, 'home_club', home_club
    ) order by created_at desc, user_id desc) from page), '[]'::jsonb),
    'has_more', (select count(*) > p_limit from profiles),
    'total', (select count(*) from public.local_player_follows where player_id = p_player_id)
  ) into result;
  return result;
end;
$$;
revoke all on function profile_social.get_my_player_followers(bigint, integer, integer) from public, anon, authenticated;
grant execute on function profile_social.get_my_player_followers(bigint, integer, integer) to authenticated;

-- The Data API exposes only this invoker wrapper, never the privileged helper.
create function public.get_my_player_followers(
  p_player_id bigint, p_limit integer default 50, p_offset integer default 0
)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select profile_social.get_my_player_followers(p_player_id, p_limit, p_offset)
$$;
revoke all on function public.get_my_player_followers(bigint, integer, integer) from public, anon, authenticated;
grant execute on function public.get_my_player_followers(bigint, integer, integer) to authenticated;

commit;
