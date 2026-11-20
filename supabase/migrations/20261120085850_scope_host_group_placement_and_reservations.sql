-- Build the same future bracket keys and feeds as nativeDrawGenerator and
-- drawBackplates. Inputs come from the saved division rules and qualifier count.
create function private.tm_group_elimination_plan(p_teams integer,p_plate jsonb,p_playoff text)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
    fixture record;
    fixture_plan jsonb:='{}';
    entrants integer;
    predecessors jsonb;
    total_rounds integer;
    bracket integer;
    custom boolean:=jsonb_typeof(p_plate)='array';
    plate text:=case when jsonb_typeof(p_plate)='array' then 'all' else coalesce(p_plate #>> '{}','none') end;
    top_four boolean:=p_playoff in ('top4','top8');
    top_eight boolean:=p_playoff='top8';
begin
    if p_teams is null or p_teams not between 2 and 512 or plate not in ('none','double','triple','all')
        or coalesce(p_playoff,'none') not in ('none','top4','top8') then
        raise exception 'Review the saved elimination and placement settings';
    end if;
    select n into total_rounds from generate_series(1,9) n where 1<<n>=p_teams order by n limit 1;
    bracket:=1<<total_rounds;
    if top_eight and bracket<8 then raise exception 'Top 8 placement requires an 8-slot elimination draw'; end if;

    for fixture in
        with recursive seed_order(level,seeds) as (
            values(1,array[1,2])
            union all
            select level+1,array(
                select mirrored.seed from unnest(s.seeds) with ordinality slots(seed,pos)
                cross join lateral unnest(case when pos%2=1 then array[slots.seed,(1<<(s.level+1))+1-slots.seed]
                    else array[(1<<(s.level+1))+1-slots.seed,slots.seed] end) with ordinality mirrored(seed,pos)
                order by slots.pos,mirrored.pos)
            from seed_order s where level<total_rounds
        ), roots(path,main_round,low,width,full_tree) as (
            select array[0],total_rounds-2,5,4,true where top_eight
            union all
            select array[r],r,(bracket>>r)+1,bracket>>r,plate='all'
            from generate_series(1,total_rounds-1) r
            where (plate='all' or (plate in ('double','triple') and r=1))
                and not (top_eight and bracket>>r=4)
        ), branches(path,source_round,low,width,full_tree) as (
            select path,main_round,low,width,full_tree from roots
            union all
            select b.path||i,i,b.low+(b.width>>i),b.width>>i,b.full_tree
            from branches b cross join generate_series(1,total_rounds-1) i
            where b.width>>i>=2 and (b.full_tree or (plate='triple' and cardinality(b.path)=1 and i=1))
        ), indexed as (
            select b.*,
                'places_'||low||'_'||(low+width-1) placement_key,
                total_rounds+coalesce(sum(log(2,width)::integer) over(order by path rows between unbounded preceding and 1 preceding),0)::integer round_base
            from branches b
        ), rows as (
            select 'r'||r||'-m'||pos key,'knockout' stage,r round_number,pos bracket_position,
                'r'||(total_rounds-r+1) round_code,
                case total_rounds-r when 0 then 'Final' when 1 then 'Semifinals' when 2 then 'Quarterfinals'
                    else 'Round of '||(1<<(total_rounds-r+1)) end round_label,
                case when r=1 then seed_order.seeds[2*pos-1]<=p_teams end opening_one,
                case when r=1 then seed_order.seeds[2*pos]<=p_teams end opening_two,
                case when r>1 then 'r'||(r-1)||'-m' end source_prefix,'winner' source_kind
            from seed_order cross join generate_series(1,total_rounds) r
            cross join lateral generate_series(1,bracket>>r) pos where seed_order.level=total_rounds
            union all
            select 'placement-3-4','placement',total_rounds,2,'3_4','3rd place playoff',
                null,null,'r'||(total_rounds-1)||'-m','loser'
            where top_four and total_rounds>=2 and plate<>'all' and not (bracket=4 and plate in ('double','triple'))
            union all
            select b.placement_key||'_r'||local_round||'_m'||pos,'placement',b.round_base+local_round,pos,
                b.placement_key||'_r'||local_round,
                'Places '||b.low||'–'||(b.low+b.width-1)||' · '||case when b.width>>(local_round-1)=2
                    then 'Final' else 'Round of '||(b.width>>(local_round-1)) end,
                null,null,
                case when local_round>1 then b.placement_key||'_r'||(local_round-1)||'_m'
                    when parent.path is null then 'r'||b.source_round||'-m'
                    else parent.placement_key||'_r'||b.source_round||'_m' end,
                case when local_round>1 then 'winner' else 'loser' end
            from indexed b left join indexed parent on parent.path=b.path[1:cardinality(b.path)-1]
            cross join lateral generate_series(1,log(2,b.width)::integer) local_round
            cross join lateral generate_series(1,b.width>>local_round) pos
        ), feeds as (
            select target.key target,slot,target.source_kind kind,
                target.source_prefix||case when target.key='placement-3-4' then slot
                    else 2*target.bracket_position-2+slot end source
            from rows target cross join generate_series(1,2) slot where target.source_prefix is not null
        ), retained(key) as (
            select r.key from rows r cross join lateral (
                select regexp_replace(r.round_code,'_r[0-9]+$','') placement_key
            ) branch
            where not coalesce(custom,false) or r.stage='knockout' or p_plate ? branch.placement_key
                or (top_four and branch.placement_key='places_3_4')
                or (top_eight and branch.placement_key in ('places_5_8','places_7_8'))
            union
            select feeds.source from retained join feeds on feeds.target=retained.key
        ), exact_feeds as (
            select feeds.* from feeds join retained on retained.key=feeds.target
        )
        select r.*, incoming.one_source,incoming.two_source,
            winner.target winner_target,winner.slot winner_slot,loser.target loser_target,loser.slot loser_slot
        from rows r join retained on retained.key=r.key
        left join exact_feeds winner on winner.source=r.key and winner.kind='winner'
        left join exact_feeds loser on loser.source=r.key and loser.kind='loser'
        cross join lateral (select min(source) filter(where slot=1) one_source,min(source) filter(where slot=2) two_source
            from exact_feeds where target=r.key) incoming
        order by r.round_number,r.bracket_position
    loop
        if fixture.opening_one is not null then
            entrants:=fixture.opening_one::integer+fixture.opening_two::integer;
        else
            entrants:=case when fixture.source_kind='loser' then 2 else 1 end;
            entrants:=(((fixture_plan->fixture.one_source->>'entry_count')::integer>=entrants)::integer
                + ((fixture_plan->fixture.two_source->>'entry_count')::integer>=entrants)::integer);
        end if;
        if entrants is null then raise exception 'A finishing-place fixture has an incomplete route'; end if;
        select coalesce(jsonb_agg(distinct dependency.key),'[]') into predecessors
        from unnest(array[fixture.one_source,fixture.two_source]) feed(key)
        cross join lateral jsonb_array_elements_text(case when (fixture_plan->feed.key->>'entry_count')::integer=2
            then jsonb_build_array(feed.key) else fixture_plan->feed.key->'predecessors' end) dependency(key);
        fixture_plan:=fixture_plan||jsonb_build_object(fixture.key,
            to_jsonb(fixture)-'key'-'source_prefix'-'source_kind'
                || jsonb_build_object('entry_count',entrants,'predecessors',predecessors));
    end loop;
    return fixture_plan;
end;
$$;

create function private.tm_validate_group_placement(p_matches jsonb,p_qualifiers uuid[],p_plan jsonb)
returns void language plpgsql immutable set search_path = '' as $$
begin
    if jsonb_typeof(p_matches) is distinct from 'array' then
        raise exception 'Review the complete placement bracket before continuing';
    end if;
    if jsonb_array_length(p_matches)<>(select count(*) from jsonb_object_keys(p_plan))
        or exists (
            with rows as (
                select * from jsonb_to_recordset(p_matches) m(
                    id uuid,key text,stage text,round_number integer,bracket_position integer,round_code text,round_label text,
                    group_id uuid,entry_one_id uuid,entry_two_id uuid,winner_entry_id uuid,result_type text,
                    winner_to_match_id uuid,winner_to_slot integer,loser_to_match_id uuid,loser_to_slot integer)
            )
            select 1 from rows m
            left join rows winner on winner.key=p_plan->m.key->>'winner_target'
            left join rows loser on loser.key=p_plan->m.key->>'loser_target'
            left join rows first on first.key=p_plan->m.key->>'one_source'
            left join rows second on second.key=p_plan->m.key->>'two_source'
            where m.id is null or m.group_id is not null or not coalesce(p_plan ? m.key,false)
                or (m.stage,m.round_number,m.bracket_position,m.round_code,m.round_label)
                    is distinct from (p_plan->m.key->>'stage',(p_plan->m.key->>'round_number')::integer,
                        (p_plan->m.key->>'bracket_position')::integer,p_plan->m.key->>'round_code',p_plan->m.key->>'round_label')
                or (m.winner_to_match_id,m.winner_to_slot,m.loser_to_match_id,m.loser_to_slot)
                    is distinct from (winner.id,(p_plan->m.key->>'winner_slot')::integer,loser.id,(p_plan->m.key->>'loser_slot')::integer)
                or (case when m.round_number=1 and m.stage='knockout' then
                        (m.entry_one_id is not null,m.entry_two_id is not null)
                            is distinct from ((p_plan->m.key->>'opening_one')::boolean,(p_plan->m.key->>'opening_two')::boolean)
                        or coalesce(m.entry_one_id<>all(p_qualifiers),false) or coalesce(m.entry_two_id<>all(p_qualifiers),false)
                        or m.result_type is distinct from case when (p_plan->m.key->>'entry_count')::integer=1 then 'walkover' end
                        or m.winner_entry_id is distinct from case when m.result_type='walkover' then coalesce(m.entry_one_id,m.entry_two_id) end
                    else m.result_type is not null or m.winner_entry_id is not null
                        or m.entry_one_id is distinct from case when first.winner_to_match_id=m.id then first.winner_entry_id end
                        or m.entry_two_id is distinct from case when second.winner_to_match_id=m.id then second.winner_entry_id end end)
        ) or (
            select count(distinct m.id)*2<>count(*) or count(distinct m.key)*2<>count(*)
                or count(distinct entrant.id) filter(where m.round_number=1 and m.stage='knockout')<>cardinality(p_qualifiers)
            from jsonb_to_recordset(p_matches) m(id uuid,key text,stage text,round_number integer,entry_one_id uuid,entry_two_id uuid)
            cross join lateral unnest(array[m.entry_one_id,m.entry_two_id]) entrant(id)
        ) then
        raise exception 'Every qualifier and finishing-place route must match the reviewed bracket';
    end if;
end;
$$;

revoke all on function private.tm_group_elimination_plan(integer,jsonb,text),
    private.tm_validate_group_placement(jsonb,uuid[],jsonb) from public,anon,authenticated,service_role;

create or replace function private.tm_write_ranked_elimination(p_event bigint,p_draw uuid,p_matches jsonb) returns void
language plpgsql set search_path = '' as $$
declare
    plan public.tournament_schedules;
    prefix text:=p_draw::text||':future:';
    mapping jsonb;
    has_plan boolean;
    bracket_plan jsonb;
begin
    perform pg_advisory_xact_lock(hashtextextended('draw-courts:'||p_event,0));
    select * into plan from public.tournament_schedules where event_id=p_event for update;
    select jsonb_object_agg(prefix||(f->>'key'),f->>'id') into mapping from jsonb_array_elements(p_matches) f;
    if plan.event_id is not null and exists (
        select 1 from jsonb_each_text(mapping) new_match(old_key,new_id)
        where plan.assignments ? new_match.new_id or plan.published_assignments ? new_match.new_id
            or exists(select 1 from jsonb_array_elements(plan.fixtures) f where f->>'id'=new_match.new_id)
    ) then
        raise exception 'A new match conflicts with an existing court reservation';
    end if;
    has_plan:=plan.event_id is not null and exists (
        select 1 from jsonb_array_elements(plan.fixtures) f where starts_with(f->>'id',prefix) or (f->>'draw_id'=p_draw::text and f->>'virtual'='true')
        union all select 1 from jsonb_object_keys(plan.assignments||plan.published_assignments) k where starts_with(k,prefix)
    );
    if has_plan and exists(select 1 from jsonb_array_elements(p_matches) f where f->>'stage'='placement') then
        select private.tm_group_elimination_plan((
            select count(entrant.id)::integer from jsonb_to_recordset(p_matches) f(stage text,round_number integer,entry_one_id uuid,entry_two_id uuid)
            cross join lateral unnest(array[f.entry_one_id,f.entry_two_id]) entrant(id) where f.stage='knockout' and f.round_number=1
        ),d.scoring_rules->'plate_mode',d.scoring_rules->>'playoff_mode') into bracket_plan
        from public.draws d where d.id=p_draw and d.event_id=p_event;
    end if;
    if has_plan and (
        (select count(*) from jsonb_array_elements(plan.fixtures) f where starts_with(f->>'id',prefix) or (f->>'draw_id'=p_draw::text and f->>'virtual'='true'))
            <> jsonb_array_length(p_matches)
        or (select count(distinct f->>'id') from jsonb_array_elements(plan.fixtures) f where starts_with(f->>'id',prefix) or (f->>'draw_id'=p_draw::text and f->>'virtual'='true'))
            <> jsonb_array_length(p_matches)
        or exists (
            select 1 from jsonb_array_elements(plan.fixtures) f
            where (starts_with(f->>'id',prefix) or (f->>'draw_id'=p_draw::text and f->>'virtual'='true'))
                and (f->>'draw_id' is distinct from p_draw::text or not coalesce(mapping ? (f->>'id'),false))
        ) or exists (
            select 1 from (
                select key,value from jsonb_each(plan.assignments)
                union all select key,value from jsonb_each(plan.published_assignments)
            ) b where starts_with(b.key,prefix) and (
                not mapping ? b.key or jsonb_typeof(b.value) is distinct from 'object'
                or nullif(btrim(b.value->>'court_name'),'') is null
                or b.value->>'scheduled_start' is null or b.value->>'scheduled_end' is null
                or (b.value->>'scheduled_end')::timestamptz <= (b.value->>'scheduled_start')::timestamptz
                or (bracket_plan is not null and (bracket_plan->substring(b.key from length(prefix)+1)->>'entry_count')::integer<>2)
                or exists(select 1 from jsonb_array_elements(p_matches) f where prefix||(f->>'key')=b.key and f->>'result_type'='walkover')
            )
        )
    ) then
        raise exception 'The reserved courts use a different bracket. Ask the schedule manager to update the reservations before qualifying';
    end if;

    insert into public.draw_matches(id,draw_id,stage,round_code,round_label,round_number,bracket_position,
        entry_one_id,entry_two_id,winner_entry_id,status,result_type,court_name,scheduled_start,scheduled_end)
    select f.id,p_draw,f.stage,f.round_code,f.round_label,f.round_number,f.bracket_position,
        f.entry_one_id,f.entry_two_id,f.winner_entry_id,
        case when f.result_type='walkover' then 'walkover' when booking.value is not null then 'scheduled' else 'pending' end,
        f.result_type,booking.value->>'court_name',(booking.value->>'scheduled_start')::timestamptz,(booking.value->>'scheduled_end')::timestamptz
    from jsonb_to_recordset(p_matches) f(id uuid,key text,round_code text,round_label text,round_number integer,bracket_position integer,
        entry_one_id uuid,entry_two_id uuid,winner_entry_id uuid,result_type text,stage text)
    left join lateral (select plan.published_assignments->(prefix||f.key) value where has_plan) booking on true;
    update public.draw_matches m set winner_to_match_id=f.winner_to_match_id,winner_to_slot=f.winner_to_slot,
        loser_to_match_id=f.loser_to_match_id,loser_to_slot=f.loser_to_slot
    from jsonb_to_recordset(p_matches) f(id uuid,winner_to_match_id uuid,winner_to_slot integer,loser_to_match_id uuid,loser_to_slot integer)
    where m.id=f.id and m.draw_id=p_draw;
    update public.draws set updated_at=clock_timestamp() where id=p_draw;
    perform public.tm_resolve_routes(p_draw);
    if has_plan then
        update public.tournament_schedules set
            assignments=(select coalesce(jsonb_object_agg(coalesce(mapping->>key,key),value),'{}'::jsonb) from jsonb_each(plan.assignments)),
            published_assignments=(select coalesce(jsonb_object_agg(coalesce(mapping->>key,key),value),'{}'::jsonb) from jsonb_each(plan.published_assignments)),
            fixtures=private.tm_remap_qualification_fixtures(plan.fixtures,mapping),
            revision=revision+1,source_fingerprint=public.tm_source_fingerprint(p_event),updated_at=clock_timestamp()
        where event_id=p_event;
    end if;
end;
$$;

-- Keep only the reviewed draw's provisional bookings, with an exact token
-- for any changed date, court or draft/public reservation set.
create function private.tm_group_booking_review(p_event bigint,p_draw uuid)
returns jsonb language sql stable set search_path = '' as $$
with bookings as (
    select a.key,a.value,a.published from public.tournament_schedules s
    cross join lateral (
        select key, value, false published from jsonb_each(s.assignments)
        union all select key, value, true published from jsonb_each(s.published_assignments)
    ) a where s.event_id=p_event and starts_with(a.key,p_draw::text||':future:')
), announced as (
    select distinct on (key) key,value,published from bookings order by key,published desc
)
select jsonb_build_object(
    'token',md5(coalesce((select jsonb_agg(to_jsonb(b) order by b.key,b.published) from bookings b),'[]')::text),
    'fixtures',coalesce(jsonb_object_agg(substring(key from length(p_draw::text||':future:')+1),
        jsonb_build_object('court_name',value->>'court_name','scheduled_start',value->>'scheduled_start',
            'scheduled_end',value->>'scheduled_end','published',published)),'{}'))
from announced
$$;

revoke all on function private.tm_group_booking_review(bigint,uuid) from public,anon,authenticated,service_role;

create or replace function public.tm_host_group_qualification(p_organisation uuid,p_event bigint,p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
    d public.draws;
    reviewed_versions jsonb:=p_payload->'p_group_versions';
    reviewed_matches jsonb:=p_payload->'p_matches';
    qualifiers uuid[];
    reviewed_override jsonb:=p_payload->'p_ranked_override';
    override_reason text;
    override_candidates uuid[];
    override_selection uuid[];
    default_selection uuid[];
    ranked_candidates uuid[];
    automatic_count integer;
    mode text;
    places integer;
    extras integer;
    expected_count integer;
    eligible_groups integer;
    expected timestamptz;
    has_placement boolean;
    bracket_plan jsonb;
begin
    if auth.uid() is null or not coalesce(public.account_is_active(),false) or p_action is distinct from 'qualify' then
        raise exception 'Group qualification requires the reviewed event host' using errcode='42501';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('tm:'||p_event,0));
    perform 1 from public.organisation_members m
        where m.organisation_id=p_organisation and lower(btrim(m.user_email))=lower(btrim(auth.email()))
        and m.role in ('owner','admin') for share;
    if not found then raise exception 'Current owner or admin access to the host organisation is required' using errcode='42501'; end if;
    perform 1 from public.calendar c join public.organisations o on o.id=c.organisation_id
        where c.id=p_event and c.organisation_id=p_organisation and o.status='approved'
        and c.is_manual is true and c.is_visible is true and c.event_status is distinct from 'cancelled' for share of c,o;
    if not found then raise exception 'Choose a public 4M event in the selected approved organisation' using errcode='42501'; end if;

    expected:=(p_payload->>'p_expected')::timestamptz;
    select x.* into d from public.draws x join public.tournament_divisions v on v.id=x.division_id and v.event_id=x.event_id
        where x.id=(p_payload->>'p_draw')::uuid and x.event_id=p_event and x.draw_kind='main'
        and v.is_active is distinct from false for update of x for share of v;
    if d.id is null or expected is null or d.updated_at is distinct from expected
        or d.format is distinct from 'group_knockout' or d.status not in ('published','in_progress') then
        raise exception 'The draw changed. Reload and review the exact published groups';
    end if;
    mode:=coalesce(d.scoring_rules->'qualification'->>'mode','fixed');
    has_placement:=coalesce(d.scoring_rules->'plate_mode','"none"'::jsonb) not in ('null'::jsonb,'"none"'::jsonb,'[]'::jsonb)
        or coalesce(d.scoring_rules->>'playoff_mode','none') <> 'none';
    if mode not in ('fixed','all','best_placed') then
        raise exception 'This draw has unsupported qualification settings. Use an assigned Tournament Manager account';
    end if;

    if reviewed_override is not null and mode<>'best_placed' then
        raise exception 'Only best-placed teams can be overridden';
    end if;

    perform 1 from public.draw_groups where draw_id=d.id order by id for share;
    perform 1 from public.draw_entries where draw_id=d.id order by id for share;
    perform 1 from public.draw_matches where draw_id=d.id order by id for update;
    perform 1 from public.draw_match_sets s join public.draw_matches m on m.id=s.match_id where m.draw_id=d.id order by s.id for share of s;
    if p_payload->'p_group_sets' is distinct from (
        select coalesce(jsonb_object_agg(m.id::text||':'||s.set_number,
            jsonb_build_array(s.entry_one_games,s.entry_two_games,s.is_match_tiebreak)),'{}'::jsonb)
        from public.draw_match_sets s join public.draw_matches m on m.id=s.match_id where m.draw_id=d.id and m.stage='group'
    ) then
        raise exception 'The reviewed group scores changed. Refresh the standings';
    end if;
    if jsonb_typeof(reviewed_versions) is distinct from 'object'
        or (select count(*) from jsonb_object_keys(reviewed_versions)) <>
            (select count(*) from public.draw_matches where draw_id=d.id and stage='group')
        or (mode<>'all' and not exists(select 1 from public.draw_matches where draw_id=d.id and stage='group'))
        or exists (
            select 1 from public.draw_matches m
            left join public.draw_groups g on g.id=m.group_id and g.draw_id=d.id
            left join public.draw_entries one on one.id=m.entry_one_id and one.draw_id=d.id and one.group_id=m.group_id
            left join public.draw_entries two on two.id=m.entry_two_id and two.draw_id=d.id and two.group_id=m.group_id
            where m.draw_id=d.id and (m.stage<>'group' or m.status not in ('completed','walkover','retired')
                or g.id is null or one.id is null or two.id is null or one.id=two.id or m.winner_entry_id is null
                or m.winner_entry_id not in (one.id,two.id)
                or m.updated_at is distinct from (reviewed_versions->>m.id::text)::timestamptz)
        ) then
        raise exception 'Finish and review every group result before creating elimination';
    end if;
    if (select count(*) from public.draw_groups where draw_id=d.id) is distinct from d.group_count::bigint
    or exists (
        select 1 from public.draw_entries e left join public.draw_groups g on g.id=e.group_id and g.draw_id=d.id
        where e.draw_id=d.id and g.id is null
    ) or exists (
        select 1 from public.draw_groups g
        cross join lateral (select count(*) n from public.draw_entries e where e.draw_id=d.id and e.group_id=g.id) teams
        cross join lateral (select count(*) n from public.draw_matches m where m.draw_id=d.id and m.group_id=g.id) fixtures
        where g.draw_id=d.id and (teams.n<(case when mode='all' then 1 else 2 end) or fixtures.n<>teams.n*(teams.n-1)/2)
    ) or exists (
        select 1 from public.draw_matches where draw_id=d.id
        group by group_id,least(entry_one_id,entry_two_id),greatest(entry_one_id,entry_two_id) having count(*)>1
    ) then
        raise exception 'Each group must have every scheduled pairing before qualifying';
    end if;
    if mode='fixed' then
        perform public.tm_refresh_standings(d.id);
        select array_agg(s.entry_id order by s.group_id,s.position) into qualifiers from public.draw_standings s
            join public.draw_groups g on g.id=s.group_id and g.draw_id=d.id
            where s.draw_id=d.id and s.position<=d.advancers_per_group;
        if d.group_count is null or d.advancers_per_group is null or d.group_count*d.advancers_per_group<2
            or cardinality(qualifiers) is distinct from d.group_count*d.advancers_per_group
            or exists(select 1 from public.draw_standings where draw_id=d.id and requires_manual_resolution) then
            raise exception 'Resolve the group standings and any ties before reviewing qualifiers';
        end if;
        if not has_placement then
            perform private.tm_validate_host_elimination(reviewed_matches,qualifiers);
            perform private.tm_apply_group_qualification(p_event,d.id,expected,reviewed_matches,p_organisation);
        end if;
    else
        if p_payload->'p_group_results' is distinct from (
            select coalesce(jsonb_object_agg(m.id::text,jsonb_build_array(m.group_id,m.entry_one_id,m.entry_two_id,m.winner_entry_id,m.status,m.result_summary)),'{}'::jsonb)
            from public.draw_matches m where m.draw_id=d.id and m.stage='group'
        ) then
            raise exception 'The reviewed group results changed. Refresh the qualifiers';
        end if;
        places:=d.advancers_per_group;
        extras:=coalesce((d.scoring_rules->'qualification'->>'extras')::integer,0);
        if mode='all' then
            select count(*) into expected_count from public.draw_entries where draw_id=d.id;
        else
            select sum(least(group_size,places))+extras,count(*) filter(where group_size>places)
                into expected_count,eligible_groups
            from (select count(*) group_size from public.draw_entries where draw_id=d.id group by group_id) groups;
            if places is null or places<1 or extras<1 or extras>eligible_groups then
                raise exception 'The saved best-placed qualification settings have no valid extra places';
            end if;
        end if;
        qualifiers:=private.tm_rank_group_qualifiers(d.id,mode,places,extras,d.scoring_rules->'qualification'->'rules');
        if cardinality(qualifiers) is distinct from expected_count or expected_count not between 2 and 512 then
            raise exception 'The ranked qualifiers changed. Refresh and review the group comparisons';
        end if;
        if reviewed_override is not null then
            if jsonb_typeof(reviewed_override) is distinct from 'object'
                or jsonb_typeof(reviewed_override->'entry_ids') is distinct from 'array'
                or jsonb_typeof(reviewed_override->'reason') is distinct from 'string' then
                raise exception 'Review the eligible next-place teams and enter an override reason';
            end if;
            override_reason:=regexp_replace(reviewed_override->>'reason','^[[:space:]]+|[[:space:]]+$','','g');
            if char_length(override_reason) not between 1 and 500 then
                raise exception 'Enter an override reason of 1 to 500 characters';
            end if;
            automatic_count:=expected_count-extras;
            default_selection:=qualifiers[automatic_count+1:expected_count];
            -- Rank all eligible next-place teams by asking the same calculator
            -- for one extra per eligible group. Keep automatic places intact.
            ranked_candidates:=private.tm_rank_group_qualifiers(d.id,mode,places,eligible_groups,d.scoring_rules->'qualification'->'rules');
            override_candidates:=ranked_candidates[automatic_count+1:cardinality(ranked_candidates)];
            if cardinality(override_candidates) is distinct from eligible_groups
                or reviewed_override->'candidate_ids' is distinct from to_jsonb(override_candidates) then
                raise exception 'The eligible next-place teams changed. Refresh and review the candidates';
            end if;
            if jsonb_array_length(reviewed_override->'entry_ids')<>extras then
                raise exception 'Choose exactly the saved number of eligible next-place teams';
            end if;
            select array_agg(entry_id order by rank) into override_selection
            from unnest(override_candidates) with ordinality candidate(entry_id,rank)
            where (reviewed_override->'entry_ids') ? entry_id::text;
            if cardinality(override_selection) is distinct from extras then
                raise exception 'Choose exactly the saved number of eligible next-place teams';
            end if;
            if override_selection=default_selection then
                raise exception 'Use the automatic selection when the advancing teams have not changed';
            end if;
            qualifiers:=qualifiers[1:automatic_count]||override_selection;
        end if;
        if p_payload->'p_ranked_qualifiers' is distinct from to_jsonb(qualifiers) then
            raise exception 'The ranked qualifiers changed. Refresh and review the group comparisons';
        end if;
    end if;
    if has_placement then
        perform pg_advisory_xact_lock(hashtextextended('draw-courts:'||p_event,0));
        perform 1 from public.tournament_schedules where event_id=p_event for update;
        if p_payload->'p_group_booking_token' is distinct from private.tm_group_booking_review(p_event,d.id)->'token' then
            raise exception 'The reserved court times changed. Reload and review the placement bracket';
        end if;
        bracket_plan:=private.tm_group_elimination_plan(cardinality(qualifiers),d.scoring_rules->'plate_mode',d.scoring_rules->>'playoff_mode');
        perform private.tm_validate_group_placement(reviewed_matches,qualifiers,bracket_plan);
    elsif mode<>'fixed' then
        perform private.tm_validate_host_elimination(reviewed_matches,qualifiers);
    end if;
    if has_placement or mode<>'fixed' then
        perform private.tm_write_ranked_elimination(p_event,d.id,reviewed_matches);
        perform public.tm_log(p_event,'groups.qualified',
            jsonb_build_object('draw_id',d.id,'mode',mode,'ranked_qualifiers',qualifiers)
            || case when not has_placement then '{}'::jsonb else jsonb_build_object(
                'plate_mode',d.scoring_rules->'plate_mode','playoff_mode',d.scoring_rules->'playoff_mode') end
            || case when override_reason is null then '{}'::jsonb else jsonb_build_object(
                'override_reason',override_reason,'override_entry_ids',override_selection,'automatic_entry_ids',default_selection,
                'eligible_entry_ids',override_candidates,'organisation_id',p_organisation) end);
    end if;

    return jsonb_build_object('organisationId',p_organisation,'eventId',p_event,'action',p_action,
        'divisionId',d.division_id,'drawId',d.id);
end;
$$;


-- Use persisted groups to establish All and Best Placed booking capacity.
create function private.tm_future_group_elimination(p_draw uuid,p_rules jsonb,p_groups integer,p_places integer)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
    mode text:=coalesce(p_rules->'qualification'->>'mode','fixed');
    extras integer:=coalesce((p_rules->'qualification'->>'extras')::integer,0);
    teams integer;
    eligible_groups integer;
begin
    if mode='fixed' then teams:=p_groups*p_places;
    elsif mode='all' then
        select count(*) into teams from public.draw_entries where draw_id=p_draw;
    elsif mode='best_placed' then
        select sum(least(group_size,p_places))+extras,count(*) filter(where group_size>p_places)
        into teams,eligible_groups from (
            select count(*) group_size from public.draw_entries where draw_id=p_draw and group_id is not null group by group_id
        ) groups;
        if p_places is null or p_places<1 or extras<1 or extras>eligible_groups then
            raise exception 'Review the saved best-placed qualifier settings before scheduling';
        end if;
    end if;
    return private.tm_group_elimination_plan(teams,p_rules->'plate_mode',p_rules->>'playoff_mode');
end;
$$;

revoke all on function private.tm_future_group_elimination(uuid,jsonb,integer,integer) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.tm_validate_schedule(p_event bigint,p_assignments jsonb,p_fixtures jsonb,p_settings jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
#variable_conflict use_column
DECLARE a record; b record; m public.draw_matches; d public.draws; day public.event_play_days; start_at timestamptz; end_at timestamptz; court integer; rest interval; player_keys text[]; other_keys text[]; fixture jsonb; graph jsonb; planned jsonb:='{}'; prefix text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.tournament_divisions WHERE event_id=p_event AND is_active) THEN RAISE EXCEPTION 'Add active divisions first'; END IF;
 IF EXISTS(SELECT 1 FROM public.tournament_divisions v WHERE event_id=p_event AND is_active AND NOT EXISTS(SELECT 1 FROM public.draws d WHERE d.division_id=v.id AND draw_kind='main' AND status IN('published','in_progress','completed'))) OR EXISTS(SELECT 1 FROM public.draws d JOIN public.tournament_divisions v ON v.id=d.division_id WHERE d.event_id=p_event AND v.is_active AND d.status='draft') THEN RAISE EXCEPTION 'Publish every active division draw before scheduling'; END IF;
 IF jsonb_typeof(p_assignments) IS DISTINCT FROM 'object' OR (p_settings->>'rest')::integer<0 THEN RAISE EXCEPTION 'Invalid schedule'; END IF;
 rest:=make_interval(mins=>GREATEST(COALESCE((p_settings->>'rest')::integer,10),COALESCE((SELECT max(minimum_break_minutes) FROM public.event_play_days WHERE event_id=p_event AND is_active),0)));
 IF EXISTS(SELECT 1 FROM public.draw_matches m JOIN public.draws d ON d.id=m.draw_id JOIN public.tournament_divisions v ON v.id=d.division_id WHERE d.event_id=p_event AND v.is_active AND d.status<>'archived' AND m.status IN('pending','scheduled','in_progress') AND NOT p_assignments?m.id::text) THEN RAISE EXCEPTION 'Every active match needs a court and time'; END IF;
 IF jsonb_typeof(p_fixtures) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Review the current tournament fixtures'; END IF;
 FOR d IN SELECT dd.* FROM public.draws dd JOIN public.tournament_divisions v ON v.id=dd.division_id AND v.event_id=dd.event_id
   WHERE dd.event_id=p_event AND v.is_active AND dd.format='group_knockout' AND dd.status<>'archived'
   AND NOT EXISTS(SELECT 1 FROM public.draw_matches m WHERE m.draw_id=dd.id AND m.stage='knockout') LOOP
   graph:=private.tm_future_group_elimination(d.id,d.scoring_rules,d.group_count,d.advancers_per_group);
   prefix:=d.id::text||':future:';
   IF EXISTS(SELECT 1 FROM jsonb_each(graph) f WHERE (f.value->>'entry_count')::integer=2
       AND (NOT p_assignments ? (prefix||f.key) OR
           (SELECT count(*) FROM jsonb_array_elements(p_fixtures) row WHERE row->>'id'=prefix||f.key AND row->>'draw_id'=d.id::text)<>1))
   THEN RAISE EXCEPTION 'Reserve the exact elimination and placement rounds before publication'; END IF;
   SELECT planned||coalesce(jsonb_object_agg(prefix||f.key,f.value),'{}') INTO planned
       FROM jsonb_each(graph) f WHERE (f.value->>'entry_count')::integer=2;
 END LOOP;
 FOR a IN SELECT * FROM jsonb_each(p_assignments) LOOP
  start_at:=(a.value->>'scheduled_start')::timestamptz; end_at:=(a.value->>'scheduled_end')::timestamptz;
  IF start_at IS NULL OR end_at IS NULL OR end_at<=start_at THEN RAISE EXCEPTION 'Invalid match times'; END IF;
  SELECT * INTO day FROM public.event_play_days WHERE event_id=p_event AND is_active AND NOT COALESCE(is_removed,false) AND play_date=(start_at AT TIME ZONE 'Africa/Johannesburg')::date;
  court:=substring(a.value->>'court_name' FROM '^Court ([0-9]+)$')::integer;
  IF day.id IS NULL OR court IS NULL OR court<1 OR court>day.courts_count OR start_at<((day.play_date+day.start_time) AT TIME ZONE 'Africa/Johannesburg') OR end_at>((day.play_date+day.end_time) AT TIME ZONE 'Africa/Johannesburg') THEN RAISE EXCEPTION 'A booking is outside court availability'; END IF;
  IF position(':future:' IN a.key)>0 THEN
   SELECT * INTO d FROM public.draws WHERE id=split_part(a.key,':',1)::uuid AND event_id=p_event AND format='group_knockout';
   IF d.id IS NULL THEN RAISE EXCEPTION 'Unknown provisional fixture'; END IF;
   fixture:=planned->a.key;
   IF fixture IS NULL THEN RAISE EXCEPTION 'Unknown or unplayable provisional fixture'; END IF;
   prefix:=d.id::text||':future:';
   IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(fixture->'predecessors') f(key)
        WHERE (p_assignments->(prefix||f.key)->>'scheduled_end')::timestamptz+rest>start_at)
      OR EXISTS(SELECT 1 FROM public.draw_matches m WHERE m.draw_id=d.id AND m.stage='group'
        AND m.status NOT IN ('completed','walkover','retired','cancelled') AND (
           NOT p_assignments ? m.id::text OR (p_assignments->m.id::text->>'scheduled_end')::timestamptz+rest>start_at))
   THEN RAISE EXCEPTION 'A predecessor must finish and leave enough rest'; END IF;
   SELECT COALESCE(array_agg(DISTINCT k),'{}') INTO player_keys FROM public.draw_matches mm CROSS JOIN LATERAL unnest(public.tm_match_players(mm.id)) k WHERE mm.draw_id=d.id;
  ELSE
   SELECT mm.* INTO m FROM public.draw_matches mm JOIN public.draws dd ON dd.id=mm.draw_id WHERE mm.id=a.key::uuid AND dd.event_id=p_event;
   IF m.id IS NULL THEN RAISE EXCEPTION 'Unknown match'; END IF;
   SELECT * INTO d FROM public.draws WHERE id=m.draw_id;
   IF m.status NOT IN('pending','scheduled') AND (m.scheduled_start IS DISTINCT FROM start_at OR m.scheduled_end IS DISTINCT FROM end_at OR m.court_name IS DISTINCT FROM a.value->>'court_name') THEN RAISE EXCEPTION 'Started or resolved matches cannot be moved'; END IF;
   IF m.not_before IS NOT NULL AND start_at<m.not_before THEN RAISE EXCEPTION 'Match scheduled before its earliest start'; END IF;
   IF m.match_duration_minutes IS NOT NULL AND end_at-start_at<make_interval(mins=>m.match_duration_minutes) THEN RAISE EXCEPTION 'Match duration is too short'; END IF;
   player_keys:=public.tm_match_players(m.id);
   IF EXISTS(SELECT 1 FROM public.draw_matches f WHERE f.draw_id=m.draw_id AND (f.winner_to_match_id=m.id OR f.loser_to_match_id=m.id) AND f.status NOT IN('completed','walkover','retired','cancelled') AND (NOT p_assignments?f.id::text OR (p_assignments->f.id::text->>'scheduled_end')::timestamptz+rest>start_at)) THEN RAISE EXCEPTION 'A predecessor must finish and leave enough rest'; END IF;
  END IF;
  IF jsonb_array_length(COALESCE(p_settings->'divisionDays'->d.division_id::text,'[]'))>0 AND NOT (p_settings->'divisionDays'->d.division_id::text)?day.play_date::text THEN RAISE EXCEPTION 'Division cannot play on this day'; END IF;
  FOR b IN SELECT * FROM jsonb_each(p_assignments) WHERE key>a.key LOOP
   IF position(':future:' IN b.key)>0 THEN
    SELECT COALESCE(array_agg(DISTINCT k),'{}') INTO other_keys FROM public.draw_matches mm CROSS JOIN LATERAL unnest(public.tm_match_players(mm.id)) k WHERE mm.draw_id=split_part(b.key,':',1)::uuid;
   ELSE other_keys:=public.tm_match_players(b.key::uuid); END IF;
   IF a.value->>'court_name'=b.value->>'court_name' AND start_at<(b.value->>'scheduled_end')::timestamptz AND end_at>(b.value->>'scheduled_start')::timestamptz THEN RAISE EXCEPTION 'Court overlap'; END IF;
   IF player_keys && other_keys AND start_at<(b.value->>'scheduled_end')::timestamptz+rest AND end_at+rest>(b.value->>'scheduled_start')::timestamptz THEN RAISE EXCEPTION 'Player clash or insufficient rest'; END IF;
  END LOOP;
 END LOOP;
END $$;

create or replace function private.tm_review_snapshot(p_event bigint, p_host_organisation uuid) returns jsonb
language plpgsql stable security definer set search_path = public
as $$
#variable_conflict use_column
DECLARE caps text[]:=CASE WHEN p_host_organisation IS NULL THEN public.tm_capabilities(p_event)
 ELSE ARRAY['host_players_review','seeds','draws'] END; prep boolean; finance boolean; result jsonb;
BEGIN
 IF cardinality(caps)=0 THEN RAISE EXCEPTION 'No access to this tournament' USING ERRCODE='42501'; END IF;
 prep:=caps && ARRAY['players','host_players_review','seeds','draws']; finance:='finance'=ANY(caps);
 SELECT jsonb_build_object(
 'event',(SELECT CASE WHEN 'settings'=ANY(caps) THEN to_jsonb(c) ELSE jsonb_build_object('id',c.id,'event_name',c.event_name,'start_date',c.start_date,'end_date',c.end_date,'venue',c.venue,'slug',c.slug) END FROM public.calendar c WHERE id=p_event),
 'capabilities',caps,
 'divisions',COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.sort_order,d.id) FROM public.tournament_divisions d WHERE event_id=p_event),'[]'),
 'draws',COALESCE((SELECT jsonb_agg(CASE WHEN prep THEN to_jsonb(d) ELSE to_jsonb(d)-'created_by'-'seeding_method' || jsonb_build_object('scoring_rules',jsonb_build_object('sets_to_win',d.scoring_rules->'sets_to_win','match_tiebreak',d.scoring_rules->'match_tiebreak','americano',CASE WHEN d.format='americano' THEN d.scoring_rules->'americano' ELSE NULL END)
        || case when d.format='group_knockout' and 'schedule'=ANY(caps) then
            jsonb_build_object('qualification',d.scoring_rules->'qualification','plate_mode',d.scoring_rules->'plate_mode','playoff_mode',d.scoring_rules->'playoff_mode')
            else '{}'::jsonb end) END ORDER BY d.id) FROM public.draws d WHERE event_id=p_event AND (prep OR status IN ('published','in_progress','completed'))),'[]'),
 'matches',COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM public.draw_matches m JOIN public.draws d ON d.id=m.draw_id WHERE d.event_id=p_event AND (prep OR d.status IN ('published','in_progress','completed'))),'[]'),
 'entries',COALESCE((SELECT jsonb_agg(CASE WHEN prep OR 'schedule'=ANY(caps) THEN to_jsonb(e) ELSE jsonb_build_object('id',e.id,'draw_id',e.draw_id,'team_name',e.team_name,'player_one_name',e.player_one_name,'player_two_name',e.player_two_name,'group_id',e.group_id) END ORDER BY e.id) FROM public.draw_entries e JOIN public.draws d ON d.id=e.draw_id WHERE d.event_id=p_event AND (prep OR d.status IN ('published','in_progress','completed'))),'[]'),
 'sets',COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.match_id,s.set_number) FROM public.draw_match_sets s JOIN public.draw_matches m ON m.id=s.match_id JOIN public.draws d ON d.id=m.draw_id WHERE d.event_id=p_event),'[]'),
 'standings',COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.group_id,s.position) FROM public.draw_standings s JOIN public.draws d ON d.id=s.draw_id WHERE d.event_id=p_event),'[]'),
 'registrations',CASE WHEN prep OR finance THEN COALESCE((SELECT jsonb_agg((to_jsonb(r)-'pay_token')||jsonb_build_object('_revision',md5(to_jsonb(r)::text)) ORDER BY r.id) FROM public.event_registrations r WHERE event_id=p_event),'[]') ELSE '[]'::jsonb END,
 'players',CASE WHEN prep THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'email',p.email,'license_type',case when public.has_full_license(p.id,(select extract(year from start_date)::integer from public.calendar where id=p_event)) then 'full' else 'none' end,'event_license',public.player_license_eligibility(p.id,p_event),'points',to_jsonb(p)->'points','rankings',to_jsonb(p)->'rankings','preferred_ranking',to_jsonb(p)->'preferred_ranking','active_ranking_label',to_jsonb(p)->'active_ranking_label','rank_label',to_jsonb(p)->'rank_label','gender',to_jsonb(p)->'gender','category',to_jsonb(p)->'category','temporary_licenses',COALESCE((SELECT jsonb_agg(jsonb_build_object('event_id',t.event_id)) FROM public.temporary_licenses t WHERE t.player_id=p.id and t.revoked_at is null and (p_host_organisation is null or t.event_id=p_event)),'[]'))) FROM public.players p WHERE EXISTS(SELECT 1 FROM public.event_registrations r WHERE r.event_id=p_event AND lower(p.email) IN(lower(r.email),lower(r.partner_email)))),'[]') ELSE '[]'::jsonb END,
 'playDays',COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.play_date) FROM public.event_play_days p WHERE event_id=p_event AND NOT COALESCE(is_removed,false)),'[]'),
 'settings',COALESCE((SELECT settings FROM public.tournament_workspace WHERE event_id=p_event),'{}'),
 'settingsRevision',COALESCE((SELECT revision FROM public.tournament_workspace WHERE event_id=p_event),0),
 'confirmations',CASE WHEN prep THEN COALESCE((SELECT jsonb_agg(to_jsonb(c)||jsonb_build_object('players_valid',c.players_fingerprint=public.tm_player_fingerprint(c.division_id),'seeds_valid',c.players_fingerprint=public.tm_player_fingerprint(c.division_id))) FROM public.tournament_confirmations c WHERE event_id=p_event),'[]') ELSE '[]'::jsonb END,
 'groupPlacementReservations',CASE WHEN p_host_organisation IS NOT NULL THEN coalesce((
     SELECT jsonb_object_agg(d.id,private.tm_group_booking_review(p_event,d.id))
     FROM public.draws d JOIN public.tournament_divisions v ON v.id=d.division_id AND v.event_id=d.event_id
     JOIN public.calendar c ON c.id=d.event_id AND c.organisation_id=p_host_organisation
     WHERE d.event_id=p_event AND c.is_visible AND v.is_active IS DISTINCT FROM false
       AND d.draw_kind='main' AND d.status IN ('published','in_progress') AND d.format='group_knockout'
       AND (coalesce(d.scoring_rules->'plate_mode','"none"'::jsonb) NOT IN ('null'::jsonb,'"none"'::jsonb,'[]'::jsonb)
           OR coalesce(d.scoring_rules->>'playoff_mode','none')<>'none')
 ),'{}'::jsonb) END,
 'schedule',CASE WHEN 'schedule'=ANY(caps) THEN (SELECT to_jsonb(s) FROM public.tournament_schedules s WHERE event_id=p_event) ELSE NULL END,
 'sourceFingerprint',CASE WHEN 'schedule'=ANY(caps) THEN public.tm_source_fingerprint(p_event) ELSE NULL END,
 'finalisations',COALESCE((SELECT jsonb_agg(to_jsonb(f)||jsonb_build_object('valid',f.fingerprint=public.tm_result_fingerprint(f.division_id))) FROM public.tournament_finalisations f WHERE event_id=p_event),'[]'),
 'audit',COALESCE((SELECT jsonb_agg(to_jsonb(a) || jsonb_build_object('actor_name',(SELECT COALESCE(NULLIF(u.raw_user_meta_data->>'full_name',''),NULLIF(u.raw_user_meta_data->>'name',''),u.email) FROM auth.users u WHERE u.id=a.actor)) ORDER BY a.created_at DESC) FROM (SELECT id,event_id,action,CASE WHEN 'access'=ANY(caps) OR action NOT LIKE 'access.%' THEN details ELSE '{}'::jsonb END AS details,actor,created_at FROM public.tournament_audit WHERE event_id=p_event ORDER BY id DESC LIMIT 100) a),'[]'),
 'access',CASE WHEN 'access'=ANY(caps) THEN COALESCE((SELECT jsonb_agg(to_jsonb(a)||jsonb_build_object('email',u.email,'inheritedAccess',false)) FROM public.tournament_access a JOIN auth.users u ON u.id=a.user_id WHERE event_id=p_event),'[]') ELSE '[]'::jsonb END
 ) INTO result;
 RETURN result;
END $$;
