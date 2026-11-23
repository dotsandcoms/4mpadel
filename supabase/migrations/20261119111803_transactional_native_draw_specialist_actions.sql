-- Keep the current tables and clients compatible. New Admin saves linked plates as one transaction.
create function public.native_create_linked_plate(
    p_event_id bigint,
    p_parent_draw uuid,
    p_expected_parent timestamptz,
    p_expected_matches jsonb
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
    parent public.draws;
    target public.draws;
    source_match public.draw_matches;
    loser uuid;
    losers uuid[] := '{}';
    seed_order integer[] := array[1, 2];
    next_seeds integer[];
    entrant_ids uuid[];
    plate_kind text;
    mode text;
    opening_round integer;
    reviewed_count integer := 0;
    entry_count integer;
    matches_in_round integer;
    total_rounds integer := 1;
    draw_round integer;
    position integer;
    remaining integer;
    label text;
    first_entry uuid;
    second_entry uuid;
    bye_winner uuid;
    moment timestamptz := clock_timestamp();
begin
    if auth.uid() is null or not coalesce(public.account_is_active(), false)
        or not coalesce(public.is_super_admin(auth.email()), false)
        or not coalesce(public.can_manage_native_draw(p_event_id), false) then
        raise exception 'An active platform administrator is required' using errcode = '42501';
    end if;

    perform 1 from public.calendar
      where id = p_event_id and is_manual is true and event_status is distinct from 'cancelled' for share;
    if not found then raise exception 'Choose an active 4M-hosted event'; end if;

    select d.* into parent
      from public.draws d
      join public.tournament_divisions v on v.id = d.division_id and v.event_id = d.event_id
      where d.id = p_parent_draw and d.event_id = p_event_id and v.is_active is distinct from false
      for update of d;
    if not found or parent.status not in ('published', 'in_progress', 'completed') then
        raise exception 'Choose the published source draw for this event';
    end if;

    mode := parent.scoring_rules->>'plate_mode';
    if parent.draw_kind = 'main' and parent.format in ('knockout', 'group_knockout')
        and mode in ('double', 'triple')
        and not exists (select 1 from public.draw_matches
                        where draw_id = parent.id and stage = 'placement' and left(round_code, 7) = 'places_') then
        plate_kind := 'silver';
    elsif parent.draw_kind = 'silver' and parent.format = 'knockout' and mode = 'triple' then
        plate_kind := 'bronze';
    else
        raise exception 'This source draw does not use a separate linked plate';
    end if;

    -- The existing unique division/kind key also covers concurrent legacy clients.
    select * into target from public.draws
      where division_id = parent.division_id and draw_kind = plate_kind;
    if found then
        select count(*) into entry_count from public.draw_entries where draw_id = target.id;
        if target.event_id <> p_event_id or target.status = 'archived'
            or coalesce(target.scoring_rules->>'parent_draw_id', parent.id::text) <> parent.id::text
            or target.format <> 'knockout' or entry_count < 2
            or (select count(*) from public.draw_matches where draw_id = target.id)
                <> power(2, ceil(log(2, greatest(2, entry_count)::numeric)))::integer - 1
            or (select count(*) from public.draw_matches where draw_id = target.id and winner_to_match_id is null) <> 1 then
            raise exception 'This plate already has a record that requires review';
        end if;
        return jsonb_build_object('id', target.id, 'kind', plate_kind, 'created', false);
    end if;

    if p_expected_parent is null or parent.updated_at is distinct from p_expected_parent
        or jsonb_typeof(p_expected_matches) is distinct from 'object' then
        raise exception 'The source draw changed. Review its opening results again';
    end if;
    select min(round_number) into opening_round from public.draw_matches
      where draw_id = parent.id and stage = 'knockout';
    for source_match in
        select * from public.draw_matches where draw_id = parent.id and stage = 'knockout'
          and round_number = opening_round order by bracket_position, id for update
    loop
        reviewed_count := reviewed_count + 1;
        if source_match.updated_at is distinct from (p_expected_matches->>source_match.id::text)::timestamptz
            or source_match.status not in ('completed', 'walkover', 'retired')
            or source_match.winner_entry_id is null
            or (source_match.winner_entry_id is distinct from source_match.entry_one_id
                and source_match.winner_entry_id is distinct from source_match.entry_two_id) then
            raise exception 'The opening matches changed or still need results';
        end if;
        if source_match.entry_one_id is not null and source_match.entry_two_id is not null then
            loser := case when source_match.winner_entry_id = source_match.entry_one_id
                          then source_match.entry_two_id else source_match.entry_one_id end;
            if source_match.loser_entry_id is not null and source_match.loser_entry_id <> loser then
                raise exception 'An opening result has inconsistent entrants';
            end if;
            if not loser = any(losers) then losers := array_append(losers, loser); end if;
        end if;
    end loop;

    entry_count := cardinality(losers);
    if reviewed_count <> (select count(*) from jsonb_object_keys(p_expected_matches)) or entry_count < 2
        or entry_count <> (select count(*) from public.draw_entries
                           where draw_id = parent.id and id = any(losers) and status <> 'withdrawn') then
        raise exception 'Review all opening results and the eligible losing teams';
    end if;

    insert into public.draws (event_id, division_id, draw_kind, format, status, seeding_method,
                              scoring_rules, generated_at, published_at, created_by, updated_at)
    values (p_event_id, parent.division_id, plate_kind, 'knockout', 'published', 'manual',
            parent.scoring_rules || jsonb_build_object('parent_draw_id', parent.id), moment, moment, auth.email(), moment)
    returning * into target;

    insert into public.draw_entries (draw_id, source_registration_id, player_one_id, player_two_id, team_name,
                                     player_one_name, player_two_name, seed_number, seeding_value, snapshot)
    select target.id, e.source_registration_id, e.player_one_id, e.player_two_id, e.team_name,
           e.player_one_name, e.player_two_name,
           row_number() over (order by e.seed_number nulls last, coalesce(e.seeding_value, 0) desc, e.team_name, e.id),
           e.seeding_value, e.snapshot
    from public.draw_entries e where e.draw_id = parent.id and e.id = any(losers);
    select array_agg(id order by seed_number) into entrant_ids from public.draw_entries where draw_id = target.id;

    -- Current standard seed order alternates each expansion to protect the top seeds.
    while cardinality(seed_order) < entry_count loop
        next_seeds := '{}';
        for position in 1..cardinality(seed_order) loop
            if position % 2 = 1 then
                next_seeds := next_seeds || array[seed_order[position], 2 * cardinality(seed_order) + 1 - seed_order[position]];
            else
                next_seeds := next_seeds || array[2 * cardinality(seed_order) + 1 - seed_order[position], seed_order[position]];
            end if;
        end loop;
        seed_order := next_seeds;
        total_rounds := total_rounds + 1;
    end loop;

    matches_in_round := cardinality(seed_order) / 2;
    for draw_round in 1..total_rounds loop
        remaining := total_rounds - draw_round;
        label := case remaining when 0 then 'Final' when 1 then 'Semifinals' when 2 then 'Quarterfinals'
                 else 'Round of ' || (2 * matches_in_round)::text end;
        for position in 1..matches_in_round loop
            first_entry := null;
            second_entry := null;
            bye_winner := null;
            if draw_round = 1 then
                first_entry := entrant_ids[seed_order[2 * position - 1]];
                second_entry := entrant_ids[seed_order[2 * position]];
                if (first_entry is null) <> (second_entry is null) then
                    bye_winner := coalesce(first_entry, second_entry);
                end if;
            end if;
            insert into public.draw_matches (draw_id, stage, round_code, round_label, round_number, bracket_position,
                                             entry_one_id, entry_two_id, winner_entry_id, status, result_type)
            values (target.id, 'knockout', 'r' || (remaining + 1)::text, label, draw_round, position,
                    first_entry, second_entry, bye_winner, case when bye_winner is null then 'pending' else 'completed' end,
                    case when bye_winner is not null then 'walkover' end);
        end loop;
        matches_in_round := matches_in_round / 2;
    end loop;

    update public.draw_matches as feeder
    set winner_to_match_id = next_match.id, winner_to_slot = case when feeder.bracket_position % 2 = 1 then 1 else 2 end
    from public.draw_matches next_match
    where feeder.draw_id = target.id and next_match.draw_id = target.id
       and next_match.round_number = feeder.round_number + 1
       and next_match.bracket_position = (feeder.bracket_position + 1) / 2;
    perform public.resolve_draw_routes(target.id);

    insert into public.draw_match_audit (match_id, action, after_state, actor_email)
    select id, 'created', jsonb_build_object('draw_kind', plate_kind, 'parent_draw_id', parent.id,
           'source', parent.draw_kind || '_opening_round_losers', 'entry_count', entry_count), auth.email()
    from public.draw_matches where draw_id = target.id order by round_number, bracket_position limit 1;
    return jsonb_build_object('id', target.id, 'kind', plate_kind, 'created', true, 'entry_count', entry_count);
end;
$$;
revoke all on function public.native_create_linked_plate(bigint, uuid, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.native_create_linked_plate(bigint, uuid, timestamptz, jsonb) to authenticated;

create function public.native_save_event_play_days(p_event_id bigint, p_days jsonb, p_expected jsonb)
returns integer
language plpgsql security invoker set search_path = ''
as $$
declare
    day record;
    stored public.event_play_days;
    updated_days integer := 0;
begin
    if auth.uid() is null or not coalesce(public.account_is_active(), false)
        or not coalesce(public.is_super_admin(auth.email()), false)
        or not coalesce(public.can_manage_native_draw(p_event_id), false) then
        raise exception 'An active platform administrator is required' using errcode = '42501';
    end if;
    perform 1 from public.calendar
      where id = p_event_id and is_manual is true and event_status is distinct from 'cancelled' for share;
    if not found then raise exception 'Choose an active 4M-hosted event'; end if;

    if jsonb_typeof(p_days) is distinct from 'array' or jsonb_typeof(p_expected) is distinct from 'object' then
        raise exception 'Review the event playing hours before saving';
    end if;
    if not exists (select 1 from jsonb_array_elements(p_days) item where item->'is_active' = 'true'::jsonb)
        or jsonb_array_length(p_days) <> (select count(distinct item->>'play_date') from jsonb_array_elements(p_days) item) then
        raise exception 'Choose at least one active play day and use unique dates';
    end if;

    perform pg_advisory_xact_lock(hashtextextended('draw-courts:' || p_event_id::text, 0));
    for day in select * from jsonb_to_recordset(p_days) as d(
        play_date date, start_time time without time zone, end_time time without time zone, courts_count integer,
        match_duration_minutes integer, minimum_break_minutes integer, is_active boolean
    ) order by play_date
    loop
        if day.play_date is null or not p_expected ? day.play_date::text
            or day.start_time is null or day.end_time is null or day.start_time >= day.end_time
            or coalesce(day.courts_count, 0) < 1 or coalesce(day.match_duration_minutes, 0) < 1
            or coalesce(day.minimum_break_minutes, -1) < 0 or day.is_active is null then
            raise exception 'Enter valid opening hours, match length and court availability';
        end if;
        select * into stored from public.event_play_days where event_id = p_event_id and play_date = day.play_date for update;
        if found and not coalesce(stored.is_removed, false)
           and (stored.start_time, stored.end_time, stored.courts_count, stored.match_duration_minutes,
                stored.minimum_break_minutes, stored.is_active)
               is not distinct from (day.start_time, day.end_time, day.courts_count, day.match_duration_minutes,
                                     day.minimum_break_minutes, day.is_active) then
            continue;
        end if;
        if stored.updated_at is distinct from (p_expected->>day.play_date::text)::timestamptz then
            raise exception 'Play day % changed after review. Reload before saving', day.play_date;
        end if;
        if stored.event_id is null then
            insert into public.event_play_days (event_id, play_date, start_time, end_time, courts_count, match_duration_minutes,
                                                minimum_break_minutes, is_active, is_removed)
            values (p_event_id, day.play_date, day.start_time, day.end_time, day.courts_count, day.match_duration_minutes,
                    day.minimum_break_minutes, day.is_active, false);
        else
            update public.event_play_days
            set start_time = day.start_time, end_time = day.end_time, courts_count = day.courts_count,
                match_duration_minutes = day.match_duration_minutes, minimum_break_minutes = day.minimum_break_minutes,
                is_active = day.is_active, is_removed = false, updated_at = clock_timestamp()
            where event_id = p_event_id and play_date = day.play_date;
        end if;
        updated_days := updated_days + 1;
    end loop;
    return updated_days;
end;
$$;
revoke all on function public.native_save_event_play_days(bigint, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.native_save_event_play_days(bigint, jsonb, jsonb) to authenticated;
