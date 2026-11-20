-- Catch possible duplicates at the database boundary, including profile
-- creation from installed app versions. Auth identity linking stays in Auth.
create function private.guard_apple_relay_player_duplicate() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(new.email));
  v_name text := lower(btrim(regexp_replace(coalesce(new.name, ''), '[[:space:]]+', ' ', 'g')));
begin
  if v_email is null or v_email not like '%@privaterelay.appleid.com' or auth.uid() is null then
    return new;
  end if;
  if exists (
    select 1 from auth.users u where u.id = auth.uid()
      and lower(btrim(u.email)) = v_email and u.banned_until > now()
  ) then
    raise exception 'Sign out and sign in again to continue.' using errcode = '42501';
  end if;
  if not exists (
      select 1 from auth.users u
      join auth.identities i on i.user_id = u.id and i.provider = 'apple'
      where u.id = auth.uid() and lower(btrim(u.email)) = v_email
        and u.email_confirmed_at is not null and u.deleted_at is null
    ) then
    return new;
  end if;

  -- Serialize first-time relay inserts for the same name. Existing-profile
  -- upserts still follow the normal permission checks and conflict handling.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_name, 645129));
  if v_name like '% %'
    and not exists (
      select 1 from public.players p where lower(btrim(p.email)) = v_email
    ) and exists (
      select 1 from public.players p
      where lower(btrim(p.email)) is distinct from v_email
        and lower(btrim(regexp_replace(p.name, '[[:space:]]+', ' ', 'g'))) = v_name
    ) then
    raise exception 'Use your existing 4M Padel sign-in or contact support for help setting up your profile.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_apple_relay_player_duplicate()
  from public, anon, authenticated, service_role;

create trigger guard_apple_relay_player_duplicate
before insert on public.players
for each row execute function private.guard_apple_relay_player_duplicate();
