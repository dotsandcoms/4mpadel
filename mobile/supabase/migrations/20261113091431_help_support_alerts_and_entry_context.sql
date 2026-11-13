-- Exact, owned entry context and durable email alerts for the 4M support team.
alter table public.help_requests add column registration_id uuid references public.event_registrations(id) on delete set null;
create table public.help_support_alerts (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null unique references public.help_requests(id) on delete cascade,
 kind text not null check(kind in ('new','escalated')),
 state text not null default 'pending' check(state in ('pending','leased','sent','needs_review')),
 created_at timestamptz not null default clock_timestamp(),
 available_at timestamptz not null default clock_timestamp(),
 attempts integer not null default 0 check(attempts>=0),
 first_attempt_at timestamptz,
 lease_id uuid,
 payload jsonb,
 provider_id text,
 last_error text
);
create index help_support_alerts_due on public.help_support_alerts(available_at) where state in ('pending','leased');
alter table public.help_support_alerts enable row level security;
-- RPC-only worker queue. Neither clients nor service workers receive direct table grants.
revoke all on public.help_support_alerts from public,anon,authenticated,service_role;

create function private.help_entry_route(p_registration uuid,p_owner uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare entry public.event_registrations; address text; route jsonb; detail text;
begin
 select lower(trim(email)) into address from auth.users where id=p_owner;
 select * into entry from public.event_registrations r where r.id=p_registration
   and (lower(trim(r.email))=address or lower(trim(r.partner_email))=address);
 if entry.id is null then raise exception 'This entry is unavailable.' using errcode='42501'; end if;
 route:=private.help_route('entry',entry.event_id,null,null,p_owner);
 detail:=concat_ws(' · ',nullif(entry.division,''),nullif(entry.full_name,''),case when nullif(entry.partner_name,'') is not null then 'Partner: '||entry.partner_name end);
 return route||jsonb_build_object('entryId',entry.id,'entryDetail',detail,
   'context',concat_ws(' · ',route->>'context','Entry '||entry.id::text,detail));
end $$;
create or replace function private.help_request_json(p_request public.help_requests) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare recipient text; email text; event_name text;
begin
  select e.event_name,coalesce(nullif(trim(e.organiser_name),''),'Event organiser'),
    case when trim(e.organiser_email)~'^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' then lower(trim(e.organiser_email)) end
    into event_name,recipient,email from public.calendar e where e.id=p_request.event_id;
  return jsonb_build_object('id',p_request.id,'reference','4M-'||upper(left(replace(p_request.id::text,'-',''),10)),
    'topic',p_request.topic,'eventId',p_request.event_id,'eventName',event_name,'context',p_request.context_label,'entryId',p_request.registration_id,
    'supportAlert',(select case when a.state in ('pending','leased') then 'queued' else a.state end from public.help_support_alerts a where a.request_id=p_request.id),
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
    if p_data->>'topic'='entry' and nullif(p_data->>'entryId','') is not null then
      route:=private.help_entry_route((p_data->>'entryId')::uuid,uid);
      if nullif(p_data->>'eventId','') is not null and (route->>'eventId')::bigint<>(p_data->>'eventId')::bigint then raise exception 'This entry does not belong to that event.' using errcode='42501'; end if;
    else
    route:=private.help_route(p_data->>'topic',nullif(p_data->>'eventId','')::bigint,p_data->>'paymentId',p_data->>'paymentKind',uid);
    end if;
    if p_action='route' then return route; end if;
    key:=(p_data->>'clientId')::uuid; input_body:=btrim(p_data->>'body');
    if key is null or input_body is null or char_length(input_body) not between 1 and 4000 then raise exception 'Write a message of up to 4000 characters.'; end if;
    perform pg_advisory_xact_lock(hashtextextended(uid::text,9041));
    select * into ticket from public.help_requests where owner_id=uid and client_id=key;
    if ticket.id is not null then
      if ticket.topic<>p_data->>'topic' or ticket.event_id is distinct from (route->>'eventId')::bigint or ticket.payment_id is distinct from (route->>'paymentId')::uuid or ticket.registration_id is distinct from (route->>'entryId')::uuid
        or not exists(select 1 from public.help_replies r where r.request_id=ticket.id and r.body=input_body and r.client_id=key) then raise exception 'This request retry has different details.'; end if;
      return private.help_request_json(ticket);
    end if;
    if (select count(*) from public.help_requests where owner_id=uid and created_at>now()-interval '1 day')>=20 then raise exception 'You have reached today’s request limit. Please reply to an existing request.'; end if;
    insert into public.help_requests(owner_id,client_id,topic,event_id,payment_id,registration_id,context_label,team)
      values(uid,key,p_data->>'topic',(route->>'eventId')::bigint,(route->>'paymentId')::uuid,(route->>'entryId')::uuid,route->>'context',route->>'team') returning * into ticket;
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
    if ticket.status='resolved' then raise exception 'This request is resolved. Reopen it before sending a message.'; end if;
    if (select count(*) from public.help_replies where author_id=uid and created_at>now()-interval '1 hour')>=100 then raise exception 'Please wait before sending another reply.'; end if;
    insert into public.help_replies(request_id,author_id,author_role,client_id,body)
      values(ticket.id,uid,case when ticket.owner_id=uid then 'player' when public.is_super_admin(auth.email()) then '4m' else 'organiser' end,key,input_body);
    target:=case when ticket.owner_id=uid then 'open' else 'waiting_on_player' end;
  elsif p_action='status' then
    target:=p_data->>'status';
    if target not in ('open','waiting_on_player','resolved') or target is null or (ticket.owner_id=uid and not coalesce(is_staff,false) and target='waiting_on_player') then raise exception 'Choose an available request status.'; end if;
  elsif p_action='escalate' and coalesce(is_staff,false) then
    if ticket.team='4m' then return private.help_request_json(ticket); end if;
    if ticket.status='resolved' then raise exception 'This request is resolved. Reopen it before sending a message.'; end if;
    target:='open';
    update public.help_requests set team='4m' where id=ticket.id;
    insert into public.help_replies(request_id,author_id,author_role,client_id,body)
      values(ticket.id,uid,case when public.is_super_admin(auth.email()) then '4m' else 'organiser' end,gen_random_uuid(),'Sent to 4M support for assistance');
  else raise exception 'This help action is unavailable.';
  end if;
  update public.help_requests set status=target,updated_at=clock_timestamp() where id=ticket.id returning * into ticket;
  return private.help_request_json(ticket);
end $$;


-- A trusted scheduler invokes a worker that authenticates the existing server-only secret.
create function private.help_dispatch_alerts() returns bigint language plpgsql security definer set search_path='' as $$
declare credential text; request_id bigint;
begin
 if not exists(select 1 from public.help_support_alerts where state in ('pending','leased') and available_at<=clock_timestamp()) then return null; end if;
 select decrypted_secret into credential from vault.decrypted_secrets where name='push_worker_secret' limit 1;
 if credential is null then return null; end if;
 select net.http_post(url:='https://uzglrpbixubfijvjbtgz.supabase.co/functions/v1/deliver-help-alerts',
   headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||credential),body:='{}'::jsonb) into request_id;
 return request_id;
exception when others then return null;
end $$;
create function private.help_queue_support_alert() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.team='4m' and (tg_op='INSERT' or old.team is distinct from '4m') then
   insert into public.help_support_alerts(request_id,kind) values(new.id,case when tg_op='INSERT' then 'new' else 'escalated' end) on conflict(request_id) do nothing;
   perform private.help_dispatch_alerts();
 end if;
 return new;
end $$;
create trigger help_queue_support_alert after insert or update of team on public.help_requests for each row execute function private.help_queue_support_alert();

create function private.help_alert_jobs(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.help_support_alerts; result jsonb:='[]'::jsonb; snapshot jsonb; next_state text;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Worker access required.' using errcode='42501'; end if;
 if p_action='claim' then
   update public.help_support_alerts set state='needs_review',last_error='Safe delivery retry window exhausted'
     where state in ('pending','leased') and available_at<=clock_timestamp()
       and (attempts>=8 or first_attempt_at<clock_timestamp()-interval '23 hours');
   for job in select * from public.help_support_alerts where state in ('pending','leased') and available_at<=clock_timestamp()
      order by available_at,id limit 10 for update skip locked loop
     update public.help_support_alerts set state='leased',lease_id=gen_random_uuid(),attempts=attempts+1,
       first_attempt_at=coalesce(first_attempt_at,clock_timestamp()),available_at=clock_timestamp()+interval '3 minutes'
       where id=job.id returning * into job;
     select jsonb_build_object('id',job.id,'leaseId',job.lease_id,'kind',job.kind,'payload',job.payload,
       'requestId',h.id,'reference','4M-'||upper(left(replace(h.id::text,'-',''),10)),
       'event',c.event_name,'topic',h.topic) into snapshot from public.help_requests h left join public.calendar c on c.id=h.event_id where h.id=job.request_id;
     result:=result||jsonb_build_array(snapshot);
   end loop;
   return result;
 end if;
 select * into job from public.help_support_alerts where id=(p_data->>'id')::uuid and lease_id=(p_data->>'leaseId')::uuid and state='leased' for update;
 if job.id is null then return null; end if;
 if p_action='prepare' then
   if job.payload is null then
     if p_data->'payload'->'to' is distinct from '["info@4mpadel.co.za"]'::jsonb then raise exception 'Invalid support recipient.'; end if;
     update public.help_support_alerts set payload=p_data->'payload' where id=job.id returning * into job;
   end if;
   return job.payload;
 elsif p_action='finish' then
   if p_data->>'status'='sent' then
     if nullif(p_data->>'providerId','') is null then raise exception 'Provider acceptance required.'; end if;
     update public.help_support_alerts set state='sent',provider_id=left(p_data->>'providerId',160),last_error=null where id=job.id;
   elsif p_data->>'status'='retry' then
     next_state:=case when job.attempts>=8 or job.first_attempt_at<clock_timestamp()-interval '23 hours' then 'needs_review' else 'pending' end;
     update public.help_support_alerts set state=next_state,last_error=left(p_data->>'error',160),
       available_at=clock_timestamp()+make_interval(secs=>least(3600,30*power(2,least(job.attempts,7)))::integer) where id=job.id;
   else raise exception 'Invalid delivery state.'; end if;
   return jsonb_build_object('saved',true);
 end if;
 raise exception 'Invalid worker action.';
end $$;
create function public.help_alert_jobs(p_action text,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select private.help_alert_jobs(p_action,p_data) $$;
revoke all on function private.help_entry_route(uuid,uuid),private.help_dispatch_alerts(),private.help_queue_support_alert(),private.help_alert_jobs(text,jsonb),public.help_alert_jobs(text,jsonb) from public,anon,authenticated,service_role;
grant usage on schema private to service_role;
grant execute on function private.help_alert_jobs(text,jsonb),public.help_alert_jobs(text,jsonb) to service_role;
do $$begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
   perform cron.schedule('help-support-email-delivery','* * * * *','select private.help_dispatch_alerts()');
 end if;
end $$;
notify pgrst,'reload schema';
