-- Organisation operators use an exact host and event, without the legacy
-- account-wide native administration helper or global ranking access.
create function public.native_manage_organisation_draw(
    p_organisation_id uuid, p_event_id bigint, p_draw_id uuid, p_expected_draw timestamptz,
    p_action text, p_match_id uuid default null, p_expected_match timestamptz default null,
    p_matches jsonb default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
    draw_record public.draws;
    match_record public.draw_matches;
    revised timestamptz := clock_timestamp();
    next_status text;
    featured boolean;
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
    if not found then raise exception 'Choose an active event owned by the selected organisation'; end if;
    if p_action is null or p_action not in ('live', 'feature', 'complete') then
        raise exception 'This native draw action is unavailable for organisation accounts' using errcode = '42501';
    end if;

    select d.* into draw_record
      from public.draws d join public.tournament_divisions v on v.id = d.division_id and v.event_id = d.event_id
     where d.id = p_draw_id and d.event_id = p_event_id and v.is_active is distinct from false
       and d.status in ('published', 'in_progress') for update of d for share of v;
    if not found then raise exception 'Choose an active published draw in this event'; end if;
    if p_expected_draw is null or draw_record.updated_at is distinct from p_expected_draw then
        raise exception 'The draw changed. Reopen it before continuing';
    end if;

    -- The draw and match locks also protect the count of featured matches,
    -- and the reviewed completion set.
    perform 1 from public.draw_matches where draw_id = draw_record.id order by id for update;
    if p_action in ('live', 'feature') then
        select * into match_record from public.draw_matches where id = p_match_id and draw_id = draw_record.id;
        if not found or p_expected_match is null or match_record.updated_at is distinct from p_expected_match then
            raise exception 'The reviewed match changed or belongs to another draw';
        end if;
        if p_action = 'live' then
            if match_record.status not in ('pending', 'scheduled', 'in_progress')
                or match_record.entry_one_id is null or match_record.entry_two_id is null then
                raise exception 'This match cannot change live status';
            end if;
            next_status := case when match_record.status <> 'in_progress' then 'in_progress'
                              when match_record.scheduled_start is not null then 'scheduled' else 'pending' end;
            update public.draw_matches set status = next_status, updated_at = revised where id = match_record.id;
        else
            featured := not coalesce(match_record.is_featured, false);
            if featured and (select count(*) from public.draw_matches where draw_id = draw_record.id and is_featured) >= 4 then
                raise exception 'Remove a featured match before adding another';
            end if;
            update public.draw_matches set is_featured = featured, updated_at = revised where id = match_record.id;
        end if;
    else
        if draw_record.format = 'americano' or jsonb_typeof(p_matches) is distinct from 'object'
            or (select count(*) from jsonb_object_keys(p_matches)) <> (select count(*) from public.draw_matches where draw_id = draw_record.id)
            or not exists (select 1 from public.draw_matches where draw_id = draw_record.id and entry_one_id is not null and entry_two_id is not null)
            or (draw_record.format = 'group_knockout' and not exists (select 1 from public.draw_matches where draw_id = draw_record.id and stage = 'knockout'))
            or exists (
                select 1 from public.draw_matches m where m.draw_id = draw_record.id and (
                    m.status not in ('completed', 'walkover', 'retired', 'cancelled')
                    or (p_matches->m.id::text->>0) is distinct from m.status
                    or (p_matches->m.id::text->>1)::timestamptz is distinct from m.updated_at
                )
            ) then
            raise exception 'The reviewed results changed or the draw still has unresolved matches';
        end if;
        next_status := 'completed';
        update public.draws set status = next_status, completed_at = revised, updated_at = revised where id = draw_record.id;
    end if;

    return jsonb_build_object('organisation_id', p_organisation_id, 'event_id', p_event_id, 'draw_id', p_draw_id,
        'match_id', match_record.id, 'action', p_action, 'status', next_status, 'featured', featured);
end;
$$;

revoke all on function public.native_manage_organisation_draw(uuid,bigint,uuid,timestamptz,text,uuid,timestamptz,jsonb)
    from public, anon, authenticated, service_role;
grant execute on function public.native_manage_organisation_draw(uuid,bigint,uuid,timestamptz,text,uuid,timestamptz,jsonb) to authenticated;
