-- Additive, forward-only. Released v1/v2 clients retain their existing contracts.
alter table public.player_profile_details
  add column playtomic_no_profile boolean not null default false,
  add column playtomic_no_profile_confirmed_at timestamptz,
  add constraint player_profile_details_no_profile_check check (
    (not playtomic_no_profile and playtomic_no_profile_confirmed_at is null)
    or (playtomic_no_profile and playtomic_level is null and playtomic_proof_path is null
      and playtomic_no_profile_confirmed_at is not null));

-- Server-produced evidence, bound to an immutable private screenshot. No client
-- can write algorithm inputs. Unknown values remain null, including match count.
create table public.playtomic_profile_extractions (
  proof_path text primary key,
  storage_object_id uuid not null,
  player_id bigint references public.players(id) on delete cascade,
  signup_user_id uuid references auth.users(id) on delete cascade,
  extracted_level numeric(3,2) check (extracted_level between 0 and 7),
  matches integer check (matches >= 0),
  reliability_percent numeric(5,2) check (reliability_percent between 0 and 100),
  extracted_at timestamptz not null default now(),
  check ((player_id is not null) <> (signup_user_id is not null)),
  check (extracted_level is not null or matches is not null or reliability_percent is not null)
);
create index playtomic_profile_extractions_player_idx on public.playtomic_profile_extractions(player_id);
create index playtomic_profile_extractions_signup_idx on public.playtomic_profile_extractions(signup_user_id);
alter table public.playtomic_profile_extractions enable row level security;
-- Intentionally no client RLS policy: access is through the checked getter only.
revoke all on public.playtomic_profile_extractions from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.playtomic_profile_extractions to service_role;

create function public.get_playtomic_profile_proof_id(p_path text) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from storage.objects where bucket_id='playtomic-proofs' and name=p_path;
$$;
revoke all on function public.get_playtomic_profile_proof_id(text) from public,anon,authenticated;
grant execute on function public.get_playtomic_profile_proof_id(text) to service_role;

create function public.record_playtomic_profile_extraction(p_path text, p_level numeric, p_matches integer, p_reliability_percent numeric, p_object_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_player bigint; v_user uuid;
begin
  if p_path is null or not exists (select 1 from storage.objects where bucket_id='playtomic-proofs' and name=p_path and id=p_object_id) then
    raise exception 'Screenshot not found';
  end if;
  if (p_level is not null and (p_level not between 0 and 7 or p_level <> round(p_level,2)))
    or (p_matches is not null and p_matches < 0)
    or (p_reliability_percent is not null and (p_reliability_percent not between 0 and 100 or p_reliability_percent <> round(p_reliability_percent,2))) then
    raise exception 'Invalid screenshot details';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_path, 4857));
  select player_id into v_player from public.player_profile_details where playtomic_proof_path=p_path;
  if v_player is null then
    if p_path ~ '^[0-9]{1,18}/[a-f0-9-]+\.(jpg|jpeg|png|webp)$' then
      v_player := split_part(p_path,'/',1)::bigint;
    elsif p_path ~ '^signup/[a-f0-9-]{36}/[a-f0-9-]+\.(jpg|jpeg|png|webp)$' then
      v_user := split_part(p_path,'/',2)::uuid;
    else raise exception 'Invalid screenshot path'; end if;
  end if;
  insert into public.playtomic_profile_extractions as e
    (proof_path,storage_object_id,player_id,signup_user_id,extracted_level,matches,reliability_percent)
  values (p_path,p_object_id,v_player,v_user,p_level,p_matches,p_reliability_percent)
  on conflict (proof_path) do update set storage_object_id=excluded.storage_object_id, player_id=excluded.player_id, signup_user_id=excluded.signup_user_id,
    extracted_level=excluded.extracted_level,matches=excluded.matches,
    reliability_percent=excluded.reliability_percent,extracted_at=now();
end;
$$;
revoke all on function public.record_playtomic_profile_extraction(text,numeric,integer,numeric,uuid) from public,anon,authenticated;
grant execute on function public.record_playtomic_profile_extraction(text,numeric,integer,numeric,uuid) to service_role;

create function public.sync_playtomic_profile_evidence() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.playtomic_level is not null or new.playtomic_proof_path is not null then
    new.playtomic_no_profile := false;
    new.playtomic_no_profile_confirmed_at := null;
  end if;
  if new.playtomic_proof_path is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.playtomic_proof_path, 4857));
    update public.playtomic_profile_extractions set player_id=new.player_id,signup_user_id=null
      where proof_path=new.playtomic_proof_path;
  end if;
  return new;
end;
$$;
revoke all on function public.sync_playtomic_profile_evidence() from public,anon,authenticated;
create trigger sync_playtomic_profile_evidence before insert or update on public.player_profile_details
for each row execute function public.sync_playtomic_profile_evidence();

create or replace function public.get_player_profile_details(p_player_id bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_details jsonb;
begin
  if not public.can_edit_player_profile_details(p_player_id) then
    raise exception 'Player profile access denied' using errcode='42501';
  end if;
  select to_jsonb(d) || jsonb_build_object('playtomic_extracted_level',e.extracted_level,
    'playtomic_matches',e.matches,'playtomic_reliability_percent',e.reliability_percent,
    'playtomic_extracted_at',e.extracted_at) into v_details
  from public.player_profile_details d left join public.playtomic_profile_extractions e on e.proof_path=d.playtomic_proof_path
    and e.storage_object_id=(select id from storage.objects where bucket_id='playtomic-proofs' and name=d.playtomic_proof_path)
  where d.player_id=p_player_id;
  return v_details;
end;
$$;
revoke all on function public.get_player_profile_details(bigint) from public,anon;
grant execute on function public.get_player_profile_details(bigint) to authenticated;

-- Updated clients require both level and screenshot, or an explicit declaration
-- that the player has no Playtomic profile/level. Never turn this into level zero.
create function public.save_player_profile_details_v3(p_player_id bigint,p_details jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_none boolean := coalesce(p_details->'playtomic_no_profile'='true'::jsonb,false);
begin
  if not public.can_edit_player_profile_details(p_player_id) then
    raise exception 'Player profile access denied' using errcode='42501';
  end if;
  if v_none then
    if nullif(p_details->>'playtomic_level','') is not null or nullif(p_details->>'playtomic_proof_path','') is not null then
      raise exception 'Remove Playtomic details when confirming no profile';
    end if;
  else
    if nullif(btrim(p_details->>'playtomic_level'),'') is null then raise exception 'Enter your Playtomic level'; end if;
    if nullif(p_details->>'playtomic_proof_path','') is null then
      raise exception 'Upload a screenshot or confirm you do not have a Playtomic profile or level';
    end if;
  end if;
  perform public.save_player_profile_details(p_player_id,p_details);
  update public.player_profile_details set playtomic_no_profile=v_none,
    playtomic_no_profile_confirmed_at=case when v_none then coalesce(playtomic_no_profile_confirmed_at,now()) end
    where player_id=p_player_id;
  return public.get_player_profile_details(p_player_id);
end;
$$;
revoke all on function public.save_player_profile_details_v3(bigint,jsonb) from public,anon;
grant execute on function public.save_player_profile_details_v3(bigint,jsonb) to authenticated;

create function public.create_player_profile_with_details_v3(p_profile jsonb,p_details jsonb) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  v_id := public.create_player_profile_with_details(p_profile,(p_details->>'date_of_birth')::date);
  perform public.save_player_profile_details_v3(v_id,p_details);
  return v_id;
end;
$$;
revoke all on function public.create_player_profile_with_details_v3(jsonb,jsonb) from public,anon;
grant execute on function public.create_player_profile_with_details_v3(jsonb,jsonb) to authenticated;
notify pgrst,'reload schema';
