-- Target only groups that list the departing account as a recipient.
-- An unqualified UPDATE aborts the account deletion with safeupdate enabled.
create or replace function messaging.remove_account_content() returns trigger
language plpgsql security definer set search_path = '' set timezone = 'Africa/Johannesburg' as $$
begin
  update messaging.groups
  set recipients = array_remove(recipients, old.user_id)
  where old.user_id = any(recipients);

  update messaging.messages
  set body = '', card_event_id = null, reply_id = null, deleted_at = clock_timestamp()
  where sender_id = old.user_id;

  update messaging.conversations conv
  set pair_key = null, state = case when state = 'pending' then 'declined' else state end
  where conv.kind = 'direct' and exists (
    select 1 from messaging.members member
    where member.conversation_id = conv.id and member.user_id = old.user_id
  );
  return old;
end;
$$;

revoke all on function messaging.remove_account_content()
  from public, anon, authenticated, service_role;
