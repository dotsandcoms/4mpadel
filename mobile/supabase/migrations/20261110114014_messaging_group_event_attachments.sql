-- Calendar cards may be shared in accepted private/group conversations.
-- This grants no event-management, registration or hidden-event access.
create or replace function messaging.group_api(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=messaging.actor(); cid uuid:=(p_data->>'conversationId')::uuid; g messaging.groups; state text; m messaging.messages; key uuid; body text; reply uuid; other uuid; answer text; event bigint; card_tab text;
begin
  if p_action='send' then perform pg_advisory_xact_lock(hashtextextended(uid::text,7050)); end if;
  perform pg_advisory_xact_lock(hashtextextended(cid::text,7024));
  select * into g from messaging.groups where conversation_id=cid;
  if not messaging.group_access(cid,uid) then raise exception 'This conversation is unavailable.' using errcode='42501'; end if;
  select status into state from messaging.group_members where conversation_id=cid and user_id=uid;
  if p_action='respond' then
    answer:=p_data->>'response';
    if state<>'invited' or answer is null or answer not in ('accept','decline') then raise exception 'This request is unavailable.'; end if;
    if answer='accept' and g.source<>'admin_direct' and p_data->>'groupsVersion' is distinct from '1' then raise exception 'Update the app to join this group chat.' using errcode='42501'; end if;
    if answer='accept' and exists(select 1 from messaging.group_members where conversation_id=cid and status='accepted' and user_id<>uid and messaging.blocked(uid,user_id)) then raise exception 'This group cannot be joined with these players.' using errcode='42501'; end if;
    update messaging.group_members set status=case when answer='accept' then 'accepted' else 'left' end where conversation_id=cid and user_id=uid;
    update messaging.members set active=answer='accept',eligible_from=clock_timestamp(),read_seq=greatest(read_seq,coalesce((select seq from messaging.messages where id=g.invitation_id),0)) where conversation_id=cid and user_id=uid;
    for other in select user_id from messaging.group_members where conversation_id=cid loop perform messaging.signal(other); end loop;
    return '{}'::jsonb;
  elsif p_action='group_members' then
    return coalesce((select jsonb_agg(jsonb_build_object('id',p.id::text,'name',p.name,'image',p.image_url,'status',member.status,'creator',member.user_id=g.creator_id) order by member.user_id=g.creator_id desc,p.name)
      from messaging.group_members member join messaging.accounts a on a.user_id=member.user_id join public.players p on p.id=a.player_id
      where member.conversation_id=cid and member.status<>'left' and (member.status='accepted' or member.user_id=uid or g.creator_id=uid)),'[]');
  elsif p_action='group_leave' then
    update messaging.group_members set status='left' where conversation_id=cid and user_id=uid;
    update messaging.members set active=false,archived=false where conversation_id=cid and user_id=uid;
    insert into messaging.audit(actor_id,action,subject_id) values(uid,'group_leave',cid);
    for other in select user_id from messaging.group_members where conversation_id=cid loop perform messaging.signal(other); end loop;
    return '{}'::jsonb;
  elsif p_action='block' then
    if g.source<>'admin_direct' then raise exception 'Open a private conversation to block a player. You can leave this group.'; end if;
    select user_id into other from messaging.group_members where conversation_id=cid and user_id<>uid;
    insert into messaging.blocks(user_id,blocked_id) values(uid,other) on conflict do nothing;
    perform messaging.signal(other);perform messaging.signal(uid);return '{}'::jsonb;
  elsif p_action='send' then
    if state<>'accepted' or not exists(select 1 from messaging.configuration where sending_enabled) then raise exception 'You cannot send to this conversation.' using errcode='42501'; end if;
    if g.source='admin_direct' and not exists(select 1 from messaging.group_members peer where peer.conversation_id=cid and peer.user_id<>uid and peer.status='accepted' and messaging.group_access(cid,peer.user_id)) then raise exception 'This conversation is currently unavailable.' using errcode='42501'; end if;
    key:=(p_data->>'clientId')::uuid;body:=btrim(coalesce(p_data->>'body',''));reply:=nullif(p_data->>'replyId','')::uuid;
    event:=nullif(p_data->>'eventId','')::bigint;
    card_tab:=coalesce(nullif(p_data->>'cardTab',''),'Overview');
    if key is null or char_length(body)>4000 or (body='' and event is null) then raise exception 'Write a message of up to 4,000 characters.'; end if;
    if event is not null and (card_tab not in ('Overview','Draws','Results') or not exists(select 1 from public.calendar where id=event and is_visible=true and (sanction_status is null or sanction_status='approved'))) then raise exception 'Choose a published 4M event.'; end if;
    select * into m from messaging.messages where sender_id=uid and client_id=key;
    if m.id is not null then
      if m.conversation_id<>cid or m.body<>body or m.reply_id is distinct from reply or m.card_event_id is distinct from event or (event is not null and m.card_tab is distinct from card_tab) then raise exception 'This message retry has different content.'; end if;
      return messaging.message_json(m.id,uid);
    end if;
    if (select count(*) from messaging.audit where actor_id=uid and action='send' and created_at>clock_timestamp()-interval '10 seconds')>=20 then raise exception 'You’re sending too quickly. Wait a moment.'; end if;
    if body ~* '(\m(kill yourself|child porn)\M)' then raise exception 'This message could not be sent. Please review the community rules.'; end if;
    if reply is not null and (not messaging.visible(reply,uid) or not exists(select 1 from messaging.messages where id=reply and conversation_id=cid and deleted_at is null)) then raise exception 'That reply is no longer available.'; end if;
    insert into messaging.messages(conversation_id,sender_id,client_id,body,reply_id,card_event_id,card_tab,expires_at) values(cid,uid,key,body,reply,event,case when event is not null then card_tab end,now()+interval '12 months') returning * into m;
    update messaging.conversations set updated_at=clock_timestamp() where id=cid;
    update messaging.members set archived=false where conversation_id=cid and user_id in (select user_id from messaging.group_members where conversation_id=cid and status='accepted');
    insert into messaging.audit(actor_id,action,subject_id) values(uid,'send',cid);perform messaging.queue_message(m.id);
    return messaging.message_json(m.id,uid);
  elsif p_action not in ('read','mark_read','member_settings','report','delete') then raise exception 'This conversation action is unavailable.'; end if;
  return messaging.api_before_groups(p_action,p_data);
end $$;

revoke all on function messaging.group_api(text,jsonb) from public,anon,authenticated,service_role;
create or replace function messaging.message_json_before_groups(p_message uuid,p_user uuid) returns jsonb language sql stable security definer set search_path='' set timezone='Africa/Johannesburg' as $$
  select jsonb_build_object('id',m.id,'seq',m.seq,'body',case when m.deleted_at is null then m.body else '' end,
    'mine',m.sender_id=p_user,'sender',jsonb_build_object('id',p.id::text,'name',coalesce(p.name,'Former player'),'image',p.image_url,'role',m.sender_role),
    'audience',case when c.kind='event_announcements' then jsonb_build_object('all',m.target_division_ids is null,'divisions',coalesce(to_jsonb(m.target_division_names),'[]'::jsonb)) end,
    'createdAt',m.created_at,'deleted',m.deleted_at is not null,
    'reply',case when m.deleted_at is null and r.deleted_at is null and r.conversation_id=m.conversation_id and messaging.visible(r.id,p_user) then
      jsonb_build_object('id',r.id,'body',left(r.body,160),'name',coalesce(rp.name,'Former player'),'role',r.sender_role,'mine',r.sender_id=p_user) end,
    'card',case when m.deleted_at is null and e.id is not null and e.is_visible=true and (e.sanction_status is null or e.sanction_status='approved') then
      jsonb_build_object('eventId',e.id,'title',e.event_name,'date',e.start_date,'tab',coalesce(m.card_tab,'Overview'),'poster',coalesce(nullif(e.poster_image_url,''),nullif(e.custom_image_url,''),nullif(e.image_url,'')),'venue',e.venue,'city',e.city,'tier',e.sapa_status) end)
  from messaging.messages m join messaging.conversations c on c.id=m.conversation_id left join messaging.accounts a on a.user_id=m.sender_id left join public.players p on p.id=a.player_id
    left join messaging.messages r on r.id=m.reply_id left join messaging.accounts ra on ra.user_id=r.sender_id
    left join public.players rp on rp.id=ra.player_id left join public.calendar e on e.id=m.card_event_id
  where m.id=p_message and messaging.visible(m.id,p_user)
$$;

revoke all on function messaging.message_json_before_groups(uuid,uuid) from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
