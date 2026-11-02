-- Only the dedicated, empty local fixture database may run these migrations.
\set ON_ERROR_STOP on
do $$begin
 if current_database()<>'fourm_license_dashboard_test' or exists(select 1 from pg_tables where schemaname='public') then
  raise exception 'Use the empty disposable fourm_license_dashboard_test database';
 end if;
end $$;
\ir bootstrap.sql
alter table public.players add column image_url text;
update public.players set image_url='https://example.test/player-photo.jpg' where id=1;
set test.role='service_role';
-- Keep the original regression fixture's 2026 event ahead of the current date.
update public.calendar set start_date=current_date+4,end_date=current_date+6 where id=10;
\ir ../../supabase/migrations/20261015093222_annual_player_licenses.sql
\ir ../../supabase/migrations/20261015101532_temporary_license_sales_reporting.sql
\ir ../../supabase/migrations/20261015102819_restore_player_access_and_license_purchase_dates.sql
\ir ../../supabase/migrations/20261015103019_license_purchase_dates.sql
\ir ../../supabase/migrations/20261015103859_complete_player_license_payment_history.sql
\ir ../../supabase/migrations/20261015105056_restrict_license_rpc_execution.sql
\ir ../../supabase/migrations/20261015105729_full_license_renewal_pricing_and_early_coverage.sql
\ir ../../supabase/migrations/20261019144459_retain_server_event_license_quotes.sql
\ir ../../supabase/migrations/20261019144512_align_legacy_full_license_start_dates.sql
\ir ../../supabase/migrations/20261020055919_archive_license_year_offerings.sql
\ir ../../supabase/migrations/20261102115226_license_sales_dashboard.sql
\ir ../../supabase/migrations/20261102115550_license_register_pagination.sql
\ir ../../supabase/migrations/20261102120125_license_register_active_breakdown.sql
\ir ../../supabase/migrations/20261102120557_license_current_holder_summary.sql

begin;
create function pg_temp.expect(condition boolean,label text) returns void language plpgsql as $$begin if condition is distinct from true then raise exception 'FAIL: %',label;end if;end$$;
create or replace function public.license_today() returns date language sql stable set search_path='' as $$select '2026-11-02'::date$$;
set test.uid='00000000-0000-0000-0000-000000000001';set test.email='admin@test.test';set test.role='authenticated';
select pg_temp.expect((select status='upcoming' from private.license_register where player_id=2 and license_type='temporary'),'future event coverage is upcoming');
select pg_temp.expect((manage_license('list','{"type":"temporary","status":"upcoming"}')->>'total')::int=1,'register status filters agree with coverage dates');
select pg_temp.expect((manage_license('list','{"year":2027}')->'current_counts'->>'temporary')::int=1,'already purchased upcoming event licenses count as current across coverage-year filters');
select pg_temp.expect((manage_license('list','{"type":"temporary","status":"current"}')->>'total')::int=1,'current filter includes an upcoming temporary license');
savepoint upcoming_multiple_events;
select manage_license('grant','{"player_id":2,"license_type":"temporary","event_id":11,"source":"complimentary","reason":"Second upcoming event fixture"}');
select pg_temp.expect((manage_license('list','{}')->'current_counts'->>'temporary')::int=2,'two purchased or granted event licenses remain two license records');
select pg_temp.expect((manage_license('list','{}')->'current_counts'->>'temporary_holders')::int=1,'two event licenses for one person count as one temporary holder');
rollback to upcoming_multiple_events;
select pg_temp.expect((license_sales_overview(2026)->>'total_sold')::int=0,'legacy coverage is not a fabricated sale');
select manage_license('grant','{"player_id":1,"year":2027,"source":"manual","amount":500,"payment_method":"eft","reason":"Renewal fixture"}');
select manage_license('grant','{"player_id":3,"year":2027,"source":"manual","amount":650,"payment_method":"eft","reason":"New Full fixture"}');
select manage_license('grant','{"player_id":2,"year":2027,"source":"complimentary","reason":"Free Full fixture"}');
select pg_temp.expect((manage_license('list','{}')->'current_counts'->>'full')::int=3,'overlapping 2026 and 2027 Full records count as one current holder');
-- A later revocation must not turn an actual renewal into a new sale.
update public.annual_licenses set revoked_at=now()+interval '1 hour' where player_id=1 and season_year=2026;
alter table public.payments disable trigger finalize_license_payment;
insert into public.payments(player_id,event_id,amount,currency,status,payment_type,payment_method,reference,metadata,created_at) values
 (1,10,600,'ZAR','success','event_entry_fee','paystack','REGEV-dashboard','{"split_recorded":true,"covers":[{"type":"license","license":"temporary","email":"full@test.test"}]}','2026-03-10T23:00:00Z'),
 (1,10,120,'ZAR','success','temp_license','paystack','LIC-REGEV-dashboard','{"parent_reference":"REGEV-dashboard","covers":[{"type":"license","license":"temporary","email":"full@test.test"}]}','2026-06-10'),
 (1,10,120,'ZAR','success','temp_license','paystack','duplicate-division','{}','2026-05-01'),
 (3,11,120,'ZAR','processing','temp_license','paystack','incomplete-attempt','{}','2026-11-01');
insert into public.payment_refunds(payment_id,amount,status,metadata) select id,120,'processed','{"cover_type":"license"}' from public.payments where reference='LIC-REGEV-dashboard';
insert into public.payments(player_id,event_id,amount,currency,status,payment_type,payment_method,reference,is_test,metadata,created_at) values
 (2,11,120,'ZAR','success','temp_license','paystack','test-excluded',true,'{}','2026-04-01');
alter table public.payments enable trigger finalize_license_payment;
select pg_temp.expect((license_sales_overview(2026)->>'new_full')::int=1,'temporary-only history remains a first Full purchase');
select pg_temp.expect((license_sales_overview(2026)->>'renewals')::int=1,'previous Full holder renews, even after later revocation');
select pg_temp.expect((license_sales_overview(2026)->>'temporary')::int=1,'parent, split and duplicate division are one temporary sale');
select pg_temp.expect((license_sales_overview(2026)->>'total_sold')::int=3,'paid total is new Full plus renewals plus temporary');
select pg_temp.expect((license_sales_overview(2026)->>'full_sold')::int=2,'combined Full total includes new and renewal');
select pg_temp.expect((manage_license('list','{"year":2027}')->'counts'->>'active_full')::int=3,'active Full includes new, renewal and complimentary coverage');
select pg_temp.expect((manage_license('list','{"year":2027}')->'counts'->>'active_renewals')::int=1,'renewal is a subset of active Full, counted once');
select pg_temp.expect((manage_license('list','{"year":2027}')->'counts'->>'active_temporary')::int=0,'future temporary coverage is not counted as active');
select pg_temp.expect((manage_license('list','{"year":2027,"type":"renewal","status":"active"}')->>'total')::int=1,'renewal filter returns only the renewed Full license');
select pg_temp.expect((manage_license('list','{"year":2026}')->'current_counts'->>'full')::int=3,'current Full holders include immediately valid next-year purchases');
select pg_temp.expect((manage_license('list','{"year":2026}')->'current_counts'->>'renewals')::int=1,'current renewal count is independent of selected coverage-year filter');
select pg_temp.expect((get_player_licenses(1)->>'image_url')='https://example.test/player-photo.jpg','player header includes profile photo');
select pg_temp.expect((select r->>'image_url'='https://example.test/player-photo.jpg' from jsonb_array_elements(manage_license('list','{"year":2027,"type":"renewal"}')->'rows') r),'register includes profile photo without another player lookup');
select pg_temp.expect((license_sales_overview(2026)->>'complimentary')::int=1,'free grants stay separate from paid sales');
select pg_temp.expect((license_sales_overview(2026)->>'refunded')::int=1,'refund stays in gross sold totals and is flagged');
select pg_temp.expect((license_sales_overview(2027)->>'total_sold')::int=0,'2027 early purchases are sales in 2026, not 2027');
select pg_temp.expect((license_sales_overview(null)->>'all_time_full')::int=2,'all-time Full units');
select pg_temp.expect((license_sales_overview(null)->>'all_time_temporary')::int=1,'all-time temporary units');
select pg_temp.expect((select (s->>'renewals')::int=1 and (s->>'new_full')::int=1 and (s->>'complimentary')::int=1 from jsonb_array_elements(license_sales_overview(2026)->'seasons') s where s->>'season_year'='2027'),'coverage-year breakdown includes early sales and free grants');
select pg_temp.expect((select sum((m->>'total')::int)=3 from jsonb_array_elements(license_sales_overview(2026)->'series') m),'monthly totals reconcile');
select pg_temp.expect((select (m->>'temporary')::int=1 from jsonb_array_elements(license_sales_overview(2026)->'series') m where m->>'month'='2026-03-01'),'split sale uses original checkout month');
select pg_temp.expect((select (p->>'checkout_amount')::numeric=720 and (p->>'amount')::numeric=600 and (p->>'split_recorded')::boolean from jsonb_array_elements(get_player_licenses(1)->'payments') p where p->>'reference'='REGEV-dashboard'),'checkout total restores event plus license portions');
select pg_temp.expect((select p->>'parent_reference'='REGEV-dashboard' from jsonb_array_elements(get_player_licenses(1)->'payments') p where p->>'reference'='LIC-REGEV-dashboard'),'explicit split link available to UI');
-- Parent still appears after the successful split removes license covers.
update public.payments set metadata=metadata||'{"covers":[{"type":"entry","email":"full@test.test"}]}' where reference='REGEV-dashboard';
select pg_temp.expect((select count(*)=1 from jsonb_array_elements(get_player_licenses(1)->'payments') p where p->>'reference'='REGEV-dashboard'),'entry parent retained for relevant license split');
select pg_temp.expect(not has_function_privilege('anon','public.license_sales_overview(integer)','execute'),'anonymous callers cannot execute analytics');
select pg_temp.expect(has_function_privilege('authenticated','public.license_sales_overview(integer)','execute'),'authenticated entry point has explicit grant');
select pg_temp.expect(not has_function_privilege('authenticated','private.player_license_payment_history(bigint)','execute'),'history helper remains private');
-- Pagination must limit actual RPC rows, preserve all-filter totals and avoid
-- overlap. The export still explicitly requests 50 records per batch.
insert into public.players(id,name,email) select n,'Pagination '||n,'pagination-'||n||'@test.test' from generate_series(20,94) n;
insert into public.license_accounts(player_id) select n from generate_series(20,94) n;
insert into public.annual_licenses(player_id,season_year,source) select n,2027,'complimentary' from generate_series(20,94) n;
select pg_temp.expect(jsonb_array_length(manage_license('list','{"year":2027,"page_size":10}')->'rows')=10,'ten records per page');
select pg_temp.expect((manage_license('list','{"year":2027,"page_size":10}')->>'total')::int=78,'total is all matching licenses, not page length');
select pg_temp.expect(jsonb_array_length(manage_license('list','{"year":2027,"page_size":25}')->'rows')=25,'twenty-five records per page');
select pg_temp.expect(jsonb_array_length(manage_license('list','{"year":2027}')->'rows')=50,'old clients retain fifty-row batches');
select pg_temp.expect(jsonb_array_length(manage_license('list','{"year":2027,"page_size":500}')->'rows')=50,'page size is bounded');
select pg_temp.expect(jsonb_array_length(manage_license('list','{"year":2027,"page_size":10,"page":7}')->'rows')=8,'final partial page');
select pg_temp.expect(not exists(
 select 1 from jsonb_array_elements(manage_license('list','{"year":2027,"page_size":10,"page":0}')->'rows') a
 join jsonb_array_elements(manage_license('list','{"year":2027,"page_size":10,"page":1}')->'rows') b on a->>'id'=b->>'id'
),'pages do not overlap');
set test.email='new@test.test';
do $$begin
 begin perform public.license_sales_overview(2026);exception when raise_exception then
  if sqlerrm='Licenses permission required' then return;end if;raise;
 end;
 raise exception 'Unauthorized analytics access was accepted';
end $$;
rollback;
select 'License dashboard database assertions passed' as result;
