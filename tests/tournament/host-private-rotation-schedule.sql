-- Both rotation variants start with the real host preparation APIs.
insert into calendar(id,event_name,start_date,organisation_id,is_manual,is_visible) values
    (9910,'Private individual dates','2035-07-07',pg_temp.host_id(10),true,false),
    (9911,'Private team dates','2035-07-07',pg_temp.host_id(10),true,true);
insert into tournament_divisions(id,event_id,name) values
    (pg_temp.host_id(411),9910,'Americano'),(pg_temp.host_id(412),9911,'Team Americano'),
    (pg_temp.host_id(413),9910,'Second division');
insert into event_play_days(event_id,play_date,start_time,end_time,courts_count,is_active)
values(9910,'2035-07-07','08:00','12:00',2,true),(9911,'2035-07-07','09:00','12:00',2,true);
insert into event_registrations(id,event_id,division_id,full_name,email,partner_name,partner_email,payment_status)
select pg_temp.host_id(n),case when n<424 then 9910 else 9911 end,pg_temp.host_id(case when n<424 then 411 else 412 end),
    'Planner '||n,'planner'||n||'@example.test',case when n>=424 then 'Planner Partner '||n end,
    case when n>=424 then 'plannerpartner'||n||'@example.test' end,'paid' from generate_series(420,425) n;
insert into players(id,name,email,license_type)
select 1000+n,'Planner '||n,'planner'||n||'@example.test','none' from generate_series(420,425) n
union all select 2000+n,'Planner Partner '||n,'plannerpartner'||n||'@example.test','none' from generate_series(424,425) n;
insert into annual_licenses(player_id,season_year,valid_from)
select id,2035,'2035-01-01' from players where id between 1420 and 1425 or id between 2424 and 2425;

create function pg_temp.private_rotation_state(team boolean) returns jsonb language sql as $$
    select case when team then jsonb_build_object('variant','team','players',pg_temp.rotation_players(424,425,true),
        'rounds',1,'points',24,'courts',1,'fixtures',jsonb_build_array(pg_temp.rotation_match(1,424,424,425,425,true)))
    else jsonb_build_object('players',pg_temp.rotation_players(420,423,false),'rounds',3,'points',24,'courts',1,'fixtures',
        jsonb_build_array(pg_temp.rotation_match(1,420,423,421,422),pg_temp.rotation_match(2,420,422,423,421),
            pg_temp.rotation_match(3,420,421,422,423))) end
$$;
create function pg_temp.create_private_rotation(event bigint,division integer,team boolean) returns void language plpgsql as $$
begin
    perform public.tm_host_draw_preparation(pg_temp.host_id(10),event,'confirm',jsonb_build_object(
        'p_division',pg_temp.host_id(division),'p_expected',0,'p_kind','players','p_payload','{}'::jsonb));
    perform public.tm_host_rotation_preparation(pg_temp.host_id(10),event,'confirm',jsonb_build_object(
        'p_division',pg_temp.host_id(division),'p_expected',1,'p_kind','format','p_payload',
        jsonb_build_object('format',case when team then 'team_americano' else 'americano' end,'points',24,'courts',1)));
    perform public.tm_host_rotation_preparation(pg_temp.host_id(10),event,'save_draw',jsonb_build_object(
        'p_division',pg_temp.host_id(division),'p_expected',2,'p_draw',jsonb_build_object('format','americano','rotation',pg_temp.private_rotation_state(team))));
end $$;
create function pg_temp.private_schedule_request(event bigint,n integer) returns jsonb language sql as $$
    with snapshot as (select public.tm_host_draw_preparation(pg_temp.host_id(10),event,'snapshot') data)
    select jsonb_build_object('p_draw',d->>'id','p_expected',d->>'updated_at','p_minutes',15,'p_rest',5,'p_match_versions',(
        select jsonb_object_agg(m->>'id',m->'updated_at') from jsonb_array_elements(data->'matches') m where m->>'draw_id'=d->>'id'))
    from snapshot cross join lateral jsonb_array_elements(data->'draws') d where d->>'division_id'=pg_temp.host_id(n)::text
$$;
create function pg_temp.private_plan_action(action text,event bigint,n integer,review text default null) returns jsonb language sql as $$
    select public.tm_host_rotation_schedule(pg_temp.host_id(10),event,action,pg_temp.private_schedule_request(event,n)||jsonb_build_object('p_review',review))
$$;
create function pg_temp.publish_private_rotation(event bigint,n integer) returns jsonb language sql as $$
    select public.tm_host_rotation_preparation(pg_temp.host_id(10),event,'publish_draw',jsonb_build_object(
        'p_draw',d->>'id','p_expected',d->>'updated_at','p_draw_token',d->>'_review_token'))
    from jsonb_array_elements(public.tm_host_draw_preparation(pg_temp.host_id(10),event,'snapshot')->'draws') d
    where d->>'division_id'=pg_temp.host_id(n)::text
$$;

insert into draws(id,event_id,division_id,draw_kind,format,status,scoring_rules)
values(pg_temp.host_id(430),9910,pg_temp.host_id(413),'main','knockout','published','{}');
insert into draw_matches(id,draw_id,stage,round_code,round_label,round_number,bracket_position,status,court_name,scheduled_start,scheduled_end)
values(pg_temp.host_id(431),pg_temp.host_id(430),'knockout','r1','Other schedule',1,1,'scheduled','Court 1','2035-07-07T06:00Z','2035-07-07T06:10Z');

set role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.host_id(4)::text,false);
select pg_temp.create_private_rotation(9910,411,false);
select pg_temp.create_private_rotation(9911,412,true);
select pg_temp.private_plan_action('apply_rotation_schedule',9910,411,pg_temp.private_plan_action('preview_rotation_schedule',9910,411)->>'review');
select pg_temp.private_plan_action('apply_rotation_schedule',9911,412,pg_temp.private_plan_action('preview_rotation_schedule',9911,412)->>'review');
insert into host_review values('private-first-times',pg_temp.private_plan_action('read_draft_rotation_schedule',9910,411)->'bookings');
select pg_temp.host_expect_error($$select pg_temp.publish_private_rotation(9910,411)$$,'make the event public');
select pg_temp.expect_denied($$select pg_temp.private_plan_action('read_draft_rotation_schedule',9910,412)$$);
select pg_temp.expect_denied($$select * from private.host_rotation_draft_schedules$$);
select set_config('request.jwt.claim.sub',pg_temp.host_id(2)::text,false);
select pg_temp.expect_denied($$select pg_temp.private_plan_action('read_draft_rotation_schedule',9910,411)$$);
reset role;

set role anon;
select pg_temp.expect_denied($$select * from private.host_rotation_draft_schedules$$);
do $$ begin
 if exists(select 1 from public.draws where event_id in(9910,9911) and format='americano') then
    raise exception 'An anonymous query could see a private rotation';
 end if;
end $$;
reset role;

do $$
declare d public.draws:=pg_temp.rotation_draw(411);
begin
    if d.status<>'draft' or (d.scoring_rules->'americano'->'fixtures'->0) ? 'scheduled_start'
        or exists(select 1 from draw_matches where draw_id=d.id and scheduled_start is not null) then
        raise exception 'Saving a draft plan exposed timing or wrote live court reservations';
    end if;
end $$;
select pg_temp.host_expect_error($$update draws set status='published' where id=(pg_temp.rotation_draw(411)).id$$,'publish this private court plan');
set role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.host_id(4)::text,false);
insert into host_review values('original-owner-request',pg_temp.private_schedule_request(9910,411));
reset role;
insert into organisation_members(organisation_id,user_email,role) values(pg_temp.host_id(11),'manager@example.test','admin');
update calendar set organisation_id=pg_temp.host_id(11) where id=9910;
set role authenticated;
select pg_temp.expect_denied($$select public.tm_host_rotation_schedule(pg_temp.host_id(10),9910,'read_draft_rotation_schedule',payload)
    from host_review where fixture='original-owner-request'$$);
do $$
declare reply jsonb;
begin
    select public.tm_host_rotation_schedule(pg_temp.host_id(11),9910,'read_draft_rotation_schedule',payload) into reply
    from host_review where fixture='original-owner-request';
    if reply->'bookings' is distinct from '[]'::jsonb or reply->>'stale' is distinct from 'true'
        then raise exception 'A transferred event revealed another organisation’s private court times'; end if;
end $$;
reset role;
update calendar set organisation_id=pg_temp.host_id(10) where id=9910;

update calendar set is_visible=true where id=9910;
update draw_matches set updated_at=clock_timestamp()
where draw_id=(pg_temp.rotation_draw(411)).id and americano_fixture_key='r1-m1';
set role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.host_id(4)::text,false);
do $$ begin
    if pg_temp.private_plan_action('read_draft_rotation_schedule',9910,411)->>'stale' is distinct from 'true'
        then raise exception 'A changed draft fixture did not mark the saved plan stale'; end if;
end $$;
select pg_temp.host_expect_error($$select pg_temp.publish_private_rotation(9910,411)$$,'no longer matches the fixtures');
select pg_temp.private_plan_action('apply_rotation_schedule',9910,411,pg_temp.private_plan_action('preview_rotation_schedule',9910,411)->>'review');
reset role;
update draw_matches set scheduled_start='2035-07-07T06:10Z',scheduled_end='2035-07-07T06:14Z' where id=pg_temp.host_id(431);
set role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.host_id(4)::text,false);
select pg_temp.host_expect_error($$select pg_temp.publish_private_rotation(9910,411)$$,'no longer available');
reset role;
do $$ begin
    if (pg_temp.rotation_draw(411)).status<>'draft' or exists(select 1 from draw_matches where
        draw_id=(pg_temp.rotation_draw(411)).id and scheduled_start is not null)
        or not exists(select 1 from private.host_rotation_draft_schedules where draw_id=(pg_temp.rotation_draw(411)).id) then
        raise exception 'Rejected publication did not preserve the private plan';
    end if;
end $$;

-- The earlier slot has become free. Publish the exact previously reviewed
-- 08:10 SAST booking and leave other divisions alone.
update draw_matches set scheduled_start=null,scheduled_end=null,status='pending' where id=pg_temp.host_id(431);
insert into tournament_schedules(event_id,source_fingerprint,fixtures)
values (9910,'first division plan',jsonb_build_array(jsonb_build_object('draw_id',(pg_temp.rotation_draw(411)).id)));
set role authenticated;
select pg_temp.host_expect_error($$select pg_temp.publish_private_rotation(9910,411)$$,'belongs to the Tournament Manager schedule');
reset role;
update tournament_schedules set fixtures=jsonb_build_array(jsonb_build_object('draw_id',pg_temp.host_id(430))) where event_id=9910;
insert into host_review select 'next-division-timetable',to_jsonb(s) from tournament_schedules s where event_id=9910;
set role authenticated;
select pg_temp.publish_private_rotation(9910,411);
select pg_temp.private_plan_action('discard_draft_rotation_schedule',9911,412);
select pg_temp.private_plan_action('apply_rotation_schedule',9911,412,pg_temp.private_plan_action('preview_rotation_schedule',9911,412)->>'review');
reset role;

-- The ordinary assigned Tournament Manager publish path uses the same projection.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
select public.tm_set_access(9911,'results@example.test',array['draws']);
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
select public.tm_publish_draw(9911,(d->>'id')::uuid,(d->>'updated_at')::timestamptz)
from jsonb_array_elements(public.tm_snapshot(9911)->'draws') d where d->>'division_id'=pg_temp.host_id(412)::text;
reset role;

set role anon;
do $$
declare first_draw public.draws:=pg_temp.rotation_draw(411);
        team_draw public.draws:=pg_temp.rotation_draw(412);
begin
    if first_draw.status is distinct from 'published' or team_draw.status is distinct from 'published'
        or (first_draw.scoring_rules->'americano'->'fixtures'->0->>'scheduled_start')::timestamptz is distinct from timestamptz '2035-07-07T06:10Z'
        or (select scheduled_start from draw_matches where draw_id=first_draw.id and americano_fixture_key='r1-m1')
            is distinct from timestamptz '2035-07-07T06:10Z'
        or (select scheduled_start from draw_matches where draw_id=team_draw.id and americano_fixture_key='r1-m1')
            is distinct from timestamptz '2035-07-07T07:00Z' then
        raise exception 'The reviewed timing projections did not become available on publication';
    end if;
end $$;
reset role;
do $$ begin
    if exists(select 1 from private.host_rotation_draft_schedules where draw_id in((pg_temp.rotation_draw(411)).id,(pg_temp.rotation_draw(412)).id))
        or (select to_jsonb(s) from tournament_schedules s where event_id=9910)
            is distinct from (select payload from host_review where fixture='next-division-timetable')
        or not exists(select 1 from tournament_audit where event_id=9910 and action='rotation.draft_courts_published' and actor=pg_temp.host_id(4)) then
        raise exception 'Publication did not preserve another timetable or clean up its private plan';
    end if;
end $$;
select 'Private rotation court publication assertions passed' as result;
