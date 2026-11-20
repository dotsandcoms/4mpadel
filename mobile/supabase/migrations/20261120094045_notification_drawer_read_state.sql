-- Drawer read state is independent of delivery and app-icon unread state.
alter table public.push_outbox add column drawer_read_at timestamptz;

create function messaging.notification_drawer_snapshot(p_user uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  with recipient as (
    select lower(trim(email)) as email from auth.users where id=p_user
  )
  select jsonb_build_object(
    'unread', (
      select count(*) from public.push_outbox o join recipient r on lower(trim(o.email))=r.email
      where o.read_at is null and o.drawer_read_at is null and not o.obsolete and o.not_before<=now()
    ),
    'through', now(),
    'drawerReadAvailable', true,
    'items', coalesce((
      select jsonb_agg(item order by created_at desc,id desc) from (
        select o.id,o.created_at,jsonb_build_object(
          'id',o.id,'type',o.type,'title',o.title,'body',o.body,'path',o.path,'created_at',o.created_at,
          'read_at',coalesce(o.read_at,o.drawer_read_at),'badge_unread',o.read_at is null
        ) as item
        from public.push_outbox o join recipient r on lower(trim(o.email))=r.email
        where not o.obsolete and o.not_before<=now()
        order by o.created_at desc,o.id desc limit 50
      ) recent
    ),'[]'::jsonb)
  );
$$;

create or replace function messaging.notification_api(p_action text,p_ids uuid[] default null,p_before timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=messaging.actor(); address text; requested integer;
begin
  select lower(trim(email)) into address from auth.users where id=uid;
  if p_action='read_drawer' then
    if p_ids is not null or p_before is null or p_before>now() then
      raise exception 'Refresh notifications before marking all read.';
    end if;
    update public.push_outbox set drawer_read_at=clock_timestamp()
      where lower(trim(email))=address and read_at is null and drawer_read_at is null
        and not obsolete and not_before<=p_before and created_at<=p_before;
  elsif p_action in ('read','read_drawer_items') then
    if p_ids is null then
      if p_action='read_drawer_items' or p_before is null or p_before>now() then
        raise exception 'Choose the notifications to mark read.';
      end if;
      update public.push_outbox set read_at=clock_timestamp()
        where lower(trim(email))=address and read_at is null and not obsolete and not_before<=now() and created_at<=p_before;
    else
      if cardinality(p_ids) not between 1 and 50 or array_position(p_ids,null) is not null then
        raise exception 'Choose up to 50 notifications.';
      end if;
      select count(distinct value) into requested from unnest(p_ids) value;
      if (select count(*) from public.push_outbox o where o.id=any(p_ids)
          and lower(trim(o.email))=address and not o.obsolete and o.not_before<=now())<>requested then
        raise exception 'Notification unavailable.' using errcode='42501';
      end if;
      update public.push_outbox set read_at=clock_timestamp()
        where id=any(p_ids) and lower(trim(email))=address and read_at is null;
    end if;
  elsif p_action is distinct from 'list' and p_action is distinct from 'list_drawer' then
    raise exception 'Unsupported notification action.';
  end if;

  if p_action in ('list_drawer','read_drawer','read_drawer_items') then
    return messaging.notification_drawer_snapshot(uid);
  end if;
  return messaging.notification_snapshot(uid);
end $$;

revoke all on function messaging.notification_drawer_snapshot(uuid) from public,anon,authenticated,service_role;
