-- All fixture changes roll back. No private follower account fields leave the RPC.
begin;
do $$
declare
  target bigint;
  owner_id uuid;
  followers uuid[];
begin
  select p.id, u.id into target, owner_id
  from public.players p join auth.users u on lower(trim(u.email)) = lower(trim(p.email))
  where p.approved = true and u.email_confirmed_at is not null order by p.id limit 1;
  select array_agg(id order by id) into followers from (
    select distinct u.id from auth.users u join public.players p
      on lower(trim(p.email)) = lower(trim(u.email)) and p.approved = true
    where u.id <> owner_id order by u.id limit 2
  ) candidates;
  assert target is not null and cardinality(followers) = 2, 'Need three linked test accounts';
  perform set_config('test.followed_player', target::text, true);
  perform set_config('test.owner_id', owner_id::text, true);
  perform set_config('test.other_user', followers[1]::text, true);
  perform set_config('test.hidden_follower', followers[2]::text, true);
  delete from public.local_player_follows where player_id = target;
  insert into public.local_player_follows(user_id, player_id, created_at)
  values (followers[1], target, now()), (followers[2], target, now() - interval '1 minute');
  perform set_config('request.jwt.claims', jsonb_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
end;
$$;
set local role authenticated;
do $$
declare
  target bigint := current_setting('test.followed_player')::bigint;
  page jsonb;
begin
  page := public.get_my_player_followers(target, 1, 0);
  assert (page->>'total')::int = 2 and (page->>'has_more')::boolean;
  assert jsonb_array_length(page->'followers') = 1;
  assert (page->'followers'->0->>'id') is not null;
  assert (page->'followers'->0->>'name') is not null;
  assert not exists (select 1 from jsonb_object_keys(page->'followers'->0) k
    where k not in ('id', 'name', 'image_url', 'home_club')), 'No email or auth IDs may be returned';
  assert (select count(*) from public.local_player_follows where player_id = target) = 0,
    'Raw follow identities must keep their original RLS';
  page := public.get_my_player_followers(target, 1, 1);
  assert jsonb_array_length(page->'followers') = 1 and not (page->>'has_more')::boolean;
  assert (page->'followers'->0->>'id') <> (public.get_my_player_followers(target, 1, 0)->'followers'->0->>'id');
  assert jsonb_array_length(public.get_my_player_followers(target, 50, 5)->'followers') = 0;
  begin
    perform public.get_my_player_followers(target, 51, 0);
    raise exception 'Oversized pages must fail';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.get_my_player_followers(target, 1, -1);
    raise exception 'Negative offsets must fail';
  exception when invalid_parameter_value then null;
  end;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('test.other_user'), 'role', 'authenticated')::text, true);
  begin
    perform public.get_my_player_followers(target);
    raise exception 'Another account must not see this list';
  exception when insufficient_privilege then null;
  end;
  -- This also checks the private helper if called directly through SQL.
  begin
    perform profile_social.get_my_player_followers(target);
    raise exception 'Calling the helper directly must not bypass ownership';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
do $$
begin
  update public.players set approved = false where lower(trim(email)) =
    (select lower(trim(email)) from auth.users where id = current_setting('test.hidden_follower')::uuid);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('test.owner_id'), 'role', 'authenticated')::text, true);
end;
$$;
set local role authenticated;
do $$
declare page jsonb;
begin
  page := public.get_my_player_followers(current_setting('test.followed_player')::bigint);
  assert (page->>'total')::int = 2 and jsonb_array_length(page->'followers') = 1,
    'Hidden identities stay private without changing the follower total';
end;
$$;
reset role;
set local role anon;
do $$
begin
  begin
    perform public.get_my_player_followers(current_setting('test.followed_player')::bigint);
    raise exception 'Guests cannot list follower identities';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
rollback;
