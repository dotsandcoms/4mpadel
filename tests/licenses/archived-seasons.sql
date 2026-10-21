begin;
create function private.assert_archive(v boolean,msg text) returns void language plpgsql as $$begin if v is distinct from true then raise exception 'FAIL: %',msg;end if;end$$;
set test.uid='00000000-0000-0000-0000-000000000001';
set test.email='admin@test.test';set test.role='service_role';
create temp table archive_before as select
 (select count(*) from public.annual_licenses) annual,
 (select count(*) from public.temporary_licenses) temporary,
 (select count(*) from public.license_accounts) accounts,
 (select count(*) from public.payments) payments,
 (select coalesce(sum(amount),0) from public.payments) total;
update public.license_seasons set sales_open=true where year=2026;
select public.manage_license('archive_season','{"year":2026,"reason":"Only offer 2027 licenses"}');
select private.assert_archive((select archived_at is not null and not sales_open from public.license_seasons where year=2026),'archive closes sales');
select private.assert_archive((select action='archive_season' and actor_email='admin@test.test' and details->>'year'='2026' and details->'previous'->>'sales_open'='true' from public.license_audit_log order by id desc limit 1),'archive attributed and audited');
select private.assert_archive(public.has_full_license(1,2026),'existing coverage stays valid');
select private.assert_archive(private.full_license_renewal(1,2027),'renewal discount retained');
select private.assert_archive((public.full_license_quote(3,2026)->>'sales_open')::boolean=false,'archived year cannot sell through quote');
select private.assert_archive((public.player_license_eligibility(3,10)->>'purchase_year') is null,'event checkout cannot select archived year');
select private.assert_archive((select count(*) from private.license_register where season_year=2026)>0,'historical register intact');
select private.assert_archive((select count(*) from public.annual_licenses)=annual and (select count(*) from public.temporary_licenses)=temporary and (select count(*) from public.license_accounts)=accounts and (select count(*) from public.payments)=payments and (select coalesce(sum(amount),0) from public.payments)=total,'archive preserves all licenses and financial records') from archive_before;
-- Old clients also stop seeing the offering through RLS.
set local role anon;
do $$begin if exists(select 1 from public.license_seasons where year=2026) then raise exception 'FAIL: removed year visible anonymously';end if;end$$;
reset role;
set test.email='new@test.test';
set local role authenticated;
do $$begin if exists(select 1 from public.license_seasons where year=2026) then raise exception 'FAIL: removed year visible to player';end if;end$$;
do $$begin
 begin perform public.manage_license('restore_season','{"year":2026,"reason":"unauthorized"}'); raise exception 'FAIL: player can restore';
 exception when others then if sqlerrm not like '%Licenses permission required%' then raise;end if;end;
end$$;
reset role;
set test.email='admin@test.test';
set local role authenticated;
do $$begin if not exists(select 1 from public.license_seasons where year=2026) then raise exception 'FAIL: manager cannot see removed seasons';end if;end$$;
reset role;
do $$begin
 begin perform public.manage_license('restore_season','{"year":2026,"reason":" "}'); raise exception 'FAIL: missing reason accepted';
 exception when others then if sqlerrm not like '%Enter a reason%' then raise;end if;end;
 begin perform public.manage_license('archive_season','{"year":2099,"reason":"not configured"}'); raise exception 'FAIL: missing year accepted';
 exception when others then if sqlerrm not like '%License year not found%' then raise;end if;end;
 begin perform public.manage_license('save_season','{"year":2026,"price":450,"sales_open":true,"reason":"reopen removed year"}'); raise exception 'FAIL: removed year reopened';
 exception when others then if sqlerrm not like '%Restore this year%' then raise;end if;end;
 begin perform public.manage_license('grant','{"player_id":3,"year":2026,"source":"complimentary","reason":"removed year"}'); raise exception 'FAIL: grant for removed year';
 exception when others then if sqlerrm not like '%no longer offered%' then raise;end if;end;
 begin perform public.manage_license('grant','{"player_id":3,"year":2026,"source":"manual","amount":450,"payment_method":"eft","reason":"removed year"}'); raise exception 'FAIL: payment for removed year';
 exception when others then if sqlerrm not like '%no longer offered%' then raise;end if;end;
 begin update public.license_seasons set sales_open=true where year=2026;raise exception 'FAIL: archived season bypassed closed-sales constraint';exception when check_violation then null;end;
end$$;
select public.manage_license('restore_season','{"year":2026,"reason":"Restore offering for review"}');
select private.assert_archive((select archived_at is null and not sales_open and price=450 and renewal_price=450 from public.license_seasons where year=2026),'restore preserves prices and leaves sales closed');
select public.manage_license('save_season','{"year":2028,"price":650,"renewal_price":500,"sales_open":false,"reason":"Configure new year"}');
select private.assert_archive((select archived_at is null and not sales_open from public.license_seasons where year=2028),'new years start offered but closed');
rollback;
