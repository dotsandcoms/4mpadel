\set ON_ERROR_STOP on
begin;
do $$begin
  if current_database()<>'fourm_messaging_test' or exists(select 1 from pg_tables where schemaname='public') then raise exception 'Empty isolated messaging database required'; end if;
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
end $$;
create schema auth;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz default now(),deleted_at timestamptz,is_anonymous boolean default false,banned_until timestamptz);
create table auth.sessions(id uuid primary key,user_id uuid references auth.users on delete cascade,created_at timestamptz default now(),not_after timestamptz);
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
create function auth.uid() returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;
create function auth.email() returns text language sql stable as $$select auth.jwt()->>'email'$$;
create table public.players(id bigint primary key,email text,name text,image_url text,region text,racket_brand text,notification_prefs jsonb default '{}');
create table public.player_profile_details(player_id bigint primary key references public.players,date_of_birth date);
create table public.calendar(id bigint primary key,event_name text,start_date date,end_date date,event_status text,is_visible boolean default true,sanction_status text,organisation_id uuid,organiser_email text,event_co_admins text[],venue text,city text,poster_image_url text,custom_image_url text,image_url text,sapa_status text,entry_fee numeric,early_bird_fee numeric,early_bird_ends_at timestamptz);
alter table public.calendar add column organiser_name text;
create table public.payments(id uuid primary key default gen_random_uuid(),event_id bigint,email text,status text);
alter table public.payments add column player_id bigint,add column reference text,add column metadata jsonb default '{}';
create table public.payment_refunds(id uuid primary key default gen_random_uuid(),payment_id uuid references public.payments(id),metadata jsonb default '{}');
create table public.tournament_divisions(id uuid primary key default gen_random_uuid(),event_id bigint,entry_fee numeric,name text);
create table public.organisations(id uuid primary key,created_by bigint references public.players,name text);
create table public.organisation_members(organisation_id uuid references public.organisations,user_email text,role text);
create table public.event_registrations(id uuid primary key default gen_random_uuid(),event_id bigint references public.calendar,division_id uuid,email text,partner_email text,payment_status text,partner_payment_status text,status text default 'registered');
create table public.tournament_participants(id uuid primary key default gen_random_uuid(),event_id bigint,email text,class_name text);
create table public.player_push_tokens(id uuid primary key default gen_random_uuid(),email text,token text,token_kind text default 'expo');
create table public.push_outbox(id uuid primary key default gen_random_uuid(),email text,type text,title text,body text,path text,created_at timestamptz default now(),not_before timestamptz default now(),obsolete boolean default false,expanded_at timestamptz);
alter table public.push_outbox enable row level security;
revoke all on public.push_outbox from public,anon,authenticated;
grant select,insert,update,delete on public.push_outbox to service_role;
-- Include unscoped legacy admins from the start, so cached SQL plans use the
-- same legacy permission model throughout every tenant-isolation assertion.
create function public.can_manage_event(bigint) returns boolean language sql stable as $$
  select (auth.email()='staff@test.test' and $1=100) or auth.email() in ('org-a@test.test','org-b@test.test','broad-tab@test.test','assigned@test.test','co-admin@test.test')
$$;
create table public.admin_sidebar_permissions(email text,allowed_tabs text[],role text,module_permissions jsonb default '{}');
insert into public.admin_sidebar_permissions(email,allowed_tabs,role) values('staff@test.test','{}','super_admin');
create function public.is_super_admin(text) returns boolean language plpgsql stable security definer as $$begin return exists(select 1 from admin_sidebar_permissions where email=$1 and role='super_admin'); end$$;
create function public.notification_quiet_until(jsonb) returns timestamptz language sql stable as $$select now()$$;
create schema realtime;
create table realtime.messages(id bigint,extension text);
alter table realtime.messages enable row level security;
create function realtime.topic() returns text language sql stable as $$select current_setting('test.topic',true)$$;
create table realtime.test_signals(topic text,event text,payload jsonb);
create function realtime.send(jsonb,text,text,boolean) returns void language sql as $$insert into realtime.test_signals values($3,$2,$1)$$;
grant usage on schema public,auth,realtime to anon,authenticated,service_role;
grant execute on all functions in schema auth to anon,authenticated,service_role;
grant select,insert on realtime.messages to authenticated;
-- Deliberately over-broad legacy realtime policies must not weaken messaging topics.
create policy old_realtime_read on realtime.messages for select to authenticated using(true);
create policy old_realtime_write on realtime.messages for insert to authenticated with check(true);
alter default privileges in schema public revoke all on tables from public,anon,authenticated,service_role;
\ir ../supabase/migrations/20261105094904_in_app_messaging.sql
\ir ../supabase/migrations/20261105111546_app_icon_badges.sql
\ir ../supabase/migrations/20261105111604_messaging_event_dashboard.sql
\ir ../supabase/migrations/20261105111628_messaging_unread_controls.sql
\ir ../supabase/migrations/20261105111650_messaging_realtime_and_delivery_capacity.sql
\ir ../supabase/migrations/20261105120341_messaging_sender_roles.sql
\ir ../supabase/migrations/20261105120943_messaging_announcement_authors.sql
\ir ../supabase/migrations/20261105122906_messaging_publisher_avatars.sql
\ir ../supabase/migrations/20261106052656_messaging_division_announcements.sql
\ir ../supabase/migrations/20261106074607_messaging_notification_preferences.sql
\ir ../supabase/migrations/20261110084130_messaging_player_groups_and_admin_outreach.sql
\ir ../supabase/migrations/20261110095535_messaging_admin_inbox_scope_qualification.sql
\ir ../supabase/migrations/20261110114014_messaging_group_event_attachments.sql
\ir ../supabase/migrations/20261110100044_notification_read_state_and_unread_badges.sql
-- Reproduce hosted legacy drift; the correction must close even broad policies/grants.
grant select,insert,update,delete on public.push_outbox to anon,authenticated;
create policy account_must_exist on public.push_outbox for all to authenticated using(true) with check(true);
\ir ../supabase/migrations/20261110101140_notification_inbox_access_contract.sql
\ir ../supabase/migrations/20261111082951_messaging_super_admin_event_intervention.sql
\ir ../supabase/migrations/20261112102049_messaging_delete_conversation.sql
\ir ../supabase/migrations/20261113060150_organiser_help_requests.sql
alter table public.event_registrations add column full_name text,add column partner_name text,add column division text;
\ir ../supabase/migrations/20261113070555_help_messages_and_read_receipts.sql
\ir ../supabase/migrations/20261113091431_help_support_alerts_and_entry_context.sql
\ir ../supabase/migrations/20261113101314_help_conversation_archive.sql

create function pg_temp.expect(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; end$$;
create function pg_temp.reject(query text,pattern text) returns void language plpgsql as $$begin
  begin execute query; exception when others then
    if sqlerrm!~pattern then raise exception 'Unexpected rejection: % (expected %)',sqlerrm,pattern; end if;return;
  end;raise exception 'Expected rejection: %',query;
end$$;
create function pg_temp.login(n int,aal text default 'aal1') returns void language plpgsql security definer as $$begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',('00000000-0000-0000-0000-'||lpad(n::text,12,'0')),
    'email',(select email from auth.users where id=('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid),
    'session_id',('10000000-0000-0000-0000-'||lpad(n::text,12,'0')),'aal',aal)::text,true);
end$$;
insert into auth.users(id,email) select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  (array['alice','bob','charlie','staff','junior','guardian','late','partner'])[n]||'@test.test' from generate_series(1,8)n;
insert into auth.sessions(id,user_id) select ('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,8)n;
insert into public.players(id,email,name,image_url,notification_prefs) select n,email,split_part(email,'@',1),null,'{}' from auth.users cross join lateral (select right(id::text,1)::int n) p;
insert into public.player_profile_details select id,case when id=5 then current_date-interval '15 years' else date '1990-01-01' end from public.players;
insert into public.calendar(id,event_name,start_date,end_date) values(100,'4M Open',current_date,current_date),(200,'Other club',current_date,current_date);
insert into public.event_registrations(event_id,email,payment_status) values (100,'alice@test.test','paid'),(100,'bob@test.test','pending');
insert into public.player_push_tokens(email,token) values('alice@test.test','ExponentPushToken[alice]'),('bob@test.test','ExponentPushToken[bob]');
update messaging.configuration set enabled=true,juniors_enabled=true;
-- Initialise verified identity links and rules through the real authenticated API.
set local role authenticated;
select pg_temp.login(1);select public.messaging_api('accept_rules','{"version":"2026-11-05"}');
select pg_temp.login(2);select public.messaging_api('accept_rules','{"version":"2026-11-05"}');
select pg_temp.login(3);select public.messaging_api('accept_rules','{"version":"2026-11-05"}');
select pg_temp.login(4);select public.messaging_api('accept_rules','{"version":"2026-11-05"}');
select pg_temp.login(5);select public.messaging_api('accept_rules','{"version":"2026-11-05"}');
select pg_temp.login(6);select public.messaging_api('accept_rules','{"version":"2026-11-05"}');
select pg_temp.login(7);select public.messaging_api('accept_rules','{"version":"2026-11-05"}');
select pg_temp.login(8);select public.messaging_api('accept_rules','{"version":"2026-11-05"}');
select pg_temp.reject('select * from messaging.messages','permission denied');
select pg_temp.reject('select messaging.event_access(100,auth.uid())','permission denied');
select pg_temp.reject($q$select public.messaging_delivery_api('claim')$q$,'permission denied');
select pg_temp.login(1);
select public.messaging_api('request','{"playerId":2,"body":"Hi Bob","clientId":"20000000-0000-0000-0000-000000000001"}')->>'id' as dm \gset
select pg_temp.expect(public.messaging_api('request','{"playerId":2,"body":"retry","clientId":"20000000-0000-0000-0000-000000000001"}')->>'id'=:'dm','request retry is idempotent');
select pg_temp.reject(format('select public.messaging_api(''send'',%L)',jsonb_build_object('conversationId',:'dm','body','second before accepted','clientId',gen_random_uuid())),'cannot send');
select pg_temp.login(3);
select pg_temp.reject(format('select public.messaging_api(''read'',%L)',jsonb_build_object('conversationId',:'dm')),'unavailable');
select pg_temp.login(2);
select pg_temp.expect(public.messaging_api('read',jsonb_build_object('conversationId',:'dm'))->'messages'->0->>'body'='Hi Bob','introduction visible to recipient');
select public.messaging_api('respond',jsonb_build_object('conversationId',:'dm','response','accept'));
select public.messaging_api('send',jsonb_build_object('conversationId',:'dm','body','Hello Alice','clientId','20000000-0000-0000-0000-000000000002')) as sent \gset
select pg_temp.expect(public.messaging_api('send',jsonb_build_object('conversationId',:'dm','body','retry text','clientId','20000000-0000-0000-0000-000000000002'))->>'id'=(:'sent'::jsonb->>'id'),'send retry reuses original message');
select pg_temp.login(1);
select pg_temp.expect(jsonb_array_length(public.messaging_api('read',jsonb_build_object('conversationId',:'dm'))->'messages')=2,'accepted direct conversation');
select public.messaging_api('report',jsonb_build_object('conversationId',:'dm','messageId',:'sent'::jsonb->>'id','reason','spam'));
select public.messaging_api('mark_read',jsonb_build_object('conversationId',:'dm','seq',:'sent'::jsonb->>'seq'));
select pg_temp.expect((public.messaging_api('read',jsonb_build_object('conversationId',:'dm'))->'conversation'->>'unread')::int=0,'read position scoped to visible messages');
-- Reminder state never rewinds the actual read receipt.
select public.messaging_mark_unread(:'dm'::uuid,(:'sent'::jsonb->>'id')::uuid);
select pg_temp.expect((public.messaging_api('read',jsonb_build_object('conversationId',:'dm'))->'conversation'->>'unread')::int=1,'mark-unread restores an incoming reminder');
reset role;
select pg_temp.expect((select read_seq=(:'sent'::jsonb->>'seq')::bigint from messaging.members where conversation_id=:'dm' and user_id='00000000-0000-0000-0000-000000000001'),'mark-unread preserves true read history');
set local role authenticated;
select pg_temp.login(3);
select pg_temp.reject(format('select public.messaging_mark_unread(%L::uuid)',:'dm'),'unavailable');
select pg_temp.login(1);
select public.messaging_api('mark_read',jsonb_build_object('conversationId',:'dm','seq',:'sent'::jsonb->>'seq'));
select pg_temp.expect((public.own_app_badge_unread())=0,'reading clears reminder and zero badge');
select pg_temp.expect(not exists(select 1 from jsonb_array_elements(public.messaging_snapshot(false)->'rows') r where r->>'preview'<>'' or r->'pinned'<>'null'::jsonb),'non-message routes receive no preview content');
-- Managers cannot browse unrelated private conversations, including with MFA.
\ir messaging-delete.sql
\ir help-requests.sql
\ir help-inbox.sql
\ir help-alerts.sql
\ir help-archive.sql
select pg_temp.login(4,'aal2');
select pg_temp.reject(format('select public.messaging_api(''read'',%L)',jsonb_build_object('conversationId',:'dm')),'unavailable');
select pg_temp.login(1);
select public.messaging_api('open_event','{"eventId":100}') as event_channels \gset
select value->>'id' as discussion from jsonb_array_elements(:'event_channels'::jsonb) where value->>'kind'='event_discussion' \gset
select value->>'id' as announcements from jsonb_array_elements(:'event_channels'::jsonb) where value->>'kind'='event_announcements' \gset
select public.messaging_api('send',jsonb_build_object('conversationId',:'discussion','body','Before Bob qualified','clientId',gen_random_uuid())) as before_bob \gset
select pg_temp.login(2);
select pg_temp.expect(jsonb_array_length(public.messaging_api('open_event','{"eventId":100}'))=1,'unpaid entrant gets announcements only');
select pg_temp.reject(format('select public.messaging_api(''read'',%L)',jsonb_build_object('conversationId',:'discussion')),'unavailable');
select pg_temp.login(3);
select pg_temp.reject($q$select public.messaging_api('open_event','{"eventId":100}')$q$,'Register');
select pg_temp.login(4);
select pg_temp.reject($q$select public.messaging_api('open_event','{"eventId":100}')$q$,'two-factor');
select pg_temp.login(4,'aal2');
select public.messaging_api('open_event','{"eventId":100}');
select public.messaging_api('send',jsonb_build_object('conversationId',:'announcements','body','Check-in at 08:00','clientId',gen_random_uuid())) as announcement \gset
select pg_temp.expect(:'announcement'::jsonb->'sender'->>'role'='admin','platform admin posting role is server assigned');
reset role;
update public.admin_sidebar_permissions set role='admin' where email='staff@test.test';
select pg_temp.expect((select sender_role='admin' from messaging.messages where id=(:'announcement'::jsonb->>'id')::uuid),'sent role remains after permission changes');
update public.admin_sidebar_permissions set role='super_admin' where email='staff@test.test';
set local role authenticated;
select pg_temp.login(4,'aal2');
select public.messaging_api('pin',jsonb_build_object('conversationId',:'announcements','messageId',:'announcement'::jsonb->>'id'));
select pg_temp.expect(jsonb_array_length(public.messaging_api('open_event','{"eventId":200}'))=2,'Super Admin can open an unrelated event without an assignment');
select pg_temp.expect(public.messaging_event_directory('4M Open')->0->>'title'='4M Open','server event search finds authorised event');
select pg_temp.expect(public.messaging_event_analytics(100)->'summary'->>'announcements'='1','dashboard reads actual announcement count');
select pg_temp.expect(public.messaging_event_analytics(100)->'announcements'->0->'sender'->>'role'='admin','announcement analytics identifies verified publisher role');
select pg_temp.expect(not (public.messaging_event_analytics(100)->'announcements'->0->'sender' ? 'email'),'announcement publisher DTO excludes contact fields');
select pg_temp.expect(public.messaging_event_analytics(100)->'announcements'->0->'sender' ? 'image','publisher photo uses existing authorised sender data');
select pg_temp.expect(public.messaging_event_analytics(100)->'announcements'->0->>'body'='Check-in at 08:00','event analytics scoped announcement body');
select pg_temp.expect(public.messaging_event_analytics(200)->'summary'->>'announcements'='0','Super Admin can inspect another event without mixing analytics');
reset role;
select pg_temp.login(2);
-- Simulate a client-controlled legacy flag: it must not confer discussion access.
update public.event_registrations set payment_status='paid' where email='bob@test.test';
set local role authenticated;
select pg_temp.login(2);
select pg_temp.expect(jsonb_array_length(public.messaging_api('open_event','{"eventId":100}'))=1,'forging the legacy paid flag does not unlock discussion');
reset role;
select set_config('request.jwt.claims','{}',true);
update public.event_registrations set payment_status='paid' where email='bob@test.test';
set local role authenticated;
select pg_temp.login(2);
select pg_temp.expect(jsonb_array_length(public.messaging_api('read',jsonb_build_object('conversationId',:'discussion'))->'messages')=0,'newly confirmed entrant cannot read earlier discussion');
select public.messaging_api('send',jsonb_build_object('conversationId',:'discussion','body','Now confirmed','clientId',gen_random_uuid(),'senderRole','admin','role','organiser')) as group_post \gset
select pg_temp.expect(:'group_post'::jsonb->'sender'->>'role'='player','client cannot spoof staff posting role');
select pg_temp.login(4,'aal2');
select public.messaging_api('send',jsonb_build_object('conversationId',:'discussion','body','Reply from event admin','clientId',gen_random_uuid(),'replyId',:'group_post'::jsonb->>'id')) as role_reply \gset
select pg_temp.expect(:'role_reply'::jsonb->'sender'->>'role'='admin' and :'role_reply'::jsonb->'reply'->>'role'='player' and :'role_reply'::jsonb->'reply'->>'body'='Now confirmed','quoted reply includes independently verified sender role');
select pg_temp.login(2);
select pg_temp.expect(public.messaging_api('read',jsonb_build_object('conversationId',:'announcements'))->'conversation'->'pinned'->>'body'='Check-in at 08:00','existing announcement and pin visible to entrant');
reset role;
update public.event_registrations set status='withdrawn' where email='bob@test.test';
set local role authenticated;
select pg_temp.expect(jsonb_array_length(public.messaging_api('list'))=1,'withdrawal removes event channels from inbox');
select pg_temp.reject(format('select public.messaging_api(''read'',%L)',jsonb_build_object('conversationId',:'announcements')),'unavailable');
select pg_temp.reject(format('select public.messaging_api(''send'',%L)',jsonb_build_object('conversationId',:'discussion','body','not allowed','clientId',gen_random_uuid())),'unavailable');
reset role;
select set_config('request.jwt.claims','{}',true);
update public.event_registrations set status='registered' where email='bob@test.test';
set local role authenticated;
select pg_temp.login(2);
select pg_temp.expect(jsonb_array_length(public.messaging_api('read',jsonb_build_object('conversationId',:'discussion'))->'messages')=0,'rejoining cannot see absence or former membership history');
-- Consent is bound to a distinct verified guardian, with recent authentication.
select pg_temp.login(5);
select pg_temp.expect(public.messaging_api('status')->>'interactive'='false','junior cannot chat without consent');
select pg_temp.reject($q$select public.messaging_api('request','{"playerId":1,"body":"hello","clientId":"20000000-0000-0000-0000-000000000005"}')$q$,'setup');
select public.messaging_api('guardian_invite','{"email":"guardian@test.test"}')->>'code' as consent_code \gset
select pg_temp.login(3);
select pg_temp.reject(format('select public.messaging_api(''guardian_review'',%L)',jsonb_build_object('code',:'consent_code')),'unavailable');
select pg_temp.login(6);
select pg_temp.expect(public.messaging_api('guardian_review',jsonb_build_object('code',:'consent_code'))->>'name'='junior','guardian sees intended junior');
select public.messaging_api('guardian_accept',jsonb_build_object('code',:'consent_code','version','2026-11-05','declaration','I am an adult with legal authority to consent'));
select public.messaging_api('status')->'consents'->0->>'id' as consent_id \gset
select pg_temp.login(5);
select pg_temp.expect(public.messaging_api('status')->>'interactive'='true','recorded guardian consent unlocks junior');
select pg_temp.login(6);
select public.messaging_api('guardian_revoke',jsonb_build_object('id',:'consent_id'));
select pg_temp.login(5);
select pg_temp.expect(public.messaging_api('status')->>'interactive'='false','revocation immediately locks junior chat');
-- A stale JWT cannot outlive its server session or account email change.
reset role;
delete from auth.sessions where user_id='00000000-0000-0000-0000-000000000003';
set local role authenticated;
select pg_temp.login(3);
select pg_temp.reject($q$select public.messaging_api('status')$q$,'Sign in again');
select pg_temp.login(1);
select public.messaging_api('block',jsonb_build_object('conversationId',:'dm'));
select pg_temp.login(2);
select pg_temp.reject(format('select public.messaging_api(''read'',%L)',jsonb_build_object('conversationId',:'dm')),'unavailable');
-- A broad legacy realtime policy still cannot read or publish to another inbox.
select set_config('test.topic','messaging:00000000-0000-0000-0000-000000000001',true);
select pg_temp.reject('insert into realtime.messages values(1,''broadcast'')','row-level security');
reset role;
insert into realtime.messages values(1,'broadcast');
set local role authenticated;
select pg_temp.expect((select count(*)=0 from realtime.messages),'other account inbox denied under broad old policies');
select pg_temp.login(1);
select pg_temp.expect((select count(*)=1 from realtime.messages),'own signal inbox permitted');
reset role;
select pg_temp.expect(not exists(select 1 from realtime.test_signals where payload<>'{}'::jsonb),'signals carry no message content or identifiers');
select pg_temp.expect(not has_schema_privilege('anon','messaging','usage'),'anonymous cannot access private schema');
select pg_temp.expect(not has_function_privilege('authenticated','messaging.delivery_api(text,jsonb)','execute'),'worker helper not callable by players');
select pg_temp.expect(not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='messaging' and c.relkind='r' and not c.relrowsecurity),'all private tables enable RLS');
-- Table and sequence ACLs remain closed even if the schema is accidentally exposed.
do $$declare relation record; privilege text; begin
  for relation in select tablename from pg_tables where schemaname='messaging' loop
    foreach privilege in array array['SELECT','INSERT','UPDATE','DELETE'] loop
      perform pg_temp.expect(not has_table_privilege('anon','messaging.'||relation.tablename,privilege),'anonymous private table denied');
      perform pg_temp.expect(not has_table_privilege('authenticated','messaging.'||relation.tablename,privilege),'player private table denied');
      perform pg_temp.expect(has_table_privilege('service_role','messaging.'||relation.tablename,privilege)
        = (relation.tablename not in ('groups','group_members','admin_batches')),'reviewed worker private table grant');
    end loop;
  end loop;
end $$;
select pg_temp.expect(has_sequence_privilege('service_role','messaging.messages_seq_seq','USAGE'),'explicit worker sequence grant');
select pg_temp.expect(not has_sequence_privilege('authenticated','messaging.messages_seq_seq','USAGE'),'player sequence denied');
set local role anon;
select pg_temp.reject($q$select public.messaging_api('status')$q$,'permission denied');
reset role;
-- Worker claim/context returns generic copy and rechecks access after enqueue.
update messaging.deliveries set available_at=now()-interval '1 second';
set local role service_role;
select public.messaging_delivery_api('claim') as jobs \gset
reset role;
select pg_temp.expect(jsonb_array_length(:'jobs'::jsonb)>0,'durable message jobs queued');
set local role service_role;
select public.messaging_delivery_api('context',jsonb_build_object('id',value->>'id','lease',value->>'lease')) as context
  from jsonb_array_elements(:'jobs'::jsonb) limit 1 \gset
select pg_temp.expect((:'context'::jsonb ? 'skip') or (:'context'::jsonb->>'body' in ('You have a new message','New event announcement')),'worker context contains only generic content');
reset role;
-- Moderators see only reported DM evidence, with MFA; ordinary users cannot browse cases.
set local role authenticated;
select pg_temp.login(1);
select pg_temp.reject($q$select public.messaging_api('support_reports')$q$,'access denied');
select pg_temp.login(4);
select pg_temp.reject($q$select public.messaging_api('support_reports')$q$,'access denied');
select pg_temp.login(4,'aal2');
select pg_temp.expect(jsonb_array_length(public.messaging_api('support_reports'))=1,'MFA support sees the submitted report only');
select pg_temp.reject(format('select public.messaging_api(''read'',%L)',jsonb_build_object('conversationId',:'dm')),'unavailable');
reset role;
-- Expired content is denied before cleanup, and evidence has a separate retention boundary.
update messaging.messages set expires_at=now()-interval '1 minute' where id=(:'sent'::jsonb->>'id')::uuid;
select messaging.maintenance();
select pg_temp.expect(not exists(select 1 from messaging.messages where id=(:'sent'::jsonb->>'id')::uuid),'expired message removed');
select pg_temp.expect(exists(select 1 from messaging.reports where evidence->>'body'='Hello Alice'),'report evidence retained independently');
-- Cohort rollout restrictions apply to both API actions and content reads.
update messaging.configuration set pilot_player_ids=array[1::bigint];
set local role authenticated;
select pg_temp.login(1);
select pg_temp.expect(public.messaging_api('status')->>'enabled'='true','pilot player enabled');
select pg_temp.login(4,'aal2');
select pg_temp.expect(public.messaging_api('status')->>'enabled'='false','nonpilot account disabled even with administrator role');
select pg_temp.reject($q$select public.messaging_api('support_reports')$q$,'getting ready');
reset role;
update messaging.configuration set pilot_player_ids='{}';
-- Model the dangerous legacy Full Access rule with two independent tenants.
-- Messaging must still reject the other organisation's IDs and every action.
insert into auth.users(id,email) select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  (array['org-a','org-b','broad-tab','assigned','co-admin'])[n-8]||'@test.test' from generate_series(9,13)n;
insert into auth.sessions(id,user_id) select ('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid from generate_series(9,13)n;
insert into public.players(id,email,name) select n,u.email,u.email from generate_series(9,13)n
  join auth.users u on u.id=('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid;
insert into public.player_profile_details select n,date '1990-01-01' from generate_series(9,13)n;
insert into public.organisations(id,created_by) values('30000000-0000-0000-0000-000000000001',9),('30000000-0000-0000-0000-000000000002',10);
insert into public.organisation_members values('30000000-0000-0000-0000-000000000001','org-a@test.test','owner'),('30000000-0000-0000-0000-000000000002','org-b@test.test','admin');
insert into public.calendar(id,event_name,start_date,end_date,organisation_id,event_co_admins) values
  (1000,'Organisation A event',current_date,current_date,'30000000-0000-0000-0000-000000000001',array['co-admin@test.test']),
  (2000,'Organisation B event',current_date,current_date,'30000000-0000-0000-0000-000000000002','{}');
insert into public.admin_sidebar_permissions(email,allowed_tabs,role,module_permissions) values
  ('org-a@test.test',array['event-mgmt'],'admin','{}'),
  ('org-b@test.test',array['event-mgmt'],'admin','{}'),
  ('broad-tab@test.test',array['event-mgmt'],'admin','{}'),
  ('assigned@test.test',array['event-mgmt'],'admin','{"event-mgmt":{"allowedEvents":[1000]}}');
set local role authenticated;
select pg_temp.login(9,'aal2'); select public.messaging_api('accept_rules','{"version":"2026-11-05"}');
select public.messaging_api('open_event','{"eventId":1000}') as org_a_channels \gset
select value->>'id' as org_a_announcements from jsonb_array_elements(:'org_a_channels'::jsonb) where value->>'kind'='event_announcements' \gset
select pg_temp.expect(jsonb_array_length(public.messaging_api('events'))=1,'organisation A event directory contains only its event');
select public.messaging_api('send',jsonb_build_object('conversationId',:'org_a_announcements','body','Organisation A only','clientId',gen_random_uuid())) as org_a_post \gset
select pg_temp.expect(:'org_a_post'::jsonb->'sender'->>'role'='organiser','organisation owner is labelled organiser');
select pg_temp.reject($q$select public.messaging_api('open_event','{"eventId":2000}')$q$,'Register');
select pg_temp.login(10,'aal2'); select public.messaging_api('accept_rules','{"version":"2026-11-05"}');
select public.messaging_api('open_event','{"eventId":2000}') as org_b_channels \gset
select value->>'id' as org_b_announcements from jsonb_array_elements(:'org_b_channels'::jsonb) where value->>'kind'='event_announcements' \gset
select pg_temp.expect(jsonb_array_length(public.messaging_api('events'))=1,'organisation B event directory contains only its event');
select pg_temp.reject(format('select public.messaging_api(''read'',%L)',jsonb_build_object('conversationId',:'org_a_announcements')),'unavailable');
select pg_temp.reject(format('select public.messaging_api(''send'',%L)',jsonb_build_object('conversationId',:'org_a_announcements','body','cross-tenant send','clientId',gen_random_uuid())),'unavailable');
select pg_temp.reject(format('select public.messaging_api(''pin'',%L)',jsonb_build_object('conversationId',:'org_a_announcements','messageId',:'org_a_post'::jsonb->>'id')),'unavailable');
select pg_temp.reject(format('select public.messaging_api(''reports'',%L)',jsonb_build_object('conversationId',:'org_a_announcements')),'unavailable');
select pg_temp.login(9,'aal2');
select pg_temp.reject(format('select public.messaging_api(''read'',%L)',jsonb_build_object('conversationId',:'org_b_announcements')),'unavailable');
select pg_temp.login(11,'aal2'); select public.messaging_api('accept_rules','{"version":"2026-11-05"}');
select pg_temp.expect(jsonb_array_length(public.messaging_api('events'))=0,'unscoped Full Access sidebar tab grants no messaging event access');
select pg_temp.reject($q$select public.messaging_api('open_event','{"eventId":1000}')$q$,'Register');
select pg_temp.login(12,'aal2'); select public.messaging_api('accept_rules','{"version":"2026-11-05"}');
select pg_temp.expect(jsonb_array_length(public.messaging_api('open_event','{"eventId":1000}'))=2,'explicit event assignment remains authorised');
select pg_temp.reject($q$select public.messaging_api('open_event','{"eventId":2000}')$q$,'Register');
select pg_temp.login(13,'aal2'); select public.messaging_api('accept_rules','{"version":"2026-11-05"}');
select pg_temp.expect(jsonb_array_length(public.messaging_api('open_event','{"eventId":1000}'))=2,'explicit event co-admin remains authorised');
select pg_temp.reject($q$select public.messaging_api('open_event','{"eventId":2000}')$q$,'Register');
reset role;
update public.player_profile_details set date_of_birth=null where player_id=13;
set local role authenticated;
select pg_temp.expect(public.messaging_api('status')->>'needsBirthDate'='true','existing profile row with no birth date still offers messaging setup');
select pg_temp.expect(public.messaging_api('status')->>'interactive'='false','missing birth date cannot unlock interactive messaging');
reset role;
select pg_temp.expect(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='messaging' and p.proname not in ('api','own_unread_total','event_directory','event_analytics','mark_unread','delete_conversation','snapshot','realtime_can_read','notification_api') and has_function_privilege('authenticated',p.oid,'EXECUTE')),'all other private helpers deny client execution');
\ir messaging-divisions.sql
\ir messaging-notifications.sql
\ir messaging-groups.sql
\ir messaging-super-admin.sql
\ir notification-read-badges.sql
-- Account deletion erases authored content before the account reference disappears.
delete from auth.users where id='00000000-0000-0000-0000-000000000002';
select pg_temp.expect(not exists(select 1 from messaging.messages where body='Hello Alice' or body='Now confirmed'),'account erasure purges authored live messages');
select pg_temp.expect(not exists(select 1 from messaging.conversations where pair_key like '%00000000-0000-0000-0000-000000000002%'),'erasure clears former Auth identifiers from direct-pair metadata');
\ir messaging-capacity.sql
select messaging.maintenance();
rollback;
\echo 'Messaging DB: grants, account/session isolation, requests, retries, event history, withdrawal, consent, realtime boundaries and deletion passed.'
