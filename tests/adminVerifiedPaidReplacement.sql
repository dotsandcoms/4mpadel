\set ON_ERROR_STOP on
do $$ begin
    if current_database()<>'fourm_admin_verified_replacement_test' or to_regclass('public.payments') is not null then
      raise exception 'Use an empty disposable fourm_admin_verified_replacement_test database.';
    end if;
    if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
    if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
    if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
CREATE SCHEMA auth;
CREATE SCHEMA private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid;
$$;
CREATE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'email';
$$;
CREATE FUNCTION public.account_is_active() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT auth.uid() IS NOT NULL; $$;
CREATE FUNCTION public.can_manage_event(event_id bigint) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT auth.email() = 'admin@example.com' AND event_id = 101;
$$;
CREATE TABLE public.calendar(id bigint PRIMARY KEY, event_status text DEFAULT 'active', registration_closes_at timestamptz, is_weekly boolean DEFAULT false, is_quick_event boolean DEFAULT false);
CREATE TABLE public.tournament_divisions(id uuid PRIMARY KEY, event_id bigint, name text, entries_close_at timestamptz, entry_limit integer, entry_fee numeric DEFAULT 400);
CREATE TABLE public.players(id bigint PRIMARY KEY, name text, email text, contact_number text);
CREATE TABLE public.event_registrations(
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id bigint, email text, full_name text, phone text, created_at timestamptz DEFAULT now(), access_grant_id uuid,
    partner_name text, partner_email text, partner_payment_status text, division text, division_id uuid,
    status text DEFAULT 'registered', payment_status text DEFAULT 'paid', payment_method text DEFAULT 'paystack',
    registered_by text, pay_token uuid DEFAULT gen_random_uuid(), whatsapp_added boolean DEFAULT true,
    tshirt_size text DEFAULT 'M', tshirt_logo_url text, tshirt_sponsor_name text,
    reminder_sent_at timestamptz, close_reminder_sent_at timestamptz,
    reminder_1d_sent_at timestamptz, reminder_3d_sent_at timestamptz, reminder_7d_sent_at timestamptz,
    is_test boolean default false, UNIQUE(event_id, email, division)
);
CREATE TABLE public.payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id bigint,
    player_id bigint, amount numeric, status text DEFAULT 'success', payment_type text DEFAULT 'event_entry_fee',
    reference text DEFAULT 'REGEV-test', metadata jsonb, currency text default 'ZAR',is_test boolean default false,
    created_at timestamptz default now(),payment_method text default 'paystack');
CREATE TABLE public.payment_refunds(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_id uuid,
    event_registration_id uuid, status text, metadata jsonb DEFAULT '{}', amount numeric);
CREATE TABLE public.draws(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id bigint, division_id uuid, status text DEFAULT 'draft');
CREATE TABLE public.draw_entries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), draw_id uuid, source_registration_id uuid);
CREATE TABLE public.event_activity_log(event_id bigint, actor_email text, actor_role text, action text, category text, summary text, details jsonb);
CREATE TABLE public.temporary_licenses(player_id bigint, event_id bigint);
GRANT USAGE ON SCHEMA public, auth TO authenticated;
GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO authenticated;
\ir ../supabase/migrations/20261013130304_replace_paid_partner.sql

\ir ../supabase/migrations/20261017144329_manage_registration_teams.sql
\ir ../supabase/migrations/20261019050830_division_team_capacity.sql
\ir ../supabase/migrations/20261019050836_registration_deadline_payment_access.sql
\ir ../supabase/migrations/20261019050841_atomic_division_capacity_moves.sql
\ir ../supabase/migrations/20261020084211_event_manager_player_replacement.sql

create function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
create function public.is_super_admin(email text) returns boolean language sql stable as $$ select email='admin@example.com' $$;
create function public.can_manage_licenses() returns boolean language sql stable as $$ select false $$;
create function private.permission_actor_active() returns boolean language sql stable as $$ select auth.uid() is not null $$;
create function private.finance_event(p_event bigint) returns boolean language sql stable as $$ select public.can_manage_event(p_event) $$;
create function private.worker_write() returns boolean language sql stable as $$ select auth.jwt()->>'role'='service_role' $$;
create function private.current_entry_fee(bigint,uuid,text) returns numeric language sql stable as $$ select 400::numeric $$;
-- Identity alias lookup is inactive for these contacts. The current deployed
-- cart and payment guard definitions are used below, including split handling.
create function private.current_checkout_email(p_email text,p_created timestamptz) returns text language sql stable as $$ select p_email $$;
create function private.validate_event_checkout(public.payments) returns jsonb language plpgsql as
  $$ begin raise exception 'The fixture already has a saved checkout quote'; end $$;
create table private.security_release_state(id boolean primary key,integrity_enabled boolean not null);
insert into private.security_release_state values(true,true);
create table private.event_checkout_security_quotes(
  payment_id uuid primary key references public.payments, cart_hash bytea,required_amount numeric,original_amount numeric,
  currency text,is_test boolean,free_entries jsonb,license_amount numeric,license_items jsonb
);
\ir fixtures/verified-paid-replacement-integrity.sql

create function pg_temp.must_fail(action text,message text) returns void language plpgsql as $$
begin
  begin execute action;
  exception when others then
    if position(message in sqlerrm)>0 then return; end if;
    raise exception 'Expected %; received %',message,sqlerrm;
  end;
  raise exception 'Expected rejection: %',message;
end $$;

insert into public.calendar(id,event_status) values (101,'active'),(102,'active');
insert into public.tournament_divisions(id,event_id,name) values ('30000000-0000-0000-0000-000000000001',101,'Open');
insert into public.players values
  (1,'Payer','payer@example.com','111'),(2,'Former','former@example.com','222'),(3,'Substitute','replacement@example.com','333'),
  (4,'Next replacement','next@example.com','444'),(5,'Solo entrant','solo@example.com','555'),(6,'New solo','new-solo@example.com','666');
insert into public.event_registrations(id,event_id,email,full_name,division,division_id,partner_email,partner_name,registered_by,payment_status) values
  ('20000000-0000-0000-0000-000000000001',101,'payer@example.com','Payer','Open','30000000-0000-0000-0000-000000000001','former@example.com','Former','payer@example.com','paid'),
  ('20000000-0000-0000-0000-000000000002',101,'former@example.com','Former','Open','30000000-0000-0000-0000-000000000001','payer@example.com','Payer','payer@example.com','paid'),
  ('20000000-0000-0000-0000-000000000003',101,'solo@example.com','Solo entrant','Open','30000000-0000-0000-0000-000000000001',null,null,'solo@example.com','pending'),
  ('20000000-0000-0000-0000-000000000004',101,'lost@example.com','Lost paid','Open','30000000-0000-0000-0000-000000000001',null,null,'lost@example.com','paid'),
  ('20000000-0000-0000-0000-000000000005',102,'foreign@example.com','Foreign','Open',null,null,null,'foreign@example.com','paid');
insert into public.payments (id,event_id,player_id,amount,status,payment_type,payment_method,reference,metadata) values (
  '40000000-0000-0000-0000-000000000001',101,1,800,'success','event_entry_fee','paystack','REGEV-verified-fixture',
  '{
    "source":"manual_event","registrant_email":"payer@example.com","registration_id":"20000000-0000-0000-0000-000000000001",
    "covers":[{"type":"entry","email":"payer@example.com","division":"Open"},
              {"type":"license","email":"former@example.com","license":"temporary"},
              {"type":"entry","email":"former@example.com","division":"Open"}],
    "registration_rows":[{"email":"payer@example.com","full_name":"Payer","division":"Open","partner_email":"former@example.com"},
                         {"email":"former@example.com","full_name":"Former","division":"Open"}],
    "division_entry_fees":{"Open":400},
    "verified_entry_transfers":[{"cover_position":2,"email":"forged@example.com","registration_id":"forged","event_id":101}]
  }'
);
insert into private.event_checkout_security_quotes
select p.id,sha256(convert_to(private.checkout_cart(p)::text,'UTF8')),amount,amount,'ZAR',false,'[]',0,'[]'
from public.payments p;
create trigger guard_payment_integrity before insert or update on public.payments
for each row execute function private.guard_payment_integrity();

create function pg_temp.replace_player(
  id uuid default '20000000-0000-0000-0000-000000000002',
  old_email text default 'former@example.com', partner text default 'payer@example.com', player bigint default 3
) returns jsonb language sql as $$ select public.replace_registration_player(id,old_email,partner,player) $$;

select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","email":"admin@example.com","role":"authenticated"}',false);
-- Demonstrate the incompatibility before testing the replacement operation.
select pg_temp.must_fail('select pg_temp.replace_player()','This checkout changed. Start a new payment review.');
\ir ../supabase/migrations/20261120054159_preserve_verified_paid_player_replacement.sql

do $$
declare
  event_payment constant uuid:='40000000-0000-0000-0000-000000000001';
  next_slot constant uuid:='20000000-0000-0000-0000-000000000002';
  result jsonb;
  original jsonb;
  original_cart jsonb;
  quote jsonb;
  aliases jsonb;
begin
  assert not has_table_privilege('authenticated','private.verified_payment_entry_transfers','SELECT');
  assert not has_table_privilege('service_role','private.verified_payment_entry_transfers','INSERT');
  assert (select not (metadata ? 'verified_entry_transfers') from public.payments where id=event_payment);
  assert (select email='former@example.com' from public.event_registrations where id=next_slot);
  select to_jsonb(p),private.checkout_cart(p) into original,original_cart from public.payments p where id=event_payment;
  select to_jsonb(q) into quote from private.event_checkout_security_quotes q where payment_id=event_payment;
  perform pg_temp.must_fail('select pg_temp.replace_player()','updated billing service');
  update private.security_release_state set verified_paid_replacements_enabled=true;
  insert into public.payment_refunds(payment_id,event_registration_id,status,amount) values(event_payment,next_slot,'processed',400);
  perform pg_temp.must_fail('select pg_temp.replace_player()','refund in progress or already processed');
  delete from public.payment_refunds;
  set local role authenticated;
  result := pg_temp.replace_player();
  reset role;
  assert result->>'registration_id'=next_slot::text and result->>'new_email'='replacement@example.com';
  assert (select email='replacement@example.com' and payment_status='paid' from public.event_registrations where id=next_slot);
  assert (select partner_email='replacement@example.com' from public.event_registrations where email='payer@example.com');
  assert (select (to_jsonb(p)-'metadata')=(original-'metadata') and private.checkout_cart(p)=original_cart
    and p.metadata-'verified_entry_transfers'=original->'metadata' from public.payments p where id=event_payment);
  assert (select to_jsonb(q)=quote from private.event_checkout_security_quotes q where payment_id=event_payment);
  select metadata->'verified_entry_transfers' into aliases from public.payments where id=event_payment;
  assert aliases=jsonb_build_array(jsonb_build_object('registration_id',next_slot,'event_id',101,
    'cover_position',2,'division','Open','division_id','30000000-0000-0000-0000-000000000001','email','replacement@example.com'));
  perform pg_temp.must_fail('select pg_temp.replace_player()','entry or its partner has changed');
  update public.payments set metadata=jsonb_set(metadata,'{verified_entry_transfers,0,email}','"forged@example.com"') where id=event_payment;
  assert (select metadata->'verified_entry_transfers'=aliases from public.payments where id=event_payment);

  result:=pg_temp.replace_player(next_slot,'replacement@example.com','payer@example.com',4);
  assert (select metadata #>> '{verified_entry_transfers,0,email}'='next@example.com' from public.payments where id=event_payment);
  assert (select private.checkout_cart(p)=original_cart from public.payments p where id=event_payment);
  assert (select count(*)=2 from public.event_activity_log where action='admin.player_replaced');

  -- Former payer/attendee re-entry must not borrow a transferred cover.
  insert into public.event_registrations(event_id,email,full_name,division,division_id,payment_status)
    values(101,'former@example.com','Former re-entry','Open','30000000-0000-0000-0000-000000000001','paid');
  perform pg_temp.must_fail('select pg_temp.replace_player((select id from public.event_registrations where email=''former@example.com''),''former@example.com'',null,6)','No exact paid entry receipt');
  perform pg_temp.must_fail('select pg_temp.replace_player(''20000000-0000-0000-0000-000000000004'',''lost@example.com'',null,6)','No exact paid entry receipt');
  perform pg_temp.must_fail('select pg_temp.replace_player(''20000000-0000-0000-0000-000000000005'',''foreign@example.com'',null,6)','cannot manage entries');
  result:=pg_temp.replace_player('20000000-0000-0000-0000-000000000003','solo@example.com',null,6);
  assert (select payment_status='pending' and email='new-solo@example.com' from public.event_registrations
    where id='20000000-0000-0000-0000-000000000003');
  assert (select count(*)=1 from public.payments);
  assert (select count(*)=0 from public.payment_refunds);
end $$;

\ir ../supabase/migrations/20261120113600_redact_verified_transfer_contact.sql

do $$
declare
  event_payment constant uuid:='40000000-0000-0000-0000-000000000001';
  next_slot constant uuid:='20000000-0000-0000-0000-000000000002';
  recorded_receipt jsonb;
begin
  assert (select metadata->'verified_entry_transfers'=jsonb_build_array(jsonb_build_object(
    'registration_id',next_slot,'event_id',101,'cover_position',2,'division','Open',
    'division_id','30000000-0000-0000-0000-000000000001')) and not (metadata::text like '%next@example.com%')
    from public.payments where id=event_payment), 'existing transfer projection redacts the replacement email';
  assert (select email='next@example.com' from private.verified_payment_entry_transfers where payment_id=event_payment and registration_id=next_slot),
    'the private authority retains the exact verified contact';
  select metadata into recorded_receipt from public.payments where id=event_payment;
  update public.payments set metadata=jsonb_set(metadata,'{verified_entry_transfers,0,email}','"forged@example.com"') where id=event_payment;
  assert (select metadata=recorded_receipt from public.payments where id=event_payment), 'the projection strips a supplied replacement contact';
  assert (select sha256(convert_to(private.checkout_cart(p)::text,'UTF8'))=q.cart_hash
    from public.payments p join private.event_checkout_security_quotes q on q.payment_id=p.id where p.id=event_payment),
    'redaction preserves the original quote hash';
end $$;

create table auth.users(id uuid primary key,email text);
create function private.verified_email_change_context() returns boolean language sql stable as $$ select false $$;
\ir ../supabase/migrations/20261120120500_preserve_verified_transfer_contact_changes.sql

create function pg_temp.change_transfer_contact_outside_review() returns void language plpgsql as $$
begin
  update public.event_registrations set email='direct-link@example.com'
    where id='20000000-0000-0000-0000-000000000002';
  set constraints verified_transfer_contact_is_current immediate;
end $$;

set role authenticated;
select pg_temp.must_fail('select pg_temp.change_transfer_contact_outside_review()','Use Replace player');
reset role;

do $$
declare
  payment_id_value constant uuid:='40000000-0000-0000-0000-000000000001';
  slot_id constant uuid:='20000000-0000-0000-0000-000000000002';
  original jsonb;
  result jsonb;
begin
  select to_jsonb(p) into original from public.payments p where p.id=payment_id_value;
  assert (select email='next@example.com' from public.event_registrations where id=slot_id);
  insert into public.players values (7,'Latest replacement','latest@example.com','777');
  set local role authenticated;
  result:=pg_temp.replace_player(slot_id,'next@example.com','payer@example.com',7);
  reset role;
  set constraints verified_transfer_contact_is_current immediate;
  assert result->>'new_email'='latest@example.com';
  assert (select email='latest@example.com' from private.verified_payment_entry_transfers
    where payment_id=payment_id_value and registration_id=slot_id);
  assert (select to_jsonb(p)=original from public.payments p where p.id=payment_id_value);
  assert not has_function_privilege('authenticated','private.sync_verified_transfer_contact()','execute');
  assert not has_function_privilege('service_role','private.anonymize_verified_transfer_contact()','execute');
end $$;

\ir ../supabase/migrations/20261120120700_move_verified_entry_allocations.sql

insert into public.tournament_divisions(id,event_id,name,entry_limit,entry_fee) values
  ('30000000-0000-0000-0000-000000000002',101,'Advanced',8,400),
  ('30000000-0000-0000-0000-000000000003',102,'Foreign',8,400),
  ('30000000-0000-0000-0000-000000000004',101,'Full division',1,400);
insert into public.event_registrations(event_id,email,full_name,division,division_id)
  values(101,'occupant@example.com','Unrelated team','Full division','30000000-0000-0000-0000-000000000004');

do $$
declare
  event_payment constant uuid := '40000000-0000-0000-0000-000000000001';
  paid_slot constant uuid := '20000000-0000-0000-0000-000000000002';
  payer_slot constant uuid := '20000000-0000-0000-0000-000000000001';
  target_id constant uuid := '30000000-0000-0000-0000-000000000002';
  original jsonb;
  aliases jsonb;
  reviewed_entries jsonb;
begin
  select to_jsonb(p) into original from public.payments p where p.id = event_payment;
  set local role authenticated;
  begin
    update public.event_registrations set division_id = target_id, division = 'Advanced' where id = paid_slot;
    set constraints verify_transferred_registration_division immediate;
    raise exception 'A direct edit moved a verified allocation';
  exception when insufficient_privilege then
    if position('reviewed division action' in sqlerrm) = 0 then raise; end if;
  end;
  perform pg_temp.must_fail(format('select public.move_registration_division(%L,%L)', array[paid_slot]::text,
    '30000000-0000-0000-0000-000000000003'), 'available target division');
  perform pg_temp.must_fail(format('select public.move_registration_division(%L,%L)', array[payer_slot,paid_slot]::text,
    '30000000-0000-0000-0000-000000000004'), 'full');
  reset role;
  assert (select to_jsonb(p) = original from public.payments p where p.id = event_payment), 'failed moves preserve the entire original receipt';
  assert (select count(*)=1 from private.verified_payment_entry_transfers where payment_id=event_payment),
    'failed team move rolls back the added teammate allocation';
  assert (select count(*)=2 from public.event_registrations where id in (paid_slot,payer_slot) and division='Open');

  perform set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000004","email":"other@example.com","role":"authenticated"}',true);
  set local role authenticated;
  perform pg_temp.must_fail(format('select public.move_registration_division(%L,%L)', array[payer_slot,paid_slot]::text,target_id),
    'cannot manage entries');
  reset role;
  perform set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","email":"admin@example.com","role":"authenticated"}',true);
  select jsonb_agg(jsonb_build_object('id',r.id,'email',r.email,'division',r.division,'division_id',r.division_id,
    'status',r.status,'payment_status',r.payment_status,'partner_email',r.partner_email) order by r.id)
    into reviewed_entries from public.event_registrations r where r.id in (paid_slot,payer_slot);
  set local role authenticated;
  perform pg_temp.must_fail(format('select public.admin_reviewed_move_registration_division(101,%L,%L,400,500)',target_id,reviewed_entries),
    'reviewed division or fees changed');
  perform pg_temp.must_fail(format('select public.admin_reviewed_move_registration_division(101,%L,%L,400,400)',target_id,
    jsonb_set(reviewed_entries,'{0,email}','"wrong@example.com"')), 'reviewed entries changed');
  perform public.admin_reviewed_move_registration_division(101,target_id,reviewed_entries,400,400);
  reset role;
  set constraints verify_transferred_registration_division immediate;

  assert (select count(*)=2 from public.event_registrations where id in (paid_slot,payer_slot)
    and division_id=target_id and payment_status='paid' and partner_email IS NOT NULL), 'the team and paid status are preserved';
  assert (select count(*)=2 from private.verified_payment_entry_transfers where payment_id=event_payment and division_id=target_id),
    'both the replaced and unchanged player have current allocation coordinates';
  select metadata->'verified_entry_transfers' into aliases from public.payments where id=event_payment;
  assert jsonb_array_length(aliases)=2 and aliases #>> '{0,original_division}'='Open' and aliases #>> '{1,original_division}'='Open';
  assert not jsonb_path_exists(aliases, '$[*].email'), 'the moved allocation keeps replacement contacts private';
  assert (select to_jsonb(p)-'metadata'=original-'metadata' and p.metadata-'verified_entry_transfers'=(original->'metadata')-'verified_entry_transfers'
    from public.payments p where p.id=event_payment), 'the original Paystack amount, reference, and quote stay intact';
  assert (select sha256(convert_to(private.checkout_cart(p)::text,'UTF8'))=q.cart_hash
    from public.payments p join private.event_checkout_security_quotes q on q.payment_id=p.id where p.id=event_payment);
  assert not has_function_privilege('authenticated','private.move_registration_division_before_transfer(uuid[],uuid,boolean)','execute');
end $$;
