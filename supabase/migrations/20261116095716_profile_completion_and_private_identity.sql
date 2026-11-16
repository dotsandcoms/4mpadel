-- Own private identity fields stay behind checked RPCs; no public column grants.
create or replace function private.own_profile_actor() returns uuid
language plpgsql stable security definer set search_path='' as $$
declare v_user uuid:=auth.uid();
begin
  if v_user is null or not exists(select 1 from auth.users u join auth.sessions s on s.user_id=u.id
    where u.id=v_user and s.id::text=auth.jwt()->>'session_id' and (s.not_after is null or s.not_after>now())
      and u.deleted_at is null and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
      and (u.banned_until is null or u.banned_until<=now()) and lower(trim(u.email))=lower(trim(auth.email()))) then
    raise exception 'Sign in again to update your profile.' using errcode='42501';
  end if;
  return v_user;
end $$;

create or replace function public.own_player_identity() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=private.own_profile_actor(); v_result jsonb;
begin
  select jsonb_build_object('idNumber',p.id_number) into strict v_result
    from public.players p join auth.users u on lower(trim(u.email))=lower(trim(p.email)) where u.id=v_actor;
  return v_result;
end $$;

create or replace function public.update_own_player_id_number(p_value text) returns void
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=private.own_profile_actor();
begin
  if char_length(coalesce(p_value,''))>50 then raise exception 'Use an ID or passport number of up to 50 characters.'; end if;
  update public.players p set id_number=nullif(trim(p_value),'') from auth.users u
    where u.id=v_actor and lower(trim(u.email))=lower(trim(p.email));
  if not found then raise exception 'Your player profile could not be updated.'; end if;
end $$;

-- Existing signup RPCs keep their contracts. Editing an existing profile may save
-- a date of birth before Playtomic details have been supplied.
create or replace function public.save_player_profile_details_v4(p_player_id bigint,p_details jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_none boolean:=coalesce(p_details->'playtomic_no_profile'='true'::jsonb,false);
begin
  perform private.own_profile_actor();
  if not exists(select 1 from public.players p where p.id=p_player_id and lower(trim(p.email))=lower(trim(auth.email()))) then
    raise exception 'Player profile access denied' using errcode='42501';
  end if;
  if v_none and (nullif(p_details->>'playtomic_level','') is not null or nullif(p_details->>'playtomic_proof_path','') is not null) then
    raise exception 'Remove Playtomic details when confirming no profile';
  end if;
  if not v_none and (nullif(p_details->>'playtomic_level','') is not null or nullif(p_details->>'playtomic_proof_path','') is not null)
    and (nullif(p_details->>'playtomic_level','') is null or nullif(p_details->>'playtomic_proof_path','') is null) then
    raise exception 'Add both your Playtomic level and screenshot, or leave both empty.';
  end if;
  perform public.save_player_profile_details(p_player_id,p_details);
  update public.player_profile_details set playtomic_no_profile=v_none,
    playtomic_no_profile_confirmed_at=case when v_none then coalesce(playtomic_no_profile_confirmed_at,now()) end
    where player_id=p_player_id;
  return public.get_player_profile_details(p_player_id);
end $$;

revoke all on function private.own_profile_actor(),public.own_player_identity(),public.update_own_player_id_number(text),public.save_player_profile_details_v4(bigint,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.own_player_identity(),public.update_own_player_id_number(text),public.save_player_profile_details_v4(bigint,jsonb) to authenticated;
