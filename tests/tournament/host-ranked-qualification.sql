-- Compare the stored-result calculator with the real native JS reference.
grant select on ranked_fixture_reference to authenticated;
insert into tournament_divisions(id,event_id,name) values
    (pg_temp.host_id(65),9901,'All teams'),(pg_temp.host_id(66),9901,'Best placed');
insert into draws(id,event_id,division_id,draw_kind,format,status,group_count,advancers_per_group,scoring_rules)
select (payload->>'drawId')::uuid,9901,pg_temp.host_id(case when mode='all' then 65 else 66 end),
    'main','group_knockout','published',2,case when mode='all' then null else 1 end,
    jsonb_build_object('qualification',jsonb_build_object('mode',mode,'extras',case when mode='all' then 0 else 1 end))
from ranked_fixture_reference;
insert into draw_groups(id,draw_id,name,display_order)
select (g->>'id')::uuid,(payload->>'drawId')::uuid,g->>'name',n
from ranked_fixture_reference cross join lateral jsonb_array_elements(payload->'groups') with ordinality items(g,n);
insert into draw_entries(id,draw_id,group_id,team_name,seed_number,player_one_name,player_two_name)
select e.id,e.draw_id,e.group_id,e.team_name,e.seed_number,e.team_name||' Player',e.team_name||' Partner'
from ranked_fixture_reference cross join lateral jsonb_to_recordset(payload->'entries')
    e(id uuid,draw_id uuid,group_id uuid,team_name text,seed_number integer);
insert into draw_matches(id,draw_id,group_id,stage,round_number,round_code,round_label,bracket_position,
    entry_one_id,entry_two_id,winner_entry_id,status,result_summary)
select m.id,m.draw_id,m.group_id,'group',1,'group_r1','Round 1',
    row_number() over(partition by m.group_id order by m.id),m.entry_one_id,m.entry_two_id,m.winner_entry_id,m.status,m.result_summary
from ranked_fixture_reference cross join lateral jsonb_to_recordset(payload->'matches')
    m(id uuid,draw_id uuid,group_id uuid,entry_one_id uuid,entry_two_id uuid,winner_entry_id uuid,status text,result_summary smallint[]);
insert into draw_match_sets(match_id,set_number,entry_one_games,entry_two_games)
select s.match_id,s.set_number,s.entry_one_games,s.entry_two_games
from ranked_fixture_reference cross join lateral jsonb_to_recordset(payload->'matchSets')
    s(match_id uuid,set_number integer,entry_one_games integer,entry_two_games integer);

do $$
declare sample record;
begin
    for sample in select * from ranked_fixture_reference loop
        if to_jsonb(private.tm_rank_group_qualifiers((sample.payload->>'drawId')::uuid,sample.mode,1,1,null))
            is distinct from sample.payload->'ranked' then raise exception 'Native JS ranked qualifiers differ for %',sample.mode; end if;
        if to_jsonb(private.tm_rank_group_qualifiers((sample.payload->>'drawId')::uuid,sample.mode,1,1,sample.payload->'lotRules'))
            is distinct from sample.payload->'lotOrdered' then raise exception 'Native JS lots differ for %',sample.mode; end if;
    end loop;
    if (select payload->'ranked'->>2 from ranked_fixture_reference where mode='best_placed')
        is distinct from pg_temp.host_id(2015)::text then raise exception 'Unequal groups selected the wrong extra team'; end if;
end $$;

create function pg_temp.ranked_request(wanted text) returns jsonb language sql as $$
    select jsonb_build_object('p_draw',d.id,'p_expected',d.updated_at,'p_matches',r.payload->'bracket','p_ranked_qualifiers',r.payload->'ranked',
        'p_group_versions',(select jsonb_object_agg(m.id::text,m.updated_at) from draw_matches m where m.draw_id=d.id and m.stage='group'),
        'p_group_results',(select jsonb_object_agg(m.id::text,jsonb_build_array(m.group_id,m.entry_one_id,m.entry_two_id,m.winner_entry_id,m.status,m.result_summary))
            from draw_matches m where m.draw_id=d.id and m.stage='group'),
        'p_group_sets',(select coalesce(jsonb_object_agg(m.id::text||':'||s.set_number,jsonb_build_array(s.entry_one_games,s.entry_two_games,s.is_match_tiebreak)),'{}')
            from draw_match_sets s join draw_matches m on m.id=s.match_id where m.draw_id=d.id and m.stage='group'))
    from ranked_fixture_reference r join draws d on d.id=(r.payload->>'drawId')::uuid where r.mode=wanted
$$;
create function pg_temp.ranked_qualify(request jsonb) returns jsonb language sql as $$
    select public.tm_host_group_qualification(pg_temp.host_id(10),9901,'qualify',request)
$$;
insert into host_review values('ranked-all-previous',pg_temp.ranked_request('all'));
update draw_matches set result_summary=array[1,0]::smallint[] where id=pg_temp.host_id(1032);

-- Keep the mock group matches and the other draw's schedule alongside this
-- draw's provisional slots. Book the known bye on purpose, then remove it.
with example as (select payload from ranked_fixture_reference where mode='all'),
mapped as (
    select payload->>'drawId' draw_id,
      jsonb_agg(jsonb_build_object('id',payload->>'drawId'||':future:'||(f->>'key'),'draw_id',payload->>'drawId',
        'virtual',true,'metadata','Preserve '||(payload->>'drawId')||':future:r1-m10')) fixtures,
      min(f->>'key') filter(where f->>'result_type'='walkover') bye,
      max(f->>'key') filter(where f->>'result_type' is null) booked
    from example cross join lateral jsonb_array_elements(payload->'bracket') f group by payload->>'drawId'
)
update tournament_schedules s set
    assignments=s.assignments||jsonb_build_object(draw_id||':future:'||bye,
        jsonb_build_object('court_name','Court 3','scheduled_start','2035-06-07T15:00Z','scheduled_end','2035-06-07T16:00Z'),
        draw_id||':future:'||booked,jsonb_build_object('court_name','Court 4','scheduled_start','2035-06-07T16:00Z','scheduled_end','2035-06-07T17:00Z'),
        pg_temp.host_id(329)::text,jsonb_build_object('court_name','Court 6','scheduled_start','2035-06-07T18:00Z','scheduled_end','2035-06-07T19:00Z')),
    published_assignments=s.published_assignments||jsonb_build_object(draw_id||':future:'||booked,
        jsonb_build_object('court_name','Court 4','scheduled_start','2035-06-07T16:00Z','scheduled_end','2035-06-07T17:00Z')),
    fixtures=s.fixtures||mapped.fixtures||jsonb_build_array(jsonb_build_object('id',pg_temp.host_id(1031),'draw_id',draw_id,'stage','group'))
from mapped where s.event_id=9901;
insert into host_review select 'ranked-plan-before',to_jsonb(s) from tournament_schedules s where event_id=9901;

set role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.host_id(2)::text,false);
select pg_temp.expect_denied($$select pg_temp.ranked_qualify(pg_temp.ranked_request('best_placed'))$$);
select set_config('request.jwt.claim.sub',pg_temp.host_id(4)::text,false);
select pg_temp.expect_denied($$select public.tm_host_group_qualification(pg_temp.host_id(11),9901,'qualify',pg_temp.ranked_request('all'))$$);
select pg_temp.host_expect_error($$select pg_temp.ranked_qualify(payload) from host_review where fixture='ranked-all-previous'$$,'reviewed group results changed');
select pg_temp.host_expect_error($$select pg_temp.ranked_qualify(jsonb_set(pg_temp.ranked_request('best_placed'),
    '{p_ranked_qualifiers,2}',to_jsonb(pg_temp.host_id(2012))))$$,'ranked qualifiers changed');
select pg_temp.host_expect_error($$select pg_temp.ranked_qualify(pg_temp.ranked_request('all'))$$,'reserved courts use a different bracket');
select pg_temp.host_expect_error($$select pg_temp.ranked_qualify(jsonb_set(pg_temp.ranked_request('all'),
    '{p_matches,0,id}',to_jsonb(pg_temp.host_id(329))))$$,'conflicts with an existing court reservation');
reset role;

do $$ begin
    if (select to_jsonb(s) from tournament_schedules s where event_id=9901)
        is distinct from (select payload from host_review where fixture='ranked-plan-before')
        or exists(select 1 from draw_matches where draw_id=pg_temp.host_id(310) and stage='knockout') then
        raise exception 'A rejected qualification altered existing reservations';
    end if;
end $$;
update tournament_schedules s set assignments=s.assignments-(
    select (payload->>'drawId')||':future:'||min(f->>'key')
    from ranked_fixture_reference cross join lateral jsonb_array_elements(payload->'bracket') f
    where mode='all' and f->>'result_type'='walkover' group by payload->>'drawId'
) where s.event_id=9901;
set role authenticated;
select pg_temp.ranked_qualify(pg_temp.ranked_request('all'));
reset role;
insert into host_review select 'ranked-plan-mapped',to_jsonb(s) from tournament_schedules s where event_id=9901;
\ir host-ranked-override.sql
set role authenticated;
select pg_temp.ranked_qualify(pg_temp.ranked_request('best_placed'));
reset role;

do $$
declare booked uuid; plan public.tournament_schedules;
begin
    select (f->>'id')::uuid into booked from ranked_fixture_reference cross join lateral jsonb_array_elements(payload->'bracket') f
    where mode='all' and f->>'result_type' is null order by f->>'key' desc limit 1;
    select * into plan from tournament_schedules where event_id=9901;
    if not plan.published_assignments ? booked::text or not plan.assignments ? pg_temp.host_id(329)::text
        or (select court_name from draw_matches where id=booked)<>'Court 4'
        or (select scheduled_start from draw_matches where id=booked) is distinct from timestamptz '2035-06-07T16:00Z'
        or plan.revision<>(select (payload->>'revision')::integer+1 from host_review where fixture='ranked-plan-before')
        or not exists(select 1 from jsonb_array_elements(plan.fixtures) f where f->>'metadata'='Preserve '||pg_temp.host_id(310)||':future:r1-m10')
        or not exists(select 1 from jsonb_array_elements(plan.fixtures) f where f->>'id'=pg_temp.host_id(1031)::text)
        or exists(select 1 from jsonb_array_elements(plan.fixtures) f where starts_with(f->>'id',pg_temp.host_id(310)||':future:'))
        or to_jsonb(plan) is distinct from (select payload from host_review where fixture='ranked-plan-mapped')
        or (select count(*) from draw_matches where draw_id=pg_temp.host_id(310) and stage='knockout')<>7
        or (select count(*) from draw_matches where draw_id=pg_temp.host_id(311) and stage='knockout')<>3
        or not exists(select 1 from tournament_audit where event_id=9901 and action='groups.qualified'
            and details->>'mode'='best_placed' and details->'ranked_qualifiers'->>2=pg_temp.host_id(2015)::text) then
        raise exception 'Ranked qualification altered reservations or lost its exact placements';
    end if;
end $$;
select 'Host ranked qualification assertions passed' as result;
