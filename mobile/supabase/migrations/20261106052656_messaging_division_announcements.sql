-- Division announcements share an event channel but never share their audience.
-- Existing messages remain event-wide. New metadata stays in the private schema.
alter table messaging.messages add column target_division_ids uuid[], add column target_division_names text[];
alter table messaging.messages add constraint messaging_division_target_size check (target_division_ids is null or cardinality(target_division_ids) between 1 and 100);
alter table messaging.entry_confirmations add column division_proof jsonb;

create function messaging.parse_divisions(p_event bigint,p_input jsonb) returns uuid[] language plpgsql stable security definer set search_path='' as $$
declare ids uuid[];
begin
  if p_input is null or p_input='null'::jsonb then return null; end if;
  if jsonb_typeof(p_input)<>'array' then raise exception 'Choose one or more divisions from this event.'; end if;
  if jsonb_array_length(p_input) not between 1 and 100 or exists(select 1 from jsonb_array_elements(p_input) v where jsonb_typeof(v)<>'string' or (v#>>'{}')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then raise exception 'Choose one or more divisions from this event.'; end if;
  select array_agg(id order by id) into ids from (select distinct value::uuid id from jsonb_array_elements_text(p_input)) d;
  if exists(select 1 from unnest(ids) selected(id) where not exists(select 1 from public.tournament_divisions d where d.id=selected.id and d.event_id=p_event)) then raise exception 'Choose divisions belonging to this event.' using errcode='42501'; end if;
  return ids;
end $$;

-- Registration fingerprints already include the division ID. Imports need a
-- separate, trusted class-to-division attestation; legacy class text is not proof.
create or replace function messaging.attest_entry() returns trigger language plpgsql security definer set search_path='' set timezone='Africa/Johannesburg' as $$
declare source_name text:=case when tg_table_name='event_registrations' then 'registration' else 'import' end; segment jsonb; entry jsonb;
begin
  if tg_op='DELETE' then delete from messaging.entry_confirmations where source=source_name and source_id=old.id;return null; end if;
  entry:=to_jsonb(new);
  if messaging.trusted_event_writer(new.event_id) then
    if source_name='import' then
      select jsonb_build_object('event',entry->>'event_id','email',lower(trim(entry->>'email')),'class',entry->>'class_name','division',min(d.id::text)) into segment
        from public.tournament_divisions d where d.event_id=new.event_id and lower(trim(d.name))=lower(trim(entry->>'class_name')) having count(*)=1;
    end if;
    insert into messaging.entry_confirmations(source,source_id,proof,division_proof) values(source_name,new.id,messaging.entry_proof(entry),segment)
      on conflict(source,source_id) do update set proof=excluded.proof,created_at=clock_timestamp(),division_proof=excluded.division_proof;
  elsif tg_op='INSERT' or messaging.entry_proof(to_jsonb(old)) is distinct from messaging.entry_proof(to_jsonb(new)) then
    delete from messaging.entry_confirmations where source=source_name and source_id=new.id;
  elsif source_name='import' and to_jsonb(old)->>'class_name' is distinct from entry->>'class_name' then
    update messaging.entry_confirmations set division_proof=null where source=source_name and source_id=new.id;
  end if;
  return null;
end $$;

create function messaging.player_divisions(p_event bigint,p_user uuid) returns uuid[] language sql stable security definer set search_path='' as $$
  with identity as materialized (
    select lower(trim(u.email)) address from auth.users u join messaging.accounts a on a.user_id=u.id
    where u.id=p_user and not a.suspended and u.deleted_at is null and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until<now())
  ), registered as (
    select r.division_id id from public.event_registrations r join public.tournament_divisions d on d.id=r.division_id and d.event_id=r.event_id
    join messaging.entry_confirmations proof on proof.source='registration' and proof.source_id=r.id and proof.proof=messaging.entry_proof(to_jsonb(r)) cross join identity i
    where r.event_id=p_event and lower(coalesce(r.status,'')) in ('registered','confirmed','approved','active')
      and (lower(trim(r.email))=i.address or (lower(trim(r.partner_email))=i.address and not exists(
        select 1 from public.event_registrations w where w.event_id=p_event and w.division_id=r.division_id and lower(trim(w.email))=i.address and lower(w.status)='withdrawn'
          and not exists(select 1 from public.event_registrations live where live.event_id=p_event and live.division_id=r.division_id and lower(trim(live.email))=i.address and lower(coalesce(live.status,'')) in ('registered','confirmed','approved','active')))))
  ), imported as (
    select d.id from public.tournament_participants t join messaging.entry_confirmations proof on proof.source='import' and proof.source_id=t.id and proof.proof=messaging.entry_proof(to_jsonb(t))
      join public.tournament_divisions d on d.event_id=t.event_id and d.id::text=proof.division_proof->>'division' cross join identity i
    where t.event_id=p_event and lower(trim(t.email))=i.address
      and proof.division_proof->>'event'=t.event_id::text and proof.division_proof->>'email'=i.address and proof.division_proof->>'class'=t.class_name
      and not exists(select 1 from public.event_registrations w where w.event_id=p_event and w.division_id=d.id and lower(trim(w.email))=i.address and lower(w.status)='withdrawn'
        and not exists(select 1 from public.event_registrations live where live.event_id=p_event and live.division_id=d.id and lower(trim(live.email))=i.address and lower(coalesce(live.status,'')) in ('registered','confirmed','approved','active')))
  ) select coalesce(array_agg(distinct id),'{}'::uuid[]) from (select id from registered union select id from imported) divisions
$$;
create function messaging.division_allows(p_event bigint,p_divisions uuid[],p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
  select p_divisions is null or p_divisions && messaging.player_divisions(p_event,p_user)
$$;
create function messaging.event_audience(p_event bigint,p_input jsonb default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=messaging.actor(); ids uuid[]; result jsonb;
begin
  if not messaging.enabled_for(uid) then raise exception 'Messaging is getting ready.' using errcode='42501'; end if;
  perform messaging.require_manager(p_event);
  ids:=messaging.parse_divisions(p_event,p_input);
  with audience as materialized (
    select member.user_id,messaging.player_divisions(p_event,member.user_id) divisions from messaging.members member join messaging.conversations c on c.id=member.conversation_id
    where c.event_id=p_event and c.kind='event_announcements' and member.active and member.user_id<>uid and messaging.can_read(c.id,member.user_id)
  ) select jsonb_build_object('allCount',(select count(*) from audience),'selectedCount',(select count(*) from audience where ids is null or divisions && ids),
    'unassignedCount',(select count(*) from audience where cardinality(divisions)=0),
    'divisions',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'name',d.name,'count',(select count(*) from audience a where d.id=any(a.divisions))) order by d.name,d.id) from public.tournament_divisions d where d.event_id=p_event),'[]'::jsonb)) into result;
  return result;
end $$;

create or replace function messaging.visible(p_message uuid,p_user uuid) returns boolean language sql stable security definer set search_path='' set timezone='Africa/Johannesburg' as $$
  select exists(select 1 from messaging.messages m join messaging.conversations c on c.id=m.conversation_id
    left join messaging.members member on member.conversation_id=c.id and member.user_id=p_user
    where m.id=p_message and m.expires_at>now() and messaging.can_read(c.id,p_user)
    and (m.target_division_ids is null or (p_user=auth.uid() and messaging.manager(c.event_id) and auth.jwt()->>'aal'='aal2') or messaging.division_allows(c.event_id,m.target_division_ids,p_user))
    and (c.kind<>'event_discussion' or (p_user=auth.uid() and messaging.manager(c.event_id) and auth.jwt()->>'aal'='aal2')
      or m.created_at>=member.eligible_from)
    and (c.kind<>'event_discussion' or m.sender_id is null or not messaging.blocked(p_user,m.sender_id)))
$$;

create or replace function messaging.message_json(p_message uuid,p_user uuid) returns jsonb language sql stable security definer set search_path='' set timezone='Africa/Johannesburg' as $$
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
    join public.player_push_tokens token on lower(trim(token.email))=lower(trim(u.email)) and token.token_kind='expo'
    cross join messaging.configuration cfg
    where member.conversation_id=message.conversation_id and member.active and member.user_id is distinct from message.sender_id
      and cfg.enabled and (cardinality(cfg.pilot_player_ids)=0 or account.player_id=any(cfg.pilot_player_ids))
      and messaging.division_allows(conversation.event_id,message.target_division_ids,member.user_id)
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
    'archived',coalesce(member.archived,false),'unread',greatest(unread,case when member.marked_unread_from is not null and exists(select 1 from messaging.messages reminder where reminder.conversation_id=c.id and reminder.seq>=member.marked_unread_from and reminder.deleted_at is null and messaging.visible(reminder.id,p_user)) then 1 else 0 end),'preview',coalesce(nullif(last_message->>'body',''),last_message->'card'->>'title',''),
    'lastMessageId',last_message->>'id','lastMessageMine',coalesce((last_message->>'mine')::boolean,false),
    'updatedAt',coalesce((last_message->>'createdAt')::timestamptz,c.created_at),'canSend',can_send and (select sending_enabled from messaging.configuration),
    'reason',reason,'manager',is_manager,'paused',c.paused,
    'pinned',case when messaging.visible(c.pinned_id,p_user) then messaging.message_json(c.pinned_id,p_user) end);
end $$;

create or replace function messaging.unread_total(p_user uuid) returns bigint language sql stable security definer set search_path='' set timezone='Africa/Johannesburg' as $$
  select coalesce(sum(greatest(incoming.count,case when member.marked_unread_from is not null and exists(select 1 from messaging.messages reminder where reminder.conversation_id=conversation.id and reminder.seq>=member.marked_unread_from and reminder.deleted_at is null and messaging.visible(reminder.id,p_user)) then 1 else 0 end)),0)::bigint
    from messaging.members member join messaging.conversations conversation on conversation.id=member.conversation_id
    cross join lateral (select count(*) from messaging.messages message where message.conversation_id=conversation.id
      and (message.seq>member.read_seq or (member.marked_unread_from is not null and message.seq>=member.marked_unread_from))
      and message.sender_id is distinct from p_user and message.deleted_at is null and messaging.visible(message.id,p_user)) incoming
    where member.user_id=p_user and member.active and not member.archived and messaging.can_read(conversation.id,p_user)
      and (conversation.state='accepted' or (conversation.state='pending' and conversation.requester is distinct from p_user))
$$;

revoke all on function messaging.conversation_json(uuid,uuid),messaging.unread_total(uuid) from public,anon,authenticated,service_role;

-- No new public tables or grants: all new helpers are RPC-internal only.
revoke all on function messaging.parse_divisions(bigint,jsonb),messaging.player_divisions(bigint,uuid),messaging.division_allows(bigint,uuid[],uuid),messaging.event_audience(bigint,jsonb),messaging.visible(uuid,uuid),messaging.message_json(uuid,uuid),messaging.queue_message(uuid),messaging.attest_entry() from public,anon,authenticated,service_role;
revoke all on function messaging.api(text,jsonb),messaging.event_analytics(bigint) from public,anon,authenticated,service_role;
grant execute on function messaging.api(text,jsonb),messaging.event_analytics(bigint) to authenticated;
notify pgrst,'reload schema';
