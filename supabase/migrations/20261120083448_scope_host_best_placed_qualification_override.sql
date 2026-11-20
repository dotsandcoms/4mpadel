-- Extend only the existing reviewed organiser action. Retain its authority,
-- result locks, bracket validation, court reservation writer, and grants.
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
        perform private.tm_validate_host_elimination(reviewed_matches,qualifiers);
        perform private.tm_write_ranked_elimination(p_event,d.id,reviewed_matches);
        perform public.tm_log(p_event,'groups.qualified',
            jsonb_build_object('draw_id',d.id,'mode',mode,'ranked_qualifiers',qualifiers)
            || case when override_reason is null then '{}'::jsonb else jsonb_build_object(
                'override_reason',override_reason,'override_entry_ids',override_selection,'automatic_entry_ids',default_selection,
                'eligible_entry_ids',override_candidates,'organisation_id',p_organisation) end);
    end if;

    return jsonb_build_object('organisationId',p_organisation,'eventId',p_event,'action',p_action,
        'divisionId',d.division_id,'drawId',d.id);
end;
$$;
