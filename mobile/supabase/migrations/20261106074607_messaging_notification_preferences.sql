-- Per-account alert choices do not change message visibility or unread history.
-- Keep data and helper functions private; retain the existing authenticated RPC.
create function messaging.notification_policy(p_kind text,p_state text,p_prefs jsonb,p_reply boolean) returns boolean language sql immutable set search_path='' as $$
  select coalesce(p_prefs->>'push_enabled','true')<>'false' and case
    when p_kind='event_announcements' then coalesce(p_prefs->>'chat_announcements','true')<>'false'
    when p_kind='event_discussion' then case coalesce(p_prefs->>'chat_discussion','all') when 'all' then true when 'replies' then coalesce(p_reply,false) else false end
    when p_kind='direct' and p_state='pending' then coalesce(p_prefs->>'chat_requests','true')<>'false'
    when p_kind='direct' and p_state='accepted' then coalesce(p_prefs->>'chat_private','true')<>'false'
    else false end
$$;
create function messaging.is_own_reply(p_reply uuid,p_conversation uuid,p_user uuid) returns boolean language sql stable strict security definer set search_path='' as $$
  select exists(select 1 from messaging.messages original where original.id=p_reply and original.conversation_id=p_conversation
    and original.sender_id=p_user and original.deleted_at is null and messaging.visible(original.id,p_user))
$$;
create function messaging.save_alert_preferences(p_patch jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=messaging.actor(); key text; result jsonb;
begin
  if jsonb_typeof(p_patch) is distinct from 'object' or p_patch='{}'::jsonb then raise exception 'Choose a valid messaging notification preference.'; end if;
  for key in select jsonb_object_keys(p_patch) loop
    if key in ('chat_announcements','chat_private','chat_requests') then
      if jsonb_typeof(p_patch->key) is distinct from 'boolean' then raise exception 'Choose a valid messaging notification preference.'; end if;
    elsif key='chat_discussion' then
      if jsonb_typeof(p_patch->key) is distinct from 'string' or p_patch->>key not in ('all','replies','off') then raise exception 'Choose all messages, replies or off.'; end if;
    else raise exception 'Choose a valid messaging notification preference.';
    end if;
  end loop;
  update public.players p set notification_prefs=coalesce(p.notification_prefs,'{}'::jsonb)||p_patch
    from messaging.accounts a where a.user_id=uid and a.player_id=p.id returning p.notification_prefs into result;
  return coalesce(result,'{}'::jsonb);
end $$;
create function messaging.alert_preferences_changed() returns trigger language plpgsql security definer set search_path='' as $$
declare recipient uuid;
begin
  if old.notification_prefs is distinct from new.notification_prefs then
    for recipient in select user_id from messaging.accounts where player_id=new.id loop perform messaging.signal(recipient); end loop;
  end if;
  return null;
end $$;
create trigger messaging_alert_preferences_changed after update of notification_prefs on public.players for each row execute function messaging.alert_preferences_changed();

create or replace function messaging.api(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' set timezone='Africa/Johannesburg' as $$
declare uid uuid; cfg messaging.configuration; c messaging.conversations; m messaging.messages; other uuid; target bigint;
  cid uuid; event bigint; body text; key uuid; result jsonb; consent messaging.guardian_consents; token text; address text;
  row record; oldest bigint; next_seq bigint; page jsonb; manager boolean; response_action text; mid uuid; division_ids uuid[]; division_names text[];
begin
  if jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>20000 then raise exception 'Invalid messaging request.'; end if;
  uid:=messaging.actor();
  -- Serialize account-level rate limits, block/request changes and idempotency.
  perform pg_advisory_xact_lock(hashtextextended(uid::text,7022));
  select * into cfg from messaging.configuration where singleton;
  if p_action='notification_preferences' then return messaging.save_alert_preferences(p_data); end if;
  if p_action='status' then
    return jsonb_build_object('enabled',messaging.enabled_for(uid),'interactive',cfg.enabled and messaging.interactive(uid),
      'rulesAccepted',exists(select 1 from messaging.accounts where user_id=uid and rules_version='2026-11-05'),
      'supportAllowed',public.is_super_admin(auth.email()) or exists(select 1 from public.admin_sidebar_permissions permission where lower(trim(permission.email))=lower(trim(auth.email())) and 'messaging-support'=any(permission.allowed_tabs)),
      'needsBirthDate',not exists(select 1 from public.player_profile_details d join messaging.accounts a on a.player_id=d.player_id where a.user_id=uid and d.date_of_birth is not null),
      'junior',exists(select 1 from public.player_profile_details d join messaging.accounts a on a.player_id=d.player_id where a.user_id=uid and d.date_of_birth>(current_date-interval '18 years')::date),
      'juniorsEnabled',cfg.juniors_enabled,'allowRequests',(select allow_requests from messaging.accounts where user_id=uid),
      'consents',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',p.name,'active',g.consented_at is not null and g.revoked_at is null))
        from messaging.guardian_consents g join messaging.accounts a on a.user_id=g.junior_id join public.players p on p.id=a.player_id
        where g.guardian_id=uid),'[]'::jsonb));
  end if;
  if not messaging.enabled_for(uid) and p_action<>'guardian_revoke' then raise exception 'Messaging is getting ready. Please check back soon.' using errcode='42501'; end if;
  if p_action='accept_rules' then
    if p_data->>'version' is distinct from '2026-11-05' then raise exception 'Please review the latest messaging rules.'; end if;
    update messaging.accounts set rules_version='2026-11-05' where user_id=uid;
    insert into messaging.audit(actor_id,action) values(uid,'accept_rules');return '{}'::jsonb;
  elsif p_action='preferences' then
    if jsonb_typeof(p_data->'allowRequests')<>'boolean' then raise exception 'Invalid preference.'; end if;
    update messaging.accounts set allow_requests=(p_data->>'allowRequests')::boolean where user_id=uid;return '{}'::jsonb;
  elsif p_action='blocked_players' then
    return coalesce((select jsonb_agg(jsonb_build_object('id',p.id::text,'name',p.name)) from messaging.blocks bl
      join messaging.accounts a on a.user_id=bl.blocked_id join public.players p on p.id=a.player_id where bl.user_id=uid),'[]'::jsonb);
  elsif p_action='unblock' then
    delete from messaging.blocks where user_id=uid and blocked_id=(select user_id from messaging.accounts where player_id=(p_data->>'playerId')::bigint);
    insert into messaging.audit(actor_id,action) values(uid,'unblock');return '{}';
  elsif p_action in ('support_reports','support_resolve','support_suspend') then
    if auth.jwt()->>'aal' is distinct from 'aal2' or not (public.is_super_admin(auth.email()) or exists(
      select 1 from public.admin_sidebar_permissions permission where lower(trim(permission.email))=lower(trim(auth.email()))
        and 'messaging-support'=any(permission.allowed_tabs))) then raise exception 'Messaging support access denied.' using errcode='42501'; end if;
    if p_action='support_reports' then
      insert into messaging.audit(actor_id,action) values(uid,'support_reports');
      return coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'reason',r.reason,'evidence',r.evidence,'createdAt',r.created_at))
        from messaging.reports r join messaging.conversations rc on rc.id=r.conversation_id where rc.kind='direct' and r.status='open'),'[]'::jsonb);
    end if;
    select r.* into row from messaging.reports r join messaging.conversations rc on rc.id=r.conversation_id
      where r.id=(p_data->>'reportId')::uuid and rc.kind='direct' for update of r;
    if row.id is null then raise exception 'Report unavailable.'; end if;
    if p_action='support_resolve' then update messaging.reports set status='resolved',closed_at=clock_timestamp() where id=row.id;
    else
      update messaging.accounts set suspended=true where user_id=(select sender_id from messaging.messages where id=row.message_id) returning user_id into other;
      if other is not null then perform messaging.signal(other); end if;
    end if;
    insert into messaging.audit(actor_id,action,subject_id) values(uid,p_action,row.id);return '{}';
  elsif p_action='join_discussion' then
    event:=(p_data->>'eventId')::bigint;
    if messaging.event_access(event,uid)<2 or not messaging.interactive(uid) then raise exception 'Confirm your event entry and messaging setup to join discussion.' using errcode='42501'; end if;
    perform messaging.sync_member(event,uid);
    update messaging.members mm set left_discussion=false,eligible_from=case when mm.left_discussion then clock_timestamp() else mm.eligible_from end
      from messaging.conversations conv where conv.id=mm.conversation_id and conv.event_id=event and conv.kind='event_discussion' and mm.user_id=uid;
    return '{}';
  elsif p_action='guardian_invite' then
    if not exists(select 1 from messaging.accounts a join public.player_profile_details d on d.player_id=a.player_id where a.user_id=uid
      and d.date_of_birth>(current_date-interval '18 years')::date) then raise exception 'Guardian consent is available for junior accounts.'; end if;
    if (select count(*) from messaging.guardian_consents where junior_id=uid and created_at>now()-interval '24 hours')>=3 then raise exception 'Please try again tomorrow.'; end if;
    address:=lower(trim(p_data->>'email'));
    if address is null or length(address)>254 or address!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      or exists(select 1 from auth.users where id=uid and lower(trim(email))=address) then raise exception 'Enter a separate guardian email address.'; end if;
    token:=gen_random_uuid()::text||gen_random_uuid()::text;
    insert into messaging.guardian_consents(junior_id,guardian_email,token_hash) values(uid,address,encode(sha256(token::bytea),'hex'));
    insert into messaging.audit(actor_id,action) values(uid,'guardian_invite');
    -- Share explicitly through the OS share sheet; no email/third-party messaging is sent by this RPC.
    return jsonb_build_object('code',token);
  elsif p_action='guardian_review' or p_action='guardian_accept' then
    select * into consent from messaging.guardian_consents where token_hash=encode(sha256(coalesce(p_data->>'code','')::bytea),'hex') for update;
    if consent.id is null or consent.expires_at<now() or consent.revoked_at is not null or consent.junior_id=uid
      or not exists(select 1 from auth.users where id=uid and lower(trim(email))=consent.guardian_email)
      or not exists(select 1 from messaging.accounts a join public.player_profile_details d on d.player_id=a.player_id where a.user_id=uid and d.date_of_birth<=(current_date-interval '18 years')::date) then
      raise exception 'This consent invitation is unavailable for this account.' using errcode='42501'; end if;
    if p_action='guardian_review' then return jsonb_build_object('name',(select p.name from messaging.accounts a join public.players p on p.id=a.player_id where a.user_id=consent.junior_id)); end if;
    if p_data->>'declaration' is distinct from 'I am an adult with legal authority to consent' or p_data->>'version' is distinct from consent.version
      or not exists(select 1 from auth.sessions where id=(auth.jwt()->>'session_id')::uuid and user_id=uid and created_at>now()-interval '15 minutes') then
      raise exception 'Sign in again and confirm your authority to consent.' using errcode='42501'; end if;
    update messaging.guardian_consents set guardian_id=uid,consented_at=coalesce(consented_at,clock_timestamp()) where id=consent.id;
    insert into messaging.audit(actor_id,action,subject_id) values(uid,'guardian_consent',consent.id);
    perform messaging.signal(consent.junior_id);return '{}'::jsonb;
  elsif p_action='guardian_revoke' then
    update messaging.guardian_consents set revoked_at=clock_timestamp() where id=(p_data->>'id')::uuid and (guardian_id=uid or junior_id=uid) returning * into consent;
    if consent.id is null then raise exception 'Consent not found.' using errcode='42501'; end if;
    perform messaging.signal(consent.junior_id);insert into messaging.audit(actor_id,action,subject_id) values(uid,'guardian_revoke',consent.id);return '{}'::jsonb;
  elsif p_action='events' then
    select coalesce(jsonb_agg(item order by item->>'date'),'[]'::jsonb) into result from (
      select jsonb_build_object('id',e.id,'title',e.event_name,'date',e.start_date,'manager',messaging.manager(e.id),
        'access',messaging.event_access(e.id,uid)) item from public.calendar e
      where coalesce(e.end_date,e.start_date)::date>=current_date-90
        and (messaging.event_access(e.id,uid)>0 or messaging.manager(e.id)) order by e.start_date desc limit 200) eligible;
    return result;
  elsif p_action='open_event' then
    event:=(p_data->>'eventId')::bigint;
    if messaging.event_access(event,uid)=0 and not messaging.manager(event) then raise exception 'Register for this event to access its messages.' using errcode='42501'; end if;
    if messaging.manager(event) then perform messaging.require_manager(event); end if;
    perform messaging.sync_member(event,uid);
    if messaging.manager(event) then
      insert into messaging.members(conversation_id,user_id) select id,uid from messaging.conversations where event_id=event
        on conflict(conversation_id,user_id) do nothing;
    end if;
    return coalesce((select jsonb_agg(messaging.conversation_json(id,uid) order by kind) filter(where messaging.can_read(id,uid))
      from messaging.conversations where event_id=event),'[]'::jsonb);
  elsif p_action='list' then
    for event in select distinct e.id from public.calendar e where coalesce(e.end_date,e.start_date)::date>=current_date-90
      and messaging.event_access(e.id,uid)>0 loop perform messaging.sync_member(event,uid); end loop;
    return coalesce((select jsonb_agg(item order by item->>'updatedAt' desc) from (
      select messaging.conversation_json(conv.id,uid) item from messaging.conversations conv join messaging.members member on member.conversation_id=conv.id
      where member.user_id=uid and messaging.can_read(conv.id,uid) order by conv.updated_at desc,conv.id limit 200) list),'[]'::jsonb);
  elsif p_action='request' then
    if not cfg.sending_enabled or not cfg.requests_enabled or not messaging.interactive(uid) then raise exception 'Complete messaging setup before sending a request.' using errcode='42501'; end if;
    key:=(p_data->>'clientId')::uuid;target:=(p_data->>'playerId')::bigint;body:=btrim(p_data->>'body');
    if key is null or body is null or char_length(body) not between 1 and 300 then raise exception 'Introduce yourself in 1 to 300 characters.'; end if;
    if body ~* '(\m(kill yourself|child porn)\M)' then raise exception 'This message could not be sent. Please review the community rules.'; end if;
    select a.user_id into other from messaging.accounts a where a.player_id=target and a.allow_requests and messaging.interactive(a.user_id);
    if other is null or other=uid or messaging.blocked(uid,other) then raise exception 'Messaging is unavailable for this player.' using errcode='42501'; end if;
    perform pg_advisory_xact_lock(hashtextextended(least(uid::text,other::text)||greatest(uid::text,other::text),7023));
    select * into c from messaging.conversations where pair_key=least(uid::text,other::text)||':'||greatest(uid::text,other::text) for update;
    if c.id is not null and c.state<>'declined' then return jsonb_build_object('id',c.id); end if;
    if c.id is not null and c.declined_until>now() then raise exception 'Messaging is unavailable for this player.' using errcode='42501'; end if;
    if (select count(*) from messaging.audit where actor_id=uid and action='request' and created_at>now()-interval '24 hours')>=10 then raise exception 'You have reached today’s request limit.'; end if;
    if c.id is null then
      insert into messaging.conversations(kind,pair_key,requester,state) values('direct',least(uid::text,other::text)||':'||greatest(uid::text,other::text),uid,'pending') returning * into c;
      insert into messaging.members(conversation_id,user_id) values(c.id,uid),(c.id,other);
    else
      update messaging.conversations set state='pending',requester=uid,updated_at=clock_timestamp() where id=c.id;
      update messaging.members set active=true,archived=false,eligible_from=clock_timestamp() where conversation_id=c.id;
      delete from messaging.messages where conversation_id=c.id;
    end if;
    insert into messaging.messages(conversation_id,sender_id,client_id,body,expires_at) values(c.id,uid,key,body,now()+interval '12 months') returning * into m;
    insert into messaging.audit(actor_id,action,subject_id) values(uid,'request',c.id);perform messaging.queue_message(m.id);
    return jsonb_build_object('id',c.id);
  end if;
  cid:=(p_data->>'conversationId')::uuid;
  perform pg_advisory_xact_lock(hashtextextended(cid::text,7024));
  select * into c from messaging.conversations where id=cid;
  if c.event_id is not null then perform messaging.sync_member(c.event_id,uid); end if;
  if not messaging.can_read(cid,uid) then raise exception 'This conversation is unavailable.' using errcode='42501'; end if;
  manager:=c.event_id is not null and messaging.manager(c.event_id) and auth.jwt()->>'aal'='aal2';
  if p_action='audience' then
    if c.kind<>'event_announcements' then raise exception 'Choose an announcements channel.'; end if;
    return messaging.event_audience(c.event_id,p_data->'divisionIds');
  elsif p_action='read' then
    oldest:=coalesce((p_data->>'before')::bigint,9223372036854775807);
    select jsonb_agg(item order by seq),min(seq) into page,next_seq from (
      select seq,messaging.message_json(id,uid) item from messaging.messages where conversation_id=cid and seq<oldest and messaging.visible(id,uid)
        order by seq desc limit 50) messages;
    return jsonb_build_object('conversation',messaging.conversation_json(cid,uid),'messages',coalesce(page,'[]'::jsonb),
      'next',case when exists(select 1 from messaging.messages where conversation_id=cid and seq<next_seq and messaging.visible(id,uid)) then next_seq end);
  elsif p_action='respond' then
    if c.kind<>'direct' or c.state<>'pending' or c.requester=uid or not messaging.interactive(uid) then raise exception 'This request is unavailable.'; end if;
    response_action:=p_data->>'response';
    if response_action not in ('accept','decline') or response_action is null then raise exception 'Choose Accept or Decline.'; end if;
    update messaging.conversations set state=case when response_action='accept' then 'accepted' else 'declined' end,
      declined_until=case when response_action='decline' then now()+interval '30 days' end,updated_at=clock_timestamp() where id=cid;
    for other in select user_id from messaging.members where conversation_id=cid loop perform messaging.signal(other); end loop;
    return '{}'::jsonb;
  elsif p_action='mark_read' then
    update messaging.members set read_seq=greatest(read_seq,coalesce((select max(seq) from messaging.messages where conversation_id=cid
      and seq<=coalesce((p_data->>'seq')::bigint,0) and messaging.visible(id,uid)),0)) where conversation_id=cid and user_id=uid;return '{}'::jsonb;
  elsif p_action='member_settings' then
    update messaging.members set muted=coalesce((p_data->>'muted')::boolean,muted),archived=coalesce((p_data->>'archived')::boolean,archived),
      left_discussion=case when c.kind='event_discussion' then coalesce((p_data->>'left')::boolean,left_discussion) else false end
      where conversation_id=cid and user_id=uid;
    return '{}'::jsonb;
  elsif p_action='block' then
    if c.kind<>'direct' then raise exception 'Open the player’s private conversation to block them.'; end if;
    select user_id into other from messaging.members where conversation_id=cid and user_id<>uid;
    insert into messaging.blocks(user_id,blocked_id) values(uid,other) on conflict do nothing;
    insert into messaging.audit(actor_id,action,subject_id) values(uid,'block',cid);
    perform messaging.signal(other);return '{}'::jsonb;
  elsif p_action='report' then
    mid:=(p_data->>'messageId')::uuid;
    if not messaging.visible(mid,uid) or not exists(select 1 from messaging.messages where id=mid and conversation_id=cid) then raise exception 'Message unavailable.'; end if;
    if (select count(*) from messaging.audit where actor_id=uid and action='report' and created_at>now()-interval '1 hour')>=20 then raise exception 'Please try again later.'; end if;
    insert into messaging.reports(conversation_id,message_id,reporter_id,reason,evidence)
      values(cid,mid,uid,p_data->>'reason',messaging.message_json(mid,uid));
    insert into messaging.audit(actor_id,action,subject_id) values(uid,'report',cid);return '{}'::jsonb;
  elsif p_action in ('pause','pin','remove','approve','entrants','reports','resolve_report') then
    perform messaging.require_manager(c.event_id);
    if p_action='entrants' then
      return coalesce((select jsonb_agg(jsonb_build_object('id',p.id::text,'name',p.name,'confirmed',messaging.event_access(c.event_id,a.user_id)=2))
        from messaging.accounts a join public.players p on p.id=a.player_id where messaging.event_access(c.event_id,a.user_id)>0),'[]'::jsonb);
    elsif p_action='pause' then
      update messaging.conversations set paused=coalesce((p_data->>'paused')::boolean,true) where event_id=c.event_id and kind='event_discussion';
    elsif p_action='pin' then
      mid:=nullif(p_data->>'messageId','')::uuid;
      if c.kind<>'event_announcements' or (mid is not null and not exists(select 1 from messaging.messages where id=mid and conversation_id=cid and deleted_at is null)) then raise exception 'Choose an announcement from this event.'; end if;
      update messaging.conversations set pinned_id=mid where id=cid;
    elsif p_action='remove' then
      update messaging.messages set body='',card_event_id=null,reply_id=null,deleted_at=clock_timestamp()
        where id=(p_data->>'messageId')::uuid and conversation_id=cid;
    elsif p_action='approve' then
      select user_id into other from messaging.accounts where player_id=(p_data->>'playerId')::bigint;
      if other is null or messaging.event_access(c.event_id,other)=0 then raise exception 'Choose an active event entrant with a messaging account.'; end if;
      insert into messaging.event_approvals(event_id,user_id,approved_by) values(c.event_id,other,uid) on conflict do nothing;
      perform messaging.sync_event(c.event_id);
    elsif p_action='reports' then
      return coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'reason',r.reason,'status',r.status,'evidence',r.evidence,'createdAt',r.created_at))
        from messaging.reports r join messaging.conversations rc on rc.id=r.conversation_id where rc.event_id=c.event_id and rc.kind<>'direct' and r.status='open'),'[]'::jsonb);
    elsif p_action='resolve_report' then
      update messaging.reports r set status='resolved',closed_at=clock_timestamp()
        from messaging.conversations rc where r.id=(p_data->>'reportId')::uuid and rc.id=r.conversation_id and rc.event_id=c.event_id and rc.kind<>'direct';
    end if;
    insert into messaging.audit(actor_id,action,subject_id) values(uid,p_action,cid);
    for other in select user_id from messaging.members where conversation_id=cid and active loop perform messaging.signal(other); end loop;
    return '{}'::jsonb;
  elsif p_action='delete' then
    update messaging.messages set body='',card_event_id=null,reply_id=null,deleted_at=clock_timestamp()
      where id=(p_data->>'messageId')::uuid and conversation_id=cid and sender_id=uid;
    for other in select user_id from messaging.members where conversation_id=cid and active loop perform messaging.signal(other); end loop;
    return '{}'::jsonb;
  elsif p_action='send' then
    if not cfg.sending_enabled or not messaging.interactive(uid) or (c.kind='direct' and c.state<>'accepted') then raise exception 'You cannot send to this conversation.' using errcode='42501'; end if;
    if c.kind='direct' and exists(select 1 from messaging.members where conversation_id=cid and user_id<>uid and not messaging.interactive(user_id)) then raise exception 'This conversation is currently unavailable.' using errcode='42501'; end if;
    if c.kind='event_announcements' then perform messaging.require_manager(c.event_id); end if;
    if c.kind<>'direct' and (not (messaging.conversation_json(cid,uid)->>'canSend')::boolean) then raise exception 'This conversation is read-only.' using errcode='42501'; end if;
    division_ids:=messaging.parse_divisions(c.event_id,p_data->'divisionIds');
    if division_ids is not null and c.kind<>'event_announcements' then raise exception 'Choose an announcements channel for division messages.'; end if;
    select array_agg(d.name order by d.id) into division_names from public.tournament_divisions d where d.event_id=c.event_id and d.id=any(division_ids);
    key:=(p_data->>'clientId')::uuid;
    select * into m from messaging.messages where sender_id=uid and client_id=key;
    if m.id is not null then
      if m.conversation_id<>cid then raise exception 'Message retry belongs to another conversation.'; end if;
      if m.target_division_ids is distinct from division_ids then raise exception 'This message retry has a different audience. Start a new message.'; end if;
      return messaging.message_json(m.id,uid);
    end if;
    body:=btrim(coalesce(p_data->>'body',''));
    if key is null or char_length(body)>4000 or (body='' and nullif(p_data->>'eventId','') is null) then raise exception 'Write a message of up to 4,000 characters.'; end if;
    if (select count(*) from messaging.audit where actor_id=uid and action='send' and created_at>clock_timestamp()-interval '10 seconds')>=20 then raise exception 'You’re sending too quickly. Wait a moment.'; end if;
    -- Plain text only. No third-party content scanning or URL preview fetches.
    if body ~* '(\m(kill yourself|child porn)\M)' then raise exception 'This message could not be sent. Please review the community rules.'; end if;
    mid:=nullif(p_data->>'replyId','')::uuid;
    if mid is not null and (not messaging.visible(mid,uid) or not exists(select 1 from messaging.messages where id=mid and conversation_id=cid and deleted_at is null)) then raise exception 'That reply is no longer available.'; end if;
    event:=nullif(p_data->>'eventId','')::bigint;
    if event is not null and not exists(select 1 from public.calendar where id=event and is_visible=true and (sanction_status is null or sanction_status='approved')) then raise exception 'Choose a published 4M event.'; end if;
    insert into messaging.messages(conversation_id,sender_id,client_id,body,reply_id,card_event_id,card_tab,target_division_ids,target_division_names,expires_at)
      values(cid,uid,key,body,mid,event,coalesce(p_data->>'cardTab','Overview'),division_ids,division_names,case when c.kind='direct' then now()+interval '12 months'
        else (select (coalesce(end_date,start_date)::date+91)::timestamptz from public.calendar where id=c.event_id) end) returning * into m;
    update messaging.conversations set updated_at=clock_timestamp() where id=cid;
    update messaging.members set archived=false where conversation_id=cid and messaging.division_allows(c.event_id,division_ids,user_id);
    insert into messaging.audit(actor_id,action,subject_id) values(uid,'send',cid);
    perform messaging.queue_message(m.id);return messaging.message_json(m.id,uid);
  end if;
  raise exception 'Unsupported messaging action.';
end $$;

create or replace function messaging.queue_message(p_message uuid) returns void language plpgsql security definer set search_path='' set timezone='Africa/Johannesburg' as $$
declare message messaging.messages; conversation messaging.conversations; recipient record;
begin
  select * into message from messaging.messages where id=p_message;
  select * into conversation from messaging.conversations where id=message.conversation_id;
  insert into messaging.deliveries(user_id,conversation_id,message_id,token_id,bucket)
    select member.user_id,message.conversation_id,message.id,token.id,message.seq
    from messaging.members member join messaging.accounts account on account.user_id=member.user_id
    join auth.users u on u.id=member.user_id
    join public.players profile on profile.id=account.player_id
    join public.player_push_tokens token on lower(trim(token.email))=lower(trim(u.email)) and token.token_kind='expo'
    cross join messaging.configuration cfg
    where member.conversation_id=message.conversation_id and member.active and member.user_id is distinct from message.sender_id
      and cfg.enabled and (cardinality(cfg.pilot_player_ids)=0 or account.player_id=any(cfg.pilot_player_ids))
      and messaging.division_allows(conversation.event_id,message.target_division_ids,member.user_id)
      and not member.muted and messaging.notification_policy(conversation.kind,conversation.state,profile.notification_prefs,messaging.is_own_reply(message.reply_id,message.conversation_id,member.user_id))
      and not account.suspended and u.deleted_at is null and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until<now())
    on conflict(user_id,message_id,token_id) do nothing;
  begin perform realtime.send('{}'::jsonb,'inbox_changed','messaging-thread:'||message.conversation_id::text,true); exception when others then null; end;
  if conversation.kind='direct' then
    for recipient in select user_id from messaging.members where conversation_id=message.conversation_id loop perform messaging.signal(recipient.user_id); end loop;
  end if;
  -- pg_net dispatch is asynchronous; the existing cron remains recovery.
  begin perform public.dispatch_push_worker(); exception when others then null; end;
end $$;

create or replace function messaging.delivery_api(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' set timezone='Africa/Johannesburg' as $$
declare job messaging.deliveries; item record; prefs jsonb; due timestamptz; batch jsonb:='[]'; token text;
begin
  if p_action='claim' then
    perform messaging.maintenance();
    for job in select * from messaging.deliveries where state in ('pending','leased','accepted') and available_at<=now()
      order by available_at limit 200 for update skip locked loop
      update messaging.deliveries set state=case when ticket_id is null then 'leased' else 'accepted' end,
        lease_id=gen_random_uuid(),available_at=now()+interval '3 minutes',attempts=attempts+1 where id=job.id returning * into job;
      batch:=batch||jsonb_build_array(jsonb_build_object('id',job.id,'lease',job.lease_id,'ticket',job.ticket_id,'attempts',job.attempts));
    end loop;
    return batch;
  end if;
  select * into job from messaging.deliveries where id=(p_data->>'id')::uuid and lease_id=(p_data->>'lease')::uuid for update;
  if job.id is null then return jsonb_build_object('skip',true); end if;
  if p_action='context' then
    if exists(select 1 from messaging.conversations where id=job.conversation_id and event_id is not null) then
      perform pg_advisory_xact_lock(7021,(select event_id::int from messaging.conversations where id=job.conversation_id));
    end if;
    select to_jsonb(p.notification_prefs) into prefs from public.players p join messaging.accounts a on a.player_id=p.id where a.user_id=job.user_id;
    if not messaging.visible(job.message_id,job.user_id) or job.created_at<now()-interval '24 hours'
      or not exists(select 1 from messaging.messages message join messaging.conversations conversation on conversation.id=message.conversation_id where message.id=job.message_id and messaging.notification_policy(conversation.kind,conversation.state,prefs,messaging.is_own_reply(message.reply_id,message.conversation_id,job.user_id))) or exists(select 1 from messaging.members where conversation_id=job.conversation_id and user_id=job.user_id and muted) then
      update messaging.deliveries set state='skipped' where id=job.id;return jsonb_build_object('skip',true);
    end if;
    due:=public.notification_quiet_until(coalesce(prefs,'{}'));
    if due>now() then update messaging.deliveries set state='pending',available_at=due where id=job.id;return jsonb_build_object('skip',true); end if;
    select t.token into token from public.player_push_tokens t join auth.users u on lower(trim(u.email))=lower(trim(t.email))
      where t.id=job.token_id and u.id=job.user_id and t.token_kind='expo';
    if token is null then update messaging.deliveries set state='skipped' where id=job.id;return jsonb_build_object('skip',true); end if;
    return jsonb_build_object('token',token,'title',coalesce((select left(e.event_name,180) from messaging.conversations c join public.calendar e on e.id=c.event_id where c.id=job.conversation_id),'4M Padel'),
      'body',case when exists(select 1 from messaging.conversations where id=job.conversation_id and kind='event_announcements') then 'New event announcement' else 'You have a new message' end,
      'path','/messages/'||job.conversation_id::text,'badge',least(99999,messaging.unread_total(job.user_id)+coalesce((select pending_count from messaging.badge_cache where user_id=job.user_id),0)));
  elsif p_action='finish' then
    if p_data->>'state' not in ('accepted','sent','skipped','failed','pending') then raise exception 'Invalid delivery state'; end if;
    update messaging.deliveries set state=p_data->>'state',ticket_id=coalesce(p_data->>'ticket',ticket_id),
      attempts=case when p_data->>'state'='accepted' and p_data->>'ticket' is not null then 0 else attempts end,
      available_at=now()+case when p_data->>'state'='accepted' then interval '15 minutes' else interval '1 minute'*least(60,power(2,least(job.attempts,6))) end where id=job.id;
    if p_data->>'unregistered'='true' then delete from public.player_push_tokens t using auth.users u where t.id=job.token_id and u.id=job.user_id and lower(trim(t.email))=lower(trim(u.email)); end if;
    return '{}';
  end if;
  raise exception 'Unsupported delivery action';
end $$;

create or replace function messaging.conversation_json(p_conversation uuid,p_user uuid) returns jsonb language plpgsql stable security definer set search_path='' set timezone='Africa/Johannesburg' as $$
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
    if exists(select 1 from public.calendar e where e.id=c.event_id and (e.event_status='cancelled'
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
    'reason',reason,'manager',is_manager,'paused',c.paused,
    'pinned',case when messaging.visible(c.pinned_id,p_user) then messaging.message_json(c.pinned_id,p_user) end);
end $$;

revoke all on function messaging.notification_policy(text,text,jsonb,boolean),messaging.is_own_reply(uuid,uuid,uuid),messaging.save_alert_preferences(jsonb),messaging.alert_preferences_changed(),messaging.queue_message(uuid),messaging.delivery_api(text,jsonb),messaging.conversation_json(uuid,uuid) from public,anon,authenticated,service_role;
-- Preserve worker and authenticated API boundaries after replacing their bodies.
grant execute on function messaging.delivery_api(text,jsonb) to service_role;
revoke all on function messaging.api(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function messaging.api(text,jsonb) to authenticated;
notify pgrst,'reload schema';
