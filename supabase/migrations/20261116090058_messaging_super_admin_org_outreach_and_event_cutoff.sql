-- Super Admin organisation outreach is recorded on the conversation, so its
-- unlinked invitees can accept and reply from their own (non-admin) session.
-- Existing conversations retain their linked audience. Private tables stay RPC-only.
alter table messaging.groups add column global_outreach boolean not null default false;
alter table messaging.groups add constraint messaging_groups_global_outreach_scope
  check(not global_outreach or (source in ('admin_direct','admin_group') and scope~'^org:[0-9a-f-]{36}$'));

create or replace function messaging.global_org_sender(p_scope text,p_actor uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce(p_scope~'^org:[0-9a-f-]{36}$'
    and messaging.admin_scope_for('platform',p_actor)
    and messaging.admin_scope_for(p_scope,p_actor),false)
$$;

-- The last event date remains open through midnight in South Africa. There is no
-- post-event sending grace period or Super Admin exception; history keeps its retention.
create or replace function messaging.event_sending_open(p_event bigint) returns boolean
language sql stable security definer set search_path='' set timezone='Africa/Johannesburg' as $$
  select exists(select 1 from public.calendar e where e.id=p_event
    and e.event_status is distinct from 'cancelled' and coalesce(e.end_date,e.start_date)::date>=current_date)
$$;
CREATE OR REPLACE FUNCTION messaging.group_access(p_conversation uuid, p_user uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare g messaging.groups; member messaging.group_members;
begin
  select * into g from messaging.groups where conversation_id=p_conversation;
  select * into member from messaging.group_members where conversation_id=p_conversation and user_id=p_user;
  if not exists(select 1 from messaging.configuration where groups_enabled) or g.conversation_id is null or member.status is null or member.status='left' or not messaging.enabled_for(p_user) or not messaging.interactive(p_user)
    or not exists(select 1 from messaging.members where conversation_id=p_conversation and user_id=p_user and active) then return false; end if;
  if g.source<>'player_group' then
    if p_user=g.creator_id then
      if (g.global_outreach and not messaging.global_org_sender(g.scope,p_user)) or not messaging.admin_scope_for(g.scope,p_user) or (p_user=auth.uid() and auth.jwt()->>'aal' is distinct from 'aal2') then return false; end if;
    elsif not g.global_outreach and not messaging.scope_player(g.scope,p_user) then return false; end if;
  end if;
  if member.status='invited' and not exists(select 1 from messaging.messages invitation where invitation.id=g.invitation_id and invitation.deleted_at is null and invitation.expires_at>now()) then return false; end if;
  if member.status='invited' or g.source='admin_direct' then
    if g.creator_id is not null and messaging.blocked(p_user,g.creator_id) then return false; end if;
  end if;
  return true;
end $function$;

CREATE OR REPLACE FUNCTION messaging.create_group(p_data jsonb, p_source text, p_scope text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid:=messaging.actor(); ids bigint[]; users uuid[]; other uuid; cid uuid; key uuid; title text; body text; g messaging.groups; m messaging.messages; pair text; v_global boolean;
begin
  if not exists(select 1 from messaging.configuration where enabled and sending_enabled and requests_enabled and groups_enabled) or not messaging.interactive(uid) then raise exception 'Complete messaging setup before creating a conversation.' using errcode='42501'; end if;
  if p_source not in ('player_group','admin_group','admin_direct') or (p_source<>'player_group' and not messaging.admin_scope(p_scope)) then raise exception 'Messaging access denied.' using errcode='42501'; end if;
  v_global:=p_source<>'player_group' and auth.jwt()->>'aal'='aal2' and messaging.global_org_sender(p_scope,uid);
  if p_source<>'player_group' and p_scope~'^event:[1-9][0-9]*$' and not messaging.event_sending_open(substring(p_scope from 7)::bigint) then
    raise exception 'This event conversation is read-only.' using errcode='42501';
  end if;
  if jsonb_typeof(p_data->'playerIds') is distinct from 'array' or jsonb_array_length(p_data->'playerIds') not between 1 and 19 then raise exception 'Choose up to 19 players for a group.'; end if;
  select array_agg(distinct v::bigint order by v::bigint) into ids from jsonb_array_elements_text(p_data->'playerIds') v;
  if cardinality(ids)<(case when p_source='admin_direct' then 1 else 2 end) then raise exception 'Choose at least two players for a group.'; end if;
  key:=(p_data->>'clientId')::uuid;title:=btrim(p_data->>'title');body:=btrim(p_data->>'body');
  if key is null or title is null or char_length(title) not between 2 and 60 or body is null or char_length(body) not between 1 and 300 then raise exception 'Write a group name and an introduction of up to 300 characters.'; end if;
  if body ~* '(\m(kill yourself|child porn)\M)' then raise exception 'This message could not be sent. Please review the community rules.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,7050));
  select array_agg(a.user_id order by a.user_id) into users from messaging.accounts a where a.player_id=any(ids) and a.user_id<>uid and a.allow_requests and messaging.interactive(a.user_id) and not messaging.blocked(uid,a.user_id)
    and (p_source='player_group' or v_global or messaging.scope_player(p_scope,a.user_id));
  if cardinality(users) is distinct from cardinality(ids) then raise exception 'Messaging is unavailable for one or more selected players.' using errcode='42501'; end if;
  if exists(select 1 from unnest(users) a cross join unnest(users) b where a<>b and messaging.blocked(a,b)) then raise exception 'This group cannot be created with these players.' using errcode='42501'; end if;
  select * into g from messaging.groups where creator_id=uid and client_id=key;
  if g.conversation_id is not null then
    if g.recipients<>users or g.source<>p_source or g.scope is distinct from p_scope or g.title<>title or not exists(select 1 from messaging.messages initial where initial.id=g.invitation_id and initial.body=btrim(p_data->>'body')) then raise exception 'This message retry has a different audience or content.'; end if;
    return jsonb_build_object('id',g.conversation_id,'status','requested');
  end if;
  if p_source='player_group' and (select count(*) from messaging.audit where actor_id=uid and action='group_create' and created_at>now()-interval '24 hours')>=20 then raise exception 'You have reached today’s group invitation limit.'; end if;
  if p_source='admin_direct' then
    pair:='admin:'||p_scope||':'||uid::text||':'||users[1]::text;
    select conv.id into cid from messaging.conversations conv join messaging.groups existing on existing.conversation_id=conv.id where conv.pair_key=pair;
    if cid is not null then
      if v_global then
        update messaging.groups set global_outreach=true where conversation_id=cid and not global_outreach;
        if found then insert into messaging.audit(actor_id,action,subject_id) values(uid,'super_admin_org_outreach',cid); end if;
      end if;
      if not messaging.group_access(cid,users[1]) or exists(select 1 from messaging.group_members where conversation_id=cid and user_id=users[1] and status='left') then raise exception 'Messaging is unavailable for this player.' using errcode='42501'; end if;
      if exists(select 1 from messaging.group_members where conversation_id=cid and user_id=users[1] and status='invited') then return jsonb_build_object('id',cid,'status','waiting'); end if;
      perform messaging.group_api('send',jsonb_build_object('conversationId',cid,'body',body,'clientId',key));
      return jsonb_build_object('id',cid,'status','sent');
    end if;
  end if;
  insert into messaging.conversations(kind,pair_key,requester) values('direct',pair,uid) returning id into cid;
  insert into messaging.groups(conversation_id,title,creator_id,source,scope,client_id,recipients,global_outreach) values(cid,title,uid,p_source,p_scope,key,users,coalesce(v_global,false));
  insert into messaging.group_members(conversation_id,user_id,status) values(cid,uid,'accepted');
  insert into messaging.group_members(conversation_id,user_id,status) select cid,value,'invited' from unnest(users) value;
  insert into messaging.members(conversation_id,user_id) select cid,value from unnest(users||uid) value;
  insert into messaging.messages(conversation_id,sender_id,client_id,body,expires_at) values(cid,uid,key,body,now()+interval '12 months') returning * into m;
  update messaging.groups set invitation_id=m.id where conversation_id=cid;
  insert into messaging.audit(actor_id,action,subject_id) values(uid,'group_create',cid);
  if v_global then insert into messaging.audit(actor_id,action,subject_id) values(uid,'super_admin_org_outreach',cid); end if;
  perform messaging.queue_message(m.id);
  return jsonb_build_object('id',cid,'status','requested');
end $function$;

CREATE OR REPLACE FUNCTION messaging.api(p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid; scope text; query text; result jsonb; row record; ids bigint[]; payload jsonb; saved messaging.admin_batches; key uuid; child uuid; audience jsonb; mode text;
begin
  if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>20000 then raise exception 'Invalid messaging request.'; end if;
  if p_action='status' then return messaging.api_before_groups(p_action,p_data)||jsonb_build_object('groupsEnabled',(select groups_enabled from messaging.configuration where singleton)); end if;
  if p_action not in ('group_create','group_players','admin_scopes','admin_players','admin_send','admin_inbox') then
    if nullif(p_data->>'conversationId','') is not null and exists(select 1 from messaging.groups where conversation_id=(p_data->>'conversationId')::uuid) then return messaging.group_api(p_action,p_data); end if;
    return messaging.api_before_groups(p_action,p_data);
  end if;
  uid:=messaging.actor();
  if not exists(select 1 from messaging.configuration where groups_enabled) then raise exception 'Group and admin messaging is currently unavailable.' using errcode='42501'; end if;
  if not messaging.enabled_for(uid) or not messaging.interactive(uid) then raise exception 'Complete messaging setup before sending messages.' using errcode='42501'; end if;
  if p_action='group_create' then return messaging.create_group(p_data,'player_group',null); end if;
  if p_action='group_players' then
    query:=btrim(coalesce(p_data->>'query',''));
    if char_length(query)<2 then return '[]'; end if;
    if char_length(query)>120 then raise exception 'Choose a shorter player search.'; end if;
    return coalesce((select jsonb_agg(item) from (select jsonb_build_object('id',p.id::text,'name',p.name,'image_url',p.image_url,'home_club',to_jsonb(p)->>'home_club') item
      from messaging.accounts a join public.players p on p.id=a.player_id where a.user_id<>uid and a.allow_requests and messaging.interactive(a.user_id) and not messaging.blocked(uid,a.user_id)
      and position(lower(query) in lower(p.name))>0 order by p.name,p.id limit 30) candidates),'[]');
  end if;

  if auth.jwt()->>'aal' is distinct from 'aal2' then raise exception 'Verify your account with two-factor authentication to message players.' using errcode='42501'; end if;
  if p_action='admin_scopes' then
    select coalesce(jsonb_agg(item order by item->>'label'),'[]') into result from (
      select jsonb_build_object('id','platform','label','4M platform · authorised admin access') item where messaging.admin_scope('platform')
      union all select jsonb_build_object('id','org:'||o.id::text,'label',o.name,'globalAudience',messaging.global_org_sender('org:'||o.id::text,uid)) from public.organisations o where messaging.admin_scope('org:'||o.id::text)
      union all select jsonb_build_object('id','event:'||e.id::text,'label','Event audience · '||e.event_name) from public.calendar e where messaging.admin_scope('event:'||e.id::text) and messaging.event_sending_open(e.id)
        and (e.organisation_id is null or not messaging.admin_scope('org:'||e.organisation_id::text))
    ) scopes;
    return result;
  end if;
  scope:=p_data->>'scope';
  if not messaging.admin_scope(scope) then raise exception 'Messaging access denied for this organisation or audience.' using errcode='42501'; end if;
  if p_action in ('admin_players','admin_send') and scope~'^event:[1-9][0-9]*$' and not messaging.event_sending_open(substring(scope from 7)::bigint) then
    raise exception 'This event conversation is read-only.' using errcode='42501';
  end if;
  if p_action='admin_players' then
    query:=btrim(coalesce(p_data->>'query',''));
    if char_length(query)<2 then return '[]'; end if;
    if char_length(query)>120 then raise exception 'Choose a shorter player search.'; end if;
    select coalesce(jsonb_agg(item),'[]') into result from (
      select jsonb_build_object('id',p.id::text,'name',p.name,'image_url',p.image_url,'home_club',to_jsonb(p)->>'home_club') item
      from messaging.accounts a join public.players p on p.id=a.player_id where a.user_id<>uid and a.allow_requests and messaging.interactive(a.user_id)
        and (messaging.scope_player(scope,a.user_id) or messaging.global_org_sender(scope,uid)) and not messaging.blocked(uid,a.user_id) and position(lower(query) in lower(p.name))>0 order by p.name,p.id limit 40
    ) players;
    return result;
  elsif p_action='admin_inbox' then
    return coalesce((select jsonb_agg(item order by item->>'updatedAt' desc) from (
      select messaging.conversation_json(g.conversation_id,uid) item from messaging.groups g join messaging.conversations conv on conv.id=g.conversation_id where g.creator_id=uid and g.scope=(p_data->>'scope') and g.source<>'player_group' and messaging.group_access(g.conversation_id,uid) order by conv.updated_at desc limit 100
    ) conversations),'[]');
  end if;
  if not exists(select 1 from messaging.configuration where sending_enabled and requests_enabled) then raise exception 'Messaging is currently read-only.' using errcode='42501'; end if;
  mode:=coalesce(p_data->>'mode','private');
  if mode not in ('private','group') then raise exception 'Choose private messages or a group chat.'; end if;
  if jsonb_typeof(p_data->'playerIds') is distinct from 'array' or jsonb_array_length(p_data->'playerIds') not between 1 and 50 then raise exception 'Choose up to 50 players per private send.'; end if;
  select array_agg(distinct v::bigint order by v::bigint) into ids from jsonb_array_elements_text(p_data->'playerIds') v;
  if exists(select 1 from unnest(ids) wanted where not exists(select 1 from messaging.accounts a where a.player_id=wanted and a.user_id<>uid and a.allow_requests and messaging.interactive(a.user_id) and (messaging.scope_player(scope,a.user_id) or messaging.global_org_sender(scope,uid)) and not messaging.blocked(uid,a.user_id))) then raise exception 'Messaging is unavailable for one or more selected players.' using errcode='42501'; end if;
  key:=(p_data->>'clientId')::uuid;
  if key is null then raise exception 'This message needs a retry key.'; end if;
  payload:=jsonb_build_object('scope',scope,'mode',mode,'playerIds',to_jsonb(ids),'bodyHash',encode(sha256(convert_to(coalesce(btrim(p_data->>'body'),''),'UTF8')),'hex'),'titleHash',encode(sha256(convert_to(coalesce(btrim(p_data->>'title'),''),'UTF8')),'hex'));
  perform pg_advisory_xact_lock(hashtextextended(uid::text,7050));
  select * into saved from messaging.admin_batches where actor_id=uid and client_id=key;
  if saved.actor_id is not null then
    if saved.payload<>payload then raise exception 'This message retry has a different audience or content.'; end if;
    return saved.result;
  end if;
  if (select count(*) from messaging.admin_batches where actor_id=uid and created_at>now()-interval '24 hours')>=20 then raise exception 'You have reached today’s admin send limit.'; end if;
  result:='[]';
  if mode='group' then
    result:=jsonb_build_array(messaging.create_group(p_data,'admin_group',scope));
  else
    for row in select id from unnest(ids) id loop
      child:=md5(key::text||':'||row.id::text)::uuid;
      result:=result||jsonb_build_array(messaging.create_group(jsonb_build_object('playerIds',jsonb_build_array(row.id),'body',p_data->>'body','clientId',child,'title',coalesce(nullif(case when scope='platform' then '4M Padel' when scope like 'org:%' then (select left(o.name,60) from public.organisations o where o.id=substring(scope from 5)::uuid) else (select left(e.event_name,60) from public.calendar e where e.id=substring(scope from 7)::bigint) end,''),'Event team')),'admin_direct',scope));
    end loop;
  end if;
  insert into messaging.admin_batches(actor_id,client_id,payload,result) values(uid,key,payload,result);
  insert into messaging.audit(actor_id,action) values(uid,'admin_send');
  return result;
end $function$;

CREATE OR REPLACE FUNCTION messaging.conversation_json_before_groups(p_conversation uuid, p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET "TimeZone" TO 'Africa/Johannesburg'
AS $function$
declare c messaging.conversations; member messaging.members; title text; photo text; last_message jsonb; unread int; can_send boolean; reason text; event_name text; is_manager boolean; peer uuid; prefs jsonb; alert_message jsonb;
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
    if not messaging.event_sending_open(c.event_id) then can_send:=false;reason:='This event conversation is read-only.'; end if;
  end if;
  select messaging.message_json(id,p_user) into last_message from messaging.messages where conversation_id=c.id
    and messaging.visible(id,p_user) order by seq desc limit 1;
  select count(*) into unread from messaging.messages where conversation_id=c.id and (seq>coalesce(member.read_seq,0) or (member.marked_unread_from is not null and seq>=member.marked_unread_from))
    and sender_id is distinct from p_user and deleted_at is null and messaging.visible(id,p_user);
  select coalesce(profile.notification_prefs,'{}'::jsonb) into prefs from public.players profile join messaging.accounts account on account.player_id=profile.id where account.user_id=p_user;
  if not coalesce(member.muted,false) and not coalesce(member.archived,false) and public.notification_quiet_until(coalesce(prefs,'{}'::jsonb))<=now() then
    select jsonb_build_object('id',message.id,'seq',message.seq,'reply',coalesce(messaging.is_own_reply(message.reply_id,c.id,p_user),false)) into alert_message
      from messaging.messages message where message.conversation_id=c.id and message.seq>coalesce(member.read_seq,0)
        and message.sender_id is distinct from p_user and message.deleted_at is null and messaging.visible(message.id,p_user)
        and messaging.notification_policy(c.kind,c.state,prefs,messaging.is_own_reply(message.reply_id,c.id,p_user))
      order by message.seq desc limit 1;
  end if;
  return jsonb_build_object('id',c.id,'kind',c.kind,'eventId',c.event_id,'title',coalesce(title,'Player'),
    'image',photo,'state',c.state,'incoming',c.requester is distinct from p_user,'muted',coalesce(member.muted,false),
    'archived',coalesce(member.archived,false),'unread',greatest(unread,case when member.marked_unread_from is not null and exists(select 1 from messaging.messages reminder where reminder.conversation_id=c.id and reminder.seq>=member.marked_unread_from and reminder.deleted_at is null and messaging.visible(reminder.id,p_user)) then 1 else 0 end),'preview',coalesce(nullif(last_message->>'body',''),last_message->'card'->>'title',''),
    'lastMessageSeq',last_message->'seq','notificationMessageId',alert_message->>'id','notificationSeq',alert_message->'seq','notificationIsReply',coalesce((alert_message->>'reply')::boolean,false),
    'lastMessageId',last_message->>'id','lastMessageMine',coalesce((last_message->>'mine')::boolean,false),
    'updatedAt',coalesce((last_message->>'createdAt')::timestamptz,c.created_at),'canSend',can_send and (select sending_enabled from messaging.configuration),
    'reason',reason,'manager',is_manager,'platformAdmin',is_manager and public.is_super_admin(auth.email()),'paused',c.paused,
    'pinned',case when messaging.visible(c.pinned_id,p_user) then messaging.message_json(c.pinned_id,p_user) end);
end $function$;

CREATE OR REPLACE FUNCTION messaging.event_directory(p_query text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET "TimeZone" TO 'Africa/Johannesburg'
AS $function$
declare uid uuid:=messaging.actor(); result jsonb;
begin
  if not messaging.enabled_for(uid) then raise exception 'Messaging is getting ready.' using errcode='42501'; end if;
  if auth.jwt()->>'aal' is distinct from 'aal2' then raise exception 'Verify your account with two-factor authentication.' using errcode='42501'; end if;
  if length(coalesce(p_query,''))>120 then raise exception 'Search is too long.'; end if;
  select coalesce(jsonb_agg(item order by priority,distance,id),'[]'::jsonb) into result from (
    select e.id,(coalesce(e.end_date,e.start_date)::date<current_date)::int priority,abs(e.start_date::date-current_date) distance,
      jsonb_build_object('id',e.id,'title',e.event_name,'date',e.start_date,'endDate',e.end_date,
        'organisation',o.name,'venue',e.venue,'postingOpen',messaging.event_sending_open(e.id),
        'accessMode',case when public.is_super_admin(auth.email()) then 'super_admin' else 'event_team' end) item
    from public.calendar e left join public.organisations o on o.id=e.organisation_id
    where messaging.manager(e.id) and messaging.event_sending_open(e.id)
      and position(lower(trim(coalesce(p_query,''))) in lower(concat_ws(' ',e.event_name,o.name,e.venue,e.start_date::text)))>0
    order by priority,distance,e.id limit 100
  ) events;
  return result;
end $function$;

CREATE OR REPLACE FUNCTION messaging.event_analytics(p_event bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET "TimeZone" TO 'Africa/Johannesburg'
AS $function$
declare uid uuid:=messaging.actor(); event_json jsonb; updates jsonb; audience bigint; discussion_audience bigint; summary jsonb;
begin
  if not messaging.enabled_for(uid) then raise exception 'Messaging is getting ready.' using errcode='42501'; end if;
  perform messaging.require_manager(p_event);
  select jsonb_build_object('id',e.id,'title',e.event_name,'date',e.start_date,'endDate',e.end_date,
    'organisation',o.name,'venue',e.venue,'postingOpen',messaging.event_sending_open(e.id))
    into event_json from public.calendar e left join public.organisations o on o.id=e.organisation_id
    where e.id=p_event and coalesce(e.end_date,e.start_date)::date>=current_date-90;
  if event_json is null then raise exception 'This event conversation is unavailable.' using errcode='42501'; end if;
  event_json:=event_json||jsonb_build_object('postingOpen',(event_json->>'postingOpen')::boolean,'accessMode',case when public.is_super_admin(auth.email()) then 'super_admin' else 'event_team' end);
  select count(*) filter(where c.kind='event_announcements'),count(*) filter(where c.kind='event_discussion') into audience,discussion_audience
    from messaging.members member join messaging.conversations c on c.id=member.conversation_id
    join messaging.accounts a on a.user_id=member.user_id join auth.users u on u.id=a.user_id cross join messaging.configuration cfg
    where c.event_id=p_event and member.active and not a.suspended and u.deleted_at is null and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until<now()) and cfg.enabled and (cardinality(cfg.pilot_player_ids)=0 or a.player_id=any(cfg.pilot_player_ids));
  with eligible_readers as materialized (
    select member.conversation_id,member.user_id,member.read_seq from messaging.members member
      join messaging.conversations c on c.id=member.conversation_id join messaging.accounts a on a.user_id=member.user_id
      join auth.users u on u.id=a.user_id cross join messaging.configuration cfg
    where c.event_id=p_event and c.kind='event_announcements' and member.active and not a.suspended
      and u.deleted_at is null and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<now())
      and cfg.enabled and (cardinality(cfg.pilot_player_ids)=0 or a.player_id=any(cfg.pilot_player_ids))
  ) select coalesce(jsonb_agg(item order by published desc,seq desc),'[]'::jsonb) into updates from (
    select m.created_at published,m.seq,jsonb_build_object('id',m.id,'body',m.body,'createdAt',m.created_at,'sender',jsonb_build_object('name',coalesce(sender.name,'Former player'),'role',m.sender_role,'image',sender.image_url),
      'audienceTarget',jsonb_build_object('all',m.target_division_ids is null,'divisions',coalesce(to_jsonb(m.target_division_names),'[]'::jsonb)),
      'audience',readers.audience,'read',readers.read_count,'pushQueued',push.queued,'pushAccepted',push.accepted,
      'pushConfirmed',push.confirmed,'pushFailed',push.failed,'pushSkipped',push.skipped,'pushJobs',push.jobs) item
    from messaging.messages m join messaging.conversations c on c.id=m.conversation_id
    left join messaging.accounts author on author.user_id=m.sender_id left join public.players sender on sender.id=author.player_id
    cross join lateral (
      select count(*) audience,count(*) filter(where member.read_seq>=m.seq) read_count from eligible_readers member
      where member.conversation_id=c.id and member.user_id is distinct from m.sender_id and messaging.division_allows(p_event,m.target_division_ids,member.user_id)
    ) readers
    cross join lateral (
      select count(*) jobs,count(*) filter(where state in ('pending','leased')) queued,count(*) filter(where state='accepted') accepted,
        count(*) filter(where state='sent') confirmed,count(*) filter(where state='failed') failed,count(*) filter(where state='skipped') skipped
      from messaging.deliveries d where d.message_id=m.id
    ) push
    where c.event_id=p_event and c.kind='event_announcements' and m.deleted_at is null and m.expires_at>now()
    order by m.created_at desc,m.seq desc limit 100
  ) announcements;
  select jsonb_build_object('audience',audience,'discussionAudience',discussion_audience,
    'announcements',(select count(*) from messaging.messages m join messaging.conversations c on c.id=m.conversation_id where c.event_id=p_event and c.kind='event_announcements' and m.deleted_at is null and m.expires_at>now()),
    'discussionMessages',(select count(*) from messaging.messages m join messaging.conversations c on c.id=m.conversation_id where c.event_id=p_event and c.kind='event_discussion' and m.deleted_at is null and m.expires_at>now()),
    'openReports',(select count(*) from messaging.reports r join messaging.conversations c on c.id=r.conversation_id where c.event_id=p_event and r.status='open'),
    'pushIssues',(select count(*) from messaging.deliveries d join messaging.conversations c on c.id=d.conversation_id where c.event_id=p_event and d.state='failed'),
    'read',(select coalesce(sum((value->>'read')::bigint),0) from jsonb_array_elements(updates)),
    'readAudience',(select coalesce(sum((value->>'audience')::bigint),0) from jsonb_array_elements(updates))) into summary;
  insert into messaging.audit(actor_id,action) values(uid,'event_analytics');
  return jsonb_build_object('event',event_json,'summary',summary,'announcements',updates,'generatedAt',clock_timestamp());
end $function$;
revoke all on function messaging.global_org_sender(text,uuid),messaging.event_sending_open(bigint),
  messaging.create_group(jsonb,text,text),messaging.group_access(uuid,uuid),messaging.conversation_json_before_groups(uuid,uuid)
  from public,anon,authenticated,service_role;
-- Preserve the existing checked entry points: no new public RPC or direct table grants.
