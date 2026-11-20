-- Weekly visibility changes are applied as one verified, same-host Calendar update.
create function public.admin_calendar_weekly_series_visibility(
    p_event_id bigint, p_expected jsonb default null, p_visible boolean default null
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
    source record;
    occurrences jsonb;
    changed integer;
begin
    if auth.uid() is null or not coalesce(public.account_is_active(), false)
        or not coalesce(public.is_super_admin(auth.email()), false) then
        raise exception 'An active platform administrator is required' using errcode = '42501';
    end if;
    select id, series_id, organisation_id, club_id, organiser_email, organiser_name, is_weekly, is_manual into source
    from public.calendar where id = p_event_id;
    if not found or source.is_weekly is distinct from true or source.is_manual is distinct from true or source.series_id is null then
        raise exception 'Choose a saved weekly 4M event with a linked series';
    end if;

    if source.organisation_id is null and source.club_id is null
        and coalesce(nullif(lower(btrim(source.organiser_email)), ''), lower(btrim(source.organiser_name)), '') = '' then
        raise exception 'The organiser for this weekly series could not be verified';
    end if;

    if p_visible is not null then
        perform pg_advisory_xact_lock(hashtextextended('calendar-weekly-series:' || source.series_id::text, 0));
        perform 1 from public.calendar where series_id = source.series_id and is_weekly is true order by id for update;
    elsif p_expected is not null then
        raise exception 'Choose a visibility change before saving';
    end if;

    if not exists (select 1 from public.calendar where id = p_event_id and series_id = source.series_id and is_weekly is true)
        or exists (
            select 1 from public.calendar c where c.series_id = source.series_id and c.is_weekly is true
             and (c.is_manual is distinct from true
                  or c.organisation_id is distinct from source.organisation_id or c.club_id is distinct from source.club_id
                  or (source.organisation_id is null and source.club_id is null
                      and coalesce(nullif(lower(btrim(c.organiser_email)), ''), lower(btrim(c.organiser_name)), '')
                          is distinct from coalesce(nullif(lower(btrim(source.organiser_email)), ''), lower(btrim(source.organiser_name)), '')))
        ) then
        raise exception 'The linked series membership or host changed. Review it before saving';
    end if;

    select jsonb_agg(jsonb_build_object(
        'id', c.id, 'event_name', c.event_name, 'start_date', c.start_date,
        'registration_closes_at', c.registration_closes_at, 'is_visible', c.is_visible,
        'event_status', c.event_status, 'updated_at', to_jsonb(c)->'updated_at',
        'organisation_id', c.organisation_id, 'club_id', c.club_id,
        'unlinked_organiser', case when c.organisation_id is null and c.club_id is null
            then coalesce(nullif(lower(btrim(c.organiser_email)), ''), lower(btrim(c.organiser_name)), '') end
    ) order by c.start_date, c.id) into occurrences
    from public.calendar c where c.series_id = source.series_id and c.is_weekly is true;
    if p_visible is null then
        return jsonb_build_object('series_id', source.series_id, 'source_id', p_event_id, 'occurrences', occurrences);
    end if;
    if jsonb_typeof(p_expected) is distinct from 'array' or p_expected is distinct from occurrences then
        raise exception 'The weekly series changed after review. Close and reopen it';
    end if;

    update public.calendar c set is_visible = p_visible
    where c.series_id = source.series_id and c.is_weekly is true and c.is_manual is true
       and c.organisation_id is not distinct from source.organisation_id and c.club_id is not distinct from source.club_id
       and c.id in (select (row->>'id')::bigint from jsonb_array_elements(occurrences) row);
    get diagnostics changed = row_count;
    if changed <> jsonb_array_length(occurrences) then raise exception 'Could not verify every reviewed weekly occurrence'; end if;
    return jsonb_build_object('series_id', source.series_id, 'source_id', p_event_id,
        'updated_count', changed, 'is_visible', p_visible);
end;
$$;
revoke all on function public.admin_calendar_weekly_series_visibility(bigint, jsonb, boolean)
    from public, anon, authenticated, service_role;
grant execute on function public.admin_calendar_weekly_series_visibility(bigint, jsonb, boolean) to authenticated;
