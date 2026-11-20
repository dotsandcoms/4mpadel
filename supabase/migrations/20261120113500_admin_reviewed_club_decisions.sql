begin;

create function public.admin_reviewed_club_decision(
    p_kind text, p_club_id uuid, p_decision text, p_expected_club jsonb,
    p_claim_id uuid default null, p_expected_claim jsonb default null, p_rejection_notes text default null
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
    club public.clubs;
    claim public.club_claim_requests;
    member public.club_members;
    club_snapshot jsonb;
    claim_snapshot jsonb;
    recipient text;
    reviewed_player_id bigint;
    recorded_email text;
    feedback text := nullif(btrim(p_rejection_notes), '');
    saved_at timestamptz := now();
    claim_action boolean := p_kind = 'claim';
    approval boolean := p_decision = 'approved';
    publish_club boolean;
    saved_status text;
    owner_saved boolean := false;
begin
    if auth.uid() is null or not coalesce(public.account_is_active(), false)
        or not coalesce(public.is_super_admin(auth.email()), false) then
        raise exception 'Verified platform Clubs access is required.' using errcode = '42501';
    end if;
    if p_kind is null or p_kind not in ('application','claim') or p_club_id is null
        or p_decision is null or p_decision not in ('approved','rejected')
        or jsonb_typeof(p_expected_club) is distinct from 'object'
        or (claim_action and (p_claim_id is null or jsonb_typeof(p_expected_claim) is distinct from 'object'))
        or (not claim_action and (p_claim_id is not null or p_expected_claim is not null))
        or (approval is distinct from (feedback is null)) or length(feedback) > 2000 then
        raise exception 'Review the exact club decision and any rejection feedback.';
    end if;

    select c.* into club from public.clubs c where c.id = p_club_id for update;
    if not found then raise exception 'The reviewed club is unavailable.'; end if;
    club_snapshot := jsonb_build_object('name', club.name, 'status', club.status);
    if not claim_action then
        club_snapshot := club_snapshot || jsonb_build_object(
            'contact_email', club.contact_email, 'contacts', club.contacts, 'created_by', club.created_by
        );
    end if;
    if p_expected_club - 'updated_at' is distinct from club_snapshot or not (p_expected_club ? 'updated_at')
        or (p_expected_club->>'updated_at')::timestamptz is distinct from club.updated_at then
        raise exception 'The reviewed club changed. Open a new review.' using errcode = '40001';
    end if;

    if claim_action then
        select r.* into claim from public.club_claim_requests r
            where r.id = p_claim_id and r.club_id = p_club_id for update;
        if not found or claim.status is distinct from 'pending' then
            raise exception 'The reviewed claim is no longer pending.' using errcode = '40001';
        end if;
        claim_snapshot := jsonb_build_object(
            'club_id', claim.club_id, 'requester_email', claim.requester_email,
            'requester_player_id', claim.requester_player_id, 'status', claim.status,
            'full_name', claim.full_name, 'contact_phone', claim.contact_phone,
            'primary_role', claim.primary_role, 'notes', claim.notes
        );
        if p_expected_claim - 'created_at' is distinct from claim_snapshot or not (p_expected_claim ? 'created_at')
            or (p_expected_claim->>'created_at')::timestamptz is distinct from claim.created_at then
            raise exception 'The reviewed claim changed. Open a new review.' using errcode = '40001';
        end if;
        recipient := claim.requester_email;
        reviewed_player_id := claim.requester_player_id;
    else
        if club.status is null or club.status not in ('pending','in_review') then
            raise exception 'The reviewed application is no longer pending.' using errcode = '40001';
        end if;
        recipient := nullif(club.contact_email, '');
        if recipient is null and jsonb_typeof(club.contacts) = 'array' then
            select contact->>'email' into recipient
                from jsonb_array_elements(club.contacts) with ordinality as item(contact, position)
                order by coalesce(contact->'is_primary' = 'true'::jsonb, false) desc, position
                limit 1;
        end if;
        reviewed_player_id := club.created_by;
    end if;

    recipient := nullif(lower(btrim(recipient)), '');
    if (claim_action and recipient is null) or length(recipient) > 254
        or recipient !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+[.][^[:space:]@<>]+$' then
        raise exception 'The reviewed record needs a valid applicant email.';
    end if;
    if approval and recipient is not null then
        if reviewed_player_id is not null then
            select lower(btrim(p.email)) into recorded_email from public.players p where p.id = reviewed_player_id for share;
            if recorded_email is distinct from recipient then
                raise exception 'The recorded player and email no longer match.';
            end if;
        end if;
        begin
            select m.* into strict member from public.club_members m
                where m.club_id = club.id and lower(btrim(m.user_email)) = recipient for update;
        exception
            when no_data_found then null;
            when too_many_rows then raise exception 'Multiple memberships use the recorded email. Review the existing members first.';
        end;
        if member.player_id is not null and reviewed_player_id is not null and member.player_id <> reviewed_player_id then
            raise exception 'The membership is linked to a different player. Review the existing member first.';
        end if;
    end if;

    publish_club := approval and (not claim_action or coalesce(club.status in ('unclaimed','draft','archived'), false));
    if claim_action then
        update public.club_claim_requests set status = p_decision, reviewed_at = saved_at, rejection_notes = feedback
            where id = claim.id and club_id = club.id returning status into saved_status;
        if saved_status is distinct from p_decision then raise exception 'The claim decision could not be saved.'; end if;
    end if;
    if publish_club then
        update public.clubs set status = 'published', verified = true, approved_at = saved_at, rejection_notes = null
            where id = club.id returning status into saved_status;
        if saved_status is distinct from 'published' then raise exception 'The club could not be published.'; end if;
    elsif not claim_action then
        update public.clubs set status = 'rejected', rejection_notes = feedback
            where id = club.id returning status into saved_status;
        if saved_status is distinct from 'rejected' then raise exception 'The application decision could not be saved.'; end if;
    end if;

    if approval and recipient is not null then
        if member.id is null then
            insert into public.club_members(club_id, player_id, user_email, role)
                values (club.id, reviewed_player_id, recipient, 'owner') returning * into member;
        elsif member.role is distinct from 'owner' or (reviewed_player_id is not null and member.player_id is distinct from reviewed_player_id) then
            update public.club_members m set role = 'owner', player_id = coalesce(reviewed_player_id, m.player_id)
                where m.id = member.id returning m.* into member;
        end if;
        if member.id is null or member.club_id is distinct from club.id or member.role is distinct from 'owner'
            or lower(btrim(member.user_email)) is distinct from recipient
            or (reviewed_player_id is not null and member.player_id is distinct from reviewed_player_id) then
            raise exception 'Owner access could not be assigned.';
        end if;
        owner_saved := true;
    end if;
    return jsonb_build_object('club_id', club.id, 'claim_id', p_claim_id,
        'status', case when not claim_action and approval then 'published' else p_decision end,
        'club_published', publish_club, 'owner_granted', owner_saved);
end;
$$;
revoke all on function public.admin_reviewed_club_decision(text,uuid,text,jsonb,uuid,jsonb,text) from public, anon, authenticated, service_role;
grant execute on function public.admin_reviewed_club_decision(text,uuid,text,jsonb,uuid,jsonb,text) to authenticated;
notify pgrst, 'reload schema';

commit;
