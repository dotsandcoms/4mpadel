-- Verify direct score writes, accurate completion, retained courts, and actor audit.
create function pg_temp.rotation_draw(n integer) returns public.draws language sql as $$
    select d from public.draws d where d.division_id=pg_temp.host_id(n)
$$;
create function pg_temp.rotation_result_match(n integer,r integer) returns public.draw_matches language sql as $$
    select m from public.draw_matches m where m.draw_id=(pg_temp.rotation_draw(n)).id and m.americano_fixture_key='r'||r||'-m1'
$$;
create function pg_temp.rotation_score(n integer,r integer,score jsonb,reason text default null,match_id uuid default null,
    draw_version timestamptz default null,match_version timestamptz default null) returns jsonb language sql as $$
    select public.tm_host_rotation_result(pg_temp.host_id(10),9901,'record_rotation_score',jsonb_build_object(
        'p_draw',(pg_temp.rotation_draw(n)).id,'p_expected',coalesce(draw_version,(pg_temp.rotation_draw(n)).updated_at),
        'p_match',coalesce(match_id,(pg_temp.rotation_result_match(n,r)).id),
        'p_expected_match',coalesce(match_version,(pg_temp.rotation_result_match(n,r)).updated_at),
        'p_score',score,'p_reason',reason))
$$;
create function pg_temp.rotation_versions(n integer) returns jsonb language sql as $$
    select jsonb_object_agg(m.id::text,m.updated_at) from public.draw_matches m where m.draw_id=(pg_temp.rotation_draw(n)).id
$$;
create function pg_temp.finish_rotation(n integer,versions jsonb default null,prior timestamptz default null) returns jsonb language sql as $$
    select public.tm_host_rotation_result(pg_temp.host_id(10),9901,'complete_rotation',jsonb_build_object(
        'p_draw',(pg_temp.rotation_draw(n)).id,'p_expected',coalesce(prior,(pg_temp.rotation_draw(n)).updated_at),
        'p_match_versions',coalesce(versions,pg_temp.rotation_versions(n))))
$$;

update draw_matches set status='scheduled',scheduled_start='2035-06-07 13:00:00+00',scheduled_end='2035-06-07 13:40:00+00',
    court_name='Court 3',updated_at=clock_timestamp()
where id=(pg_temp.rotation_result_match(60,1)).id;
update draws set scoring_rules=jsonb_set(
    jsonb_set(scoring_rules,'{americano,fixtures,0,scheduled_start}','"2035-06-07T13:00:00Z"'),
    '{americano,fixtures,0,scheduled_end}','"2035-06-07T13:40:00Z"')
where id=(pg_temp.rotation_draw(60)).id;
insert into host_review select 'results-rotation-original',scoring_rules->'americano' from draws where id=(pg_temp.rotation_draw(60)).id;

set role anon;
select pg_temp.host_expect_error($$select public.tm_host_rotation_result(null,9901,'complete_rotation','{}')$$,'permission denied');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.host_id(2)::text,false);
select pg_temp.expect_denied($$select pg_temp.rotation_score(60,1,'[14,10]')$$);
select set_config('request.jwt.claim.sub',pg_temp.host_id(3)::text,false);
select pg_temp.expect_denied($$select pg_temp.rotation_score(60,1,'[14,10]')$$);
select set_config('request.jwt.claim.sub',pg_temp.host_id(4)::text,false);
select pg_temp.expect_denied($$select public.tm_host_rotation_result(pg_temp.host_id(11),9901,'complete_rotation','{}')$$);
select pg_temp.expect_denied($$select public.tm_host_rotation_result(pg_temp.host_id(10),9902,'complete_rotation','{}')$$);
select pg_temp.expect_denied($$select public.tm_host_rotation_result(pg_temp.host_id(10),9901,'schedule_rotation','{}')$$);
select pg_temp.expect_denied($$select public.tm_record_result(9901,(pg_temp.rotation_result_match(60,1)).id,
    (pg_temp.rotation_result_match(60,1)).updated_at,'{"kind":"played","score":[14,10]}')$$);
select pg_temp.expect_denied($$select pg_temp.finish_rotation(20)$$);
select pg_temp.host_expect_error($$select pg_temp.finish_rotation(60)$$,'score every match');
select pg_temp.host_expect_error($$select pg_temp.rotation_score(60,1,'[14,10]',null,(pg_temp.rotation_result_match(61,1)).id)$$,'belongs to another draw');
select pg_temp.host_expect_error($$select pg_temp.rotation_score(60,1,'[14,10]',match_version=>now()-interval '1 day')$$,'match changed');
select pg_temp.host_expect_error($$select pg_temp.rotation_score(60,1,'[14,10]',draw_version=>now()-interval '1 day')$$,'draw changed');
select pg_temp.host_expect_error($$select pg_temp.rotation_score(60,1,'[14,11]')$$,'both scores must add up');
select pg_temp.host_expect_error($$select pg_temp.rotation_score(60,1,'[14.5,9.5]')$$,'both scores must add up');
select pg_temp.host_expect_error($$select pg_temp.rotation_score(60,1,'[25,-1]')$$,'both scores must add up');
select pg_temp.host_expect_error($$select pg_temp.rotation_score(60,1,'["14",10]')$$,'both scores must add up');
select pg_temp.host_expect_error($$select pg_temp.rotation_score(60,1,'[2147483647,2147483647]')$$,'both scores must add up');
select pg_temp.rotation_score(60,1,'[14,10]');
select pg_temp.host_expect_error($$select pg_temp.rotation_score(60,1,'[12,12]')$$,'correction reason');
select pg_temp.rotation_score(60,1,'[12,12]','Updated the scorecard');
select pg_temp.rotation_score(60,2,'[11,13]');
select pg_temp.rotation_score(60,3,'[24,0]');
select pg_temp.host_expect_error($$select pg_temp.finish_rotation(60,'{}')$$,'reviewed match list changed');
select pg_temp.finish_rotation(60);
select pg_temp.host_expect_error($$select pg_temp.rotation_score(60,1,'[11,13]','Attempt after close')$$,'is closed');
select pg_temp.host_expect_error($$select pg_temp.finish_rotation(60)$$,'is closed');
reset role;

-- Existing assigned scorers still write the same rotation representation.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
select public.tm_set_access(9901,'results@example.test',array['results']);
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
select public.tm_record_result(9901,(pg_temp.rotation_result_match(61,1)).id,(pg_temp.rotation_result_match(61,1)).updated_at,
    '{"kind":"played","score":["13",11]}');
select pg_temp.expect_denied($$select pg_temp.finish_rotation(61)$$);
select set_config('request.jwt.claim.sub',pg_temp.host_id(1)::text,false);
select pg_temp.rotation_score(61,2,'[12,12]');
select pg_temp.rotation_score(61,3,'[22,2]');
select pg_temp.finish_rotation(61);
reset role;

do $$
declare
    after_rotation jsonb:=(pg_temp.rotation_draw(60)).scoring_rules->'americano';
    prior_rotation jsonb:=(select payload from host_review where fixture='results-rotation-original');
    match public.draw_matches:=pg_temp.rotation_result_match(60,1);
begin
    if (pg_temp.rotation_draw(60)).status<>'completed' or (pg_temp.rotation_draw(60)).completed_at is null
        or (pg_temp.rotation_draw(61)).status<>'completed'
        or (pg_temp.rotation_draw(61)).scoring_rules#>'{americano,fixtures,0,score}' <> '[13,11]'
        or match.status<>'completed' or match.result_type<>'played'
        or match.court_name<>'Court 3' or match.scheduled_start is distinct from timestamptz '2035-06-07 13:00:00+00'
        or match.scheduled_end is distinct from timestamptz '2035-06-07 13:40:00+00'
        or (after_rotation-'fixtures') is distinct from (prior_rotation-'fixtures')
        or ((after_rotation->'fixtures'->0)-'score') is distinct from ((prior_rotation->'fixtures'->0)-'score')
        or after_rotation->'fixtures'->0->'score' is distinct from '[12,12]'::jsonb
        or not exists(select 1 from draw_match_audit where match_id=match.id and action='score_corrected'
            and actor_email='manager@example.test' and before_state->'score'='[14,10]' and after_state->>'reason'='Updated the scorecard')
        or not exists(select 1 from tournament_audit where event_id=9901 and action='rotation.completed' and actor=pg_temp.host_id(4))
        or exists(select 1 from tournament_finalisations where event_id=9901) then
        raise exception 'The exact scoped rotation did not retain its courts, state or audit';
    end if;
end $$;
select 'Host Americano score and completion assertions passed' as result;
