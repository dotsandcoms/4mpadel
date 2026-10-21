-- Imported Full licenses used 1 January even when linked payment evidence
-- identifies their purchase day. Keep that fallback only when the day is unknown.
-- This updates coverage and its audit trail; it never inserts payment revenue.
with corrections as (
 select a.id,a.player_id,a.valid_from as previous_start,p.purchased_on as purchase_day
 from public.annual_licenses a
 join private.license_payment_dates p on p.id=a.payment_id
 where a.season_year=2026 and a.valid_from='2026-01-01'
 and a.source<>'complimentary'
 and p.purchased_on>'2026-01-01' and p.purchased_on<='2026-12-31'
), corrected as (
 update public.annual_licenses a set valid_from=c.purchase_day
 from corrections c where a.id=c.id
 returning a.id,a.player_id,c.previous_start,a.valid_from
)
insert into public.license_audit_log(player_id,license_id,license_type,action,reason,details)
select player_id,id,'full','coverage_start_corrected',
 'Aligned imported 2026 Full-license start with its linked purchase date',
 jsonb_build_object('previous_start',previous_start,'starts_on',valid_from)
from corrected;

notify pgrst, 'reload schema';
