begin;
create function private.assert_sales(v boolean,msg text) returns void language plpgsql as $$begin if v is distinct from true then raise exception 'FAIL: %',msg;end if;end$$;
set test.uid='00000000-0000-0000-0000-000000000001';set test.email='admin@test.test';set test.role='authenticated';
-- Two people at one event count as two licenses; repeat divisions/split ledger rows count once.
insert into public.payments(player_id,event_id,amount,currency,status,payment_type,payment_method,reference,metadata,created_at)
values(1,10,590,'ZAR','success','event_entry_fee','paystack','historical-parent','{"covers":[{"type":"license","license":"temporary","email":"full@test.test"},{"type":"license","license":"temporary","email":"temp@test.test"}]}','2026-03-10'),
(1,10,120,'ZAR','success','temp_license','paystack','historical-child-1','{"parent_reference":"historical-parent","covers":[{"type":"license","license":"temporary","email":"full@test.test"}]}','2026-06-10'),
(2,10,120,'ZAR','success','temp_license','paystack','historical-child-2','{"parent_reference":"historical-parent","covers":[{"type":"license","license":"temporary","email":"temp@test.test"}]}','2026-06-10'),
(2,10,120,'ZAR','success','temp_license','paystack','duplicate-division','{}','2026-04-10');
-- Test-mode payments never count.
insert into public.payments(player_id,event_id,amount,currency,status,payment_type,payment_method,reference,is_test,created_at) values(3,11,120,'ZAR','success','temp_license','paystack','test-only',true,'2026-03-10');
select private.assert_sales((temporary_license_sales_report('2026-01-01','2026-12-31')->>'sold')::integer=2,'one paid license per person/event');
select private.assert_sales((temporary_license_sales_report('2026-03-01','2026-03-31')->>'sold')::integer=2,'use original parent sale date, not later split date');
select private.assert_sales((temporary_license_sales_report('2026-06-01','2026-06-30')->>'sold')::integer=0,'split backfill must not create new later sales');
insert into public.payment_refunds(payment_id,amount,status,metadata) select id,120,'processed','{"cover_type":"license"}' from public.payments where reference='historical-child-2';
select private.assert_sales((temporary_license_sales_report('2026-01-01','2026-12-31')->>'refunded')::integer=1,'completed refund attributed to its player');
select manage_license('grant','{"player_id":3,"license_type":"temporary","event_id":11,"source":"complimentary","reason":"Comp fixture"}');
select private.assert_sales((temporary_license_sales_report('2026-01-01','2026-12-31')->>'complimentary')::integer=1,'complimentary grants reported separately');
select private.assert_sales((temporary_license_sales_report('2026-01-01','2026-12-31')->>'sold')::integer=2,'complimentary grants do not inflate paid sales');
-- A client-written success flag after rollout is not payment proof.
grant insert on public.payments to authenticated;
grant usage on schema auth to authenticated;
set session authorization authenticated;
set test.email='new@test.test';
insert into public.payments(player_id,event_id,amount,currency,status,payment_type,payment_method,reference,metadata) values(3,11,120,'ZAR','success','temp_license','paystack','unverified-client-row','{}');
reset session authorization;set test.email='admin@test.test';
select private.assert_sales((temporary_license_sales_report('2026-01-01','2026-12-31')->>'sold')::integer=2,'unverified new ledger rows do not inflate sales');
set test.role='service_role';
insert into public.payments(player_id,event_id,amount,currency,status,payment_type,payment_method,reference,metadata) values(3,10,120,'ZAR','success','temp_license','paystack','verified-temporary','{"license_type":"temporary","event_id":10}');
select private.assert_sales((public.player_license_eligibility(3,10)->>'temporary')::boolean,'verified legacy temporary purchases remain available');
select private.assert_sales((temporary_license_sales_report('2026-01-01','2026-12-31')->>'sold')::integer=3,'new verified temporary purchase counted');
set test.role='authenticated';set test.email='new@test.test';
do $$begin begin perform temporary_license_sales_report();raise exception 'unauthorized report access accepted';exception when raise_exception then if sqlerrm='unauthorized report access accepted' then raise;end if;end;end$$;
rollback;
