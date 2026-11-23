-- Commit a reviewed native court plan as a single set of versioned assignments.
create function public.native_apply_court_schedule(p_event_id bigint, p_bookings jsonb)
returns integer
language plpgsql security invoker set search_path = ''
as $$
declare
    row_count integer;
    checked_count integer;
begin
    if auth.uid() is null or not coalesce(public.account_is_active(), false)
        or not coalesce(public.is_super_admin(auth.email()), false)
        or not coalesce(public.can_manage_native_draw(p_event_id), false) then
        raise exception 'An active platform administrator is required' using errcode = '42501';
    end if;
    perform 1 from public.calendar
        where id = p_event_id and is_manual is true and event_status is distinct from 'cancelled' for share;
    if not found then raise exception 'Choose an active 4M-hosted event'; end if;
    if jsonb_typeof(p_bookings) is distinct from 'array' then raise exception 'Review the proposed court bookings first'; end if;

    row_count := jsonb_array_length(p_bookings);
    if row_count < 1 or row_count <> (select count(distinct item->>'match_id') from jsonb_array_elements(p_bookings) item)
       or exists (select 1 from jsonb_to_recordset(p_bookings) as b(
           match_id uuid, draw_id uuid, expected_version timestamptz, court_name text, scheduled_start timestamptz, scheduled_end timestamptz)
           where b.draw_id is null or b.expected_version is null or coalesce(b.court_name, '') !~ '^Court [1-9][0-9]*$'
             or b.scheduled_start is null or b.scheduled_end is null or b.scheduled_end <= b.scheduled_start) then
        raise exception 'Check the reviewed court bookings';
    end if;

    perform 1 from public.draw_matches m
        join public.draws d on d.id = m.draw_id
        join public.tournament_divisions v on v.id = d.division_id and v.event_id = d.event_id
        join jsonb_to_recordset(p_bookings) as b(match_id uuid, draw_id uuid) on b.match_id = m.id and b.draw_id = m.draw_id
        where d.event_id = p_event_id
        order by m.id for update of m;
    get diagnostics checked_count = row_count;
    if row_count <> checked_count then raise exception 'A match is outside the selected event'; end if;

    perform pg_advisory_xact_lock(hashtextextended('draw-courts:' || p_event_id::text, 0));
    if exists (
        select 1 from jsonb_to_recordset(p_bookings) as b(
            match_id uuid, draw_id uuid, expected_version timestamptz, court_name text, scheduled_start timestamptz, scheduled_end timestamptz)
        join public.draw_matches m on m.id = b.match_id and m.draw_id = b.draw_id
        join public.draws d on d.id = m.draw_id and d.event_id = p_event_id
        join public.tournament_divisions v on v.id = d.division_id and v.event_id = d.event_id
        where m.status not in ('pending', 'scheduled') or v.is_active is false or m.americano_fixture_key is not null
           or d.status not in ('draft', 'published', 'in_progress')
           or (m.updated_at is distinct from b.expected_version
               and (m.court_name, m.scheduled_start, m.scheduled_end) is distinct from (b.court_name, b.scheduled_start, b.scheduled_end))
    ) then raise exception 'A reviewed match changed before publication'; end if;

    if exists (
        select 1 from jsonb_to_recordset(p_bookings) as b(court_name text, scheduled_start timestamptz, scheduled_end timestamptz)
        join public.event_play_days day on day.event_id = p_event_id
          and day.play_date = (b.scheduled_start at time zone 'Africa/Johannesburg')::date
        where day.is_removed or not day.is_active
            or split_part(b.court_name, ' ', 2)::numeric > day.courts_count
            or (b.scheduled_start at time zone 'Africa/Johannesburg')::time < day.start_time
            or (b.scheduled_end at time zone 'Africa/Johannesburg')::time > day.end_time
            or (b.scheduled_end at time zone 'Africa/Johannesburg')::date <> day.play_date
    ) then raise exception 'A reviewed booking falls outside current playing hours or courts'; end if;

    if exists (
        with proposed as (
            select * from jsonb_to_recordset(p_bookings) as b(match_id uuid, court_name text, scheduled_start timestamptz, scheduled_end timestamptz)
        ), occupied as (
            select m.id as match_id, m.court_name, m.scheduled_start, coalesce(m.scheduled_end, m.scheduled_start + interval '30 minutes') as scheduled_end
            from public.draw_matches m join public.draws d on d.id = m.draw_id
            where d.event_id = p_event_id and d.status <> 'archived' and m.status <> 'cancelled'
              and m.scheduled_start is not null and not exists (select 1 from proposed b where b.match_id = m.id)
            union all
            select * from proposed
        )
        select 1 from proposed b join occupied o on o.match_id <> b.match_id and o.court_name = b.court_name
        where b.scheduled_start < o.scheduled_end and b.scheduled_end > o.scheduled_start
    ) then raise exception 'A reviewed court booking overlaps another match'; end if;

    update public.draw_matches as m
    set court_name = b.court_name, scheduled_start = b.scheduled_start,
        scheduled_end = b.scheduled_end, updated_at = clock_timestamp()
    from jsonb_to_recordset(p_bookings) as b(
        match_id uuid, draw_id uuid, court_name text, scheduled_start timestamptz, scheduled_end timestamptz)
    where m.id = b.match_id and m.draw_id = b.draw_id
        and (m.court_name, m.scheduled_start, m.scheduled_end) is distinct from (b.court_name, b.scheduled_start, b.scheduled_end);
    return row_count;
end;
$$;
revoke all on function public.native_apply_court_schedule(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.native_apply_court_schedule(bigint, jsonb) to authenticated;
