-- Draft court plans are private even when a draw is shared through its old
-- public-preview link. They become reservations only on checked publication.
create table private.host_rotation_draft_schedules (
    draw_id uuid primary key references public.draws(id) on delete cascade,
    organisation_id uuid not null,
    match_versions jsonb not null check (jsonb_typeof(match_versions)='object'),
    bookings jsonb not null check (jsonb_typeof(bookings)='array'),
    match_minutes integer not null check (match_minutes between 1 and 1440),
    rest_minutes integer not null check (rest_minutes between 0 and 1440)
);
alter table private.host_rotation_draft_schedules enable row level security;
revoke all on private.host_rotation_draft_schedules from public,anon,authenticated,service_role;

create function private.tm_rotation_owned_by_timetable(p_event bigint,p_draw uuid)
returns boolean language sql stable set search_path = '' as $$
    select exists(
        select 1 from public.tournament_schedules s where s.event_id=p_event and (
            exists(select 1 from jsonb_array_elements(s.fixtures) f where f->>'draw_id'=p_draw::text)
            or exists(select 1 from public.draw_matches m where m.draw_id=p_draw and
                (s.assignments ? m.id::text or s.published_assignments ? m.id::text))
        )
    )
$$;

create function private.tm_project_rotation_courts(p_draw uuid,p_bookings jsonb) returns integer
language plpgsql set search_path = '' as $$
declare
    updated timestamptz:=clock_timestamp();
    changed integer;
begin
    update public.draw_matches m set court_name=b.court,
        scheduled_start=b.starts,scheduled_end=b.finishes,status='scheduled',updated_at=updated
    from jsonb_to_recordset(p_bookings) b("matchId" uuid,court text,starts timestamptz,finishes timestamptz,expected timestamptz)
    where m.id=b."matchId" and m.draw_id=p_draw and m.updated_at=b.expected
        and m.status in ('pending','scheduled') and m.scheduled_start is null and m.scheduled_end is null;
    get diagnostics changed=row_count;
    if changed<>jsonb_array_length(p_bookings) then raise exception 'A reviewed match could not be booked'; end if;

    update public.draws d set scoring_rules=jsonb_set(d.scoring_rules,'{americano,fixtures}',(
        select jsonb_agg(case when b.fixture is null then f.item
            else f.item||jsonb_build_object('scheduled_start',b.starts,'scheduled_end',b.finishes) end order by f.ord)
        from jsonb_array_elements(d.scoring_rules->'americano'->'fixtures') with ordinality f(item,ord)
        left join jsonb_to_recordset(p_bookings) b(fixture text,starts timestamptz,finishes timestamptz) on b.fixture=f.item->>'id'
    )),updated_at=updated where d.id=p_draw;
    return changed;
end;
$$;

-- Confirm the saved selections rather than generating a different plan when a
-- court elsewhere becomes free. Refuse stale players/fixtures and new clashes.
create function private.tm_validate_rotation_draft_schedule(p_event bigint,p_draw uuid)
returns jsonb language plpgsql set search_path = '' as $$
declare
    d public.draws;
    plan private.host_rotation_draft_schedules;
    versions jsonb;
    modern_dates jsonb;
    legacy_dates jsonb;
    changed boolean;
begin
    select * into plan from private.host_rotation_draft_schedules where draw_id=p_draw for update;
    if not found then return null; end if;
    select * into d from public.draws where id=p_draw and event_id=p_event;
    perform 1 from public.calendar c join public.organisations o on o.id=c.organisation_id
        where c.id=p_event and c.organisation_id=plan.organisation_id and o.status='approved'
        and c.is_visible is true and c.is_manual is true and c.event_status is distinct from 'cancelled' for share of c,o;
    if not found or d.id is null or d.status<>'draft' or d.format<>'americano' or d.draw_kind<>'main' then
        raise exception 'Choose the private main rotation and make its event public before publishing the court times';
    end if;
    if private.tm_rotation_owned_by_timetable(p_event,p_draw) then
        raise exception 'This rotation belongs to the Tournament Manager schedule. Keep its reserved courts there';
    end if;

    perform 1 from public.draw_matches where draw_id=p_draw order by id for update;
    perform 1 from public.event_play_days where event_id=p_event order by play_date for share;
    perform 1 from public.draw_player_reviews where event_id=p_event and division_id=d.division_id for share;
    select jsonb_object_agg(id::text,updated_at) into versions from public.draw_matches where draw_id=p_draw;
    select settings->'divisionDays'->d.division_id::text into modern_dates from public.tournament_workspace where event_id=p_event;
    select state->'workflow'->'play_dates' into legacy_dates from public.draw_player_reviews
        where event_id=p_event and division_id=d.division_id;

    if plan.match_versions is distinct from versions
        or jsonb_array_length(plan.bookings) is distinct from (select count(*)::integer from public.draw_matches where draw_id=p_draw)
        or (select count(distinct b->>'matchId') from jsonb_array_elements(plan.bookings) b)<>jsonb_array_length(plan.bookings)
        or jsonb_array_length(plan.bookings)=0 then
        raise exception 'The saved draft court plan no longer matches the fixtures. Review the private court times again';
    end if;
    with booked as (
        select b.*,public.tm_match_players(m.id) people
        from jsonb_to_recordset(plan.bookings) b("matchId" uuid,fixture text,round integer,wave integer,court text,
                starts timestamptz,finishes timestamptz,expected timestamptz)
        left join public.draw_matches m on m.id=b."matchId" and m.draw_id=p_draw
    ), occupied as materialized (
        select * from private.tm_rotation_court_occupancy(p_event,p_draw)
    ), waves as (
        select b.round,b.wave,min(b.starts) first_start,max(b.finishes) last_finish,
            count(distinct b.starts) start_count,count(distinct b.finishes) finish_count,
            lag(max(b.finishes)) over(order by b.round,b.wave) previous_finish,
            lag(b.round) over(order by b.round,b.wave) previous_round
        from booked b group by b.round,b.wave
    )
    select exists (
        select 1 from booked b
        left join public.draw_matches m on m.id=b."matchId" and m.draw_id=p_draw
        left join jsonb_to_recordset(d.scoring_rules->'americano'->'fixtures') f(id text,round integer,wave integer,court integer)
            on f.id=m.americano_fixture_key
        where m.id is null or m.updated_at is distinct from b.expected or m.status<>'pending'
            or m.scheduled_start is not null or m.scheduled_end is not null
            or f.id is distinct from b.fixture or f.round is distinct from b.round or f.wave is distinct from b.wave
            or b.court is distinct from 'Court '||f.court
            or b.starts is null or b.finishes is null or b.finishes-b.starts<>make_interval(mins=>plan.match_minutes)
            or not exists (
                select 1 from public.event_play_days day where day.event_id=p_event and day.is_active
                    and not coalesce(day.is_removed,false) and day.courts_count>=f.court and day.end_time>day.start_time
                    and b.starts>=(day.play_date+day.start_time) at time zone 'Africa/Johannesburg'
                    and b.finishes<=(day.play_date+day.end_time) at time zone 'Africa/Johannesburg'
                    and (jsonb_typeof(modern_dates) is distinct from 'array' or modern_dates='[]' or modern_dates ? day.play_date::text)
                    and (jsonb_typeof(legacy_dates) is distinct from 'array' or legacy_dates ? day.play_date::text)
            ) or exists (
                select 1 from occupied o
                where o.starts<b.finishes and o.finishes>b.starts and (o.court=b.court or o.players is null or o.players && b.people)
            )
    ) or exists (
        select 1 from waves w where w.start_count<>1 or w.finish_count<>1
            or w.first_start<w.previous_finish+case when w.previous_round<>w.round then make_interval(mins=>plan.rest_minutes) else interval '0' end
    ) into changed;
    if changed then raise exception 'A saved draft court time is no longer available. Review the private plan again'; end if;
    return plan.bookings;
end;
$$;

-- Alternate legacy writers cannot silently publish a staged plan without its
-- durable projection. They may publish an ordinary unscheduled draft as before.
create function private.tm_guard_rotation_draft_publication() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    if exists (
        select 1 from private.host_rotation_draft_schedules plan
        cross join lateral jsonb_to_recordset(plan.bookings) b("matchId" uuid,fixture text,court text,starts timestamptz,finishes timestamptz)
        left join public.draw_matches m on m.id=b."matchId" and m.draw_id=new.id and m.americano_fixture_key=b.fixture
        left join jsonb_to_recordset(new.scoring_rules->'americano'->'fixtures') f(id text,scheduled_start timestamptz,scheduled_end timestamptz)
            on f.id=b.fixture
        where plan.draw_id=new.id and (
            not exists(select 1 from public.calendar c where c.id=new.event_id and c.organisation_id=plan.organisation_id)
            or m.id is null or m.court_name is distinct from b.court
            or m.scheduled_start is distinct from b.starts or m.scheduled_end is distinct from b.finishes
            or f.scheduled_start is distinct from b.starts or f.scheduled_end is distinct from b.finishes
        )
    ) then
        raise exception 'Publish this private court plan from the reviewed Tournament Manager draw';
    end if;
    return new;
end;
$$;
create trigger tm_guard_rotation_draft_publication
before update of status on public.draws for each row
when (old.status='draft' and new.status in ('published','in_progress','completed'))
execute function private.tm_guard_rotation_draft_publication();

create or replace function private.tm_review_publish_draw(p_event bigint,p_draw uuid,p_expected timestamptz, p_host_organisation uuid) returns void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
#variable_conflict use_column
DECLARE d public.draws; c public.tournament_confirmations; bookings jsonb; planned_division uuid;
BEGIN
 IF p_host_organisation IS NULL THEN PERFORM public.tm_require(p_event,'draws'); END IF; PERFORM pg_advisory_xact_lock(hashtextextended('tm:'||p_event,0));
 SELECT x.division_id INTO planned_division FROM public.draws x
 JOIN private.host_rotation_draft_schedules p ON p.draw_id=x.id WHERE x.id=p_draw AND x.event_id=p_event;
 IF planned_division IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(planned_division::text,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('draw-courts:'||p_event,0));
 END IF;
 SELECT * INTO d FROM public.draws WHERE id=p_draw AND event_id=p_event FOR UPDATE;
 IF d.id IS NULL OR d.status<>'draft' OR d.updated_at IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Draw changed. Reload and preview again'; END IF;
 SELECT * INTO c FROM public.tournament_confirmations WHERE division_id=d.division_id;
 IF c.players_confirmed_at IS NULL OR c.format_confirmed_at IS NULL OR c.players_fingerprint IS DISTINCT FROM public.tm_player_fingerprint(d.division_id) OR (d.format<>'americano' AND c.seeds_confirmed_at IS NULL) THEN RAISE EXCEPTION 'Preparation needs confirmation'; END IF;
 IF (d.scoring_rules->>'preparation_revision')::integer IS DISTINCT FROM c.revision THEN RAISE EXCEPTION 'Preparation changed. Generate and save a fresh preview'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.draw_matches WHERE draw_id=d.id) THEN RAISE EXCEPTION 'Generate a draw first'; END IF;
 IF planned_division IS NOT NULL THEN
  bookings:=private.tm_validate_rotation_draft_schedule(p_event,d.id);
  PERFORM private.tm_project_rotation_courts(d.id,bookings);
 END IF;
 UPDATE public.draws SET status='published',published_at=now(),updated_at=clock_timestamp() WHERE id=d.id;
 IF planned_division IS NOT NULL THEN
  DELETE FROM private.host_rotation_draft_schedules WHERE draw_id=d.id;
  PERFORM public.tm_log(p_event,'rotation.draft_courts_published',jsonb_build_object('draw_id',d.id,'matches',jsonb_array_length(bookings)));
 END IF;
 PERFORM public.tm_log(p_event,'draw.published',jsonb_build_object('division_id',d.division_id));
END $$;

create or replace function public.tm_host_rotation_schedule(p_organisation uuid,p_event bigint,p_action text,p_payload jsonb)
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
    event_visible boolean;
    plan private.host_rotation_draft_schedules;
    changed integer;
begin
    if auth.uid() is null or not coalesce(public.account_is_active(),false) or p_action is null
        or p_action not in ('preview_rotation_schedule','apply_rotation_schedule','read_draft_rotation_schedule','discard_draft_rotation_schedule') then
        raise exception 'Rotation court scheduling requires the reviewed event host' using errcode='42501';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('tm:'||p_event,0));
    perform 1 from public.organisation_members m where m.organisation_id=p_organisation
        and lower(btrim(m.user_email))=lower(btrim(auth.email())) and m.role in ('owner','admin') for share;
    if not found then raise exception 'Current owner or admin access to the host organisation is required' using errcode='42501'; end if;
    select c.is_visible into event_visible from public.calendar c join public.organisations o on o.id=c.organisation_id
        where c.id=p_event and c.organisation_id=p_organisation and o.status='approved'
        and c.is_manual is true and c.event_status is distinct from 'cancelled' for share of c,o;
    if not found then raise exception 'Choose a 4M event in the selected approved organisation' using errcode='42501'; end if;

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
    if d.id is null or d.status not in ('draft','published','in_progress') or d.updated_at is null
        or d.updated_at is distinct from (p_payload->>'p_expected')::timestamptz then
        raise exception 'The Americano rotation changed. Reload and review the courts';
    end if;
    if d.status<>'draft' and (event_visible is distinct from true
        or p_action in ('read_draft_rotation_schedule','discard_draft_rotation_schedule')) then
        raise exception 'Choose the private draft or the public Americano rotation for this action' using errcode='42501';
    end if;
    perform 1 from public.draw_matches where draw_id=d.id order by id for update;
    perform 1 from public.event_play_days where event_id=p_event order by play_date for share;
    perform 1 from public.draw_player_reviews where event_id=p_event and division_id=d.division_id for share;
    select jsonb_object_agg(id::text,updated_at) into versions from public.draw_matches where draw_id=d.id;
    if p_payload->'p_match_versions' is distinct from versions then
        raise exception 'The rotation fixtures changed. Refresh before planning courts';
    end if;
    select * into plan from private.host_rotation_draft_schedules where draw_id=d.id for update;
    if p_action='discard_draft_rotation_schedule' then
        delete from private.host_rotation_draft_schedules where draw_id=d.id;
        if found then
            update public.draws set updated_at=clock_timestamp() where id=d.id;
            perform public.tm_log(p_event,'rotation.draft_courts_discarded',jsonb_build_object('draw_id',d.id));
        end if;
        return jsonb_build_object('organisationId',p_organisation,'eventId',p_event,'drawId',d.id,'divisionId',d.division_id,
            'action',p_action,'bookings','[]'::jsonb,'review','');
    end if;
    if p_action='read_draft_rotation_schedule' then
        return jsonb_build_object('organisationId',p_organisation,'eventId',p_event,'drawId',d.id,'divisionId',d.division_id,
            'action',p_action,'bookings',case when plan.organisation_id=p_organisation then plan.bookings else '[]'::jsonb end,'review','',
            'hasPlan',plan.draw_id is not null,'stale',plan.draw_id is not null and
                (plan.organisation_id is distinct from p_organisation or plan.match_versions is distinct from versions),
            'matchMinutes',case when plan.organisation_id=p_organisation then plan.match_minutes end,
            'restMinutes',case when plan.organisation_id=p_organisation then plan.rest_minutes end);
    end if;
    if private.tm_rotation_owned_by_timetable(p_event,d.id) then
        raise exception 'This rotation belongs to the Tournament Manager schedule. Use that schedule to keep its reserved courts';
    end if;
    if d.status='draft' and (exists (
        select 1 from public.draw_matches where draw_id=d.id and
            (scheduled_start is not null or scheduled_end is not null or status<>'pending')
    ) or exists (
        select 1 from jsonb_array_elements(d.scoring_rules->'americano'->'fixtures') f
        where f->>'scheduled_start' is not null or f->>'scheduled_end' is not null
    )) then
        raise exception 'This draft already has legacy court times. Review it in the original draw schedule';
    end if;
    bookings:=private.tm_plan_host_rotation_courts(p_event,d.id,d.division_id,d.scoring_rules->'americano',p_minutes,p_rest);
    reviewed:=md5(jsonb_build_array(d.id,d.updated_at,versions,p_minutes,p_rest,bookings)::text);

    if p_action='apply_rotation_schedule' then
        if (p_payload->>'p_review') is distinct from reviewed then
            raise exception 'The court plan changed. Preview the current times before saving';
        end if;
        if jsonb_array_length(bookings)=0 then raise exception 'Every rotation match already has a court time'; end if;
        if d.status='draft' then
            if jsonb_array_length(bookings) is distinct from (select count(*)::integer from public.draw_matches where draw_id=d.id) then
                raise exception 'Review the complete draft rotation before saving court times';
            end if;
            insert into private.host_rotation_draft_schedules(draw_id,organisation_id,match_versions,bookings,match_minutes,rest_minutes)
            values(d.id,p_organisation,versions,bookings,p_minutes,p_rest)
            on conflict(draw_id) do update set organisation_id=excluded.organisation_id,
                match_versions=excluded.match_versions,bookings=excluded.bookings,
                match_minutes=excluded.match_minutes,rest_minutes=excluded.rest_minutes;
            update public.draws set updated_at=clock_timestamp() where id=d.id;
            perform public.tm_log(p_event,'rotation.draft_courts_saved',jsonb_build_object('draw_id',d.id,'matches',jsonb_array_length(bookings)));
        else
            changed:=private.tm_project_rotation_courts(d.id,bookings);
            perform public.tm_log(p_event,'rotation.courts_saved',jsonb_build_object('draw_id',d.id,'matches',changed));
        end if;
    end if;
    return jsonb_build_object('organisationId',p_organisation,'eventId',p_event,'drawId',d.id,'divisionId',d.division_id,
        'action',p_action,'bookings',bookings,'review',reviewed);
end;
$$;

revoke all on function private.tm_rotation_owned_by_timetable(bigint,uuid),
    private.tm_project_rotation_courts(uuid,jsonb),private.tm_validate_rotation_draft_schedule(bigint,uuid),
    private.tm_guard_rotation_draft_publication() from public,anon,authenticated,service_role;
