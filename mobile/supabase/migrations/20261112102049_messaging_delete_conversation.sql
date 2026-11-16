-- Deletion is personal: retain the other participants' history and moderation evidence.
-- A later visible message brings the conversation back, without restoring cleared history.
alter table messaging.members add column deleted_through_seq bigint;
comment on column messaging.members.deleted_through_seq is 'Personal history boundary; NULL means this member has never deleted the conversation.';

create or replace function messaging.visible(p_message uuid,p_user uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare m messaging.messages; g messaging.groups; state text; joined timestamptz;
begin
  select * into m from messaging.messages where id=p_message;
  if m.id is null or exists(select 1 from messaging.members mm where mm.conversation_id=m.conversation_id and mm.user_id=p_user and m.seq<=mm.deleted_through_seq) then return false; end if;
  select * into g from messaging.groups where conversation_id=m.conversation_id;
  if g.conversation_id is null then return messaging.visible_before_groups(p_message,p_user); end if;
  if m.expires_at<=now() or not messaging.group_access(g.conversation_id,p_user) then return false; end if;
  select gm.status,mm.eligible_from into state,joined from messaging.group_members gm join messaging.members mm using(conversation_id,user_id) where gm.conversation_id=g.conversation_id and gm.user_id=p_user;
  return (m.id=g.invitation_id or (state='accepted' and m.created_at>=joined)) and (m.sender_id is null or not messaging.blocked(p_user,m.sender_id));
end $$;

-- Patch only the list predicate, preserving the current request/send/admin implementations.
do $migration$
declare definition text; old_predicate text:='where member.user_id=uid and messaging.can_read(conv.id,uid) order by conv.updated_at desc,conv.id limit 200';
begin
  definition:=pg_get_functiondef('messaging.api_before_groups(text,jsonb)'::regprocedure);
  if (length(definition)-length(replace(definition,old_predicate,'')))/length(old_predicate)<>1 then
    raise exception 'Expected exactly one messaging inbox predicate';
  end if;
  execute replace(definition,old_predicate,'where member.user_id=uid and messaging.can_read(conv.id,uid)
    and (member.deleted_through_seq is null or exists(select 1 from messaging.messages fresh
      where fresh.conversation_id=conv.id and fresh.seq>member.deleted_through_seq and messaging.visible(fresh.id,uid)))
    order by conv.updated_at desc,conv.id limit 200');
end $migration$;

-- An old menu on another device must not recreate an unread badge for cleared history.
do $migration$
declare definition text; anchor text:='  if p_message is not null then';
begin
  definition:=pg_get_functiondef('messaging.mark_unread(uuid,uuid)'::regprocedure);
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then raise exception 'Expected exactly one unread marker guard'; end if;
  execute replace(definition,anchor,'  if exists(select 1 from messaging.members mm where mm.conversation_id=p_conversation and mm.user_id=uid and mm.deleted_through_seq is not null)
    and not exists(select 1 from messaging.messages m where m.conversation_id=p_conversation and messaging.visible(m.id,uid)) then
    raise exception ''This conversation is unavailable.'' using errcode=''42501'';
  end if;
'||anchor);
end $migration$;

create function messaging.delete_conversation(p_conversation uuid) returns jsonb language plpgsql security definer set search_path='' set timezone='Africa/Johannesburg' as $$
declare uid uuid:=messaging.actor(); boundary bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(uid::text,7022));
  perform pg_advisory_xact_lock(hashtextextended(p_conversation::text,7024));
  if not exists(select 1 from messaging.members mm join messaging.conversations c on c.id=mm.conversation_id
    where mm.conversation_id=p_conversation and mm.user_id=uid and mm.active and c.kind in ('direct','group')) then
    raise exception 'This conversation is unavailable.' using errcode='42501';
  end if;
  select coalesce(max(seq),0) into boundary from messaging.messages where conversation_id=p_conversation;
  update messaging.members set deleted_through_seq=greatest(coalesce(deleted_through_seq,0),boundary),
    read_seq=greatest(read_seq,boundary),marked_unread_from=null,archived=false
    where conversation_id=p_conversation and user_id=uid and active;
  insert into messaging.audit(actor_id,action,subject_id) values(uid,'conversation_delete',p_conversation);
  perform messaging.signal(uid);
  return '{}';
end $$;
create function public.messaging_delete_conversation(p_conversation uuid) returns jsonb language sql security invoker set search_path='' as $$
  select messaging.delete_conversation(p_conversation)
$$;

-- Existing private tables stay RPC-only. No new client table or sequence access.
revoke all on function messaging.visible(uuid,uuid),messaging.api_before_groups(text,jsonb),messaging.delete_conversation(uuid) from public,anon,authenticated,service_role;
grant execute on function messaging.delete_conversation(uuid) to authenticated;
revoke all on function public.messaging_delete_conversation(uuid) from public,anon,authenticated,service_role;
grant execute on function public.messaging_delete_conversation(uuid) to authenticated;
notify pgrst,'reload schema';
