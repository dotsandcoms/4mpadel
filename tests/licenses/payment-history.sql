begin;
create function private.assert_history(v boolean,msg text) returns void language plpgsql as $$begin if v is distinct from true then raise exception 'FAIL: %',msg;end if;end$$;
set test.uid='00000000-0000-0000-0000-000000000001';set test.email='admin@test.test';set test.role='authenticated';
alter table public.payments disable trigger finalize_license_payment;
insert into public.payments(player_id,amount,currency,status,payment_type,payment_method,reference,created_at) values
 (1,450,'ZAR','success','membership','paystack','historical-membership-1','2026-04-06T17:35:56Z'),
 (1,450,'ZAR','success','membership','paystack','historical-membership-2','2026-04-06T17:35:59Z'),
 (1,120,'ZAR','failed','temp_license','paystack','failed-license','2026-05-01'),
 (1,350,'ZAR','success','event_entry_fee','paystack','entry-only','2026-05-01'),
 (3,450,'ZAR','success','membership','paystack','other-player-license','2026-05-01');
insert into public.payments(player_id,event_id,amount,currency,status,payment_type,payment_method,reference,metadata) values
 (3,10,590,'ZAR','success','event_entry_fee','paystack','paid-for-target','{"covers":[{"type":"license","license":"temporary","email":"full@test.test"}]}');
alter table public.payments enable trigger finalize_license_payment;
select private.assert_history(jsonb_array_length(get_player_licenses(1)->'payments')=4,'show both unlinked historical payments, failed license and a beneficiary checkout');
select private.assert_history((select count(*)=2 from jsonb_array_elements(get_player_licenses(1)->'payments') p where p->>'reference' like 'historical-membership-%'),'ambiguous historical records are visible');
select private.assert_history((select bool_and(not(p->>'linked')::boolean) from jsonb_array_elements(get_player_licenses(1)->'payments') p where p->>'reference' like 'historical-membership-%'),'unlinked evidence is labelled honestly');
grant usage on schema auth to authenticated;
set session authorization authenticated;set test.email='full@test.test';
select get_player_licenses(1)->>'name' as own_history;
do $$begin begin perform get_player_licenses(3);raise exception 'another player payment history leaked';exception when raise_exception then if sqlerrm='another player payment history leaked' then raise;end if;end;end$$;
reset session authorization;
select private.assert_history(not has_function_privilege('authenticated','private.player_license_payment_history(bigint)','execute'),'private payment-history helper is not directly callable');
rollback;
