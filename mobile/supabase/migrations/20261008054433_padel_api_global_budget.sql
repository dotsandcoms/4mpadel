-- One provider budget for mobile, web, cron and Following. All access is service-only.
alter table public.padel_api_cache add column fetched_at timestamptz not null default now();
create table public.padel_api_control (
 provider text primary key check(provider='padel'),
 minute_limit integer not null default 45 check(minute_limit between 1 and 60),
 day_limit integer not null default 1400 check(day_limit between 1 and 3500),
 month_limit integer not null default 42000 check(month_limit between 1 and 45000),
 observed_limit integer, observed_remaining integer, observed_at timestamptz
);
insert into public.padel_api_control(provider) values('padel');
create table public.padel_api_requests (
 id bigint generated always as identity primary key, resource_key text not null,
 requested_at timestamptz not null default clock_timestamp(), status integer
);
create index padel_api_requests_time on public.padel_api_requests(requested_at);
create table public.padel_api_leases (
 resource_key text primary key, lease_id uuid not null, lease_until timestamptz not null
);
create table public.padel_api_players (id integer primary key, payload jsonb not null, updated_at timestamptz not null default now());
alter table public.padel_api_control enable row level security;
alter table public.padel_api_requests enable row level security;
alter table public.padel_api_leases enable row level security;
alter table public.padel_api_players enable row level security;
revoke all on public.padel_api_control,public.padel_api_requests,public.padel_api_leases,public.padel_api_players from public,anon,authenticated;
grant all on public.padel_api_control,public.padel_api_requests,public.padel_api_leases,public.padel_api_players to service_role;
grant usage on sequence public.padel_api_requests_id_seq to service_role;

create or replace function public.cached_padel_response(p_key text) returns jsonb
language sql stable security definer set search_path=public as $$
 select jsonb_build_object('payload',payload,'fetched_at',fetched_at) from padel_api_cache where resource_key=p_key and expires_at>now()
$$;

create or replace function public.save_padel_response(p_key text,p_payload jsonb,p_seconds integer) returns void
language plpgsql security definer set search_path=public as $$
declare person jsonb;
begin
 if p_key not like 'https://padelapi.org/api/%' or length(p_key)>4000 or p_seconds not between 1 and 604800
  or p_payload is null or pg_column_size(p_payload)>2097152 or jsonb_typeof(p_payload) not in ('array','object') then raise exception 'Invalid provider cache entry'; end if;
 insert into padel_api_cache(resource_key,payload,expires_at,fetched_at) values(p_key,p_payload,now()+make_interval(secs=>p_seconds),now())
 on conflict(resource_key) do update set payload=excluded.payload,expires_at=excluded.expires_at,fetched_at=excluded.fetched_at;
 if p_key ~ '^https://padelapi.org/api/players([/?]|$)' then
  for person in select value from jsonb_array_elements(case when jsonb_typeof(p_payload->'data')='array' then p_payload->'data' else jsonb_build_array(p_payload) end) loop
   if person->>'id' ~ '^[1-9][0-9]{0,8}$' and person->>'name' is not null then
    insert into padel_api_players(id,payload) values((person->>'id')::integer,person)
    on conflict(id) do update set payload=excluded.payload,updated_at=now();
   end if;
  end loop;
 end if;
 delete from padel_api_cache where fetched_at<now()-interval '30 days' and expires_at<now();
end $$;

create function public.cached_padel_players(p_ids integer[]) returns jsonb
language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(payload),'[]'::jsonb) from padel_api_players where id=any(p_ids[1:2000])
$$;

create function public.stale_padel_response(p_key text) returns jsonb
language sql stable security definer set search_path=public as $$
 select jsonb_build_object('payload',payload,'fetched_at',fetched_at) from padel_api_cache where resource_key=p_key and fetched_at>now()-interval '7 days'
$$;
revoke all on function public.stale_padel_response(text) from public,anon,authenticated;
grant execute on function public.stale_padel_response(text) to service_role;

create function public.claim_padel_request(p_key text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare hit padel_api_cache; control padel_api_control; retry_at timestamptz; lease uuid; req bigint; reason text;
declare minute_calls integer; day_calls integer; month_calls integer; stamp timestamptz:=clock_timestamp();
begin
 if p_key not like 'https://padelapi.org/api/%' or length(p_key)>4000 then raise exception 'Invalid provider resource'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_key,8317));
 select * into hit from padel_api_cache where resource_key=p_key;
 if hit.expires_at>stamp then return jsonb_build_object('action','cached','payload',hit.payload,'fetched_at',hit.fetched_at); end if;
 select * into control from padel_api_control where provider='padel' for update;
 select public.padel_api_retry_at() into retry_at;
 if retry_at is not null then reason:='provider_pause';
 elsif exists(select 1 from padel_api_leases where resource_key=p_key and lease_until>stamp) then reason:='refreshing'; retry_at:=stamp+interval '1 second';
 else
  select count(*) filter(where requested_at>stamp-interval '1 minute'),count(*) filter(where requested_at>stamp-interval '24 hours'),count(*)
   into minute_calls,day_calls,month_calls from padel_api_requests where requested_at>stamp-interval '30 days';
  if minute_calls>=control.minute_limit then reason:='minute_budget'; select min(requested_at)+interval '1 minute' into retry_at from padel_api_requests where requested_at>stamp-interval '1 minute';
  elsif day_calls>=control.day_limit then reason:='day_budget'; select min(requested_at)+interval '24 hours' into retry_at from padel_api_requests where requested_at>stamp-interval '24 hours';
  elsif month_calls>=control.month_limit then reason:='month_budget'; select min(requested_at)+interval '30 days' into retry_at from padel_api_requests where requested_at>stamp-interval '30 days'; end if;
 end if;
 if reason is not null then
  return jsonb_build_object('action',case when hit.fetched_at>stamp-interval '7 days' then 'stale' else case when reason='refreshing' then 'wait' else 'paused' end end,
   'payload',case when hit.fetched_at>stamp-interval '7 days' then hit.payload else null end,'fetched_at',hit.fetched_at,'reason',reason,'retry_at',retry_at);
 end if;
 lease:=gen_random_uuid();
 insert into padel_api_leases values(p_key,lease,stamp+interval '30 seconds') on conflict(resource_key) do update set lease_id=excluded.lease_id,lease_until=excluded.lease_until;
 insert into padel_api_requests(resource_key,requested_at) values(p_key,stamp) returning id into req;
 delete from padel_api_requests where requested_at<stamp-interval '31 days';
 return jsonb_build_object('action','fetch','lease_id',lease,'request_id',req);
end $$;

create function public.finish_padel_request(p_key text,p_lease uuid,p_request bigint,p_status integer,p_limit integer default null,p_remaining integer default null) returns void
language plpgsql security definer set search_path=public as $$
begin
 delete from padel_api_leases where resource_key=p_key and lease_id=p_lease;
 update padel_api_requests set status=p_status where id=p_request and resource_key=p_key;
 update padel_api_control set observed_limit=p_limit,observed_remaining=p_remaining,observed_at=now() where provider='padel';
end $$;

revoke all on function public.claim_padel_request(text),public.finish_padel_request(text,uuid,bigint,integer,integer,integer),public.cached_padel_players(integer[]) from public,anon,authenticated;
grant execute on function public.claim_padel_request(text),public.finish_padel_request(text,uuid,bigint,integer,integer,integer),public.cached_padel_players(integer[]) to service_role;
