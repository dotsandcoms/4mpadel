-- Platform Super Admin intervention only. Preserve event scope for all other roles,
-- MFA, active-account checks, sending kill switch, private-chat membership and 90-day retention.

create or replace function messaging.manager(p_event bigint) returns boolean
language sql stable security definer set search_path='' set timezone='Africa/Johannesburg' as $$
  select p_event is not null and auth.uid() is not null and exists(
    select 1 from public.calendar c where c.id=p_event and (
      coalesce(public.is_super_admin(auth.email()),false)
      or (coalesce(public.can_manage_event(p_event),false) and (
        lower(trim(c.organiser_email))=lower(trim(auth.email()))
        or exists(select 1 from unnest(c.event_co_admins) co_admin where lower(trim(co_admin))=lower(trim(auth.email())))
        or exists(select 1 from public.organisation_members member where member.organisation_id=c.organisation_id
          and lower(trim(member.user_email))=lower(trim(auth.email())) and member.role in ('owner','admin'))
        or exists(select 1 from public.organisations organisation join public.players creator on creator.id=organisation.created_by
          where organisation.id=c.organisation_id and lower(trim(creator.email))=lower(trim(auth.email())))
        or exists(select 1 from public.admin_sidebar_permissions permission where lower(trim(permission.email))=lower(trim(auth.email()))
          and coalesce(permission.module_permissions->'event-mgmt'->'allowedEvents','[]'::jsonb) @> jsonb_build_array(p_event))
      ))
    )
  )
$$;

alter table messaging.audit add column event_id bigint references public.calendar(id) on delete set null;
create or replace function messaging.require_manager(p_event bigint) returns void
language plpgsql security definer set search_path='' set timezone='Africa/Johannesburg' as $$
begin
  if not messaging.manager(p_event) then raise exception 'Event messaging access denied.' using errcode='42501'; end if;
  if auth.jwt()->>'aal' is distinct from 'aal2' then raise exception 'Verify your account with two-factor authentication to manage event messages.' using errcode='42501'; end if;
  if public.is_super_admin(auth.email()) and not exists(select 1 from messaging.audit a
    where a.actor_id=auth.uid() and a.event_id=p_event and a.action='event_admin_access' and a.created_at>now()-interval '1 hour') then
    insert into messaging.audit(actor_id,action,event_id) values(auth.uid(),'event_admin_access',p_event);
  end if;
end $$;

-- Every directory result and aggregate is independently event-authorised.
create or replace function messaging.event_directory(p_query text default '') returns jsonb language plpgsql security definer set search_path='' set timezone='Africa/Johannesburg' as $$
declare uid uuid:=messaging.actor(); result jsonb;
begin
  if not messaging.enabled_for(uid) then raise exception 'Messaging is getting ready.' using errcode='42501'; end if;
  if auth.jwt()->>'aal' is distinct from 'aal2' then raise exception 'Verify your account with two-factor authentication.' using errcode='42501'; end if;
  if length(coalesce(p_query,''))>120 then raise exception 'Search is too long.'; end if;
  select coalesce(jsonb_agg(item order by priority,distance,id),'[]'::jsonb) into result from (
    select e.id,(coalesce(e.end_date,e.start_date)::date<current_date)::int priority,abs(e.start_date::date-current_date) distance,
      jsonb_build_object('id',e.id,'title',e.event_name,'date',e.start_date,'endDate',e.end_date,
        'organisation',o.name,'venue',e.venue,'postingOpen',public.is_super_admin(auth.email()) or (e.event_status is distinct from 'cancelled' and current_date<=coalesce(e.end_date,e.start_date)::date+7),
        'accessMode',case when public.is_super_admin(auth.email()) then 'super_admin' else 'event_team' end) item
    from public.calendar e left join public.organisations o on o.id=e.organisation_id
    where messaging.manager(e.id) and coalesce(e.end_date,e.start_date)::date>=current_date-90
      and position(lower(trim(coalesce(p_query,''))) in lower(concat_ws(' ',e.event_name,o.name,e.venue,e.start_date::text)))>0
    order by priority,distance,e.id limit 100
  ) events;
  return result;
end $$;

create or replace function messaging.conversation_json_before_groups(p_conversation uuid,p_user uuid) returns jsonb language plpgsql stable security definer set search_path='' set timezone='Africa/Johannesburg' as $$
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
    if not (is_manager and public.is_super_admin(auth.email())) and exists(select 1 from public.calendar e where e.id=c.event_id and (e.event_status='cancelled'
      or current_date>coalesce(e.end_date,e.start_date)::date+7)) then can_send:=false;reason:='This event conversation is read-only.'; end if;
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
end $$;

create or replace function messaging.event_analytics(p_event bigint) returns jsonb language plpgsql security definer set search_path='' set timezone='Africa/Johannesburg' as $$
declare uid uuid:=messaging.actor(); event_json jsonb; updates jsonb; audience bigint; discussion_audience bigint; summary jsonb;
begin
  if not messaging.enabled_for(uid) then raise exception 'Messaging is getting ready.' using errcode='42501'; end if;
  perform messaging.require_manager(p_event);
  select jsonb_build_object('id',e.id,'title',e.event_name,'date',e.start_date,'endDate',e.end_date,
    'organisation',o.name,'venue',e.venue,'postingOpen',e.event_status is distinct from 'cancelled' and current_date<=coalesce(e.end_date,e.start_date)::date+7)
    into event_json from public.calendar e left join public.organisations o on o.id=e.organisation_id
    where e.id=p_event and coalesce(e.end_date,e.start_date)::date>=current_date-90;
  if event_json is null then raise exception 'This event conversation is unavailable.' using errcode='42501'; end if;
  event_json:=event_json||jsonb_build_object('postingOpen',public.is_super_admin(auth.email()) or (event_json->>'postingOpen')::boolean,'accessMode',case when public.is_super_admin(auth.email()) then 'super_admin' else 'event_team' end);
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
end $$;

-- Keep existing private helper grants; public entry points remain unchanged.
revoke all on function messaging.manager(bigint),messaging.require_manager(bigint),messaging.conversation_json_before_groups(uuid,uuid) from public,anon,authenticated,service_role;
