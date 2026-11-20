-- Follow the native ranked qualifier rules on the locked, reviewed results.
-- The native lot function seeds its unsigned FNV-1a hash with the draw ID.
create function private.tm_qualification_lot(p_key text) returns bigint
language plpgsql immutable strict set search_path = '' as $$
declare hash bigint:=2166136261; i integer;
begin
    for i in 1..length(p_key) loop
        hash:=((hash # ascii(substr(p_key,i,1))) * 16777619) % 4294967296;
    end loop;
    return hash;
end;
$$;

create function private.tm_rank_group_qualifiers(
    p_draw uuid,p_mode text,p_places integer,p_extras integer,p_rules jsonb
) returns uuid[] language sql stable set search_path = '' as $$
with matches as (
    select m.id,m.group_id,m.entry_one_id,m.entry_two_id,m.winner_entry_id,
        coalesce(m.result_summary[1],scores.one_wins,0) one_wins,
        coalesce(m.result_summary[2],scores.two_wins,0) two_wins,
        coalesce(scores.one_games,0) one_games,coalesce(scores.two_games,0) two_games
    from public.draw_matches m
    cross join lateral (
        select count(*) filter(where s.entry_one_games>s.entry_two_games)::integer one_wins,
            count(*) filter(where s.entry_two_games>s.entry_one_games)::integer two_wins,
            sum(s.entry_one_games) one_games,sum(s.entry_two_games) two_games
        from public.draw_match_sets s where s.match_id=m.id
    ) scores
    where m.draw_id=p_draw and m.stage='group' and m.status in ('completed','walkover','retired')
        and m.entry_one_id is not null and m.entry_two_id is not null and m.winner_entry_id is not null
), sides as (
    select m.group_id,side.* from matches m cross join lateral (values
        (m.entry_one_id,m.entry_two_id,(m.winner_entry_id=m.entry_one_id)::integer,m.one_wins-m.two_wins,m.one_games-m.two_games,m.one_games),
        (m.entry_two_id,m.entry_one_id,(m.winner_entry_id=m.entry_two_id)::integer,m.two_wins-m.one_wins,m.two_games-m.one_games,m.two_games)
    ) side(entry_id,opponent,won,set_difference,game_difference,games_for)
), totals as (
    select e.id,e.group_id,coalesce(nullif(e.seed_number,0),9999) seed,
        coalesce(sum(s.won),0) won,coalesce(sum(s.set_difference),0) set_difference,
        coalesce(sum(s.game_difference),0) game_difference,coalesce(sum(s.games_for),0) games_for
    from public.draw_entries e left join sides s on s.entry_id=e.id and s.group_id=e.group_id
    where e.draw_id=p_draw group by e.id
), tied as (
    select t.*,count(*) over(partition by t.group_id,t.won) wins_count,
        count(*) over(partition by t.group_id) group_size from totals t
), with_head_to_head as (
    select t.*,case when t.wins_count=2 then coalesce(head.won*2-1,0) else 0 end head_to_head
    from tied t left join lateral (
        select sides.won from sides join tied opponent on opponent.id=sides.opponent and opponent.won=t.won
        where sides.entry_id=t.id and sides.group_id=t.group_id and t.wins_count=2
    ) head on true
), full_standings as (
    select t.*,row_number() over(partition by group_id order by won desc,head_to_head desc,set_difference desc,
        game_difference desc,games_for desc,seed,id) position from with_head_to_head t
), cutoffs as (
    select position,min(group_size) eligible_size from full_standings group by position
), adjusted as (
    select t.id,t.position,coalesce(scores.won,0) won,coalesce(scores.set_difference,0) set_difference,
        coalesce(scores.game_difference,0) game_difference,coalesce(scores.games_for,0) games_for,
        private.tm_qualification_lot(p_draw::text||':'||t.id::text) lot
    from full_standings t join cutoffs c on c.position=t.position
    cross join lateral (
        select sum(s.won) won,sum(s.set_difference) set_difference,sum(s.game_difference) game_difference,sum(s.games_for) games_for
        from sides s join full_standings o on o.id=s.opponent and o.position<=c.eligible_size
        where s.entry_id=t.id and s.group_id=t.group_id
    ) scores
    where p_mode='all' or t.position<=p_places+1
), comparison_rules as (
    select metric,min(priority) priority from jsonb_array_elements_text(
        case when jsonb_typeof(p_rules)='array' then p_rules else '["won","set_difference","game_difference","games_for"]'::jsonb end
    ) with ordinality rule(metric,priority)
    where metric in ('won','set_difference','game_difference','games_for')
    group by metric
    union all select 'draw',9223372036854775807::bigint
), ranked as (
    select a.id,a.position,row_number() over(partition by a.position order by metric.sort_key,a.id) rank_across_groups
    from adjusted a cross join lateral (
        select array_agg(case metric when 'won' then -a.won when 'set_difference' then -a.set_difference
            when 'game_difference' then -a.game_difference when 'games_for' then -a.games_for when 'draw' then a.lot end
            order by priority) sort_key from comparison_rules
    ) metric
)
select array_agg(id order by position,rank_across_groups) from ranked
where p_mode='all' or position<=p_places or (position=p_places+1 and rank_across_groups<=p_extras)
$$;

-- Replace complete JSON string values, so r1-m1 cannot overwrite r1-m10,
-- dependencies can be remapped, and unrelated fields and matches stay intact.
create function private.tm_remap_qualification_fixtures(p_value jsonb,p_mapping jsonb) returns jsonb
language plpgsql immutable strict set search_path = '' as $$
begin
    case jsonb_typeof(p_value)
        when 'array' then return (select coalesce(jsonb_agg(private.tm_remap_qualification_fixtures(item,p_mapping) order by ord),'[]'::jsonb)
            from jsonb_array_elements(p_value) with ordinality a(item,ord));
        when 'object' then return (select coalesce(jsonb_object_agg(key,private.tm_remap_qualification_fixtures(value,p_mapping)),'{}'::jsonb)
            from jsonb_each(p_value));
        when 'string' then return coalesce(p_mapping->(p_value#>>'{}'),p_value);
        else return p_value;
    end case;
end;
$$;

-- Write the already validated server-owned qualifier set. Carry over a target
-- draw's reservations only if its entire planned bracket maps one to one.
create function private.tm_write_ranked_elimination(p_event bigint,p_draw uuid,p_matches jsonb) returns void
language plpgsql set search_path = '' as $$
declare
    plan public.tournament_schedules;
    prefix text:=p_draw::text||':future:';
    mapping jsonb;
    has_plan boolean;
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
                or exists(select 1 from jsonb_array_elements(p_matches) f where prefix||(f->>'key')=b.key and f->>'result_type'='walkover')
            )
        )
    ) then
        raise exception 'The reserved courts use a different bracket. Ask the schedule manager to update the reservations before qualifying';
    end if;

    insert into public.draw_matches(id,draw_id,stage,round_code,round_label,round_number,bracket_position,
        entry_one_id,entry_two_id,winner_entry_id,status,result_type,court_name,scheduled_start,scheduled_end)
    select f.id,p_draw,'knockout',f.round_code,f.round_label,f.round_number,f.bracket_position,
        f.entry_one_id,f.entry_two_id,f.winner_entry_id,
        case when f.result_type='walkover' then 'walkover' when booking.value is not null then 'scheduled' else 'pending' end,
        f.result_type,booking.value->>'court_name',(booking.value->>'scheduled_start')::timestamptz,(booking.value->>'scheduled_end')::timestamptz
    from jsonb_to_recordset(p_matches) f(id uuid,key text,round_code text,round_label text,round_number integer,bracket_position integer,
        entry_one_id uuid,entry_two_id uuid,winner_entry_id uuid,result_type text)
    left join lateral (select plan.published_assignments->(prefix||f.key) value where has_plan) booking on true;
    update public.draw_matches m set winner_to_match_id=f.winner_to_match_id,winner_to_slot=f.winner_to_slot
    from jsonb_to_recordset(p_matches) f(id uuid,winner_to_match_id uuid,winner_to_slot integer)
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

create or replace function public.tm_host_group_qualification(p_organisation uuid,p_event bigint,p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
    d public.draws;
    reviewed_versions jsonb:=p_payload->'p_group_versions';
    reviewed_matches jsonb:=p_payload->'p_matches';
    qualifiers uuid[];
    mode text;
    places integer;
    extras integer;
    expected_count integer;
    eligible_groups integer;
    expected timestamptz;
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
    if mode not in ('fixed','all','best_placed')
        or coalesce(d.scoring_rules->'plate_mode','"none"'::jsonb) not in ('"none"'::jsonb,'[]'::jsonb)
        or coalesce(d.scoring_rules->>'playoff_mode','none') <> 'none' then
        raise exception 'This draw has extended qualification or playoff settings. Use an assigned Tournament Manager account';
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
        or not exists(select 1 from public.draw_matches where draw_id=d.id and stage='group')
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
    if exists (
        select 1 from public.draw_groups g
        cross join lateral (select count(*) n from public.draw_entries e where e.draw_id=d.id and e.group_id=g.id) teams
        cross join lateral (select count(*) n from public.draw_matches m where m.draw_id=d.id and m.group_id=g.id) fixtures
        where g.draw_id=d.id and (teams.n<2 or fixtures.n<>teams.n*(teams.n-1)/2)
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
        perform private.tm_validate_host_elimination(reviewed_matches,qualifiers);
        perform private.tm_apply_group_qualification(p_event,d.id,expected,reviewed_matches,p_organisation);
    else
        if p_payload->'p_group_results' is distinct from (
            select jsonb_object_agg(m.id::text,jsonb_build_array(m.group_id,m.entry_one_id,m.entry_two_id,m.winner_entry_id,m.status,m.result_summary))
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
        if cardinality(qualifiers) is distinct from expected_count or expected_count not between 2 and 512
            or p_payload->'p_ranked_qualifiers' is distinct from to_jsonb(qualifiers) then
            raise exception 'The ranked qualifiers changed. Refresh and review the group comparisons';
        end if;
        perform private.tm_validate_host_elimination(reviewed_matches,qualifiers);
        perform private.tm_write_ranked_elimination(p_event,d.id,reviewed_matches);
        perform public.tm_log(p_event,'groups.qualified',jsonb_build_object('draw_id',d.id,'mode',mode,'ranked_qualifiers',qualifiers));
    end if;

    return jsonb_build_object('organisationId',p_organisation,'eventId',p_event,'action',p_action,
        'divisionId',d.division_id,'drawId',d.id);
end;
$$;

revoke all on function private.tm_qualification_lot(text),
    private.tm_rank_group_qualifiers(uuid,text,integer,integer,jsonb),
    private.tm_remap_qualification_fixtures(jsonb,jsonb),
    private.tm_write_ranked_elimination(bigint,uuid,jsonb) from public,anon,authenticated,service_role;
