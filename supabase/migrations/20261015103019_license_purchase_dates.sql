-- Purchase dates come from payment evidence, never the legacy import timestamp.
-- Use the original checkout date for ledger splits created retrospectively.
-- The original checkout called R450 Full-license charges "membership". Link
-- only an exact player match with one successful 2026 standalone charge.
with candidates as (
 select a.id,p.id as payment_id,count(*) over(partition by a.id) as matches
 from public.annual_licenses a join public.payments p on p.player_id=a.player_id
 where a.season_year=2026 and a.source='legacy' and a.payment_id is null
 and p.status='success' and coalesce(p.is_test,false)=false
 and coalesce(p.currency,'ZAR')='ZAR' and p.payment_type='membership' and p.amount=450
 and not(p.metadata ? 'covers')
 and p.created_at>='2026-01-01T00:00:00+02:00' and p.created_at<'2027-01-01T00:00:00+02:00'
), linked as (
 update public.annual_licenses a set payment_id=c.payment_id,source='payment'
 from candidates c where c.id=a.id and c.matches=1 returning a.*
)
insert into public.license_audit_log(player_id,license_id,license_type,action,reason,details)
select player_id,id,'full','payment_link','Matched a single historical R450 Full-license membership payment',jsonb_build_object('payment_id',payment_id) from linked;

insert into public.license_audit_log(player_id,license_id,license_type,action,reason,details)
select a.player_id,a.id,'full','payment_review','Multiple historical membership payments require administrator review',jsonb_build_object('payment_ids',jsonb_agg(p.id))
from public.annual_licenses a join public.payments p on p.player_id=a.player_id
where a.season_year=2026 and a.source='legacy' and a.payment_id is null
and p.status='success' and coalesce(p.is_test,false)=false and coalesce(p.currency,'ZAR')='ZAR'
and p.payment_type='membership' and p.amount=450 and not(p.metadata ? 'covers')
and p.created_at>='2026-01-01T00:00:00+02:00' and p.created_at<'2027-01-01T00:00:00+02:00'
group by a.id,a.player_id having count(*)>1;

create view private.license_payment_dates as
select p.id, (coalesce(parent.created_at,p.created_at) at time zone 'Africa/Johannesburg')::date as purchased_on
from public.payments p
left join public.payments parent on parent.reference=p.metadata->>'parent_reference'
where p.status in ('success','refunded') and coalesce(p.is_test,false)=false
and p.amount>0 and coalesce(p.currency,'ZAR')='ZAR';
revoke all on private.license_payment_dates from public,anon,authenticated;

create or replace view private.license_register as
with temporary_sales as materialized (select beneficiary_id,sale_event_id,sold_on from private.temporary_license_sales)
select a.id,a.player_id,p.name,p.email,
 '4M-'||lpad(ac.serial::text,greatest(6,length(ac.serial::text)),'0') as license_number,
 'full'::text as license_type,a.season_year,make_date(a.season_year,1,1) as starts_on,make_date(a.season_year,12,31) as ends_on,
 case when a.revoked_at is not null then 'revoked' when public.license_today()<make_date(a.season_year,1,1) then 'upcoming' when public.license_today()>make_date(a.season_year,12,31) then 'expired' else 'active' end as status,
 a.source,a.payment_id,a.created_at,null::bigint as event_id,null::text as event_name,
 pay.purchased_on,
 case when a.source='complimentary' then (a.created_at at time zone 'Africa/Johannesburg')::date end as granted_on
from public.annual_licenses a
join public.players p on p.id=a.player_id join public.license_accounts ac on ac.player_id=p.id
left join private.license_payment_dates pay on pay.id=a.payment_id
union all
select t.id,t.player_id,p.name,p.email,
 '4M-'||lpad(ac.serial::text,greatest(6,length(ac.serial::text)),'0'),'temporary',extract(year from c.start_date)::integer,c.start_date::date,
 coalesce(c.end_date,c.start_date)::date,
 case when t.revoked_at is not null then 'revoked' when coalesce(c.end_date,c.start_date)::date<public.license_today() then 'expired' else 'active' end,
 t.source,t.payment_id,t.created_at,t.event_id,t.event_name::text,
 case when t.source<>'complimentary' then coalesce(pay.purchased_on,s.sold_on) end,
 case when t.source='complimentary' then (t.created_at at time zone 'Africa/Johannesburg')::date end
from public.temporary_licenses t
join public.players p on p.id=t.player_id join public.license_accounts ac on ac.player_id=p.id
left join public.calendar c on c.id=t.event_id
left join private.license_payment_dates pay on pay.id=t.payment_id
left join temporary_sales s on s.beneficiary_id=t.player_id and s.sale_event_id=t.event_id;
revoke all on private.license_register from public,anon,authenticated;
notify pgrst, 'reload schema';
