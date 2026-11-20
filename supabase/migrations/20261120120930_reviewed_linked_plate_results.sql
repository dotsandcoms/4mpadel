-- Reuse native score validation, bracket routing, and audit for linked plates.
-- The existing score writer retains its public permissions and direct callers.
create function public.native_record_reviewed_plate_result(
    p_organisation_id uuid, p_event_id bigint, p_draw_id uuid, p_expected_draw timestamptz,
    p_match_id uuid, p_expected_match timestamptz, p_result jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
    plate public.draws;
    prior public.draw_matches;
    saved public.draw_matches;
begin
    if auth.uid() is null or not coalesce(public.account_is_active(), false) then
        raise exception 'An active administrator is required' using errcode = '42501';
    end if;
    if p_organisation_id is null then
        if not coalesce(public.is_super_admin(auth.email()), false)
            or not coalesce(public.can_manage_native_draw(p_event_id), false) then
            raise exception 'An active platform administrator is required' using errcode = '42501';
        end if;
        perform 1 from public.calendar c
         where c.id = p_event_id and c.is_manual is true and c.event_status is distinct from 'cancelled' for share;
        if not found then raise exception 'Choose an active 4M-hosted event' using errcode = '42501'; end if;
    else
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
    end if;

    select d.* into plate
      from public.draws d join public.tournament_divisions v on v.id = d.division_id and v.event_id = d.event_id
     where d.id = p_draw_id and d.event_id = p_event_id and v.is_active is distinct from false
       and d.draw_kind in ('silver', 'bronze') and d.format = 'knockout'
       and d.status in ('published', 'in_progress', 'completed')
       and exists (
           select 1 from public.draws parent
            where parent.event_id = d.event_id and parent.division_id = d.division_id
              and parent.draw_kind = case d.draw_kind when 'silver' then 'main' else 'silver' end
              and coalesce(d.scoring_rules->>'parent_draw_id', parent.id::text) = parent.id::text
       )
     for update of d for share of v;
    if not found then
        raise exception 'Choose a published Silver or Bronze plate in this event' using errcode = '42501';
    end if;
    if p_expected_draw is null or plate.updated_at is distinct from p_expected_draw then
        raise exception 'The draw changed. Reopen it before continuing';
    end if;
    select * into prior from public.draw_matches
     where id = p_match_id and draw_id = plate.id and stage = 'knockout' for update;
    if not found or p_expected_match is null or prior.updated_at is distinct from p_expected_match then
        raise exception 'The reviewed match changed or belongs to another draw';
    end if;

    -- The checked definer is the database operator expected by the existing invoker.
    perform public.native_record_draw_result(prior.id, prior.updated_at, p_result);
    select * into saved from public.draw_matches where id = prior.id and draw_id = plate.id;

    -- Silver opening-round losers are fixed once their Bronze bracket exists.
    if plate.draw_kind = 'silver' and prior.winner_entry_id is not null
        and prior.winner_entry_id is distinct from saved.winner_entry_id
        and prior.round_number = (select min(round_number) from public.draw_matches where draw_id = plate.id)
        and exists (
            select 1 from public.draws bronze where bronze.event_id = plate.event_id
              and bronze.division_id = plate.division_id and bronze.draw_kind = 'bronze'
              and coalesce(bronze.scoring_rules->>'parent_draw_id', plate.id::text) = plate.id::text
        ) then
        raise exception 'The Bronze plate uses this result. Correct the score with the original winner';
    end if;

    return jsonb_build_object('organisation_id', p_organisation_id, 'event_id', p_event_id,
        'draw_id', plate.id, 'match_id', saved.id, 'status', saved.status, 'winner_entry_id', saved.winner_entry_id,
        'updated_at', saved.updated_at);
end;
$$;

revoke all on function public.native_record_reviewed_plate_result(uuid,bigint,uuid,timestamptz,uuid,timestamptz,jsonb)
    from public, anon, authenticated, service_role;
grant execute on function public.native_record_reviewed_plate_result(uuid,bigint,uuid,timestamptz,uuid,timestamptz,jsonb)
    to authenticated;
