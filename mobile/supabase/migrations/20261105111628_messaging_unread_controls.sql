-- An unread reminder is separate from the actual viewing watermark.
alter table messaging.members add column marked_unread_from bigint;
create function messaging.clear_unread_reminder() returns trigger language plpgsql security definer set search_path='' as $$
begin new.marked_unread_from:=null; return new; end $$;
create trigger messaging_clear_unread_reminder before update of read_seq on messaging.members for each row execute function messaging.clear_unread_reminder();
create function messaging.mark_unread(p_conversation uuid,p_message uuid default null) returns jsonb language plpgsql security definer set search_path='' set timezone='Africa/Johannesburg' as $$
declare uid uuid:=messaging.actor(); marker bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(uid::text,7022));
  perform pg_advisory_xact_lock(hashtextextended(p_conversation::text,7024));
  if not messaging.can_read(p_conversation,uid) then raise exception 'This conversation is unavailable.' using errcode='42501'; end if;
  if p_message is not null then
    select seq into marker from messaging.messages where id=p_message and conversation_id=p_conversation and messaging.visible(id,uid);
    if marker is null then raise exception 'This conversation is unavailable.' using errcode='42501'; end if;
  else
    select coalesce(max(seq) filter(where sender_id is distinct from uid),max(seq),0) into marker
      from messaging.messages where conversation_id=p_conversation and messaging.visible(id,uid);
  end if;
  update messaging.members set marked_unread_from=marker where conversation_id=p_conversation and user_id=uid and active;
  perform messaging.signal(uid);
  return '{}';
end $$;
create function public.messaging_mark_unread(p_conversation uuid,p_message uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select messaging.mark_unread(p_conversation,p_message) $$;
revoke all on function messaging.mark_unread(uuid,uuid),messaging.clear_unread_reminder() from public,anon,authenticated,service_role;
grant execute on function messaging.mark_unread(uuid,uuid) to authenticated;
revoke all on function public.messaging_mark_unread(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.messaging_mark_unread(uuid,uuid) to authenticated;

create or replace function messaging.conversation_json(p_conversation uuid,p_user uuid) returns jsonb language plpgsql stable security definer set search_path='' set timezone='Africa/Johannesburg' as $$
declare c messaging.conversations; member messaging.members; title text; photo text; last_message jsonb; unread int; can_send boolean; reason text; event_name text; is_manager boolean; peer uuid;
begin
  if not messaging.can_read(p_conversation,p_user) then return null; end if;
  select * into c from messaging.conversations where id=p_conversation;
  select * into member from messaging.members where conversation_id=c.id and user_id=p_user;
  is_manager:=c.event_id is not null and p_user=auth.uid() and messaging.manager(c.event_id) and auth.jwt()->>'aal'='aal2';
  if c.kind='direct' then
    select a.user_id,p.name,p.image_url into peer,title,photo from messaging.members mm join messaging.accounts a on a.user_id=mm.user_id
      join public.players p on p.id=a.player_id where mm.conversation_id=c.id and mm.user_id<>p_user;
    can_send:=c.state='accepted' and messaging.interactive(peer);
    reason:=case when c.state='pending' then 'Accept the request to start chatting.' when not messaging.interactive(peer) then 'This conversation is currently unavailable.' end;
  else
    select e.event_name into event_name from public.calendar e where e.id=c.event_id;
    title:=event_name;
    can_send:=(c.kind='event_discussion' and not c.paused and messaging.interactive(p_user)) or is_manager;
    if c.kind='event_announcements' and not is_manager then reason:='Only event organisers can post announcements.'; end if;
    if c.paused then reason:='The organiser has paused this discussion.'; end if;
    if exists(select 1 from public.calendar e where e.id=c.event_id and (e.event_status='cancelled'
      or current_date>coalesce(e.end_date,e.start_date)::date+7)) then can_send:=false;reason:='This event conversation is read-only.'; end if;
  end if;
  select messaging.message_json(id,p_user) into last_message from messaging.messages where conversation_id=c.id
    and messaging.visible(id,p_user) order by seq desc limit 1;
  select count(*) into unread from messaging.messages where conversation_id=c.id and (seq>coalesce(member.read_seq,0) or (member.marked_unread_from is not null and seq>=member.marked_unread_from))
    and sender_id is distinct from p_user and messaging.visible(id,p_user);
  return jsonb_build_object('id',c.id,'kind',c.kind,'eventId',c.event_id,'title',coalesce(title,'Player'),
    'image',photo,'state',c.state,'incoming',c.requester is distinct from p_user,'muted',coalesce(member.muted,false),
    'archived',coalesce(member.archived,false),'unread',greatest(unread,case when member.marked_unread_from is not null then 1 else 0 end),'preview',coalesce(nullif(last_message->>'body',''),last_message->'card'->>'title',''),
    'updatedAt',coalesce((last_message->>'createdAt')::timestamptz,c.created_at),'canSend',can_send and (select sending_enabled from messaging.configuration),
    'reason',reason,'manager',is_manager,'paused',c.paused,
    'pinned',case when messaging.visible(c.pinned_id,p_user) then messaging.message_json(c.pinned_id,p_user) end);
end $$;
create or replace function messaging.unread_total(p_user uuid) returns bigint language sql stable security definer set search_path='' set timezone='Africa/Johannesburg' as $$
  select coalesce(sum(greatest(incoming.count,case when member.marked_unread_from is not null then 1 else 0 end)),0)::bigint
    from messaging.members member join messaging.conversations conversation on conversation.id=member.conversation_id
    cross join lateral (select count(*) from messaging.messages message where message.conversation_id=conversation.id
      and (message.seq>member.read_seq or (member.marked_unread_from is not null and message.seq>=member.marked_unread_from))
      and message.sender_id is distinct from p_user and message.deleted_at is null and messaging.visible(message.id,p_user)) incoming
    where member.user_id=p_user and member.active and not member.archived and messaging.can_read(conversation.id,p_user)
      and (conversation.state='accepted' or (conversation.state='pending' and conversation.requester is distinct from p_user))
$$;
revoke all on function messaging.unread_total(uuid),messaging.conversation_json(uuid,uuid) from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
