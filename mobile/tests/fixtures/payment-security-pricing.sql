-- Actual hosted pricing function bodies, synthetic catalogue rows only.
create table public.commerce_config(id text primary key,event_fee_percent numeric,license_fee_percent numeric,temp_license_price numeric,temp_license_enabled boolean);
create table public.license_seasons(year integer primary key,price numeric,renewal_price numeric,sales_open boolean,coverage_starts_on date);
create table public.annual_licenses(player_id bigint,season_year integer,revoked_at timestamptz);
CREATE OR REPLACE FUNCTION public.license_today()
 RETURNS date
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select (now() at time zone 'Africa/Johannesburg')::date
$function$
;
CREATE OR REPLACE FUNCTION private.full_license_renewal(p_player bigint, p_year integer)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.annual_licenses where player_id=p_player and season_year<p_year and revoked_at is null)
$function$
;
CREATE OR REPLACE FUNCTION private.full_license_price(p_player bigint, p_year integer)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select case when private.full_license_renewal(p_player,p_year) then renewal_price else price end from public.license_seasons where year=p_year
$function$
;
CREATE OR REPLACE FUNCTION public.full_license_quote(p_player_id bigint, p_year integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object('year',year,'price',private.full_license_price(p_player_id,year),
 'renewal_eligible',private.full_license_renewal(p_player_id,year),'sales_open',sales_open and year>=extract(year from public.license_today())::integer,
 'starts_on',greatest(coverage_starts_on,public.license_today()),'ends_on',make_date(year,12,31))
 from public.license_seasons where year=p_year
$function$
;
