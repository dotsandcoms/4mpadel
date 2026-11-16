-- One help transcript, projected into Messages and Admin. Reads belong to each account.
alter table public.help_replies add column seq bigint;
with ordered as (select id,row_number() over(partition by request_id order by created_at,id) as n from public.help_replies)
update public.help_replies r set seq=o.n from ordered o where o.id=r.id;
alter table public.help_replies alter column seq set not null;
create unique index help_replies_sequence on public.help_replies(request_id,seq);
create table public.help_request_reads (
  request_id uuid not null references public.help_requests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_seq bigint not null check(read_seq>=0),
  primary key(request_id,user_id)
);
alter table public.help_request_reads enable row level security;
-- RPC-only. Definer entrypoints check the actor, ticket scope and MFA before every operation.
revoke all on public.help_request_reads from public,anon,authenticated,service_role;
create function private.help_reply_sequence() returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform id from public.help_requests where id=new.request_id for update;
  select coalesce(max(seq),0)+1 into new.seq from public.help_replies where request_id=new.request_id;
  return new;
end $$;
create trigger help_reply_sequence before insert on public.help_replies for each row execute function private.help_reply_sequence();
create function private.help_unread(p_request uuid,p_user uuid) returns bigint language sql stable security definer set search_path='' as $$
 select count(*) from public.help_replies r where r.request_id=p_request and r.author_id is distinct from p_user
 and r.seq>coalesce((select read_seq from public.help_request_reads where request_id=p_request and user_id=p_user),0)
$$;
create function private.help_can_staff() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(public.is_super_admin(auth.email()),false) or exists(select 1 from public.calendar c where messaging.manager(c.id))
$$;
create or replace function private.help_request_json(p_request public.help_requests) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare recipient text; email text; event_name text;
begin
  select e.event_name,coalesce(nullif(trim(e.organiser_name),''),'Event organiser'),
    case when trim(e.organiser_email)~'^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' then lower(trim(e.organiser_email)) end
    into event_name,recipient,email from public.calendar e where e.id=p_request.event_id;
  return jsonb_build_object('id',p_request.id,'reference','4M-'||upper(left(replace(p_request.id::text,'-',''),10)),
    'topic',p_request.topic,'eventId',p_request.event_id,'eventName',event_name,'context',p_request.context_label,
    'team',p_request.team,'recipient',case when p_request.team='4m' then '4M support' else coalesce(recipient,'Event organiser') end,
    'email',case when p_request.team='4m' then 'info@4mpadel.co.za' else coalesce(email,'info@4mpadel.co.za') end,
    'emailFallback',p_request.team='organiser' and email is null,
    'status',p_request.status,'createdAt',p_request.created_at,'updatedAt',p_request.updated_at,
    'canManage',private.help_staff(p_request.event_id),'isOwner',p_request.owner_id=auth.uid(),
    'unread',private.help_unread(p_request.id,auth.uid()),
    'lastMessageId',(select r.id from public.help_replies r where r.request_id=p_request.id order by r.seq desc limit 1),
    'lastSeq',(select coalesce(max(r.seq),0) from public.help_replies r where r.request_id=p_request.id),
    'requester',jsonb_build_object('email',case when p_request.owner_id=auth.uid() or private.help_staff(p_request.event_id) then (select u.email from auth.users u where u.id=p_request.owner_id) end,'name',(select p.name from public.players p join auth.users u on lower(trim(u.email))=lower(trim(p.email)) where u.id=p_request.owner_id order by p.id limit 1)),
    'preview',(select left(r.body,160) from public.help_replies r where r.request_id=p_request.id order by r.seq desc limit 1));
end $$;

create or replace function private.help_api(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.help_actor(); ticket public.help_requests; route jsonb; result jsonb; rows jsonb; thread jsonb;
  key uuid; input_body text; message public.help_replies; target text; is_staff boolean; staff_list boolean; unread_total bigint; topics jsonb; read_through bigint;
begin
  if p_action='inbox' then
    if coalesce((p_data->>'countsOnly')::boolean,false) then rows:='[]'::jsonb; else
    select coalesce(jsonb_agg(private.help_request_json(h) order by h.updated_at desc,h.id desc),'[]'::jsonb) into rows from (
      select * from public.help_requests h where (h.owner_id=uid or private.help_staff(h.event_id))
        and (nullif(p_data->>'before','') is null or (h.updated_at,h.id)<((p_data->>'before')::timestamptz,(p_data->>'beforeId')::uuid))
      order by h.updated_at desc,h.id desc limit 50
    ) h;
    end if;
    select count(*) into unread_total from public.help_requests h join public.help_replies r on r.request_id=h.id
      left join public.help_request_reads seen on seen.request_id=h.id and seen.user_id=uid
      where (h.owner_id=uid or private.help_staff(h.event_id)) and r.author_id is distinct from uid and r.seq>coalesce(seen.read_seq,0);
    topics:=jsonb_build_array('help:user:'||uid::text);
    if private.help_staff(null) then topics:=topics||jsonb_build_array('help:staff');
    elsif auth.jwt()->>'aal'='aal2' then
      select topics||coalesce(jsonb_agg('help:event:'||c.id::text),'[]'::jsonb) into topics from public.calendar c where messaging.manager(c.id);
    end if;
    return jsonb_build_object('rows',rows,'unread',unread_total,'topics',topics,
      'needsVerification',private.help_can_staff() and auth.jwt()->>'aal' is distinct from 'aal2',
      'next',case when jsonb_array_length(rows)=50 then jsonb_build_object('before',rows->49->>'updatedAt','beforeId',rows->49->>'id') end);
  end if;
  if p_action in ('route','create') then
    route:=private.help_route(p_data->>'topic',nullif(p_data->>'eventId','')::bigint,p_data->>'paymentId',p_data->>'paymentKind',uid);
    if p_action='route' then return route; end if;
    key:=(p_data->>'clientId')::uuid; input_body:=btrim(p_data->>'body');
    if key is null or input_body is null or char_length(input_body) not between 1 and 4000 then raise exception 'Write a message of up to 4000 characters.'; end if;
    perform pg_advisory_xact_lock(hashtextextended(uid::text,9041));
    select * into ticket from public.help_requests where owner_id=uid and client_id=key;
    if ticket.id is not null then
      if ticket.topic<>p_data->>'topic' or ticket.event_id is distinct from (route->>'eventId')::bigint or ticket.payment_id is distinct from (route->>'paymentId')::uuid
        or not exists(select 1 from public.help_replies r where r.request_id=ticket.id and r.body=input_body and r.client_id=key) then raise exception 'This request retry has different details.'; end if;
      return private.help_request_json(ticket);
    end if;
    if (select count(*) from public.help_requests where owner_id=uid and created_at>now()-interval '1 day')>=20 then raise exception 'You have reached today’s request limit. Please reply to an existing request.'; end if;
    insert into public.help_requests(owner_id,client_id,topic,event_id,payment_id,context_label,team)
      values(uid,key,p_data->>'topic',(route->>'eventId')::bigint,(route->>'paymentId')::uuid,route->>'context',route->>'team') returning * into ticket;
    insert into public.help_replies(request_id,author_id,author_role,client_id,body) values(ticket.id,uid,'player',key,input_body);
    return private.help_request_json(ticket);
  elsif p_action='list' then
    staff_list:=coalesce((p_data->>'staff')::boolean,false);
    if staff_list and auth.jwt()->>'aal' is distinct from 'aal2' then raise exception 'Verify your authenticator to manage help requests.' using errcode='42501'; end if;
    select coalesce(jsonb_agg(private.help_request_json(r) order by r.updated_at desc,r.id desc),'[]'::jsonb) into rows from (
      select h.* from public.help_requests h where (case when staff_list then private.help_staff(h.event_id) else h.owner_id=uid end)
        and (nullif(p_data->>'status','') is null or h.status=p_data->>'status')
        and (nullif(p_data->>'eventId','') is null or h.event_id=(p_data->>'eventId')::bigint)
        and (nullif(p_data->>'team','') is null or h.team=p_data->>'team')
        and (nullif(trim(p_data->>'query'),'') is null or position(regexp_replace(lower(left(trim(p_data->>'query'),80)),'^4m-','') in lower(concat_ws(' ',h.context_label,h.topic,h.id::text,replace(h.id::text,'-',''),(select c.event_name from public.calendar c where c.id=h.event_id),case when staff_list then (select concat_ws(' ',u.email,p.name) from auth.users u left join public.players p on lower(trim(p.email))=lower(trim(u.email)) where u.id=h.owner_id order by p.id limit 1) end)))>0)
        and (nullif(p_data->>'before','') is null or (h.updated_at,h.id)<((p_data->>'before')::timestamptz,(p_data->>'beforeId')::uuid))
      order by h.updated_at desc,h.id desc limit 50
    ) r;
    return jsonb_build_object('rows',rows,'next',case when jsonb_array_length(rows)=50 then jsonb_build_object('before',rows->49->>'updatedAt','beforeId',rows->49->>'id') end);
  end if;
  select * into ticket from public.help_requests where id=(p_data->>'id')::uuid for update;
  if ticket.id is null then raise exception 'This help request is unavailable.' using errcode='42501'; end if;
  is_staff:=private.help_staff(ticket.event_id);
  if ticket.owner_id<>uid and not coalesce(is_staff,false) then raise exception 'This help request is unavailable.' using errcode='42501'; end if;
  if p_action='mark_read' then
    select seq into read_through from public.help_replies where request_id=ticket.id and id=(p_data->>'messageId')::uuid;
    if read_through is null then raise exception 'This reply is unavailable.' using errcode='42501'; end if;
    insert into public.help_request_reads(request_id,user_id,read_seq) values(ticket.id,uid,read_through)
      on conflict(request_id,user_id) do update set read_seq=greatest(public.help_request_reads.read_seq,excluded.read_seq)
      where public.help_request_reads.read_seq<excluded.read_seq;
    return jsonb_build_object('unread',private.help_unread(ticket.id,uid));
  elsif p_action='read' then
    select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'role',r.author_role,'body',r.body,'createdAt',r.created_at,'seq',r.seq,'mine',r.author_id=uid,'senderName',(select p.name from public.players p join auth.users u on lower(trim(u.email))=lower(trim(p.email)) where u.id=r.author_id order by p.id limit 1)) order by r.created_at,r.id),'[]'::jsonb) into thread
      from (select * from public.help_replies where request_id=ticket.id
        and (nullif(p_data->>'before','') is null or (created_at,id)<((p_data->>'before')::timestamptz,(p_data->>'beforeId')::uuid))
        order by created_at desc,id desc limit 100) r;
    return jsonb_build_object('request',private.help_request_json(ticket),'messages',thread,
      'nextMessages',case when jsonb_array_length(thread)=100 then jsonb_build_object('before',thread->0->>'createdAt','beforeId',thread->0->>'id') end);
  elsif p_action='reply' then
    key:=(p_data->>'clientId')::uuid; input_body:=btrim(p_data->>'body');
    if key is null or input_body is null or char_length(input_body) not between 1 and 4000 then raise exception 'Write a message of up to 4000 characters.'; end if;
    select * into message from public.help_replies where request_id=ticket.id and author_id=uid and client_id=key;
    if message.id is not null then
      if message.body<>input_body then raise exception 'This reply retry has different details.'; end if;
      return private.help_request_json(ticket);
    end if;
    if (select count(*) from public.help_replies where author_id=uid and created_at>now()-interval '1 hour')>=100 then raise exception 'Please wait before sending another reply.'; end if;
    insert into public.help_replies(request_id,author_id,author_role,client_id,body)
      values(ticket.id,uid,case when ticket.owner_id=uid then 'player' when public.is_super_admin(auth.email()) then '4m' else 'organiser' end,key,input_body);
    target:=case when ticket.owner_id=uid then 'open' else 'waiting_on_player' end;
  elsif p_action='status' then
    target:=p_data->>'status';
    if target not in ('open','waiting_on_player','resolved') or target is null or (ticket.owner_id=uid and not coalesce(is_staff,false) and target='waiting_on_player') then raise exception 'Choose an available request status.'; end if;
  elsif p_action='escalate' and coalesce(is_staff,false) then
    target:='open';
    update public.help_requests set team='4m' where id=ticket.id;
    insert into public.help_replies(request_id,author_id,author_role,client_id,body)
      values(ticket.id,uid,case when public.is_super_admin(auth.email()) then '4m' else 'organiser' end,gen_random_uuid(),'Sent to 4M support for assistance');
  else raise exception 'This help action is unavailable.';
  end if;
  update public.help_requests set status=target,updated_at=clock_timestamp() where id=ticket.id returning * into ticket;
  return private.help_request_json(ticket);
end $$;

-- Signals carry no message body. Subscribers must re-read through the checked RPC.
create function private.help_signal() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='help_request_reads' then
    perform realtime.send('{}'::jsonb,'help_changed','help:user:'||new.user_id::text,true);
  else
    perform realtime.send('{}'::jsonb,'help_changed','help:user:'||new.owner_id::text,true);
    perform realtime.send('{}'::jsonb,'help_changed','help:staff',true);
    if new.event_id is not null then perform realtime.send('{}'::jsonb,'help_changed','help:event:'||new.event_id::text,true); end if;
  end if;
  return new;
end $$;
create trigger help_request_signal after insert or update on public.help_requests for each row execute function private.help_signal();
create trigger help_read_signal after insert or update on public.help_request_reads for each row execute function private.help_signal();
create function private.help_topic_allowed(p_topic text) returns boolean language plpgsql stable security definer set search_path='' as $$
begin
  perform private.help_actor();
  if p_topic='help:user:'||auth.uid()::text then return true; end if;
  if p_topic='help:staff' then return coalesce(private.help_staff(null),false); end if;
  if p_topic~'^help:event:[0-9]{1,18}$' then return coalesce(private.help_staff(split_part(p_topic,':',3)::bigint),false); end if;
  return false;
exception when others then return false;
end $$;
create policy "Help private signals" on realtime.messages for select to authenticated
  using(extension='broadcast' and private.help_topic_allowed(realtime.topic()));
create policy "Help signal boundary" on realtime.messages as restrictive for select to authenticated
  using(realtime.topic() not like 'help:%' or (extension='broadcast' and private.help_topic_allowed(realtime.topic())));
create policy "Help server signals only" on realtime.messages as restrictive for insert to authenticated
  with check(realtime.topic() not like 'help:%');
revoke all on function private.help_reply_sequence(),private.help_unread(uuid,uuid),private.help_can_staff(),private.help_signal(),private.help_topic_allowed(text) from public,anon,authenticated,service_role;
-- This boolean helper is needed by the Realtime authorization policy; it returns no ticket data.
grant execute on function private.help_topic_allowed(text) to authenticated;
notify pgrst,'reload schema';
