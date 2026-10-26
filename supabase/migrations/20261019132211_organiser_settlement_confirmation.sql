alter table public.calendar add column if not exists organiser_settlement_confirmation jsonb;
comment on column public.calendar.organiser_settlement_confirmation is
  'Explicit super-admin settlement confirmation, separate from gateway receipts. Valid only for its recorded active-entry count and invoice total.';
alter table public.calendar add constraint calendar_settlement_confirmation_object
  check (organiser_settlement_confirmation is null or jsonb_typeof(organiser_settlement_confirmation) = 'object');

create or replace function private.guard_settlement_confirmation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.organiser_settlement_confirmation is null then return new; end if;
  elsif new.organiser_settlement_confirmation is not distinct from old.organiser_settlement_confirmation then
    return new;
  end if;
  if current_user in ('authenticated', 'anon')
     and (auth.uid() is null or not public.account_is_active() or not public.is_super_admin(auth.email())) then
    raise exception 'Only an active super admin can confirm an organiser settlement' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_settlement_confirmation() from public;
create trigger guard_settlement_confirmation before insert or update of organiser_settlement_confirmation
on public.calendar for each row execute function private.guard_settlement_confirmation();
