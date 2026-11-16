-- Begin read tracking from this release; historical inbox rows do not become a
-- surprise unread backlog. New notifications default to unread after this DDL.
alter table public.push_outbox add column read_at timestamptz default now();
alter table public.push_outbox alter column read_at drop default;
create index push_outbox_unread_email on public.push_outbox(lower(trim(email)),created_at desc)
  where read_at is null and not obsolete;

create function messaging.notification_unread(p_user uuid) returns bigint language sql stable security definer set search_path='' as $$
  select count(*) from public.push_outbox o join auth.users u on lower(trim(u.email))=lower(trim(o.email))
  where u.id=p_user and u.deleted_at is null and u.email_confirmed_at is not null
    and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<now())
    and o.read_at is null and not o.obsolete and o.not_before<=now();
$$;
create function messaging.app_badge_total(p_user uuid) returns bigint language sql stable security definer set search_path='' as $$
  select least(99999,messaging.unread_total(p_user)+messaging.notification_unread(p_user));
$$;
create or replace function messaging.own_unread_total() returns bigint language plpgsql security definer set search_path='' as $$
begin return messaging.app_badge_total(messaging.actor()); end $$;
create or replace function messaging.unread_for_email(p_email text) returns bigint language sql stable security definer set search_path='' as $$
  select coalesce((select messaging.app_badge_total(u.id) from auth.users u where lower(trim(u.email))=lower(trim(p_email))
    and u.deleted_at is null and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
    and (u.banned_until is null or u.banned_until<now())),0);
$$;
-- Compatibility for existing app-badge/worker deployments: pending is always 0,
-- valid is always true, and unread is the complete notification + chat total.
create or replace function messaging.badge_cache_api(p_action text,p_email text,p_count integer default null,p_revision bigint default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare total bigint;
begin
  if p_action is null or p_action not in ('get','cached','store') then raise exception 'Unsupported badge action'; end if;
  total:=messaging.unread_for_email(p_email);
  return jsonb_build_object('pending',0,'valid',true,'revision',0,'unread',total,'total',total);
end $$;
update messaging.badge_cache set pending_count=0;
-- Payment/profile changes remain in Home's action list; they no longer invalidate a badge.
drop trigger messaging_badge_profile on public.players;
drop trigger messaging_badge_registration on public.event_registrations;
drop trigger messaging_badge_payment on public.payments;
drop trigger messaging_badge_event on public.calendar;
drop trigger messaging_badge_division on public.tournament_divisions;

do $patch$
declare definition text; corrected text;
begin
  definition:=pg_get_functiondef('messaging.delivery_api(text,jsonb)'::regprocedure);
  corrected:=replace(definition,'least(99999,messaging.unread_total(job.user_id)+coalesce((select pending_count from messaging.badge_cache where user_id=job.user_id),0))','messaging.app_badge_total(job.user_id)');
  if corrected=definition then raise exception 'Expected messaging delivery badge expression not found'; end if;
  execute corrected;
end $patch$;

create function messaging.notification_snapshot(p_user uuid) returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('unread',messaging.notification_unread(p_user),'through',now(),'items',coalesce((
    select jsonb_agg(item order by created_at desc,id desc) from (
      select o.id,o.created_at,jsonb_build_object('id',o.id,'type',o.type,'title',o.title,'body',o.body,'path',o.path,'created_at',o.created_at,'read_at',o.read_at) item
      from public.push_outbox o join auth.users u on lower(trim(u.email))=lower(trim(o.email))
      where u.id=p_user and not o.obsolete and o.not_before<=now()
      order by o.created_at desc,o.id desc limit 50
    ) recent
  ),'[]'::jsonb));
$$;
create function messaging.notification_api(p_action text,p_ids uuid[] default null,p_before timestamptz default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=messaging.actor(); address text; requested integer;
begin
  select lower(trim(email)) into address from auth.users where id=uid;
  if p_action='read' then
    if p_ids is null then
      if p_before is null or p_before>now() then raise exception 'Choose the notifications to mark read.'; end if;
      update public.push_outbox set read_at=clock_timestamp()
        where lower(trim(email))=address and read_at is null and not obsolete and not_before<=now() and created_at<=p_before;
    else
      if cardinality(p_ids) not between 1 and 50 or array_position(p_ids,null) is not null then raise exception 'Choose up to 50 notifications.'; end if;
      select count(distinct value) into requested from unnest(p_ids) value;
      if (select count(*) from public.push_outbox o where o.id=any(p_ids) and lower(trim(o.email))=address and not o.obsolete and o.not_before<=now())<>requested then
        raise exception 'Notification unavailable.' using errcode='42501';
      end if;
      update public.push_outbox set read_at=clock_timestamp()
        where id=any(p_ids) and lower(trim(email))=address and read_at is null;
    end if;
  elsif p_action is distinct from 'list' then raise exception 'Unsupported notification action.'; end if;
  return messaging.notification_snapshot(uid);
end $$;
create function public.player_notification_api(p_action text,p_ids uuid[] default null,p_before timestamptz default null) returns jsonb
language sql security invoker set search_path='' as $$select messaging.notification_api(p_action,p_ids,p_before)$$;

create function messaging.notification_changed() returns trigger language plpgsql security definer set search_path='' as $$
declare recipient record;
begin
  if tg_op='UPDATE' and jsonb_build_array(old.read_at,old.obsolete,old.not_before,old.expanded_at,old.email)
    is not distinct from jsonb_build_array(new.read_at,new.obsolete,new.not_before,new.expanded_at,new.email) then return null; end if;
  for recipient in select id from auth.users where deleted_at is null and lower(trim(email))=lower(trim(new.email)) loop
    perform messaging.signal(recipient.id);
  end loop;
  return null;
end $$;
create trigger messaging_notification_badge after insert or update of read_at,obsolete,not_before,expanded_at,email on public.push_outbox
  for each row execute function messaging.notification_changed();

revoke all on function messaging.notification_unread(uuid),messaging.app_badge_total(uuid),messaging.notification_snapshot(uuid),messaging.notification_api(text,uuid[],timestamptz),messaging.notification_changed(),public.player_notification_api(text,uuid[],timestamptz) from public,anon,authenticated,service_role;
grant execute on function messaging.notification_api(text,uuid[],timestamptz),public.player_notification_api(text,uuid[],timestamptz) to authenticated;
-- Existing RPC access remains exactly as before: own count for users; email counts/cache for workers.
revoke all on function messaging.own_unread_total(),messaging.unread_for_email(text),messaging.badge_cache_api(text,text,integer,bigint) from public,anon,authenticated,service_role;
grant execute on function messaging.own_unread_total() to authenticated;
grant execute on function messaging.unread_for_email(text),messaging.badge_cache_api(text,text,integer,bigint) to service_role;
notify pgrst,'reload schema';
