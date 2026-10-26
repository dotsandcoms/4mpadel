begin;
create function private.assert_purchase(v boolean,msg text) returns void language plpgsql as $$begin if v is distinct from true then raise exception 'FAIL: %',msg;end if;end$$;
set test.uid='00000000-0000-0000-0000-000000000001';set test.email='admin@test.test';set test.role='authenticated';
insert into public.players values(5,'Historical buyer','buyer@test.test','none',false),(6,'Ambiguous buyer','ambiguous@test.test','none',false),(7,'Unknown buyer','unknown@test.test','none',false);
insert into public.annual_licenses(player_id,season_year,source) values(5,2026,'legacy'),(6,2026,'legacy'),(7,2026,'legacy');
-- Historical ledger rows existed before the payment-finalization trigger.
alter table public.payments disable trigger finalize_license_payment;
insert into public.payments(player_id,amount,currency,status,payment_type,payment_method,reference,created_at) values
 (5,450,'ZAR','success','membership','paystack','old-full','2026-03-07T23:30:00Z'),
 (6,450,'ZAR','success','membership','paystack','ambiguous-1','2026-03-01'),
 (6,450,'ZAR','success','membership','paystack','ambiguous-2','2026-04-01');
-- A split child recorded later must retain the original checkout's purchase day.
insert into public.payments(player_id,event_id,amount,currency,status,payment_type,payment_method,reference,metadata,created_at) values
 (2,10,500,'ZAR','success','event_entry_fee','paystack','temp-parent','{"covers":[{"type":"license","license":"temporary","email":"temp@test.test"}]}','2026-02-03T23:00:00Z'),
 (2,10,120,'ZAR','success','temp_license','paystack','temp-split','{"parent_reference":"temp-parent"}','2026-06-01');
update public.temporary_licenses set payment_id=(select id from public.payments where reference='temp-split') where player_id=2 and event_id=10;
alter table public.payments enable trigger finalize_license_payment;
\ir ../../supabase/migrations/20261015103019_license_purchase_dates.sql
select private.assert_purchase((select purchased_on='2026-03-08' from private.license_register where player_id=5),'historical purchase day uses Johannesburg timezone');
select private.assert_purchase((select source='payment' from public.annual_licenses where player_id=5),'unique historical membership evidence linked');
select private.assert_purchase((select purchased_on is null from private.license_register where player_id=6),'ambiguous purchase date remains unknown');
select private.assert_purchase((select count(*)=1 from public.license_audit_log where player_id=6 and action='payment_review'),'ambiguous evidence flagged for review');
select private.assert_purchase((select purchased_on is null from private.license_register where player_id=7),'import timestamp is never presented as purchase date');
select private.assert_purchase((select purchased_on='2026-02-04' from private.license_register where player_id=2 and license_type='temporary'),'split payment uses original checkout day');
select manage_license('grant','{"player_id":1,"year":2027,"source":"complimentary","reason":"Purchase-date test"}');
select private.assert_purchase((select purchased_on is null and granted_on=public.license_today() from private.license_register where player_id=1 and season_year=2027),'complimentary grant has grant date, no purchase date');
select private.assert_purchase((select count(*)=5 from public.payments),'linking evidence creates no revenue');
grant usage on schema auth to authenticated;
set session authorization authenticated;
select count(*) as visible_admin_players from public.players;
reset session authorization;
select private.assert_purchase(has_function_privilege('authenticated','private.managed_event_player_emails()','execute'),'existing RLS helper execute grant retained');
select private.assert_purchase(not has_function_privilege('authenticated','private.finalize_license_payment()','execute'),'license finalizer stays private');
rollback;
