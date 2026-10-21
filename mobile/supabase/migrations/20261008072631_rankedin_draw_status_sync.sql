begin;

-- Draw pages refresh rankedin_cache independently of event/result pages.
-- Keep the published-draw flag in sync without another provider request.
create function public.sync_rankedin_draw_status() returns trigger
language plpgsql security invoker set search_path='' as $$
declare
  tournament_id text;
  published boolean;
begin
  tournament_id := (regexp_match(new.url,
    '^https://api[.]rankedin[.]com/v1/tournament/GetClassesAndDrawNamesAsync/[?]tournamentId=([1-9][0-9]*)$'))[1];
  if tournament_id is null or jsonb_typeof(new.payload) is distinct from 'array' then return new; end if;
  -- An empty/failed response must not withdraw a known published draw.
  if jsonb_array_length(new.payload)=0 then return new; end if;
  select exists(select 1 from jsonb_array_elements(new.payload) cls
    where (cls->>'IsPublished'='true' or cls->>'ShowDraws'='true')
      and case when jsonb_typeof(cls->'TournamentDraws')='array'
        then jsonb_array_length(cls->'TournamentDraws')>0 else false end) into published;

  insert into public.rankedin_results_cache as results(event_id,rankedin_id,classes,has_draw,last_synced_at)
    select c.id,tournament_id,new.payload,published,'1970-01-01T00:00:00Z'::timestamptz
    from public.calendar c
    where coalesce(nullif(trim(c.rankedin_id),''),
      substring(c.rankedin_url from 'tournament/([0-9]+)'))=tournament_id
    on conflict(event_id) do update set classes=excluded.classes,has_draw=excluded.has_draw,rankedin_id=excluded.rankedin_id
      where results.last_synced_at is null or new.updated_at>=results.last_synced_at;
  -- Updating classes does not mean winners/results have just been refreshed.
  return new;
end;
$$;
revoke all on function public.sync_rankedin_draw_status() from public,anon,authenticated;

create trigger sync_rankedin_draw_status
after insert or update of payload,updated_at on public.rankedin_cache
for each row execute function public.sync_rankedin_draw_status();

-- Repair recent populated cache rows without touching their fetch timestamps.
update public.rankedin_cache set payload=payload
where updated_at>=now()-interval '7 days'
  and url ~ '^https://api[.]rankedin[.]com/v1/tournament/GetClassesAndDrawNamesAsync/[?]tournamentId=[1-9][0-9]*$'
  and jsonb_typeof(payload)='array';

commit;
