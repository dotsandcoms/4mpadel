-- Test both host rotation variants against the same verified event and roster.
insert into tournament_divisions(id,event_id,name) values
    (pg_temp.host_id(60),9901,'Americano'),(pg_temp.host_id(61),9901,'Team Americano');
insert into event_registrations(id,event_id,division_id,full_name,email,partner_name,partner_email,payment_status)
select pg_temp.host_id(n),9901,pg_temp.host_id(case when n<45 then 60 else 61 end),
    'Rotation '||n,'rotation'||n||'@example.test',
    case when n>=45 then 'Rotation Partner '||n end,case when n>=45 then 'rotationpartner'||n||'@example.test' end,'paid'
from generate_series(41,47) n;
insert into players(id,name,email,license_type)
select 200+n,'Rotation '||n,'rotation'||n||'@example.test','none' from generate_series(41,47) n
union all select 300+n,'Rotation Partner '||n,'rotationpartner'||n||'@example.test','none' from generate_series(45,47) n;
insert into annual_licenses(player_id,season_year,valid_from)
select id,2035,'2035-01-01' from players where id between 241 and 247 or id between 345 and 347;

create function pg_temp.rotation_players(min_id integer,max_id integer,with_partners boolean) returns jsonb language sql as $$
    select jsonb_agg(jsonb_build_object('id',pg_temp.host_id(n)::text||part.suffix,
        'name','Client-supplied name','email','private@example.test') order by n,part.suffix)
    from generate_series(min_id,max_id) n
    cross join lateral (select '' suffix union all select ':partner' where with_partners) part
$$;
create function pg_temp.rotation_match(r integer, a integer,b integer,c integer,d integer, team boolean default false)
returns jsonb language sql as $$
    select jsonb_build_object('id','r'||r||'-m1','round',r,'court',1,'wave',1,'score',null,
        'one',jsonb_build_array(pg_temp.host_id(a)::text,pg_temp.host_id(b)::text||case when team then ':partner' else '' end),
        'two',jsonb_build_array(pg_temp.host_id(c)::text,pg_temp.host_id(d)::text||case when team then ':partner' else '' end))
$$;
insert into host_review values
    ('rotation',jsonb_build_object('players',pg_temp.rotation_players(41,44,false),'rounds',3,'courts',1,'points',24,
        'fixtures',jsonb_build_array(pg_temp.rotation_match(1,41,44,42,43),
            pg_temp.rotation_match(2,41,43,44,42),pg_temp.rotation_match(3,41,42,43,44)))),
    ('rotation-team',jsonb_build_object('players',pg_temp.rotation_players(45,47,true),'rounds',3,'courts',1,'points',24,'variant','team',
        'fixtures',jsonb_build_array(pg_temp.rotation_match(1,46,46,47,47,true),
            pg_temp.rotation_match(2,45,45,47,47,true),pg_temp.rotation_match(3,45,45,46,46,true))));
create function pg_temp.rotation_rpc(action text,payload jsonb) returns jsonb language sql as $$
    select public.tm_host_rotation_preparation(pg_temp.host_id(10),9901,action,payload)
$$;
create function pg_temp.rotation_confirm(n integer,kind text,revision integer) returns jsonb language sql as $$
    select pg_temp.rotation_rpc('confirm',jsonb_build_object('p_division',pg_temp.host_id(n),'p_kind','format',
        'p_expected',revision,'p_payload',jsonb_build_object('format',kind,'points',24,'courts',1)))
$$;
create function pg_temp.rotation_save(n integer,revision integer,state jsonb,token text default null) returns jsonb language sql as $$
    select pg_temp.rotation_rpc('save_draw',jsonb_build_object('p_division',pg_temp.host_id(n),'p_expected',revision,
        'p_draw_token',token,'p_draw',jsonb_build_object('format','americano','rotation',state)))
$$;
create function pg_temp.rotation_publish(draft jsonb) returns jsonb language sql as $$
    select pg_temp.rotation_rpc('publish_draw',jsonb_build_object('p_draw',draft->>'id',
        'p_expected',draft->>'updated_at','p_draw_token',draft->>'_review_token'))
$$;

set role anon;
select pg_temp.host_expect_error($$select public.tm_host_rotation_preparation(null,9901,'confirm','{}')$$,'permission denied');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.host_id(2)::text,false);
select pg_temp.expect_denied($$select pg_temp.rotation_confirm(60,'americano',1)$$);
select set_config('request.jwt.claim.sub',pg_temp.host_id(3)::text,false);
select pg_temp.expect_denied($$select pg_temp.rotation_confirm(60,'americano',1)$$);
select set_config('request.jwt.claim.sub',pg_temp.host_id(4)::text,false);
select pg_temp.expect_denied($$select public.tm_host_rotation_preparation(pg_temp.host_id(11),9901,'confirm','{}')$$);
select pg_temp.expect_denied($$select public.tm_host_rotation_preparation(pg_temp.host_id(10),9902,'confirm','{}')$$);
select pg_temp.expect_denied($$select pg_temp.rotation_rpc('record_result','{}')$$);
select pg_temp.expect_denied($$select pg_temp.rotation_rpc('save_schedule','{}')$$);
select pg_temp.host_expect_error($$select pg_temp.rotation_confirm(60,'americano',0)$$,'confirm the current player list');
select pg_temp.host_confirm(60,'players',0,'{}');
select pg_temp.rotation_confirm(60,'americano',1);
select pg_temp.host_expect_error($$select pg_temp.rotation_save(60,1,payload) from host_review where fixture='rotation'$$,'confirm the current players');
select pg_temp.host_expect_error($$select pg_temp.rotation_save(60,2,jsonb_set(payload,'{players,0,id}',to_jsonb(pg_temp.host_id(45)))) from host_review where fixture='rotation'$$,'include each reviewed eligible entrant');
select pg_temp.host_expect_error($$select pg_temp.rotation_save(60,2,jsonb_set(payload,'{fixtures,0,score}','[15,9]')) from host_review where fixture='rotation'$$,'invalid or repeated player');
select pg_temp.host_expect_error($$select pg_temp.rotation_save(60,2,jsonb_set(payload,'{fixtures,0,scheduled_start}','"2035-06-07T08:00:00Z"')) from host_review where fixture='rotation'$$,'invalid or repeated player');
select pg_temp.host_expect_error($$select pg_temp.rotation_save(60,2,jsonb_set(payload,'{fixtures,0,one,0}',to_jsonb(pg_temp.host_id(42)))) from host_review where fixture='rotation'$$,'invalid or repeated player');
select pg_temp.host_expect_error($$select pg_temp.rotation_save(60,2,jsonb_set(payload,'{fixtures,2}',
    pg_temp.rotation_match(3,41,44,42,43))) from host_review where fixture='rotation'$$,'cannot play together more than once');
select pg_temp.rotation_save(60,2,payload) from host_review where fixture='rotation';
insert into host_review select 'rotation-draft',d from jsonb_array_elements(pg_temp.host_rpc('snapshot')->'draws') d
where d->>'division_id'=pg_temp.host_id(60)::text;
select pg_temp.host_expect_error($$select pg_temp.rotation_save(60,2,payload) from host_review where fixture='rotation'$$,'saved draw changed');
reset role;
set role anon;
do $$ begin if exists(select 1 from draws where division_id=pg_temp.host_id(60))
    then raise exception 'Private rotation is visible'; end if; end $$;
reset role;

update draw_matches set notes='Other operator edited draft' where id=(select min(id::text)::uuid from draw_matches
    where draw_id=(select (payload->>'id')::uuid from host_review where fixture='rotation-draft'));
set role authenticated;
select pg_temp.host_expect_error($$select pg_temp.rotation_publish(payload) from host_review where fixture='rotation-draft'$$,'saved draw changed');
update host_review set payload=(select d from jsonb_array_elements(pg_temp.host_rpc('snapshot')->'draws') d
    where d->>'division_id'=pg_temp.host_id(60)::text) where fixture='rotation-draft';
select pg_temp.rotation_publish(payload) from host_review where fixture='rotation-draft';
select pg_temp.host_confirm(61,'players',0,'{}');
select pg_temp.rotation_confirm(61,'team_americano',1);
select pg_temp.host_expect_error($$select pg_temp.rotation_save(61,2,jsonb_set(payload,'{fixtures,0,one,1}',
    to_jsonb(pg_temp.host_id(45)::text||':partner'))) from host_review where fixture='rotation-team'$$,'invalid or repeated player');
select pg_temp.host_expect_error($$select pg_temp.rotation_save(61,2,jsonb_set(payload,'{fixtures,2}',
    pg_temp.rotation_match(3,46,46,47,47,true))) from host_review where fixture='rotation-team'$$,'meet each other team once');
select pg_temp.rotation_save(61,2,payload) from host_review where fixture='rotation-team';
select pg_temp.rotation_publish(d) from jsonb_array_elements(pg_temp.host_rpc('snapshot')->'draws') d
where d->>'division_id'=pg_temp.host_id(61)::text;
reset role;
set role anon;
do $$
declare rotation jsonb; team jsonb;
begin
    select scoring_rules->'americano' into rotation from draws where division_id=pg_temp.host_id(60) and status='published';
    select scoring_rules->'americano' into team from draws where division_id=pg_temp.host_id(61) and status='published';
    if rotation is null or team is null or jsonb_array_length(team->'rests') <> 3 or jsonb_array_length(team->'teams') <> 3
        or rotation::text like '%@example.test%' or team::text like '%@example.test%'
        or rotation::text like '%Client-supplied%' or team::text like '%Client-supplied%'
        or rotation->'players'->0->>'name' <> 'Rotation 41'
        or (select count(*) from draw_matches m join draws d on d.id=m.draw_id
            where d.division_id in(pg_temp.host_id(60),pg_temp.host_id(61)) and m.scheduled_start is null and m.status='pending') <> 6 then
        raise exception 'Published rotations are incomplete or contain untrusted player data';
    end if;
end $$;
reset role;
select 'Host rotation assertions passed' as result;
