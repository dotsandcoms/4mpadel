-- Synthetic rotations, reviewed South Africa play days and overlapping bookings.
insert into calendar(id,event_name,start_date,organisation_id,is_manual,is_visible) values
    (9906,'Americano court fixture','2035-06-07',pg_temp.host_id(10),true,true),
    (9907,'Team court fixture','2035-06-07',pg_temp.host_id(10),true,true),
    (9908,'Foreign court fixture','2035-06-07',pg_temp.host_id(11),true,true);
insert into tournament_divisions(id,event_id,name) values
    (pg_temp.host_id(361),9906,'Rotation'),(pg_temp.host_id(362),9906,'Other draw'),
    (pg_temp.host_id(363),9907,'Team rotation'),(pg_temp.host_id(364),9908,'Foreign rotation');
insert into event_play_days(event_id,play_date,start_time,end_time,courts_count,is_active,is_removed)
values(9906,'2035-06-07','08:00','12:00',2,true,false),(9906,'2035-06-08','08:00','12:00',2,true,false),
    (9906,'2035-06-09','08:00','12:00',2,true,true),(9907,'2035-06-08','08:00','12:00',2,true,false),
    (9907,'2035-06-09','09:00','12:00',2,true,false);
insert into draw_player_reviews(division_id,event_id,state) values
    (pg_temp.host_id(361),9906,'{"workflow":{"play_dates":["2035-06-08"]}}');
insert into tournament_workspace(event_id,settings) values(9907,jsonb_build_object('divisionDays',
    jsonb_build_object(pg_temp.host_id(363)::text,jsonb_build_array('2035-06-09'))));
insert into event_registrations(id,event_id,division_id,full_name,email,partner_name,partner_email,payment_status)
select pg_temp.host_id(n),case when n<304 then 9906 when n<306 then 9907 else 9908 end,
    pg_temp.host_id(case when n<304 then 361 when n<306 then 363 else 364 end),
    'Court Player '||n,'court'||n||'@example.test',case when n>=304 then 'Court Partner '||n end,
    case when n>=304 then 'courtpartner'||n||'@example.test' end,'paid' from generate_series(300,307) n;
insert into draws(id,event_id,division_id,draw_kind,format,status,scoring_rules) values
    (pg_temp.host_id(371),9906,pg_temp.host_id(361),'main','americano','in_progress',jsonb_build_object('americano',
        jsonb_build_object('players',pg_temp.rotation_players(300,303,false),'rounds',3,'courts',1,'points',24,'fixtures',jsonb_build_array(
            pg_temp.rotation_match(1,300,303,301,302)||'{"score":[15,9],"scheduled_start":"2035-06-08T06:00:00Z","scheduled_end":"2035-06-08T06:20:00Z"}',
            pg_temp.rotation_match(2,300,302,303,301),pg_temp.rotation_match(3,300,301,302,303))))),
    (pg_temp.host_id(372),9906,pg_temp.host_id(362),'main','knockout','published','{}'),
    (pg_temp.host_id(373),9907,pg_temp.host_id(363),'main','americano','published',jsonb_build_object('americano',
        jsonb_build_object('variant','team','players',pg_temp.rotation_players(304,305,true),'rounds',1,'courts',1,'points',24,
            'fixtures',jsonb_build_array(pg_temp.rotation_match(1,304,304,305,305,true))))),
    (pg_temp.host_id(374),9908,pg_temp.host_id(364),'main','americano','published','{}');
insert into draw_entries(id,draw_id,team_name,player_one_name,snapshot)
values(pg_temp.host_id(380),pg_temp.host_id(372),'Other draw team','Shared player','{"registration_email":"court300@example.test"}'),
    (pg_temp.host_id(381),pg_temp.host_id(372),'Opponent','Another player','{"registration_email":"other@example.test"}');
insert into draw_matches(id,draw_id,stage,round_code,round_label,round_number,bracket_position,status,
    americano_fixture_key,court_name,scheduled_start,scheduled_end,entry_one_id,entry_two_id)
values(pg_temp.host_id(390),pg_temp.host_id(371),'group','americano_r1','Round 1',1,1,'completed','r1-m1','Court 1',
    '2035-06-08T06:00Z','2035-06-08T06:20Z',null,null),
    (pg_temp.host_id(391),pg_temp.host_id(371),'group','americano_r2','Round 2',2,1,'pending','r2-m1','Court 1',null,null,null,null),
    (pg_temp.host_id(392),pg_temp.host_id(371),'group','americano_r3','Round 3',3,1,'pending','r3-m1','Court 1',null,null,null,null),
    (pg_temp.host_id(393),pg_temp.host_id(373),'group','americano_r1','Round 1',1,1,'pending','r1-m1','Court 1',null,null,null,null),
    (pg_temp.host_id(394),pg_temp.host_id(372),'knockout','r1','Other A',1,1,'scheduled',null,'Court 1',
        '2035-06-08T06:25Z','2035-06-08T06:35Z',null,null),
    (pg_temp.host_id(395),pg_temp.host_id(372),'knockout','r2','Other B',2,1,'scheduled',null,'Court 2',
        '2035-06-08T06:35Z','2035-06-08T06:45Z',pg_temp.host_id(380),pg_temp.host_id(381)),
    (pg_temp.host_id(396),pg_temp.host_id(372),'knockout','r3','Other C',3,1,'pending',null,null,null,null,null,null);
insert into tournament_schedules(event_id,source_fingerprint,assignments,fixtures)
values(9906,'other division work',jsonb_build_object(pg_temp.host_id(396)::text,
    jsonb_build_object('court_name','Court 1','scheduled_start','2035-06-08T07:05Z','scheduled_end','2035-06-08T07:20Z')),
    jsonb_build_array(jsonb_build_object('id',pg_temp.host_id(396),'draw_id',pg_temp.host_id(372))));
insert into host_review select 'schedule-plan-original',to_jsonb(s) from tournament_schedules s where event_id=9906;
insert into host_review select 'schedule-played-original',to_jsonb(m) from draw_matches m where id=pg_temp.host_id(390);

create function pg_temp.schedule_request(selected_draw integer) returns jsonb language sql as $$
    select jsonb_build_object('p_draw',d.id,'p_expected',d.updated_at,'p_minutes',15,'p_rest',5,'p_match_versions',(
        select jsonb_object_agg(m.id::text,m.updated_at) from draw_matches m where m.draw_id=d.id))
    from draws d where d.id=pg_temp.host_id(selected_draw)
$$;
create function pg_temp.rotation_schedule(action text,event_id bigint,request jsonb) returns jsonb language sql as $$
    select public.tm_host_rotation_schedule(pg_temp.host_id(10),event_id,action,request)
$$;
create function pg_temp.court_preview(event_id bigint,selected_draw integer) returns jsonb language sql as $$
    select pg_temp.rotation_schedule('preview_rotation_schedule',event_id,pg_temp.schedule_request(selected_draw))
$$;

set role anon;
select pg_temp.host_expect_error($$select public.tm_host_rotation_schedule(null,9906,'preview_rotation_schedule','{}')$$,'permission denied');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.host_id(2)::text,false);
select pg_temp.expect_denied($$select pg_temp.court_preview(9906,371)$$);
select set_config('request.jwt.claim.sub',pg_temp.host_id(3)::text,false);
select pg_temp.expect_denied($$select pg_temp.court_preview(9906,371)$$);
select set_config('request.jwt.claim.sub',pg_temp.host_id(4)::text,false);
select pg_temp.expect_denied($$select pg_temp.court_preview(9906,372)$$);
select pg_temp.expect_denied($$select pg_temp.court_preview(9908,374)$$);
select pg_temp.expect_denied($$select pg_temp.court_preview(9906,373)$$);
select pg_temp.expect_denied($$select pg_temp.rotation_schedule('save_score',9906,pg_temp.schedule_request(371))$$);
select pg_temp.host_expect_error($$select pg_temp.rotation_schedule('preview_rotation_schedule',9906,
    jsonb_set(pg_temp.schedule_request(371),'{p_match_versions}','{}'))$$,'fixtures changed');
select pg_temp.host_expect_error($$select pg_temp.rotation_schedule('preview_rotation_schedule',9906,
    jsonb_set(pg_temp.schedule_request(371),'{p_minutes}','0'))$$,'whole match and rest');
insert into host_review values('schedule-reviewed',pg_temp.court_preview(9906,371));
do $$
declare result jsonb:=(select payload from host_review where fixture='schedule-reviewed');
begin
    if result->>'review' is distinct from pg_temp.court_preview(9906,371)->>'review'
        or jsonb_array_length(result->'bookings')<>2
        or (result->'bookings'->0->>'starts')::timestamptz is distinct from timestamptz '2035-06-08T06:45Z'
        or (result->'bookings'->1->>'starts')::timestamptz is distinct from timestamptz '2035-06-08T07:20Z'
        or exists(select 1 from draw_matches where id in(pg_temp.host_id(391),pg_temp.host_id(392)) and scheduled_start is not null)
        then raise exception 'SAST scheduling, conflict avoidance or read-only preview failed: %',result; end if;
end $$;
reset role;
update draw_matches set scheduled_end='2035-06-08T06:50Z',updated_at=clock_timestamp() where id=pg_temp.host_id(395);

set role authenticated;
select pg_temp.host_expect_error($$select pg_temp.rotation_schedule('apply_rotation_schedule',9906,
    pg_temp.schedule_request(371)||jsonb_build_object('p_review',payload->>'review')) from host_review where fixture='schedule-reviewed'$$,
    'court plan changed');
reset role;
update tournament_schedules set fixtures=fixtures||jsonb_build_array(jsonb_build_object('id',pg_temp.host_id(391),'draw_id',pg_temp.host_id(371)))
where event_id=9906;
set role authenticated;
select pg_temp.host_expect_error($$select pg_temp.court_preview(9906,371)$$,'belongs to the Tournament Manager schedule');
reset role;
update tournament_schedules set fixtures=fixtures-1 where event_id=9906;
set role authenticated;
select pg_temp.rotation_schedule('apply_rotation_schedule',9906,pg_temp.schedule_request(371)
    ||jsonb_build_object('p_review',pg_temp.court_preview(9906,371)->>'review'));
select pg_temp.rotation_schedule('apply_rotation_schedule',9907,pg_temp.schedule_request(373)
    ||jsonb_build_object('p_review',pg_temp.court_preview(9907,373)->>'review'));
reset role;

do $$
declare saved jsonb;
begin
    select scoring_rules->'americano'->'fixtures' into saved from draws where id=pg_temp.host_id(371);
    if (select to_jsonb(s) from tournament_schedules s where event_id=9906)
        is distinct from (select payload from host_review where fixture='schedule-plan-original')
        or (select to_jsonb(m) from draw_matches m where id=pg_temp.host_id(390))
        is distinct from (select payload from host_review where fixture='schedule-played-original')
        or saved->0->'score' is distinct from '[15,9]'::jsonb
        or (saved->1->>'scheduled_start')::timestamptz is distinct from timestamptz '2035-06-08T06:50Z'
        or (select scheduled_start from draw_matches where id=pg_temp.host_id(391)) is distinct from timestamptz '2035-06-08T06:50Z'
        or (select scheduled_start from draw_matches where id=pg_temp.host_id(392)) is distinct from timestamptz '2035-06-08T07:20Z'
        or (select scheduled_start from draw_matches where id=pg_temp.host_id(393)) is distinct from timestamptz '2035-06-09T07:00Z'
        or (select scheduled_start from draw_matches where id=pg_temp.host_id(396)) is not null
        or not exists(select 1 from tournament_audit where event_id=9906 and action='rotation.courts_saved' and actor=pg_temp.host_id(4)) then
        raise exception 'The scoped schedule failed to preserve an existing result, booking or plan';
    end if;
end $$;
select 'Host rotation court schedule assertions passed' as result;
