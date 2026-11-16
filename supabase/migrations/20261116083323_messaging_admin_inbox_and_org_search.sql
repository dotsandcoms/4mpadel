-- Repair hosted address-column ambiguity without changing eligibility rules.

create or replace function messaging.event_access(p_event bigint,p_user uuid) returns int language plpgsql stable security definer set search_path='' set timezone='Africa/Johannesburg' as $$
declare v_user_email text; has_entry boolean; confirmed boolean; imported boolean;
begin
  select lower(trim(u.email)) into v_user_email from auth.users u join messaging.accounts a on a.user_id=u.id
    where u.id=p_user and u.deleted_at is null and u.email_confirmed_at is not null and not a.suspended;
  if v_user_email is null then return 0; end if;
  select exists(select 1 from public.event_registrations r where r.event_id=p_event
    and lower(coalesce(r.status,'')) in ('registered','confirmed','approved','active')
    and (lower(trim(r.email))=v_user_email or (lower(trim(r.partner_email))=v_user_email and not exists(
      select 1 from public.event_registrations w where w.event_id=p_event and w.division_id is not distinct from r.division_id
        and lower(trim(w.email))=v_user_email and lower(w.status)='withdrawn'
        and not exists(select 1 from public.event_registrations live where live.event_id=p_event
          and live.division_id is not distinct from r.division_id and lower(trim(live.email))=v_user_email
          and lower(coalesce(live.status,'')) in ('registered','confirmed','approved','active')))))) into has_entry;
  select exists(select 1 from public.event_registrations r where r.event_id=p_event
    and lower(coalesce(r.status,'')) in ('registered','confirmed','approved','active')
    and lower(trim(r.email))=v_user_email and lower(coalesce(r.payment_status,'')) in ('paid','free','comped','complimentary','waived')
    and exists(select 1 from messaging.entry_confirmations proof where proof.source='registration' and proof.source_id=r.id and proof.proof=messaging.entry_proof(to_jsonb(r)))) into confirmed;
  -- A single-row partner entry is confirmed only by its own partner payment state,
  -- not by the payer's payment. Explicit approval handles older single-row teams.
  confirmed:=confirmed or exists(select 1 from public.event_registrations r where r.event_id=p_event
    and lower(coalesce(r.status,'')) in ('registered','confirmed','approved','active')
    and lower(trim(r.partner_email))=v_user_email and lower(coalesce(r.partner_payment_status,'')) in ('paid','free','comped','complimentary','waived')
    and exists(select 1 from messaging.entry_confirmations proof where proof.source='registration' and proof.source_id=r.id and proof.proof=messaging.entry_proof(to_jsonb(r))));
  select exists(select 1 from public.tournament_participants t where t.event_id=p_event and lower(trim(t.email))=v_user_email)
    and not exists(select 1 from public.event_registrations w where w.event_id=p_event and lower(trim(w.email))=v_user_email
      and lower(w.status)='withdrawn' and not has_entry) into imported;
  if not(has_entry or imported) then return 0; end if;
  if confirmed or (imported and exists(select 1 from public.tournament_participants t join messaging.entry_confirmations proof
    on proof.source='import' and proof.source_id=t.id and proof.proof=messaging.entry_proof(to_jsonb(t)) where t.event_id=p_event and lower(trim(t.email))=v_user_email)) or exists(select 1 from messaging.event_approvals where event_id=p_event and user_id=p_user) then return 2; end if;
  return 1;
end $$;

create or replace function messaging.scope_player(p_scope text,p_user uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare v_user_email text;
begin
  if p_scope='platform' then return true; end if;
  if p_scope~'^event:[1-9][0-9]*$' then return messaging.event_access(substring(p_scope from 7)::bigint,p_user)>0; end if;
  if p_scope~'^org:[0-9a-f-]{36}$' then
    select lower(trim(u.email)) into v_user_email from auth.users u join messaging.accounts a on a.user_id=u.id where a.user_id=p_user;
    return exists(select 1 from public.calendar e where e.organisation_id=substring(p_scope from 5)::uuid and e.id in (
      select r.event_id from public.event_registrations r where lower(trim(r.email))=v_user_email or lower(trim(r.partner_email))=v_user_email
      union select t.event_id from public.tournament_participants t where lower(trim(t.email))=v_user_email
    ) and messaging.event_access(e.id,p_user)>0);
  end if;
  return false;
end $$;

-- Existing mobile clients keep the array-shaped admin_inbox action. The web queue
-- has a separate, bounded RPC with keyset pagination and server-side filters.
create or replace function public.messaging_admin_inbox(p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid := messaging.actor();
  v_scope text := coalesce(nullif(p_data->>'scope',''),'all');
  v_query text := btrim(coalesce(p_data->>'query',''));
  v_kind text := coalesce(p_data->>'kind','all');
  v_status text := coalesce(p_data->>'status','all');
  v_before_at timestamptz;
  v_before_id uuid;
  v_rows jsonb;
  v_next jsonb;
begin
  if not exists(select 1 from messaging.configuration where groups_enabled)
    or not messaging.enabled_for(v_uid) or not messaging.interactive(v_uid) then
    raise exception 'Complete messaging setup before opening player messages.' using errcode='42501';
  end if;
  if auth.jwt()->>'aal' is distinct from 'aal2' then
    raise exception 'Verify your account with two-factor authentication to message players.' using errcode='42501';
  end if;
  if v_scope<>'all' and not messaging.admin_scope(v_scope) then
    raise exception 'Messaging access denied for this organisation or audience.' using errcode='42501';
  end if;
  if char_length(v_query)>120 or v_kind not in ('all','private','group') or v_status not in ('all','unread','waiting') then
    raise exception 'Choose a valid conversation search and filters.';
  end if;
  if p_data->'before' is not null and p_data->'before'<>'null'::jsonb then
    v_before_at := (p_data->'before'->>'updatedAt')::timestamptz;
    v_before_id := (p_data->'before'->>'id')::uuid;
    if v_before_at is null or v_before_id is null then raise exception 'Choose a valid conversation page.'; end if;
  end if;
  with candidates as materialized (
    select g.conversation_id, g.scope, g.source, c.updated_at
    from messaging.groups g join messaging.conversations c on c.id=g.conversation_id
    where g.creator_id=v_uid and g.source in ('admin_direct','admin_group')
      and (v_scope='all' or g.scope=v_scope)
      and messaging.admin_scope(g.scope) and messaging.group_access(g.conversation_id,v_uid)
      and (v_kind='all' or (v_kind='private' and g.source='admin_direct') or (v_kind='group' and g.source='admin_group'))
      and (v_query='' or position(lower(v_query) in lower(g.title))>0 or exists(
        select 1 from messaging.group_members gm join messaging.accounts a on a.user_id=gm.user_id
        join public.players p on p.id=a.player_id where gm.conversation_id=g.conversation_id
          and gm.user_id<>v_uid and position(lower(v_query) in lower(p.name))>0))
      and (v_status<>'waiting' or exists(select 1 from messaging.group_members gm
        where gm.conversation_id=g.conversation_id and gm.user_id<>v_uid and gm.status='invited'))
      and (v_status<>'unread' or exists(select 1 from messaging.messages m
        join messaging.members mm on mm.conversation_id=m.conversation_id and mm.user_id=v_uid
        where m.conversation_id=g.conversation_id and m.sender_id is distinct from v_uid and m.deleted_at is null
          and (m.seq>mm.read_seq or (mm.marked_unread_from is not null and m.seq>=mm.marked_unread_from))
          and messaging.visible(m.id,v_uid)))
      and (v_before_at is null or (c.updated_at,g.conversation_id)<(v_before_at,v_before_id))
    order by c.updated_at desc,g.conversation_id desc limit 51
  ), numbered as (
    select *,row_number() over(order by updated_at desc,conversation_id desc) n from candidates
  ), items as (
    select n,updated_at,conversation_id,
      messaging.conversation_json(conversation_id,v_uid)||jsonb_build_object(
        'activityAt',updated_at,
        'senderLabel',case when scope='platform' then '4M Padel'
          when scope like 'org:%' then (select o.name from public.organisations o where o.id=substring(scope from 5)::uuid)
          when scope like 'event:%' then (select e.event_name from public.calendar e where e.id=substring(scope from 7)::bigint) end,
        'participants',(select coalesce(jsonb_agg(names.name order by names.name),'[]') from (
          select p.name from messaging.group_members gm join messaging.accounts a on a.user_id=gm.user_id
          join public.players p on p.id=a.player_id where gm.conversation_id=numbered.conversation_id
            and gm.user_id<>v_uid and gm.status<>'left' order by p.name,p.id limit 3) names),
        'participantCount',(select count(*) from messaging.group_members gm where gm.conversation_id=numbered.conversation_id and gm.user_id<>v_uid and gm.status<>'left'),
        'waitingCount',(select count(*) from messaging.group_members gm where gm.conversation_id=numbered.conversation_id and gm.user_id<>v_uid and gm.status='invited')
      ) item
    from numbered where n<=50
  )
  select coalesce((select jsonb_agg(item order by n) from items),'[]'),
    case when exists(select 1 from numbered where n=51) then
      (select jsonb_build_object('updatedAt',updated_at,'id',conversation_id) from numbered where n=50) end
  into v_rows,v_next;
  return jsonb_build_object('rows',v_rows,'next',v_next);
end $$;

revoke all on function public.messaging_admin_inbox(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.messaging_admin_inbox(jsonb) to authenticated;
-- These remain private helpers, including after CREATE OR REPLACE.
revoke all on function messaging.event_access(bigint,uuid),messaging.scope_player(text,uuid) from public,anon,authenticated,service_role;
