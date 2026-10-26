-- Rollback-only checks: cross-user totals, guest access and follow privacy.
begin;
do $$
declare
  target bigint;
  hidden bigint;
  empty_player bigint;
  followers uuid[];
begin
  select id into target from public.players where approved = true order by id limit 1;
  select id into hidden from public.players where approved is distinct from true order by id limit 1;
  select p.id into empty_player from public.players p where p.approved = true
    and p.id <> target and not exists (select 1 from public.local_player_follows f where f.player_id = p.id)
    order by p.id limit 1;
  select array_agg(id) into followers from (select id from auth.users order by id limit 2) u;
  assert target is not null and hidden is not null and empty_player is not null and cardinality(followers) = 2,
    'Follower checks need approved/hidden players and two test users';

  insert into public.local_player_follows (user_id, player_id)
    select id, target from unnest(followers) id on conflict do nothing;
  insert into public.local_player_follows (user_id, player_id) values (followers[1], hidden) on conflict do nothing;
  perform set_config('test.followed_player', target::text, true);
  perform set_config('test.hidden_player', hidden::text, true);
  perform set_config('test.empty_player', empty_player::text, true);
  perform set_config('test.expected_followers', (select count(*)::text from public.local_player_follows where player_id = target), true);
  perform set_config('test.follower_user', followers[1]::text, true);
  perform set_config('request.jwt.claims', '{}', true);
end;
$$;

set local role anon;
do $$
begin
  assert public.get_player_follower_count(current_setting('test.followed_player')::bigint)
    = current_setting('test.expected_followers')::bigint, 'Guests must see all followers';
  assert public.get_player_follower_count(current_setting('test.empty_player')::bigint) = 0;
  assert public.get_player_follower_count(current_setting('test.hidden_player')::bigint) = 0, 'Hidden profiles must not expose totals';
  assert public.get_player_follower_count(-1) = 0;
  begin
    perform user_id from public.local_player_follows limit 1;
    raise exception 'Guests must not read follower identities';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

do $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('test.follower_user'), 'role', 'authenticated')::text, true);
end;
$$;
set local role authenticated;
do $$
declare target bigint := current_setting('test.followed_player')::bigint;
begin
  assert (select count(*) from public.local_player_follows where player_id = target) = 1,
    'Raw follow rows must remain restricted to the current user';
  assert public.get_player_follower_count(target) = current_setting('test.expected_followers')::bigint;
  delete from public.local_player_follows where user_id = auth.uid() and player_id = target;
  assert public.get_player_follower_count(target) = current_setting('test.expected_followers')::bigint - 1,
    'Unfollowing must immediately decrease the count';
  insert into public.local_player_follows (user_id, player_id) values (auth.uid(), target);
  assert public.get_player_follower_count(target) = current_setting('test.expected_followers')::bigint,
    'Following must immediately increase the count';
end;
$$;
reset role;
rollback;
