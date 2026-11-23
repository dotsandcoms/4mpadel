begin;

create table private.club_lifecycle_audit (
    request_id uuid primary key,
    actor_id uuid not null,
    action text not null check (action in ('delete', 'merge')),
    source_id uuid not null,
    target_id uuid,
    reviewed_state jsonb not null,
    result jsonb not null,
    created_at timestamptz not null default now()
);
alter table private.club_lifecycle_audit enable row level security;
revoke all on private.club_lifecycle_audit from public, anon, authenticated, service_role;

create function private.club_lifecycle_snapshot(p_club uuid)
returns jsonb language sql stable set search_path = '' as $$
    select jsonb_build_object(
        'id', club.id, 'name', club.name, 'city', club.city,
        'status', club.status, 'updated_at', club.updated_at,
        'players', (select count(*) from public.players where club_id = club.id),
        'events', (select count(*) from public.calendar where club_id = club.id),
        'members', (select count(*) from public.club_members where club_id = club.id),
        'organisations', (select count(*) from public.club_organisations where club_id = club.id),
        'claims', (select count(*) from public.club_claim_requests where club_id = club.id),
        'invitations', (select count(*) from public.club_claim_invites where club_id = club.id),
        'favourites', (select count(*) from public.club_favourites where club_id = club.id),
        'places', (select count(*) from public.club_google_matches where club_id = club.id)
    )
    from public.clubs club where club.id = p_club;
$$;
revoke all on function private.club_lifecycle_snapshot(uuid) from public, anon, authenticated, service_role;

create function private.manage_reviewed_club(
    p_action text, p_source uuid, p_target uuid, p_expected jsonb, p_request_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_actor uuid := auth.uid();
    v_source jsonb;
    v_target jsonb;
    v_state jsonb;
    v_result jsonb;
    v_prior private.club_lifecycle_audit;
    v_events bigint;
    v_favourites bigint;
begin
    if v_actor is null or not coalesce(public.account_is_active(), false)
        or not coalesce(public.is_super_admin(auth.email()), false) then
        raise exception 'Verified platform Clubs access is required.' using errcode = '42501';
    end if;
    if p_action is null or p_action not in ('review-delete','review-merge','delete','merge') or p_source is null
        or ((p_action in ('review-merge','merge')) is distinct from (p_target is not null))
        or p_source = p_target then
        raise exception 'Select the source club and a different destination when merging.';
    end if;

    if p_action in ('delete','merge') then
        if p_request_id is null or p_expected is null then raise exception 'Review the club action before confirming.'; end if;
        perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
        select * into v_prior from private.club_lifecycle_audit where request_id = p_request_id;
        if found then
            if v_prior.actor_id <> v_actor or v_prior.action <> p_action or v_prior.source_id <> p_source
                or v_prior.target_id is distinct from p_target or v_prior.reviewed_state is distinct from p_expected then
                raise exception 'This request belongs to another club action.' using errcode = '42501';
            end if;
            return v_prior.result;
        end if;
        perform 1 from public.clubs where id in (p_source, p_target) order by id for update;
    end if;

    v_source := private.club_lifecycle_snapshot(p_source);
    if p_target is not null then v_target := private.club_lifecycle_snapshot(p_target); end if;
    if v_source is null or (p_target is not null and v_target is null) then
        raise exception 'A club in this review is no longer available.';
    end if;
    v_state := jsonb_build_object('source', v_source, 'target', v_target);
    if p_action in ('review-delete','review-merge') then return v_state; end if;
    if v_state is distinct from p_expected then
        raise exception 'The club or its linked records changed. Open a new review.' using errcode = '40001';
    end if;

    if p_action = 'delete' then
        if (v_source->>'players')::bigint <> 0 then
            raise exception 'This club has linked players. Merge it into the correct club first.';
        end if;
        delete from public.clubs where id = p_source;
        v_result := jsonb_build_object('action', 'deleted', 'source_id', p_source, 'source_name', v_source->>'name');
    else
        -- Preserve event ownership and private app favourites. The current
        -- merge routine handles players, member roles, claims and profile data.
        update public.calendar set club_id = p_target where club_id = p_source;
        get diagnostics v_events = row_count;
        insert into public.club_favourites (user_id, club_id, created_at)
        select user_id, p_target, created_at from public.club_favourites where club_id = p_source
        on conflict (user_id, club_id) do nothing;
        get diagnostics v_favourites = row_count;
        v_result := public.merge_clubs(p_source, p_target) || jsonb_build_object(
            'action', 'merged', 'source_id', p_source, 'target_id', p_target,
            'events_moved', v_events, 'favourites_moved', v_favourites
        );
    end if;
    if exists (select 1 from public.clubs where id = p_source) then
        raise exception 'The source club could not be removed.';
    end if;
    insert into private.club_lifecycle_audit(request_id, actor_id, action, source_id, target_id, reviewed_state, result)
    values (p_request_id, v_actor, p_action, p_source, p_target, v_state, v_result);
    return v_result;
end;
$$;
revoke all on function private.manage_reviewed_club(text,uuid,uuid,jsonb,uuid) from public, anon, authenticated, service_role;
grant execute on function private.manage_reviewed_club(text,uuid,uuid,jsonb,uuid) to authenticated;

create function public.manage_reviewed_club(
    p_action text, p_source uuid, p_target uuid default null,
    p_expected jsonb default null, p_request_id uuid default null
)
returns jsonb language sql security invoker set search_path = '' as $$
    select private.manage_reviewed_club(p_action, p_source, p_target, p_expected, p_request_id);
$$;
revoke all on function public.manage_reviewed_club(text,uuid,uuid,jsonb,uuid) from public, anon, authenticated, service_role;
grant execute on function public.manage_reviewed_club(text,uuid,uuid,jsonb,uuid) to authenticated;

commit;
