\set ON_ERROR_STOP on
\pset pager off

do $$ begin
  if current_database() <> 'fourm_admin_event_amendments_test'
    or to_regclass('public.calendar') is not null
    or exists (select 1 from pg_namespace where nspname in ('auth','private')) then
    raise exception 'Use an empty disposable fourm_admin_event_amendments_test database.';
  end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create schema auth;
create schema private;
grant usage on schema private to authenticated;

create function auth.email() returns text language sql stable
as $$ select current_setting('fixture.email',true) $$;
create function auth.uid() returns uuid language sql stable
as $$ select md5(auth.email())::uuid $$;
create function private.permission_actor_active() returns boolean language sql stable
as $$ select auth.email() <> 'inactive@example.invalid' $$;
create function public.is_super_admin(email text) returns boolean language sql stable
as $$ select email='platform@example.invalid' $$;
create function private.edit_event(id bigint) returns boolean language sql stable
as $$ select id=11 and auth.email() in ('owner@example.invalid','admin@example.invalid','assignment@example.invalid') $$;
create function public.can_manage_calendar_event(org uuid,club uuid) returns boolean language sql stable
as $$ select org='10000000-0000-0000-0000-000000000001' and auth.email() in ('owner@example.invalid','admin@example.invalid') $$;

create table public.admin_sidebar_permissions(email text);
create table public.federation_members(federation_id uuid,user_email text,role text);
create table public.organisations(id uuid primary key,federation_id uuid);
create table public.calendar(
  id bigint primary key,organisation_id uuid,federation_id uuid,club_id uuid,event_name text,city text,venue text,
  is_visible boolean default true,sanction_status text default 'approved',payment_method text default 'platform',
  pending_changes jsonb,pending_changes_status text,pending_changes_notes text,pending_changes_submitted_at timestamptz,
  check (city <> 'Fail after division writes')
);
create table public.tournament_divisions(
  id uuid primary key default gen_random_uuid(),event_id bigint not null references public.calendar(id),
  name text not null,entry_fee numeric,sort_order integer,is_active boolean default true,ranking_tier_id uuid
);
create table public.event_registrations(division_id uuid references public.tournament_divisions(id) on delete set null);
create table public.ranking_history(division_id uuid references public.tournament_divisions(id) on delete set null);
create table public.tournament_draws(division_id uuid references public.tournament_divisions(id) on delete cascade);
create table public.tournament_matches(division_id uuid references public.tournament_divisions(id) on delete cascade);
create table public.tournament_confirmations(division_id uuid references public.tournament_divisions(id) on delete cascade);
create table public.tournament_finalisations(division_id uuid references public.tournament_divisions(id) on delete cascade);
create table public.draw_player_reviews(division_id uuid references public.tournament_divisions(id) on delete cascade);
create table public.player_ranking_points(division_id uuid references public.tournament_divisions(id) on delete cascade);
create table public.draws(division_id uuid references public.tournament_divisions(id) on delete cascade);
create table public.native_draw_announcements(division_id uuid references public.tournament_divisions(id) on delete cascade);
create table private.event_checkout_holds(division_id uuid references public.tournament_divisions(id));
create function private.fixture_venue_trigger() returns trigger language plpgsql as $$ begin
  if new.venue='Inferred club' then new.club_id:='00000000-0000-0000-0000-000000000001'; end if;
  return new;
end $$;
create trigger fixture_infer_club before update of venue on public.calendar
for each row execute function private.fixture_venue_trigger();

\ir ../supabase/migrations/20261119120936_admin_reviewed_event_amendments.sql

insert into public.federation_members values
 ('20000000-0000-0000-0000-000000000001','owner@example.invalid','owner'),
 ('20000000-0000-0000-0000-000000000001','ADMIN@example.invalid','admin'),
 ('20000000-0000-0000-0000-000000000001','staff@example.invalid','staff'),
 ('20000000-0000-0000-0000-000000000001','assignment@example.invalid','owner'),
 ('20000000-0000-0000-0000-000000000002','other@example.invalid','owner');
insert into public.organisations values
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001'),
 ('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002');
insert into public.calendar(id,organisation_id,federation_id,event_name,city,pending_changes_status,pending_changes_submitted_at) values
 (11,'10000000-0000-0000-0000-000000000001',null,'Own tournament','Old city','pending','2026-10-05T10:00Z'),
 (12,'10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','Foreign tournament','Foreign city','pending','2026-10-05T10:00Z'),
 (13,'10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','Other sanctioned tournament','Another city','pending','2026-10-05T10:00Z');
insert into public.tournament_divisions (id,event_id,name,entry_fee,sort_order) values
 ('30000000-0000-0000-0000-000000000001',11,'Update me',100,1),
 ('30000000-0000-0000-0000-000000000002',11,'Remove me',100,2),
 ('30000000-0000-0000-0000-000000000003',12,'Foreign division',200,1);
update public.calendar set pending_changes='{
 "payload":{"city":"New city","is_visible":true,"payment_method":"platform"},
 "divisions":[{"id":"30000000-0000-0000-0000-000000000001","name":"Updated group","entry_fee":120},{"name":"New group","entry_fee":80}],
 "removed_division_ids":["30000000-0000-0000-0000-000000000002"]
}' where id=11;

do $$
declare
  fed constant uuid := '20000000-0000-0000-0000-000000000001';
  other_fed constant uuid := '20000000-0000-0000-0000-000000000002';
  org constant uuid := '10000000-0000-0000-0000-000000000001';
  other_org constant uuid := '10000000-0000-0000-0000-000000000002';
  updated_id constant uuid := '30000000-0000-0000-0000-000000000001';
  removed_id constant uuid := '30000000-0000-0000-0000-000000000002';
  other_id constant uuid := '30000000-0000-0000-0000-000000000003';
  saved_draft jsonb;
  review jsonb;
  token text;
  actor text;
begin
  assert has_function_privilege('authenticated','public.admin_review_event_amendment(text,uuid,bigint,text)','execute');
  assert not has_function_privilege('anon','public.admin_review_event_amendment(text,uuid,bigint,text)','execute');
  assert not has_function_privilege('service_role','public.admin_review_event_amendment(text,uuid,bigint,text)','execute');
  assert not has_table_privilege('authenticated','public.calendar','UPDATE');
  select pending_changes into saved_draft from public.calendar where id=11;
  foreach actor in array array['inactive@example.invalid','staff@example.invalid','other@example.invalid','assignment@example.invalid'] loop
    perform set_config('fixture.email',actor,true);
    begin
      perform public.admin_review_event_amendment('federations',fed,11);
      raise exception 'unauthorized actor was accepted: %',actor;
    exception when insufficient_privilege then null; end;
  end loop;

  perform set_config('fixture.email','owner@example.invalid',true);
  begin
    perform public.admin_review_event_amendment('federations',fed,12);
    raise exception 'foreign event was accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.admin_review_event_amendment('federations',fed,13);
    raise exception 'host linkage overrode explicit event federation';
  exception when insufficient_privilege then null; end;
  begin
    perform public.admin_review_event_amendment('organisations',org,11);
    raise exception 'tenant entered platform-only organisation review';
  exception when insufficient_privilege then null; end;
  review := public.admin_review_event_amendment('federations',fed,11);
  assert review #>> '{fields,city,from}' = 'Old city';
  assert review #>> '{fields,city,to}' = 'New city';
  assert review #>> '{divisions,0,action}' = 'remove';
  assert review #>> '{divisions,1,changes,entry_fee,to}' = '120';
  assert review #>> '{divisions,2,action}' = 'add';
  assert (select city='Old city' and pending_changes=saved_draft from public.calendar where id=11);
  assert (select count(*)=2 from public.tournament_divisions where event_id=11);
  token := review->>'token';

  update public.organisations set federation_id=other_fed where id=org;
  begin
    perform public.admin_review_event_amendment('federations',fed,11,token);
    raise exception 'changed host association was accepted';
  exception when insufficient_privilege then null; end;
  update public.organisations set federation_id=fed where id=org;
  update public.tournament_divisions set sort_order=10 where id=updated_id;
  begin
    perform public.admin_review_event_amendment('federations',fed,11,token);
    raise exception 'changed division review was accepted';
  exception when raise_exception then
    if SQLERRM <> 'The reviewed amendment changed. Refresh before approving.' then raise; end if;
  end;
  update public.tournament_divisions set sort_order=1 where id=updated_id;

  insert into public.event_registrations values (removed_id);
  begin
    perform public.admin_review_event_amendment('federations',fed,11,token);
    raise exception 'division with registered players was accepted for removal';
  exception when raise_exception then
    if SQLERRM <> 'A division in this amendment has entries, payments or competition history.' then raise; end if;
  end;
  assert (select count(*)=1 from public.event_registrations);
  delete from public.event_registrations;
  update public.calendar set pending_changes=jsonb_set(saved_draft,'{removed_division_ids,0}',to_jsonb(other_id)) where id=11;
  begin
    perform public.admin_review_event_amendment('federations',fed,11);
    raise exception 'foreign division removal was accepted';
  exception when raise_exception then
    if SQLERRM <> 'A drafted division is outside this event or was removed.' then raise; end if;
  end;
  update public.calendar set pending_changes=jsonb_set(saved_draft,'{divisions,0,id}',to_jsonb(other_id)) where id=11;
  begin
    perform public.admin_review_event_amendment('federations',fed,11);
    raise exception 'foreign division update was accepted';
  exception when raise_exception then
    if SQLERRM <> 'A drafted division is outside this event or was removed.' then raise; end if;
  end;
  update public.calendar set pending_changes=jsonb_set(saved_draft,'{divisions,1,event_id}','12') where id=11;
  begin
    perform public.admin_review_event_amendment('federations',fed,11);
    raise exception 'division reassignment was accepted';
  exception when raise_exception then
    if SQLERRM <> 'This amendment repeats a division or changes its event.' then raise; end if;
  end;
  update public.calendar set pending_changes=jsonb_set(saved_draft,'{payload,federation_id}',to_jsonb(other_fed)) where id=11;
  begin
    perform public.admin_review_event_amendment('federations',fed,11);
    raise exception 'event reassignment was accepted';
  exception when raise_exception then
    if SQLERRM <> 'This draft changes event ownership, access, payment or publication controls.' then raise; end if;
  end;
  update public.calendar set pending_changes=jsonb_set(saved_draft,'{payload,city}','"Fail after division writes"') where id=11;
  review := public.admin_review_event_amendment('federations',fed,11);
  begin
    perform public.admin_review_event_amendment('federations',fed,11,review->>'token');
    raise exception 'calendar validation failure did not abort approval';
  exception when check_violation then null; end;
  assert (select city='Old city' and pending_changes_status='pending' from public.calendar where id=11);
  assert (select name='Update me' and entry_fee=100 from public.tournament_divisions where id=updated_id);
  assert (select count(*)=2 from public.tournament_divisions where event_id=11);

  update public.calendar set pending_changes=jsonb_set(saved_draft,'{payload,venue}','"Inferred club"') where id=11;
  review := public.admin_review_event_amendment('federations',fed,11);
  begin
    perform public.admin_review_event_amendment('federations',fed,11,review->>'token');
    raise exception 'trigger side effect on ownership was accepted';
  exception when raise_exception then
    if SQLERRM <> 'Approval also changes unreviewed event controls. Review the event directly.' then raise; end if;
  end;
  assert (select city='Old city' and club_id is null from public.calendar where id=11);
  assert (select count(*)=2 from public.tournament_divisions where event_id=11);

  update public.calendar set pending_changes=saved_draft where id=11;
  perform set_config('fixture.email','admin@example.invalid',true);
  review := public.admin_review_event_amendment('federations',fed,11);
  assert review->>'token' <> token;
  -- Simulate revocation between review and approval.
  delete from public.federation_members where lower(user_email)=auth.email();
  begin
    perform public.admin_review_event_amendment('federations',fed,11,review->>'token');
    raise exception 'revoked member was accepted';
  exception when insufficient_privilege then null; end;

  perform set_config('fixture.email','platform@example.invalid',true);
  begin
    perform public.admin_review_event_amendment('organisations',other_org,11);
    raise exception 'another organisation was accepted';
  exception when insufficient_privilege then null; end;
  review := public.admin_review_event_amendment('organisations',org,11);
  token := review->>'token';
  assert public.admin_review_event_amendment('organisations',org,11,token)->>'status'='approved';
  assert (select city='New city' and club_id is null and is_visible and pending_changes is null and pending_changes_submitted_at is null
          from public.calendar where id=11);
  assert (select count(*)=2 from public.tournament_divisions where event_id=11);
  assert (select name='Updated group' and entry_fee=120 from public.tournament_divisions where id=updated_id);
  assert (select count(*)=1 from public.tournament_divisions where event_id=11 and name='New group' and entry_fee=80 and is_active);
  assert not exists (select 1 from public.tournament_divisions where id=removed_id);
  assert (select name='Foreign division' and entry_fee=200 and event_id=12 from public.tournament_divisions where id=other_id);
  begin
    perform public.admin_review_event_amendment('organisations',org,11,token);
    raise exception 'an already approved draft was replayed';
  exception when raise_exception then
    if SQLERRM <> 'This amendment is no longer pending. Refresh decisions.' then raise; end if;
  end;
  assert (select count(*)=2 from public.tournament_divisions where event_id=11);

  -- The exposed wrapper runs under the authenticated role rather than relying
  -- on the fixture bootstrap role to access private implementation internals.
  update public.calendar set pending_changes=saved_draft,pending_changes_status='pending' where id=11;
  update public.calendar set pending_changes='{"payload":{"city":"Second revision"},"divisions":null,"removed_division_ids":null}'
    where id=11;
  perform set_config('fixture.email','owner@example.invalid',true);
  set local role authenticated;
  review := public.admin_review_event_amendment('federations',fed,11);
  assert public.admin_review_event_amendment('federations',fed,11,review->>'token')->>'status'='approved';
  reset role;
  assert (select city='Second revision' from public.calendar where id=11);
end $$;
