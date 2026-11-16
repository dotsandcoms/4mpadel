\set ON_ERROR_STOP on
begin;
do $$begin if current_database()<>'fourm_email_change_test' then raise exception 'Isolated email-change database required'; end if; end$$;
create role anon;create role authenticated;create role service_role bypassrls;create role supabase_auth_admin;
create schema auth;create schema private;create schema messaging;
create table auth.users(id uuid primary key,email text,email_change text,email_confirmed_at timestamptz default now(),deleted_at timestamptz,banned_until timestamptz,is_anonymous boolean default false);
create table auth.sessions(id uuid primary key,user_id uuid references auth.users,not_after timestamptz);
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
create function auth.uid() returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;
create function auth.email() returns text language sql stable as $$select auth.jwt()->>'email'$$;
grant usage on schema auth,public to authenticated,supabase_auth_admin;
grant execute on all functions in schema auth to authenticated,supabase_auth_admin;
grant select,update on auth.users to supabase_auth_admin;
create table public.players(id bigint primary key,email text unique,name text,id_number text,age integer);
create table public.player_profile_details(player_id bigint primary key references public.players,date_of_birth date not null,playtomic_level numeric,playtomic_proof_path text,playtomic_no_profile boolean default false,playtomic_no_profile_confirmed_at timestamptz);
create function public.get_player_profile_details(bigint) returns jsonb language sql security definer set search_path='' as $$select to_jsonb(d) from public.player_profile_details d where player_id=$1$$;
create function public.save_player_profile_details(bigint,jsonb) returns jsonb language plpgsql security definer set search_path='' as $$begin
 if nullif($2->>'date_of_birth','') is null then raise exception 'Enter a valid date of birth'; end if;
 insert into public.player_profile_details(player_id,date_of_birth,playtomic_level,playtomic_proof_path) values($1,($2->>'date_of_birth')::date,($2->>'playtomic_level')::numeric,$2->>'playtomic_proof_path') on conflict(player_id) do update set date_of_birth=excluded.date_of_birth,playtomic_level=excluded.playtomic_level,playtomic_proof_path=excluded.playtomic_proof_path;
 return public.get_player_profile_details($1);end$$;
create table public.calendar(id bigint primary key,organiser_email text,event_co_admins text[],event_name text);
create table public.event_registrations(id uuid primary key,event_id bigint,email text,partner_email text,registered_by text,status text,payment_status text,amount numeric);
create table public.tournament_participants(id uuid primary key,email text,event_id bigint,class_name text);
create table messaging.entry_confirmations(source text,source_id uuid,proof text,division_proof jsonb,primary key(source,source_id));
create function messaging.entry_proof(jsonb) returns text language sql immutable as $$select md5($1::text)$$;
create table public.email_queue(id bigint,recipient_email text,status text,body_html text);
create table public.event_activity_log(actor_email text);
create table public.clubs(contact_email text);
create table private.license_register(player_id bigint,email text);
create table public.payments(id uuid primary key,player_id bigint,event_id bigint,amount numeric,currency text,is_test boolean,status text,payment_type text,payment_method text,created_at timestamptz,metadata jsonb,reference text);
create table private.event_checkout_security_quotes(payment_id uuid primary key,cart_hash bytea,required_amount numeric,original_amount numeric,currency text,is_test boolean,free_entries jsonb default '[]',license_amount numeric default 0,license_items jsonb default '[]');
create table private.security_release_state(id boolean,integrity_enabled boolean);insert into private.security_release_state values(true,true);
create function private.finance_event(bigint) returns boolean language sql as $$select false$$;
create function private.permission_actor_active() returns boolean language sql as $$select auth.uid() is not null$$;
create function public.can_manage_licenses() returns boolean language sql as $$select false$$;
create function private.validate_event_checkout(public.payments) returns jsonb language sql as $$select '{"required":100,"free_entries":[],"license_amount":0,"license_items":[]}'::jsonb$$;
create table public.admin_sidebar_permissions(email text);
create table public.organisation_members(user_email text);
create table public.club_members(user_email text);
create table public.federation_members(user_email text);
create table public.club_claim_invites(email text);
create table public.club_claim_requests(requester_email text);
create table public.coach_applications(email text);
create table public.event_notification_follows(email text);
create table public.player_devices(email text);
create table public.player_push_tokens(email text);
create table public.player_schedule_events(user_email text);
create table public.push_outbox(email text);
create table public.tournament_notification_jobs(email text);
create table messaging.guardian_consents(guardian_email text);
create function private.enforce_registration_deadline() returns trigger language plpgsql as $$begin raise exception 'Normal registration guard called';end$$;
create function private.enforce_division_team_capacity() returns trigger language plpgsql as $$begin raise exception 'Normal registration guard called';end$$;
create function public.reject_cancelled_division_entry() returns trigger language plpgsql as $$begin raise exception 'Normal registration guard called';end$$;
create function public.notify_registration_change() returns trigger language plpgsql as $$begin raise exception 'Normal registration guard called';end$$;
create function public.trg_log_event_registration_activity() returns trigger language plpgsql as $$begin raise exception 'Normal registration guard called';end$$;
create function public.following_entry_changed() returns trigger language plpgsql as $$begin raise exception 'Normal registration guard called';end$$;
create function private.sync_registration_partner_status() returns trigger language plpgsql as $$begin raise exception 'Normal registration guard called';end$$;
create function private.sync_verified_registration_participant() returns trigger language plpgsql as $$begin raise exception 'Normal registration guard called';end$$;
create function messaging.attest_entry() returns trigger language plpgsql as $$begin raise exception 'Normal registration guard called';end$$;
create function messaging.event_changed() returns trigger language plpgsql as $$begin raise exception 'Normal registration guard called';end$$;
create trigger deadline before update on public.event_registrations for each row execute function private.enforce_registration_deadline();
create trigger attestation after update on public.event_registrations for each row execute function messaging.attest_entry();
CREATE OR REPLACE FUNCTION private.worker_write()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(auth.jwt()->>'role','')='service_role' or (
    session_user in('postgres','supabase_admin') and current_setting('role',true) in('none','postgres','supabase_admin')
    and coalesce(auth.jwt(),'{}'::jsonb)='{}'::jsonb)
$function$;
CREATE OR REPLACE FUNCTION private.checkout_cart(p payments)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 select jsonb_build_object('event',p.event_id,'payer',p.player_id,'amount',p.amount,'currency',p.currency,'test',p.is_test,
  'source',p.metadata->'source','registrant',p.metadata->'registrant_email','covers',p.metadata->'covers',
  'rows',p.metadata->'registration_rows','links',p.metadata->'solo_link_updates',
  'registration',p.metadata->'registration_id','target',p.metadata->'target_division_id')
$function$;
CREATE OR REPLACE FUNCTION private.guard_payment_integrity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare trusted boolean:=private.worker_write() or coalesce(private.finance_event(new.event_id),false)
 or (private.permission_actor_active() and new.payment_type in('membership','full_license','temp_license') and public.can_manage_licenses());
 address text:=lower(auth.email()); actor_player bigint; receipt private.event_checkout_security_quotes; calculated jsonb; fingerprint bytea; split_total numeric; split_covers jsonb;
begin
 if not (select integrity_enabled from private.security_release_state where id) then return new; end if;
 new.metadata:=private.canonical_checkout_contacts(new.metadata,new.event_id);
 if tg_op='INSERT' and new.metadata->>'source'='manual_event' and new.status in('pending','processing') then new.metadata:=new.metadata-'registrations_persisted'-'split_recorded'-'server_free_entries'-'server_license_items'; end if;
 if not trusted then
  if not private.permission_actor_active() then raise exception 'Sign in before saving a payment.' using errcode='42501'; end if;
  if tg_op='INSERT' then
   select id into actor_player from public.players where lower(trim(email))=address order by id limit 1;
   if lower(trim(new.metadata->>'registrant_email')) is distinct from address or (new.player_id is not null and new.player_id is distinct from actor_player)
     or new.status is null or new.status not in('pending','processing') or (coalesce(new.is_test,false) and not public.is_super_admin(address)) or new.amount is null or new.amount<0 then
    raise exception 'Only verified checkout or an authorised administrator can record paid entries.' using errcode='42501'; end if;
   new.created_at:=clock_timestamp();
   new.metadata:=coalesce(new.metadata,'{}')-'registrations_persisted'-'license_split_done'-'split_recorded'-'server_free_entries'-'server_license_items'-'native_authorization_url';
  elsif (to_jsonb(new)-'status') is distinct from (to_jsonb(old)-'status') or old.status not in('pending','processing','abandoned','cancelled') or new.status not in('abandoned','cancelled',old.status) then
   raise exception 'Payment details are managed by verified checkout.' using errcode='42501';
  end if;
 end if;
 if new.payment_type='event_entry_fee' and new.payment_method='paystack' and new.metadata->>'source' in('manual_event','division_switch') and new.status in('pending','processing','success') then
  fingerprint:=sha256(convert_to(private.checkout_cart(new)::text,'UTF8'));
  select * into receipt from private.event_checkout_security_quotes where payment_id=new.id;
  if receipt.payment_id is null then
   calculated:=private.validate_event_checkout(new);
   insert into private.event_checkout_security_quotes(payment_id,cart_hash,required_amount,original_amount,currency,is_test,free_entries,license_amount,license_items)
    values(new.id,fingerprint,(calculated->>'required')::numeric,new.amount,new.currency,coalesce(new.is_test,false),calculated->'free_entries',(calculated->>'license_amount')::numeric,calculated->'license_items');
   new.metadata:=new.metadata||jsonb_build_object('server_free_entries',calculated->'free_entries','server_license_items',calculated->'license_items');
  elsif receipt.cart_hash is distinct from fingerprint then
   if tg_op='UPDATE' and private.worker_write() and old.status='success' and new.status='success' and not coalesce((old.metadata->>'split_recorded')::boolean,false) and coalesce((new.metadata->>'split_recorded')::boolean,false) and receipt.license_amount>0 and new.amount=old.amount-receipt.license_amount
    and (to_jsonb(new)-array['metadata','amount'])=(to_jsonb(old)-array['metadata','amount'])
    and (new.metadata-array['covers','split_recorded','server_free_entries','server_license_items'])=(old.metadata-array['covers','split_recorded','server_free_entries','server_license_items']) then
     select coalesce(sum(child.amount),0) into split_total from public.payments child where child.metadata->>'parent_reference'=new.reference and child.status='success' and child.currency=new.currency and child.is_test is not distinct from new.is_test;
     if split_total<>receipt.license_amount or (new.metadata->'covers') is distinct from (select coalesce(jsonb_agg(c.value),'[]') from jsonb_array_elements(old.metadata->'covers') c where c.value->>'type'<>'license') then raise exception 'The licence split does not match the verified checkout.'; end if;
     update private.event_checkout_security_quotes set cart_hash=fingerprint where payment_id=new.id;
   else raise exception 'This checkout changed. Start a new payment review.' using errcode='22023'; end if;
   new.metadata:=new.metadata||jsonb_build_object('server_free_entries',receipt.free_entries,'server_license_items',receipt.license_items);
  else new.metadata:=new.metadata||jsonb_build_object('server_free_entries',receipt.free_entries,'server_license_items',receipt.license_items); end if;
 end if;
 return new;
end $function$;
create trigger checkout_guard before update on public.payments for each row execute function private.guard_payment_integrity();
\ir ../../supabase/migrations/20261116095716_profile_completion_and_private_identity.sql
\ir ../../supabase/migrations/20261116095853_verified_account_email_change.sql
create function pg_temp.expect(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAIL: %',label;end if;end$$;
create function pg_temp.reject(query text,pattern text) returns void language plpgsql as $$begin begin execute query;exception when others then if sqlerrm!~pattern then raise exception 'Wrong error: %',sqlerrm;end if;return;end;raise exception 'Expected rejection: %',query;end$$;
insert into auth.users(id,email) values('00000000-0000-0000-0000-000000000001','old@example.test'),('00000000-0000-0000-0000-000000000002','other@example.test');
insert into auth.sessions values('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',null);
insert into public.players values(1,'old@example.test','Original player','PRIVATE-ID',null),(2,'other@example.test','Other player','OTHER-PRIVATE-ID',null);
insert into public.admin_sidebar_permissions values('old@example.test');insert into public.organisation_members values('old@example.test');
insert into public.calendar values(1,'old@example.test',array['old@example.test','other@example.test'],'Old event');
insert into public.event_registrations values('20000000-0000-0000-0000-000000000001',1,'old@example.test','partner@example.test','old@example.test','registered','paid',100);
insert into public.tournament_participants values('30000000-0000-0000-0000-000000000001','old@example.test',1,'Men');
insert into messaging.entry_confirmations select 'registration',id,messaging.entry_proof(to_jsonb(r)),null from public.event_registrations r;
insert into messaging.entry_confirmations select 'import',id,messaging.entry_proof(to_jsonb(t)),'{"email":"old@example.test","division":"men"}' from public.tournament_participants t;
insert into public.email_queue values(1,'old@example.test','pending','Pending content'),(2,'old@example.test','sent','Historical content');
insert into public.event_activity_log values('old@example.test');insert into public.clubs values('old@example.test');insert into private.license_register values(1,'old@example.test');
insert into public.payments values('40000000-0000-0000-0000-000000000001',1,1,100,'ZAR',false,'pending','event_entry_fee','paystack',now()-interval '1 hour','{"source":"manual_event","registrant_email":"old@example.test","registration_rows":[{"email":"old@example.test","amount":100}],"provider":{"email":"old@example.test"}}','TEST-CHECKOUT');
insert into private.event_checkout_security_quotes select id,sha256(convert_to(private.checkout_cart(p)::text,'UTF8')),100,100,'ZAR',false,'[{"email":"old@example.test","amount":0}]',0,'[]' from public.payments p;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","email":"old@example.test","session_id":"10000000-0000-0000-0000-000000000001"}',true);
set local role authenticated;
select pg_temp.expect(public.own_player_identity()->>'idNumber'='PRIVATE-ID','own ID number is available through checked private RPC');
select public.update_own_player_id_number('UPDATED-ID');
select public.save_player_profile_details_v4(1,'{"date_of_birth":"1990-01-01"}');
select pg_temp.reject($q$select public.save_player_profile_details_v4(2,'{"date_of_birth":"1990-01-01"}')$q$,'access denied');
select pg_temp.reject($q$select public.save_player_profile_details_v4(1,'{"date_of_birth":"1990-01-01","playtomic_level":3}')$q$,'both');
select pg_temp.reject($q$select public.check_own_email_change('other@example.test')$q$,'already linked');
select public.check_own_email_change('new@example.test');
select set_config('fourm.verified_email_change','forged',true);
select pg_temp.reject($q$update public.event_registrations set email='forged@example.test'$q$,'permission denied');
reset role;select set_config('fourm.verified_email_change','',true);select set_config('request.jwt.claims','{}',true);
select pg_temp.reject($q$update auth.users set email='new@example.test' where id='00000000-0000-0000-0000-000000000001'$q$,'Verify the new email');
update auth.users set email_change='new@example.test' where id='00000000-0000-0000-0000-000000000001';
select pg_temp.expect((select email='old@example.test' from public.players where id=1),'request alone changes no player email');
set session authorization supabase_auth_admin;
update auth.users set email='new@example.test',email_change='' where id='00000000-0000-0000-0000-000000000001';
reset session authorization;
select pg_temp.expect((select email='new@example.test' and id_number='UPDATED-ID' from public.players where id=1),'verified email retains the same player and private identity');
select pg_temp.expect((select email='new@example.test' from public.admin_sidebar_permissions),'staff role follows the verified account');
select pg_temp.expect((select user_email='new@example.test' from public.organisation_members),'organisation role follows the verified account');
select pg_temp.expect((select organiser_email='new@example.test' and event_co_admins[1]='new@example.test' and event_co_admins[2]='other@example.test' from public.calendar),'organiser and assigned-event permissions follow without touching other users');
select pg_temp.expect((select email='new@example.test' and registered_by='new@example.test' and partner_email='partner@example.test' and amount=100 and payment_status='paid' from public.event_registrations),'entries preserve ownership and exact financial state');
select pg_temp.expect(not exists(select 1 from messaging.entry_confirmations proof join public.event_registrations r on proof.source='registration' and proof.source_id=r.id where proof.proof<>messaging.entry_proof(to_jsonb(r))),'previously valid registration attestation remains valid');
select pg_temp.expect((select proof.proof=messaging.entry_proof(to_jsonb(t)) and proof.division_proof->>'email'='new@example.test' from messaging.entry_confirmations proof join public.tournament_participants t on proof.source='import' and proof.source_id=t.id),'import attestation and division identity remain valid');
select pg_temp.expect((select actor_email='old@example.test' from public.event_activity_log) and (select contact_email='old@example.test' from public.clubs) and (select email='old@example.test' from private.license_register),'historical actor, business contacts and financial snapshots remain exact');
select pg_temp.expect((select recipient_email='new@example.test' from public.email_queue where id=1) and (select recipient_email='old@example.test' from public.email_queue where id=2),'only unsent mail delivery changes address');
update public.payments set status='success' where reference='TEST-CHECKOUT';
select pg_temp.expect((select metadata->>'registrant_email'='new@example.test' and metadata->'registration_rows'->0->>'email'='new@example.test' and metadata->'provider'->>'email'='old@example.test' and amount=100 and currency='ZAR' from public.payments),'pending callback updates checkout contacts but not provider receipts or amounts');
select pg_temp.expect((select q.cart_hash=sha256(convert_to(private.checkout_cart(p)::text,'UTF8')) and q.required_amount=100 and q.original_amount=100 and q.free_entries->0->>'email'='new@example.test' from private.event_checkout_security_quotes q join public.payments p on p.id=q.payment_id),'only a verified alias may refresh the exact original checkout quote');
select pg_temp.reject($q$update public.payments set metadata=jsonb_set(metadata,'{registrant_email}','"forged@example.test"')$q$,'checkout changed');
select pg_temp.expect(private.current_checkout_email('old@example.test',clock_timestamp())='old@example.test','a later user reusing the old address is never mapped to its former owner');
select pg_temp.expect((select count(*)=1 from private.account_email_changes),'verified change is audited once');
select pg_temp.expect(not has_table_privilege('anon','private.account_email_changes','select,insert,update,delete') and not has_table_privilege('authenticated','private.account_email_changes','select,insert,update,delete') and not has_table_privilege('service_role','private.account_email_changes','select,insert,update,delete'),'email audit has no Data API access');
select pg_temp.expect((select relrowsecurity from pg_class where oid='private.account_email_changes'::regclass),'email audit RLS is enabled');
select pg_temp.expect(not has_sequence_privilege('authenticated','private.account_email_changes_id_seq','usage,select,update'),'private audit sequence is not exposed');
select pg_temp.expect(not has_function_privilege('authenticated','private.current_checkout_email(text,timestamptz)','execute'),'clients cannot resolve other users’ email history');
update auth.users set email_change='third@example.test' where id='00000000-0000-0000-0000-000000000001';
set session authorization supabase_auth_admin;
update auth.users set email='third@example.test',email_change='' where id='00000000-0000-0000-0000-000000000001';
reset session authorization;
select pg_temp.reject($q$update public.payments set amount=99 where reference='TEST-CHECKOUT'$q$,'checkout changed');
update public.payments set status='success' where reference='TEST-CHECKOUT';
select pg_temp.expect((select amount=100 and metadata->>'registrant_email'='third@example.test' from public.payments),'alias chains preserve amounts and reject a combined financial mutation');
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","email":"old@example.test","session_id":"10000000-0000-0000-0000-000000000001"}',true);
set local role authenticated;
select pg_temp.reject($q$select public.own_player_identity()$q$,'Sign in again');
reset role;
rollback;
\echo 'Email/profile DB: verified atomic identity, private fields, role/entry preservation, checkout fingerprints, audit grants and stale sessions passed.'
