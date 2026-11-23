create index verified_payment_entry_transfers_registration_idx
  on private.verified_payment_entry_transfers(registration_id);

-- Account verification moves the current contact on the existing slot. The
-- receipt and its recorded checkout remain untouched.
create function private.sync_verified_transfer_contact() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if private.verified_email_change_context() then
    update private.verified_payment_entry_transfers t set email=lower(trim(new.email))
    where t.registration_id=old.id and t.event_id=old.event_id and t.email=lower(trim(old.email));
  end if;
  return new;
end $$;

create trigger sync_verified_transfer_contact after update on public.event_registrations
for each row when (lower(trim(old.email)) is distinct from lower(trim(new.email)))
execute function private.sync_verified_transfer_contact();

-- A replacement changes the registration and its transfer in the same
-- transaction. Check the final values so an independent profile write cannot
-- reassign a paid slot or leave its contact out of sync.
create function private.check_verified_transfer_contact() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists (
    select 1 from private.verified_payment_entry_transfers t
    left join public.event_registrations r on r.id=t.registration_id
    where t.registration_id=old.id
      and (t.event_id is distinct from r.event_id or t.email is distinct from lower(trim(r.email)))
  ) then
    raise exception 'Use Replace player or ask the player to verify their account email before changing this paid entry.'
      using errcode='23514';
  end if;
  return null;
end $$;

create constraint trigger verified_transfer_contact_is_current
after update on public.event_registrations deferrable initially deferred
for each row when (lower(trim(old.email)) is distinct from lower(trim(new.email)))
execute function private.check_verified_transfer_contact();

-- Account deletion anonymizes the registration before deleting the Auth user.
-- Match the exact anonymized slot once the Auth deletion has taken place.
create function private.anonymize_verified_transfer_contact() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  update private.verified_payment_entry_transfers t set email=lower(trim(r.email))
  from public.event_registrations r
  where t.registration_id=r.id and t.event_id=r.event_id
    and t.email=lower(trim(old.email))
    and lower(trim(r.email))='deleted-'||old.id::text||'@deleted.invalid';
  return old;
end $$;

create trigger anonymize_verified_transfer_contact after delete on auth.users
for each row execute function private.anonymize_verified_transfer_contact();

revoke all on function private.sync_verified_transfer_contact(),
  private.check_verified_transfer_contact(),private.anonymize_verified_transfer_contact()
  from public,anon,authenticated,service_role;
