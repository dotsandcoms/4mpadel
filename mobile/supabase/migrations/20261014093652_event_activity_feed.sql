begin;

-- Reuse the public facts feed, not the admin audit log or private payment history.
create function public.get_event_activity(p_event_id bigint, p_filter text default 'all', p_limit integer default 20,
  p_before timestamptz default null, p_before_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare rows jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to view tournament activity'; end if;
  if p_event_id is null or p_event_id <= 0 or p_filter is null or p_filter not in ('all','entries','matches','updates')
    or p_limit is null or p_limit not between 1 and 50 or (p_before is null) <> (p_before_id is null)
    then raise exception 'Invalid activity filter or cursor'; end if;
  if not exists (select 1 from public.calendar c where c.id = p_event_id and c.is_visible = true
    and coalesce(c.registration_access,'public') = 'public') then return jsonb_build_object('items','[]'::jsonb,'has_more',false); end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.occurred_at desc,x.id desc),'[]') into rows from (
    select a.id,a.kind,a.title,a.body,a.photo_url,a.path,a.payload || public.following_activity_media(a) as payload,a.occurred_at
    from public.following_activity a
    where a.event_id = p_event_id and a.occurred_at <= now()
      and a.kind in ('entry','result','tournament','match_live','match_schedule','ranking')
      and (p_before is null or (a.occurred_at,a.id) < (p_before,p_before_id))
      and (a.native_match_id is null or exists(select 1 from public.draw_matches m join public.draws d on d.id = m.draw_id
        where m.id = a.native_match_id and d.status in ('published','in_progress','completed')))
      and (p_filter = 'all' or p_filter = 'entries' and a.kind = 'entry'
        or p_filter = 'matches' and a.kind in ('result','match_live','match_schedule')
        or p_filter = 'updates' and a.kind in ('tournament','ranking'))
    order by a.occurred_at desc,a.id desc limit p_limit + 1
  ) x;
  return jsonb_build_object('items',(select coalesce(jsonb_agg(value order by ordinality),'[]')
    from jsonb_array_elements(rows) with ordinality where ordinality <= p_limit),'has_more',jsonb_array_length(rows) > p_limit);
end $$;
revoke all on function public.get_event_activity(bigint,text,integer,timestamptz,uuid) from public,anon;
grant execute on function public.get_event_activity(bigint,text,integer,timestamptz,uuid) to authenticated;

create function public.record_event_withdrawal(p_registration uuid,p_time timestamptz default now()) returns void
language plpgsql security definer set search_path = '' as $$
declare r record; ids bigint[]; names text[];
begin
  select er.*,c.event_name into r from public.event_registrations er join public.calendar c on c.id = er.event_id
    where er.id = p_registration and er.status = 'withdrawn' and er.payment_status in ('paid','comped')
      and er.is_test is distinct from true and c.is_visible = true and coalesce(c.registration_access,'public') = 'public';
  if not found then return; end if;
  select array_agg(p.id order by p.id),array_agg(p.name order by p.id) into ids,names from public.players p
    where p.approved = true and lower(trim(p.email)) in (lower(trim(r.email)),lower(trim(r.partner_email)));
  if coalesce(array_length(ids,1),0) = 0 then return; end if;
  perform public.record_following_activity(jsonb_build_object('event_key','withdrawal:' || r.id,'kind','entry',
    'local_player_ids',to_jsonb(ids),'event_id',r.event_id,'title',array_to_string(names,' & ') || ' withdrew from ' || r.event_name,
    'body',coalesce(r.division,''),'path','/events/' || r.event_id,'payload',jsonb_build_object('event_name',r.event_name,
    'division',r.division,'update_type','withdrawal'),'occurred_at',p_time));
end $$;
revoke all on function public.record_event_withdrawal(uuid,timestamptz) from public,anon,authenticated;

create function public.event_withdrawal_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'withdrawn' and old.status is distinct from new.status then perform public.record_event_withdrawal(new.id); end if;
  return new;
end $$;
revoke all on function public.event_withdrawal_changed() from public,anon,authenticated;
create trigger event_withdrawal_changed after update of status on public.event_registrations
  for each row execute function public.event_withdrawal_changed();

-- Backfill only existing public withdrawals with their actual audit timestamps.
select public.record_event_withdrawal(er.id,max(l.created_at)) from public.event_registrations er
  join public.event_activity_log l on l.event_id = er.event_id and l.action = 'registration.withdrawn'
    and l.details->>'registration_id' = er.id::text
  where er.status = 'withdrawn' and l.created_at > now() - interval '90 days' group by er.id;

-- Old numeric-only normalization dropped entire tie-break sets. Restore from the
-- already cached detailed match, but only when both pair identities and winner agree.
with matched as (
  select a.id,a.payload,a.title,c.payload as raw from public.following_activity a
    join public.padel_api_cache c on c.resource_key = 'https://padelapi.org/api/matches/' || a.pro_match_id
  where a.kind = 'result' and c.payload->>'status' = 'finished'
    and c.payload->>'winner' = 'team_' || ((a.payload->>'winner')::integer + 1)::text
    and jsonb_typeof(c.payload->'score') = 'array' and jsonb_array_length(c.payload->'score') between 2 and 3
    and (select array_agg(p->>'id' order by p->>'id') from jsonb_array_elements(a.payload->'participants'->0) p)
      = (select array_agg(p->>'id' order by p->>'id') from jsonb_array_elements(c.payload->'players'->'team_1') p)
    and (select array_agg(p->>'id' order by p->>'id') from jsonb_array_elements(a.payload->'participants'->1) p)
      = (select array_agg(p->>'id' order by p->>'id') from jsonb_array_elements(c.payload->'players'->'team_2') p)
    and not exists (select 1 from jsonb_array_elements(c.payload->'score') s
      where coalesce(s->>'team_1','') !~ '^\d{1,2}(\(\d{1,2}\))?$' or coalesce(s->>'team_2','') !~ '^\d{1,2}(\(\d{1,2}\))?$')
), repaired as (
  select m.id,m.payload,jsonb_agg(jsonb_build_array(s->'team_1',s->'team_2') order by ordinality) as scores,
    string_agg((s->>case when m.payload->>'winner' = '0' then 'team_1' else 'team_2' end) || '–' ||
      (s->>case when m.payload->>'winner' = '0' then 'team_2' else 'team_1' end),', ' order by ordinality) as label
    from matched m cross join lateral jsonb_array_elements(m.raw->'score') with ordinality as sets(s,ordinality)
    group by m.id,m.payload
)
update public.following_activity a set payload = jsonb_set(a.payload,'{scores}',r.scores),
  title = (a.payload->'teams'->>((a.payload->>'winner')::integer)) || ' won ' || r.label || ' against ' ||
    (a.payload->'teams'->>(1 - (a.payload->>'winner')::integer))
from repaired r where a.id = r.id and a.payload->'scores' is distinct from r.scores;

commit;
