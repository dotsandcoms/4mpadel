\set ON_ERROR_STOP on
\ir payment-security.sql
reset role;
select set_config('request.jwt.claims','{}',false);
alter table public.calendar add primary key(id);
alter table public.tournament_divisions add primary key(id);
create function private.verified_email_change_context() returns boolean language sql stable as $$select false$$;
create function public.event_access_grant_valid(bigint,uuid) returns boolean language sql stable as $$select false$$;
create function public.has_full_license(p_player bigint,p_year integer) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.annual_licenses where player_id=p_player and season_year=p_year and revoked_at is null)$$;
create table public.temporary_licenses(id uuid primary key default gen_random_uuid(),player_id bigint,event_id bigint,revoked_at timestamptz,event_name text,event_date date,source text,payment_id uuid,unique(player_id,event_id));
create table public.native_license_checkouts(reference text,player_id bigint,amount numeric,license_type text,license_year integer,event_id bigint,created_at timestamptz default now());
create table public.license_audit_log(player_id bigint,license_id uuid,license_type text,action text,reason text,details jsonb);
create table private.event_license_quotes(payment_id uuid,amount numeric,license_covers jsonb);
create function private.event_license_quote_matches(p_id uuid,p_amount numeric,p_meta jsonb) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.event_license_quotes where payment_id=p_id and amount=p_amount and license_covers=(select coalesce(jsonb_agg(value),'[]') from jsonb_array_elements(coalesce(p_meta->'covers','[]')) where value->>'type'='license'))
$$;
\ir ../../supabase/migrations/20261019050830_division_team_capacity.sql
alter table public.calendar drop column allow_payments_after_close;
\ir ../../supabase/migrations/20261019054258_event_late_payment_setting.sql
-- Existing abandoned online entry is withdrawn without changing paid/EFT rows.
insert into public.calendar(id,event_name,is_manual,is_visible,sanction_status,payment_method,allow_payments,start_date,registration_opens_at,registration_closes_at,entry_fee)
 values(203,'Legacy checkout',true,true,'approved','platform',true,current_date+3,now()-interval '1 day',now()+interval '2 days',100);
insert into public.tournament_divisions(id,event_id,name,entry_fee,entry_limit,license_required)
 values('60000000-0000-0000-0000-000000000203',203,'Legacy',100,5,false);
insert into public.event_registrations(event_id,division_id,division,email,full_name,registered_by,payment_status,payment_method)
 values(203,'60000000-0000-0000-0000-000000000203','Legacy','actor1@example.test','One','actor1@example.test','pending','platform'),
 (203,'60000000-0000-0000-0000-000000000203','Legacy','actor2@example.test','Two','actor2@example.test','paid','paystack'),
 (203,'60000000-0000-0000-0000-000000000203','Legacy','actor3@example.test','Three','actor3@example.test','pending','eft');
set role authenticated;
select pg_temp.identity(1);
insert into public.payments(player_id,event_id,amount,status,payment_type,reference,metadata,created_at)
 select 1,203,105,'processing','event_entry_fee','legacy-abandoned',jsonb_build_object('source','manual_event','registrant_email','actor1@example.test',
 'covers','[{"type":"entry","email":"actor1@example.test","division":"Legacy"}]'::jsonb,'registration_rows',jsonb_build_array(to_jsonb(r))),now()-interval '40 minutes'
 from public.event_registrations r where event_id=203 and email='actor1@example.test';
reset role;
select set_config('request.jwt.claims','{}',false);
-- The authenticated insert correctly stamps its own time. Age it as the fixture worker.
update public.payments set created_at=now()-interval '40 minutes' where reference='legacy-abandoned';
\ir ../../supabase/migrations/20261117101743_paid_registration_checkout_holds.sql
select pg_temp.expect((select status='withdrawn' from public.event_registrations where event_id=203 and email='actor1@example.test'),'migration removes legacy unpaid online entry from roster');
select pg_temp.expect((select state='expired' from private.event_checkout_holds where event_id=203 and email='actor1@example.test'),'legacy abandoned checkout does not renew its hold');
select pg_temp.expect((select status='registered' and payment_status='paid' from public.event_registrations where event_id=203 and email='actor2@example.test'),'migration preserves paid registration');
select pg_temp.expect((select status='registered' and payment_status='pending' and payment_method='eft' from public.event_registrations where event_id=203 and email='actor3@example.test'),'migration preserves organiser-managed EFT entry');
create trigger finalize_license_payment after insert or update on public.payments for each row execute function private.finalize_license_payment();
update public.commerce_config set event_fee_percent=0,license_fee_percent=0,temp_license_price=120;
insert into public.calendar(id,event_name,is_manual,is_visible,sanction_status,payment_method,allow_payments,start_date,registration_opens_at,registration_closes_at,entry_fee)
 values(201,'Paid registration test',true,true,'approved','platform',true,current_date+3,now()-interval '1 day',now()+interval '2 days',100);
insert into public.tournament_divisions(id,event_id,name,entry_fee,entry_limit,license_required)
 values('60000000-0000-0000-0000-000000000201',201,'Open',100,1,false);
create function pg_temp.cart(p_email text,p_partner text default null) returns jsonb language sql as $$
 select jsonb_build_array(jsonb_build_object('event_id',201,'division_id','60000000-0000-0000-0000-000000000201','division','Open',
 'email',p_email,'full_name',p_email,'registered_by',p_email,'partner_email',p_partner,'payment_method','platform'))
$$;
set role authenticated;
select pg_temp.identity(1);
select public.reserve_event_registration_places(pg_temp.cart('actor1@example.test'));
select pg_temp.expect(not exists(select 1 from public.event_registrations where event_id=201),'opening checkout never registers a player');
select pg_temp.expect(not has_table_privilege('authenticated','private.event_checkout_holds','select'),'hold identities stay private');
select pg_temp.expect(not has_table_privilege('service_role','private.event_checkout_holds','select'),'service uses checked RPCs instead of direct hold reads');
select pg_temp.reject($q$insert into public.event_registrations(event_id,division_id,division,email,full_name,registered_by,payment_status,payment_method)
 values(201,'60000000-0000-0000-0000-000000000201','Open','actor1@example.test','One','actor1@example.test','pending','platform')$q$,'raw pending registrations are refused');
insert into public.payments(player_id,event_id,amount,status,payment_type,reference,metadata)
 values(1,201,100,'processing','event_entry_fee','hold-one',jsonb_build_object('source','manual_event','registrant_email','actor1@example.test',
 'covers',jsonb_build_array(jsonb_build_object('type','entry','email','actor1@example.test','division','Open')),'registration_rows',pg_temp.cart('actor1@example.test')));
select pg_temp.expect(public.event_checkout_state('hold-one')->>'state'='awaiting_payment','active checkout is awaiting payment');
select pg_temp.identity(3);
select pg_temp.reject($q$select public.event_checkout_state('hold-one')$q$,'another account cannot inspect the hold');
select pg_temp.reject($q$select public.cancel_event_checkout('hold-one')$q$,'another account cannot cancel the hold');
select pg_temp.reject($q$select public.reserve_event_registration_places(pg_temp.cart('actor3@example.test'))$q$,'an active hold prevents overselling the final place');
select pg_temp.identity(1);
select public.cancel_event_checkout('hold-one');
select pg_temp.expect(public.event_checkout_state('hold-one')->>'state'='expired','cancelled checkout requires registration again');
select pg_temp.identity(3);
select public.reserve_event_registration_places(pg_temp.cart('actor3@example.test'));
insert into public.payments(player_id,event_id,amount,status,payment_type,reference,metadata)
 values(3,201,100,'processing','event_entry_fee','hold-three',jsonb_build_object('source','manual_event','registrant_email','actor3@example.test',
 'covers',jsonb_build_array(jsonb_build_object('type','entry','email','actor3@example.test','division','Open')),'registration_rows',pg_temp.cart('actor3@example.test')));
reset role;
select set_config('request.jwt.claims','{}',false);
update private.event_checkout_holds set expires_at=now()-interval '1 second' where payment_id=(select id from public.payments where reference='hold-three');
set role authenticated;
select pg_temp.identity(1);
select public.reserve_event_registration_places(pg_temp.cart('actor1@example.test'));
select pg_temp.expect(not exists(select 1 from public.event_registrations where event_id=201),'expiry releases capacity without registering anyone');
insert into public.payments(player_id,event_id,amount,status,payment_type,reference,metadata)
 values(1,201,100,'processing','event_entry_fee','hold-restarted',jsonb_build_object('source','manual_event','registrant_email','actor1@example.test',
 'covers',jsonb_build_array(jsonb_build_object('type','entry','email','actor1@example.test','division','Open')),'registration_rows',pg_temp.cart('actor1@example.test')));
set role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',false);
update public.payments set status='success' where reference='hold-restarted';
select pg_temp.expect((public.finalize_paid_event_checkout((select id from public.payments where reference='hold-restarted'))->>'persisted')::boolean,'verified payment atomically confirms registration');
select pg_temp.expect((select count(*)=1 and bool_and(payment_status='paid' and status='registered') from public.event_registrations where event_id=201),'only the paid player appears on the roster');
select pg_temp.expect(not (public.finalize_paid_event_checkout((select id from public.payments where reference='hold-restarted'))->>'persisted')::boolean,'duplicate callbacks do not duplicate registration');
update public.payments set status='success' where reference='hold-three';
select pg_temp.expect((public.finalize_paid_event_checkout((select id from public.payments where reference='hold-three'))->>'needsReview')::boolean,'late expired payment goes to review instead of overbooking');
select pg_temp.expect((select count(*)=1 from public.event_registrations where event_id=201),'late payment never adds a second player');
reset role;
select set_config('request.jwt.claims','{}',false);
insert into public.calendar(id,event_name,is_manual,is_visible,sanction_status,payment_method,allow_payments,start_date,registration_opens_at,registration_closes_at,entry_fee,allow_temporary_license)
 values(202,'Required event licence',true,true,'approved','platform',true,current_date+3,now()-interval '1 day',now()+interval '2 days',100,true);
insert into public.tournament_divisions(id,event_id,name,entry_fee,entry_limit,license_required)
 values('60000000-0000-0000-0000-000000000202',202,'Licensed',100,2,false);
create function pg_temp.licence_cart() returns jsonb language sql as $$select jsonb_build_object('source','manual_event','registrant_email','actor3@example.test',
 'covers',jsonb_build_array(jsonb_build_object('type','entry','email','actor3@example.test','division','Licensed'),jsonb_build_object('type','license','license','temporary','email','actor3@example.test','event_id',202)),
 'registration_rows',jsonb_build_array(jsonb_build_object('event_id',202,'division_id','60000000-0000-0000-0000-000000000202','division','Licensed',
 'email','actor3@example.test','full_name','Three','registered_by','actor3@example.test','payment_method','platform')))$$;
set role authenticated;
select pg_temp.identity(3);
select pg_temp.reject($q$insert into public.payments(player_id,event_id,amount,status,payment_type,reference,metadata)
 values(3,202,220,'processing','event_entry_fee','unnecessary-temp',pg_temp.licence_cart())$q$,'temporary licence cannot be bought for a division that does not require it');
reset role;
select set_config('request.jwt.claims','{}',false);
update public.tournament_divisions set license_required=true where event_id=202;
set role authenticated;
select pg_temp.identity(3);
insert into public.payments(player_id,event_id,amount,status,payment_type,reference,metadata)
 values(3,202,220,'processing','event_entry_fee','required-temp',pg_temp.licence_cart());
reset role;
select set_config('request.jwt.claims','{}',false);
select pg_temp.expect(not exists(select 1 from public.temporary_licenses where event_id=202),'opening checkout issues no temporary licence');
set role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',false);
update public.payments set status='success' where reference='required-temp';
reset role;
select set_config('request.jwt.claims','{}',false);
select pg_temp.expect(not exists(select 1 from public.temporary_licenses where event_id=202),'money claim alone does not issue an event licence');
set role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',false);
select public.finalize_paid_event_checkout((select id from public.payments where reference='required-temp'));
reset role;
select set_config('request.jwt.claims','{}',false);
select pg_temp.expect(exists(select 1 from public.temporary_licenses where player_id=3 and event_id=202),'confirmed paid event issues its required temporary licence');
select pg_temp.expect(not exists(select 1 from public.temporary_licenses where player_id=3 and event_id=201),'temporary entitlement is tied to the purchased event');
set role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',false);
insert into public.payments(player_id,event_id,amount,status,payment_type,reference,metadata)
 values(1,202,120,'success','temp_license','standalone-temp-bypass','{"source":"web_license_modal","license_type":"temporary","event_id":202}');
reset role;
select set_config('request.jwt.claims','{}',false);
select pg_temp.expect(not exists(select 1 from public.temporary_licenses where player_id=1 and event_id=202),'a direct standalone payment cannot issue a new event licence');
select pg_temp.expect(exists(select 1 from public.license_audit_log where details->>'payment_id'=(select id::text from public.payments where reference='standalone-temp-bypass') and action='payment_review'),'unexpected standalone money is retained for review');
-- Paying for yourself does not register an unpaid partner.
insert into public.calendar(id,event_name,is_manual,is_visible,sanction_status,payment_method,allow_payments,start_date,registration_opens_at,registration_closes_at,entry_fee)
 values(205,'Unpaid partner',true,true,'approved','platform',true,current_date+3,now()-interval '1 day',now()+interval '2 days',100);
insert into public.tournament_divisions(id,event_id,name,entry_fee,entry_limit,license_required)
 values('60000000-0000-0000-0000-000000000205',205,'Open',100,5,false);
create function pg_temp.partner_cart() returns jsonb language sql as $$select jsonb_build_array(
 jsonb_build_object('event_id',205,'division_id','60000000-0000-0000-0000-000000000205','division','Open','email','actor1@example.test','full_name','One','registered_by','actor1@example.test','partner_email','actor3@example.test'),
 jsonb_build_object('event_id',205,'division_id','60000000-0000-0000-0000-000000000205','division','Open','email','actor3@example.test','full_name','Three','registered_by','actor1@example.test','partner_email','actor1@example.test'))$$;
set role authenticated;
select pg_temp.identity(1);
insert into public.payments(player_id,event_id,amount,status,payment_type,reference,metadata)
 values(1,205,100,'processing','event_entry_fee','pay-self-only',jsonb_build_object('source','manual_event','registrant_email','actor1@example.test',
 'covers','[{"type":"entry","email":"actor1@example.test","division":"Open"}]'::jsonb,'registration_rows',pg_temp.partner_cart()));
set role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',false);
update public.payments set status='success' where reference='pay-self-only';
select public.finalize_paid_event_checkout((select id from public.payments where reference='pay-self-only'));
select pg_temp.expect((select count(*)=1 and bool_and(email='actor1@example.test' and payment_status='paid') from public.event_registrations where event_id=205),'unpaid partner must complete their own registration');
reset role;
select set_config('request.jwt.claims','{}',false);
select pg_temp.expect((select state='released' from private.event_checkout_holds where event_id=205 and email='actor3@example.test'),'unpaid partner does not retain a checkout hold');
select 'Paid registration DB: '||count(*)||' assertions passed' from checks;
