-- One message broadcast per conversation, plus a set-based durable push fanout.
-- No browser/native role can send on either private topic family.
create function messaging.realtime_can_read(p_topic text) returns boolean language plpgsql security definer set search_path='' as $$
declare uid uuid;
begin
  if p_topic !~ '^messaging-thread:[0-9a-fA-F-]{36}$' then return false; end if;
  uid:=messaging.actor();
  return messaging.can_read(substring(p_topic from 18)::uuid,uid);
exception when others then return false;
end $$;
revoke all on function messaging.realtime_can_read(text) from public,anon,authenticated,service_role;
grant execute on function messaging.realtime_can_read(text) to authenticated;
create policy "Messaging conversation receive" on realtime.messages for select to authenticated
  using(extension='broadcast' and messaging.realtime_can_read(realtime.topic()));
create policy "Messaging conversation boundary" on realtime.messages as restrictive for select to authenticated
  using(realtime.topic() not like 'messaging-thread:%' or (extension='broadcast' and messaging.realtime_can_read(realtime.topic())));
create policy "Messaging conversations server only" on realtime.messages as restrictive for insert to authenticated
  with check(realtime.topic() not like 'messaging-thread:%');

-- Cached Pending-action counts are invalidated by their source rows. They are
-- not recalculated for every chat push or polled by every connected client.
create table messaging.badge_cache (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pending_count integer not null default 0 check(pending_count between 0 and 100000),
  revision bigint not null default 0,
  calculated_revision bigint not null default -1,
  updated_at timestamptz
);
alter table messaging.badge_cache enable row level security;
revoke all on messaging.badge_cache from public,anon,authenticated,service_role;
grant select,insert,update,delete on messaging.badge_cache to service_role;

create table messaging.push_budget (
  singleton boolean primary key default true check(singleton),
  window_started timestamptz not null default clock_timestamp(),
  reserved integer not null default 0
);
insert into messaging.push_budget(singleton) values(true);
alter table messaging.push_budget enable row level security;
revoke all on messaging.push_budget from public,anon,authenticated,service_role;
grant select,insert,update,delete on messaging.push_budget to service_role;

create function messaging.badge_cache_api(p_action text,p_email text,p_count integer default null,p_revision bigint default null) returns jsonb language plpgsql security definer set search_path='' set timezone='Africa/Johannesburg' as $$
declare uid uuid; cached messaging.badge_cache;
begin
  select id into uid from auth.users where lower(trim(email))=lower(trim(p_email)) and email_confirmed_at is not null
    and deleted_at is null and (banned_until is null or banned_until<now());
  if uid is null then return jsonb_build_object('pending',0,'valid',false,'revision',0,'total',0); end if;
  insert into messaging.badge_cache(user_id) values(uid) on conflict do nothing;
  if p_action='store' then
    if p_count is null or p_count<0 or p_count>100000 then raise exception 'Invalid badge count'; end if;
    update messaging.badge_cache set pending_count=p_count,calculated_revision=revision,updated_at=clock_timestamp()
      where user_id=uid and revision=p_revision;
  elsif p_action not in ('get','cached') then raise exception 'Unsupported badge action'; end if;
  select * into cached from messaging.badge_cache where user_id=uid;
  return jsonb_build_object('pending',cached.pending_count,'revision',cached.revision,
    'valid',cached.calculated_revision=cached.revision and cached.updated_at::date=current_date,
    'total',least(99999,messaging.unread_total(uid)+cached.pending_count));
end $$;
create function public.app_badge_cache(p_action text,p_email text,p_count integer default null,p_revision bigint default null) returns jsonb
language sql security invoker set search_path='' as $$ select messaging.badge_cache_api(p_action,p_email,p_count,p_revision) $$;
revoke all on function messaging.badge_cache_api(text,text,integer,bigint),public.app_badge_cache(text,text,integer,bigint) from public,anon,authenticated,service_role;
grant execute on function messaging.badge_cache_api(text,text,integer,bigint),public.app_badge_cache(text,text,integer,bigint) to service_role;

create function messaging.invalidate_badge() returns trigger language plpgsql security definer set search_path='' as $$
declare before_row jsonb:=case when tg_op<>'INSERT' then to_jsonb(old) else '{}'::jsonb end;
  after_row jsonb:=case when tg_op<>'DELETE' then to_jsonb(new) else '{}'::jsonb end; affected record; event_ids bigint[];
begin
  if tg_table_name='players' and tg_op='UPDATE'
    and jsonb_build_array(before_row->'region',before_row->'racket_brand',before_row->'email')=jsonb_build_array(after_row->'region',after_row->'racket_brand',after_row->'email') then return null; end if;
  if tg_table_name='calendar' and tg_op='UPDATE'
    and jsonb_build_array(before_row->'entry_fee',before_row->'early_bird_fee',before_row->'early_bird_ends_at',before_row->'start_date')=jsonb_build_array(after_row->'entry_fee',after_row->'early_bird_fee',after_row->'early_bird_ends_at',after_row->'start_date') then return null; end if;
  if tg_table_name='tournament_divisions' and tg_op='UPDATE' and before_row->'entry_fee' is not distinct from after_row->'entry_fee' then return null; end if;
  if tg_table_name in ('calendar','tournament_divisions','payments') then
    event_ids:=array[nullif(case when tg_table_name='calendar' then before_row->>'id' else before_row->>'event_id' end,'')::bigint,
      nullif(case when tg_table_name='calendar' then after_row->>'id' else after_row->>'event_id' end,'')::bigint];
  end if;
  for affected in update messaging.badge_cache cache set revision=revision+1 from auth.users u
    where cache.user_id=u.id and (
      lower(trim(u.email))=any(array[lower(trim(before_row->>'email')),lower(trim(after_row->>'email')),lower(trim(before_row->>'partner_email')),lower(trim(after_row->>'partner_email'))])
      or exists(select 1 from public.event_registrations r where r.event_id=any(event_ids)
        and (lower(trim(r.email))=lower(trim(u.email)) or lower(trim(r.partner_email))=lower(trim(u.email))))) returning cache.user_id loop
    perform messaging.signal(affected.user_id);
  end loop;
  return null;
end $$;
create trigger messaging_badge_profile after update on public.players for each row execute function messaging.invalidate_badge();
create trigger messaging_badge_registration after insert or update or delete on public.event_registrations for each row execute function messaging.invalidate_badge();
create trigger messaging_badge_payment after insert or update or delete on public.payments for each row execute function messaging.invalidate_badge();
create trigger messaging_badge_event after update on public.calendar for each row execute function messaging.invalidate_badge();
create trigger messaging_badge_division after update on public.tournament_divisions for each row execute function messaging.invalidate_badge();
revoke all on function messaging.invalidate_badge() from public,anon,authenticated,service_role;

create index if not exists messaging_registration_email on public.event_registrations(event_id,lower(trim(email)));
create index if not exists messaging_registration_partner on public.event_registrations(event_id,lower(trim(partner_email)));
create index if not exists messaging_import_email on public.tournament_participants(event_id,lower(trim(email)));

-- A registration edit touches only the affected identities, not every entrant.
create or replace function messaging.event_changed() returns trigger language plpgsql security definer set search_path='' as $$
declare before_row jsonb:=case when tg_op<>'INSERT' then to_jsonb(old) else '{}'::jsonb end;
  after_row jsonb:=case when tg_op<>'DELETE' then to_jsonb(new) else '{}'::jsonb end; affected record; event bigint;
begin
  for event in select distinct id from unnest(array[nullif(before_row->>'event_id','')::bigint,nullif(after_row->>'event_id','')::bigint]) id where id is not null loop
    if exists(select 1 from messaging.conversations where event_id=event) then
      for affected in select a.user_id from messaging.accounts a join auth.users u on u.id=a.user_id
        where lower(trim(u.email))=any(array[lower(trim(before_row->>'email')),lower(trim(after_row->>'email')),lower(trim(before_row->>'partner_email')),lower(trim(after_row->>'partner_email'))]) loop
        perform messaging.sync_member(event,affected.user_id);
        perform messaging.signal(affected.user_id);
      end loop;
    end if;
  end loop;
  return null;
end $$;
revoke all on function messaging.event_changed() from public,anon,authenticated,service_role;

create function messaging.message_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform realtime.send('{}'::jsonb,'inbox_changed','messaging-thread:'||new.conversation_id::text,true);
  return null;
exception when others then return null;
end $$;
create trigger messaging_message_changed after update of body,deleted_at,card_event_id,reply_id on messaging.messages for each row execute function messaging.message_changed();
revoke all on function messaging.message_changed() from public,anon,authenticated,service_role;

-- One durable device job per message; do not lose later message badge updates
-- simply because another message was sent in the same thirty-second bucket.
alter table messaging.deliveries drop constraint if exists deliveries_user_id_conversation_id_token_id_bucket_key;
create unique index messaging_delivery_message_device on messaging.deliveries(user_id,message_id,token_id);
create or replace function messaging.queue_message(p_message uuid) returns void language plpgsql security definer set search_path='' set timezone='Africa/Johannesburg' as $$
declare message messaging.messages; conversation messaging.conversations; recipient record;
begin
  select * into message from messaging.messages where id=p_message;
  select * into conversation from messaging.conversations where id=message.conversation_id;
  insert into messaging.deliveries(user_id,conversation_id,message_id,token_id,bucket)
    select member.user_id,message.conversation_id,message.id,token.id,message.seq
    from messaging.members member join messaging.accounts account on account.user_id=member.user_id
    join auth.users u on u.id=member.user_id
    join public.player_push_tokens token on lower(trim(token.email))=lower(trim(u.email)) and token.token_kind='expo'
    cross join messaging.configuration cfg
    where member.conversation_id=message.conversation_id and member.active and member.user_id is distinct from message.sender_id
      and cfg.enabled and (cardinality(cfg.pilot_player_ids)=0 or account.player_id=any(cfg.pilot_player_ids))
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
revoke all on function messaging.queue_message(uuid) from public,anon,authenticated,service_role;

create function messaging.membership_signal() returns trigger language plpgsql security definer set search_path='' as $$
declare author record;
begin
  perform messaging.signal(new.user_id);
  if new.read_seq>old.read_seq then
    for author in select distinct m.sender_id from messaging.messages m join messaging.conversations c on c.id=m.conversation_id
      where c.id=new.conversation_id and c.kind='event_announcements' and m.seq>old.read_seq and m.seq<=new.read_seq and m.sender_id is not null loop
      perform messaging.signal(author.sender_id);
    end loop;
  end if;
  return null;
end $$;
create trigger messaging_member_signal after update on messaging.members for each row
  when (old.active is distinct from new.active or old.read_seq is distinct from new.read_seq or old.archived is distinct from new.archived or old.muted is distinct from new.muted or old.left_discussion is distinct from new.left_discussion or old.marked_unread_from is distinct from new.marked_unread_from)
  execute function messaging.membership_signal();
revoke all on function messaging.membership_signal() from public,anon,authenticated,service_role;

create function messaging.snapshot(p_previews boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare status jsonb:=messaging.api('status'); rows jsonb;
begin
  rows:=case when status->>'enabled'='true' then messaging.api('list') else '[]'::jsonb end;
  if not p_previews then select coalesce(jsonb_agg(value||jsonb_build_object('preview','','pinned',null)),'[]'::jsonb) into rows from jsonb_array_elements(rows); end if;
  return jsonb_build_object('status',status,'rows',rows);
end $$;
create function public.messaging_snapshot(p_previews boolean default false) returns jsonb language sql security invoker set search_path='' as $$ select messaging.snapshot(p_previews) $$;
revoke all on function messaging.snapshot(boolean),public.messaging_snapshot(boolean) from public,anon,authenticated,service_role;
grant execute on function messaging.snapshot(boolean),public.messaging_snapshot(boolean) to authenticated;

create function messaging.push_batch() returns jsonb language plpgsql security definer set search_path='' as $$
declare jobs jsonb; item jsonb; context jsonb; batch jsonb:='[]'; budget messaging.push_budget;
begin
  if not exists(select 1 from messaging.deliveries where state in ('pending','leased','accepted') and available_at<=now()) then return jsonb_build_object('claimed',0,'jobs','[]'::jsonb); end if;
  select * into budget from messaging.push_budget where singleton for update;
  if clock_timestamp()-budget.window_started>=interval '1 second' then
    update messaging.push_budget set window_started=clock_timestamp(),reserved=0 where singleton returning * into budget;
  end if;
  -- Chat reserves at most 400 jobs/second, leaving headroom below Expo's
  -- project limit for the existing tournament/operational notification queue.
  if budget.reserved>=400 then return jsonb_build_object('claimed',0,'jobs','[]'::jsonb,'deferred',true); end if;
  update messaging.push_budget set reserved=reserved+200 where singleton;
  jobs:=messaging.delivery_api('claim');
  for item in select value from jsonb_array_elements(jobs) loop
    if item->>'ticket' is null then
      context:=messaging.delivery_api('context',jsonb_build_object('id',item->>'id','lease',item->>'lease'));
      item:=item||jsonb_build_object('context',context);
    end if;
    batch:=batch||jsonb_build_array(item);
  end loop;
  return jsonb_build_object('claimed',jsonb_array_length(jobs),'jobs',batch);
end $$;
create function messaging.push_finish(p_items jsonb) returns void language plpgsql security definer set search_path='' as $$
declare item jsonb; author record;
begin
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>200 then raise exception 'Invalid delivery batch'; end if;
  for item in select value from jsonb_array_elements(p_items) loop perform messaging.delivery_api('finish',item); end loop;
  for author in select distinct m.sender_id from messaging.messages m join messaging.deliveries d on d.message_id=m.id
    where d.id in (select (value->>'id')::uuid from jsonb_array_elements(p_items)) and m.sender_id is not null loop perform messaging.signal(author.sender_id);end loop;
end $$;
create function messaging.push_continue() returns void language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from messaging.deliveries where state in ('pending','leased','accepted') and available_at<=now()) then perform public.dispatch_push_worker(); end if;
end $$;
create function public.messaging_push_batch() returns jsonb language sql security invoker set search_path='' as $$ select messaging.push_batch() $$;
create function public.messaging_push_finish(p_items jsonb) returns void language sql security invoker set search_path='' as $$ select messaging.push_finish(p_items) $$;
create function public.messaging_push_continue() returns void language sql security invoker set search_path='' as $$ select messaging.push_continue() $$;
revoke all on function messaging.push_batch(),messaging.push_finish(jsonb),messaging.push_continue(),public.messaging_push_batch(),public.messaging_push_finish(jsonb),public.messaging_push_continue() from public,anon,authenticated,service_role;
grant execute on function messaging.push_batch(),messaging.push_finish(jsonb),messaging.push_continue(),public.messaging_push_batch(),public.messaging_push_finish(jsonb),public.messaging_push_continue() to service_role;
notify pgrst,'reload schema';

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
      or prefs->>'push_enabled'='false' or exists(select 1 from messaging.members where conversation_id=job.conversation_id and user_id=job.user_id and muted) then
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
    and sender_id is distinct from p_user and deleted_at is null and messaging.visible(id,p_user);
  return jsonb_build_object('id',c.id,'kind',c.kind,'eventId',c.event_id,'title',coalesce(title,'Player'),
    'image',photo,'state',c.state,'incoming',c.requester is distinct from p_user,'muted',coalesce(member.muted,false),
    'archived',coalesce(member.archived,false),'unread',greatest(unread,case when member.marked_unread_from is not null then 1 else 0 end),'preview',coalesce(nullif(last_message->>'body',''),last_message->'card'->>'title',''),
    'lastMessageId',last_message->>'id','lastMessageMine',coalesce((last_message->>'mine')::boolean,false),
    'updatedAt',coalesce((last_message->>'createdAt')::timestamptz,c.created_at),'canSend',can_send and (select sending_enabled from messaging.configuration),
    'reason',reason,'manager',is_manager,'paused',c.paused,
    'pinned',case when messaging.visible(c.pinned_id,p_user) then messaging.message_json(c.pinned_id,p_user) end);
end $$;
revoke all on function messaging.conversation_json(uuid,uuid) from public,anon,authenticated,service_role;

-- A healthy socket still receives eligibility/configuration revocations.
create function messaging.access_changed() returns trigger language plpgsql security definer set search_path='' as $$
declare account record;
begin
  if tg_table_name='accounts' then perform messaging.signal(new.user_id);
  else for account in select user_id from messaging.accounts loop perform messaging.signal(account.user_id); end loop; end if;
  return null;
end $$;
create trigger messaging_account_access after update of suspended,rules_version,allow_requests on messaging.accounts for each row execute function messaging.access_changed();
create trigger messaging_configuration_access after update on messaging.configuration for each row execute function messaging.access_changed();
revoke all on function messaging.access_changed() from public,anon,authenticated,service_role;
