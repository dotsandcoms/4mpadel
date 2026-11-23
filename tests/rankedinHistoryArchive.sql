begin;

insert into public.players(id,approved,account_type,rankedin_id,rankings) values
  (-10,true,'player','R999999991','[{"ranking_participant_id":431,"age_group_id":2}]'),
  (-11,true,'player','R999999992',null),
  (-12,true,'player','r999999992',null),
  (-13,true,'player',null,null);

do $$
begin
  if has_function_privilege('anon','public.rankedin_history_claim()','EXECUTE')
    or has_function_privilege('authenticated','public.rankedin_history_status()','EXECUTE')
    or has_table_privilege('authenticated','private.rankedin_history_records','SELECT')
    or has_table_privilege('anon','private.rankedin_history_jobs','UPDATE')
    or has_table_privilege('service_role','private.rankedin_history_jobs','DELETE') then
    raise exception 'Archive access exceeds the worker contract';
  end if;
end $$;

set local role service_role;
do $$
declare
  report jsonb;
  task jsonb;
  lease uuid;
  payload jsonb;
begin
  report := public.rankedin_history_seed();
  if report->>'eligible'<>'1' or report->>'shared_id_profiles'<>'2' or report->>'missing_id'<>'1'
    or not exists (select 1 from private.rankedin_history_jobs where job_key='points:R999999991:431:2')
    or exists (select 1 from private.rankedin_history_jobs where job_key='player:R999999992') then
    raise exception 'Link coverage or eligibility is incorrect: %', report;
  end if;

  -- Make the test job the only claimable one.
  update private.rankedin_history_jobs set next_attempt_at=now()+interval '1 day';
  perform public.rankedin_history_seed(false, '[{"key":"tournament_matches:test","kind":"tournament_matches","args":{}}]');
  select public.rankedin_history_claim() into task;
  lease := (task->>'lease_id')::uuid;
  if task->>'key'<>'tournament_matches:test' or public.rankedin_history_claim() is not null then
    raise exception 'A job can be claimed twice';
  end if;
  if not public.rankedin_history_finish(task->>'key',lease,'page',0,'{"skip":40}',null,
    '[{"kind":"match","key":"challenge:13","event_key":"tournament:1","data":{"player_ids":["R999999991"],"score":{"Score":[{"Score1":6,"Score2":2}]},"score_quality":2}}]') then
    raise exception 'First page failed';
  end if;

  select public.rankedin_history_claim() into task;
  if task#>>'{cursor,skip}'<>'40' then raise exception 'Cursor failed to resume'; end if;
  if public.rankedin_history_finish(task->>'key',lease,'done',60) then
    raise exception 'Old lease was accepted';
  end if;

  update private.rankedin_history_jobs set lease_until=now()-interval '1 second' where job_key=task->>'key';
  lease := (task->>'lease_id')::uuid;
  select public.rankedin_history_claim() into task;
  if task->>'key'<>'tournament_matches:test' or task#>>'{cursor,skip}'<>'40' or lease=(task->>'lease_id')::uuid then
    raise exception 'Abandoned lease did not resume the saved page';
  end if;
  if not public.rankedin_history_finish(task->>'key',(task->>'lease_id')::uuid,'done',60,'{}',null,
    '[{"kind":"match","key":"challenge:13","data":{"player_ids":["R999999993"],"score":{"Score":[{"Score1":2,"Score2":0}]},"score_quality":1}}]') then
    raise exception 'Rerun failed';
  end if;

  select data into payload from private.rankedin_history_records where kind='match' and record_key='challenge:13';
  if payload->>'score_quality'<>'2' or jsonb_array_length(payload->'player_ids')<>2
    or (public.rankedin_history_status()#>>'{records,match}')::integer<>1 then
    raise exception 'Rerun duplicated a match or degraded the saved score: %', payload;
  end if;
end $$;

rollback;
