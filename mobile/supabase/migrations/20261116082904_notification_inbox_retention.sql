-- Inbox retention is separate from push delivery expiry. Keep event updates
-- through the final event day in South Africa; retain other updates for 14 days.
-- Filter at read time so notification audit/delivery records remain intact.
create or replace function messaging.notification_is_current(p_notification public.push_outbox,p_now timestamptz default now())
returns boolean language plpgsql stable set search_path='' as $function$
declare event_key text; event_id bigint; final_day date;
begin
  if p_now is null or p_notification.obsolete or p_notification.not_before>p_now then return false; end if;
  event_key:=p_notification.data->>'event_id';
  if event_key is null or event_key !~ '^[1-9][0-9]{0,17}$' then
    event_key:=substring(p_notification.path from '^/events/([1-9][0-9]{0,17})(?:[?]|$)');
    if event_key is null and p_notification.path ~ '^/events/register[?]' then
      event_key:=substring(p_notification.path from '[?&]id=([1-9][0-9]{0,17})(?:&|$)');
    end if;
  end if;
  if event_key is not null then
    event_id:=event_key::bigint;
    select coalesce(c.end_date,c.start_date) into final_day from public.calendar c where c.id=event_id;
    if not found then return false; end if;
    if final_day is not null then return final_day>=(p_now at time zone 'Africa/Johannesburg')::date; end if;
  end if;
  return coalesce(p_notification.created_at>=p_now-interval '14 days',false);
end $function$;
revoke all on function messaging.notification_is_current(public.push_outbox,timestamptz) from public,anon,authenticated,service_role;

create or replace function messaging.notification_unread(p_user uuid) returns bigint
language sql stable security definer set search_path='' as $function$
  select count(*) from public.push_outbox o join auth.users u on lower(trim(u.email))=lower(trim(o.email))
  where u.id=p_user and u.deleted_at is null and u.email_confirmed_at is not null
    and not coalesce(u.is_anonymous,false) and (u.banned_until is null or u.banned_until<now())
    and o.read_at is null and messaging.notification_is_current(o);
$function$;
revoke all on function messaging.notification_unread(uuid) from public,anon,authenticated,service_role;

create or replace function messaging.notification_snapshot(p_user uuid) returns jsonb
language sql stable security definer set search_path='' as $function$
  select jsonb_build_object('unread',messaging.notification_unread(p_user),'through',now(),'items',coalesce((
    select jsonb_agg(item order by created_at desc,id desc) from (
      select o.id,o.created_at,jsonb_build_object('id',o.id,'type',o.type,'title',o.title,'body',o.body,'path',o.path,'created_at',o.created_at,'read_at',o.read_at) item
      from public.push_outbox o join auth.users u on lower(trim(u.email))=lower(trim(o.email))
      where u.id=p_user and messaging.notification_is_current(o)
      order by o.created_at desc,o.id desc limit 50
    ) recent
  ),'[]'::jsonb));
$function$;
revoke all on function messaging.notification_snapshot(uuid) from public,anon,authenticated,service_role;

-- Older app builds use this RPC; apply the same policy before its row limit.
create or replace function public.get_player_notifications()
returns table(id uuid,type text,title text,body text,path text,created_at timestamptz)
language sql stable security definer set search_path='' as $function$
  select o.id,o.type,o.title,o.body,o.path,o.created_at from public.push_outbox o
  where auth.uid() is not null and lower(o.email)=lower(trim(auth.jwt()->>'email'))
    and messaging.notification_is_current(o)
  order by o.created_at desc limit 50;
$function$;
revoke all on function public.get_player_notifications() from public,anon,authenticated,service_role;
grant execute on function public.get_player_notifications() to authenticated;

notify pgrst,'reload schema';
