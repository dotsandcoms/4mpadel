-- Route both reviewed plate actions through the same atomic implementation.
-- Organisation authority is confined to the approved host of the reviewed event.
create schema if not exists private;

create function private.native_enable_reviewed_silver_plate(
    p_event_id bigint,
    p_draw_id uuid,
    p_expected_draw timestamptz
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
    reviewed public.draws;
    next_version timestamptz;
begin
    perform 1 from public.calendar
      where id = p_event_id and is_manual is true and event_status is distinct from 'cancelled' for share;
    if not found then raise exception 'Choose an active 4M-hosted event'; end if;

    select d.* into reviewed
      from public.draws d
      join public.tournament_divisions v on v.id = d.division_id and v.event_id = d.event_id
      where d.id = p_draw_id and d.event_id = p_event_id and v.is_active is distinct from false
      for update of d for share of v;
    if not found or reviewed.draw_kind <> 'main' or reviewed.format not in ('knockout', 'group_knockout')
        or reviewed.status not in ('published', 'in_progress', 'completed') then
        raise exception 'Choose an eligible published main draw for this event';
    end if;
    if p_expected_draw is null or reviewed.updated_at is distinct from p_expected_draw then
        raise exception 'The draw changed. Reopen it before enabling the Silver plate';
    end if;
    if jsonb_typeof(reviewed.scoring_rules) is distinct from 'object'
        or coalesce(reviewed.scoring_rules->'plate_mode', 'null'::jsonb)
            not in ('null'::jsonb, '"none"'::jsonb, '[]'::jsonb)
        or exists (select 1 from public.draws where division_id = reviewed.division_id and draw_kind = 'silver') then
        raise exception 'This division already uses a plate or placement format';
    end if;

    perform 1 from public.draw_matches where draw_id = reviewed.id order by id for share;
    if not exists (select 1 from public.draw_matches where draw_id = reviewed.id and stage = 'knockout')
        or exists (select 1 from public.draw_matches where draw_id = reviewed.id and left(round_code, 7) = 'places_') then
        raise exception 'The main draw needs knockout matches and no placement fixtures';
    end if;

    update public.draws
       set scoring_rules = jsonb_set(reviewed.scoring_rules, '{plate_mode}', '"double"'::jsonb),
           updated_at = clock_timestamp()
     where id = reviewed.id and event_id = p_event_id and division_id = reviewed.division_id
       and updated_at = p_expected_draw
     returning updated_at into next_version;
    if not found then raise exception 'Could not confirm the Silver plate setting'; end if;
    return jsonb_build_object('id', reviewed.id, 'event_id', p_event_id, 'division_id', reviewed.division_id,
                              'plate_mode', 'double', 'updated_at', next_version);
end;
$$;

create function private.native_create_reviewed_linked_plate(
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
    perform 1 from public.calendar
      where id = p_event_id and is_manual is true and event_status is distinct from 'cancelled' for share;
    if not found then raise exception 'Choose an active 4M-hosted event'; end if;

    select d.* into parent
      from public.draws d
      join public.tournament_divisions v on v.id = d.division_id and v.event_id = d.event_id
      where d.id = p_parent_draw and d.event_id = p_event_id and v.is_active is distinct from false
      for update of d for share of v;
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
    -- A fresh knockout can only have outcomes from opening-round byes.
    -- Prefill those winner slots without invoking the legacy authority gate.
    update public.draw_matches as next_match
       set entry_one_id = left_feeder.winner_entry_id,
           entry_two_id = right_feeder.winner_entry_id,
           updated_at = clock_timestamp()
      from public.draw_matches as left_feeder
      join public.draw_matches as right_feeder
        on right_feeder.draw_id = left_feeder.draw_id
       and right_feeder.winner_to_match_id = left_feeder.winner_to_match_id
       and right_feeder.winner_to_slot = 2
     where next_match.draw_id = target.id
       and next_match.id = left_feeder.winner_to_match_id
       and left_feeder.draw_id = target.id
       and left_feeder.round_number = 1
       and left_feeder.winner_to_slot = 1
       and (left_feeder.winner_entry_id is not null or right_feeder.winner_entry_id is not null);

    insert into public.draw_match_audit (match_id, action, after_state, actor_email)
    select id, 'created', jsonb_build_object('draw_kind', plate_kind, 'parent_draw_id', parent.id,
           'source', parent.draw_kind || '_opening_round_losers', 'entry_count', entry_count), auth.email()
    from public.draw_matches where draw_id = target.id order by round_number, bracket_position limit 1;
    return jsonb_build_object('id', target.id, 'kind', plate_kind, 'created', true, 'entry_count', entry_count);
end;
$$;

-- Preserve the installed platform signatures and their existing actor checks.
create or replace function public.native_enable_silver_plate(
    p_event_id bigint, p_draw_id uuid, p_expected_draw timestamptz
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
    if auth.uid() is null or not coalesce(public.account_is_active(), false)
        or not coalesce(public.is_super_admin(auth.email()), false)
        or not coalesce(public.can_manage_native_draw(p_event_id), false) then
        raise exception 'An active platform administrator is required' using errcode = '42501';
    end if;
    return private.native_enable_reviewed_silver_plate(p_event_id, p_draw_id, p_expected_draw);
end;
$$;

create or replace function public.native_create_linked_plate(
    p_event_id bigint, p_parent_draw uuid, p_expected_parent timestamptz, p_expected_matches jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
    if auth.uid() is null or not coalesce(public.account_is_active(), false)
        or not coalesce(public.is_super_admin(auth.email()), false)
        or not coalesce(public.can_manage_native_draw(p_event_id), false) then
        raise exception 'An active platform administrator is required' using errcode = '42501';
    end if;
    return private.native_create_reviewed_linked_plate(p_event_id, p_parent_draw, p_expected_parent, p_expected_matches);
end;
$$;

create function public.native_manage_organisation_draw_plate(
    p_organisation_id uuid, p_event_id bigint, p_draw_id uuid, p_expected_draw timestamptz,
    p_action text, p_expected_matches jsonb default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
    receipt jsonb;
begin
    if auth.uid() is null or not coalesce(public.account_is_active(), false) then
        raise exception 'An active organisation administrator is required' using errcode = '42501';
    end if;

    perform 1 from public.organisation_members member
     where member.organisation_id = p_organisation_id
       and lower(btrim(member.user_email)) = lower(btrim(auth.email()))
       and member.role in ('owner', 'admin') for share;
    if not found then
        raise exception 'Current owner or admin access to the host organisation is required' using errcode = '42501';
    end if;

    perform 1 from public.calendar c join public.organisations o on o.id = c.organisation_id
     where c.id = p_event_id and c.organisation_id = p_organisation_id and o.status = 'approved'
       and c.is_manual is true and c.event_status is distinct from 'cancelled' for share of c, o;
    if not found then
        raise exception 'Choose an active event owned by the selected organisation' using errcode = '42501';
    end if;

    case p_action
        when 'enable-silver' then
            if p_expected_matches is not null then raise exception 'Review the Silver setting separately from its opening results'; end if;
            receipt := private.native_enable_reviewed_silver_plate(p_event_id, p_draw_id, p_expected_draw);
        when 'create-plate' then
            receipt := private.native_create_reviewed_linked_plate(p_event_id, p_draw_id, p_expected_draw, p_expected_matches);
        else
            raise exception 'This draw plate action is unavailable' using errcode = '42501';
    end case;

    return receipt || jsonb_build_object('organisation_id', p_organisation_id, 'event_id', p_event_id,
        'source_draw_id', p_draw_id, 'action', p_action);
end;
$$;

revoke all on function private.native_enable_reviewed_silver_plate(bigint, uuid, timestamptz),
    private.native_create_reviewed_linked_plate(bigint, uuid, timestamptz, jsonb)
    from public, anon, authenticated, service_role;
revoke all on function public.native_enable_silver_plate(bigint, uuid, timestamptz),
    public.native_create_linked_plate(bigint, uuid, timestamptz, jsonb),
    public.native_manage_organisation_draw_plate(uuid, bigint, uuid, timestamptz, text, jsonb)
    from public, anon, authenticated, service_role;
grant execute on function public.native_enable_silver_plate(bigint, uuid, timestamptz),
    public.native_create_linked_plate(bigint, uuid, timestamptz, jsonb),
    public.native_manage_organisation_draw_plate(uuid, bigint, uuid, timestamptz, text, jsonb)
    to authenticated;
