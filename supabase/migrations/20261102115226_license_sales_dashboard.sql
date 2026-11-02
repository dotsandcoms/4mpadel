-- Read-only admin analytics. Sales use purchase dates, not coverage years or
-- import timestamps. Reuse the reviewed player/event temporary-sale ledger.
-- Future event coverage is upcoming, consistently across the register, its
-- status filters/counts, and the player detail panel.
create or replace view private.license_register as
with temporary_sales as materialized (select beneficiary_id,sale_event_id,sold_on from private.temporary_license_sales)
select a.id,a.player_id,p.name,p.email,
 '4M-'||lpad(ac.serial::text,greatest(6,length(ac.serial::text)),'0') as license_number,
 'full'::text as license_type,a.season_year,a.valid_from as starts_on,make_date(a.season_year,12,31) as ends_on,
 case when a.revoked_at is not null then 'revoked' when public.license_today()<a.valid_from then 'upcoming'
  when public.license_today()>make_date(a.season_year,12,31) then 'expired' else 'active' end as status,
 a.source,a.payment_id,a.created_at,null::bigint as event_id,null::text as event_name,
 pay.purchased_on,case when a.source='complimentary' then (a.created_at at time zone 'Africa/Johannesburg')::date end as granted_on
from public.annual_licenses a join public.players p on p.id=a.player_id join public.license_accounts ac on ac.player_id=p.id
left join private.license_payment_dates pay on pay.id=a.payment_id
union all
select t.id,t.player_id,p.name,p.email,
 '4M-'||lpad(ac.serial::text,greatest(6,length(ac.serial::text)),'0'),'temporary',extract(year from c.start_date)::integer,c.start_date::date,
 coalesce(c.end_date,c.start_date)::date,
 case when t.revoked_at is not null then 'revoked' when coalesce(c.end_date,c.start_date)::date<public.license_today() then 'expired'
  when c.start_date::date>public.license_today() then 'upcoming' else 'active' end,
 t.source,t.payment_id,t.created_at,t.event_id,t.event_name::text,
 case when t.source<>'complimentary' then coalesce(pay.purchased_on,s.sold_on) end,
 case when t.source='complimentary' then (t.created_at at time zone 'Africa/Johannesburg')::date end
from public.temporary_licenses t join public.players p on p.id=t.player_id join public.license_accounts ac on ac.player_id=p.id
left join public.calendar c on c.id=t.event_id left join private.license_payment_dates pay on pay.id=t.payment_id
left join temporary_sales s on s.beneficiary_id=t.player_id and s.sale_event_id=t.event_id;
revoke all on private.license_register from public,anon,authenticated;

create function public.license_sales_overview(p_year integer default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
 if not public.can_manage_licenses() then raise exception 'Licenses permission required'; end if;
 if p_year is not null and p_year not between 2026 and 2200 then raise exception 'Choose a valid sales year'; end if;

 with annual as materialized (
  select r.id,r.player_id,r.season_year,r.purchased_on as sold_on,
   -- A renewal is a paid Full license for a previous Full holder. Check the
   -- previous license at issuance, so a later revocation does not rewrite sales.
   exists(select 1 from public.annual_licenses previous
    where previous.player_id=a.player_id and previous.season_year<a.season_year
    and previous.created_at<=a.created_at
    and (previous.revoked_at is null or previous.revoked_at>a.created_at)) as renewal,
   (p.status='refunded' or exists(select 1 from public.payment_refunds f
    where f.payment_id=p.id and f.status='processed'
    and coalesce(f.metadata->>'cover_type','license')='license')) as has_refund
  from private.license_register r join public.annual_licenses a on a.id=r.id
  join public.payments p on p.id=r.payment_id
  where r.license_type='full' and r.source<>'complimentary' and r.purchased_on is not null
   and p.status in('success','refunded') and not coalesce(p.is_test,false)
   and p.amount>0 and coalesce(p.currency,'ZAR')='ZAR'
 ), sales as materialized (
  select sold_on,case when renewal then 'renewal' else 'new_full' end as kind,has_refund from annual
  union all select sold_on,'temporary',has_refund from private.temporary_license_sales
 ), bounds as (
  select coalesce(make_date(p_year,1,1),least(min(sold_on),public.license_today()),public.license_today()) as first_day,
   case when p_year is null then public.license_today()
    when p_year=extract(year from public.license_today())::integer then public.license_today()
    else make_date(p_year,12,31) end as last_day from sales
 ), scoped as materialized (
  select s.* from sales s cross join bounds b where s.sold_on between b.first_day and b.last_day
 ), months as (
  select generate_series(date_trunc('month',first_day::timestamp),date_trunc('month',last_day::timestamp),interval '1 month')::date as month from bounds
 ), monthly as (
  select m.month,count(s.kind) filter(where s.kind='new_full') as new_full,
   count(s.kind) filter(where s.kind='renewal') as renewals,
   count(s.kind) filter(where s.kind='temporary') as temporary,
   count(s.kind) as total,count(s.kind) filter(where s.has_refund) as refunded
  from months m left join scoped s on date_trunc('month',s.sold_on)::date=m.month group by m.month
 ), season_totals as (
  select a.season_year,count(*) as full_issued,
   count(s.id) filter(where not s.renewal) as new_full,
   count(s.id) filter(where s.renewal) as renewals,
   count(*) filter(where a.source='complimentary') as complimentary,
   count(*) filter(where a.source<>'complimentary' and s.id is null) as unverified
  from public.annual_licenses a left join annual s on s.id=a.id group by a.season_year
 )
 select jsonb_build_object(
  'year',p_year,'from',b.first_day,'to',b.last_day,
  'total_sold',(select count(*) from scoped),
  'new_full',(select count(*) from scoped where kind='new_full'),
  'renewals',(select count(*) from scoped where kind='renewal'),
  'full_sold',(select count(*) from scoped where kind in('new_full','renewal')),
  'temporary',(select count(*) from scoped where kind='temporary'),
  'refunded',(select count(*) from scoped where has_refund),
  'all_time_temporary',(select count(*) from private.temporary_license_sales),
  'all_time_full',(select count(*) from annual),
  'complimentary',(select count(*) from private.license_register r where r.source='complimentary'
   and r.granted_on between b.first_day and b.last_day),
  'unverified_full',(select count(*) from public.annual_licenses a where a.source<>'complimentary'
   and not exists(select 1 from annual s where s.id=a.id) and (p_year is null or a.season_year=p_year)),
  'series',coalesce((select jsonb_agg(to_jsonb(m) order by m.month) from monthly m),'[]'::jsonb),
  'seasons',coalesce((select jsonb_agg(to_jsonb(s) order by s.season_year desc) from season_totals s),'[]'::jsonb)
 ) into v_result from bounds b;
 return v_result;
end $$;
revoke all on function public.license_sales_overview(integer) from public,anon,authenticated,service_role;
grant execute on function public.license_sales_overview(integer) to authenticated;
comment on function public.license_sales_overview(integer) is
 'License-admin-only gross unit sales by purchase year. Full renewals are paid licenses for previous Full holders; temporary sales reuse the deduplicated player/event ledger. Refunds remain in gross sales. No checkout amounts are summed.';

-- Expose the existing split relationship, rather than asking the UI to infer
-- whether a parent row is a whole charge or the reduced event-entry portion.
-- This helper remains private and is called only by get_player_licenses after
-- its existing owner/license-admin permission check.
create or replace function private.player_license_payment_history(p_player_id bigint) returns jsonb
language sql stable security definer set search_path='' as $$
with target as (select id,email from public.players where id=p_player_id),
payment_data as materialized (
 select p.*,case when jsonb_typeof(p.metadata->'original_trx'->'metadata')='object' then p.metadata->'original_trx'->'metadata' else '{}'::jsonb end || coalesce(p.metadata,'{}'::jsonb) as meta
 from public.payments p
), relevant as (
 select p.id from payment_data p cross join target t
 where exists(select 1 from private.license_register r where r.player_id=p_player_id and r.payment_id=p.id)
 or (p.player_id=t.id and (p.payment_type in('membership','full_license','temp_license') or p.meta->>'license_type' in('full','temporary')))
 or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(p.meta->'covers')='array' then p.meta->'covers' else '[]'::jsonb end) x
  where x->>'type'='license' and (lower(x->>'email')=lower(t.email) or x->>'player_id'=t.id::text))
), included as (
 select p.* from payment_data p where p.id in(select id from relevant)
 or exists(select 1 from payment_data child join relevant r on r.id=child.id where child.meta->>'parent_reference'=p.reference)
), history as (
 select p.*,parent.created_at as parent_created_at,c.event_name,
 exists(select 1 from private.license_register r where r.player_id=p_player_id and r.payment_id in(p.id,parent.id)) as linked,
 p.payment_type not in('membership','full_license','temp_license') as bundled,
 case when p.meta->>'split_recorded'='true' then p.amount+coalesce((
  select sum(child.amount) from payment_data child where child.meta->>'parent_reference'=p.reference
   and coalesce(child.currency,'ZAR')=coalesce(p.currency,'ZAR')
   and coalesce(child.is_test,false)=coalesce(p.is_test,false)
 ),0) else p.amount end as checkout_amount
 from included p left join public.payments parent on parent.reference=p.meta->>'parent_reference'
 left join public.calendar c on c.id=p.event_id
)
select coalesce(jsonb_agg(jsonb_build_object(
 'id',id,'amount',amount,'currency',coalesce(currency,'ZAR'),'reference',reference,
 'payment_method',payment_method,'status',status,'payment_type',payment_type,
 'created_at',coalesce(parent_created_at,created_at),'recorded_at',created_at,
 'event_name',event_name,'linked',linked,'bundled',bundled,'is_test',coalesce(is_test,false),
 'parent_reference',meta->>'parent_reference','split_recorded',coalesce(meta->>'split_recorded','false')='true',
 'checkout_amount',checkout_amount,
 'license_year',case when meta->>'license_year' ~ '^[0-9]{4}$' then (meta->>'license_year')::integer end
) order by coalesce(parent_created_at,created_at) desc,id),'[]'::jsonb) from history;
$$;
revoke all on function private.player_license_payment_history(bigint) from public,anon,authenticated,service_role;
notify pgrst, 'reload schema';
