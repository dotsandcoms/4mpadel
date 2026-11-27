create schema live_scores;
revoke all on schema live_scores from public, anon, authenticated, service_role;

create table live_scores.pins (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  installation_id uuid not null unique,
  match_id integer not null check (match_id > 0),
  platform text not null check (platform in ('ios', 'android')),
  stop_hash text not null check (stop_hash ~ '^[0-9a-f]{64}$'),
  teams jsonb not null check (jsonb_typeof(teams) = 'array' and jsonb_array_length(teams) = 2),
  token text check (length(token) between 20 and 4096),
  expires_at timestamptz not null default now() + interval '8 hours',
  next_attempt_at timestamptz not null default now(),
  lease uuid,
  last_score jsonb,
  last_sent_at timestamptz
);
alter table live_scores.pins enable row level security;
revoke all on live_scores.pins from public, anon, authenticated, service_role;
create index live_score_pins_due on live_scores.pins(next_attempt_at) where token is not null;

create function public.pro_live_score_admin(p_action text, p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  pin uuid := (p_data->>'pin')::uuid;
  owner uuid := (p_data->>'owner')::uuid;
  installation uuid := (p_data->>'installation')::uuid;
  claim uuid := (p_data->>'lease')::uuid;
  affected integer;
  result jsonb;
begin
  case p_action
    when 'start' then
      insert into live_scores.pins(id, owner_id, installation_id, match_id, platform, stop_hash, teams)
      values(pin, owner, installation, (p_data->>'match')::integer, p_data->>'platform', p_data->>'stopHash', p_data->'teams')
      on conflict (installation_id) do update
        set id=excluded.id, owner_id=excluded.owner_id, match_id=excluded.match_id, platform=excluded.platform,
          stop_hash=excluded.stop_hash, teams=excluded.teams, token=null, expires_at=excluded.expires_at,
          next_attempt_at=excluded.next_attempt_at, lease=null, last_score=null, last_sent_at=null
        where pins.owner_id=excluded.owner_id and pins.id is distinct from excluded.id;
      -- A repeat of the same start resumes token registration without resetting delivery state.
      return to_jsonb(exists(select 1 from live_scores.pins p where p.id=pin and p.owner_id=owner and p.installation_id=installation));
    when 'token' then
      update live_scores.pins p set token=p_data->>'token',
        next_attempt_at=case when p.token is distinct from p_data->>'token' then now() else p.next_attempt_at end,
        lease=case when p.token is distinct from p_data->>'token' then null else p.lease end,
        last_score=case when p.token is distinct from p_data->>'token' then null else p.last_score end
      where p.id=pin and p.owner_id=owner and p.installation_id=installation and p.expires_at>now();
    when 'stop' then
      delete from live_scores.pins p where p.id=pin and p.owner_id=owner and p.installation_id=installation;
    when 'revoke' then
      delete from live_scores.pins p where p.id=pin and p.stop_hash=p_data->>'stopHash';
    when 'claim' then
      delete from live_scores.pins where expires_at<=now();
      with due as (
        select p.id from live_scores.pins p
        where p.token is not null and p.next_attempt_at<=now()
        order by p.next_attempt_at, p.id limit 120 for update skip locked
      ), claimed as (
        update live_scores.pins p set next_attempt_at=now()+interval '55 seconds', lease=gen_random_uuid()
        from due where p.id=due.id returning p.*
      )
      select coalesce(jsonb_agg(jsonb_build_object(
        'pin',id,'match',match_id,'platform',platform,'token',token,'teams',teams,'lease',lease,
        'lastScore',last_score,'lastSentAt',last_sent_at
      )),'[]'::jsonb) into result from claimed;
      return result;
    when 'current' then
      return to_jsonb(exists(select 1 from live_scores.pins p where p.id=pin and p.lease=claim and p.expires_at>now()));
    when 'sent' then
      update live_scores.pins p set last_score=p_data->'score', last_sent_at=now(), lease=null
      where p.id=pin and p.lease=claim;
    when 'finish' then
      delete from live_scores.pins p where p.id=pin and p.lease=claim;
    else raise exception 'Invalid live score operation';
  end case;
  get diagnostics affected = row_count;
  return to_jsonb(affected > 0);
end;
$$;
revoke all on function public.pro_live_score_admin(text,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.pro_live_score_admin(text,jsonb) to service_role;
