-- Review published results, qualify only the exact standings, retain courts.
update draws set advancers_per_group=2,scoring_rules=scoring_rules||'{"sets_to_win":2}'
where event_id=9901 and division_id=pg_temp.host_id(21);
insert into host_review select 'qualification-draw',to_jsonb(d) from draws d
where d.event_id=9901 and d.division_id=pg_temp.host_id(21);
create function pg_temp.group_versions() returns jsonb language sql as $$
    select jsonb_object_agg(m.id::text,m.updated_at) from public.draw_matches m
    where m.draw_id=(select (payload->>'id')::uuid from host_review where fixture='qualification-draw') and m.stage='group'
$$;
create function pg_temp.group_sets() returns jsonb language sql as $$
    select coalesce(jsonb_object_agg(m.id::text||':'||s.set_number,jsonb_build_array(s.entry_one_games,s.entry_two_games,s.is_match_tiebreak)),'{}'::jsonb)
    from public.draw_match_sets s join public.draw_matches m on m.id=s.match_id
    where m.draw_id=(select (payload->>'id')::uuid from host_review where fixture='qualification-draw') and m.stage='group'
$$;
create function pg_temp.group_qualify(versions jsonb,matches jsonb,scores jsonb default pg_temp.group_sets()) returns jsonb language sql as $$
    select public.tm_host_group_qualification(pg_temp.host_id(10),9901,'qualify',jsonb_build_object(
        'p_draw',payload->>'id','p_expected',payload->>'updated_at','p_matches',matches,'p_group_versions',versions,'p_group_sets',scores))
    from host_review where fixture='qualification-draw'
$$;
create function pg_temp.host_score_match(n integer,score jsonb,expected_match timestamptz default null) returns jsonb language sql as $$
    select public.native_record_reviewed_main_result(pg_temp.host_id(10),9901,d.id,d.updated_at,m.id,
        coalesce(expected_match,m.updated_at),score)
    from public.draw_matches m join public.draws d on d.id=m.draw_id where m.id=pg_temp.host_id(n)
$$;
insert into host_review values('qualification-matches',jsonb_build_array(
    pg_temp.host_match(250,1,1,'knockout',null,84,87,null,252,1)||'{"key":"r1-m1"}',
    pg_temp.host_match(251,1,2,'knockout',null,86,85,null,252,2)||'{"key":"r1-m2"}',
    pg_temp.host_match(252,2,1,'knockout',null,null,null,null)||'{"key":"r2-m1"}'
));
set role anon;
select pg_temp.host_expect_error($$select public.tm_host_group_qualification(null,9901,'qualify','{}')$$,'permission denied');
select pg_temp.host_expect_error($$select public.native_record_reviewed_main_result(null,9901,null,null,null,null,'{}')$$,'permission denied');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.host_id(2)::text,false);
select pg_temp.expect_denied($$select pg_temp.group_qualify('{}','[]')$$);
select pg_temp.expect_denied($$select pg_temp.host_score_match(150,'{"kind":"live","sets":[]}')$$);
select set_config('request.jwt.claim.sub',pg_temp.host_id(3)::text,false);
select pg_temp.expect_denied($$select pg_temp.host_score_match(150,'{"kind":"live","sets":[]}')$$);
select set_config('request.jwt.claim.sub',pg_temp.host_id(4)::text,false);
select pg_temp.expect_denied($$select public.tm_host_group_qualification(pg_temp.host_id(10),9902,'qualify','{}')$$);
select pg_temp.expect_denied($$select public.tm_host_group_qualification(pg_temp.host_id(10),9901,'set_access','{}')$$);
select pg_temp.expect_denied($$select public.tm_qualify(9901,null,null,'[]')$$);
select pg_temp.host_expect_error($$select pg_temp.group_qualify(pg_temp.group_versions(),payload) from host_review where fixture='qualification-matches'$$,'finish and review every');
select pg_temp.expect_denied($$select public.native_record_reviewed_main_result(pg_temp.host_id(10),9902,
    pg_temp.host_id(240),clock_timestamp(),pg_temp.host_id(242),clock_timestamp(),'{}')$$);
select pg_temp.host_expect_error($$select pg_temp.host_score_match(150,'{"kind":"live","sets":[]}',clock_timestamp()-interval '1 day')$$,'reviewed match changed');

select pg_temp.host_score_match(150,'{"kind":"played","sets":[{"games":[6,2]},{"games":[7,6],"tiebreak":[8,6]}]}');
do $$ begin
    if not exists (select 1 from draw_standings where entry_id=pg_temp.host_id(84)
        and won=1 and sets_for=2 and sets_against=0 and games_for=13 and games_against=8) then
        raise exception 'Awarded group points or finished sets changed';
    end if;
end $$;
-- The original Tournament Manager overwrites the set rows independently.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
select public.tm_record_result(9901,id,updated_at,jsonb_build_object(
    'kind','played','winner',entry_one_id,'sets','[[6,2],[3,6],[7,6]]'::jsonb,'reason','Detailed scorecard'))
from public.draw_matches where id=pg_temp.host_id(150);
do $$ begin
    if not exists (select 1 from draw_standings where entry_id=pg_temp.host_id(84)
        and won=1 and sets_for=2 and sets_against=1 and games_for=16 and games_against=14)
        or (select result_summary from draw_matches where id=pg_temp.host_id(150)) is distinct from array[2,0]::smallint[] then
        raise exception 'A legacy Tournament Manager correction showed stale native totals';
    end if;
end $$;
select public.tm_record_result(9901,id,updated_at,jsonb_build_object(
    'kind','walkover','winner',entry_one_id,'reason','Confirmed walkover'))
from public.draw_matches where id=pg_temp.host_id(150);
do $$ begin
    if not exists (select 1 from draw_standings where entry_id=pg_temp.host_id(84)
        and won=1 and sets_for=0 and sets_against=0 and games_for=0 and games_against=0) then
        raise exception 'A walkover inherited sets from a corrected native score';
    end if;
end $$;
select set_config('request.jwt.claim.sub',pg_temp.host_id(4)::text,false);
select pg_temp.host_score_match(151,jsonb_build_object('kind','retirement','winner',pg_temp.host_id(86),
    'sets','[{"games":[6,2]},{"games":[4,1]}]'::jsonb));
do $$ begin
    if not exists (select 1 from draw_standings where entry_id=pg_temp.host_id(86)
        and won=1 and sets_for=1 and sets_against=0 and games_for=10 and games_against=3) then
        raise exception 'The partial retired set counted as an extra set or lost its games';
    end if;
end $$;
insert into host_review select 'group-versions',pg_temp.group_versions();
select pg_temp.host_score_match(150,'{"kind":"played","sets":[],"summary":[2,1],"reason":"Scorecard reviewed"}');
do $$ begin
    if not exists (select 1 from draw_standings where entry_id=pg_temp.host_id(84)
        and won=1 and sets_for=2 and sets_against=1 and games_for=0 and games_against=0)
        or exists (select 1 from draw_match_sets where match_id=pg_temp.host_id(150)) then
        raise exception 'A corrected summary-only score did not reach the standings';
    end if;
end $$;
reset role;
with fixture as (
    select payload->>'id' draw_id from host_review where fixture='qualification-draw'
), assignments as (
    select draw_id,jsonb_object_agg(draw_id||':future:'||m.key,
        jsonb_build_object('scheduled_start','2035-06-07T'||m.starts||':00Z',
            'scheduled_end','2035-06-07T'||m.ends||':00Z','court_name',m.court)) keyed,
        jsonb_agg(jsonb_build_object('id',draw_id||':future:'||m.key,'draw_id',draw_id,'stage','knockout')) fixtures
    from fixture cross join (values('r1-m1','08:00','09:00','Court 1'),('r1-m2','08:00','09:00','Court 2'),
        ('r2-m1','10:00','11:00','Court 1')) m(key,starts,ends,court)
    group by draw_id
)
insert into tournament_schedules(event_id,source_fingerprint,status,assignments,published_assignments,fixtures)
select 9901,'fixture','published',keyed,keyed,fixtures from assignments;
set role authenticated;
select pg_temp.host_expect_error($$select pg_temp.group_qualify(
    (select payload from host_review where fixture='group-versions'),payload) from host_review where fixture='qualification-matches'$$,'finish and review every');
select pg_temp.host_expect_error($$select pg_temp.group_qualify(pg_temp.group_versions(),payload,'{}')
    from host_review where fixture='qualification-matches'$$,'reviewed group scores changed');
select pg_temp.host_expect_error($$select pg_temp.group_qualify(pg_temp.group_versions(),
    jsonb_set(payload,'{0,winner_to_slot}','2')) from host_review where fixture='qualification-matches'$$,'every qualified team');
select pg_temp.host_expect_error($$select pg_temp.group_qualify(pg_temp.group_versions(),
    jsonb_set(payload,'{1,entry_two_id}',to_jsonb(pg_temp.host_id(87)))) from host_review where fixture='qualification-matches'$$,'every qualified team');
select pg_temp.host_expect_error($$select pg_temp.group_qualify(pg_temp.group_versions(),
    jsonb_set(payload,'{0,entry_one_id}',to_jsonb(pg_temp.host_id(81)))) from host_review where fixture='qualification-matches'$$,'every qualified team');
select pg_temp.group_qualify(pg_temp.group_versions(),payload) from host_review where fixture='qualification-matches';
select pg_temp.host_expect_error($$select pg_temp.group_qualify(pg_temp.group_versions(),payload) from host_review where fixture='qualification-matches'$$,'draw changed');
select pg_temp.host_expect_error($$select pg_temp.host_score_match(150,
    '{"kind":"played","sets":[],"summary":[2,0],"reason":"Later group correction"}')$$,'elimination draw uses these group standings');
select pg_temp.host_score_match(250,'{"kind":"played","sets":[],"summary":[2,0]}');
reset role;

do $$
declare s public.tournament_schedules;
begin
    select * into s from tournament_schedules where event_id=9901;
    if s.revision<>2 or s.fixtures::text like '%:future:%' or s.assignments::text like '%:future:%'
        or s.published_assignments::text like '%:future:%'
        or (select count(*) from draw_matches where id in(pg_temp.host_id(250),pg_temp.host_id(251),pg_temp.host_id(252))
            and status in ('scheduled','completed') and scheduled_start is not null) <> 3
        or (select court_name from draw_matches where id=pg_temp.host_id(251)) <> 'Court 2'
        or (select scheduled_start at time zone 'UTC' from draw_matches where id=pg_temp.host_id(252)) <> timestamp '2035-06-07 10:00'
        then raise exception 'Qualifying the host draw lost booked courts'; end if;
    if not exists(select 1 from tournament_audit where event_id=9901 and action='groups.qualified' and actor=pg_temp.host_id(4))
        then raise exception 'Qualifying the host draw lost its audit trail'; end if;
    if not exists(select 1 from draw_matches where id=pg_temp.host_id(252) and entry_one_id=pg_temp.host_id(84))
        or not exists(select 1 from draw_match_audit where match_id=pg_temp.host_id(150)
            and action='score_corrected' and actor_email='manager@example.test' and after_state->>'reason'='Scorecard reviewed') then
        raise exception 'The knockout score failed to feed its winner or the group correction lacked provenance';
    end if;
end;
$$;
select 'Host group qualification assertions passed' as result;
