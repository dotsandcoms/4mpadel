-- Feature-specific rollback switch; existing private and event chats are unaffected.
alter table messaging.configuration add column groups_enabled boolean not null default true;

-- RPC-only groups and official admin conversations. Existing event/private paths retain their contracts.
create table messaging.groups (
  conversation_id uuid primary key references messaging.conversations(id) on delete cascade,
  title text not null check(char_length(title) between 2 and 60),
  creator_id uuid references messaging.accounts(user_id) on delete set null,
  source text not null check(source in ('player_group','admin_group','admin_direct')),
  scope text,
  client_id uuid not null,
  invitation_id uuid references messaging.messages(id) on delete set null,
  recipients uuid[] not null,
  unique(creator_id,client_id),
  check((source='player_group')=(scope is null))
);
create index messaging_groups_creator_scope on messaging.groups(creator_id,scope);
create table messaging.group_members (
  conversation_id uuid not null references messaging.groups(conversation_id) on delete cascade,
  user_id uuid not null references messaging.accounts(user_id) on delete cascade,
  status text not null check(status in ('invited','accepted','left')),
  primary key(conversation_id,user_id)
);
create index messaging_group_members_user on messaging.group_members(user_id,status);
create table messaging.admin_batches (
  actor_id uuid not null references messaging.accounts(user_id) on delete cascade,
  client_id uuid not null,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(actor_id,client_id)
);
alter table messaging.groups enable row level security;
alter table messaging.group_members enable row level security;
alter table messaging.admin_batches enable row level security;
revoke all on messaging.groups,messaging.group_members,messaging.admin_batches from public,anon,authenticated,service_role;
-- Workers also use checked definer RPCs; they need no direct metadata-table privileges.
-- No client policies: authenticated callers use the checked messaging RPC only.

create function messaging.admin_scope(p_scope text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=auth.uid(); org uuid; event bigint;
begin
  if uid is null or auth.jwt()->>'aal' is distinct from 'aal2' then return false; end if;
  if p_scope='platform' then return public.is_super_admin(auth.email()); end if;
  if p_scope~'^event:[1-9][0-9]*$' then return messaging.manager(substring(p_scope from 7)::bigint); end if;
  if p_scope!~'^org:[0-9a-f-]{36}$' then return false; end if;
  org:=substring(p_scope from 5)::uuid;
  return exists(select 1 from public.organisations o where o.id=org and
    (public.is_super_admin(auth.email()) or exists(select 1 from public.organisation_members m where m.organisation_id=o.id and lower(trim(m.user_email))=lower(trim(auth.email())) and m.role in ('owner','admin'))
    or exists(select 1 from public.players p where p.id=o.created_by and lower(trim(p.email))=lower(trim(auth.email())))));
end $$;
create function messaging.scope_player(p_scope text,p_user uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare address text;
begin
  if p_scope='platform' then return true; end if;
  if p_scope~'^event:[1-9][0-9]*$' then return messaging.event_access(substring(p_scope from 7)::bigint,p_user)>0; end if;
  if p_scope~'^org:[0-9a-f-]{36}$' then
    select lower(trim(u.email)) into address from auth.users u join messaging.accounts a on a.user_id=u.id where a.user_id=p_user;
    return exists(select 1 from public.calendar e where e.organisation_id=substring(p_scope from 5)::uuid and e.id in (
      select r.event_id from public.event_registrations r where lower(trim(r.email))=address or lower(trim(r.partner_email))=address
      union select t.event_id from public.tournament_participants t where lower(trim(t.email))=address
    ) and messaging.event_access(e.id,p_user)>0);
  end if;
  return false;
end $$;
create function messaging.group_access(p_conversation uuid,p_user uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare g messaging.groups; member messaging.group_members;
begin
  select * into g from messaging.groups where conversation_id=p_conversation;
  select * into member from messaging.group_members where conversation_id=p_conversation and user_id=p_user;
  if not exists(select 1 from messaging.configuration where groups_enabled) or g.conversation_id is null or member.status is null or member.status='left' or not messaging.enabled_for(p_user) or not messaging.interactive(p_user)
    or not exists(select 1 from messaging.members where conversation_id=p_conversation and user_id=p_user and active) then return false; end if;
  if g.source<>'player_group' then
    if p_user=g.creator_id then
      if not messaging.admin_scope_for(g.scope,p_user) or (p_user=auth.uid() and auth.jwt()->>'aal' is distinct from 'aal2') then return false; end if;
    elsif not messaging.scope_player(g.scope,p_user) then return false; end if;
  end if;
  if member.status='invited' and not exists(select 1 from messaging.messages invitation where invitation.id=g.invitation_id and invitation.deleted_at is null and invitation.expires_at>now()) then return false; end if;
  if member.status='invited' or g.source='admin_direct' then
    if g.creator_id is not null and messaging.blocked(p_user,g.creator_id) then return false; end if;
  end if;
  return true;
end $$;

create or replace function messaging.api_before_groups(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' set timezone='Africa/Johannesburg' as $$
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

create function messaging.can_read_before_groups(p_conversation uuid,p_user uuid) returns boolean language plpgsql stable security definer set search_path='' set timezone='Africa/Johannesburg' as $$
declare c messaging.conversations; member messaging.members; closing date;
begin
  if not messaging.enabled_for(p_user) then return false; end if;
  if not exists(select 1 from messaging.accounts a join auth.users u on u.id=a.user_id where a.user_id=p_user and not a.suspended and u.deleted_at is null) then return false; end if;
  select * into c from messaging.conversations where id=p_conversation;
  if c.id is null then return false; end if;
  if c.kind<>'direct' then
    select coalesce(end_date,start_date)::date into closing from public.calendar where id=c.event_id;
    if closing is null or current_date>closing+90 then return false; end if;
    if p_user=auth.uid() and messaging.manager(c.event_id) and auth.jwt()->>'aal'='aal2' and (c.kind='event_announcements' or messaging.interactive(p_user)) then return true; end if;
  end if;
  select * into member from messaging.members where conversation_id=c.id and user_id=p_user and active;
  if member.user_id is null then return false; end if;
  if c.kind='direct' then
    return c.state<>'declined' and messaging.interactive(p_user) and not exists(select 1 from messaging.members other
      where other.conversation_id=c.id and other.user_id<>p_user and messaging.blocked(p_user,other.user_id));
  end if;
  return messaging.event_access(c.event_id,p_user) >= case when c.kind='event_announcements' then 1 else 2 end
    and (c.kind='event_announcements' or (not member.left_discussion and messaging.interactive(p_user)));
end $$;

create or replace function messaging.visible_before_groups(p_message uuid,p_user uuid) returns boolean language sql stable security definer set search_path='' set timezone='Africa/Johannesburg' as $$
  select exists(select 1 from messaging.messages m join messaging.conversations c on c.id=m.conversation_id
    left join messaging.members member on member.conversation_id=c.id and member.user_id=p_user
    where m.id=p_message and m.expires_at>now() and messaging.can_read(c.id,p_user)
    and (m.target_division_ids is null or (p_user=auth.uid() and messaging.manager(c.event_id) and auth.jwt()->>'aal'='aal2') or messaging.division_allows(c.event_id,m.target_division_ids,p_user))
    and (c.kind<>'event_discussion' or (p_user=auth.uid() and messaging.manager(c.event_id) and auth.jwt()->>'aal'='aal2')
      or m.created_at>=member.eligible_from)
    and (c.kind<>'event_discussion' or m.sender_id is null or not messaging.blocked(p_user,m.sender_id)))
$$;

create or replace function messaging.message_json_before_groups(p_message uuid,p_user uuid) returns jsonb language sql stable security definer set search_path='' set timezone='Africa/Johannesburg' as $$
  select jsonb_build_object('id',m.id,'seq',m.seq,'body',case when m.deleted_at is null then m.body else '' end,
    'mine',m.sender_id=p_user,'sender',jsonb_build_object('id',p.id::text,'name',coalesce(p.name,'Former player'),'image',p.image_url,'role',m.sender_role),
    'audience',case when c.kind='event_announcements' then jsonb_build_object('all',m.target_division_ids is null,'divisions',coalesce(to_jsonb(m.target_division_names),'[]'::jsonb)) end,
    'createdAt',m.created_at,'deleted',m.deleted_at is not null,
    'reply',case when m.deleted_at is null and r.deleted_at is null and r.conversation_id=m.conversation_id and messaging.visible(r.id,p_user) then
      jsonb_build_object('id',r.id,'body',left(r.body,160),'name',coalesce(rp.name,'Former player'),'role',r.sender_role,'mine',r.sender_id=p_user) end,
    'card',case when m.deleted_at is null and e.id is not null and e.is_visible=true and (e.sanction_status is null or e.sanction_status='approved') then
      jsonb_build_object('eventId',e.id,'title',e.event_name,'date',e.start_date,'tab',coalesce(m.card_tab,'Overview')) end)
  from messaging.messages m join messaging.conversations c on c.id=m.conversation_id left join messaging.accounts a on a.user_id=m.sender_id left join public.players p on p.id=a.player_id
    left join messaging.messages r on r.id=m.reply_id left join messaging.accounts ra on ra.user_id=r.sender_id
    left join public.players rp on rp.id=ra.player_id left join public.calendar e on e.id=m.card_event_id
  where m.id=p_message and messaging.visible(m.id,p_user)
$$;

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

create or replace function messaging.queue_message_before_groups(p_message uuid) returns void language plpgsql security definer set search_path='' set timezone='Africa/Johannesburg' as $$
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

create function messaging.realtime_can_read_before_groups(p_topic text) returns boolean language plpgsql security definer set search_path='' as $$
declare uid uuid;
begin
  if p_topic !~ '^messaging-thread:[0-9a-fA-F-]{36}$' then return false; end if;
  uid:=messaging.actor();
  return messaging.can_read(substring(p_topic from 18)::uuid,uid);
exception when others then return false;
end $$;

create or replace function messaging.can_read(p_conversation uuid,p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
  select case when exists(select 1 from messaging.groups where conversation_id=p_conversation) then messaging.group_access(p_conversation,p_user) else messaging.can_read_before_groups(p_conversation,p_user) end
$$;
create or replace function messaging.visible(p_message uuid,p_user uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare m messaging.messages; g messaging.groups; state text; joined timestamptz;
begin
  select * into m from messaging.messages where id=p_message;
  select * into g from messaging.groups where conversation_id=m.conversation_id;
  if g.conversation_id is null then return messaging.visible_before_groups(p_message,p_user); end if;
  if m.expires_at<=now() or not messaging.group_access(g.conversation_id,p_user) then return false; end if;
  select gm.status,mm.eligible_from into state,joined from messaging.group_members gm join messaging.members mm using(conversation_id,user_id) where gm.conversation_id=g.conversation_id and gm.user_id=p_user;
  return (m.id=g.invitation_id or (state='accepted' and m.created_at>=joined)) and (m.sender_id is null or not messaging.blocked(p_user,m.sender_id));
end $$;
create or replace function messaging.message_json(p_message uuid,p_user uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; g messaging.groups;
begin
  result:=messaging.message_json_before_groups(p_message,p_user);
  select g0.* into g from messaging.groups g0 join messaging.messages m on m.conversation_id=g0.conversation_id where m.id=p_message;
  if g.conversation_id is not null and result is not null then
    result:=jsonb_set(result,'{sender,role}',to_jsonb(case when g.source<>'player_group' and exists(select 1 from messaging.messages where id=p_message and sender_id=g.creator_id) then 'admin' else 'player' end));
    if result->'reply' is not null and result->'reply'<>'null'::jsonb then
      result:=jsonb_set(result,'{reply,role}',to_jsonb(case when g.source<>'player_group' and exists(select 1 from messaging.messages posted join messaging.messages quoted on quoted.id=posted.reply_id where posted.id=p_message and quoted.sender_id=g.creator_id) then 'admin' else 'player' end));
    end if;
  end if;
  return result;
end $$;
create or replace function messaging.conversation_json(p_conversation uuid,p_user uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare g messaging.groups; gm messaging.group_members; mm messaging.members; result jsonb; last_message jsonb; unread int; title text; photo text; prefs jsonb; alert_message jsonb;
begin
  select * into g from messaging.groups where conversation_id=p_conversation;
  if g.conversation_id is null then return messaging.conversation_json_before_groups(p_conversation,p_user); end if;
  if not messaging.group_access(p_conversation,p_user) then return null; end if;
  select * into gm from messaging.group_members where conversation_id=p_conversation and user_id=p_user;
  select * into mm from messaging.members where conversation_id=p_conversation and user_id=p_user;
  title:=g.title;
  if g.source='admin_direct' then
    select p.name,p.image_url into title,photo from messaging.group_members member join messaging.accounts a on a.user_id=member.user_id join public.players p on p.id=a.player_id where member.conversation_id=p_conversation and member.user_id<>p_user;
  end if;
  select messaging.message_json(m.id,p_user) into last_message from messaging.messages m where m.conversation_id=p_conversation and messaging.visible(m.id,p_user) order by m.seq desc limit 1;
  select count(*) into unread from messaging.messages m where m.conversation_id=p_conversation and (m.seq>mm.read_seq or (mm.marked_unread_from is not null and m.seq>=mm.marked_unread_from)) and m.sender_id is distinct from p_user and m.deleted_at is null and messaging.visible(m.id,p_user);
  select coalesce(p.notification_prefs,'{}') into prefs from public.players p join messaging.accounts a on a.player_id=p.id where a.user_id=p_user;
  if not mm.muted and not mm.archived and public.notification_quiet_until(prefs)<=now() then
    select jsonb_build_object('id',m.id,'seq',m.seq,'reply',messaging.is_own_reply(m.reply_id,p_conversation,p_user)) into alert_message from messaging.messages m where m.conversation_id=p_conversation and m.seq>mm.read_seq and m.sender_id is distinct from p_user and m.deleted_at is null and messaging.visible(m.id,p_user)
      and messaging.notification_policy('direct',case when gm.status='invited' then 'pending' else 'accepted' end,prefs,messaging.is_own_reply(m.reply_id,p_conversation,p_user)) order by m.seq desc limit 1;
  end if;
  return jsonb_build_object('id',p_conversation,'kind',case when g.source='admin_direct' then 'direct' else 'group' end,'eventId',null,'title',coalesce(title,g.title),'image',photo,
    'state',case when gm.status='invited' then 'pending' else 'accepted' end,'incoming',p_user is distinct from g.creator_id,'muted',mm.muted,'archived',mm.archived,'unread',unread,
    'preview',coalesce(nullif(last_message->>'body',''),''),'lastMessageId',last_message->>'id','lastMessageSeq',last_message->'seq','lastMessageMine',last_message->'mine',
    'notificationMessageId',alert_message->>'id','notificationSeq',alert_message->'seq','notificationIsReply',coalesce((alert_message->>'reply')::boolean,false),
    'updatedAt',coalesce(last_message->>'createdAt',(select created_at::text from messaging.conversations where id=p_conversation)),
    'canSend',gm.status='accepted' and exists(select 1 from messaging.configuration where sending_enabled) and (g.source<>'admin_direct' or exists(select 1 from messaging.group_members peer where peer.conversation_id=p_conversation and peer.user_id<>p_user and peer.status='accepted' and messaging.group_access(p_conversation,peer.user_id))),'reason',case when gm.status='invited' then 'Accept the invitation to join this conversation.' when g.source='admin_direct' and exists(select 1 from messaging.group_members peer where peer.conversation_id=p_conversation and peer.status='invited') then 'Waiting for the player to accept your invitation.' end,
    'manager',false,'paused',false,'pinned',null,'group',g.source<>'admin_direct','official',g.source<>'player_group','scope',case when p_user=g.creator_id then g.scope end,
    'organisation',case when g.source='admin_direct' then g.title when g.scope='platform' then '4M Padel' when g.scope like 'org:%' then (select o.name from public.organisations o where o.id=substring(g.scope from 5)::uuid) end,
    'memberCount',(select count(*) from messaging.group_members where conversation_id=p_conversation and status='accepted'));
end $$;
create or replace function messaging.realtime_can_read(p_topic text) returns boolean language plpgsql security definer set search_path='' as $$
declare uid uuid:=messaging.actor(); cid uuid;
begin
  if p_topic~'^messaging-thread:[0-9a-f-]{36}$' then
    cid:=substring(p_topic from 18)::uuid;
    if exists(select 1 from messaging.groups where conversation_id=cid) then
      return messaging.group_access(cid,uid) and exists(select 1 from messaging.group_members where conversation_id=cid and user_id=uid and status='accepted');
    end if;
  end if;
  return messaging.realtime_can_read_before_groups(p_topic);
end $$;
create or replace function messaging.queue_message(p_message uuid) returns void language plpgsql security definer set search_path='' as $$
declare m messaging.messages; g messaging.groups; recipient record;
begin
  select * into m from messaging.messages where id=p_message;
  select * into g from messaging.groups where conversation_id=m.conversation_id;
  if g.conversation_id is null then perform messaging.queue_message_before_groups(p_message);return; end if;
  insert into messaging.deliveries(user_id,conversation_id,message_id,token_id,bucket)
    select gm.user_id,m.conversation_id,m.id,t.id,m.seq from messaging.group_members gm join messaging.members mm using(conversation_id,user_id) join messaging.accounts a on a.user_id=gm.user_id join auth.users u on u.id=a.user_id join public.players p on p.id=a.player_id
      join public.player_push_tokens t on lower(trim(t.email))=lower(trim(u.email)) and t.token_kind='expo'
    where gm.conversation_id=m.conversation_id and gm.user_id is distinct from m.sender_id and mm.active and not mm.muted and not mm.archived
      and messaging.visible(m.id,gm.user_id) and messaging.notification_policy('direct',case when gm.status='invited' then 'pending' else 'accepted' end,p.notification_prefs,messaging.is_own_reply(m.reply_id,m.conversation_id,gm.user_id))
    on conflict(user_id,message_id,token_id) do nothing;
  for recipient in select user_id from messaging.group_members where conversation_id=m.conversation_id and (status='accepted' or (status='invited' and m.id=g.invitation_id)) loop perform messaging.signal(recipient.user_id); end loop;
  begin perform public.dispatch_push_worker(); exception when others then null; end;
end $$;

create or replace function messaging.create_group(p_data jsonb,p_source text,p_scope text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=messaging.actor(); ids bigint[]; users uuid[]; other uuid; cid uuid; key uuid; title text; body text; g messaging.groups; m messaging.messages; pair text;
begin
  if not exists(select 1 from messaging.configuration where enabled and sending_enabled and requests_enabled and groups_enabled) or not messaging.interactive(uid) then raise exception 'Complete messaging setup before creating a conversation.' using errcode='42501'; end if;
  if p_source not in ('player_group','admin_group','admin_direct') or (p_source<>'player_group' and not messaging.admin_scope(p_scope)) then raise exception 'Messaging access denied.' using errcode='42501'; end if;
  if jsonb_typeof(p_data->'playerIds') is distinct from 'array' or jsonb_array_length(p_data->'playerIds') not between 1 and 19 then raise exception 'Choose up to 19 players for a group.'; end if;
  select array_agg(distinct v::bigint order by v::bigint) into ids from jsonb_array_elements_text(p_data->'playerIds') v;
  if cardinality(ids)<(case when p_source='admin_direct' then 1 else 2 end) then raise exception 'Choose at least two players for a group.'; end if;
  key:=(p_data->>'clientId')::uuid;title:=btrim(p_data->>'title');body:=btrim(p_data->>'body');
  if key is null or title is null or char_length(title) not between 2 and 60 or body is null or char_length(body) not between 1 and 300 then raise exception 'Write a group name and an introduction of up to 300 characters.'; end if;
  if body ~* '(\m(kill yourself|child porn)\M)' then raise exception 'This message could not be sent. Please review the community rules.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,7050));
  select array_agg(a.user_id order by a.user_id) into users from messaging.accounts a where a.player_id=any(ids) and a.user_id<>uid and a.allow_requests and messaging.interactive(a.user_id) and not messaging.blocked(uid,a.user_id)
    and (p_source='player_group' or messaging.scope_player(p_scope,a.user_id));
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
      if not messaging.group_access(cid,users[1]) or exists(select 1 from messaging.group_members where conversation_id=cid and user_id=users[1] and status='left') then raise exception 'Messaging is unavailable for this player.' using errcode='42501'; end if;
      if exists(select 1 from messaging.group_members where conversation_id=cid and user_id=users[1] and status='invited') then return jsonb_build_object('id',cid,'status','waiting'); end if;
      perform messaging.group_api('send',jsonb_build_object('conversationId',cid,'body',body,'clientId',key));
      return jsonb_build_object('id',cid,'status','sent');
    end if;
  end if;
  insert into messaging.conversations(kind,pair_key,requester) values('direct',pair,uid) returning id into cid;
  insert into messaging.groups(conversation_id,title,creator_id,source,scope,client_id,recipients) values(cid,title,uid,p_source,p_scope,key,users);
  insert into messaging.group_members(conversation_id,user_id,status) values(cid,uid,'accepted');
  insert into messaging.group_members(conversation_id,user_id,status) select cid,value,'invited' from unnest(users) value;
  insert into messaging.members(conversation_id,user_id) select cid,value from unnest(users||uid) value;
  insert into messaging.messages(conversation_id,sender_id,client_id,body,expires_at) values(cid,uid,key,body,now()+interval '12 months') returning * into m;
  update messaging.groups set invitation_id=m.id where conversation_id=cid;
  insert into messaging.audit(actor_id,action,subject_id) values(uid,'group_create',cid);
  perform messaging.queue_message(m.id);
  return jsonb_build_object('id',cid,'status','requested');
end $$;

create or replace function messaging.group_api(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=messaging.actor(); cid uuid:=(p_data->>'conversationId')::uuid; g messaging.groups; state text; m messaging.messages; key uuid; body text; reply uuid; other uuid; answer text;
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
    key:=(p_data->>'clientId')::uuid;body:=btrim(p_data->>'body');reply:=nullif(p_data->>'replyId','')::uuid;
    if key is null or body is null or char_length(body) not between 1 and 4000 or nullif(p_data->>'eventId','') is not null then raise exception 'Write a message of up to 4,000 characters.'; end if;
    select * into m from messaging.messages where sender_id=uid and client_id=key;
    if m.id is not null then
      if m.conversation_id<>cid or m.body<>body or m.reply_id is distinct from reply then raise exception 'This message retry has different content.'; end if;
      return messaging.message_json(m.id,uid);
    end if;
    if (select count(*) from messaging.audit where actor_id=uid and action='send' and created_at>clock_timestamp()-interval '10 seconds')>=20 then raise exception 'You’re sending too quickly. Wait a moment.'; end if;
    if body ~* '(\m(kill yourself|child porn)\M)' then raise exception 'This message could not be sent. Please review the community rules.'; end if;
    if reply is not null and (not messaging.visible(reply,uid) or not exists(select 1 from messaging.messages where id=reply and conversation_id=cid and deleted_at is null)) then raise exception 'That reply is no longer available.'; end if;
    insert into messaging.messages(conversation_id,sender_id,client_id,body,reply_id,expires_at) values(cid,uid,key,body,reply,now()+interval '12 months') returning * into m;
    update messaging.conversations set updated_at=clock_timestamp() where id=cid;
    update messaging.members set archived=false where conversation_id=cid and user_id in (select user_id from messaging.group_members where conversation_id=cid and status='accepted');
    insert into messaging.audit(actor_id,action,subject_id) values(uid,'send',cid);perform messaging.queue_message(m.id);
    return messaging.message_json(m.id,uid);
  elsif p_action not in ('read','mark_read','member_settings','report','delete') then raise exception 'This conversation action is unavailable.'; end if;
  return messaging.api_before_groups(p_action,p_data);
end $$;

create function messaging.admin_scope_for(p_scope text,p_user uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare address text; event bigint;
begin
  select lower(trim(u.email)) into address from auth.users u join messaging.accounts a on a.user_id=u.id where u.id=p_user and not a.suspended and u.deleted_at is null and (u.banned_until is null or u.banned_until<now());
  if address is null then return false; end if;
  if p_scope='platform' then return public.is_super_admin(address); end if;
  if p_scope~'^org:[0-9a-f-]{36}$' then
    return exists(select 1 from public.organisations o where o.id=substring(p_scope from 5)::uuid and (public.is_super_admin(address)
      or exists(select 1 from public.organisation_members m where m.organisation_id=o.id and lower(trim(m.user_email))=address and m.role in ('owner','admin'))
      or exists(select 1 from public.players p where p.id=o.created_by and lower(trim(p.email))=address)));
  end if;
  if p_scope~'^event:[1-9][0-9]*$' then
    event:=substring(p_scope from 7)::bigint;
    if p_user=auth.uid() then return messaging.manager(event); end if;
    return exists(select 1 from public.calendar e where e.id=event and (public.is_super_admin(address) or lower(trim(e.organiser_email))=address
      or address=any(select lower(trim(value)) from unnest(e.event_co_admins) value)
      or messaging.admin_scope_for('org:'||e.organisation_id::text,p_user)
      or exists(select 1 from public.admin_sidebar_permissions permission where lower(trim(permission.email))=address and coalesce(permission.module_permissions->'event-mgmt'->'allowedEvents','[]') @> jsonb_build_array(event))));
  end if;
  return false;
end $$;
create or replace function messaging.admin_scope(p_scope text) returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and coalesce(auth.jwt()->>'aal','')='aal2' and messaging.admin_scope_for(p_scope,auth.uid())
$$;

create or replace function messaging.api(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
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
      union all select jsonb_build_object('id','org:'||o.id::text,'label',o.name) from public.organisations o where messaging.admin_scope('org:'||o.id::text)
      union all select jsonb_build_object('id','event:'||e.id::text,'label','Event audience · '||e.event_name) from public.calendar e where messaging.admin_scope('event:'||e.id::text)
        and (e.organisation_id is null or not messaging.admin_scope('org:'||e.organisation_id::text))
    ) scopes;
    return result;
  end if;
  scope:=p_data->>'scope';
  if not messaging.admin_scope(scope) then raise exception 'Messaging access denied for this organisation or audience.' using errcode='42501'; end if;
  if p_action='admin_players' then
    query:=btrim(coalesce(p_data->>'query',''));
    if char_length(query)<2 then return '[]'; end if;
    if char_length(query)>120 then raise exception 'Choose a shorter player search.'; end if;
    select coalesce(jsonb_agg(item),'[]') into result from (
      select jsonb_build_object('id',p.id::text,'name',p.name,'image_url',p.image_url,'home_club',to_jsonb(p)->>'home_club') item
      from messaging.accounts a join public.players p on p.id=a.player_id where a.user_id<>uid and a.allow_requests and messaging.interactive(a.user_id)
        and messaging.scope_player(scope,a.user_id) and not messaging.blocked(uid,a.user_id) and position(lower(query) in lower(p.name))>0 order by p.name,p.id limit 40
    ) players;
    return result;
  elsif p_action='admin_inbox' then
    return coalesce((select jsonb_agg(item order by item->>'updatedAt' desc) from (
      select messaging.conversation_json(g.conversation_id,uid) item from messaging.groups g join messaging.conversations conv on conv.id=g.conversation_id where g.creator_id=uid and g.scope=scope and g.source<>'player_group' and messaging.group_access(g.conversation_id,uid) order by conv.updated_at desc limit 100
    ) conversations),'[]');
  end if;
  if not exists(select 1 from messaging.configuration where sending_enabled and requests_enabled) then raise exception 'Messaging is currently read-only.' using errcode='42501'; end if;
  mode:=coalesce(p_data->>'mode','private');
  if mode not in ('private','group') then raise exception 'Choose private messages or a group chat.'; end if;
  if jsonb_typeof(p_data->'playerIds') is distinct from 'array' or jsonb_array_length(p_data->'playerIds') not between 1 and 50 then raise exception 'Choose up to 50 players per private send.'; end if;
  select array_agg(distinct v::bigint order by v::bigint) into ids from jsonb_array_elements_text(p_data->'playerIds') v;
  if exists(select 1 from unnest(ids) wanted where not exists(select 1 from messaging.accounts a where a.player_id=wanted and a.user_id<>uid and a.allow_requests and messaging.interactive(a.user_id) and messaging.scope_player(scope,a.user_id) and not messaging.blocked(uid,a.user_id))) then raise exception 'Messaging is unavailable for one or more selected players.' using errcode='42501'; end if;
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
      or not exists(select 1 from messaging.messages message join messaging.conversations conversation on conversation.id=message.conversation_id where message.id=job.message_id and messaging.notification_policy(conversation.kind,case when exists(select 1 from messaging.group_members gm where gm.conversation_id=conversation.id and gm.user_id=job.user_id and gm.status='invited') then 'pending' else conversation.state end,prefs,messaging.is_own_reply(message.reply_id,message.conversation_id,job.user_id))) or exists(select 1 from messaging.members where conversation_id=job.conversation_id and user_id=job.user_id and muted) then
      update messaging.deliveries set state='skipped' where id=job.id;return jsonb_build_object('skip',true);
    end if;
    due:=public.notification_quiet_until(coalesce(prefs,'{}'));
    if due>now() then update messaging.deliveries set state='pending',available_at=due where id=job.id;return jsonb_build_object('skip',true); end if;
    select t.token into token from public.player_push_tokens t join auth.users u on lower(trim(u.email))=lower(trim(t.email))
      where t.id=job.token_id and u.id=job.user_id and t.token_kind='expo';
    if token is null then update messaging.deliveries set state='skipped' where id=job.id;return jsonb_build_object('skip',true); end if;
    return jsonb_build_object('token',token,'title',coalesce((select left(g.title,180) from messaging.groups g where g.conversation_id=job.conversation_id and g.source='admin_direct'),(select left(e.event_name,180) from messaging.conversations c join public.calendar e on e.id=c.event_id where c.id=job.conversation_id),'4M Padel'),
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
create or replace function messaging.remove_account_content() returns trigger language plpgsql security definer set search_path='' set timezone='Africa/Johannesburg' as $$
begin
  update messaging.groups set recipients=array_remove(recipients,old.user_id);
  update messaging.messages set body='',card_event_id=null,reply_id=null,deleted_at=clock_timestamp() where sender_id=old.user_id;
  update messaging.conversations conv set pair_key=null,state=case when state='pending' then 'declined' else state end
    where conv.kind='direct' and exists(select 1 from messaging.members member where member.conversation_id=conv.id and member.user_id=old.user_id);
  return old;
end $$;
create or replace function messaging.maintenance() returns void language plpgsql security definer set search_path='' set timezone='Africa/Johannesburg' as $$
begin
  delete from messaging.admin_batches where created_at<now()-interval '12 months';
  delete from messaging.messages where expires_at<=now();
  delete from messaging.conversations c using public.calendar e where e.id=c.event_id and current_date>coalesce(e.end_date,e.start_date)::date+90;
  delete from messaging.guardian_consents where consented_at is null and expires_at<now()-interval '7 days';
  delete from messaging.reports where not legal_hold and closed_at<now()-interval '180 days';
  delete from messaging.audit where created_at<now()-interval '12 months';
  delete from messaging.deliveries where created_at<now()-interval '2 days';
end $$;

revoke all on function messaging.admin_scope(text),messaging.scope_player(text,uuid),messaging.group_access(uuid,uuid),messaging.api_before_groups(text,jsonb),messaging.can_read_before_groups(uuid,uuid),messaging.visible_before_groups(uuid,uuid),messaging.message_json_before_groups(uuid,uuid),messaging.conversation_json_before_groups(uuid,uuid),messaging.queue_message_before_groups(uuid),messaging.realtime_can_read_before_groups(text),messaging.can_read(uuid,uuid),messaging.visible(uuid,uuid),messaging.message_json(uuid,uuid),messaging.conversation_json(uuid,uuid),messaging.realtime_can_read(text),messaging.queue_message(uuid),messaging.create_group(jsonb,text,text),messaging.group_api(text,jsonb),messaging.admin_scope_for(text,uuid),messaging.api(text,jsonb),messaging.delivery_api(text,jsonb),messaging.remove_account_content(),messaging.maintenance() from public,anon,authenticated,service_role;
grant execute on function messaging.api(text,jsonb),messaging.realtime_can_read(text) to authenticated;
grant execute on function messaging.delivery_api(text,jsonb) to service_role;
notify pgrst,'reload schema';
