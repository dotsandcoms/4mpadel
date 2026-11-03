-- Preserve the reviewed player/event sales ledger and append its payment evidence.
-- Existing sold dates, duplicate handling and unit counts remain unchanged.
create or replace view private.temporary_license_sales as
with payment_data as (
 select p.*,case when jsonb_typeof(p.metadata->'original_trx'->'metadata')='object' then p.metadata->'original_trx'->'metadata' else '{}'::jsonb end ||
 case when jsonb_typeof(p.metadata)='object' then p.metadata else '{}'::jsonb end as meta
 from public.payments p where p.status in('success','refunded') and coalesce(p.is_test,false)=false and p.amount>0 and coalesce(p.currency,'ZAR')='ZAR'
), covers as (
 select p.*,c.cover,c.ordinal from payment_data p
 cross join lateral (
 select x.value as cover,x.ordinality as ordinal from jsonb_array_elements(case when jsonb_typeof(p.meta->'covers')='array' then p.meta->'covers' else '[]'::jsonb end) with ordinality x
 where x.value->>'type'='license' and lower(x.value->>'license') in('temporary','temp')
 union all
 select jsonb_build_object('player_id',p.player_id),1 where (p.payment_type='temp_license' or p.meta->>'license_type'='temporary')
 and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof(p.meta->'covers')='array' then p.meta->'covers' else '[]'::jsonb end) x where x->>'type'='license' and lower(x->>'license') in('temporary','temp'))
 )c where coalesce(p.meta->>'is_test','false')<>'true'
), attributed as (
 select p.id as payment_id,p.created_at as ledger_created_at,parent.id as parent_id,coalesce(parent.created_at,p.created_at) as sold_at,
 coalesce(case when p.cover->>'player_id' ~ '^[0-9]+$' then (p.cover->>'player_id')::bigint end,
 case when nullif(p.cover->>'email','') is not null then target.id else p.player_id end) as beneficiary_id,
 coalesce(case when p.cover->>'event_id' ~ '^[0-9]+$' then (p.cover->>'event_id')::bigint end,p.event_id,case when p.meta->>'event_id' ~ '^[0-9]+$' then (p.meta->>'event_id')::bigint end) as sale_event_id,
 coalesce(lower(nullif(p.cover->>'email','')),lower(target.email)) as beneficiary_email,
 coalesce(nullif(p.meta->>'parent_reference',''),nullif(p.meta->>'client_reference',''),p.reference,p.id::text) as charge_reference,
 p.ordinal,p.amount,p.payment_type,p.reference,p.payment_method,p.meta,p.cover,
 (p.status='refunded' or exists(select 1 from public.payment_refunds r left join public.event_registrations e on e.id=r.event_registration_id
 where r.payment_id=p.id and r.status='processed' and coalesce(r.metadata->>'cover_type','license')='license'
 and (p.payment_type='temp_license' or p.meta->>'license_type'='temporary' or lower(e.email)=lower(p.cover->>'email')))) as refunded
 from covers p left join public.players target on lower(target.email)=lower(p.cover->>'email')
 left join public.payments parent on parent.reference=p.meta->>'parent_reference'
), verified as (
 select a.* from attributed a where a.ledger_created_at<(select effective_at from private.license_sales_boundary where singleton)
 or exists(select 1 from public.temporary_licenses t where t.player_id=a.beneficiary_id and t.event_id=a.sale_event_id and t.payment_id in(a.payment_id,a.parent_id))
), keyed as (
 select *,coalesce(beneficiary_id::text,'email:'||beneficiary_email,'unknown:'||charge_reference||':'||ordinal::text)||':'||coalesce(sale_event_id::text,'charge:'||charge_reference) as sale_key from verified
), grouped as (
 select *,jsonb_agg(jsonb_build_object('payment_id',payment_id,'amount',amount,'payment_type',payment_type,'reference',reference,'payment_method',payment_method,'meta',meta,'cover',cover,'sold_at',sold_at,'refunded',refunded)) over(partition by sale_key) as sale_evidence,bool_or(refunded) over(partition by sale_key) as has_refund,row_number() over(partition by sale_key order by sold_at,payment_id) as priority from keyed
)
select sale_key,beneficiary_id,sale_event_id,(sold_at at time zone 'Africa/Johannesburg')::date as sold_on,has_refund,beneficiary_id is null or sale_event_id is null as unattributed,sold_at as purchased_at,sale_evidence
from grouped where priority=1;
revoke all on private.temporary_license_sales from public,anon,authenticated;

-- Prices come from recorded license allocations, never today's price settings.
create function private.license_export_number(value text) returns numeric
language sql immutable set search_path='' as $$
 select case when value ~ '^[0-9]+([.][0-9]{1,2})?$' then value::numeric end;
$$;
create function private.license_export_cover_count(meta jsonb) returns integer
language sql immutable set search_path='' as $$
 select greatest(1,count(*)::integer) from jsonb_array_elements(case when jsonb_typeof(meta->'covers')='array' then meta->'covers' else '[]'::jsonb end) c where c->>'type'='license';
$$;
create function private.license_export_price(amount numeric,payment_type text,meta jsonb,cover jsonb)
returns table(price numeric,price_basis text) language sql immutable set search_path='' as $$
 with lines as (
  select item,private.license_export_number(item->>'amount') as value
  from jsonb_array_elements(case when jsonb_typeof(meta->'line_items')='array' then meta->'line_items' else '[]'::jsonb end) item
 ), facts as (
  select private.license_export_number(cover->>'license_amount') as explicit_price,
   private.license_export_cover_count(meta) as units,
   (select count(*) from lines where coalesce(item->>'label','') ~* 'licen[cs]e' or item->>'type'='license') as line_count,
   (select min(value) from lines where coalesce(item->>'label','') ~* 'licen[cs]e' or item->>'type'='license') as line_price,
   (select count(distinct value) from lines where coalesce(item->>'label','') ~* 'licen[cs]e' or item->>'type'='license') as different_prices,
   (select count(*) from lines where ((coalesce(item->>'label','') ~* 'licen[cs]e' or item->>'type'='license') and value is null)) as invalid_lines
 ), candidates as (
  select explicit_price as price,'Recorded license allocation'::text as basis,0 as priority from facts where explicit_price>0 and explicit_price<=amount
  union all select amount,'License payment',1 from facts where payment_type in('full_license','temp_license','membership') and units=1
    and (nullif(meta->>'parent_reference','') is not null or
     (coalesce(meta->>'includes_license','false')<>'true'
      and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof(meta->'covers')='array' then meta->'covers' else '[]'::jsonb end) c where c->>'type'<>'license')
      and not exists(select 1 from lines where item->>'type'='entry_fee' or (coalesce(item->>'label','')<>'' and coalesce(item->>'label','') !~* 'licen[cs]e'))))
  union all select line_price,'Recorded license line item',2 from facts where line_count=units and different_prices=1 and invalid_lines=0 and line_price>0 and line_price*units<=amount
 ) select chosen.price,coalesce(chosen.basis,'License price needs review') from (select 1) seed
 left join lateral (select * from candidates order by priority limit 1) chosen on true;
$$;
revoke all on function private.license_export_number(text),private.license_export_cover_count(jsonb),private.license_export_price(numeric,text,jsonb,jsonb) from public,anon,authenticated,service_role;

create view private.license_federation_sales as
with payments as materialized (
 select p.*,case when jsonb_typeof(p.metadata->'original_trx'->'metadata')='object' then p.metadata->'original_trx'->'metadata' else '{}'::jsonb end ||
  case when jsonb_typeof(p.metadata)='object' then p.metadata else '{}'::jsonb end as meta
 from public.payments p where p.status in('success','refunded') and not coalesce(p.is_test,false) and p.amount>0 and coalesce(p.currency,'ZAR')='ZAR'
), full_sales as (
 select 'full:'||r.id as sale_key,r.purchased_on,coalesce(parent.created_at,p.created_at) as purchased_at,
  r.player_id,r.name,r.email,r.license_number,case when r.is_renewal then 'renewal' else 'new_full' end as kind,
  r.season_year as license_year,r.renewed_from_year,r.starts_on,r.ends_on,r.event_name,r.status as coverage_status,
  price.price,price.price_basis,p.payment_method,p.reference as payment_reference,parent.reference as checkout_reference,
  p.status='refunded' or refund.amount is not null as has_refund,refund.amount as recorded_refund
 from private.license_register r join payments p on p.id=r.payment_id
 left join public.payments parent on parent.reference=p.metadata->>'parent_reference'
 left join lateral (
  select c as cover from jsonb_array_elements(case when jsonb_typeof(p.meta->'covers')='array' then p.meta->'covers' else '[]'::jsonb end) c
  where c->>'type'='license' and (c->>'player_id'=r.player_id::text or lower(c->>'email')=lower(r.email) or private.license_export_cover_count(p.meta)=1)
  order by c::text limit 1
 ) allocation on true
 cross join lateral private.license_export_price(p.amount,p.payment_type,p.meta,allocation.cover) price
 left join lateral (
  select sum(f.amount) as amount from public.payment_refunds f left join public.event_registrations registration on registration.id=f.event_registration_id
  where f.payment_id=p.id and f.status='processed' and coalesce(f.metadata->>'cover_type','license')='license'
   and (private.license_export_cover_count(p.meta)=1 or lower(registration.email)=lower(r.email) or f.metadata->>'player_id'=r.player_id::text)
 ) refund on true
 where r.license_type='full' and r.source<>'complimentary' and r.purchased_on is not null
), temporary_sales as (
 select 'temporary:'||s.sale_key as sale_key,s.sold_on as purchased_on,s.purchased_at,
  s.beneficiary_id as player_id,coalesce(player.name,'Player not matched') as name,
  coalesce(player.email,choice.cover->>'email') as email,
  case when account.serial is not null then '4M-'||lpad(account.serial::text,greatest(6,length(account.serial::text)),'0') end as license_number,
  'temporary'::text as kind,extract(year from event.start_date)::integer as license_year,null::integer as renewed_from_year,
  event.start_date::date as starts_on,coalesce(event.end_date,event.start_date)::date as ends_on,event.event_name::text as event_name,
  coalesce(coverage.status,'Historical sale') as coverage_status,
  choice.price,choice.price_basis,choice.payment_method,choice.reference as payment_reference,
  coalesce(choice.meta->>'parent_reference',choice.meta->>'client_reference',choice.reference) as checkout_reference,
  s.has_refund,refund.amount as recorded_refund
 from private.temporary_license_sales s
 left join public.players player on player.id=s.beneficiary_id
 left join public.license_accounts account on account.player_id=s.beneficiary_id
 left join public.calendar event on event.id=s.sale_event_id
 left join lateral (
  select r.status from private.license_register r where r.license_type='temporary' and r.player_id=s.beneficiary_id and r.event_id=s.sale_event_id
  order by r.created_at desc,r.id limit 1
 ) coverage on true
 left join lateral (
  select evidence.*,price.* from jsonb_to_recordset(s.sale_evidence) as evidence(payment_id uuid,amount numeric,payment_type text,reference text,payment_method text,meta jsonb,cover jsonb,sold_at timestamptz)
  cross join lateral private.license_export_price(evidence.amount,evidence.payment_type,evidence.meta,evidence.cover) price
  where evidence.sold_at=s.purchased_at
  order by (price.price is null), (nullif(evidence.meta->>'parent_reference','') is null),evidence.payment_id limit 1
 ) choice on true
 left join lateral (
  select sum(f.amount) as amount from public.payment_refunds f left join public.event_registrations registration on registration.id=f.event_registration_id
  where f.status='processed' and coalesce(f.metadata->>'cover_type','license')='license' and exists (
   select 1 from jsonb_to_recordset(s.sale_evidence) as e(payment_id uuid,payment_type text,meta jsonb,cover jsonb)
   where e.payment_id=f.payment_id and (
    (e.payment_type='temp_license' and private.license_export_cover_count(e.meta)=1)
    or lower(registration.email)=lower(coalesce(player.email,e.cover->>'email'))
    or f.metadata->>'player_id'=s.beneficiary_id::text
   )
  )
 ) refund on true
), sales as (select * from full_sales union all select * from temporary_sales), reconciled as (
 select *,case when not has_refund then 0::numeric when recorded_refund>0 and (price is null or recorded_refund<=price) then recorded_refund end as refund_amount
 from sales
)
select sale_key,purchased_on,purchased_at,player_id,name,email,license_number,kind,license_year,renewed_from_year,starts_on,ends_on,event_name,coverage_status,
 price,price_basis,payment_method,payment_reference,checkout_reference,has_refund,refund_amount,
 case when price is not null and refund_amount is not null then price-refund_amount end as net_amount,
 concat_ws('; ',case when price is null then 'License price needs review' end,
  case when has_refund and refund_amount is null then 'Refund amount needs review' end,
  case when player_id is null or email is null then 'Player details need review' end,
  case when kind='temporary' and (license_year is null or starts_on is null) then 'Event details need review' end) as review_note
from reconciled;
revoke all on private.license_federation_sales from public,anon,authenticated,service_role;

create function public.license_federation_sales_export(p_from date default null,p_to date default null,p_license_year integer default null,p_type text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_from date;v_to date:=coalesce(p_to,public.license_today());v_result jsonb;v_count integer;
begin
 if not public.can_manage_licenses() then raise exception 'Licenses permission required'; end if;
 if p_license_year is not null and p_license_year not between 2026 and 2200 then raise exception 'Choose a valid license year'; end if;
 if nullif(p_type,'') is not null and p_type not in('full','new_full','renewal','temporary') then raise exception 'Choose a valid license type'; end if;
 select coalesce(p_from,min(purchased_on),v_to) into v_from from private.license_federation_sales;
 if v_to<v_from then raise exception 'The end date must be on or after the start date'; end if;
 if v_to-v_from>36600 then raise exception 'Choose a date range of 100 years or less'; end if;
 with scoped as materialized (
  select * from private.license_federation_sales where purchased_on between v_from and v_to
   and (p_license_year is null or license_year=p_license_year)
   and (nullif(p_type,'') is null or kind=p_type or (p_type='full' and kind in('new_full','renewal')))
 )
 select count(*),jsonb_build_object('from',v_from,'to',v_to,'license_year',p_license_year,'type',nullif(p_type,''),
  'currency','ZAR','time_zone','Africa/Johannesburg','generated_at',now(),'total_sold',count(*),
  'priced_sales',count(price),'gross_amount',coalesce(sum(price),0),'refund_amount',coalesce(sum(refund_amount),0),
  'net_amount',coalesce(sum(net_amount),0),'review_count',count(*) filter(where review_note<>''),
  'rows',coalesce(jsonb_agg(to_jsonb(scoped) order by purchased_at,sale_key),'[]'::jsonb))
 into v_count,v_result from scoped;
 if v_count>50000 then raise exception 'More than 50,000 sales match. Choose a shorter date range'; end if;
 return v_result;
end $$;
revoke all on function public.license_federation_sales_export(date,date,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.license_federation_sales_export(date,date,integer,text) to authenticated;
comment on function public.license_federation_sales_export(date,date,integer,text) is
 'License-admin-only federation Excel data: one verified paid license per row, actual license allocation prices, original purchase timestamps and explicit refund/price review flags. No event checkout totals or current-price estimates.';
notify pgrst,'reload schema';

