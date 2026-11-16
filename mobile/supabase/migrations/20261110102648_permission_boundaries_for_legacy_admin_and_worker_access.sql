-- Forward correction for legacy policies which equated signed-in with admin.
-- Keep public catalogue reads; writes must also pass an explicit role/scope
-- boundary, even if another old permissive policy remains on the table.
begin;

create or replace function private.permission_actor_active()
returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from auth.users u join auth.sessions s on s.user_id=u.id
    where u.id=auth.uid() and u.deleted_at is null
      and (u.banned_until is null or u.banned_until<now())
      and not coalesce(u.is_anonymous,false)
      and lower(u.email)=lower(auth.jwt()->>'email')
      and s.id::text=auth.jwt()->>'session_id'
      and (s.not_after is null or s.not_after>now())
  )
$$;

create or replace function private.admin_module(p_tab text)
returns boolean language sql stable security definer set search_path='' as $$
  select private.permission_actor_active() and (
    public.is_super_admin(auth.email()) or exists (
      select 1 from public.admin_sidebar_permissions a
      where lower(a.email)=lower(auth.email())
        and (a.role='super_admin' or p_tab=any(a.allowed_tabs))
    )
  )
$$;

create or replace function private.manage_album(p_album uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select private.permission_actor_active() and (
    public.is_super_admin(auth.email()) or exists (
      select 1 from public.admin_sidebar_permissions a
      where lower(a.email)=lower(auth.email()) and (
        coalesce(a.module_permissions->'gallery'->'allowedAlbums','[]'::jsonb) @> jsonb_build_array(p_album::text)
        or ('gallery'=any(a.allowed_tabs)
          and coalesce(a.module_permissions->'gallery'->'allowedAlbums','[]'::jsonb)='[]'::jsonb)
      )
    )
  )
$$;

create or replace function private.create_album()
returns boolean language sql stable security definer set search_path='' as $$
  select private.admin_module('gallery') and (
    public.is_super_admin(auth.email()) or exists (
      select 1 from public.admin_sidebar_permissions a
      where lower(a.email)=lower(auth.email())
        and coalesce(a.module_permissions->'gallery'->'allowedAlbums','[]'::jsonb)='[]'::jsonb
    )
  )
$$;

create or replace function private.manage_club(p_club uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select private.permission_actor_active()
    and (private.admin_module('clubs') or public.can_manage_club(p_club))
$$;

create or replace function private.edit_event(p_event bigint)
returns boolean language sql stable security definer set search_path='' as $$
  select private.permission_actor_active()
    and (private.admin_module('calendar') or (p_event is not null and public.can_manage_event(p_event)))
$$;

revoke all on function private.permission_actor_active(),private.admin_module(text),
  private.manage_album(uuid),private.create_album(),private.manage_club(uuid),private.edit_event(bigint)
  from public,anon,authenticated,service_role;
grant execute on function private.permission_actor_active(),private.admin_module(text),
  private.manage_album(uuid),private.create_album(),private.manage_club(uuid),private.edit_event(bigint)
  to authenticated,service_role;

-- Restrictive policies cannot be bypassed by a second permissive legacy rule.
do $$
declare target record; operation text;
begin
  for target in select * from (values
    ('calendar', '(private.admin_module(''calendar'') or (private.permission_actor_active() and (public.can_manage_event(id) or public.can_manage_calendar_event(organisation_id,club_id))))'),
    ('events', 'private.admin_module(''calendar'')'),
    ('settings', 'private.admin_module(''settings'')'),
    ('blogs', 'private.admin_module(''blog'')'),
    ('club_groups', 'private.admin_module(''clubs'')'),
    ('clubs', 'private.manage_club(id)'),
    ('club_google_matches', 'private.manage_club(club_id)'),
    -- Linking a foreign club to your organisation must not grant its ownership.
    ('club_organisations', '(private.admin_module(''clubs'') or (private.permission_actor_active() and public.can_manage_club(club_id) and public.is_organisation_admin(organisation_id)))'),
    ('gallery_images', 'private.manage_album(album_id)'),
    ('tournament_divisions', 'private.edit_event(event_id)'),
    ('tournament_draws', 'exists(select 1 from public.tournament_divisions d where d.id=division_id and private.edit_event(d.event_id))'),
    ('tournament_matches', 'exists(select 1 from public.tournament_divisions d where d.id=division_id and private.edit_event(d.event_id))'),
    ('ranking_history', 'private.admin_module(''players'')'),
    ('ranking_points_config', 'private.admin_module(''settings'')'),
    ('rankedin_cache', 'false'),
    ('rankedin_results_cache', 'private.admin_module(''calendar'')'),
    ('player_matches', 'false')
  ) as rules(table_name, expression)
  loop
    if to_regclass('public.'||target.table_name) is null then
      raise exception 'Missing expected legacy table: %',target.table_name;
    end if;
    foreach operation in array array['insert','update','delete'] loop
      execute format('create policy %I on public.%I as restrictive for %s to authenticated %s',
        'permission_boundary_'||operation,target.table_name,operation,
        case operation
          when 'insert' then 'with check ('||target.expression||')'
          when 'update' then 'using ('||target.expression||') with check ('||target.expression||')'
          else 'using ('||target.expression||')' end);
    end loop;
    execute format('revoke insert, update, delete on public.%I from anon',target.table_name);
  end loop;
end $$;
-- CalendarManager's explicit result-sync action is an authorised admin write.
grant insert,update on public.rankedin_results_cache to authenticated;

-- Row ownership must not be transferred through an ordinary event edit.
create or replace function private.protect_event_owner_boundary()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if coalesce(auth.role(),'')='authenticated' and not private.admin_module('calendar')
    and (new.organisation_id is distinct from old.organisation_id or new.club_id is distinct from old.club_id) then
    raise exception 'Only a Calendar administrator can transfer an event.' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function private.protect_event_owner_boundary() from public,anon,authenticated,service_role;
create trigger protect_event_owner_boundary before update of organisation_id,club_id on public.calendar
  for each row execute function private.protect_event_owner_boundary();

create policy permission_boundary_insert on public.albums as restrictive
  for insert to authenticated with check(private.create_album());
create policy permission_boundary_update on public.albums as restrictive
  for update to authenticated using(private.manage_album(id)) with check(private.manage_album(id));
create policy permission_boundary_delete on public.albums as restrictive
  for delete to authenticated using(private.manage_album(id));
revoke insert,update,delete on public.albums from anon;

-- An assigned album editor may read that album while it is unpublished.
drop policy if exists "Admins can view all albums" on public.albums;
create policy "Assigned editors read albums" on public.albums for select to authenticated
  using(private.manage_album(id));
-- The old ALL policy also exposed inactive albums and images via SELECT.
drop policy if exists "Admins can manage albums" on public.albums;
create policy "Assigned editors manage albums" on public.albums for all to authenticated
  using(private.manage_album(id)) with check(private.manage_album(id) or private.create_album());
drop policy if exists "Admins can manage gallery images" on public.gallery_images;
create policy "Assigned editors manage gallery images" on public.gallery_images for all to authenticated
  using(private.manage_album(album_id)) with check(private.manage_album(album_id));

-- Applications are public submissions, never self-approved directory entries.
drop policy if exists "Admins can manage coach applications" on public.coach_applications;
create policy "Coach admins manage applications" on public.coach_applications for all to authenticated
  using(private.admin_module('coaches')) with check(private.admin_module('coaches'));
drop policy if exists "Public can apply to be a coach" on public.coach_applications;
create policy "Public pending coach applications" on public.coach_applications for insert
  to anon,authenticated with check(status='pending');

-- This is a worker queue, not an authenticated-account messaging API.
revoke all on public.whatsapp_queue from public,anon,authenticated;
grant select,insert,update,delete on public.whatsapp_queue to service_role;

-- Reconcile direct API grants for existing RPC/worker-only infrastructure.
-- Do not touch the intentionally column-granted player_fip_links table.
do $$
declare target text;
begin
  foreach target in array array['push_deliveries','event_notification_follows',
    'tournament_notification_jobs','notification_event_snapshots','notification_match_snapshots'] loop
    if to_regclass('public.'||target) is not null then
      execute format('revoke all on public.%I from public,anon,authenticated',target);
      execute format('grant select,insert,update,delete on public.%I to service_role',target);
    end if;
  end loop;
  foreach target in array array['player_devices','player_push_tokens','event_activity_log'] loop
    if to_regclass('public.'||target) is not null then
      execute format('revoke all on public.%I from public,anon,authenticated',target);
      execute format('grant select on public.%I to authenticated',target);
      execute format('grant select,insert,update,delete on public.%I to service_role',target);
    end if;
  end loop;
end $$;

-- Internal functions can otherwise bypass every row policy above. Nested calls
-- by their owners/triggers still work; only direct client invocation is closed.
do $$
declare signature text; oid regprocedure;
begin
  foreach signature in array array[
    'public.enqueue_push(text,text,text,text,text,jsonb)',
    'public.refresh_tournament_notifications()',
    'public.push_preferences_for_email(text)',
    'public.event_notification_participants(bigint,uuid)',
    'public.notification_match_recipients(uuid)',
    'public.notification_match_state(uuid)',
    'public.plan_tournament_push(bigint,text,text,text,text,text,text,text,jsonb,timestamp with time zone,timestamp with time zone)',
    'public.plan_event_change_push(bigint,text,text,jsonb,jsonb)',
    'public._insert_event_activity(bigint,text,text,text,text,text,jsonb)',
    'public.org_audit(text,text,text,uuid,jsonb)'
  ] loop
    oid:=to_regprocedure(signature);
    if oid is not null then
      execute format('revoke all on function %s from public,anon,authenticated',oid);
      execute format('grant execute on function %s to service_role',oid);
    end if;
  end loop;
end $$;

-- A direct RPC must not mark arbitrary participants paid for a foreign event.
do $$
declare signature regprocedure; definition text;
begin
  signature:=to_regprocedure('public.upsert_tournament_participant(bigint,text,text,text,bigint,boolean)');
  if signature is not null then
    definition:=pg_get_functiondef(signature);
    if definition !~ E'\\nBEGIN\\y' then raise exception 'Unexpected participant implementation'; end if;
    execute regexp_replace(definition,E'\\nBEGIN\\y',E'\nBEGIN\n'
      || 'if coalesce(auth.role(),'''')<>''service_role'' and not coalesce(private.edit_event(p_event_id),false) then '
      || 'raise exception ''You do not manage this event.'' using errcode=''42501''; end if;');
    execute format('revoke all on function %s from public,anon',signature);
    execute format('grant execute on function %s to authenticated,service_role',signature);
  end if;
end $$;

-- Supabase's earlier explicit grants are not removed by REVOKE FROM PUBLIC.
-- Old profile overloads also bypass the checked v3 signup API. Keep current
-- organisation signup callers working, but authenticate every overload and bind
-- its target email to the caller (or an explicitly assigned Players admin).
do $$
declare f record; definition text;
begin
  for f in select p.oid,p.oid::regprocedure signature from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in('create_player_profile','create_player_profile_pay_later')
  loop
    definition:=pg_get_functiondef(f.oid);
    if definition !~ E'\\nBEGIN\\y' then
      raise exception 'Unexpected profile implementation: %',f.signature;
    end if;
    definition:=regexp_replace(definition,E'\\nBEGIN\\y',E'\nBEGIN\n'
      || '    if coalesce(auth.role(),'''')<>''service_role'' and not coalesce(('
      || 'private.permission_actor_active() and (lower(trim(p_email))=lower(auth.email()) '
      || 'or private.admin_module(''players''))),false) then '
      || 'raise exception ''You can only create your own profile.'' using errcode=''42501''; end if;');
    execute definition;
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to authenticated,service_role',f.signature);
  end loop;
end $$;

-- Shared gallery storage now uses album UUID folders. A scoped editor cannot
-- write/delete arbitrary files by changing a URL in their own album row.
create or replace function private.manage_gallery_path(p_name text)
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
  if private.create_album() then return true; end if;
  if split_part(p_name,'/',1)='posters' then
    return private.admin_module('calendar');
  end if;
  if split_part(p_name,'/',1)='albums'
    and split_part(p_name,'/',2) ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then
    return private.manage_album(split_part(p_name,'/',2)::uuid);
  end if;
  return false;
end $$;
revoke all on function private.manage_gallery_path(text) from public,anon,authenticated,service_role;
grant execute on function private.manage_gallery_path(text) to authenticated,service_role;

do $$
declare operation text; expression text;
begin
  expression:=$expr$(case bucket_id
    when 'blog-images' then private.admin_module('blog')
    when 'gallery' then private.manage_gallery_path(name)
    when 'tournament-media' then private.admin_module('calendar')
    when 'coach-profiles' then (private.admin_module('coaches') or owner_id=auth.uid()::text)
    else true end)$expr$;
  foreach operation in array array['insert','update','delete'] loop
    execute format('create policy %I on storage.objects as restrictive for %s to authenticated %s',
      'admin_media_boundary_'||operation,operation,
      case operation
        when 'insert' then 'with check ('||expression||')'
        when 'update' then 'using ('||expression||') with check ('||expression||')'
        else 'using ('||expression||')' end);
  end loop;
end $$;

notify pgrst,'reload schema';
commit;
