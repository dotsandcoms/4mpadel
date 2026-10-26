begin;
create function private.assert_start(v boolean,msg text) returns void language plpgsql as $$begin if v is distinct from true then raise exception 'FAIL: %',msg;end if;end$$;
set test.uid='00000000-0000-0000-0000-000000000001';
set test.email='admin@test.test';set test.role='service_role';
insert into public.players values
 (100,'Known purchase','known-start@test.test','none',false),
 (101,'Unknown purchase','unknown-start@test.test','none',false),
 (102,'Split purchase','split-start@test.test','none',false),
 (103,'Prepaid purchase','prepaid-start@test.test','none',false),
 (104,'Revoked purchase','revoked-start@test.test','none',false),
 (105,'Complimentary','comp-start@test.test','none',false),
 (106,'New 2027 license','new-start@test.test','none',false),
 (107,'Explicit later start','explicit-start@test.test','none',false);
alter table public.payments disable trigger finalize_license_payment;
insert into public.payments(player_id,amount,currency,status,payment_type,payment_method,reference,created_at) values
 (100,450,'ZAR','success','membership','paystack','start-known','2026-04-16T08:30:00Z'),
 (102,1000,'ZAR','success','event_entry_fee','paystack','start-parent','2026-04-15T22:30:00Z'),
 (103,450,'ZAR','success','membership','paystack','start-prepaid','2025-12-20T08:30:00Z'),
 (104,450,'ZAR','refunded','membership','paystack','start-revoked','2026-04-16T08:30:00Z'),
 (105,450,'ZAR','success','membership','paystack','start-comp','2026-04-16T08:30:00Z'),
 (106,650,'ZAR','success','membership','paystack','start-2027','2026-10-15T08:30:00Z'),
 (107,450,'ZAR','success','membership','paystack','start-explicit','2026-04-16T08:30:00Z');
insert into public.payments(player_id,amount,currency,status,payment_type,payment_method,reference,created_at,metadata) values
 (102,450,'ZAR','success','membership','paystack','start-split','2026-10-15','{"parent_reference":"start-parent"}');
alter table public.payments enable trigger finalize_license_payment;
insert into public.annual_licenses(player_id,season_year,source,valid_from,payment_id,revoked_at)
select player_id,case when player_id=106 then 2027 else 2026 end,
 case when player_id=105 then 'complimentary' else 'payment' end,
 case when player_id=106 then '2026-10-15'::date when player_id=107 then '2026-05-01'::date else '2026-01-01'::date end,
 id,case when player_id=104 then now() end
from public.payments where reference like 'start-%' and reference<>'start-parent';
-- Reproduce the original import, which ran as a database migration rather than
-- a service-role issuance without payment evidence.
set test.role='';
insert into public.annual_licenses(player_id,season_year,source,valid_from) values(101,2026,'legacy','2026-01-01');
set test.role='service_role';
create temp table start_counts as select
 (select count(*) from public.payments) payments,
 (select count(*) from public.annual_licenses) licenses,
 (select count(*) from public.temporary_licenses) temporary,
 (select count(*) from public.license_accounts) numbers;
\ir ../../supabase/migrations/20261019144512_align_legacy_full_license_start_dates.sql
select private.assert_start((select valid_from='2026-04-16' from public.annual_licenses where player_id=100),'known payment sets coverage start');
select private.assert_start((select starts_on='2026-04-16' and ends_on='2026-12-31' from private.license_register where player_id=100),'admin register exposes the corrected coverage range');
select private.assert_start((get_player_licenses(100)->'licenses'->0->>'starts_on')='2026-04-16','admin impersonation receives the same corrected start');
set test.email='known-start@test.test';
select private.assert_start((get_player_licenses()->'licenses'->0->>'starts_on')='2026-04-16','owner receives the same corrected start');
set test.email='admin@test.test';
select private.assert_start((select valid_from='2026-01-01' from public.annual_licenses where player_id=101),'unknown purchase retains January fallback');
select private.assert_start((select valid_from='2026-04-16' from public.annual_licenses where player_id=102),'split uses original checkout day in Johannesburg');
select private.assert_start((select valid_from='2026-01-01' from public.annual_licenses where player_id=103),'prepaid coverage retains January start');
select private.assert_start((select valid_from='2026-04-16' and revoked_at is not null from public.annual_licenses where player_id=104),'revoked coverage stays revoked');
select private.assert_start((select valid_from='2026-01-01' from public.annual_licenses where player_id=105),'complimentary start is preserved');
select private.assert_start((select valid_from='2026-10-15' from public.annual_licenses where player_id=106),'immediately valid 2027 coverage is preserved');
select private.assert_start((select valid_from='2026-05-01' from public.annual_licenses where player_id=107),'deliberate later starts are preserved');
select private.assert_start((select details->>'previous_start'='2026-01-01' and details->>'starts_on'='2026-04-16' from public.license_audit_log where player_id=100 and action='coverage_start_corrected'),'correction has an audit trail');
\ir ../../supabase/migrations/20261019144512_align_legacy_full_license_start_dates.sql
select private.assert_start((select count(*)=3 from public.license_audit_log where action='coverage_start_corrected'),'rerunning does not duplicate corrections or audit entries');
select private.assert_start((select payments=(select count(*) from public.payments) and licenses=(select count(*) from public.annual_licenses) and temporary=(select count(*) from public.temporary_licenses) and numbers=(select count(*) from public.license_accounts) from start_counts),'no revenue, licenses, event history or numbers are added');
rollback;
