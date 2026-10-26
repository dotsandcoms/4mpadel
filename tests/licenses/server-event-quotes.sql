begin;
create function private.assert_event_quote(v boolean,msg text) returns void language plpgsql as $$begin if v is distinct from true then raise exception 'FAIL: %',msg;end if;end$$;
set test.uid='00000000-0000-0000-0000-000000000001';set test.email='admin@test.test';set test.role='service_role';
insert into public.players values(4,'Quoted buyer','quote@test.test','none',false),(5,'Changed quote','changed@test.test','none',false);
update public.license_seasons set price=650,sales_open=true where year=2027;
insert into public.payments(player_id,event_id,amount,currency,status,payment_type,payment_method,reference,metadata) values
 (4,10,1000,'ZAR','processing','event_entry_fee','paystack','MOBILE-saved-fixture','{"source":"manual_event","covers":[{"type":"license","license":"full","license_year":2027,"email":"quote@test.test","license_amount":650}]}'),
 (5,10,1000,'ZAR','processing','event_entry_fee','paystack','MOBILE-changed-fixture','{"source":"manual_event","covers":[{"type":"license","license":"full","license_year":2027,"email":"changed@test.test","license_amount":650}]}');
update public.license_seasons set price=1100,sales_open=false where year=2027;
update public.payments set status='success' where reference='MOBILE-saved-fixture';
select private.assert_event_quote(has_full_license(4,2026) and has_full_license(4,2027),'verified saved event quote survives later price and sales changes');
update public.payments set status='success' where reference='MOBILE-saved-fixture';
select private.assert_event_quote((select count(*)=1 from public.annual_licenses where player_id=4),'saved quote replay creates no duplicate');
update public.payments set amount=1,status='success' where reference='MOBILE-changed-fixture';
select private.assert_event_quote(not has_full_license(5,2027),'changed saved quote never activates coverage');
select private.assert_event_quote(exists(select 1 from public.license_audit_log where player_id=5 and action='payment_review'),'changed saved quote flagged for review');
rollback;
