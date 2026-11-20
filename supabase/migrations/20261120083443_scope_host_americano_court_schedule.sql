-- Existing public and tournament-plan bookings are both reservations. Derive
-- possible players for reserved elimination slots from that draw's entrants.
create function private.tm_rotation_court_occupancy(p_event bigint,p_draw uuid)
returns table(court text,starts timestamptz,finishes timestamptz,players text[])
language sql stable set search_path = '' as $$
with event_matches as (
    select m.id,m.draw_id,m.court_name,m.scheduled_start,m.scheduled_end,m.status
    from public.draw_matches m join public.draws d on d.id=m.draw_id
    where d.event_id=p_event and d.id<>p_draw and d.status<>'archived' and m.status<>'cancelled'
), saved as (
    select a.key,a.value,
        coalesce(m.draw_id,(select (f->>'draw_id')::uuid from jsonb_array_elements(s.fixtures) f where f->>'id'=a.key limit 1)) owner_draw,
        m.id match_id
    from public.tournament_schedules s
    cross join lateral (
        select key,value from jsonb_each(s.assignments)
        union select key,value from jsonb_each(s.published_assignments)
    ) a left join event_matches m on m.id::text=a.key
    where s.event_id=p_event
)
select m.court_name,m.scheduled_start,coalesce(m.scheduled_end,m.scheduled_start+interval '30 minutes'),public.tm_match_players(m.id)
from event_matches m where m.scheduled_start is not null
union all
select b.value->>'court_name',(b.value->>'scheduled_start')::timestamptz,(b.value->>'scheduled_end')::timestamptz,
    case when b.match_id is not null then public.tm_match_players(b.match_id)
        when b.owner_draw is not null then (
            select array_agg(distinct key) from event_matches m cross join lateral unnest(public.tm_match_players(m.id)) key
            where m.draw_id=b.owner_draw
        )
    end
from saved b where b.owner_draw is distinct from p_draw
    and b.value->>'scheduled_start' is not null and b.value->>'scheduled_end' is not null
$$;

-- Plan complete waves in stored order, using the first conflict-free SAST
-- window. Existing bookings are anchors and are never rescheduled here.
create function private.tm_plan_host_rotation_courts(
    p_event bigint,p_draw uuid,p_division uuid,p_rotation jsonb,p_minutes integer,p_rest integer
) returns jsonb language plpgsql stable set search_path = '' as $$
declare
    matches jsonb;
    occupied jsonb;
    bookings jsonb:='[]'::jsonb;
    tm_dates jsonb;
    legacy_dates jsonb;
    wave record;
    day record;
    last_round integer;
    last_end timestamptz;
    earliest timestamptz;
    proposed_start timestamptz;
    proposed_end timestamptz;
    conflict_end timestamptz;
    duration interval:=make_interval(mins=>p_minutes);
    rest interval:=make_interval(mins=>p_rest);
begin
    if p_minutes is null or p_minutes not between 1 and 1440 or p_rest is null or p_rest not between 0 and 1440 then
        raise exception 'Use whole match and rest minutes within one day';
    end if;
    if jsonb_typeof(p_rotation->'fixtures') is distinct from 'array' or jsonb_array_length(p_rotation->'fixtures')=0 then
        raise exception 'Choose a rotation with saved fixtures';
    end if;

    select jsonb_agg(jsonb_build_object('id',m.id,'fixture',f.id,'round',f.round,'wave',f.wave,'court',f.court,
        'state',m.status,'expected',m.updated_at,'start',m.scheduled_start,'end',m.scheduled_end,
        'actual_court',m.court_name,'players',public.tm_match_players(m.id)) order by f.round,f.wave,f.court)
    into matches
    from jsonb_to_recordset(p_rotation->'fixtures') f(id text,round integer,wave integer,court integer)
    join public.draw_matches m on m.draw_id=p_draw and m.americano_fixture_key=f.id and m.round_number=f.round and m.stage='group';
    if jsonb_array_length(matches) is distinct from jsonb_array_length(p_rotation->'fixtures')
        or (select count(*) from public.draw_matches where draw_id=p_draw)<>jsonb_array_length(p_rotation->'fixtures')
        or exists (
            select 1 from jsonb_to_recordset(matches) m(id uuid,round integer,wave integer,court integer,state text,
                actual_court text,"start" timestamptz,"end" timestamptz)
            where m.round is null or m.round<1 or m.wave is null or m.wave<1 or m.court is null or m.court<1
                or m.state not in ('pending','scheduled','in_progress','completed')
                or (m."start" is null)<>(m."end" is null)
                or m."start" is not null and (m."end"<=m."start" or m.actual_court is distinct from 'Court '||m.court)
        ) or exists (
            select 1 from jsonb_to_recordset(matches) m(id uuid,round integer,wave integer,court integer)
            group by m.round,m.wave,m.court having count(*)>1
        ) or exists (
            select 1 from jsonb_to_recordset(matches) m(id uuid) group by m.id having count(*)>1
        ) or exists (
            select 1 from jsonb_to_recordset(matches) m(round integer,wave integer,players text[])
            cross join lateral unnest(m.players) player(key) group by m.round,m.wave,player.key having count(*)>1
        ) then
        raise exception 'The saved rotation fixtures or existing courts need review';
    end if;

    select settings->'divisionDays'->p_division::text into tm_dates from public.tournament_workspace where event_id=p_event;
    select state->'workflow'->'play_dates' into legacy_dates from public.draw_player_reviews
        where event_id=p_event and division_id=p_division;
    select coalesce(jsonb_agg(to_jsonb(o)),'[]'::jsonb) into occupied from private.tm_rotation_court_occupancy(p_event,p_draw) o;
    for wave in
        select m.round,m.wave,max(m.court) highest_court,
            count(*) filter(where m."start" is null) unbooked,count(distinct m."start") starts_count,count(distinct m."end") ends_count,
            min(m."start") booked_start,max(m."end") booked_end,
            jsonb_agg(to_jsonb(m) order by m.court) filter(where m."start" is null) new_matches
        from jsonb_to_recordset(matches) m(
            id uuid,fixture text,round integer,wave integer,court integer,state text,expected timestamptz,
            "start" timestamptz,"end" timestamptz,players text[]
        )
        group by m.round,m.wave order by m.round,m.wave
    loop
        if wave.unbooked>0 and exists (
            select 1 from jsonb_to_recordset(matches) m(round integer,wave integer,state text)
            where m.state in ('completed','in_progress') and (m.round,m.wave)>=(wave.round,wave.wave)
        ) then
            raise exception 'Review the missing court times in a played or live wave before assigning the rest';
        end if;
        earliest:=last_end+case when last_round<>wave.round then rest else interval '0' end;
        if wave.starts_count>1 or wave.ends_count>1 or (wave.booked_start is not null and wave.booked_start<earliest) then
            raise exception 'Existing bookings do not leave a complete window for the rotation waves and rest';
        end if;
        proposed_start:=null;
        proposed_end:=null;
        if wave.unbooked=0 then
            proposed_start:=wave.booked_start;
            proposed_end:=wave.booked_end;
        else
            for day in
                select (p.play_date+p.start_time) at time zone 'Africa/Johannesburg' opens,
                    (p.play_date+p.end_time) at time zone 'Africa/Johannesburg' closes
                from public.event_play_days p where p.event_id=p_event and p.is_active and not coalesce(p.is_removed,false)
                    and p.courts_count>=wave.highest_court and p.end_time>p.start_time
                    and (jsonb_typeof(tm_dates) is distinct from 'array' or tm_dates='[]'::jsonb or tm_dates ? p.play_date::text)
                    and (jsonb_typeof(legacy_dates) is distinct from 'array' or legacy_dates ? p.play_date::text)
                order by p.play_date
            loop
                proposed_start:=coalesce(wave.booked_start,greatest(day.opens,earliest));
                proposed_end:=coalesce(wave.booked_end,proposed_start+duration);
                while proposed_start>=day.opens and proposed_end<=day.closes loop
                    select max(o.finishes) into conflict_end
                    from jsonb_to_recordset(occupied) o(court text,starts timestamptz,finishes timestamptz,players text[])
                    cross join jsonb_to_recordset(wave.new_matches) m(court integer,players text[])
                    where o.starts<proposed_end and o.finishes>proposed_start
                        and (o.court='Court '||m.court or o.players is null or o.players && m.players);
                    if conflict_end is null then exit; end if;
                    if wave.booked_start is not null then
                        proposed_start:=null;
                        exit;
                    end if;
                    proposed_start:=conflict_end;
                    proposed_end:=proposed_start+duration;
                end loop;
                if proposed_start>=day.opens and proposed_end<=day.closes then exit; end if;
                proposed_start:=null;
            end loop;
            if proposed_start is null then raise exception 'There is no available playing window for the remaining rotation waves'; end if;
            bookings:=bookings||(
                select jsonb_agg(jsonb_build_object('matchId',m.id,'fixture',m.fixture,'round',m.round,'wave',m.wave,
                    'court','Court '||m.court,'starts',proposed_start,'finishes',proposed_end,'expected',m.expected) order by m.court)
                from jsonb_to_recordset(wave.new_matches) m(id uuid,fixture text,round integer,wave integer,court integer,expected timestamptz)
            );
        end if;
        last_end:=proposed_end;
        last_round:=wave.round;
    end loop;
    return bookings;
end;
$$;

create function public.tm_host_rotation_schedule(p_organisation uuid,p_event bigint,p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    d public.draws;
    selected_draw uuid:=(p_payload->>'p_draw')::uuid;
    division uuid;
    p_minutes integer:=(p_payload->>'p_minutes')::integer;
    p_rest integer:=(p_payload->>'p_rest')::integer;
    versions jsonb;
    bookings jsonb;
    reviewed text;
    runtime_now timestamptz;
    changed integer;
begin
    if auth.uid() is null or not coalesce(public.account_is_active(),false) or p_action is null
        or p_action not in ('preview_rotation_schedule','apply_rotation_schedule') then
        raise exception 'Rotation court scheduling requires the reviewed event host' using errcode='42501';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('tm:'||p_event,0));
    perform 1 from public.organisation_members m where m.organisation_id=p_organisation
        and lower(btrim(m.user_email))=lower(btrim(auth.email())) and m.role in ('owner','admin') for share;
    if not found then raise exception 'Current owner or admin access to the host organisation is required' using errcode='42501'; end if;
    perform 1 from public.calendar c join public.organisations o on o.id=c.organisation_id
        where c.id=p_event and c.organisation_id=p_organisation and o.status='approved'
        and c.is_manual is true and c.is_visible is true and c.event_status is distinct from 'cancelled' for share of c,o;
    if not found then raise exception 'Choose a public 4M event in the selected approved organisation' using errcode='42501'; end if;

    select x.division_id into division from public.draws x join public.tournament_divisions v on v.id=x.division_id and v.event_id=x.event_id
        where x.id=selected_draw and x.event_id=p_event and x.format='americano' and x.draw_kind='main' and v.is_active is distinct from false;
    if division is null then raise exception 'Choose the exact Americano division in this event' using errcode='42501'; end if;
    -- Take the legacy shared division lock before the court lock to avoid
    -- crossing save_americano_draw, which locks the rotation before courts.
    perform pg_advisory_xact_lock(hashtextextended(division::text,0));
    perform pg_advisory_xact_lock(hashtextextended('draw-courts:'||p_event,0));
    select x.* into d from public.draws x join public.tournament_divisions v on v.id=x.division_id and v.event_id=x.event_id
        where x.id=selected_draw and x.event_id=p_event and x.division_id=division and x.format='americano'
            and x.draw_kind='main' and v.is_active is distinct from false for update of x for share of v;
    if d.id is null or d.status not in ('published','in_progress') or d.updated_at is null
        or d.updated_at is distinct from (p_payload->>'p_expected')::timestamptz then
        raise exception 'The published Americano rotation changed. Reload and review the courts';
    end if;
    perform 1 from public.draw_matches where draw_id=d.id order by id for update;
    perform 1 from public.event_play_days where event_id=p_event order by play_date for share;
    perform 1 from public.draw_player_reviews where event_id=p_event and division_id=d.division_id for share;
    if exists (
        select 1 from public.tournament_schedules s where s.event_id=p_event and (
            exists(select 1 from jsonb_array_elements(s.fixtures) f where f->>'draw_id'=d.id::text)
            or exists(select 1 from public.draw_matches m where m.draw_id=d.id and
                (s.assignments ? m.id::text or s.published_assignments ? m.id::text))
        )
    ) then
        raise exception 'This rotation belongs to the Tournament Manager schedule. Use that schedule to keep its reserved courts';
    end if;
    select jsonb_object_agg(id::text,updated_at) into versions from public.draw_matches where draw_id=d.id;
    if p_payload->'p_match_versions' is distinct from versions then
        raise exception 'The rotation fixtures changed. Refresh before planning courts';
    end if;
    bookings:=private.tm_plan_host_rotation_courts(p_event,d.id,d.division_id,d.scoring_rules->'americano',p_minutes,p_rest);
    reviewed:=md5(jsonb_build_array(d.id,d.updated_at,versions,p_minutes,p_rest,bookings)::text);

    if p_action='apply_rotation_schedule' then
        if (p_payload->>'p_review') is distinct from reviewed then
            raise exception 'The court plan changed. Preview the current times before saving';
        end if;
        if jsonb_array_length(bookings)=0 then raise exception 'Every rotation match already has a court time'; end if;
        runtime_now:=clock_timestamp();
        update public.draw_matches m set court_name=b.court,
            scheduled_start=b.starts,scheduled_end=b.finishes,status='scheduled',updated_at=runtime_now
        from jsonb_to_recordset(bookings) b("matchId" uuid,court text,starts timestamptz,finishes timestamptz,expected timestamptz)
        where m.id=b."matchId" and m.draw_id=d.id and m.updated_at=b.expected
            and m.status in ('pending','scheduled') and m.scheduled_start is null and m.scheduled_end is null;
        get diagnostics changed=row_count;
        if changed<>jsonb_array_length(bookings) then raise exception 'A reviewed match could not be booked'; end if;

        update public.draws set scoring_rules=jsonb_set(scoring_rules,'{americano,fixtures}',(
            select jsonb_agg(case when b.fixture is null then f.item
                else f.item||jsonb_build_object('scheduled_start',b.starts,'scheduled_end',b.finishes) end order by f.ord)
            from jsonb_array_elements(d.scoring_rules->'americano'->'fixtures') with ordinality f(item,ord)
            left join jsonb_to_recordset(bookings) b(fixture text,starts timestamptz,finishes timestamptz) on b.fixture=f.item->>'id'
        )),updated_at=runtime_now where id=d.id;
        perform public.tm_log(p_event,'rotation.courts_saved',jsonb_build_object('draw_id',d.id,'matches',changed));
    end if;
    return jsonb_build_object('organisationId',p_organisation,'eventId',p_event,'drawId',d.id,'divisionId',d.division_id,
        'action',p_action,'bookings',bookings,'review',reviewed);
end;
$$;

revoke all on function private.tm_rotation_court_occupancy(bigint,uuid),
    private.tm_plan_host_rotation_courts(bigint,uuid,uuid,jsonb,integer,integer),
    public.tm_host_rotation_schedule(uuid,bigint,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.tm_host_rotation_schedule(uuid,bigint,text,jsonb) to authenticated;
