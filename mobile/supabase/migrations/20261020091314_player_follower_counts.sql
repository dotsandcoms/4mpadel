begin;

create index if not exists local_player_follows_player_id_idx
  on public.local_player_follows (player_id);

-- Only approved-player totals leave this unexposed schema. The owner-rights
-- aggregate deliberately counts across follow RLS without returning identities.
create schema profile_social;
revoke all on schema profile_social from public;
grant usage on schema profile_social to anon, authenticated, service_role;

create view profile_social.player_follower_counts with (security_barrier = true) as
  select f.player_id, count(*)::bigint as follower_count
  from public.local_player_follows f
  join public.players p on p.id = f.player_id and p.approved = true
  group by f.player_id;
revoke all on profile_social.player_follower_counts from public, anon, authenticated;
grant select on profile_social.player_follower_counts to anon, authenticated, service_role;

create function public.get_player_follower_count(p_player_id bigint)
returns bigint language sql stable security invoker set search_path = '' as $$
  select coalesce((select follower_count from profile_social.player_follower_counts
    where player_id = p_player_id), 0::bigint)
$$;
revoke all on function public.get_player_follower_count(bigint) from public;
grant execute on function public.get_player_follower_count(bigint) to anon, authenticated, service_role;

commit;
