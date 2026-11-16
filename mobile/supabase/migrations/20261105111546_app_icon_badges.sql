-- Counts only; no message content, player identity or arbitrary recipient RPC.
create function messaging.unread_total(p_user uuid) returns bigint language sql stable security definer set search_path='' set timezone='Africa/Johannesburg' as $$
  select count(*) from messaging.messages message
    join messaging.members member on member.conversation_id=message.conversation_id and member.user_id=p_user
    join messaging.conversations conversation on conversation.id=message.conversation_id
  where member.active and not member.archived and message.seq>member.read_seq
    and message.sender_id is distinct from p_user and message.deleted_at is null
    and (conversation.state='accepted' or (conversation.state='pending' and conversation.requester is distinct from p_user))
    and messaging.visible(message.id,p_user)
$$;
create function messaging.own_unread_total() returns bigint language plpgsql security definer set search_path='' set timezone='Africa/Johannesburg' as $$
begin return messaging.unread_total(messaging.actor()); end $$;
create function messaging.unread_for_email(p_email text) returns bigint language sql stable security definer set search_path='' set timezone='Africa/Johannesburg' as $$
  select coalesce((select messaging.unread_total(a.user_id) from messaging.accounts a
    join auth.users u on u.id=a.user_id where lower(trim(u.email))=lower(trim(p_email))
    and u.deleted_at is null and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<now())),0)
$$;
create function public.own_app_badge_unread() returns bigint language sql security invoker set search_path='' as $$ select messaging.own_unread_total() $$;
create function public.app_badge_unread_for_email(p_email text) returns bigint language sql security invoker set search_path='' as $$ select messaging.unread_for_email(p_email) $$;
revoke all on function messaging.unread_total(uuid),messaging.own_unread_total(),messaging.unread_for_email(text) from public,anon,authenticated,service_role;
grant execute on function messaging.own_unread_total() to authenticated;
grant execute on function messaging.unread_for_email(text) to service_role;
revoke all on function public.own_app_badge_unread(),public.app_badge_unread_for_email(text) from public,anon,authenticated,service_role;
grant execute on function public.own_app_badge_unread() to authenticated;
grant execute on function public.app_badge_unread_for_email(text) to service_role;
notify pgrst,'reload schema';
