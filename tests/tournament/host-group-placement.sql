-- Compare the canonical database graph to the actual generator for a range of
-- sizes, placements, custom prerequisites and opening byes.
do $$
declare sample record;
begin
    for sample in select * from finishing_place_reference loop
        begin
            perform private.tm_validate_group_placement(sample.bracket,sample.qualifies,
                private.tm_group_elimination_plan(sample.teams,sample.plate,sample.playoff));
        exception when others then
            raise exception 'Bracket differs for % teams % plate % playoff: %',sample.teams,sample.plate,sample.playoff,sqlerrm;
        end;
    end loop;
end $$;

savepoint before_host_placement;
update draws set scoring_rules='{"qualification":{"mode":"best_placed","extras":2},"plate_mode":"double","playoff_mode":"top4"}'
where id=pg_temp.host_id(311);
insert into host_review
select 'best-placed-finishing-places', pg_temp.ranked_request('best_placed') || jsonb_build_object(
    'p_matches',payload->'finishingPlaces'->'bracket','p_ranked_qualifiers',payload->'finishingPlaces'->'ranked')
from ranked_fixture_reference where mode='best_placed';
with expected as (
    select payload->>'drawId' draw_id, f->>'key' placement_key, f->>'id' real_match
    from ranked_fixture_reference cross join lateral jsonb_array_elements(payload->'finishingPlaces'->'bracket') f
    where mode='best_placed' and f->>'stage'='placement'
), fixture_set as (
    select draw_id, placement_key, real_match,jsonb_agg(jsonb_build_object(
        'id',draw_id||':future:'||(f->>'key'),'draw_id',draw_id,'stage',f->>'stage','virtual',true)) fixtures
    from expected cross join ranked_fixture_reference cross join lateral jsonb_array_elements(payload->'finishingPlaces'->'bracket') f
    where mode='best_placed' group by draw_id,placement_key,real_match
), booking as (
    select fixture_set.*,jsonb_build_object(draw_id||':future:'||placement_key,jsonb_build_object(
        'court_name','Court 7','scheduled_start','2035-06-07T20:00Z','scheduled_end','2035-06-07T21:00Z')) assignment
    from fixture_set
)
update tournament_schedules s
set assignments=s.assignments||booking.assignment,published_assignments=s.published_assignments||booking.assignment,
    fixtures=s.fixtures||booking.fixtures
from booking where s.event_id=9901;
insert into host_review select 'placement-plan-before',to_jsonb(s) from tournament_schedules s where event_id=9901;
update host_review set payload=payload||jsonb_build_object('p_group_booking_token',
    private.tm_group_booking_review(9901,pg_temp.host_id(311))->'token')
where fixture='best-placed-finishing-places';

-- Exercise the actual Schedule validator with the same graph. Host
-- qualification still does not grant the host privilege to save a schedule.
savepoint before_placement_schedule_contract;
update tournament_divisions set is_active=(id=pg_temp.host_id(66)) where event_id=9901;
insert into event_play_days(event_id,play_date,start_time,end_time,courts_count,match_duration_minutes,minimum_break_minutes)
values(9901,'2035-06-07','06:00','22:00',9,30,10)
on conflict(event_id,play_date) do update set start_time='06:00',end_time='22:00',courts_count=9,minimum_break_minutes=10,is_active=true,is_removed=false;
with booking AS (
    select (payload->>'drawId')||':future:'||(f->>'key') booking_key,payload->>'drawId' draw_id,
        (f->>'stage') stage,row_number() over(order by (f->>'round_number')::integer,(f->>'bracket_position')::integer) n
    from ranked_fixture_reference cross join lateral jsonb_array_elements(payload->'finishingPlaces'->'bracket') f
    where mode='best_placed'
)
insert into host_review
select 'finish-place-scheduler-input',jsonb_build_object(
    'fixtures',jsonb_agg(jsonb_build_object('id',booking_key,'draw_id',draw_id,'stage',stage)),
    'assignments',jsonb_object_agg(booking_key,jsonb_build_object('court_name','Court 1',
        'scheduled_start',timestamptz '2035-06-07 07:00Z' + make_interval(hours=>n::integer),
        'scheduled_end',timestamptz '2035-06-07 07:30Z' + make_interval(hours=>n::integer))))
from booking;
select public.tm_validate_schedule(9901,payload->'assignments',payload->'fixtures','{"rest":10}') from host_review
where fixture='finish-place-scheduler-input';
select pg_temp.host_expect_error($$select public.tm_validate_schedule(9901,
    (payload->'assignments')-(pg_temp.host_id(311)::text||':future:places_3_4_r1_m1'),payload->'fixtures','{"rest":10}')
    from host_review where fixture='finish-place-scheduler-input'$$,'reserve the exact elimination and placement rounds');
select pg_temp.host_expect_error($$select public.tm_validate_schedule(9901,
    (payload->'assignments')||jsonb_build_object(pg_temp.host_id(311)::text||':future:places_3_4_r1_m1',
        jsonb_build_object('court_name','Court 1','scheduled_start','2035-06-07T07:00Z','scheduled_end','2035-06-07T07:30Z')),
    payload->'fixtures','{"rest":10}') from host_review where fixture='finish-place-scheduler-input'$$,'a predecessor must finish');
select pg_temp.host_expect_error($$select public.tm_validate_schedule(9901,
    (payload->'assignments')||jsonb_build_object(pg_temp.host_id(311)::text||':future:made-up',
        jsonb_build_object('court_name','Court 1','scheduled_start','2035-06-07T12:00Z','scheduled_end','2035-06-07T12:30Z')),
    payload->'fixtures','{"rest":10}') from host_review where fixture='finish-place-scheduler-input'$$,'unknown or unplayable provisional');
rollback to before_placement_schedule_contract;
release before_placement_schedule_contract;

-- A scheduler changing either plan invalidates a host's old review even if
-- the organiser's draw and its completed group scores are untouched.
savepoint before_reservation_change;
update tournament_schedules set assignments=jsonb_set(assignments,
    array[pg_temp.host_id(311)::text||':future:places_3_4_r1_m1','court_name'],'"Court 8"') where event_id=9901;
set role authenticated;
select pg_temp.host_expect_error($$select pg_temp.ranked_qualify(payload)
    from host_review where fixture='best-placed-finishing-places'$$,'reserved court times changed');
rollback to before_reservation_change;
release before_reservation_change;

set role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.host_id(2)::text,false);
select pg_temp.expect_denied($$select pg_temp.ranked_qualify(payload) from host_review where fixture='best-placed-finishing-places'$$);
select set_config('request.jwt.claim.sub',pg_temp.host_id(4)::text,false);
select pg_temp.host_expect_error($$select pg_temp.ranked_qualify(payload #- '{p_matches,3}')
    from host_review where fixture='best-placed-finishing-places'$$,'finishing-place route');
select pg_temp.host_expect_error($$select pg_temp.ranked_qualify(jsonb_set(payload,'{p_matches,0,loser_to_slot}','2'))
    from host_review where fixture='best-placed-finishing-places'$$,'finishing-place route');
select pg_temp.host_expect_error($$select pg_temp.ranked_qualify(jsonb_set(payload,'{p_matches,3,entry_one_id}',to_jsonb(pg_temp.host_id(2013))))
    from host_review where fixture='best-placed-finishing-places'$$,'finishing-place route');
select pg_temp.host_expect_error($$select pg_temp.ranked_qualify(jsonb_set(payload,'{p_matches,0,entry_one_id}',to_jsonb(pg_temp.host_id(2013))))
    from host_review where fixture='best-placed-finishing-places'$$,'finishing-place route');
select pg_temp.host_expect_error($$select pg_temp.ranked_qualify(payload - 'p_group_booking_token')
    from host_review where fixture='best-placed-finishing-places'$$,'reserved court times changed');
select pg_temp.host_expect_error($$select pg_temp.ranked_qualify(jsonb_set(payload,'{p_group_versions}','{}'))
    from host_review where fixture='best-placed-finishing-places'$$,'finish and review every');
reset role;

do $$ begin
    if (select to_jsonb(s) from tournament_schedules s where event_id=9901)
        is distinct from (select payload from host_review where fixture='placement-plan-before')
        or exists(select 1 from draw_matches where draw_id=pg_temp.host_id(311) and stage<>'group') then
        raise exception 'A rejected placement changed existing fixtures and reservations';
    end if;
end $$;

set role authenticated;
select pg_temp.ranked_qualify(payload) from host_review where fixture='best-placed-finishing-places';
select pg_temp.host_expect_error($$select pg_temp.ranked_qualify(payload)
    from host_review where fixture='best-placed-finishing-places'$$,'draw changed');
reset role;

do $$
declare placement public.draw_matches; schedule public.tournament_schedules;
begin
    select * into strict placement from draw_matches where draw_id=pg_temp.host_id(311) and stage='placement';
    select * into schedule from tournament_schedules where event_id=9901;
    if placement.round_code<>'places_3_4_r1' or placement.court_name<>'Court 7'
        or placement.scheduled_start is distinct from timestamptz '2035-06-07 20:00Z'
        or placement.scheduled_end is distinct from timestamptz '2035-06-07 21:00Z'
        or not schedule.assignments ? placement.id::text
        or not schedule.published_assignments ? placement.id::text
        or not schedule.assignments ? pg_temp.host_id(329)::text
        or (select array_agg(loser_to_slot order by bracket_position) from draw_matches where loser_to_match_id=placement.id)
            is distinct from array[1,2]::smallint[]
        or not exists(select 1 from tournament_audit where event_id=9901 and actor=pg_temp.host_id(4)
            and action='groups.qualified' and details->>'plate_mode'='double' and details->>'playoff_mode'='top4')
    then raise exception 'Placement did not preserve the exact feeds, court and audit'; end if;

    update draw_matches set status='completed',winner_entry_id=entry_one_id,loser_entry_id=entry_two_id
    where loser_to_match_id=placement.id;
    perform public.tm_resolve_routes(pg_temp.host_id(311));
    if (select array[m.entry_one_id,m.entry_two_id] from draw_matches m where m.id=placement.id)
        is distinct from (select array_agg(loser_entry_id order by loser_to_slot) from draw_matches f where f.loser_to_match_id=placement.id)
    then raise exception 'The exact semifinal losers did not reach their reserved placement fixture'; end if;
end $$;
rollback to before_host_placement;
release before_host_placement;
select 'Host placement and court reservation assertions passed' as result;
