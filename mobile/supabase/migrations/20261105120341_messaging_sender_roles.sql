-- Event role is presentation metadata, never an authorization input.
-- Existing event posts are classified from current trusted event assignments;
-- new posts capture the verified posting role and keep it after role changes.
alter table messaging.messages add column sender_role text check(sender_role in ('admin','organiser','player'));
create function messaging.event_sender_role(p_event bigint,p_user uuid) returns text language sql stable security definer set search_path='' as $$
  select case when exists(select 1 from public.calendar c where c.id=p_event and (
    lower(trim(c.organiser_email))=lower(trim(u.email))
    or exists(select 1 from unnest(c.event_co_admins) email where lower(trim(email))=lower(trim(u.email)))
    or exists(select 1 from public.organisation_members member where member.organisation_id=c.organisation_id
      and lower(trim(member.user_email))=lower(trim(u.email)) and member.role in ('owner','admin'))
    or exists(select 1 from public.organisations organisation join public.players creator on creator.id=organisation.created_by
      where organisation.id=c.organisation_id and lower(trim(creator.email))=lower(trim(u.email)))
  )) then 'organiser'
  when public.is_super_admin(u.email) or exists(select 1 from public.admin_sidebar_permissions permission
    where lower(trim(permission.email))=lower(trim(u.email))
      and coalesce(permission.module_permissions->'event-mgmt'->'allowedEvents','[]'::jsonb) @> jsonb_build_array(p_event)) then 'admin'
  else 'player' end from auth.users u where u.id=p_user
$$;
revoke all on function messaging.event_sender_role(bigint,uuid) from public,anon,authenticated,service_role;
update messaging.messages m set sender_role=messaging.event_sender_role(c.event_id,m.sender_id)
  from messaging.conversations c where c.id=m.conversation_id and c.event_id is not null and m.sender_id is not null;
create function messaging.capture_sender_role() returns trigger language plpgsql security definer set search_path='' as $$
declare event bigint;
begin
  select event_id into event from messaging.conversations where id=new.conversation_id;
  new.sender_role:=null;
  if event is not null and new.sender_id is not null then
    new.sender_role:='player';
    if (new.sender_id=auth.uid() and auth.jwt()->>'aal'='aal2' and messaging.manager(event))
      or (auth.uid() is null and (auth.jwt()->>'role'='service_role' or (current_setting('role')='none' and exists(select 1 from pg_roles where rolname=session_user and (rolsuper or rolbypassrls))))) then
      new.sender_role:=coalesce(messaging.event_sender_role(event,new.sender_id),'player');
    end if;
  end if;
  return new;
end $$;
create trigger messaging_capture_sender_role before insert on messaging.messages for each row execute function messaging.capture_sender_role();
revoke all on function messaging.capture_sender_role() from public,anon,authenticated,service_role;

create or replace function messaging.message_json(p_message uuid,p_user uuid) returns jsonb language sql stable security definer set search_path='' set timezone='Africa/Johannesburg' as $$
  select jsonb_build_object('id',m.id,'seq',m.seq,'body',case when m.deleted_at is null then m.body else '' end,
    'mine',m.sender_id=p_user,'sender',jsonb_build_object('id',p.id::text,'name',coalesce(p.name,'Former player'),'image',p.image_url,'role',m.sender_role),
    'createdAt',m.created_at,'deleted',m.deleted_at is not null,
    'reply',case when m.deleted_at is null and r.deleted_at is null and r.conversation_id=m.conversation_id and messaging.visible(r.id,p_user) then
      jsonb_build_object('id',r.id,'body',left(r.body,160),'name',coalesce(rp.name,'Former player'),'role',r.sender_role,'mine',r.sender_id=p_user) end,
    'card',case when m.deleted_at is null and e.id is not null and e.is_visible=true and (e.sanction_status is null or e.sanction_status='approved') then
      jsonb_build_object('eventId',e.id,'title',e.event_name,'date',e.start_date,'tab',coalesce(m.card_tab,'Overview')) end)
  from messaging.messages m left join messaging.accounts a on a.user_id=m.sender_id left join public.players p on p.id=a.player_id
    left join messaging.messages r on r.id=m.reply_id left join messaging.accounts ra on ra.user_id=r.sender_id
    left join public.players rp on rp.id=ra.player_id left join public.calendar e on e.id=m.card_event_id
  where m.id=p_message and messaging.visible(m.id,p_user)
$$;
revoke all on function messaging.message_json(uuid,uuid) from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
