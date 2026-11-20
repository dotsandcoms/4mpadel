-- Keep the original automatic best-placed path available after testing the
-- override and its complete transaction against the same published results.
savepoint before_host_override;
insert into host_review
select 'best-placed-override', pg_temp.ranked_request('best_placed') || jsonb_build_object(
    'p_matches',payload->'override'->'bracket','p_ranked_qualifiers',payload->'override'->'ranked',
    'p_ranked_override',payload->'override'->'request')
from ranked_fixture_reference where mode='best_placed';

with fixtures as (
    select payload->>'drawId' draw_id,
        jsonb_agg(jsonb_build_object('id',payload->>'drawId'||':future:'||(f->>'key'),'draw_id',payload->>'drawId','virtual',true)) rows,
        max(f->>'key') filter(where f->>'round_number'='1' and f->>'result_type' is null) booked
    from ranked_fixture_reference cross join lateral jsonb_array_elements(payload->'override'->'bracket') f
    where mode='best_placed' group by payload->>'drawId'
), booking as (
    select fixtures.*,jsonb_build_object(draw_id||':future:'||booked,
        jsonb_build_object('court_name','Court 9','scheduled_start','2035-06-07T19:00Z','scheduled_end','2035-06-07T20:00Z')) assignment
    from fixtures
)
update tournament_schedules s
set assignments=s.assignments||booking.assignment,published_assignments=s.published_assignments||booking.assignment,
    fixtures=s.fixtures||booking.rows
from booking where s.event_id=9901;
insert into host_review select 'override-plan-before',to_jsonb(s) from tournament_schedules s where event_id=9901;

-- An otherwise identical provisional fixture is incompatible if it booked a bye.
savepoint before_incompatible_booking;
update tournament_schedules s set assignments=s.assignments||jsonb_build_object(
    r.payload->>'drawId'||':future:'||(f->>'key'),
    jsonb_build_object('court_name','Court 3','scheduled_start','2035-06-07T17:00Z','scheduled_end','2035-06-07T18:00Z'))
from ranked_fixture_reference r cross join lateral jsonb_array_elements(r.payload->'override'->'bracket') f
where r.mode='best_placed' and f->>'result_type'='walkover' and s.event_id=9901;
set role authenticated;
select pg_temp.host_expect_error($$select pg_temp.ranked_qualify(payload)
    from host_review where fixture='best-placed-override'$$,'reserved courts use a different bracket');
rollback to before_incompatible_booking;
release before_incompatible_booking;

set role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.host_id(2)::text,false);
select pg_temp.expect_denied($$select pg_temp.ranked_qualify(payload) from host_review where fixture='best-placed-override'$$);
select set_config('request.jwt.claim.sub',pg_temp.host_id(4)::text,false);
select pg_temp.expect_denied($$select public.tm_host_group_qualification(pg_temp.host_id(11),9901,'qualify',payload)
    from host_review where fixture='best-placed-override'$$);
select pg_temp.host_expect_error($$select pg_temp.ranked_qualify(jsonb_set(payload,'{p_ranked_override,entry_ids}','[]'))
    from host_review where fixture='best-placed-override'$$,'exactly the saved number');
select pg_temp.host_expect_error($$select pg_temp.ranked_qualify(jsonb_set(payload,'{p_ranked_override,entry_ids}',
    jsonb_build_array(pg_temp.host_id(2012),pg_temp.host_id(2012)))) from host_review where fixture='best-placed-override'$$,'exactly the saved number');
select pg_temp.host_expect_error($$select pg_temp.ranked_qualify(jsonb_set(payload,'{p_ranked_override,entry_ids}',jsonb_build_array(pg_temp.host_id(2013))))
    from host_review where fixture='best-placed-override'$$,'exactly the saved number');
select pg_temp.host_expect_error($$select pg_temp.ranked_qualify(jsonb_set(payload,'{p_ranked_override,entry_ids}',jsonb_build_array(pg_temp.host_id(1012))))
    from host_review where fixture='best-placed-override'$$,'exactly the saved number');
select pg_temp.host_expect_error($$select pg_temp.ranked_qualify(jsonb_set(payload,'{p_ranked_override,entry_ids}',jsonb_build_array(pg_temp.host_id(2015))))
    from host_review where fixture='best-placed-override'$$,'use the automatic selection');
select pg_temp.host_expect_error($$select pg_temp.ranked_qualify(jsonb_set(payload,'{p_ranked_override,reason}',to_jsonb(E' \n\t'::text)))
    from host_review where fixture='best-placed-override'$$,'override reason of 1 to 500');
select pg_temp.host_expect_error($$select pg_temp.ranked_qualify(jsonb_set(payload,'{p_ranked_override,reason}',to_jsonb(repeat('a',501))))
    from host_review where fixture='best-placed-override'$$,'override reason of 1 to 500');
select pg_temp.host_expect_error($$select pg_temp.ranked_qualify(jsonb_set(payload,'{p_ranked_override,candidate_ids}',
    jsonb_build_array(pg_temp.host_id(2012),pg_temp.host_id(2015)))) from host_review where fixture='best-placed-override'$$,'eligible next-place teams changed');
select pg_temp.host_expect_error($$select pg_temp.ranked_qualify(jsonb_set(payload,'{p_ranked_qualifiers,2}',to_jsonb(pg_temp.host_id(2015))))
    from host_review where fixture='best-placed-override'$$,'ranked qualifiers changed');
select pg_temp.host_expect_error($$select pg_temp.ranked_qualify(jsonb_set(payload,'{p_matches}',pg_temp.ranked_request('best_placed')->'p_matches'))
    from host_review where fixture='best-placed-override'$$,'every qualified team');
reset role;

-- Test both kinds of stale evidence using actual stored rows.
savepoint before_group_correction;
update draw_matches set status='completed' where id=pg_temp.host_id(2032);
set role authenticated;
select pg_temp.host_expect_error($$select pg_temp.ranked_qualify(payload)
    from host_review where fixture='best-placed-override'$$,'reviewed group results changed');
reset role;
update draw_match_sets set entry_one_games=5 where match_id=pg_temp.host_id(2031) and set_number=1;
set role authenticated;
select pg_temp.host_expect_error($$select pg_temp.ranked_qualify(payload)
    from host_review where fixture='best-placed-override'$$,'reviewed group scores changed');
rollback to before_group_correction;
release before_group_correction;

do $$ begin
    if exists(select 1 from draw_matches where draw_id=pg_temp.host_id(311) and stage='knockout')
        or exists(select 1 from tournament_audit where event_id=9901 and details ? 'override_reason')
        or (select to_jsonb(s) from tournament_schedules s where event_id=9901)
            is distinct from (select payload from host_review where fixture='override-plan-before') then
        raise exception 'A rejected qualification override changed the bracket, audit or reservations';
    end if;
end $$;
set role authenticated;
select pg_temp.ranked_qualify(payload) from host_review where fixture='best-placed-override';
select pg_temp.host_expect_error($$select pg_temp.ranked_qualify(payload)
    from host_review where fixture='best-placed-override'$$,'draw changed');
reset role;

do $$
declare booked uuid; plan public.tournament_schedules;
begin
    select (f->>'id')::uuid into booked from ranked_fixture_reference
    cross join lateral jsonb_array_elements(payload->'override'->'bracket') f where mode='best_placed'
        and f->>'round_number'='1' and f->>'result_type' is null;
    select * into plan from tournament_schedules where event_id=9901;
    if not plan.published_assignments ? booked::text or not plan.assignments ? booked::text
        or not plan.assignments ? pg_temp.host_id(329)::text
        or not exists(select 1 from draw_matches where id=booked and court_name='Court 9'
            and scheduled_start=timestamptz '2035-06-07T19:00Z' and scheduled_end=timestamptz '2035-06-07T20:00Z')
        or plan.revision is distinct from (select (payload->>'revision')::integer+1 from host_review where fixture='ranked-plan-mapped')
        or (select count(*) from draw_matches where draw_id=pg_temp.host_id(311) and stage='knockout')<>3
        or not exists(select 1 from draw_matches where draw_id=pg_temp.host_id(311) and stage='knockout' and round_number=1
            and pg_temp.host_id(2012) in (entry_one_id,entry_two_id))
        or exists(select 1 from draw_matches where draw_id=pg_temp.host_id(311) and stage='knockout' and round_number=1
            and pg_temp.host_id(2015) in (entry_one_id,entry_two_id))
        or 1<>(select count(*) from tournament_audit where event_id=9901 and action='groups.qualified'
            and actor=pg_temp.host_id(4) and details->>'override_reason'='Checked with both group referees'
            and details->>'organisation_id'=pg_temp.host_id(10)::text
            and details->'override_entry_ids'=jsonb_build_array(pg_temp.host_id(2012))
            and details->'automatic_entry_ids'=jsonb_build_array(pg_temp.host_id(2015))
            and details->'eligible_entry_ids'=jsonb_build_array(pg_temp.host_id(2015),pg_temp.host_id(2012))) then
        raise exception 'The reviewed override lost its exact nominees, audit reason or compatible reservations';
    end if;
end $$;
rollback to before_host_override;
release before_host_override;
select 'Host best-placed override assertions passed' as result;

savepoint before_singletons;
insert into tournament_divisions(id,event_id,name) values(pg_temp.host_id(4390),9901,'Single-team groups');
insert into draws(id,event_id,division_id,draw_kind,format,status,group_count,scoring_rules)
values(pg_temp.host_id(4391),9901,pg_temp.host_id(4390),'main','group_knockout','published',2,'{"qualification":{"mode":"all"}}');
insert into draw_groups(id,draw_id,name,display_order) values
    (pg_temp.host_id(4392),pg_temp.host_id(4391),'Group 1',1),(pg_temp.host_id(4393),pg_temp.host_id(4391),'Group 2',2);
insert into draw_entries(id,draw_id,group_id,team_name,seed_number,player_one_name,player_two_name) values
    (pg_temp.host_id(4394),pg_temp.host_id(4391),pg_temp.host_id(4392),'One',1,'First','Partner'),
    (pg_temp.host_id(4395),pg_temp.host_id(4391),pg_temp.host_id(4393),'Two',2,'Second','Partner');
insert into host_review
select 'legacy-singletons',jsonb_build_object('p_draw',d.id,'p_expected',d.updated_at,'p_ranked_qualifiers',q.teams,
    'p_group_versions','{}'::jsonb,'p_group_results','{}'::jsonb,'p_group_sets','{}'::jsonb,
    'p_matches',jsonb_build_array(jsonb_build_object('id',pg_temp.host_id(4396),'stage','knockout','key','r1-m1',
        'round_number',1,'round_code','final','round_label','Final','bracket_position',1,
        'entry_one_id',q.teams[1],'entry_two_id',q.teams[2])))
from draws d cross join lateral (select private.tm_rank_group_qualifiers(d.id,'all',null,0,null) teams) q
where d.id=pg_temp.host_id(4391);
set role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.host_id(4)::text,false);
select pg_temp.ranked_qualify(payload) from host_review where fixture='legacy-singletons';
reset role;
do $$ begin
    if (select count(*) from draw_matches where draw_id=pg_temp.host_id(4391) and stage='knockout')<>1 then
        raise exception 'Single-team groups must feed one reviewed elimination match';
    end if;
end $$;
rollback to before_singletons;
release before_singletons;
select 'Host singleton group assertions passed' as result;
