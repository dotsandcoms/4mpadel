-- License year and purchase year are independent. An early 2027 purchase made
-- in 2026 belongs to the 2027 license cohort and the 2026 purchase-year report.
-- Preserve all existing private projection columns and append renewal origin.
do $$declare definition text;
begin
 select pg_get_viewdef('private.license_register'::regclass,true) into definition;
 execute 'create or replace view private.license_register as select r.*,
  case when r.is_renewal then (select max(previous.season_year)
   from public.annual_licenses previous where previous.player_id=r.player_id
   and previous.season_year<r.season_year and previous.created_at<=r.created_at
   and (previous.revoked_at is null or previous.revoked_at>r.created_at)) end as renewed_from_year
  from ('||rtrim(definition,E';\n ')||') r';
end $$;
revoke all on private.license_register from public,anon,authenticated;

create function private.full_license_year_report() returns jsonb
language sql stable security definer set search_path='' as $$
with licenses as materialized (
 select r.*,(r.source<>'complimentary' and r.purchased_on is not null
  and p.status in('success','refunded') and not coalesce(p.is_test,false)
  and p.amount>0 and coalesce(p.currency,'ZAR')='ZAR') is true as paid
 from private.license_register r left join public.payments p on p.id=r.payment_id
 where r.license_type='full'
), purchases as (
 select season_year,extract(year from purchased_on)::integer as purchase_year,
  count(*) filter(where not is_renewal) as new_full,
  count(*) filter(where is_renewal and renewed_from_year=season_year-1) as renewals_from_previous_year,
  count(*) filter(where is_renewal and renewed_from_year<>season_year-1) as other_renewals,
  count(*) as total_sold
 from licenses where paid group by season_year,extract(year from purchased_on)
), years as (
 select s.year as license_year,s.coverage_starts_on,make_date(s.year,12,31) as ends_on,
  count(r.id) as issued,
  count(r.id) filter(where r.paid and not r.is_renewal) as new_full,
  count(r.id) filter(where r.paid and r.is_renewal and r.renewed_from_year=s.year-1) as renewals_from_previous_year,
  count(r.id) filter(where r.paid and r.is_renewal and r.renewed_from_year<>s.year-1) as other_renewals,
  count(r.id) filter(where r.paid) as total_sold,
  count(r.id) filter(where r.source='complimentary') as complimentary,
  count(r.id) filter(where r.source<>'complimentary' and not r.paid) as unverified,
  coalesce((select jsonb_agg(to_jsonb(p)-'season_year' order by purchase_year) from purchases p where p.season_year=s.year),'[]'::jsonb) as purchase_years
 from public.license_seasons s left join licenses r on r.season_year=s.year
 group by s.year,s.coverage_starts_on
)
select coalesce(jsonb_agg(to_jsonb(y) order by license_year desc),'[]'::jsonb) from years y;
$$;
revoke all on function private.full_license_year_report() from public,anon,authenticated,service_role;

do $$declare definition text;
begin
 select pg_get_functiondef('public.license_sales_overview(integer)'::regprocedure) into definition;
 if position('return v_result;' in definition)=0 then raise exception 'License overview changed; review before applying'; end if;
 definition:=replace(definition,'return v_result;',
  'return v_result || jsonb_build_object(''license_years'',private.full_license_year_report());');
 execute definition;

 select pg_get_functiondef('public.manage_license(text,jsonb)'::regprocedure) into definition;
 if position('where (v_year is null or r.season_year=v_year)' in definition)=0 then raise exception 'License register year filter changed'; end if;
 definition:=replace(definition,'where (v_year is null or r.season_year=v_year)',
  'where (v_year is null or r.season_year=v_year)
   and (nullif(p_input->>''purchase_year'','''') is null or extract(year from r.purchased_on)=(p_input->>''purchase_year'')::integer)
   and (nullif(p_input->>''renewed_from_year'','''') is null or r.renewed_from_year=(p_input->>''renewed_from_year'')::integer)');
 if position('or (p_input->>''type''=''renewal'' and r.is_renewal))' in definition)=0 then raise exception 'License register type filter changed'; end if;
 definition:=replace(definition,'or (p_input->>''type''=''renewal'' and r.is_renewal))',
  'or (p_input->>''type''=''renewal'' and r.is_renewal)
   or (p_input->>''type''=''paid_full'' and r.license_type=''full'' and r.purchased_on is not null and r.source<>''complimentary'')
   or (p_input->>''type''=''new_full'' and r.license_type=''full'' and not r.is_renewal and r.purchased_on is not null and r.source<>''complimentary''))');
 execute definition;
end $$;
comment on function private.full_license_year_report() is
 'Private helper for the permission-checked license_sales_overview RPC. All-time paid Full cohorts by license year, with purchase-year breakdown and renewal origin. Complimentary and unverified records remain separate.';
notify pgrst, 'reload schema';
