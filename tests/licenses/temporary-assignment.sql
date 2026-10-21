-- Run only in the isolated license fixture database, after migrations through 20261015105729.
begin;
create function private.assert_temp_assignment(v boolean,msg text) returns void language plpgsql as $$begin if v is distinct from true then raise exception 'FAIL: %',msg;end if;end$$;
create or replace function public.license_today() returns date language sql stable set search_path='' as $$select '2026-10-19'::date$$;
insert into public.players values(4,'Manual payment fixture','manual@test.test','none',false);
grant usage on schema auth to authenticated;
set test.uid='00000000-0000-0000-0000-000000000001';
set test.email='admin@test.test';
set test.role='authenticated';
set session authorization authenticated;

-- Reproduce the screenshot: even an administrator cannot write the table directly.
do $$begin
 begin
  insert into public.temporary_licenses(player_id,event_id,event_name,event_date) values(3,10,'2026 event','2026-11-03');
  raise exception 'Direct license insert was accepted';
 exception when insufficient_privilege then null; end;
end$$;

-- The exact client RPC succeeds with the same authenticated database role.
select public.manage_license('grant','{"player_id":3,"event_id":10,"license_type":"temporary","source":"complimentary","reason":"Event volunteer"}');
select public.manage_license('grant','{"player_id":1,"event_id":10,"license_type":"temporary","source":"complimentary","reason":"Existing Full holder fixture"}');
select public.manage_license('grant','{"player_id":4,"event_id":11,"license_type":"temporary","source":"manual","amount":120,"payment_method":"eft","receipt":"BANK-42","reason":"EFT received"}');
reset session authorization;

select private.assert_temp_assignment((select count(*)=1 from public.temporary_licenses where player_id=3 and event_id=10 and source='complimentary' and revoked_at is null),'complimentary assignment saved once');
select private.assert_temp_assignment((select license_type='temporary' and paid_registration from public.players where id=3),'database projects temporary coverage');
select private.assert_temp_assignment((select license_type='full' and paid_registration from public.players where id=1),'Full coverage is preserved');
select private.assert_temp_assignment((select count(*)=1 from public.payments),'only the manual assignment records a payment');
select private.assert_temp_assignment(exists(select 1 from public.temporary_licenses t join public.payments p on p.id=t.payment_id where t.player_id=4 and t.event_id=11 and t.source='manual' and p.amount=120 and p.status='success' and p.payment_method='eft' and p.metadata->>'receipt'='BANK-42'),'manual payment and coverage are linked atomically');
select private.assert_temp_assignment(exists(select 1 from public.license_audit_log where player_id=3 and action='grant' and actor_email='admin@test.test' and reason='Event volunteer'),'assignment is attributed and audited');

set session authorization authenticated;
do $$begin
 begin
  perform public.manage_license('grant','{"player_id":4,"event_id":11,"license_type":"temporary","source":"manual","amount":120,"payment_method":"eft","reason":"Duplicate"}');
  raise exception 'Duplicate assignment accepted';
 exception when raise_exception then if sqlerrm <> 'Event license already exists; restore it if revoked' then raise;end if;end;
end$$;
reset session authorization;
select private.assert_temp_assignment((select count(*)=1 from public.payments),'duplicate cannot record another payment');
update public.temporary_licenses set revoked_at=now() where player_id=3 and event_id=10;
set session authorization authenticated;
do $$begin
 begin
  perform public.manage_license('grant','{"player_id":3,"event_id":10,"license_type":"temporary","source":"complimentary","reason":"Do not restore implicitly"}');
  raise exception 'Revoked assignment restored implicitly';
 exception when raise_exception then if sqlerrm <> 'Event license already exists; restore it if revoked' then raise;end if;end;
end$$;

set test.email='new@test.test';
do $$begin
 begin
  perform public.manage_license('grant','{"player_id":3,"event_id":11,"license_type":"temporary","source":"complimentary","reason":"Unauthorized assignment"}');
  raise exception 'Unauthorized assignment accepted';
 exception when raise_exception then if sqlerrm <> 'Licenses permission required' then raise;end if;end;
end$$;
reset session authorization;
select private.assert_temp_assignment(not exists(select 1 from public.temporary_licenses where player_id=3 and event_id=11),'unauthorized assignment creates no coverage');
select private.assert_temp_assignment((select revoked_at is not null from public.temporary_licenses where player_id=3 and event_id=10),'revoked history stays revoked');
select private.assert_temp_assignment(not exists(select 1 from public.license_seasons where sales_open),'Full sales remain closed');
rollback;
