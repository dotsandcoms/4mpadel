begin;

create function private.admin_club_group_team_access(
  p_group_id uuid, p_player_id bigint, p_role text, p_expected jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  group_row public.club_groups;
  venue public.clubs;
  membership public.club_members;
  player public.players;
  email_input text;
  reviewed_venue jsonb;
  current_membership jsonb;
  expected_venues integer;
  visited integer := 0;
  changed uuid[] := '{}';
  preserved uuid[] := '{}';
begin
  if private.permission_actor_active() is distinct from true or public.is_super_admin(auth.email()) is distinct from true then
    raise exception 'Current platform super-admin access is required.' using errcode='42501';
  end if;
  if p_group_id is null then
    if p_player_id is null and p_role is null and p_expected is null then
      return jsonb_build_object('can_assign',true);
    end if;
    raise exception 'Choose a saved club group.';
  end if;
  if p_role is null or p_role not in ('owner','admin') or p_player_id is null
     or jsonb_typeof(p_expected->'venues') is distinct from 'array' then
    raise exception 'Review a player, group, venues and owner or admin role.';
  end if;
  expected_venues := jsonb_array_length(p_expected->'venues');
  if expected_venues < 1 then raise exception 'Link at least one venue before assigning group access.'; end if;
  select g.* into group_row from public.club_groups g where g.id=p_group_id for update;
  if group_row.id is null or group_row.name is distinct from (p_expected->>'group_name') then
    raise exception 'The reviewed group changed. Refresh before continuing.';
  end if;
  select p.* into player from public.players p where p.id=p_player_id for share;
  email_input := lower(trim(player.email));
  if player.id is null or player.name is distinct from (p_expected->>'player_name') or email_input is null
     or email_input is distinct from lower(trim(p_expected->>'player_email'))
     or not exists(select 1 from auth.users u where lower(trim(u.email))=email_input and u.deleted_at is null
       and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
       and (u.banned_until is null or u.banned_until<now()) for share) then
    raise exception 'Choose the reviewed player with a verified account.';
  end if;
  -- Lock the current venues in stable order. A changed link or membership
  -- invalidates the review and rolls back this entire group operation.
  for venue in select c.* from public.clubs c where c.group_id=p_group_id order by c.id for update loop
    visited := visited+1;
    select entry into reviewed_venue from jsonb_array_elements(p_expected->'venues') entry where entry->>'id'=venue.id::text;
    if reviewed_venue is null or venue.name is distinct from (reviewed_venue->>'name') then
      raise exception 'The linked venues changed. Refresh before continuing.';
    end if;
    if (select count(*) from public.club_members m where m.club_id=venue.id and lower(trim(m.user_email))=email_input)>1 then
      raise exception 'The player has conflicting memberships. Review the affected venue.';
    end if;
    select m.* into membership from public.club_members m where m.club_id=venue.id and lower(trim(m.user_email))=email_input for update;
    current_membership := case when membership.id is null then 'null'::jsonb else
      jsonb_build_object('id',membership.id,'player_id',membership.player_id,'user_email',membership.user_email,'role',membership.role) end;
    if current_membership is distinct from (reviewed_venue->'member')
      or (membership.player_id is not null and membership.player_id<>player.id) then
      raise exception 'A reviewed venue membership changed. Refresh before continuing.';
    end if;
    if membership.role='owner' or (membership.role=p_role and membership.player_id=player.id) then
      preserved:=array_append(preserved,venue.id);
    elsif membership.id is null then
      insert into public.club_members(club_id,player_id,user_email,role) values(venue.id,player.id,email_input,p_role);
      changed:=array_append(changed,venue.id);
    else
      update public.club_members m set role=p_role,player_id=player.id where m.id=membership.id;
      changed:=array_append(changed,venue.id);
    end if;
  end loop;
  if visited<>expected_venues then raise exception 'The linked venues changed. Refresh before continuing.'; end if;
  return jsonb_build_object('group_id',group_row.id,'player_id',player.id,'role',p_role,'changed',changed,'preserved',preserved);
end;
$$;
revoke all on function private.admin_club_group_team_access(uuid,bigint,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.admin_club_group_team_access(uuid,bigint,text,jsonb) to authenticated;

create function public.admin_club_group_team_access(
  p_group_id uuid default null, p_player_id bigint default null, p_role text default null, p_expected jsonb default null
) returns jsonb language sql security invoker set search_path = '' as $$
  select private.admin_club_group_team_access(p_group_id,p_player_id,p_role,p_expected);
$$;
revoke all on function public.admin_club_group_team_access(uuid,bigint,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.admin_club_group_team_access(uuid,bigint,text,jsonb) to authenticated;

notify pgrst,'reload schema';
commit;
