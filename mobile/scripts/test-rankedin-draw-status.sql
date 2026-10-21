-- Uses an existing public hybrid tournament; all test changes roll back.
begin;
create temporary table draw_status_test_baseline as
select c.id event_id,r.classes,r.winners,r.has_results,r.upcoming_matches,r.last_synced_at,
  cache.url,cache.payload,cache.updated_at
from public.calendar c join public.rankedin_results_cache r on r.event_id=c.id
join public.rankedin_cache cache on cache.url=
  'https://api.rankedin.com/v1/tournament/GetClassesAndDrawNamesAsync/?tournamentId='||c.rankedin_id
where c.slug='sa-nationals-2026-age-groups';

do $$ begin
  if (select count(*) from draw_status_test_baseline)<>1 then raise exception 'Missing hybrid event fixture'; end if;
  if exists(select 1 from pg_proc p where p.oid='public.sync_rankedin_draw_status()'::regprocedure and p.prosecdef)
    then raise exception 'Cache trigger must preserve caller permissions'; end if;
  if has_function_privilege('anon','public.sync_rankedin_draw_status()','execute')
    or has_function_privilege('authenticated','public.sync_rankedin_draw_status()','execute')
    then raise exception 'Cache trigger must not expose a callable RPC'; end if;
end $$;

update public.rankedin_results_cache set has_draw=false,classes='[]',last_synced_at=now()-interval '10 minutes'
where event_id=(select event_id from draw_status_test_baseline);

-- Check the actual website client's role can invoke the trigger through its
-- existing cache-write permission, without adding any new grant.
set local role authenticated;
update public.rankedin_cache set payload=payload,updated_at=now()
where url='https://api.rankedin.com/v1/tournament/GetClassesAndDrawNamesAsync/?tournamentId=75153';
reset role;

do $$ begin
  if not exists(select 1 from public.rankedin_results_cache r join draw_status_test_baseline b on b.event_id=r.event_id
    where r.has_draw and r.classes=b.payload and r.winners is not distinct from b.winners
      and r.has_results is not distinct from b.has_results and r.upcoming_matches is not distinct from b.upcoming_matches
      and r.last_synced_at=now()-interval '10 minutes')
    then raise exception 'Published classes did not sync, or unrelated results/fetch time changed'; end if;
end $$;

update public.rankedin_cache set payload='[]',updated_at=now()
where url=(select url from draw_status_test_baseline);
do $$ begin
  if not (select has_draw from public.rankedin_results_cache where event_id=(select event_id from draw_status_test_baseline))
    then raise exception 'Empty response hid a known published draw'; end if;
end $$;

update public.rankedin_cache set payload='{}',updated_at=now()
where url=(select url from draw_status_test_baseline);
do $$ begin
  if not (select has_draw from public.rankedin_results_cache where event_id=(select event_id from draw_status_test_baseline))
    then raise exception 'Malformed response hid a known published draw'; end if;
end $$;

update public.rankedin_cache set payload='[{"Id":177841,"IsPublished":false,"ShowDraws":false,"TournamentDraws":[]}]',updated_at=now()
where url=(select url from draw_status_test_baseline);
do $$ begin
  if (select has_draw from public.rankedin_results_cache where event_id=(select event_id from draw_status_test_baseline))
    then raise exception 'Populated unpublished classes failed to withdraw draw'; end if;
end $$;

update public.rankedin_results_cache set has_draw=true,classes=(select payload from draw_status_test_baseline),last_synced_at=now()
where event_id=(select event_id from draw_status_test_baseline);
update public.rankedin_cache set payload='[{"Id":177841,"IsPublished":false,"TournamentDraws":[]}]',updated_at=now()-interval '1 day'
where url=(select url from draw_status_test_baseline);
do $$ begin
  if not (select has_draw from public.rankedin_results_cache where event_id=(select event_id from draw_status_test_baseline))
    then raise exception 'Older classes overwrote newer summary'; end if;
end $$;

select 'PASS: hybrid publication, caller permissions, empty/malformed fallback, withdrawal, stale protection and result preservation' result;
rollback;
