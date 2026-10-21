-- Shared upstream backoff is service-only. No provider credentials or user data are stored.
create table public.padel_api_backoff (
  provider text primary key check (provider='padel'),
  retry_until timestamptz not null
);
alter table public.padel_api_backoff enable row level security;
revoke all on public.padel_api_backoff from public,anon,authenticated;
grant all on public.padel_api_backoff to service_role;

create function public.padel_api_retry_at() returns timestamptz
language sql stable security definer set search_path=public as $$
  select retry_until from padel_api_backoff where provider='padel' and retry_until>now()
$$;
revoke all on function public.padel_api_retry_at() from public,anon,authenticated;
grant execute on function public.padel_api_retry_at() to service_role;

create function public.pause_padel_api(p_until timestamptz) returns void
language plpgsql security definer set search_path=public as $$
begin
  if p_until is null or p_until>now()+interval '32 days' then raise exception 'Invalid provider retry time'; end if;
  insert into padel_api_backoff(provider,retry_until) values ('padel',greatest(now(),p_until))
    on conflict(provider) do update set retry_until=greatest(padel_api_backoff.retry_until,excluded.retry_until);
end $$;
revoke all on function public.pause_padel_api(timestamptz) from public,anon,authenticated;
grant execute on function public.pause_padel_api(timestamptz) to service_role;

-- Share successful public GET data across users, edge isolates and scheduled workers.
create table public.padel_api_cache (
  resource_key text primary key,
  payload jsonb not null,
  expires_at timestamptz not null
);
create index padel_api_cache_expiry on public.padel_api_cache(expires_at);
alter table public.padel_api_cache enable row level security;
revoke all on public.padel_api_cache from public,anon,authenticated;
grant all on public.padel_api_cache to service_role;

create function public.cached_padel_response(p_key text) returns jsonb
language sql stable security definer set search_path=public as $$
  select jsonb_build_object('payload',payload) from padel_api_cache
    where resource_key=p_key and expires_at>now()
$$;
revoke all on function public.cached_padel_response(text) from public,anon,authenticated;
grant execute on function public.cached_padel_response(text) to service_role;

create function public.save_padel_response(p_key text,p_payload jsonb,p_seconds integer) returns void
language plpgsql security definer set search_path=public as $$
begin
  if p_key not like 'https://padelapi.org/api/%' or length(p_key)>4000
    or p_seconds not between 1 and 86400 or p_payload is null or pg_column_size(p_payload)>2097152
    or jsonb_typeof(p_payload) not in ('array','object') then raise exception 'Invalid provider cache entry'; end if;
  insert into padel_api_cache(resource_key,payload,expires_at) values(p_key,p_payload,now()+make_interval(secs=>p_seconds))
    on conflict(resource_key) do update set payload=excluded.payload,expires_at=excluded.expires_at;
  delete from padel_api_cache where expires_at<now()-interval '1 day';
end $$;
revoke all on function public.save_padel_response(text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.save_padel_response(text,jsonb,integer) to service_role;

create or replace function public.claim_following_sources(p_limit integer default 6) returns jsonb
language plpgsql security definer set search_path=public as $$
declare item record; result jsonb:='[]'; lease uuid;
begin
  if p_limit not between 1 and 12 then raise exception 'Invalid batch size'; end if;
  for item in
    with targets as (
      select distinct 'local:'||p.id source_key,'local' source,p.id::text target_id,p.rankedin_id,p.name,p.image_url photo_url,interval '15 minutes' refresh
        from local_player_follows f join players p on p.id=f.player_id and p.approved=true where nullif(p.rankedin_id,'') is not null
      union all
      select distinct 'pro_player:'||f.player_id,'pro_player',f.player_id::text,null,f.player_name,null,interval '6 hours' from pro_player_follows f
      union all
      select distinct 'pro_match:'||b.match_id,'pro_match',b.match_id::text,null,null,null,interval '15 minutes'
        from pro_match_bookmarks b where b.bookmarked and b.expires_at>now()
    ) select t.*,s.snapshot from targets t left join following_sync_state s using(source_key)
      where (t.source='local' or public.padel_api_retry_at() is null) and (s.checked_at is null or s.checked_at<now()-t.refresh) and (s.lease_until is null or s.lease_until<now())
      order by s.checked_at nulls first,t.source_key limit p_limit
  loop
    lease:=gen_random_uuid();
    insert into following_sync_state(source_key,lease_id,lease_until) values(item.source_key,lease,now()+interval '3 minutes')
    on conflict(source_key) do update set lease_id=excluded.lease_id,lease_until=excluded.lease_until
      where following_sync_state.lease_until is null or following_sync_state.lease_until<now();
    if found then result:=result||jsonb_build_array(to_jsonb(item)||jsonb_build_object('lease_id',lease)); end if;
  end loop;
  return result;
end $$;
revoke all on function public.claim_following_sources(integer) from public,anon,authenticated;
grant execute on function public.claim_following_sources(integer) to service_role;

