\set ON_ERROR_STOP on
do $$ begin
    if current_database() <> 'fourm_permission_boundary_test' or to_regclass('public.payments') is not null then
        raise exception 'Use the empty disposable fourm_permission_boundary_test database required by the checkout fixture';
    end if;
end $$;
\ir ../mobile/tests/paid-registration-checkout.sql
reset role;
select set_config('request.jwt.claims','{}',false);

-- The callback returns a fresh finalization only once. The covered entry and
-- its partner status are written by the database before the worker returns.
insert into public.calendar(id,event_name,is_manual,is_visible,sanction_status,payment_method,allow_payments,
  start_date,registration_opens_at,registration_closes_at,entry_fee)
values(209,'Callback replay fixture',true,true,'approved','platform',true,current_date+3,now()-interval '1 day',now()+interval '2 days',100);
insert into public.tournament_divisions(id,event_id,name,entry_fee,entry_limit,license_required)
values('60000000-0000-0000-0000-000000000209',209,'Open',100,8,false);
insert into public.event_registrations(event_id,division_id,division,email,full_name,registered_by,partner_email,payment_status,payment_method)
values (209,'60000000-0000-0000-0000-000000000209','Open','actor1@example.test','Original player','actor1@example.test','actor2@example.test','pending','eft'),
       (209,'60000000-0000-0000-0000-000000000209','Open','actor2@example.test','Partner','actor2@example.test','actor1@example.test','paid','eft');
set role authenticated;
select pg_temp.identity(1);
insert into public.payments(player_id,event_id,amount,status,payment_type,reference,metadata)
values(1,209,100,'processing','event_entry_fee','verified-callback-replay',
  '{"source":"manual_event","registrant_email":"actor1@example.test","covers":[{"type":"entry","email":"actor1@example.test","division":"Open"}],"registration_rows":[]}');
set role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',false);
update public.payments set status='success' where reference='verified-callback-replay';
select pg_temp.expect((select (public.finalize_paid_event_checkout(id)->>'persisted')::boolean from public.payments
  where reference='verified-callback-replay'),'fresh callback commits the verified entry');
select pg_temp.expect((select payment_status='paid' from public.event_registrations where event_id=209 and email='actor1@example.test'),
  'payment-only callback marks the exact saved entry paid');
select pg_temp.expect((select partner_payment_status='paid' from public.event_registrations where event_id=209 and email='actor2@example.test'),
  'the atomic checkout also updates the existing partner mirror');
reset role;
select set_config('request.jwt.claims','{}',false);
update public.event_registrations set email='replacement@example.test' where event_id=209 and email='actor1@example.test';
update public.event_registrations set partner_email='replacement@example.test' where event_id=209 and email='actor2@example.test';
insert into public.event_registrations(event_id,division_id,division,email,full_name,registered_by,payment_status,payment_method)
values(209,'60000000-0000-0000-0000-000000000209','Open','actor1@example.test','Former player re-entry','actor1@example.test','pending','eft');
set role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',false);
select pg_temp.expect((select not (public.finalize_paid_event_checkout(id)->>'persisted')::boolean from public.payments
  where reference='verified-callback-replay'),'a repeat callback keeps the existing checkout result');
select pg_temp.expect((select payment_status='pending' from public.event_registrations where event_id=209 and email='actor1@example.test'),
  'the former player cannot borrow the paid slot when the provider retries');
reset role;
select set_config('request.jwt.claims','{}',false);

alter table public.payments add unique(reference);
alter table public.native_license_checkouts add column user_id uuid;
alter table public.annual_licenses add column id uuid default gen_random_uuid();
alter table public.annual_licenses add column source text;
alter table public.annual_licenses add column payment_id uuid;
alter table public.annual_licenses add unique(player_id,season_year);
create table public.payment_refunds(id uuid primary key default gen_random_uuid(),paystack_reference text,status text,event_registration_id uuid,
    payment_id uuid references public.payments(id));
\ir ../supabase/migrations/20261119111834_admin_paystack_receipt_backfill.sql

select pg_temp.expect(not has_function_privilege('authenticated','public.admin_paystack_receipt_backfill(uuid,jsonb,jsonb,text)','EXECUTE'),'ordinary callers cannot invoke the writer');
select pg_temp.expect(not has_function_privilege('anon','public.admin_paystack_receipt_backfill(uuid,jsonb,jsonb,text)','EXECUTE'),'anonymous callers cannot invoke the writer');
select pg_temp.expect(has_function_privilege('service_role','public.admin_paystack_receipt_backfill(uuid,jsonb,jsonb,text)','EXECUTE'),'server-only transport can ask for a plan');
select pg_temp.expect(not has_table_privilege('service_role','private.admin_paystack_backfill_audit','INSERT'),'audit can only be written through the reviewed controller');

insert into auth.users(id,email) values
    ('00000000-0000-0000-0000-000000000150','backfill-entry@example.test'),
    ('00000000-0000-0000-0000-000000000151','backfill-licence@example.test');
insert into public.players(id,name,email,approved) values
    (150,'Backfill entry','backfill-entry@example.test',true),
    (151,'Backfill licence','backfill-licence@example.test',true);
update public.admin_sidebar_permissions set role='super_admin' where email='actor9@example.test';
insert into public.calendar(id,event_name,is_manual,is_visible,sanction_status,payment_method,allow_payments,start_date,registration_opens_at,registration_closes_at,entry_fee,allow_temporary_license)
values(250,'Synthetic recoverable event',true,true,'approved','platform',true,current_date+2,now()-interval '1 day',now()+interval '1 day',100,true),
      (251,'Another event',true,true,'approved','platform',true,current_date+2,now()-interval '1 day',now()+interval '1 day',100,false);
insert into public.tournament_divisions(id,event_id,name,entry_fee,entry_limit,license_required,is_active)
values('60000000-0000-0000-0000-000000000250',250,'Backfill',100,10,false,true),
      ('60000000-0000-0000-0000-000000000251',251,'Backfill',100,10,false,true),
      ('60000000-0000-0000-0000-000000000252',250,'With licence',160,10,true,true);
insert into public.event_registrations(id,event_id,division_id,division,email,full_name,payment_status,payment_method,created_at)
values('80000000-0000-0000-0000-000000000250',250,'60000000-0000-0000-0000-000000000250','Backfill','backfill-entry@example.test','Recover player','pending','eft',now()-interval '1 day'),
      ('80000000-0000-0000-0000-000000000251',251,'60000000-0000-0000-0000-000000000251','Backfill','backfill-entry@example.test','Foreign record','pending','eft',now()-interval '1 day'),
      ('80000000-0000-0000-0000-000000000252',250,'60000000-0000-0000-0000-000000000252','With licence','actor3@example.test','Bundled player','pending','eft',now()-interval '1 day');
insert into public.native_license_checkouts(reference,user_id,player_id,amount,license_type,license_year)
    select 'BACKFILL-LICENCE',u.id,151,650,'full',extract(year from current_date)::integer from auth.users u where u.email='backfill-licence@example.test';

create temporary table demo_charges(key text primary key, evidence jsonb);
insert into demo_charges values
('entry',jsonb_build_object('provider_id','29001','gateway_reference','EVREG-BACKFILL-1','amount_minor',10000,'paid_at',now(),
    'payer_email','backfill-entry@example.test','source','manual_event','event_id',250,'covers','[{"type":"entry","email":"backfill-entry@example.test","event_id":250,"division":"Backfill","registration_id":"80000000-0000-0000-0000-000000000250"}]'::jsonb)),
('unallocated',jsonb_build_object('provider_id','29002','gateway_reference','PAYLINK-BACKFILL','amount_minor',65000,'paid_at',now(),
    'payer_email','backfill-entry@example.test','source',null,'event_id',null,'covers',null)),
('licence',jsonb_build_object('provider_id','29003','gateway_reference','BACKFILL-LICENCE','amount_minor',65000,'paid_at',now(),
    'payer_email','backfill-licence@example.test','source',null,'event_id',null,'covers',null)),
('bundle',jsonb_build_object('provider_id','29004','gateway_reference','EVREG-BACKFILL-2','amount_minor',28000,'paid_at',now(),
    'payer_email','actor3@example.test','source','manual_event','event_id',250,'covers','[{"type":"entry","email":"actor3@example.test","event_id":250,"division":"With licence"},{"type":"license","email":"actor3@example.test","event_id":250,"license":"temporary"}]'::jsonb));
create function pg_temp.admin_backfill(charge jsonb, review jsonb default null, reason text default null)
returns jsonb language sql as $$ select public.admin_paystack_receipt_backfill((select id from auth.users where email='actor9@example.test'),charge,review,reason) $$;

select set_config('request.jwt.claims','{"role":"service_role"}',false);
select pg_temp.reject($q$select public.admin_paystack_receipt_backfill((select id from auth.users where email='actor1@example.test'),(select evidence from demo_charges where key='entry'))$q$,'tenant identity cannot request a privileged plan');

create temporary table demo_plans as select key, evidence, pg_temp.admin_backfill(evidence) as result from demo_charges;

select pg_temp.expect((select result->'plan'->>'kind'='entry' from demo_plans where key='entry'),'unique registered payment binds the backed event cover');
select pg_temp.expect((select result->'plan'->>'kind'='licence' from demo_plans where key='licence'),'verified amount binds the server-owned licence purchase');
select pg_temp.expect((select result->'plan'->>'kind'='unallocated' from demo_plans where key='unallocated'),'price-only receipt never implies a licence');
select pg_temp.expect((select jsonb_array_length(result->'plan'->'licence_items')=1 from demo_plans where key='bundle'),'bundle uses current checked server licence pricing');
select pg_temp.expect(not exists(select 1 from private.admin_paystack_backfill_audit),'opening reviews performs no audit or ledger writes');
select pg_temp.expect((select pg_temp.admin_backfill(evidence||jsonb_build_object('amount_minor',1),result->'plan','fixture changed')->>'state'='changed'
    from demo_plans where key='entry'),'changed gateway or booking plan refuses the reviewed operation');
select pg_temp.expect((select pg_temp.admin_backfill(evidence||jsonb_build_object('amount_minor',1))->>'state'='held'
    from demo_plans where key='licence'),'mismatched saved licence holds instead of importing as a licence');
select pg_temp.expect((select pg_temp.admin_backfill(evidence,result->'plan','Verified fixture receipt')->>'state'='recorded' from demo_plans where key='entry'),'entry receipt applies once');
select pg_temp.expect((select payment_status='paid' from public.event_registrations where id='80000000-0000-0000-0000-000000000250'),'only the intended entry is paid');
select pg_temp.expect((select payment_status='pending' from public.event_registrations where id='80000000-0000-0000-0000-000000000251'),'another event is unaffected');
select pg_temp.expect((select pg_temp.admin_backfill(evidence,result->'plan','Retry fixture')->>'state'='already_recorded' from demo_plans where key='entry'),'network retry is idempotent even after the payment status changed');
select pg_temp.expect((select pg_temp.admin_backfill(evidence,result->'plan','Verified fixture receipt')->>'state'='recorded' from demo_plans where key='unallocated'),'unallocated receipt records only cash');
select pg_temp.expect((select event_id is null and payment_type='other' and amount=650 from public.payments where reference='29002'),'unallocated funds do not count toward any event or licence');
select pg_temp.expect((select pg_temp.admin_backfill(evidence,result->'plan','Verified fixture receipt')->>'state'='recorded' from demo_plans where key='licence'),'licence recovers onto the webhook-compatible provider ID');
select pg_temp.expect((select payment_type='membership' and metadata->>'client_reference'='BACKFILL-LICENCE' from public.payments where reference='29003'),'licence metadata preserves the exact checkout alias');
select pg_temp.expect((select pg_temp.admin_backfill(evidence,result->'plan','Verified fixture receipt')->>'state'='recorded' from demo_plans where key='bundle'),'bundle atomically records the checked entry and licence');
select pg_temp.expect((select count(*)=2 and sum(amount)=280 from public.payments where reference in ('EVREG-BACKFILL-2','LIC-EVREG-BACKFILL-2-backfill-1')),'split rows account for exactly one gateway charge');
select pg_temp.expect(exists(select 1 from public.annual_licenses where player_id=151),'existing annual issuer activates the saved paid licence');
select pg_temp.expect(exists(select 1 from public.temporary_licenses where player_id=3 and event_id=250),'existing temporary issuer recognises the recovered paid entry');
select pg_temp.expect((select count(*)=4 from private.admin_paystack_backfill_audit),'one immutable audit row is kept for each verified payment');
insert into public.payments(player_id,amount,currency,status,payment_type,payment_method,reference,metadata,is_test)
values(150,350,'ZAR','success','event_entry_fee','paystack','REG-PARTNER-EVREG-OLD-BACKFILL-1',
    '{"paystack_ref":"EVREG-OLD-BACKFILL"}',false);
select pg_temp.expect((select pg_temp.admin_backfill(evidence || '{"gateway_reference":"EVREG-OLD-BACKFILL","provider_id":"29009"}')->>'state'='already_recorded'
    from demo_charges where key='unallocated'),'existing gateway alias in a historical split blocks new receipt creation');
insert into public.payment_refunds(paystack_reference,status) values('REFUNDED-BACKFILL','pending');
select pg_temp.expect((select pg_temp.admin_backfill(evidence || '{"gateway_reference":"REFUNDED-BACKFILL","provider_id":"29010"}')->>'state'='held'
    from demo_charges where key='unallocated'),'local refund reserves block backfill');
select pg_temp.expect((select count(*)=4 from private.admin_paystack_backfill_audit),'existing split and refund never add an audit or new payment');

-- Record an older receipt before its exact registered entry is available.
update public.event_registrations set status='withdrawn' where id='80000000-0000-0000-0000-000000000251';
insert into demo_charges select 'allocate-entry',evidence || jsonb_build_object('provider_id','29011','gateway_reference','EVREG-BACKFILL-ALLOCATE',
    'event_id',251,'covers','[{"type":"entry","email":"backfill-entry@example.test","event_id":251,"division":"Backfill","registration_id":"80000000-0000-0000-0000-000000000251"}]'::jsonb)
    from demo_charges where key='entry';
insert into demo_plans select key,evidence,pg_temp.admin_backfill(evidence) from demo_charges where key='allocate-entry';
select pg_temp.expect((select result->'plan'->>'kind'='unallocated' from demo_plans where key='allocate-entry'),'pre-release import has no exact registration');
select pg_temp.expect((select pg_temp.admin_backfill(evidence,result->'plan','Original unallocated receipt')->>'state'='recorded'
    from demo_plans where key='allocate-entry'),'the original deployed handler can record the unallocated receipt');
create temporary table first_receipt as select id,created_at from public.payments where reference='29011';

\ir ../supabase/migrations/20261120121000_allocate_reviewed_paystack_receipts.sql
select pg_temp.expect(not has_table_privilege('service_role','private.admin_paystack_backfill_allocations','INSERT'),'allocation audit requires the reviewed controller');
select pg_temp.expect(not has_function_privilege('authenticated','public.admin_paystack_receipt_backfill(uuid,jsonb,jsonb,text)','EXECUTE'),'allocation preserves server-only transport');
select pg_temp.expect((select pg_temp.admin_backfill(evidence)->>'state'='held' from demo_charges where key='unallocated'),'receipts with no evidence stay unallocated');
update public.event_registrations set status='registered' where id='80000000-0000-0000-0000-000000000251';
update demo_plans set result=pg_temp.admin_backfill(evidence) where key='allocate-entry';
select pg_temp.expect((select result->'plan'->>'kind'='entry' and result->'plan'->>'existing_payment_id'=(select id::text from first_receipt)
    from demo_plans where key='allocate-entry'),'the reviewed registration is tied to the original ledger identity');
select pg_temp.expect((select payment_type='other' and event_id is null from public.payments where id=(select id from first_receipt))
    and not exists(select 1 from private.admin_paystack_backfill_allocations),'opening a review cannot allocate funds');
select pg_temp.expect((select pg_temp.admin_backfill(evidence,(result->'plan') - 'existing_payment_id','Stale approval')->>'state'='changed'
    from demo_plans where key='allocate-entry'),'a review without the exact original identity cannot commit the allocation');
insert into public.payment_refunds(payment_id,status) select id,'pending' from first_receipt;
select pg_temp.expect((select pg_temp.admin_backfill(evidence,result->'plan','Blocked by local refund')->>'state'='held'
    from demo_plans where key='allocate-entry'),'a refund tied to the ledger row independently blocks the reviewed allocation');
delete from public.payment_refunds where payment_id=(select id from first_receipt);
select pg_temp.expect((select pg_temp.admin_backfill(evidence,result->'plan','Allocate verified event receipt')->>'state'='recorded'
    from demo_plans where key='allocate-entry'),'exact event allocation applies once');
select pg_temp.expect((select p.reference='EVREG-BACKFILL-ALLOCATE' and p.payment_type='event_entry_fee' and p.amount=100
    and p.event_id=251 and p.created_at=f.created_at and p.metadata->>'provider_id'='29011' from public.payments p join first_receipt f using(id))
    and not exists(select 1 from public.payments where reference='29011'),'receipts keep the ledger ID, original date, verified amount and provider ID');
select pg_temp.expect((select payment_status='paid' from public.event_registrations where id='80000000-0000-0000-0000-000000000251'),
    'only the linked existing entry is settled');
select pg_temp.expect((select initial.action='unallocated' and allocation.action='entry' and initial.amount_minor=10000
    from private.admin_paystack_backfill_audit initial join private.admin_paystack_backfill_allocations allocation using(provider_id)
    where provider_id='29011'),'initial recording and allocation keep separate immutable reasons and actor records');
select pg_temp.expect((select pg_temp.admin_backfill(evidence,result->'plan','Network retry')->>'kind'='entry'
    from demo_plans where key='allocate-entry'),'a repeat confirmation returns the known allocation');

insert into auth.users(id,email) values('00000000-0000-0000-0000-000000000152','allocated-licence@example.test');
insert into public.players(id,name,email,approved) values(152,'Allocated annual licence','allocated-licence@example.test',true);
insert into demo_charges select 'allocate-licence',evidence || jsonb_build_object('provider_id','29012','gateway_reference','ALLOCATE-SAVED-LICENCE',
    'payer_email','allocated-licence@example.test') from demo_charges where key='unallocated';
insert into demo_plans select key,evidence,pg_temp.admin_backfill(evidence) from demo_charges where key='allocate-licence';
select pg_temp.expect((select pg_temp.admin_backfill(evidence,result->'plan','Original annual receipt')->>'state'='recorded'
    from demo_plans where key='allocate-licence'),'unmatched standalone cash can still be recorded on the new version');
insert into public.native_license_checkouts(reference,user_id,player_id,amount,license_type,license_year,created_at)
    select 'ALLOCATE-SAVED-LICENCE',id,152,650,'full',extract(year from current_date)::integer,now()-interval '1 day'
    from auth.users where email='allocated-licence@example.test';
update demo_plans set result=pg_temp.admin_backfill(evidence) where key='allocate-licence';
select pg_temp.expect((select pg_temp.admin_backfill(evidence,result->'plan','Allocate verified annual licence')->>'kind'='licence'
    from demo_plans where key='allocate-licence'),'allocation reuses the saved annual checkout');
select pg_temp.expect(exists(select 1 from public.payments p join public.annual_licenses l on l.payment_id=p.id
    where p.reference='29012' and p.payment_type='membership' and p.amount=650 and l.player_id=152),
    'the existing issuer activates a saved annual purchase using the same receipt');
select 'Admin Paystack backfill DB: exact checkout allocation, licence issuance, refund holds and replay verified';
