-- Exact organisation, role, draft graph, revisions, and retained TM grants.
create function pg_temp.host_id(n integer) returns uuid language sql immutable strict
as $$ select ('71110000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid $$;
create function pg_temp.host_expect_error(statement text, expected text) returns void language plpgsql as $$
begin
    begin execute statement; exception when others then
        if sqlerrm ilike '%' || expected || '%' then return; end if;
        raise;
    end;
    raise exception 'Expected % from %',expected,statement;
end;
$$;

insert into auth.users(id,email,raw_user_meta_data) values
    (pg_temp.host_id(1),'host@example.test','{}'), (pg_temp.host_id(2),'viewer@example.test','{}'),
    (pg_temp.host_id(3),'inactive@example.test','{"inactive":true}'), (pg_temp.host_id(4),'manager@example.test','{}');
insert into organisations values (pg_temp.host_id(10),'approved'),(pg_temp.host_id(11),'approved'),(pg_temp.host_id(12),'pending');
insert into organisation_members values
    (pg_temp.host_id(10),' Host@Example.Test ','owner'), (pg_temp.host_id(10),'viewer@example.test','member'),
    (pg_temp.host_id(10),'inactive@example.test','admin'), (pg_temp.host_id(10),'manager@example.test','admin'),
    (pg_temp.host_id(12),'host@example.test','owner');
insert into calendar(id,event_name,start_date,is_manual,organisation_id,event_status,is_visible) values
    (9901,'Host Draw Fixture','2035-06-07',true,pg_temp.host_id(10),null,true),
    (9902,'Other Host Fixture','2035-06-07',true,pg_temp.host_id(11),null,true),
    (9903,'Unapproved Host Fixture','2035-06-07',true,pg_temp.host_id(12),null,true),
    (9904,'Cancelled Fixture','2035-06-07',true,pg_temp.host_id(10),'cancelled',true),
    (9905,'Imported Fixture','2035-06-07',false,pg_temp.host_id(10),null,true);
insert into tournament_divisions(id,event_id,name,is_active) values
    (pg_temp.host_id(20),9901,'Knockout',true),(pg_temp.host_id(21),9901,'Groups',true),
    (pg_temp.host_id(22),9901,'Inactive',false),(pg_temp.host_id(23),9902,'Foreign',true);
insert into event_registrations(id,event_id,division_id,full_name,email,partner_name,partner_email,payment_status)
select pg_temp.host_id(n),9901,pg_temp.host_id(case when n<34 then 20 else 21 end),'Player '||n,'one'||n||'@example.test',
    'Partner '||n,'two'||n||'@example.test','paid'
from generate_series(31,37) n;
insert into players(id,name,email,license_type) select n,'Player '||n,'one'||n||'@example.test','none' from generate_series(31,37) n;
insert into players(id,name,email,license_type) select n+100,'Partner '||n,'two'||n||'@example.test','none' from generate_series(31,37) n;
insert into annual_licenses(player_id,season_year,valid_from)
select id,2035,'2035-01-01' from players where id between 31 and 37 or id between 131 and 137;
insert into temporary_licenses(player_id,event_id) values(31,9902);
insert into draws(id,event_id,division_id,format,status,draw_kind)
values(pg_temp.host_id(240),9902,pg_temp.host_id(23),'group_only','draft','main');
insert into draw_groups(id,draw_id,name,display_order) values(pg_temp.host_id(241),pg_temp.host_id(240),'Foreign',0);
insert into draw_matches(id,draw_id,group_id,stage,round_code,round_label,round_number,bracket_position,status)
values(pg_temp.host_id(242),pg_temp.host_id(240),pg_temp.host_id(241),'group','r1','Foreign',1,1,'pending');

create temporary table host_review(fixture text primary key, payload jsonb);
grant select,insert,update on host_review to authenticated;
create function pg_temp.host_match(n integer, round_number integer, match_position integer, stage text, group_num integer,
        one integer, two integer, winner integer, destination integer default null, slot integer default null)
returns jsonb language sql immutable as $$
    select jsonb_build_object('id',pg_temp.host_id(n),'round_number',round_number,'bracket_position',match_position,
        'round_code','r'||round_number,'round_label','Round '||round_number,'stage',stage,'group_id',pg_temp.host_id(group_num),
        'entry_one_id',pg_temp.host_id(one),'entry_two_id',pg_temp.host_id(two),'winner_entry_id',pg_temp.host_id(winner),
        'winner_to_match_id',pg_temp.host_id(destination),'winner_to_slot',slot,'result_type',case when winner is not null then 'walkover' end)
$$;
create function pg_temp.host_rpc(action text,payload jsonb default '{}') returns jsonb language sql
as $$ select public.tm_host_draw_preparation(pg_temp.host_id(10),9901,action,payload) $$;
create function pg_temp.host_confirm(division_num integer,kind text,revision integer,details jsonb) returns jsonb language sql
as $$ select pg_temp.host_rpc('confirm',jsonb_build_object('p_division',pg_temp.host_id(division_num),
    'p_kind',kind,'p_expected',revision,'p_payload',details)) $$;
create function pg_temp.host_save(division_num integer,revision integer,draw jsonb,token text default null) returns jsonb language sql
as $$ select pg_temp.host_rpc('save_draw',jsonb_build_object('p_division',pg_temp.host_id(division_num),
    'p_expected',revision,'p_draw',draw,'p_draw_token',token)) $$;
create function pg_temp.host_publish(snapshot jsonb) returns jsonb language sql
as $$ select pg_temp.host_rpc('publish_draw',jsonb_build_object('p_draw',snapshot->>'id',
    'p_expected',snapshot->>'updated_at','p_draw_token',snapshot->>'_review_token')) $$;
insert into host_review values
    ('knockout', jsonb_build_object('format','knockout','groups','[]'::jsonb,
        'entries',(select jsonb_agg(jsonb_build_object('id',pg_temp.host_id(n+50),'source_registration_id',pg_temp.host_id(n)) order by n)
            from generate_series(31,33) n),
        'matches',jsonb_build_array(
            pg_temp.host_match(100,1,1,'knockout',null,81,null,81,102,1),
            pg_temp.host_match(101,1,2,'knockout',null,82,83,null,102,2),
            pg_temp.host_match(102,2,1,'knockout',null,81,null,null)
        ))),
    ('groups',jsonb_build_object('format','group_knockout',
        'groups',jsonb_build_array(jsonb_build_object('id',pg_temp.host_id(140),'name','A','display_order',0),
            jsonb_build_object('id',pg_temp.host_id(141),'name','B','display_order',1)),
        'entries',(select jsonb_agg(jsonb_build_object('id',pg_temp.host_id(n+50),'source_registration_id',pg_temp.host_id(n),
            'group_id',pg_temp.host_id(case when n<36 then 140 else 141 end)) order by n)
            from generate_series(34,37) n),
        'matches',jsonb_build_array(pg_temp.host_match(150,1,1,'group',140,84,85,null),
            pg_temp.host_match(151,1,1,'group',141,86,87,null))));
set role anon;
select pg_temp.host_expect_error($$select public.tm_host_draw_preparation(null,9901,'snapshot')$$,'permission denied');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.host_id(1)::text,false);
do $$
declare snapshot jsonb;
begin
    snapshot := pg_temp.host_rpc('snapshot');
    if snapshot->>'organisationId' <> pg_temp.host_id(10)::text
       or snapshot->'event'->>'id' <> '9901' or snapshot->'event'->>'is_visible' <> 'true'
       or snapshot->'capabilities' <> '["host_players_review","seeds","draws"]'::jsonb
       or jsonb_array_length(snapshot->'divisions') <> 2 or jsonb_array_length(snapshot->'registrations') <> 7
       or exists(select 1 from jsonb_array_elements(snapshot->'registrations') r where r ? '_revision' or r ? 'pay_token')
       or exists(select 1 from jsonb_array_elements(snapshot->'players') p where p->'temporary_licenses' <> '[]'::jsonb)
       or snapshot->'access' <> '[]'::jsonb or snapshot->'audit' <> '[]'::jsonb
       or snapshot->'schedule' <> 'null'::jsonb or snapshot->'finalisations' <> '[]'::jsonb then
        raise exception 'Unexpected scoped snapshot: %',snapshot;
    end if;
    if public.tm_capabilities(9901)<>'{}' or exists(select 1 from jsonb_array_elements(public.tm_list_events()) e where e->>'id'='9901')
        then raise exception 'Host access changed ordinary grants'; end if;
end $$;
select pg_temp.expect_denied($$select tm_snapshot(9901)$$);
select pg_temp.expect_denied($$select tm_save_registration(9901,null,null,'{}',null)$$);
select pg_temp.expect_denied($$select tm_save_draw(9901,null,0,'{}')$$);
select pg_temp.expect_denied($$select tm_publish_draw(9901,null,null)$$);
select pg_temp.expect_denied($$select tm_publish_schedule(9901,1)$$);
select pg_temp.expect_denied($$select pg_temp.host_rpc('record_result')$$);
select pg_temp.expect_denied($$select pg_temp.host_rpc('qualify')$$);
select pg_temp.expect_denied($$select pg_temp.host_rpc('finalise')$$);
select pg_temp.expect_denied($$select pg_temp.host_rpc('set_access')$$);
select pg_temp.expect_denied($$select public.tm_host_draw_preparation(pg_temp.host_id(11),9902,'snapshot')$$);
select pg_temp.expect_denied($$select public.tm_host_draw_preparation(pg_temp.host_id(10),9902,'snapshot')$$);
select pg_temp.expect_denied($$select public.tm_host_draw_preparation(pg_temp.host_id(12),9903,'snapshot')$$);
select pg_temp.expect_denied($$select public.tm_host_draw_preparation(pg_temp.host_id(10),9904,'snapshot')$$);
select pg_temp.expect_denied($$select public.tm_host_draw_preparation(pg_temp.host_id(10),9905,'snapshot')$$);
select pg_temp.expect_denied($$select pg_temp.host_confirm(22,'players',0,'{}')$$);
select pg_temp.expect_denied($$select pg_temp.host_confirm(23,'players',0,'{}')$$);
select pg_temp.expect_denied($$select pg_temp.host_publish(jsonb_build_object('id',pg_temp.host_id(240)))$$);
select set_config('request.jwt.claim.sub',pg_temp.host_id(2)::text,false);
select pg_temp.expect_denied($$select pg_temp.host_rpc('snapshot')$$);
select set_config('request.jwt.claim.sub',pg_temp.host_id(3)::text,false);
select pg_temp.expect_denied($$select pg_temp.host_rpc('snapshot')$$);
select set_config('request.jwt.claim.sub',pg_temp.host_id(4)::text,false);
select pg_temp.host_confirm(20,'players',0,'{}');
select pg_temp.host_expect_error($$select pg_temp.host_confirm(20,'format',1,'{"format":"americano"}')$$,'fixed-pair');
select pg_temp.host_expect_error($$select pg_temp.host_confirm(20,'format',null,'{"format":"knockout"}')$$,'preparation changed');
select pg_temp.host_expect_error($$select pg_temp.host_confirm(20,'format_and_seeds',1,
    '{"configuration":{"format":"knockout"},"seeds":["wrong"]}')$$,'ineligible registrations');
select pg_temp.host_confirm(20,'format_and_seeds',1,'{"configuration":{"format":"knockout"},"seeds":[]}');
select pg_temp.host_expect_error($$select pg_temp.host_save(20,2,payload) from host_review where fixture='knockout'$$,'current players, seeds and format');
select pg_temp.host_expect_error($$select pg_temp.host_save(20,3,jsonb_set(payload,'{matches,0,winner_to_match_id}',to_jsonb(pg_temp.host_id(242)))) from host_review where fixture='knockout'$$,'feeder belongs to another draw');
select pg_temp.host_expect_error($$select pg_temp.host_save(20,3,jsonb_set(payload,'{matches,0,winner_to_slot}','null')) from host_review where fixture='knockout'$$,'invalid or already occupied slot');
select pg_temp.host_expect_error($$select pg_temp.host_save(20,3,jsonb_set(payload,'{matches,0,winner_to_slot}','2')) from host_review where fixture='knockout'$$,'invalid or already occupied slot');
select pg_temp.host_expect_error($$select pg_temp.host_save(20,3,jsonb_set(payload,'{matches,2,winner_to_slot}','1')) from host_review where fixture='knockout'$$,'invalid or already occupied slot');
select pg_temp.host_expect_error($$select pg_temp.host_save(20,3,jsonb_set(payload,'{matches,0,winner_entry_id}',to_jsonb(pg_temp.host_id(82)))) from host_review where fixture='knockout'$$,'invalid entrants');
select pg_temp.host_save(20,3,payload) from host_review where fixture='knockout';
insert into host_review select 'draft',pg_temp.host_rpc('snapshot')->'draws'->0;
select pg_temp.host_expect_error($$select pg_temp.host_save(20,3,payload) from host_review where fixture='knockout'$$,'saved draw changed');
reset role;
set role anon;
do $$ begin
    if exists(select 1 from draws where event_id=9901) or exists(select 1 from draw_matches where id=pg_temp.host_id(100))
        then raise exception 'A private host draft leaked to anon'; end if;
end $$;
reset role;

update draw_matches set round_label='Moved since review' where id=pg_temp.host_id(100);
set role authenticated;
select pg_temp.host_expect_error($$select pg_temp.host_publish(payload) from host_review where fixture='draft'$$,'saved draw changed');
update host_review set payload=pg_temp.host_rpc('snapshot')->'draws'->0 where fixture='draft';
select pg_temp.host_expect_error($$select pg_temp.host_publish(payload-'updated_at') from host_review where fixture='draft'$$,'reload and preview again');
reset role;
update calendar set is_visible=false where id=9901;
set role authenticated;
select pg_temp.host_expect_error($$select pg_temp.host_publish(payload) from host_review where fixture='draft'$$,'make the event public');
reset role;
update calendar set is_visible=true where id=9901;
set role authenticated;
select pg_temp.host_publish(payload) from host_review where fixture='draft';
select pg_temp.host_confirm(21,'players',0,'{}');
select pg_temp.host_confirm(21,'format_and_seeds',1,'{"configuration":{"format":"group_knockout","groups":2,"advancers":1},"seeds":[]}');
select pg_temp.host_expect_error($$select pg_temp.host_save(21,3,jsonb_set(payload,'{matches,0,group_id}',to_jsonb(pg_temp.host_id(241)))) from host_review where fixture='groups'$$,'different draw or group');
select pg_temp.host_expect_error($$select pg_temp.host_save(21,3,jsonb_set(payload,'{matches,0,entry_two_id}',to_jsonb(pg_temp.host_id(86)))) from host_review where fixture='groups'$$,'different draw or group');
select pg_temp.host_expect_error($$select pg_temp.host_save(21,3,payload #- '{matches,0}') from host_review where fixture='groups'$$,'each pairing exactly once');
select pg_temp.host_save(21,3,payload) from host_review where fixture='groups';
select pg_temp.host_publish(d) from jsonb_array_elements(pg_temp.host_rpc('snapshot')->'draws') d where d->>'division_id'=pg_temp.host_id(21)::text;
reset role;
set role anon;
do $$ begin
    if (select count(*) from draws where event_id=9901 and status='published') <> 2
        or (select count(*) from draw_matches m join draws d on d.id=m.draw_id where d.event_id=9901) <> 5
        then raise exception 'Published host rollout missed complete fixture sets'; end if;
end $$;
reset role;
select 'Host tournament draw assertions passed' as result;
