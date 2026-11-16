begin;

-- Follow records keep their owner-only RLS. Resolve only the public profile
-- fields needed by this directory, after checking the viewer and target.
create function profile_social.get_player_followers(
  p_player_id bigint, p_limit integer default 50, p_offset integer default 0
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  viewer_id uuid := auth.uid();
  target_email text;
  target_approved boolean;
  target_accounts uuid[];
begin
  if not private.permission_actor_active() or not exists (
    select 1 from auth.users u where u.id=viewer_id and u.email_confirmed_at is not null
  ) then
    raise exception 'Sign in to view followers.' using errcode='42501';
  end if;
  if p_player_id is null or p_player_id<1 or p_limit is null or p_limit<1 or p_limit>50
    or p_offset is null or p_offset<0 then
    raise exception 'Invalid follower page.' using errcode='22023';
  end if;

  select lower(trim(p.email)),p.approved into target_email,target_approved
    from public.players p where p.id=p_player_id;
  if not found or (not coalesce(target_approved,false)
    and target_email is distinct from lower(trim(auth.email()))) then
    raise exception 'Followers are unavailable for this player.' using errcode='42501';
  end if;
  select coalesce(array_agg(u.id),'{}'::uuid[]) into target_accounts
    from auth.users u where lower(trim(u.email))=target_email;
  if exists(select 1 from auth.users u where u.id=any(target_accounts)
    and (u.deleted_at is not null or u.banned_until>now() or coalesce(u.is_anonymous,false)))
    or exists(select 1 from messaging.blocks b where
      (b.user_id=viewer_id and b.blocked_id=any(target_accounts))
      or (b.blocked_id=viewer_id and b.user_id=any(target_accounts))) then
    raise exception 'Followers are unavailable for this player.' using errcode='42501';
  end if;

  return (
    with candidates as materialized (
      select f.user_id,f.created_at,profile.id,profile.name,profile.image_url,profile.home_club
      from public.local_player_follows f
      join auth.users follower on follower.id=f.user_id
        and follower.email_confirmed_at is not null and follower.deleted_at is null
        and (follower.banned_until is null or follower.banned_until<now())
        and not coalesce(follower.is_anonymous,false)
      join lateral (
        select published.id,published.name,published.image_url,published.home_club
        from public.players account
        join public.players_public published on published.id=account.id and published.approved=true
        where lower(trim(account.email))=lower(trim(follower.email))
        order by published.id limit 1
      ) profile on true
      where f.player_id=p_player_id
        and not exists(select 1 from messaging.blocks b where
          (b.user_id=viewer_id and b.blocked_id=f.user_id)
          or (b.blocked_id=viewer_id and b.user_id=f.user_id)
          or (b.user_id=any(target_accounts) and b.blocked_id=f.user_id)
          or (b.blocked_id=any(target_accounts) and b.user_id=f.user_id))
      order by f.created_at desc,f.user_id desc
      offset p_offset limit p_limit+1
    ), page as (
      select * from candidates order by created_at desc,user_id desc limit p_limit
    )
    select jsonb_build_object(
      'followers',coalesce((select jsonb_agg(jsonb_build_object(
        'id',id::text,'name',coalesce(nullif(trim(name),''),'Player'),
        'image_url',image_url,'home_club',home_club
      ) order by created_at desc,user_id desc) from page),'[]'::jsonb),
      'has_more',(select count(*)>p_limit from candidates),
      -- Aggregate totals were already public; hidden profiles remain unnamed.
      'total',(select count(*) from public.local_player_follows where player_id=p_player_id)
    )
  );
end;
$$;
revoke all on function profile_social.get_player_followers(bigint,integer,integer) from public,anon,authenticated,service_role;
grant execute on function profile_social.get_player_followers(bigint,integer,integer) to authenticated;

create function public.get_player_followers(
  p_player_id bigint, p_limit integer default 50, p_offset integer default 0
)
returns jsonb language sql stable security invoker set search_path='' as $$
  select profile_social.get_player_followers(p_player_id,p_limit,p_offset)
$$;
revoke all on function public.get_player_followers(bigint,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.get_player_followers(bigint,integer,integer) to authenticated;

-- Older installed apps keep the own-list endpoint and its ownership boundary,
-- while using the same active-session, visibility and blocking checks.
create or replace function profile_social.get_my_player_followers(
  p_player_id bigint, p_limit integer default 50, p_offset integer default 0
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.players p
    where p.id=p_player_id and lower(trim(p.email))=lower(trim(auth.email()))) then
    raise exception 'You can only view your own followers.' using errcode='42501';
  end if;
  return profile_social.get_player_followers(p_player_id,p_limit,p_offset);
end;
$$;

notify pgrst,'reload schema';
commit;
