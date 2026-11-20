-- A Calendar copy is a new hidden setup. Existing event records and related operational data keep their original identities.
create function public.admin_duplicate_calendar_event(
    p_source_id bigint,
    p_expected_fingerprint text default null,
    p_title text default null,
    p_start date default null,
    p_end date default null,
    p_request_id uuid default null
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
    source record;
    prior record;
    division_settings jsonb;
    fingerprint text;
    target_name text := nullif(btrim(p_title), '');
    target_slug text;
    target_id bigint;
    division_count integer;
    actor uuid := auth.uid();
begin
    if actor is null or not coalesce(public.account_is_active(), false)
        or not coalesce(public.is_super_admin(auth.email()), false) then
        raise exception 'An active platform administrator is required' using errcode = '42501';
    end if;

    if p_request_id is not null then
        if target_name is null or p_start is null or p_end < p_start or p_expected_fingerprint is null then
            raise exception 'Review the source and enter valid event details';
        end if;
        perform pg_advisory_xact_lock(hashtextextended('calendar-copy:' || actor::text || ':' || p_request_id::text, 0));
        -- A parent lock covers concurrently inserted divisions while the row locks protect existing ones.
        perform 1 from public.calendar where id = p_source_id and is_manual is true for update;
        if not found then raise exception 'Choose an existing 4M-hosted event'; end if;
        perform 1 from public.tournament_divisions where event_id = p_source_id order by id for share;
    elsif p_expected_fingerprint is not null or p_title is not null or p_start is not null or p_end is not null then
        raise exception 'A review request ID is required to save a copy';
    end if;

    select c.id, c.event_name, c.slug, c.start_date::date as start_date, c.end_date::date as end_date, c.organisation_id, c.club_id, c.is_quick_event,
        c.registration_access, c.venue, c.venues, c.city, c.address, c.start_time, c.end_time, c.courts_count,
        c.indoor_outdoor, c.courts, c.max_teams_capacity, c.max_players, c.partner_requirement, c.default_match_format,
        c.entry_fee, c.early_bird_fee, c.category_fees, c.weekly_payment_policy, c.license_required_default, c.allow_temporary_license,
        c.payment_method, c.description, c.rules_regs, c.contact_details, c.organiser_name, c.organiser_email,
        c.organiser_phone, c.organiser_website, c.scoring_point, c.golden_point, c.tournament_tag
    into source
    from public.calendar c where c.id = p_source_id and c.is_manual is true;
    if not found then raise exception 'Choose an existing 4M-hosted event'; end if;

    select coalesce(jsonb_agg(to_jsonb(d) order by d.sort_order, d.id), '[]'::jsonb)
    into division_settings
    from (select id, name, entry_fee, format, license_required, scoring_point, age_category, gender, suggested_level,
            entry_limit, details, sort_order, is_active from public.tournament_divisions where event_id = source.id) d;
    fingerprint := md5(jsonb_build_array(to_jsonb(source), division_settings)::text);

    if p_request_id is null then
        return jsonb_build_object('source_id', source.id, 'event_name', source.event_name, 'start_date', source.start_date,
            'end_date', source.end_date, 'organisation_id', source.organisation_id, 'club_id', source.club_id,
            'has_access_code', source.registration_access in ('code', 'protected', 'private'), 'is_quick_event', coalesce(source.is_quick_event, false),
            'division_count', jsonb_array_length(division_settings), 'fingerprint', fingerprint);
    end if;

    target_slug := 'event-copy-' || source.id::text || '-' || md5(source.id::text || ':' || actor::text || ':' || p_request_id::text);
    select c.id, c.event_name, c.start_date::date as start_date, c.end_date::date as end_date,
        c.organisation_id, c.club_id into prior
      from public.calendar c where c.slug = target_slug;
    if found then
        if prior.event_name is distinct from target_name or prior.start_date is distinct from p_start
           or prior.end_date is distinct from p_end or prior.organisation_id is distinct from source.organisation_id
           or prior.club_id is distinct from source.club_id then
            raise exception 'This copy request already has a calendar record. Review the calendar';
        end if;
        return jsonb_build_object('id', prior.id, 'event_name', prior.event_name, 'created', false,
            'division_count', (select count(*) from public.tournament_divisions where event_id = prior.id));
    end if;
    if fingerprint is distinct from p_expected_fingerprint then
        raise exception 'The source event or divisions changed. Reopen the review before copying';
    end if;

    insert into public.calendar (
        event_name, slug, start_date, end_date, event_dates, organisation_id, club_id, is_manual, is_quick_event,
        venue, venues, city, address, start_time, end_time, courts_count, indoor_outdoor, courts, max_teams_capacity,
        max_players, partner_requirement, default_match_format, entry_fee, early_bird_fee, category_fees, weekly_payment_policy,
        license_required_default, allow_temporary_license, payment_method, description, rules_regs, contact_details,
        organiser_name, organiser_email, organiser_phone, organiser_website, scoring_point, golden_point, tournament_tag,
        registration_access, registration_closes_at, allow_payments, allow_payments_after_close, finance_managed,
        is_visible, is_weekly, registered_players, sapa_status, federation_sanction_status, sanction_requested,
        featured_event, featured_live, featured_result, show_in_recent_results, is_spotlight
    ) values (
        target_name, target_slug, p_start, p_end, case when p_end is null or p_end = p_start then to_char(p_start, 'FMDD FMMonth YYYY')
          else to_char(p_start, 'FMDD FMMonth YYYY') || ' – ' || to_char(p_end, 'FMDD FMMonth YYYY') end,
        source.organisation_id, source.club_id, true, coalesce(source.is_quick_event, false),
        source.venue, source.venues, source.city, source.address, source.start_time, source.end_time, source.courts_count,
        source.indoor_outdoor, source.courts, source.max_teams_capacity, source.max_players, source.partner_requirement,
        source.default_match_format, source.entry_fee, source.early_bird_fee, source.category_fees, source.weekly_payment_policy,
        source.license_required_default, source.allow_temporary_license, source.payment_method, source.description, source.rules_regs,
        source.contact_details, source.organiser_name, source.organiser_email, source.organiser_phone, source.organiser_website,
        source.scoring_point, source.golden_point, source.tournament_tag,
        case when source.registration_access in ('code', 'protected', 'private') then 'code' else 'public' end,
        clock_timestamp(), false, false, false, false, false, 0, 'None', 'not_requested', false, false, false, false, false, false
    ) returning id into target_id;

    insert into public.tournament_divisions (
        event_id, name, entry_fee, format, license_required, scoring_point, age_category, gender,
        suggested_level, entry_limit, details, sort_order, is_active
    )
    select target_id, d.name, d.entry_fee, d.format, d.license_required, d.scoring_point, d.age_category, d.gender,
        d.suggested_level, d.entry_limit, d.details, d.sort_order, d.is_active
    from public.tournament_divisions d where d.event_id = source.id order by d.sort_order, d.id;
    get diagnostics division_count = row_count;
    return jsonb_build_object('id', target_id, 'event_name', target_name, 'created', true, 'division_count', division_count);
end;
$$;
revoke all on function public.admin_duplicate_calendar_event(bigint, text, text, date, date, uuid)
    from public, anon, authenticated, service_role;
grant execute on function public.admin_duplicate_calendar_event(bigint, text, text, date, date, uuid) to authenticated;
