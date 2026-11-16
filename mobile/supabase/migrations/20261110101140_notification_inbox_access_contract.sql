-- Notification content is RPC-only. A legacy account-active policy did not
-- constrain rows to their recipient; client table access is not required.
alter table public.push_outbox enable row level security;
drop policy if exists account_must_exist on public.push_outbox;
revoke all on public.push_outbox from public,anon,authenticated,service_role;
grant select,insert,update,delete on public.push_outbox to service_role;
notify pgrst,'reload schema';
