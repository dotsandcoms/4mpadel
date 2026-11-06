-- A historical sync can label a paired checkout as a license payment.
-- Without an allocation or line-item breakdown, its total is not a unit price.
create or replace function private.license_export_price(amount numeric,payment_type text,meta jsonb,cover jsonb)
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
      and coalesce(meta->>'paying_for_partner','false') not in('true','yes','1')
      and coalesce(meta->>'partner_needs_license','false') not in('true','yes','1')
      and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof(meta->'covers')='array' then meta->'covers' else '[]'::jsonb end) c where c->>'type'<>'license')
      and not exists(select 1 from lines where item->>'type'='entry_fee' or (coalesce(item->>'label','')<>'' and coalesce(item->>'label','') !~* 'licen[cs]e'))))
  union all select line_price,'Recorded license line item',2 from facts where line_count=units and different_prices=1 and invalid_lines=0 and line_price>0 and line_price*units<=amount
 ) select chosen.price,coalesce(chosen.basis,'License price needs review') from (select 1) seed
 left join lateral (select * from candidates order by priority limit 1) chosen on true;
$$;
revoke all on function private.license_export_price(numeric,text,jsonb,jsonb) from public,anon,authenticated,service_role;
