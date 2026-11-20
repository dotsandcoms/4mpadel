-- Empty custom placement settings represent a main draw with no back draw.
create or replace function public.native_enable_silver_plate(
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
    if auth.uid() is null or not coalesce(public.account_is_active(), false)
        or not coalesce(public.is_super_admin(auth.email()), false) then
        raise exception 'An active platform administrator is required' using errcode = '42501';
    end if;

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
