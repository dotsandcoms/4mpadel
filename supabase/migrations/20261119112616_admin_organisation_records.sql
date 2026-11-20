begin;

-- Keep the catalogue insert and owner assignment, member changes and guarded
-- deletion in one transaction. Existing public registration remains unchanged.
create function private.admin_organisation_records(
  p_action text, p_organisation_id uuid, p_expected jsonb, p_data jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  organisation public.organisations;
  member public.organisation_members;
  v_player_id bigint;
  player_email text;
  name_input text;
  slug_input text;
  role_input text;
begin
  if private.permission_actor_active() is distinct from true or public.is_super_admin(auth.email()) is distinct from true then
    raise exception 'Current platform super-admin access is required.' using errcode = '42501';
  end if;
  if p_action = 'capability' then
    return jsonb_build_object('can_manage', true);
  end if;
  if p_organisation_id is null or p_action is null or p_action not in ('create','delete','add_member','change_role','remove_member') then
    raise exception 'Review a supported organisation action.';
  end if;
  -- Banking uses the same organisation lock. Check its ledger before any
  -- destructive cascade, and serialize membership changes in this workflow.
  perform pg_advisory_xact_lock(hashtextextended(p_organisation_id::text, 0));
  select o.* into organisation from public.organisations o where o.id = p_organisation_id for update;

  if p_action in ('create','add_member') then
    v_player_id := (p_data->>'player_id')::bigint;
    player_email := lower(trim(p_data->>'email'));
    if v_player_id is null or player_email is null or length(player_email) > 254
       or not exists (
        select 1 from public.players p join auth.users u on lower(trim(u.email)) = lower(trim(p.email))
        where p.id=v_player_id and lower(trim(p.email))=player_email
          and u.deleted_at is null and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
          and (u.banned_until is null or u.banned_until < now())
        for share of p,u
      ) then
      raise exception 'Choose an existing, verified player account.';
    end if;
  end if;

  if p_action = 'create' then
    name_input := trim(p_data->>'name');
    slug_input := trim(p_data->>'slug');
    if name_input is null or length(name_input) not between 2 and 150 or slug_input is null
       or length(slug_input) not between 2 and 120 or slug_input !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
      raise exception 'Enter an organisation name and a valid public page slug.';
    end if;
    if organisation.id is not null then
      if organisation.name = name_input and organisation.slug = slug_input
        and organisation.created_by = v_player_id and organisation.status = 'approved'
        and exists(select 1 from public.organisation_members m where m.organisation_id=p_organisation_id
          and m.player_id=v_player_id and lower(trim(m.user_email))=player_email and m.role='owner') then
        return jsonb_build_object('id',organisation.id,'action',p_action,'reused',true);
      end if;
      raise exception 'This creation request was already used. Refresh the register.';
    end if;
    insert into public.organisations(id,name,slug,contact_email,created_by,status,verified,approved_at)
      values(p_organisation_id,name_input,slug_input,player_email,v_player_id,'approved',true,now())
      returning * into organisation;
    insert into public.organisation_members(organisation_id,user_email,player_id,role)
      values(organisation.id,player_email,v_player_id,'owner');
    return jsonb_build_object('id',organisation.id,'action',p_action);
  end if;

  if organisation.id is null or organisation.name is distinct from (p_expected->>'name')
     or organisation.status is distinct from (p_expected->>'status') then
    raise exception 'The organisation changed after review. Refresh before continuing.';
  end if;
  if p_action = 'delete' then
    if trim(p_data->>'confirmation') is distinct from trim(organisation.name) then
      raise exception 'Enter the organisation name exactly to confirm deletion.';
    end if;
    if exists(select 1 from banking_private.accounts a where a.organisation_id=organisation.id)
      or exists(select 1 from banking_private.payout_requests r where r.organisation_id=organisation.id) then
      raise exception 'This organisation has banking or payout records and cannot be deleted.';
    end if;
    -- Existing foreign keys unlink albums and events and remove membership
    -- and club access relationships without browser-side partial writes.
    delete from public.organisations o where o.id=organisation.id;
    return jsonb_build_object('id',organisation.id,'action',p_action);
  end if;

  role_input := p_data->>'role';
  if p_action <> 'remove_member' and (role_input is null or role_input not in ('owner','admin','staff')) then
    raise exception 'Choose an owner, admin or staff role.';
  end if;
  if p_action = 'add_member' then
    if exists(select 1 from public.organisation_members m where m.organisation_id=organisation.id
        and lower(trim(m.user_email))=player_email) then
      raise exception 'This account already has an organisation membership.';
    end if;
    insert into public.organisation_members(organisation_id,user_email,player_id,role)
      values(organisation.id,player_email,v_player_id,role_input) returning * into member;
  else
    select m.* into member from public.organisation_members m
      where m.organisation_id=organisation.id and m.id=(p_expected->'member'->>'id')::uuid for update;
    if member.id is null or member.role is distinct from (p_expected->'member'->>'role')
       or member.user_email is distinct from (p_expected->'member'->>'user_email')
       or member.player_id is distinct from (p_expected->'member'->>'player_id')::bigint then
      raise exception 'The organisation member changed after review. Refresh before continuing.';
    end if;
    if member.role='owner' and (p_action='remove_member' or role_input <> 'owner') and not exists(
      select 1 from public.organisation_members m
      where m.organisation_id=organisation.id and m.role='owner' and m.id<>member.id
    ) then
      raise exception 'Assign another owner before removing the final owner.';
    end if;
    if p_action='remove_member' then
      delete from public.organisation_members m where m.id=member.id;
    else
      update public.organisation_members m set role=role_input where m.id=member.id returning * into member;
    end if;
  end if;
  return jsonb_build_object('id',organisation.id,'action',p_action,'member_id',member.id);
end;
$$;
revoke all on function private.admin_organisation_records(text,uuid,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.admin_organisation_records(text,uuid,jsonb,jsonb) to authenticated;

create function public.admin_organisation_records(
  p_action text, p_organisation_id uuid default null, p_expected jsonb default '{}'::jsonb, p_data jsonb default '{}'::jsonb
) returns jsonb language sql security invoker set search_path = '' as $$
  select private.admin_organisation_records(p_action,p_organisation_id,p_expected,p_data);
$$;
revoke all on function public.admin_organisation_records(text,uuid,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.admin_organisation_records(text,uuid,jsonb,jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
