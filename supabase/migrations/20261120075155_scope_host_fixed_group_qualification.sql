-- Use the deployed schedule-aware group transition behind its existing
-- public signature and its original assigned Tournament Manager permission.
CREATE FUNCTION private.tm_apply_group_qualification(p_event bigint,p_draw uuid,p_expected timestamptz,p_matches jsonb,p_host_organisation uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
#variable_conflict use_column
DECLARE d public.draws; x jsonb; v_id uuid; mapping jsonb:='{}'; old_key text; new_key text; s public.tournament_schedules;
BEGIN
 IF p_host_organisation IS NULL THEN PERFORM public.tm_require(p_event,'draws'); END IF; PERFORM pg_advisory_xact_lock(hashtextextended('tm:'||p_event,0));
 SELECT * INTO d FROM public.draws WHERE id=p_draw AND event_id=p_event FOR UPDATE;
 IF d.id IS NULL OR d.updated_at IS DISTINCT FROM p_expected OR d.format<>'group_knockout' OR d.status NOT IN('published','in_progress') OR EXISTS(SELECT 1 FROM public.draw_matches WHERE draw_id=d.id AND stage='knockout') THEN RAISE EXCEPTION 'Draw changed or elimination already exists'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.draw_matches WHERE draw_id=d.id AND stage='group') OR EXISTS(SELECT 1 FROM public.draw_matches WHERE draw_id=d.id AND stage='group' AND status NOT IN('completed','walkover','retired')) THEN RAISE EXCEPTION 'Finish all group matches first'; END IF;
 PERFORM public.tm_refresh_standings(d.id);
 IF EXISTS(SELECT 1 FROM public.draw_standings WHERE draw_id=d.id AND requires_manual_resolution) THEN RAISE EXCEPTION 'Resolve group ties before qualifying'; END IF;
 IF jsonb_array_length(p_matches)<d.group_count*d.advancers_per_group-1 THEN RAISE EXCEPTION 'Elimination bracket is incomplete'; END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(p_matches) LOOP
  FOR v_id IN SELECT value::uuid FROM jsonb_array_elements_text(jsonb_build_array(x->>'entry_one_id',x->>'entry_two_id',x->>'winner_entry_id')) WHERE value IS NOT NULL LOOP
   IF NOT EXISTS(SELECT 1 FROM public.draw_standings WHERE draw_id=d.id AND entry_id=v_id AND position<=d.advancers_per_group) THEN RAISE EXCEPTION 'Entrant did not qualify'; END IF;
  END LOOP;
  INSERT INTO public.draw_matches(id,draw_id,stage,round_code,round_label,round_number,bracket_position,entry_one_id,entry_two_id,winner_entry_id,status,result_type)
  VALUES((x->>'id')::uuid,d.id,x->>'stage',x->>'round_code',x->>'round_label',(x->>'round_number')::integer,(x->>'bracket_position')::integer,(x->>'entry_one_id')::uuid,(x->>'entry_two_id')::uuid,(x->>'winner_entry_id')::uuid,CASE WHEN x->>'result_type'='walkover' THEN 'walkover' ELSE 'pending' END,x->>'result_type');
  mapping:=mapping||jsonb_build_object(d.id::text||':future:'||(x->>'key'),x->>'id');
 END LOOP;
 FOR x IN SELECT value FROM jsonb_array_elements(p_matches) LOOP
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(jsonb_build_array(x->>'winner_to_match_id',x->>'loser_to_match_id')) candidate(value) WHERE candidate.value IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.draw_matches WHERE draw_id=d.id AND id=candidate.value::uuid AND stage<>'group')) THEN RAISE EXCEPTION 'Invalid elimination route'; END IF;
  UPDATE public.draw_matches SET winner_to_match_id=(x->>'winner_to_match_id')::uuid,winner_to_slot=(x->>'winner_to_slot')::integer,loser_to_match_id=(x->>'loser_to_match_id')::uuid,loser_to_slot=(x->>'loser_to_slot')::integer WHERE id=(x->>'id')::uuid;
 END LOOP;
 SELECT * INTO s FROM public.tournament_schedules WHERE event_id=p_event FOR UPDATE;
 IF s.event_id IS NOT NULL THEN
  FOR old_key,new_key IN SELECT * FROM jsonb_each_text(mapping) LOOP
   IF s.assignments?old_key THEN s.assignments:=(s.assignments-old_key)||jsonb_build_object(new_key,s.assignments->old_key); END IF;
   IF s.published_assignments?old_key THEN
    s.published_assignments:=(s.published_assignments-old_key)||jsonb_build_object(new_key,s.published_assignments->old_key);
    UPDATE public.draw_matches SET scheduled_start=(s.published_assignments->new_key->>'scheduled_start')::timestamptz,scheduled_end=(s.published_assignments->new_key->>'scheduled_end')::timestamptz,court_name=s.published_assignments->new_key->>'court_name',status='scheduled' WHERE id=new_key::uuid AND status='pending';
   END IF;
   s.fixtures:=replace(s.fixtures::text,old_key,new_key)::jsonb;
  END LOOP;
  UPDATE public.tournament_schedules SET assignments=s.assignments,published_assignments=s.published_assignments,fixtures=s.fixtures,revision=revision+1,source_fingerprint=public.tm_source_fingerprint(p_event),updated_at=clock_timestamp() WHERE event_id=p_event;
 END IF;
 UPDATE public.draws SET updated_at=clock_timestamp() WHERE id=d.id;
 UPDATE public.tournament_schedules SET source_fingerprint=public.tm_source_fingerprint(p_event) WHERE event_id=p_event;
 PERFORM public.tm_resolve_routes(d.id);
 PERFORM public.tm_log(p_event,'groups.qualified',jsonb_build_object('draw_id',d.id));
END $$;

create or replace function public.tm_qualify(p_event bigint,p_draw uuid,p_expected timestamptz,p_matches jsonb)
returns void language sql security definer set search_path = public
as $$ select private.tm_apply_group_qualification(p_event,p_draw,p_expected,p_matches,null::uuid); $$;

create function private.tm_validate_host_elimination(p_matches jsonb,p_qualifiers uuid[]) returns void
language plpgsql stable set search_path = ''
as $$
declare
    bracket integer:=2;
    round_count integer:=1;
begin
    if cardinality(p_qualifiers) not between 2 and 512 or jsonb_typeof(p_matches) is distinct from 'array' then
        raise exception 'Select a complete fixed elimination bracket';
    end if;
    while bracket<cardinality(p_qualifiers) loop
        bracket:=bracket*2;
        round_count:=round_count+1;
    end loop;
    if jsonb_array_length(p_matches) <> bracket-1 then raise exception 'The elimination bracket is incomplete'; end if;
    if exists (
        with fixtures as (
            select * from jsonb_to_recordset(p_matches) f(
                id uuid,key text,stage text,round_number integer,bracket_position integer,entry_one_id uuid,
                entry_two_id uuid,winner_entry_id uuid,result_type text,winner_to_match_id uuid,winner_to_slot integer,
                loser_to_match_id uuid,loser_to_slot integer,group_id uuid)
        )
        select 1 from fixtures f
        left join fixtures next on next.round_number=f.round_number+1 and next.bracket_position=(f.bracket_position+1)/2
        left join fixtures first on first.winner_to_match_id=f.id and first.winner_to_slot=1
        left join fixtures second on second.winner_to_match_id=f.id and second.winner_to_slot=2
        where f.id is null or f.stage is distinct from 'knockout' or f.group_id is not null
            or f.round_number is null or f.round_number not between 1 and round_count
            or f.bracket_position is null or f.bracket_position not between 1 and (bracket >> f.round_number)
            or f.key is distinct from 'r'||f.round_number||'-m'||f.bracket_position
            or f.loser_to_match_id is not null or f.loser_to_slot is not null
            or f.winner_to_match_id is distinct from next.id
            or f.winner_to_slot is distinct from case when next.id is not null then (f.bracket_position-1)%2+1 end
            or (f.round_number=1 and (
                (f.entry_one_id is null and f.entry_two_id is null)
                or (f.entry_one_id is not null and not f.entry_one_id=any(p_qualifiers))
                or (f.entry_two_id is not null and not f.entry_two_id=any(p_qualifiers))
                or f.result_type is distinct from case when (f.entry_one_id is null)<>(f.entry_two_id is null) then 'walkover' end
                or f.winner_entry_id is distinct from case when f.result_type='walkover' then coalesce(f.entry_one_id,f.entry_two_id) end
            ))
            or (f.round_number>1 and (
                first.id is null or second.id is null or f.winner_entry_id is not null or f.result_type is not null
                or f.entry_one_id is distinct from first.winner_entry_id
                or f.entry_two_id is distinct from second.winner_entry_id
            ))
    ) or exists (
        select 1 from jsonb_to_recordset(p_matches) f(id uuid,key text)
        group by f.id having count(*)>1
    ) or exists (
        select 1 from jsonb_to_recordset(p_matches) f(key text)
        group by f.key having count(*)>1
    ) or (
        select count(entrant.id) <> cardinality(p_qualifiers) or count(distinct entrant.id) <> cardinality(p_qualifiers)
        from jsonb_to_recordset(p_matches) f(round_number integer,entry_one_id uuid,entry_two_id uuid)
        cross join lateral unnest(array[f.entry_one_id,f.entry_two_id]) entrant(id)
        where f.round_number=1
    ) then
        raise exception 'Every qualified team must have one opening slot and every later slot must follow its exact feeder';
    end if;
end;
$$;

create function public.tm_host_group_qualification(p_organisation uuid,p_event bigint,p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
    d public.draws;
    reviewed_versions jsonb:=p_payload->'p_group_versions';
    reviewed_matches jsonb:=p_payload->'p_matches';
    qualifiers uuid[];
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
    if coalesce(d.scoring_rules->'qualification'->>'mode','fixed') <> 'fixed'
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

    return jsonb_build_object('organisationId',p_organisation,'eventId',p_event,'action',p_action,
        'divisionId',d.division_id,'drawId',d.id);
end;
$$;

revoke all on function private.tm_apply_group_qualification(bigint,uuid,timestamptz,jsonb,uuid),
    private.tm_validate_host_elimination(jsonb,uuid[]),public.tm_host_group_qualification(uuid,bigint,text,jsonb)
    from public,anon,authenticated,service_role;
grant execute on function public.tm_host_group_qualification(uuid,bigint,text,jsonb) to authenticated;
