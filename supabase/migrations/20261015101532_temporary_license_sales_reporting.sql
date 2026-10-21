-- Temporary legacy checkouts remain supported by verified server payments with an explicit event.
-- Annual purchases always require a server-owned year snapshot.
do $$declare v_sql text;begin
 select pg_get_functiondef('private.finalize_license_payment()'::regprocedure) into v_sql;
 v_sql:=replace(v_sql,'if v_saved.reference is null and new.payment_method=''paystack'' and new.created_at>=','if v_type=''full'' and v_saved.reference is null and new.payment_method=''paystack'' and new.created_at>=');
 v_sql:=replace(v_sql,' if v_id is not null then insert into public.license_audit_log',
 ' if v_type=''temporary'' and v_event is not null then update public.temporary_licenses set payment_id=new.id,source=case when source=''legacy'' then ''payment'' else source end where player_id=v_player and event_id=v_event and revoked_at is null and payment_id is null;end if;
 if v_id is not null then insert into public.license_audit_log');
 execute v_sql;
end $$;
-- Retire old service-side direct inserts as well as client-side grant shortcuts.
-- Paid grants must originate in the payment finalizer; complimentary grants use the permissioned admin RPC.
create or replace function private.guard_paid_license_issue() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if coalesce(auth.role(),'')='service_role' and new.payment_id is null then raise exception 'License issuance requires a verified payment record';end if;
 return new;
end $$;
create trigger guard_paid_temporary_license before insert on public.temporary_licenses for each row execute function private.guard_paid_license_issue();
create trigger guard_paid_annual_license before insert on public.annual_licenses for each row execute function private.guard_paid_license_issue();
revoke all on function private.guard_paid_license_issue() from public,anon,authenticated;

-- Freeze the historical ledger boundary. Future sales require a canonical payment link.
create table private.license_sales_boundary(singleton boolean primary key default true check(singleton),effective_at timestamptz not null default clock_timestamp());
insert into private.license_sales_boundary(singleton) values(true);
alter table private.license_sales_boundary enable row level security;
revoke all on private.license_sales_boundary from public,anon,authenticated;

-- Paid temporary licenses are individual player/event units, not division entries.
-- A split child and its parent checkout must not both count as a sale.
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
 p.ordinal,
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
 select *,bool_or(refunded) over(partition by sale_key) as has_refund,row_number() over(partition by sale_key order by sold_at,payment_id) as priority from keyed
)
select sale_key,beneficiary_id,sale_event_id,(sold_at at time zone 'Africa/Johannesburg')::date as sold_on,has_refund,beneficiary_id is null or sale_event_id is null as unattributed
from grouped where priority=1;
revoke all on private.temporary_license_sales from public,anon,authenticated;

create or replace function public.temporary_license_sales_report(p_from date default null,p_to date default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_start date;v_end date:=coalesce(p_to,public.license_today());v_result jsonb;
begin
 if not public.can_manage_licenses() then raise exception 'Licenses permission required';end if;
 select coalesce(p_from,min(sold_on),make_date(extract(year from public.license_today())::integer,1,1)) into v_start from private.temporary_license_sales;
 if v_end<v_start then raise exception 'The end date must be on or after the start date';end if;
 if v_end-v_start>36600 then raise exception 'Choose a date range of 100 years or less';end if;
 with sales as materialized(select * from private.temporary_license_sales),
 months as(select generate_series(date_trunc('month',v_start::timestamp),date_trunc('month',v_end::timestamp),interval '1 month')::date as month),
 monthly as(select m.month,
 (select count(*) from sales s where s.sold_on between v_start and v_end and date_trunc('month',s.sold_on)::date=m.month) as sold,
 (select count(*) from sales s where s.sold_on<=least(v_end,(m.month+interval '1 month - 1 day')::date)) as cumulative,
 (select count(*) from sales s where s.sold_on between v_start and v_end and date_trunc('month',s.sold_on)::date=m.month and s.has_refund) as refunded,
 (select count(distinct(t.player_id,t.event_id)) from public.temporary_licenses t where t.source='complimentary' and (t.created_at at time zone 'Africa/Johannesburg')::date between v_start and v_end and date_trunc('month',t.created_at at time zone 'Africa/Johannesburg')::date=m.month) as complimentary
 from months m)
 select jsonb_build_object('from',v_start,'to',v_end,
 'all_time_sold',(select count(*) from sales),
 'sold',(select count(*) from sales where sold_on between v_start and v_end),
 'refunded',(select count(*) from sales where sold_on between v_start and v_end and has_refund),
 'unattributed',(select count(*) from sales where sold_on between v_start and v_end and unattributed),
 'complimentary',(select count(distinct(t.player_id,t.event_id)) from public.temporary_licenses t where t.source='complimentary' and (t.created_at at time zone 'Africa/Johannesburg')::date between v_start and v_end),
 'legacy_without_payment',(select count(distinct(t.player_id,t.event_id)) from public.temporary_licenses t where t.source='legacy' and not exists(select 1 from sales s where s.beneficiary_id=t.player_id and s.sale_event_id=t.event_id)),
 'series',coalesce((select jsonb_agg(to_jsonb(m) order by month) from monthly m),'[]'::jsonb)) into v_result;
 return v_result;
end $$;
revoke all on function public.temporary_license_sales_report(date,date) from public;
grant execute on function public.temporary_license_sales_report(date,date) to authenticated;
