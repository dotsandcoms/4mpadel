create schema if not exists private;

create table private.rankedin_history_jobs (
  job_key text primary key,
  kind text not null check (kind in (
    'catalogue','player','participation','player_matches','player_rankings','points',
    'tournament','tournament_roster','tournament_results','tournament_matches',
    'tournament_team_matches','teamleague','teamleague_pool','teamleague_matches','clubleague'
  )),
  args jsonb not null check (jsonb_typeof(args)='object'),
  cursor_data jsonb not null default '{}',
  next_attempt_at timestamptz not null default now(),
  completed_at timestamptz,
  lease_id uuid,
  lease_until timestamptz,
  attempts integer not null default 0,
  issue text,
  enabled boolean not null default true
);
create index rankedin_history_due_jobs on private.rankedin_history_jobs (next_attempt_at, job_key)
  where enabled;

create table private.rankedin_history_records (
  kind text not null check (kind in ('player','event','participation','division','entry','standing','match','ranking','ranking_result')),
  record_key text not null,
  event_key text,
  data jsonb not null check (jsonb_typeof(data)='object'),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (kind, record_key)
);
create index rankedin_history_event_records on private.rankedin_history_records (event_key, kind)
  where event_key is not null;
create index rankedin_history_by_player on private.rankedin_history_records using gin ((data->'player_ids'))
  where data ? 'player_ids';

alter table private.rankedin_history_jobs enable row level security;
alter table private.rankedin_history_records enable row level security;
revoke all on private.rankedin_history_jobs, private.rankedin_history_records from public, anon, authenticated, service_role;
grant usage on schema private to service_role;
grant select, insert, update on private.rankedin_history_jobs, private.rankedin_history_records to service_role;

create function public.rankedin_history_seed(p_targets boolean default true, p_pilot jsonb default '[]')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  coverage jsonb := '{}';
begin
  if p_targets then
    with candidates as (
      select upper(btrim(coalesce(p.rankedin_id,''))) as rid
      from public.players p where p.approved and p.account_type='player'
    ), groups as (
      select rid, count(*) as profiles from candidates group by rid
    )
    select jsonb_build_object(
      'profiles', coalesce(sum(profiles),0),
      'missing_id', coalesce(sum(profiles) filter (where rid=''),0),
      'invalid_id', coalesce(sum(profiles) filter (where rid<>'' and rid !~ '^R[0-9]{9}$'),0),
      'shared_id_groups', count(*) filter (where rid ~ '^R[0-9]{9}$' and profiles>1),
      'shared_id_profiles', coalesce(sum(profiles) filter (where rid ~ '^R[0-9]{9}$' and profiles>1),0),
      'eligible', count(*) filter (where rid ~ '^R[0-9]{9}$' and profiles=1)
    ) into coverage from groups;

    with unique_players as materialized (
      select upper(btrim(p.rankedin_id)) as rid
      from public.players p
      where p.approved and p.account_type='player' and upper(btrim(p.rankedin_id)) ~ '^R[0-9]{9}$'
      group by 1 having count(*)=1
    ), retired as (
      update private.rankedin_history_jobs j
      set enabled=false, issue='unverified_player_link'
      where j.enabled and j.args ? 'player_id'
        and not exists (select 1 from unique_players p where p.rid=j.args->>'player_id')
    ), restored as (
      update private.rankedin_history_jobs j
      set enabled=true, next_attempt_at=now(), issue=null
      where not j.enabled and j.issue='unverified_player_link'
        and exists (select 1 from unique_players p where p.rid=j.args->>'player_id')
    )
    insert into private.rankedin_history_jobs(job_key,kind,args)
    select 'player:'||rid,'player',jsonb_build_object('player_id',rid) from unique_players
    on conflict (job_key) do nothing;

    insert into private.rankedin_history_jobs(job_key,kind,args) values
      ('catalogue:sapa:finished','catalogue','{"finished":true}'),
      ('catalogue:sapa:upcoming','catalogue','{"finished":false}')
    on conflict (job_key) do nothing;

    -- Ranking identities already verified by the 4M sync are a fallback when Rankedin's
    -- public player rankings feed supplies placeholders.
    insert into private.rankedin_history_jobs(job_key,kind,args)
    select distinct 'points:'||p.rid||':'||p.participant||':'||p.age, 'points',
      jsonb_build_object('player_id',p.rid,'participant_id',p.participant,'age_group',p.age)
    from (
      select upper(btrim(p.rankedin_id)) rid,
        r->>'ranking_participant_id' participant, r->>'age_group_id' age
      from public.players p
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(p.rankings)='array' then p.rankings else '[]'::jsonb end
      ) r
      where p.approved and p.account_type='player' and upper(btrim(p.rankedin_id)) ~ '^R[0-9]{9}$'
        and r->>'ranking_participant_id' ~ '^[1-9][0-9]*$' and r->>'age_group_id' ~ '^[1-9][0-9]*$'
        and not exists (
          select 1 from public.players other where other.approved and other.account_type='player'
            and other.id<>p.id and upper(btrim(other.rankedin_id))=upper(btrim(p.rankedin_id))
        )
    ) p
    on conflict (job_key) do nothing;

    insert into private.rankedin_history_jobs(job_key,kind,args)
    select distinct e.kind||':'||e.rid,e.kind,jsonb_build_object('event_id',e.rid,'event_key',e.kind||':'||e.rid)
    from (
      select coalesce(nullif(btrim(rankedin_id),''),substring(rankedin_url from '/(?:tournament|teamleague|clubleague)/([0-9]+)')) rid,
        case when rankedin_url ~* '/teamleague/' then 'teamleague'
          when rankedin_url ~* '/clubleague/' or is_league then 'clubleague'
          else 'tournament' end kind
      from public.calendar
    ) e where e.rid ~ '^[1-9][0-9]*$'
    on conflict (job_key) do nothing;
  end if;

  if jsonb_typeof(p_pilot)<>'array' or jsonb_array_length(p_pilot)>25 then
    raise exception 'Invalid Rankedin pilot targets';
  end if;
  insert into private.rankedin_history_jobs(job_key,kind,args)
  select x.key,x.kind,x.args
  from jsonb_to_recordset(p_pilot) x(key text,kind text,args jsonb)
  on conflict (job_key) do nothing;

  return coverage;
end $$;

create function public.rankedin_history_claim()
returns jsonb language sql security invoker set search_path = '' as $$
  with due as (
    select j.job_key from private.rankedin_history_jobs j
    where j.enabled and j.next_attempt_at<=now() and (j.lease_until is null or j.lease_until<=now())
      and not exists (
        select 1 from private.rankedin_history_jobs x
        where x.enabled and x.issue='rate_limited' and x.next_attempt_at>now()
      )
    order by (j.completed_at is not null), j.next_attempt_at, j.job_key
    limit 1 for update of j skip locked
  ), claimed as (
    update private.rankedin_history_jobs j
    set lease_id=gen_random_uuid(), lease_until=now()+interval '12 minutes'
    from due where j.job_key=due.job_key
    returning j.job_key as key,j.kind,j.args,j.cursor_data as cursor,j.lease_id,j.attempts
  )
  select to_jsonb(claimed) from claimed;
$$;

create function public.rankedin_history_finish(
  p_key text, p_lease uuid, p_state text, p_next_seconds integer,
  p_cursor jsonb default '{}', p_issue text default null,
  p_records jsonb default '[]', p_jobs jsonb default '[]'
)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from private.rankedin_history_jobs j
  where job_key=p_key and lease_id=p_lease and lease_until>now() and enabled for update;
  if not found then return false; end if;

  if p_state not in ('page','done','retry','gap') or p_next_seconds not between 0 and 2678400
    or jsonb_typeof(p_cursor)<>'object'
    or jsonb_typeof(p_records)<>'array' or jsonb_array_length(p_records)>10000
    or jsonb_typeof(p_jobs)<>'array' or jsonb_array_length(p_jobs)>10000 then
    raise exception 'Invalid Rankedin history batch';
  end if;

  insert into private.rankedin_history_records as saved(kind,record_key,event_key,data)
  select x.kind,x.key,x.event_key,jsonb_strip_nulls(x.data)
  from jsonb_to_recordset(p_records) x(kind text,key text,event_key text,data jsonb)
  on conflict (kind,record_key) do update set
    event_key=coalesce(excluded.event_key,saved.event_key),
    data=saved.data||excluded.data
      || case when saved.kind='match' and saved.data ? 'score' and
          coalesce((saved.data->>'score_quality')::integer,0)>coalesce((excluded.data->>'score_quality')::integer,0)
        then jsonb_build_object('score',saved.data->'score','score_quality',saved.data->'score_quality')
        else '{}'::jsonb end
      || case when saved.kind='match' and (saved.data ? 'player_ids' or excluded.data ? 'player_ids')
        then jsonb_build_object('player_ids', (
          select coalesce(jsonb_agg(distinct player_id order by player_id),'[]')
          from jsonb_array_elements_text(coalesce(saved.data->'player_ids','[]')||coalesce(excluded.data->'player_ids','[]')) player_id
        )) else '{}'::jsonb end,
    last_seen_at=now();

  insert into private.rankedin_history_jobs(job_key,kind,args)
  select x.key,x.kind,x.args
  from jsonb_to_recordset(p_jobs) x(key text,kind text,args jsonb)
  on conflict (job_key) do nothing;

  update private.rankedin_history_jobs j
  set lease_id=null, lease_until=null,
    cursor_data=p_cursor,
    next_attempt_at=now()+p_next_seconds*interval '1 second',
    completed_at=case when p_state in ('done','gap') then now() else j.completed_at end,
    attempts=case when p_state='retry' then j.attempts+1 else 0 end,
    issue=p_issue
  where job_key=p_key;
  return true;
end $$;

create function public.rankedin_history_status()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'records', coalesce((select jsonb_object_agg(kind,n) from (
      select kind,count(*) as n from private.rankedin_history_records group by kind
    ) r),'{}'),
    'pending_initial', (select count(*) from private.rankedin_history_jobs where enabled and completed_at is null),
    'due', (select count(*) from private.rankedin_history_jobs where enabled and next_attempt_at<=now()),
    'retrying', (select count(*) from private.rankedin_history_jobs where enabled and attempts>0),
    'issues', coalesce((select jsonb_object_agg(issue,n) from (
      select issue,count(*) as n from private.rankedin_history_jobs where issue is not null group by issue
    ) j),'{}')
  );
$$;

revoke all on function public.rankedin_history_seed(boolean,jsonb), public.rankedin_history_claim(),
  public.rankedin_history_finish(text,uuid,text,integer,jsonb,text,jsonb,jsonb),
  public.rankedin_history_status() from public, anon, authenticated, service_role;
grant execute on function public.rankedin_history_seed(boolean,jsonb), public.rankedin_history_claim(),
  public.rankedin_history_finish(text,uuid,text,integer,jsonb,text,jsonb,jsonb),
  public.rankedin_history_status() to service_role;
