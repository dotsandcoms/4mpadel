-- Private help threads. All access goes through the checked RPC, including staff access.
create schema if not exists private;
grant usage on schema private to authenticated;
create table public.help_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null,
  topic text not null check(topic in ('entry','payment','profile','problem','other')),
  event_id bigint references public.calendar(id) on delete set null,
  payment_id uuid references public.payments(id) on delete set null,
  context_label text,
  team text not null check(team in ('organiser','4m')),
  status text not null default 'open' check(status in ('open','waiting_on_player','resolved')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(owner_id,client_id)
);
create index help_requests_owner_updated on public.help_requests(owner_id,updated_at desc,id);
create index help_requests_event_status on public.help_requests(event_id,status,updated_at desc,id);
create index help_requests_team_status on public.help_requests(team,status,updated_at desc,id);
create table public.help_replies (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.help_requests(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  author_role text not null check(author_role in ('player','organiser','4m')),
  client_id uuid not null,
  body text not null check(char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default clock_timestamp(),
  unique(request_id,author_id,client_id)
);
create index help_replies_thread on public.help_replies(request_id,created_at,id);
alter table public.help_requests enable row level security;
alter table public.help_replies enable row level security;
-- RPC-only tables: no direct row policies, table grants or sequences are needed.
revoke all on public.help_requests,public.help_replies from public,anon,authenticated,service_role;

create function private.help_actor() returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
  if uid is null or not exists(select 1 from auth.users u join auth.sessions s on s.user_id=u.id
    where u.id=uid and u.deleted_at is null and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until<now()) and not coalesce(u.is_anonymous,false)
      and lower(trim(u.email))=lower(trim(auth.jwt()->>'email'))
      and s.id::text=auth.jwt()->>'session_id' and (s.not_after is null or s.not_after>now())) then
    raise exception 'Sign in again to use help requests.' using errcode='42501';
  end if;
  return uid;
end $$;
create function private.help_staff(p_event bigint) returns boolean language sql stable security definer set search_path='' as $$
  select auth.jwt()->>'aal'='aal2' and (coalesce(public.is_super_admin(auth.email()),false) or coalesce(messaging.manager(p_event),false))
$$;

create function private.help_route(p_topic text,p_event bigint,p_payment text,p_kind text,p_owner uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.calendar; pay public.payments; email text; label text; team text; recipient text; payer text;
begin
  if p_topic not in ('entry','payment','profile','problem','other') or p_topic is null then raise exception 'Choose a help topic.'; end if;
  if p_topic='payment' and nullif(p_payment,'') is not null then
    select u.email into payer from auth.users u where u.id=p_owner;
    if p_kind='refund' then
      select p.* into pay from public.payment_refunds r join public.payments p on p.id=r.payment_id
        where r.id::text=p_payment and (p.player_id in(select person.id from public.players person where lower(trim(person.email))=lower(trim(payer)))
          or lower(trim(p.metadata->>'email'))=lower(trim(payer)) or lower(trim(p.metadata->>'registrant_email'))=lower(trim(payer)));
    else
      select p.* into pay from public.payments p where p.id::text=p_payment
        and (p.player_id in(select person.id from public.players person where lower(trim(person.email))=lower(trim(payer)))
          or lower(trim(p.metadata->>'email'))=lower(trim(payer)) or lower(trim(p.metadata->>'registrant_email'))=lower(trim(payer)));
    end if;
    if pay.id is null then raise exception 'This payment is unavailable.' using errcode='42501'; end if;
    p_event:=pay.event_id;
    label:=concat(case when p_kind='refund' then 'Refund for ' else 'Payment ' end,coalesce(pay.reference,pay.id::text));
  elsif p_topic<>'entry' then p_event:=null;
  end if;
  if p_event is not null then
    select * into e from public.calendar where id=p_event;
    if e.id is null then raise exception 'This event is unavailable.' using errcode='42501'; end if;
    if pay.id is null and (e.is_visible=false or (e.sanction_status is not null and e.sanction_status<>'approved'))
      and not exists(select 1 from public.event_registrations r join auth.users u on u.id=p_owner where r.event_id=e.id
        and (lower(trim(r.email))=lower(trim(u.email)) or lower(trim(r.partner_email))=lower(trim(u.email)))) then
      raise exception 'This event is unavailable.' using errcode='42501';
    end if;
    label:=concat_ws(' · ',label,e.event_name||' (event #'||e.id||')');
  end if;
  team:=case when e.id is not null then 'organiser' else '4m' end;
  recipient:=case when team='organiser' then coalesce(nullif(trim(e.organiser_name),''),'Event organiser') else '4M support' end;
  email:=case when team='organiser' and trim(e.organiser_email)~'^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' then lower(trim(e.organiser_email)) else 'info@4mpadel.co.za' end;
  return jsonb_build_object('team',team,'recipient',recipient,'email',email,'emailFallback',team='organiser' and email='info@4mpadel.co.za',
    'eventId',e.id,'eventName',e.event_name,'paymentId',pay.id,'context',label);
end $$;

create function private.help_request_json(p_request public.help_requests) returns jsonb language plpgsql stable security definer set search_path='' as $$
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
    'requester',jsonb_build_object('name',(select p.name from public.players p join auth.users u on lower(trim(u.email))=lower(trim(p.email)) where u.id=p_request.owner_id order by p.id limit 1)),
    'preview',(select left(r.body,160) from public.help_replies r where r.request_id=p_request.id order by r.created_at,r.id limit 1));
end $$;

create function private.help_api(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=private.help_actor(); ticket public.help_requests; route jsonb; result jsonb; rows jsonb; thread jsonb;
  key uuid; input_body text; message public.help_replies; target text; is_staff boolean; staff_list boolean;
begin
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
        and (nullif(trim(p_data->>'query'),'') is null or position(lower(left(trim(p_data->>'query'),80)) in lower(concat_ws(' ',h.context_label,h.topic,h.id::text)))>0)
        and (nullif(p_data->>'before','') is null or (h.updated_at,h.id)<((p_data->>'before')::timestamptz,(p_data->>'beforeId')::uuid))
      order by h.updated_at desc,h.id desc limit 50
    ) r;
    return jsonb_build_object('rows',rows,'next',case when jsonb_array_length(rows)=50 then jsonb_build_object('before',rows->49->>'updatedAt','beforeId',rows->49->>'id') end);
  end if;
  select * into ticket from public.help_requests where id=(p_data->>'id')::uuid for update;
  if ticket.id is null then raise exception 'This help request is unavailable.' using errcode='42501'; end if;
  is_staff:=private.help_staff(ticket.event_id);
  if ticket.owner_id<>uid and not coalesce(is_staff,false) then raise exception 'This help request is unavailable.' using errcode='42501'; end if;
  if p_action='read' then
    select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'role',r.author_role,'body',r.body,'createdAt',r.created_at) order by r.created_at,r.id),'[]'::jsonb) into thread
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
create function public.help_api(p_action text,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select private.help_api(p_action,p_data) $$;
revoke all on function private.help_actor(),private.help_staff(bigint),private.help_route(text,bigint,text,text,uuid),private.help_request_json(public.help_requests),private.help_api(text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.help_api(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.help_api(text,jsonb),public.help_api(text,jsonb) to authenticated;
notify pgrst,'reload schema';
