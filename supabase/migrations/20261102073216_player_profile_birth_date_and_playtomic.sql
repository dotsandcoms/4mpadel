-- RPC-only personal details: birth dates and proof are never public player data.
create table public.player_profile_details (
  player_id bigint primary key references public.players(id) on delete cascade,
  date_of_birth date not null check (date_of_birth >= date '1900-01-01'),
  playtomic_level numeric(3,2) check (playtomic_level between 0 and 7),
  playtomic_proof_path text,
  playtomic_submitted_at timestamptz,
  updated_at timestamptz not null default now(),
  check ((playtomic_level is null) = (playtomic_proof_path is null))
);
alter table public.player_profile_details enable row level security;
revoke all on public.player_profile_details from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.player_profile_details to service_role;

create function public.can_edit_player_profile_details(p_player_id bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and exists (select 1 from auth.users where id = auth.uid())
    and exists (select 1 from public.players p where p.id = p_player_id and (
      lower(p.email) = lower(auth.email())
      or public.is_super_admin(auth.email())
      or exists (select 1 from public.admin_sidebar_permissions a
        where lower(a.email) = lower(auth.email())
        and (a.role = 'super_admin' or 'players' = any(a.allowed_tabs)))
    ));
$$;
revoke all on function public.can_edit_player_profile_details(bigint) from public, anon;
grant execute on function public.can_edit_player_profile_details(bigint) to authenticated;

create function public.get_player_profile_details(p_player_id bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_edit_player_profile_details(p_player_id) then
    raise exception 'Player profile access denied' using errcode = '42501';
  end if;
  return (select to_jsonb(d) from public.player_profile_details d where player_id = p_player_id);
end;
$$;
revoke all on function public.get_player_profile_details(bigint) from public, anon;
grant execute on function public.get_player_profile_details(bigint) to authenticated;

create function public.save_player_profile_details(p_player_id bigint, p_details jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_birth date := nullif(p_details->>'date_of_birth', '')::date;
  v_level numeric := nullif(p_details->>'playtomic_level', '')::numeric;
  v_path text := nullif(p_details->>'playtomic_proof_path', '');
  v_today date := (now() at time zone 'Africa/Johannesburg')::date;
begin
  if not public.can_edit_player_profile_details(p_player_id) then
    raise exception 'Player profile access denied' using errcode = '42501';
  end if;
  if v_birth is null or v_birth < date '1900-01-01' or v_birth > v_today then
    raise exception 'Enter a valid date of birth';
  end if;
  if v_level is not null and (v_level not between 0 and 7 or v_level <> round(v_level, 2)) then
    raise exception 'Enter a Playtomic level from 0 to 7, with up to two decimal places';
  end if;
  if (v_level is null) <> (v_path is null) then
    raise exception 'Add a screenshot or photo showing your Playtomic level';
  end if;
  if v_path is not null and (
    v_path !~ ('^' || p_player_id::text || '/[a-f0-9-]+\.(jpg|jpeg|png|webp)$')
    or not exists (select 1 from storage.objects o where o.bucket_id = 'playtomic-proofs' and o.name = v_path)
  ) then
    raise exception 'Upload your Playtomic proof before saving';
  end if;
  insert into public.player_profile_details as d
    (player_id, date_of_birth, playtomic_level, playtomic_proof_path, playtomic_submitted_at)
  values (p_player_id, v_birth, v_level, v_path, case when v_level is not null then now() end)
  on conflict (player_id) do update set
    date_of_birth = excluded.date_of_birth,
    playtomic_level = excluded.playtomic_level,
    playtomic_proof_path = excluded.playtomic_proof_path,
    playtomic_submitted_at = case
      when excluded.playtomic_level is null then null
      when (d.playtomic_level, d.playtomic_proof_path) is distinct from (excluded.playtomic_level, excluded.playtomic_proof_path) then now()
      else d.playtomic_submitted_at end,
    updated_at = now();
  -- Existing public cards show age without exposing the birth date.
  update public.players set age = extract(year from age(v_today, v_birth))::integer where id = p_player_id;
  return public.get_player_profile_details(p_player_id);
end;
$$;
revoke all on function public.save_player_profile_details(bigint, jsonb) from public, anon;
grant execute on function public.save_player_profile_details(bigint, jsonb) to authenticated;

-- Signup and the required birth date commit together. Older endpoints remain
-- compatible with released clients and organisation setup.
create function public.create_player_profile_with_details(p_profile jsonb, p_date_of_birth date) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_id bigint; v_email text := lower(auth.email());
begin
  if auth.uid() is null or not exists (select 1 from auth.users where id = auth.uid()) then
    raise exception 'Sign in to complete your player profile' using errcode = '42501';
  end if;
  if p_date_of_birth is null or p_date_of_birth < date '1900-01-01'
    or p_date_of_birth > (now() at time zone 'Africa/Johannesburg')::date then
    raise exception 'Enter a valid date of birth';
  end if;
  if v_email is null or lower(p_profile->>'p_email') is distinct from v_email then
    raise exception 'You can only create your own profile' using errcode = '42501';
  end if;
  if nullif(trim(p_profile->>'p_name'), '') is null then raise exception 'Enter your full name'; end if;
  perform public.create_player_profile(
    p_email := v_email, p_name := trim(p_profile->>'p_name'), p_contact := p_profile->>'p_contact',
    p_category := coalesce(nullif(p_profile->>'p_category', ''), 'Unranked'),
    p_gender := p_profile->>'p_gender', p_nationality := p_profile->>'p_nationality',
    p_id_number := p_profile->>'p_id_number', p_bio := p_profile->>'p_bio',
    p_home_club := p_profile->>'p_home_club', p_sponsors := p_profile->>'p_sponsors',
    p_region := p_profile->>'p_region', p_instagram_link := p_profile->>'p_instagram_link',
    p_paid_registration := false, p_license_type := 'none',
    p_image_url := p_profile->>'p_image_url', p_racket_brand := p_profile->>'p_racket_brand',
    p_club_id := nullif(p_profile->>'p_club_id', '')::uuid
  );
  select id into strict v_id from public.players where lower(email) = v_email;
  perform public.save_player_profile_details(v_id,
    coalesce(public.get_player_profile_details(v_id), '{}'::jsonb)
    || jsonb_build_object('date_of_birth', p_date_of_birth));
  return v_id;
end;
$$;
revoke all on function public.create_player_profile_with_details(jsonb, date) from public, anon;
grant execute on function public.create_player_profile_with_details(jsonb, date) to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('playtomic-proofs', 'playtomic-proofs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create function public.can_access_player_profile_proof(p_path text, p_delete boolean default false) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_player bigint;
begin
  if p_path !~ '^[0-9]{1,18}/[a-f0-9-]+\.(jpg|jpeg|png|webp)$' then return false; end if;
  v_player := split_part(p_path, '/', 1)::bigint;
  return public.can_edit_player_profile_details(v_player) and (
    not p_delete or not exists (select 1 from public.player_profile_details where playtomic_proof_path = p_path)
  );
end;
$$;
revoke all on function public.can_access_player_profile_proof(text, boolean) from public, anon;
grant execute on function public.can_access_player_profile_proof(text, boolean) to authenticated;

create policy "Player proof read" on storage.objects for select to authenticated
using (bucket_id = 'playtomic-proofs' and public.can_access_player_profile_proof(name));
create policy "Player proof upload" on storage.objects for insert to authenticated
with check (bucket_id = 'playtomic-proofs' and public.can_access_player_profile_proof(name));
-- Saved proof is immutable. Replace it, then discard the old unreferenced object.
create policy "Unused player proof removal" on storage.objects for delete to authenticated
using (bucket_id = 'playtomic-proofs' and public.can_access_player_profile_proof(name, true));
-- Keep the new bucket isolated even if another storage policy grants broad access.
create policy "Private player proof boundary" on storage.objects as restrictive for all to authenticated
using (bucket_id <> 'playtomic-proofs' or public.can_access_player_profile_proof(name))
with check (bucket_id <> 'playtomic-proofs' or public.can_access_player_profile_proof(name));
create policy "Saved player proof retention" on storage.objects as restrictive for delete to authenticated
using (bucket_id <> 'playtomic-proofs' or public.can_access_player_profile_proof(name, true));
create policy "Immutable player proof" on storage.objects as restrictive for update to authenticated
using (bucket_id <> 'playtomic-proofs') with check (bucket_id <> 'playtomic-proofs');

-- The existing deletion worker removes these objects before deleting the player;
-- the details row then cascades. Admin uploads belong to the beneficiary folder.
create or replace function public.account_deletion_storage(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare account_email text; player_ids text[];
begin
  select lower(email) into account_email from auth.users where id = p_user_id;
  if account_email is null then raise exception 'Account not found'; end if;
  select coalesce(array_agg(id::text), '{}') into player_ids from public.players where lower(email) = account_email;
  return coalesce((select jsonb_agg(jsonb_build_object('bucket', bucket_id, 'name', name)) from storage.objects
    where (bucket_id in ('profile-pics', 'coach-profiles', 'coach-pics', 'coach-profile-pics')
      and (owner = p_user_id or owner_id = p_user_id::text or split_part(name, '/', 1) = any(player_ids)))
    or (bucket_id = 'playtomic-proofs' and split_part(name, '/', 1) = any(player_ids))), '[]'::jsonb);
end;
$$;
revoke all on function public.account_deletion_storage(uuid) from public, anon, authenticated;
grant execute on function public.account_deletion_storage(uuid) to service_role;
notify pgrst, 'reload schema';
