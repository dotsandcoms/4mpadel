-- Messaging is RPC-only. Nothing in this schema belongs in the Data API or publication.
-- Requires the shared profile-details, event permissions and notification migrations.
-- Legacy role helpers use an unqualified permissions table. Pin their path so
-- they also work safely when called from our empty-search-path functions.
alter function public.is_super_admin(text) set search_path=pg_catalog,public,pg_temp;
do $$begin
  if to_regprocedure('public.is_super_admin()') is not null then
    execute 'alter function public.is_super_admin() set search_path=pg_catalog,public,pg_temp';
  end if;
end $$;
create schema messaging;
revoke all on schema messaging from public, anon, authenticated;
grant usage on schema messaging to authenticated, service_role;
alter default privileges in schema messaging revoke execute on functions from public;
alter default privileges in schema messaging revoke all on tables from public, anon, authenticated;

create table messaging.configuration (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false,
  pilot_player_ids bigint[] not null default '{}',
  sending_enabled boolean not null default true,
  requests_enabled boolean not null default true,
  juniors_enabled boolean not null default false
);
insert into messaging.configuration(singleton) values(true);
create table messaging.accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  player_id bigint not null unique references public.players(id) on delete cascade,
  rules_version text,
  allow_requests boolean not null default true,
  suspended boolean not null default false,
  created_at timestamptz not null default clock_timestamp()
);
create table messaging.conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check(kind in ('direct','event_announcements','event_discussion')),
  event_id bigint references public.calendar(id) on delete cascade,
  pair_key text unique,
  requester uuid references messaging.accounts(user_id) on delete set null,
  state text not null default 'accepted' check(state in ('pending','accepted','declined')),
  declined_until timestamptz,
  paused boolean not null default false,
  pinned_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check((kind='direct') = (event_id is null)),
  unique(event_id,kind)
);
create table messaging.members (
  conversation_id uuid not null references messaging.conversations(id) on delete cascade,
  user_id uuid not null references messaging.accounts(user_id) on delete cascade,
  active boolean not null default true,
  eligible_from timestamptz not null default clock_timestamp(),
  muted boolean not null default false,
  archived boolean not null default false,
  left_discussion boolean not null default false,
  read_seq bigint not null default 0,
  primary key(conversation_id,user_id)
);
create index messaging_members_user on messaging.members(user_id,active);
create table messaging.messages (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity unique,
  conversation_id uuid not null references messaging.conversations(id) on delete cascade,
  sender_id uuid references messaging.accounts(user_id) on delete set null,
  client_id uuid not null,
  body text not null check(char_length(body)<=4000),
  reply_id uuid references messaging.messages(id) on delete set null,
  card_event_id bigint references public.calendar(id) on delete set null,
  card_tab text check(card_tab in ('Overview','Draws','Results')),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  deleted_at timestamptz,
  unique(sender_id,client_id)
);
create index messaging_messages_page on messaging.messages(conversation_id,seq desc);
create index messaging_messages_expiry on messaging.messages(expires_at);
create table messaging.blocks (
  user_id uuid not null references messaging.accounts(user_id) on delete cascade,
  blocked_id uuid not null references messaging.accounts(user_id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  primary key(user_id,blocked_id),check(user_id<>blocked_id)
);
create table messaging.event_approvals (
  event_id bigint not null references public.calendar(id) on delete cascade,
  user_id uuid not null references messaging.accounts(user_id) on delete cascade,
  approved_by uuid references auth.users(id) on delete set null,
  primary key(event_id,user_id)
);
-- Registration flags are legacy client-writable data. Discussion access also
-- requires an attestation created by a trusted payment/import writer or MFA admin.
create table messaging.entry_confirmations (
  source text not null check(source in ('registration','import')),
  source_id uuid not null,
  proof jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(source,source_id)
);
create table messaging.guardian_consents (
  id uuid primary key default gen_random_uuid(),
  junior_id uuid not null references messaging.accounts(user_id) on delete cascade,
  guardian_id uuid references messaging.accounts(user_id) on delete cascade,
  guardian_email text not null,
  token_hash text not null unique,
  version text not null default '2026-11-05',
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp()+interval '48 hours'),
  consented_at timestamptz,
  revoked_at timestamptz,
  check(junior_id is distinct from guardian_id)
);
create index messaging_consent_expiry on messaging.guardian_consents(expires_at);
create index messaging_consent_junior on messaging.guardian_consents(junior_id,revoked_at);
create table messaging.reports (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references messaging.conversations(id) on delete set null,
  message_id uuid references messaging.messages(id) on delete set null,
  reporter_id uuid references messaging.accounts(user_id) on delete set null,
  reason text not null check(reason in ('spam','harassment','unsafe','other')),
  evidence jsonb not null,
  status text not null default 'open' check(status in ('open','resolved')),
  created_at timestamptz not null default clock_timestamp(),
  closed_at timestamptz,
  legal_hold boolean not null default false
);
create index messaging_report_closed on messaging.reports(closed_at);
create table messaging.audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  subject_id uuid,
  created_at timestamptz not null default clock_timestamp()
);
create index messaging_audit_expiry on messaging.audit(created_at);
create index messaging_audit_rate on messaging.audit(actor_id,action,created_at);
create table messaging.deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references messaging.accounts(user_id) on delete cascade,
  conversation_id uuid not null references messaging.conversations(id) on delete cascade,
  message_id uuid not null references messaging.messages(id) on delete cascade,
  token_id uuid not null,
  bucket bigint not null,
  state text not null default 'pending' check(state in ('pending','leased','accepted','sent','skipped','failed')),
  lease_id uuid,
  available_at timestamptz not null default clock_timestamp(),
  attempts int not null default 0,
  ticket_id text,
  created_at timestamptz not null default clock_timestamp(),
  unique(user_id,conversation_id,token_id,bucket)
);
create index messaging_delivery_created on messaging.deliveries(created_at);
create index messaging_delivery_pending on messaging.deliveries(state,available_at);
-- RLS is deny-by-default; the reviewed private functions are the sole data boundary.
alter table messaging.configuration enable row level security;
alter table messaging.accounts enable row level security;
alter table messaging.conversations enable row level security;
alter table messaging.members enable row level security;
alter table messaging.messages enable row level security;
alter table messaging.blocks enable row level security;
alter table messaging.event_approvals enable row level security;
alter table messaging.entry_confirmations enable row level security;
alter table messaging.guardian_consents enable row level security;
alter table messaging.reports enable row level security;
alter table messaging.audit enable row level security;
alter table messaging.deliveries enable row level security;
revoke all on all tables in schema messaging from public, anon, authenticated, service_role;
grant select,insert,update,delete on all tables in schema messaging to service_role;
revoke all on all sequences in schema messaging from public,anon,authenticated;
grant usage on sequence messaging.messages_seq_seq to service_role;

create function messaging.actor() returns uuid language plpgsql security definer set search_path='' set timezone='Africa/Johannesburg' as $$
declare u auth.users; p bigint; n int;
begin
  select * into u from auth.users where id=auth.uid() and deleted_at is null and (banned_until is null or banned_until<now());
  if u.id is null or u.email_confirmed_at is null or coalesce(u.is_anonymous,false)
    or lower(trim(u.email)) is distinct from lower(trim(auth.jwt()->>'email'))
    or not exists(select 1 from auth.sessions s where s.id=nullif(auth.jwt()->>'session_id','')::uuid and s.user_id=u.id and (s.not_after is null or s.not_after>now())) then
    raise exception 'Sign in again to use messages.' using errcode='42501';
  end if;
  if not exists(select 1 from messaging.accounts where user_id=u.id) then
    select count(*),min(id) into n,p from public.players where lower(trim(email))=lower(trim(u.email));
    if n<>1 then raise exception 'Complete your player profile before using messages.' using errcode='42501'; end if;
    insert into messaging.accounts(user_id,player_id) values(u.id,p) on conflict(user_id) do nothing;
  end if;
  if exists(select 1 from messaging.accounts where user_id=u.id and suspended) then
    raise exception 'Messaging is unavailable for this account.' using errcode='42501';
  end if;
  return u.id;
end $$;
create function messaging.enabled_for(p_user uuid) returns boolean language sql stable security definer set search_path='' set timezone='Africa/Johannesburg' as $$
  select coalesce((select cfg.enabled and (cardinality(cfg.pilot_player_ids)=0 or a.player_id=any(cfg.pilot_player_ids))
    from messaging.configuration cfg join messaging.accounts a on a.user_id=p_user where cfg.singleton),false)
$$;
create function messaging.interactive(p_user uuid) returns boolean language sql stable security definer set search_path='' set timezone='Africa/Johannesburg' as $$
  select exists(select 1 from messaging.accounts a
    join public.player_profile_details d on d.player_id=a.player_id
    join auth.users u on u.id=a.user_id
    where a.user_id=p_user and messaging.enabled_for(p_user) and not a.suspended and a.rules_version='2026-11-05'
    and u.deleted_at is null and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<now())
    and (d.date_of_birth <= (current_date-interval '18 years')::date or (
      (select juniors_enabled from messaging.configuration where singleton)
      and exists(select 1 from messaging.guardian_consents g join messaging.accounts ga on ga.user_id=g.guardian_id
        join auth.users gu on gu.id=ga.user_id join public.player_profile_details gd on gd.player_id=ga.player_id
        where g.junior_id=p_user and g.consented_at is not null and g.revoked_at is null
          and not ga.suspended and gu.deleted_at is null and gu.email_confirmed_at is not null and (gu.banned_until is null or gu.banned_until<now())
          and gd.date_of_birth <= (current_date-interval '18 years')::date)
    )))
$$;
create function messaging.blocked(p_a uuid,p_b uuid) returns boolean language sql stable security definer set search_path='' set timezone='Africa/Johannesburg' as $$
  select exists(select 1 from messaging.blocks where (user_id=p_a and blocked_id=p_b) or(user_id=p_b and blocked_id=p_a))
$$;
create function messaging.entry_proof(p_row jsonb) returns jsonb language sql immutable set search_path='' set timezone='Africa/Johannesburg' as $$
  select jsonb_build_object('event',p_row->>'event_id','division',p_row->>'division_id',
    'email',lower(trim(p_row->>'email')),'partner',lower(trim(p_row->>'partner_email')),
    'payment',p_row->>'payment_status','partnerPayment',p_row->>'partner_payment_status','status',p_row->>'status')
$$;
-- Legacy Full Access sidebar tabs are not a messaging tenant boundary. Require
-- the actual event's organisation ownership or an explicit event assignment.
create function messaging.manager(p_event bigint) returns boolean language sql stable security definer set search_path='' set timezone='Africa/Johannesburg' as $$
  select p_event is not null and auth.uid() is not null and public.can_manage_event(p_event)
    and exists(select 1 from public.calendar c where c.id=p_event and (
      public.is_super_admin(auth.email())
      or lower(trim(c.organiser_email))=lower(trim(auth.email()))
      or exists(select 1 from unnest(c.event_co_admins) co_admin where lower(trim(co_admin))=lower(trim(auth.email())))
      or exists(select 1 from public.organisation_members member where member.organisation_id=c.organisation_id
        and lower(trim(member.user_email))=lower(trim(auth.email())) and member.role in ('owner','admin'))
      or exists(select 1 from public.organisations organisation join public.players creator on creator.id=organisation.created_by
        where organisation.id=c.organisation_id and lower(trim(creator.email))=lower(trim(auth.email())))
      or exists(select 1 from public.admin_sidebar_permissions permission where lower(trim(permission.email))=lower(trim(auth.email()))
        and coalesce(permission.module_permissions->'event-mgmt'->'allowedEvents','[]'::jsonb) @> jsonb_build_array(p_event))
    ))
$$;
create function messaging.trusted_event_writer(p_event bigint) returns boolean language sql stable security definer set search_path='' set timezone='Africa/Johannesburg' as $$
  select auth.jwt()->>'role'='service_role'
    or (auth.uid() is null and current_setting('role')='none' and exists(select 1 from pg_roles where rolname=session_user and (rolsuper or rolbypassrls)))
    or (auth.jwt()->>'aal'='aal2' and messaging.manager(p_event) and exists(
      select 1 from auth.users u join auth.sessions session on session.user_id=u.id
      where u.id=auth.uid() and u.deleted_at is null and u.email_confirmed_at is not null
        and lower(trim(u.email))=lower(trim(auth.jwt()->>'email')) and (u.banned_until is null or u.banned_until<now())
        and session.id=nullif(auth.jwt()->>'session_id','')::uuid and (session.not_after is null or session.not_after>now())))
$$;
create function messaging.attest_entry() returns trigger language plpgsql security definer set search_path='' set timezone='Africa/Johannesburg' as $$
declare source_name text:=case when tg_table_name='event_registrations' then 'registration' else 'import' end;
begin
  if tg_op='DELETE' then delete from messaging.entry_confirmations where source=source_name and source_id=old.id;return null; end if;
  if messaging.trusted_event_writer(new.event_id) then
    insert into messaging.entry_confirmations(source,source_id,proof) values(source_name,new.id,messaging.entry_proof(to_jsonb(new)))
      on conflict(source,source_id) do update set proof=excluded.proof,created_at=clock_timestamp();
  elsif tg_op='INSERT' or messaging.entry_proof(to_jsonb(old)) is distinct from messaging.entry_proof(to_jsonb(new)) then
    delete from messaging.entry_confirmations where source=source_name and source_id=new.id;
  end if;
  return null;
end $$;
create trigger messaging_attest_registration after insert or update or delete on public.event_registrations for each row execute function messaging.attest_entry();
create trigger messaging_attest_import after insert or update or delete on public.tournament_participants for each row execute function messaging.attest_entry();
-- Uses authoritative verified-account email, never a caller-supplied email or name/hash.
create function messaging.event_access(p_event bigint,p_user uuid) returns int language plpgsql stable security definer set search_path='' set timezone='Africa/Johannesburg' as $$
declare address text; has_entry boolean; confirmed boolean; imported boolean;
begin
  select lower(trim(u.email)) into address from auth.users u join messaging.accounts a on a.user_id=u.id
    where u.id=p_user and u.deleted_at is null and u.email_confirmed_at is not null and not a.suspended;
  if address is null then return 0; end if;
  select exists(select 1 from public.event_registrations r where r.event_id=p_event
    and lower(coalesce(r.status,'')) in ('registered','confirmed','approved','active')
    and (lower(trim(r.email))=address or (lower(trim(r.partner_email))=address and not exists(
      select 1 from public.event_registrations w where w.event_id=p_event and w.division_id is not distinct from r.division_id
        and lower(trim(w.email))=address and lower(w.status)='withdrawn'
        and not exists(select 1 from public.event_registrations live where live.event_id=p_event
          and live.division_id is not distinct from r.division_id and lower(trim(live.email))=address
          and lower(coalesce(live.status,'')) in ('registered','confirmed','approved','active')))))) into has_entry;
  select exists(select 1 from public.event_registrations r where r.event_id=p_event
    and lower(coalesce(r.status,'')) in ('registered','confirmed','approved','active')
    and lower(trim(r.email))=address and lower(coalesce(r.payment_status,'')) in ('paid','free','comped','complimentary','waived')
    and exists(select 1 from messaging.entry_confirmations proof where proof.source='registration' and proof.source_id=r.id and proof.proof=messaging.entry_proof(to_jsonb(r)))) into confirmed;
  -- A single-row partner entry is confirmed only by its own partner payment state,
  -- not by the payer's payment. Explicit approval handles older single-row teams.
  confirmed:=confirmed or exists(select 1 from public.event_registrations r where r.event_id=p_event
    and lower(coalesce(r.status,'')) in ('registered','confirmed','approved','active')
    and lower(trim(r.partner_email))=address and lower(coalesce(r.partner_payment_status,'')) in ('paid','free','comped','complimentary','waived')
    and exists(select 1 from messaging.entry_confirmations proof where proof.source='registration' and proof.source_id=r.id and proof.proof=messaging.entry_proof(to_jsonb(r))));
  select exists(select 1 from public.tournament_participants t where t.event_id=p_event and lower(trim(t.email))=address)
    and not exists(select 1 from public.event_registrations w where w.event_id=p_event and lower(trim(w.email))=address
      and lower(w.status)='withdrawn' and not has_entry) into imported;
  if not(has_entry or imported) then return 0; end if;
  if confirmed or (imported and exists(select 1 from public.tournament_participants t join messaging.entry_confirmations proof
    on proof.source='import' and proof.source_id=t.id and proof.proof=messaging.entry_proof(to_jsonb(t)) where t.event_id=p_event and lower(trim(t.email))=address)) or exists(select 1 from messaging.event_approvals where event_id=p_event and user_id=p_user) then return 2; end if;
  return 1;
end $$;
create function messaging.require_manager(p_event bigint) returns void language plpgsql security definer set search_path='' set timezone='Africa/Johannesburg' as $$
begin
  if not messaging.manager(p_event) then raise exception 'Event messaging access denied.' using errcode='42501'; end if;
  if auth.jwt()->>'aal' is distinct from 'aal2' then raise exception 'Verify your account with two-factor authentication to manage event messages.' using errcode='42501'; end if;
end $$;
create function messaging.sync_event(p_event bigint) returns void language plpgsql security definer set search_path='' set timezone='Africa/Johannesburg' as $$
declare c record; a record; level int;
begin
  perform pg_advisory_xact_lock(7021,p_event::int);
  if not exists(select 1 from public.calendar where id=p_event) then return; end if;
  insert into messaging.conversations(kind,event_id) values('event_announcements',p_event),('event_discussion',p_event)
    on conflict(event_id,kind) do nothing;
  for a in select acc.user_id from messaging.accounts acc join auth.users u on u.id=acc.user_id
    where exists(select 1 from messaging.members mem join messaging.conversations conv on conv.id=mem.conversation_id where mem.user_id=acc.user_id and conv.event_id=p_event)
      or exists(select 1 from public.event_registrations r where r.event_id=p_event and (lower(trim(r.email))=lower(trim(u.email)) or lower(trim(r.partner_email))=lower(trim(u.email))))
      or exists(select 1 from public.tournament_participants t where t.event_id=p_event and lower(trim(t.email))=lower(trim(u.email))) loop
    level:=messaging.event_access(p_event,a.user_id);
    for c in select id,kind from messaging.conversations where event_id=p_event loop
      if level >= (case when c.kind='event_announcements' then 1 else 2 end) and (c.kind='event_announcements' or messaging.interactive(a.user_id)) then
        insert into messaging.members as m(conversation_id,user_id) values(c.id,a.user_id)
          on conflict(conversation_id,user_id) do update set active=true,
            eligible_from=case when m.active then m.eligible_from else clock_timestamp() end;
      else
        update messaging.members set active=false,archived=false where conversation_id=c.id and user_id=a.user_id and active;
      end if;
    end loop;
  end loop;
end $$;
create function messaging.sync_member(p_event bigint,p_user uuid) returns void language plpgsql security definer set search_path='' set timezone='Africa/Johannesburg' as $$
declare c record; level int;
begin
  perform pg_advisory_xact_lock(7021,p_event::int);
  if not exists(select 1 from messaging.conversations where event_id=p_event) then perform messaging.sync_event(p_event); return; end if;
  level:=messaging.event_access(p_event,p_user);
  for c in select id,kind from messaging.conversations where event_id=p_event loop
    if level >= (case when c.kind='event_announcements' then 1 else 2 end) and (c.kind='event_announcements' or messaging.interactive(p_user)) then
      insert into messaging.members as m(conversation_id,user_id) values(c.id,p_user)
        on conflict(conversation_id,user_id) do update set active=true,eligible_from=case when m.active then m.eligible_from else clock_timestamp() end;
    else
      update messaging.members set active=false where conversation_id=c.id and user_id=p_user and active;
    end if;
  end loop;
end $$;
create function messaging.event_changed() returns trigger language plpgsql security definer set search_path='' set timezone='Africa/Johannesburg' as $$
begin
  if tg_op<>'INSERT' and exists(select 1 from messaging.conversations where event_id=old.event_id) then perform messaging.sync_event(old.event_id); end if;
  if tg_op<>'DELETE' and (tg_op='INSERT' or new.event_id is distinct from old.event_id)
    and exists(select 1 from messaging.conversations where event_id=new.event_id) then perform messaging.sync_event(new.event_id); end if;
  return null;
end $$;
create trigger messaging_registration_changed after insert or update or delete on public.event_registrations for each row execute function messaging.event_changed();
create trigger messaging_imported_entry_changed after insert or update or delete on public.tournament_participants for each row execute function messaging.event_changed();
create function messaging.profile_changed() returns trigger language plpgsql security definer set search_path='' set timezone='Africa/Johannesburg' as $$
begin
  if old.date_of_birth is distinct from new.date_of_birth then
    update messaging.members mm set active=false,eligible_from=clock_timestamp() from messaging.accounts acc,messaging.conversations conv
      where mm.user_id=acc.user_id and acc.player_id=new.player_id and conv.id=mm.conversation_id and conv.kind='event_discussion';
  end if;
  return null;
end $$;
create trigger messaging_birth_date_changed after update on public.player_profile_details for each row execute function messaging.profile_changed();
create function messaging.consent_changed() returns trigger language plpgsql security definer set search_path='' set timezone='Africa/Johannesburg' as $$
declare junior uuid;
begin
  junior:=case when tg_op='DELETE' then old.junior_id else new.junior_id end;
  update messaging.members mm set active=false,eligible_from=clock_timestamp() from messaging.conversations conv
    where mm.user_id=junior and conv.id=mm.conversation_id and conv.kind='event_discussion';
  perform messaging.signal(junior);
  return null;
end $$;
create trigger messaging_consent_changed after insert or update or delete on messaging.guardian_consents for each row execute function messaging.consent_changed();
create function messaging.can_read(p_conversation uuid,p_user uuid) returns boolean language plpgsql stable security definer set search_path='' set timezone='Africa/Johannesburg' as $$
declare c messaging.conversations; member messaging.members; closing date;
begin
  if not messaging.enabled_for(p_user) then return false; end if;
  if not exists(select 1 from messaging.accounts a join auth.users u on u.id=a.user_id where a.user_id=p_user and not a.suspended and u.deleted_at is null) then return false; end if;
  select * into c from messaging.conversations where id=p_conversation;
  if c.id is null then return false; end if;
  if c.kind<>'direct' then
    select coalesce(end_date,start_date)::date into closing from public.calendar where id=c.event_id;
    if closing is null or current_date>closing+90 then return false; end if;
    if p_user=auth.uid() and messaging.manager(c.event_id) and auth.jwt()->>'aal'='aal2' and (c.kind='event_announcements' or messaging.interactive(p_user)) then return true; end if;
  end if;
  select * into member from messaging.members where conversation_id=c.id and user_id=p_user and active;
  if member.user_id is null then return false; end if;
  if c.kind='direct' then
    return c.state<>'declined' and messaging.interactive(p_user) and not exists(select 1 from messaging.members other
      where other.conversation_id=c.id and other.user_id<>p_user and messaging.blocked(p_user,other.user_id));
  end if;
  return messaging.event_access(c.event_id,p_user) >= case when c.kind='event_announcements' then 1 else 2 end
    and (c.kind='event_announcements' or (not member.left_discussion and messaging.interactive(p_user)));
end $$;
create function messaging.visible(p_message uuid,p_user uuid) returns boolean language sql stable security definer set search_path='' set timezone='Africa/Johannesburg' as $$
  select exists(select 1 from messaging.messages m join messaging.conversations c on c.id=m.conversation_id
    left join messaging.members member on member.conversation_id=c.id and member.user_id=p_user
    where m.id=p_message and m.expires_at>now() and messaging.can_read(c.id,p_user)
    and (c.kind<>'event_discussion' or (p_user=auth.uid() and messaging.manager(c.event_id) and auth.jwt()->>'aal'='aal2')
      or m.created_at>=member.eligible_from)
    and (c.kind<>'event_discussion' or m.sender_id is null or not messaging.blocked(p_user,m.sender_id)))
$$;
create function messaging.message_json(p_message uuid,p_user uuid) returns jsonb language sql stable security definer set search_path='' set timezone='Africa/Johannesburg' as $$
  select jsonb_build_object('id',m.id,'seq',m.seq,'body',case when m.deleted_at is null then m.body else '' end,
    'mine',m.sender_id=p_user,'sender',jsonb_build_object('id',p.id::text,'name',coalesce(p.name,'Former player'),'image',p.image_url),
    'createdAt',m.created_at,'deleted',m.deleted_at is not null,
    'reply',case when m.deleted_at is null and r.deleted_at is null and messaging.visible(r.id,p_user) then
      jsonb_build_object('id',r.id,'body',left(r.body,160),'name',rp.name) end,
    'card',case when m.deleted_at is null and e.id is not null and e.is_visible=true and (e.sanction_status is null or e.sanction_status='approved') then
      jsonb_build_object('eventId',e.id,'title',e.event_name,'date',e.start_date,'tab',coalesce(m.card_tab,'Overview')) end)
  from messaging.messages m left join messaging.accounts a on a.user_id=m.sender_id left join public.players p on p.id=a.player_id
    left join messaging.messages r on r.id=m.reply_id left join messaging.accounts ra on ra.user_id=r.sender_id
    left join public.players rp on rp.id=ra.player_id left join public.calendar e on e.id=m.card_event_id
  where m.id=p_message and messaging.visible(m.id,p_user)
$$;
create function messaging.signal(p_user uuid) returns void language plpgsql security definer set search_path='' set timezone='Africa/Johannesburg' as $$
begin
  perform realtime.send('{}'::jsonb,'inbox_changed','messaging:'||p_user::text,true);
exception when others then
  -- The database remains authoritative; foreground reconciliation repairs a missed signal.
  null;
end $$;
create function messaging.queue_message(p_message uuid) returns void language plpgsql security definer set search_path='' set timezone='Africa/Johannesburg' as $$
declare m messaging.messages; recipient record;
begin
  select * into m from messaging.messages where id=p_message;
  for recipient in select member.user_id from messaging.members member
    where member.conversation_id=m.conversation_id and member.active and member.user_id is distinct from m.sender_id loop
    perform messaging.signal(recipient.user_id);
    if messaging.visible(m.id,recipient.user_id) then
      insert into messaging.deliveries(user_id,conversation_id,message_id,token_id,bucket)
        select recipient.user_id,m.conversation_id,m.id,t.id,floor(extract(epoch from now())/30)::bigint
        from public.player_push_tokens t join auth.users u on lower(trim(u.email))=lower(trim(t.email))
        where u.id=recipient.user_id and t.token_kind='expo'
        on conflict(user_id,conversation_id,token_id,bucket) do nothing;
    end if;
  end loop;
end $$;
create function messaging.conversation_json(p_conversation uuid,p_user uuid) returns jsonb language plpgsql stable security definer set search_path='' set timezone='Africa/Johannesburg' as $$
declare c messaging.conversations; member messaging.members; title text; photo text; last_message jsonb; unread int; can_send boolean; reason text; event_name text; is_manager boolean; peer uuid;
begin
  if not messaging.can_read(p_conversation,p_user) then return null; end if;
  select * into c from messaging.conversations where id=p_conversation;
  select * into member from messaging.members where conversation_id=c.id and user_id=p_user;
  is_manager:=c.event_id is not null and p_user=auth.uid() and messaging.manager(c.event_id) and auth.jwt()->>'aal'='aal2';
  if c.kind='direct' then
    select a.user_id,p.name,p.image_url into peer,title,photo from messaging.members mm join messaging.accounts a on a.user_id=mm.user_id
      join public.players p on p.id=a.player_id where mm.conversation_id=c.id and mm.user_id<>p_user;
    can_send:=c.state='accepted' and messaging.interactive(peer);
    reason:=case when c.state='pending' then 'Accept the request to start chatting.' when not messaging.interactive(peer) then 'This conversation is currently unavailable.' end;
  else
    select e.event_name into event_name from public.calendar e where e.id=c.event_id;
    title:=event_name;
    can_send:=(c.kind='event_discussion' and not c.paused and messaging.interactive(p_user)) or is_manager;
    if c.kind='event_announcements' and not is_manager then reason:='Only event organisers can post announcements.'; end if;
    if c.paused then reason:='The organiser has paused this discussion.'; end if;
    if exists(select 1 from public.calendar e where e.id=c.event_id and (e.event_status='cancelled'
      or current_date>coalesce(e.end_date,e.start_date)::date+7)) then can_send:=false;reason:='This event conversation is read-only.'; end if;
  end if;
  select messaging.message_json(id,p_user) into last_message from messaging.messages where conversation_id=c.id
    and messaging.visible(id,p_user) order by seq desc limit 1;
  select count(*) into unread from messaging.messages where conversation_id=c.id and seq>coalesce(member.read_seq,0)
    and sender_id is distinct from p_user and messaging.visible(id,p_user);
  return jsonb_build_object('id',c.id,'kind',c.kind,'eventId',c.event_id,'title',coalesce(title,'Player'),
    'image',photo,'state',c.state,'incoming',c.requester is distinct from p_user,'muted',coalesce(member.muted,false),
    'archived',coalesce(member.archived,false),'unread',unread,'preview',coalesce(nullif(last_message->>'body',''),last_message->'card'->>'title',''),
    'updatedAt',coalesce((last_message->>'createdAt')::timestamptz,c.created_at),'canSend',can_send and (select sending_enabled from messaging.configuration),
    'reason',reason,'manager',is_manager,'paused',c.paused,
    'pinned',case when messaging.visible(c.pinned_id,p_user) then messaging.message_json(c.pinned_id,p_user) end);
end $$;

create function messaging.api(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' set timezone='Africa/Johannesburg' as $$
declare uid uuid; cfg messaging.configuration; c messaging.conversations; m messaging.messages; other uuid; target bigint;
  cid uuid; event bigint; body text; key uuid; result jsonb; consent messaging.guardian_consents; token text; address text;
  row record; oldest bigint; next_seq bigint; page jsonb; manager boolean; response_action text; mid uuid;
begin
  if jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>20000 then raise exception 'Invalid messaging request.'; end if;
  uid:=messaging.actor();
  -- Serialize account-level rate limits, block/request changes and idempotency.
  perform pg_advisory_xact_lock(hashtextextended(uid::text,7022));
  select * into cfg from messaging.configuration where singleton;
  if p_action='status' then
    return jsonb_build_object('enabled',messaging.enabled_for(uid),'interactive',cfg.enabled and messaging.interactive(uid),
      'rulesAccepted',exists(select 1 from messaging.accounts where user_id=uid and rules_version='2026-11-05'),
      'supportAllowed',public.is_super_admin(auth.email()) or exists(select 1 from public.admin_sidebar_permissions permission where lower(trim(permission.email))=lower(trim(auth.email())) and 'messaging-support'=any(permission.allowed_tabs)),
      'needsBirthDate',not exists(select 1 from public.player_profile_details d join messaging.accounts a on a.player_id=d.player_id where a.user_id=uid and d.date_of_birth is not null),
      'junior',exists(select 1 from public.player_profile_details d join messaging.accounts a on a.player_id=d.player_id where a.user_id=uid and d.date_of_birth>(current_date-interval '18 years')::date),
      'juniorsEnabled',cfg.juniors_enabled,'allowRequests',(select allow_requests from messaging.accounts where user_id=uid),
      'consents',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',p.name,'active',g.consented_at is not null and g.revoked_at is null))
        from messaging.guardian_consents g join messaging.accounts a on a.user_id=g.junior_id join public.players p on p.id=a.player_id
        where g.guardian_id=uid),'[]'::jsonb));
  end if;
  if not messaging.enabled_for(uid) and p_action<>'guardian_revoke' then raise exception 'Messaging is getting ready. Please check back soon.' using errcode='42501'; end if;
  if p_action='accept_rules' then
    if p_data->>'version' is distinct from '2026-11-05' then raise exception 'Please review the latest messaging rules.'; end if;
    update messaging.accounts set rules_version='2026-11-05' where user_id=uid;
    insert into messaging.audit(actor_id,action) values(uid,'accept_rules');return '{}'::jsonb;
  elsif p_action='preferences' then
    if jsonb_typeof(p_data->'allowRequests')<>'boolean' then raise exception 'Invalid preference.'; end if;
    update messaging.accounts set allow_requests=(p_data->>'allowRequests')::boolean where user_id=uid;return '{}'::jsonb;
  elsif p_action='blocked_players' then
    return coalesce((select jsonb_agg(jsonb_build_object('id',p.id::text,'name',p.name)) from messaging.blocks bl
      join messaging.accounts a on a.user_id=bl.blocked_id join public.players p on p.id=a.player_id where bl.user_id=uid),'[]'::jsonb);
  elsif p_action='unblock' then
    delete from messaging.blocks where user_id=uid and blocked_id=(select user_id from messaging.accounts where player_id=(p_data->>'playerId')::bigint);
    insert into messaging.audit(actor_id,action) values(uid,'unblock');return '{}';
  elsif p_action in ('support_reports','support_resolve','support_suspend') then
    if auth.jwt()->>'aal' is distinct from 'aal2' or not (public.is_super_admin(auth.email()) or exists(
      select 1 from public.admin_sidebar_permissions permission where lower(trim(permission.email))=lower(trim(auth.email()))
        and 'messaging-support'=any(permission.allowed_tabs))) then raise exception 'Messaging support access denied.' using errcode='42501'; end if;
    if p_action='support_reports' then
      insert into messaging.audit(actor_id,action) values(uid,'support_reports');
      return coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'reason',r.reason,'evidence',r.evidence,'createdAt',r.created_at))
        from messaging.reports r join messaging.conversations rc on rc.id=r.conversation_id where rc.kind='direct' and r.status='open'),'[]'::jsonb);
    end if;
    select r.* into row from messaging.reports r join messaging.conversations rc on rc.id=r.conversation_id
      where r.id=(p_data->>'reportId')::uuid and rc.kind='direct' for update of r;
    if row.id is null then raise exception 'Report unavailable.'; end if;
    if p_action='support_resolve' then update messaging.reports set status='resolved',closed_at=clock_timestamp() where id=row.id;
    else
      update messaging.accounts set suspended=true where user_id=(select sender_id from messaging.messages where id=row.message_id) returning user_id into other;
      if other is not null then perform messaging.signal(other); end if;
    end if;
    insert into messaging.audit(actor_id,action,subject_id) values(uid,p_action,row.id);return '{}';
  elsif p_action='join_discussion' then
    event:=(p_data->>'eventId')::bigint;
    if messaging.event_access(event,uid)<2 or not messaging.interactive(uid) then raise exception 'Confirm your event entry and messaging setup to join discussion.' using errcode='42501'; end if;
    perform messaging.sync_member(event,uid);
    update messaging.members mm set left_discussion=false,eligible_from=case when mm.left_discussion then clock_timestamp() else mm.eligible_from end
      from messaging.conversations conv where conv.id=mm.conversation_id and conv.event_id=event and conv.kind='event_discussion' and mm.user_id=uid;
    return '{}';
  elsif p_action='guardian_invite' then
    if not exists(select 1 from messaging.accounts a join public.player_profile_details d on d.player_id=a.player_id where a.user_id=uid
      and d.date_of_birth>(current_date-interval '18 years')::date) then raise exception 'Guardian consent is available for junior accounts.'; end if;
    if (select count(*) from messaging.guardian_consents where junior_id=uid and created_at>now()-interval '24 hours')>=3 then raise exception 'Please try again tomorrow.'; end if;
    address:=lower(trim(p_data->>'email'));
    if address is null or length(address)>254 or address!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      or exists(select 1 from auth.users where id=uid and lower(trim(email))=address) then raise exception 'Enter a separate guardian email address.'; end if;
    token:=gen_random_uuid()::text||gen_random_uuid()::text;
    insert into messaging.guardian_consents(junior_id,guardian_email,token_hash) values(uid,address,encode(sha256(token::bytea),'hex'));
    insert into messaging.audit(actor_id,action) values(uid,'guardian_invite');
    -- Share explicitly through the OS share sheet; no email/third-party messaging is sent by this RPC.
    return jsonb_build_object('code',token);
  elsif p_action='guardian_review' or p_action='guardian_accept' then
    select * into consent from messaging.guardian_consents where token_hash=encode(sha256(coalesce(p_data->>'code','')::bytea),'hex') for update;
    if consent.id is null or consent.expires_at<now() or consent.revoked_at is not null or consent.junior_id=uid
      or not exists(select 1 from auth.users where id=uid and lower(trim(email))=consent.guardian_email)
      or not exists(select 1 from messaging.accounts a join public.player_profile_details d on d.player_id=a.player_id where a.user_id=uid and d.date_of_birth<=(current_date-interval '18 years')::date) then
      raise exception 'This consent invitation is unavailable for this account.' using errcode='42501'; end if;
    if p_action='guardian_review' then return jsonb_build_object('name',(select p.name from messaging.accounts a join public.players p on p.id=a.player_id where a.user_id=consent.junior_id)); end if;
    if p_data->>'declaration' is distinct from 'I am an adult with legal authority to consent' or p_data->>'version' is distinct from consent.version
      or not exists(select 1 from auth.sessions where id=(auth.jwt()->>'session_id')::uuid and user_id=uid and created_at>now()-interval '15 minutes') then
      raise exception 'Sign in again and confirm your authority to consent.' using errcode='42501'; end if;
    update messaging.guardian_consents set guardian_id=uid,consented_at=coalesce(consented_at,clock_timestamp()) where id=consent.id;
    insert into messaging.audit(actor_id,action,subject_id) values(uid,'guardian_consent',consent.id);
    perform messaging.signal(consent.junior_id);return '{}'::jsonb;
  elsif p_action='guardian_revoke' then
    update messaging.guardian_consents set revoked_at=clock_timestamp() where id=(p_data->>'id')::uuid and (guardian_id=uid or junior_id=uid) returning * into consent;
    if consent.id is null then raise exception 'Consent not found.' using errcode='42501'; end if;
    perform messaging.signal(consent.junior_id);insert into messaging.audit(actor_id,action,subject_id) values(uid,'guardian_revoke',consent.id);return '{}'::jsonb;
  elsif p_action='events' then
    select coalesce(jsonb_agg(item order by item->>'date'),'[]'::jsonb) into result from (
      select jsonb_build_object('id',e.id,'title',e.event_name,'date',e.start_date,'manager',messaging.manager(e.id),
        'access',messaging.event_access(e.id,uid)) item from public.calendar e
      where coalesce(e.end_date,e.start_date)::date>=current_date-90
        and (messaging.event_access(e.id,uid)>0 or messaging.manager(e.id)) order by e.start_date desc limit 200) eligible;
    return result;
  elsif p_action='open_event' then
    event:=(p_data->>'eventId')::bigint;
    if messaging.event_access(event,uid)=0 and not messaging.manager(event) then raise exception 'Register for this event to access its messages.' using errcode='42501'; end if;
    if messaging.manager(event) then perform messaging.require_manager(event); end if;
    perform messaging.sync_member(event,uid);
    if messaging.manager(event) then
      insert into messaging.members(conversation_id,user_id) select id,uid from messaging.conversations where event_id=event
        on conflict(conversation_id,user_id) do nothing;
    end if;
    return coalesce((select jsonb_agg(messaging.conversation_json(id,uid) order by kind) filter(where messaging.can_read(id,uid))
      from messaging.conversations where event_id=event),'[]'::jsonb);
  elsif p_action='list' then
    for event in select distinct e.id from public.calendar e where coalesce(e.end_date,e.start_date)::date>=current_date-90
      and messaging.event_access(e.id,uid)>0 loop perform messaging.sync_member(event,uid); end loop;
    return coalesce((select jsonb_agg(item order by item->>'updatedAt' desc) from (
      select messaging.conversation_json(conv.id,uid) item from messaging.conversations conv join messaging.members member on member.conversation_id=conv.id
      where member.user_id=uid and messaging.can_read(conv.id,uid) order by conv.updated_at desc,conv.id limit 200) list),'[]'::jsonb);
  elsif p_action='request' then
    if not cfg.sending_enabled or not cfg.requests_enabled or not messaging.interactive(uid) then raise exception 'Complete messaging setup before sending a request.' using errcode='42501'; end if;
    key:=(p_data->>'clientId')::uuid;target:=(p_data->>'playerId')::bigint;body:=btrim(p_data->>'body');
    if key is null or body is null or char_length(body) not between 1 and 300 then raise exception 'Introduce yourself in 1 to 300 characters.'; end if;
    if body ~* '(\m(kill yourself|child porn)\M)' then raise exception 'This message could not be sent. Please review the community rules.'; end if;
    select a.user_id into other from messaging.accounts a where a.player_id=target and a.allow_requests and messaging.interactive(a.user_id);
    if other is null or other=uid or messaging.blocked(uid,other) then raise exception 'Messaging is unavailable for this player.' using errcode='42501'; end if;
    perform pg_advisory_xact_lock(hashtextextended(least(uid::text,other::text)||greatest(uid::text,other::text),7023));
    select * into c from messaging.conversations where pair_key=least(uid::text,other::text)||':'||greatest(uid::text,other::text) for update;
    if c.id is not null and c.state<>'declined' then return jsonb_build_object('id',c.id); end if;
    if c.id is not null and c.declined_until>now() then raise exception 'Messaging is unavailable for this player.' using errcode='42501'; end if;
    if (select count(*) from messaging.audit where actor_id=uid and action='request' and created_at>now()-interval '24 hours')>=10 then raise exception 'You have reached today’s request limit.'; end if;
    if c.id is null then
      insert into messaging.conversations(kind,pair_key,requester,state) values('direct',least(uid::text,other::text)||':'||greatest(uid::text,other::text),uid,'pending') returning * into c;
      insert into messaging.members(conversation_id,user_id) values(c.id,uid),(c.id,other);
    else
      update messaging.conversations set state='pending',requester=uid,updated_at=clock_timestamp() where id=c.id;
      update messaging.members set active=true,archived=false,eligible_from=clock_timestamp() where conversation_id=c.id;
      delete from messaging.messages where conversation_id=c.id;
    end if;
    insert into messaging.messages(conversation_id,sender_id,client_id,body,expires_at) values(c.id,uid,key,body,now()+interval '12 months') returning * into m;
    insert into messaging.audit(actor_id,action,subject_id) values(uid,'request',c.id);perform messaging.queue_message(m.id);
    return jsonb_build_object('id',c.id);
  end if;
  cid:=(p_data->>'conversationId')::uuid;
  perform pg_advisory_xact_lock(hashtextextended(cid::text,7024));
  select * into c from messaging.conversations where id=cid;
  if c.event_id is not null then perform messaging.sync_member(c.event_id,uid); end if;
  if not messaging.can_read(cid,uid) then raise exception 'This conversation is unavailable.' using errcode='42501'; end if;
  manager:=c.event_id is not null and messaging.manager(c.event_id) and auth.jwt()->>'aal'='aal2';
  if p_action='read' then
    oldest:=coalesce((p_data->>'before')::bigint,9223372036854775807);
    select jsonb_agg(item order by seq),min(seq) into page,next_seq from (
      select seq,messaging.message_json(id,uid) item from messaging.messages where conversation_id=cid and seq<oldest and messaging.visible(id,uid)
        order by seq desc limit 50) messages;
    return jsonb_build_object('conversation',messaging.conversation_json(cid,uid),'messages',coalesce(page,'[]'::jsonb),
      'next',case when exists(select 1 from messaging.messages where conversation_id=cid and seq<next_seq and messaging.visible(id,uid)) then next_seq end);
  elsif p_action='respond' then
    if c.kind<>'direct' or c.state<>'pending' or c.requester=uid or not messaging.interactive(uid) then raise exception 'This request is unavailable.'; end if;
    response_action:=p_data->>'response';
    if response_action not in ('accept','decline') or response_action is null then raise exception 'Choose Accept or Decline.'; end if;
    update messaging.conversations set state=case when response_action='accept' then 'accepted' else 'declined' end,
      declined_until=case when response_action='decline' then now()+interval '30 days' end,updated_at=clock_timestamp() where id=cid;
    for other in select user_id from messaging.members where conversation_id=cid loop perform messaging.signal(other); end loop;
    return '{}'::jsonb;
  elsif p_action='mark_read' then
    update messaging.members set read_seq=greatest(read_seq,coalesce((select max(seq) from messaging.messages where conversation_id=cid
      and seq<=coalesce((p_data->>'seq')::bigint,0) and messaging.visible(id,uid)),0)) where conversation_id=cid and user_id=uid;return '{}'::jsonb;
  elsif p_action='member_settings' then
    update messaging.members set muted=coalesce((p_data->>'muted')::boolean,muted),archived=coalesce((p_data->>'archived')::boolean,archived),
      left_discussion=case when c.kind='event_discussion' then coalesce((p_data->>'left')::boolean,left_discussion) else false end
      where conversation_id=cid and user_id=uid;
    return '{}'::jsonb;
  elsif p_action='block' then
    if c.kind<>'direct' then raise exception 'Open the player’s private conversation to block them.'; end if;
    select user_id into other from messaging.members where conversation_id=cid and user_id<>uid;
    insert into messaging.blocks(user_id,blocked_id) values(uid,other) on conflict do nothing;
    insert into messaging.audit(actor_id,action,subject_id) values(uid,'block',cid);
    perform messaging.signal(other);return '{}'::jsonb;
  elsif p_action='report' then
    mid:=(p_data->>'messageId')::uuid;
    if not messaging.visible(mid,uid) or not exists(select 1 from messaging.messages where id=mid and conversation_id=cid) then raise exception 'Message unavailable.'; end if;
    if (select count(*) from messaging.audit where actor_id=uid and action='report' and created_at>now()-interval '1 hour')>=20 then raise exception 'Please try again later.'; end if;
    insert into messaging.reports(conversation_id,message_id,reporter_id,reason,evidence)
      values(cid,mid,uid,p_data->>'reason',messaging.message_json(mid,uid));
    insert into messaging.audit(actor_id,action,subject_id) values(uid,'report',cid);return '{}'::jsonb;
  elsif p_action in ('pause','pin','remove','approve','entrants','reports','resolve_report') then
    perform messaging.require_manager(c.event_id);
    if p_action='entrants' then
      return coalesce((select jsonb_agg(jsonb_build_object('id',p.id::text,'name',p.name,'confirmed',messaging.event_access(c.event_id,a.user_id)=2))
        from messaging.accounts a join public.players p on p.id=a.player_id where messaging.event_access(c.event_id,a.user_id)>0),'[]'::jsonb);
    elsif p_action='pause' then
      update messaging.conversations set paused=coalesce((p_data->>'paused')::boolean,true) where event_id=c.event_id and kind='event_discussion';
    elsif p_action='pin' then
      mid:=nullif(p_data->>'messageId','')::uuid;
      if c.kind<>'event_announcements' or (mid is not null and not exists(select 1 from messaging.messages where id=mid and conversation_id=cid and deleted_at is null)) then raise exception 'Choose an announcement from this event.'; end if;
      update messaging.conversations set pinned_id=mid where id=cid;
    elsif p_action='remove' then
      update messaging.messages set body='',card_event_id=null,reply_id=null,deleted_at=clock_timestamp()
        where id=(p_data->>'messageId')::uuid and conversation_id=cid;
    elsif p_action='approve' then
      select user_id into other from messaging.accounts where player_id=(p_data->>'playerId')::bigint;
      if other is null or messaging.event_access(c.event_id,other)=0 then raise exception 'Choose an active event entrant with a messaging account.'; end if;
      insert into messaging.event_approvals(event_id,user_id,approved_by) values(c.event_id,other,uid) on conflict do nothing;
      perform messaging.sync_event(c.event_id);
    elsif p_action='reports' then
      return coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'reason',r.reason,'status',r.status,'evidence',r.evidence,'createdAt',r.created_at))
        from messaging.reports r join messaging.conversations rc on rc.id=r.conversation_id where rc.event_id=c.event_id and rc.kind<>'direct' and r.status='open'),'[]'::jsonb);
    elsif p_action='resolve_report' then
      update messaging.reports r set status='resolved',closed_at=clock_timestamp()
        from messaging.conversations rc where r.id=(p_data->>'reportId')::uuid and rc.id=r.conversation_id and rc.event_id=c.event_id and rc.kind<>'direct';
    end if;
    insert into messaging.audit(actor_id,action,subject_id) values(uid,p_action,cid);
    for other in select user_id from messaging.members where conversation_id=cid and active loop perform messaging.signal(other); end loop;
    return '{}'::jsonb;
  elsif p_action='delete' then
    update messaging.messages set body='',card_event_id=null,reply_id=null,deleted_at=clock_timestamp()
      where id=(p_data->>'messageId')::uuid and conversation_id=cid and sender_id=uid;
    for other in select user_id from messaging.members where conversation_id=cid and active loop perform messaging.signal(other); end loop;
    return '{}'::jsonb;
  elsif p_action='send' then
    if not cfg.sending_enabled or not messaging.interactive(uid) or (c.kind='direct' and c.state<>'accepted') then raise exception 'You cannot send to this conversation.' using errcode='42501'; end if;
    if c.kind='direct' and exists(select 1 from messaging.members where conversation_id=cid and user_id<>uid and not messaging.interactive(user_id)) then raise exception 'This conversation is currently unavailable.' using errcode='42501'; end if;
    if c.kind='event_announcements' then perform messaging.require_manager(c.event_id); end if;
    if c.kind<>'direct' and (not (messaging.conversation_json(cid,uid)->>'canSend')::boolean) then raise exception 'This conversation is read-only.' using errcode='42501'; end if;
    key:=(p_data->>'clientId')::uuid;
    select * into m from messaging.messages where sender_id=uid and client_id=key;
    if m.id is not null then
      if m.conversation_id<>cid then raise exception 'Message retry belongs to another conversation.'; end if;
      return messaging.message_json(m.id,uid);
    end if;
    body:=btrim(coalesce(p_data->>'body',''));
    if key is null or char_length(body)>4000 or (body='' and nullif(p_data->>'eventId','') is null) then raise exception 'Write a message of up to 4,000 characters.'; end if;
    if (select count(*) from messaging.audit where actor_id=uid and action='send' and created_at>clock_timestamp()-interval '10 seconds')>=20 then raise exception 'You’re sending too quickly. Wait a moment.'; end if;
    -- Plain text only. No third-party content scanning or URL preview fetches.
    if body ~* '(\m(kill yourself|child porn)\M)' then raise exception 'This message could not be sent. Please review the community rules.'; end if;
    mid:=nullif(p_data->>'replyId','')::uuid;
    if mid is not null and (not messaging.visible(mid,uid) or not exists(select 1 from messaging.messages where id=mid and conversation_id=cid and deleted_at is null)) then raise exception 'That reply is no longer available.'; end if;
    event:=nullif(p_data->>'eventId','')::bigint;
    if event is not null and not exists(select 1 from public.calendar where id=event and is_visible=true and (sanction_status is null or sanction_status='approved')) then raise exception 'Choose a published 4M event.'; end if;
    insert into messaging.messages(conversation_id,sender_id,client_id,body,reply_id,card_event_id,card_tab,expires_at)
      values(cid,uid,key,body,mid,event,coalesce(p_data->>'cardTab','Overview'),case when c.kind='direct' then now()+interval '12 months'
        else (select (coalesce(end_date,start_date)::date+91)::timestamptz from public.calendar where id=c.event_id) end) returning * into m;
    update messaging.conversations set updated_at=clock_timestamp() where id=cid;
    update messaging.members set archived=false where conversation_id=cid;
    insert into messaging.audit(actor_id,action,subject_id) values(uid,'send',cid);
    perform messaging.queue_message(m.id);return messaging.message_json(m.id,uid);
  end if;
  raise exception 'Unsupported messaging action.';
end $$;

create function public.messaging_api(p_action text,p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path='' set timezone='Africa/Johannesburg' as $$ select messaging.api(p_action,p_data) $$;
revoke all on function public.messaging_api(text,jsonb) from public,anon,authenticated;
grant execute on function public.messaging_api(text,jsonb) to authenticated;
revoke all on all functions in schema messaging from public,anon,authenticated;
grant execute on function messaging.api(text,jsonb) to authenticated;

-- Restrictive boundary also protects these topics if an older permissive policy exists.
create policy "Messaging private inbox" on realtime.messages for select to authenticated
using (realtime.topic()='messaging:'||auth.uid()::text and extension='broadcast');
create policy "Messaging inbox boundary" on realtime.messages as restrictive for select to authenticated
using (realtime.topic() not like 'messaging:%' or (realtime.topic()='messaging:'||auth.uid()::text and extension='broadcast'));
create policy "Messaging server signals only" on realtime.messages as restrictive for insert to authenticated
with check (realtime.topic() not like 'messaging:%');

-- No report browsing endpoint for ordinary administrators. DM cases require the
-- separately controlled, MFA-protected support process documented in messaging.md.
create function messaging.remove_account_content() returns trigger language plpgsql security definer set search_path='' set timezone='Africa/Johannesburg' as $$
begin
  update messaging.messages set body='',card_event_id=null,reply_id=null,deleted_at=clock_timestamp() where sender_id=old.user_id;
  update messaging.conversations conv set pair_key=null,state=case when state='pending' then 'declined' else state end
    where conv.kind='direct' and exists(select 1 from messaging.members member where member.conversation_id=conv.id and member.user_id=old.user_id);
  return old;
end $$;
create trigger messaging_account_erasure before delete on messaging.accounts for each row execute function messaging.remove_account_content();

create function messaging.maintenance() returns void language plpgsql security definer set search_path='' set timezone='Africa/Johannesburg' as $$
begin
  delete from messaging.messages where expires_at<=now();
  delete from messaging.conversations c using public.calendar e where e.id=c.event_id and current_date>coalesce(e.end_date,e.start_date)::date+90;
  delete from messaging.guardian_consents where consented_at is null and expires_at<now()-interval '7 days';
  delete from messaging.reports where not legal_hold and closed_at<now()-interval '180 days';
  delete from messaging.audit where created_at<now()-interval '12 months';
  delete from messaging.deliveries where created_at<now()-interval '2 days';
end $$;
-- Worker API is separately granted. It never accepts a caller-selected recipient.
create function messaging.delivery_api(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' set timezone='Africa/Johannesburg' as $$
declare job messaging.deliveries; item record; prefs jsonb; due timestamptz; batch jsonb:='[]'; token text;
begin
  if p_action='claim' then
    perform messaging.maintenance();
    for job in select * from messaging.deliveries where state in ('pending','leased','accepted') and available_at<=now()
      order by available_at limit 50 for update skip locked loop
      update messaging.deliveries set state=case when ticket_id is null then 'leased' else 'accepted' end,
        lease_id=gen_random_uuid(),available_at=now()+interval '3 minutes',attempts=attempts+1 where id=job.id returning * into job;
      batch:=batch||jsonb_build_array(jsonb_build_object('id',job.id,'lease',job.lease_id,'ticket',job.ticket_id,'attempts',job.attempts));
    end loop;
    return batch;
  end if;
  select * into job from messaging.deliveries where id=(p_data->>'id')::uuid and lease_id=(p_data->>'lease')::uuid for update;
  if job.id is null then return jsonb_build_object('skip',true); end if;
  if p_action='context' then
    if exists(select 1 from messaging.conversations where id=job.conversation_id and event_id is not null) then
      perform pg_advisory_xact_lock(7021,(select event_id::int from messaging.conversations where id=job.conversation_id));
    end if;
    select to_jsonb(p.notification_prefs) into prefs from public.players p join messaging.accounts a on a.player_id=p.id where a.user_id=job.user_id;
    if not messaging.visible(job.message_id,job.user_id) or job.created_at<now()-interval '24 hours'
      or prefs->>'push_enabled'='false' or exists(select 1 from messaging.members where conversation_id=job.conversation_id and user_id=job.user_id and muted) then
      update messaging.deliveries set state='skipped' where id=job.id;return jsonb_build_object('skip',true);
    end if;
    due:=public.notification_quiet_until(coalesce(prefs,'{}'));
    if due>now() then update messaging.deliveries set state='pending',available_at=due where id=job.id;return jsonb_build_object('skip',true); end if;
    select t.token into token from public.player_push_tokens t join auth.users u on lower(trim(u.email))=lower(trim(t.email))
      where t.id=job.token_id and u.id=job.user_id and t.token_kind='expo';
    if token is null then update messaging.deliveries set state='skipped' where id=job.id;return jsonb_build_object('skip',true); end if;
    return jsonb_build_object('token',token,'title','4M Padel','body',case when exists(select 1 from messaging.conversations where id=job.conversation_id and kind='event_announcements')
      then 'New event announcement' else 'You have a new message' end,'path','/(tabs)/messages');
  elsif p_action='finish' then
    if p_data->>'state' not in ('accepted','sent','skipped','failed','pending') then raise exception 'Invalid delivery state'; end if;
    update messaging.deliveries set state=p_data->>'state',ticket_id=coalesce(p_data->>'ticket',ticket_id),
      attempts=case when p_data->>'state'='accepted' and p_data->>'ticket' is not null then 0 else attempts end,
      available_at=now()+case when p_data->>'state'='accepted' then interval '15 minutes' else interval '1 minute'*least(60,power(2,least(job.attempts,6))) end where id=job.id;
    if p_data->>'unregistered'='true' then delete from public.player_push_tokens t using auth.users u where t.id=job.token_id and u.id=job.user_id and lower(trim(t.email))=lower(trim(u.email)); end if;
    return '{}';
  end if;
  raise exception 'Unsupported delivery action';
end $$;
create function public.messaging_delivery_api(p_action text,p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path='' set timezone='Africa/Johannesburg' as $$ select messaging.delivery_api(p_action,p_data) $$;
revoke all on function public.messaging_delivery_api(text,jsonb) from public,anon,authenticated;
grant execute on function public.messaging_delivery_api(text,jsonb) to service_role;
revoke all on all functions in schema messaging from public,anon;
revoke all on function messaging.delivery_api(text,jsonb),messaging.maintenance(),messaging.remove_account_content() from authenticated;
grant execute on function messaging.delivery_api(text,jsonb) to service_role;
notify pgrst,'reload schema';
