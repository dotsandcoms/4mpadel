-- Forward-only change: legacy clients may omit a level; v2 requires it.
-- Never backfill an invented level or replay the original profile migration.
alter table public.player_profile_details drop constraint player_profile_details_check;
alter table public.player_profile_details add constraint player_profile_details_proof_needs_level
  check (playtomic_proof_path is null or playtomic_level is not null);

create or replace function public.save_player_profile_details(p_player_id bigint, p_details jsonb) returns jsonb
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
  if v_path is not null and v_level is null then
    raise exception 'Enter your Playtomic level';
  end if;
  if v_path is not null and (
    not (v_path ~ ('^' || p_player_id::text || '/[a-f0-9-]+\.(jpg|jpeg|png|webp)$')
      or (v_path ~ ('^signup/' || auth.uid()::text || '/[a-f0-9-]+\.(jpg|jpeg|png|webp)$')
        and exists (select 1 from public.players p where p.id = p_player_id and lower(p.email) = lower(auth.email())))
      or exists (select 1 from public.player_profile_details d where d.player_id = p_player_id and d.playtomic_proof_path = v_path))
    or exists (select 1 from public.player_profile_details d where d.player_id <> p_player_id and d.playtomic_proof_path = v_path)
    or not exists (select 1 from storage.objects o where o.bucket_id = 'playtomic-proofs' and o.name = v_path)
  ) then
    raise exception 'Upload a screenshot of your Playtomic profile before saving';
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

-- Strict entrypoints for updated clients; shared legacy save still validates all
-- supplied values and proof ownership, but accepts older DOB-only requests.
create function public.save_player_profile_details_v2(p_player_id bigint, p_details jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_edit_player_profile_details(p_player_id) then
    raise exception 'Player profile access denied' using errcode = '42501';
  end if;
  if nullif(btrim(p_details->>'playtomic_level'), '') is null then
    raise exception 'Enter your Playtomic level';
  end if;
  return public.save_player_profile_details(p_player_id, p_details);
end;
$$;
revoke all on function public.save_player_profile_details_v2(bigint, jsonb) from public, anon;
grant execute on function public.save_player_profile_details_v2(bigint, jsonb) to authenticated;

create function public.create_player_profile_with_details_v2(p_profile jsonb, p_details jsonb) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  if nullif(btrim(p_details->>'playtomic_level'), '') is null then
    raise exception 'Enter your Playtomic level';
  end if;
  -- Both calls run in this transaction. Failed validation rolls back creation.
  v_id := public.create_player_profile_with_details(p_profile, (p_details->>'date_of_birth')::date);
  perform public.save_player_profile_details_v2(v_id, p_details);
  return v_id;
end;
$$;
revoke all on function public.create_player_profile_with_details_v2(jsonb, jsonb) from public, anon;
grant execute on function public.create_player_profile_with_details_v2(jsonb, jsonb) to authenticated;

-- A signed-in account can stage a screenshot before its player row exists.
-- After attachment, the player's existing owner/admin permission is authoritative.
create or replace function public.can_access_player_profile_proof(p_path text, p_delete boolean default false) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_allowed boolean := false;
begin
  if auth.uid() is null or not exists (select 1 from auth.users where id = auth.uid()) then return false; end if;
  if p_path ~ '^[0-9]{1,18}/[a-f0-9-]+\.(jpg|jpeg|png|webp)$' then
    v_allowed := public.can_edit_player_profile_details(split_part(p_path, '/', 1)::bigint);
  elsif p_path ~ '^signup/[a-f0-9-]{36}/[a-f0-9-]+\.(jpg|jpeg|png|webp)$' then
    if exists (select 1 from public.player_profile_details where playtomic_proof_path = p_path) then
      select exists (select 1 from public.player_profile_details d
        where d.playtomic_proof_path = p_path and public.can_edit_player_profile_details(d.player_id)) into v_allowed;
    else
      v_allowed := split_part(p_path, '/', 2) = auth.uid()::text;
    end if;
  end if;
  return v_allowed and (not p_delete or not exists (
    select 1 from public.player_profile_details where playtomic_proof_path = p_path));
end;
$$;
revoke all on function public.can_access_player_profile_proof(text, boolean) from public, anon;
grant execute on function public.can_access_player_profile_proof(text, boolean) to authenticated;

-- Worker-only usage counters: no direct or RPC access from either client role.
create table public.playtomic_extraction_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_day date not null,
  attempts integer not null check (attempts between 1 and 20),
  primary key (user_id, usage_day)
);
alter table public.playtomic_extraction_usage enable row level security;
revoke all on public.playtomic_extraction_usage from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.playtomic_extraction_usage to service_role;

create function public.consume_playtomic_extraction(p_user_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  insert into public.playtomic_extraction_usage as u (user_id, usage_day, attempts)
  values (p_user_id, (now() at time zone 'UTC')::date, 1)
  on conflict (user_id, usage_day) do update set attempts = u.attempts + 1
    where u.attempts < 20
  returning attempts into v_count;
  delete from public.playtomic_extraction_usage where usage_day < (now() at time zone 'UTC')::date - 7;
  return v_count is not null;
end;
$$;
revoke all on function public.consume_playtomic_extraction(uuid) from public, anon, authenticated;
grant execute on function public.consume_playtomic_extraction(uuid) to service_role;

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
    or (bucket_id = 'playtomic-proofs' and (split_part(name, '/', 1) = any(player_ids)
      or name like ('signup/' || p_user_id::text || '/%')
      or name in (select playtomic_proof_path from public.player_profile_details where player_id::text = any(player_ids))))), '[]'::jsonb);
end;
$$;
notify pgrst, 'reload schema';
