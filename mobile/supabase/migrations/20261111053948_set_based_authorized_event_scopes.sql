begin;
-- Equivalent event scope computed with joins, not 224 nested can_manage_event
-- calls. No client parameters can select another actor's permissions.
create function private.managed_event_ids() returns setof bigint
language plpgsql stable security definer set search_path='' as $$
declare scope_actor_email text:=lower(auth.email()); tabs text[]; assigned jsonb;
begin
 if not private.permission_actor_active() then return; end if;
 if public.is_super_admin(scope_actor_email) then return query select id from public.calendar;return;end if;
 select a.allowed_tabs,coalesce(a.module_permissions->'event-mgmt'->'allowedEvents','[]') into tabs,assigned from public.admin_sidebar_permissions a where lower(a.email)=scope_actor_email limit 1;
 if coalesce('event-mgmt'=any(tabs),false) and assigned='[]'::jsonb then return query select id from public.calendar;return;end if;
 return query with member_orgs as materialized (
  select om.organisation_id from public.organisation_members om where lower(om.user_email)=scope_actor_email and om.role in('owner','admin')
 ), creator_orgs as materialized (
  select o.id from public.organisations o join public.players p on p.id=o.created_by where lower(p.email)=scope_actor_email
 ), owned_clubs as materialized (
  select cm.club_id from public.club_members cm where lower(cm.user_email)=scope_actor_email and cm.role in('owner','admin')
  union select co.club_id from public.club_organisations co where co.organisation_id in(select organisation_id from member_orgs)
 ) select c.id from public.calendar c where coalesce(assigned,'[]') @> jsonb_build_array(c.id)
  or c.organisation_id in(select organisation_id from member_orgs)
  or c.organisation_id in(select id from creator_orgs)
  or c.club_id in(select club_id from owned_clubs)
  or lower(c.organiser_email)=scope_actor_email
  or exists(select 1 from unnest(c.event_co_admins) e where lower(e)=scope_actor_email);
end $$;
create or replace function private.finance_event_ids() returns setof bigint
language plpgsql stable security definer set search_path='' as $$
declare scope_actor_email text:=lower(auth.email()); tabs text[]; assigned jsonb;
begin
 if not private.permission_actor_active() then return;end if;
 if public.is_super_admin(scope_actor_email) then return query select id from public.calendar;return;end if;
 select a.allowed_tabs,coalesce(a.module_permissions->'finance'->'allowedEvents','[]') into tabs,assigned from public.admin_sidebar_permissions a where lower(a.email)=scope_actor_email limit 1;
 if coalesce('finance'=any(tabs),false) and assigned='[]'::jsonb then return query select id from public.calendar;return;end if;
 return query select * from private.managed_event_ids()
 union select c.id from public.calendar c where coalesce('finance'=any(tabs),false) and coalesce(assigned,'[]') @> jsonb_build_array(c.id);
end $$;
create or replace function private.managed_event_player_emails() returns setof text
language sql stable security definer set search_path='' as $$
 with managed as materialized(select private.managed_event_ids() as id)
 select lower(r.email) from public.event_registrations r join managed e on e.id=r.event_id where r.email is not null
 union select lower(r.partner_email) from public.event_registrations r join managed e on e.id=r.event_id where r.partner_email is not null
 union select lower(p.email) from public.tournament_participants p join managed e on e.id=p.event_id where p.email is not null
$$;
revoke all on function private.managed_event_ids(),private.finance_event_ids(),private.managed_event_player_emails() from public,anon,authenticated,service_role;
grant execute on function private.managed_event_ids(),private.finance_event_ids(),private.managed_event_player_emails() to authenticated;
notify pgrst,'reload schema';
commit;
