-- Full-license pricing: previous non-revoked Full holders renew at R500;
-- temporary-only holders pay the new-license price of R650.
alter table public.license_seasons add column renewal_price numeric;
alter table public.license_seasons add column coverage_starts_on date;
update public.license_seasons set renewal_price=price,coverage_starts_on=make_date(year,1,1);
update public.license_seasons set price=650,renewal_price=500,coverage_starts_on=public.license_today() where year=2027;
alter table public.license_seasons alter column renewal_price set not null;
alter table public.license_seasons alter column coverage_starts_on set not null;
alter table public.license_seasons add check(renewal_price>0);
alter table public.license_seasons add check(coverage_starts_on between make_date(year-1,1,1) and make_date(year,12,31));
alter table public.annual_licenses add column valid_from date;
update public.annual_licenses set valid_from=make_date(season_year,1,1);
alter table public.annual_licenses alter column valid_from set not null;
alter table public.annual_licenses add check(valid_from<=make_date(season_year,12,31));

create function private.full_license_renewal(p_player bigint,p_year integer) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.annual_licenses where player_id=p_player and season_year<p_year and revoked_at is null)
$$;
create function private.full_license_price(p_player bigint,p_year integer) returns numeric
language sql stable security definer set search_path='' as $$
 select case when private.full_license_renewal(p_player,p_year) then renewal_price else price end from public.license_seasons where year=p_year
$$;
create function public.full_license_quote(p_player_id bigint,p_year integer) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('year',year,'price',private.full_license_price(p_player_id,year),
 'renewal_eligible',private.full_license_renewal(p_player_id,year),'sales_open',sales_open and year>=extract(year from public.license_today())::integer,
 'starts_on',greatest(coverage_starts_on,public.license_today()),'ends_on',make_date(year,12,31))
 from public.license_seasons where year=p_year
$$;
revoke all on function private.full_license_renewal(bigint,integer),private.full_license_price(bigint,integer) from public,anon,authenticated;
revoke all on function public.full_license_quote(bigint,integer) from public,anon,authenticated;
grant execute on function public.full_license_quote(bigint,integer) to anon,authenticated,service_role;

create function private.annual_license_start() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_paid_on date;
begin
 if new.valid_from is null then
 select (created_at at time zone 'Africa/Johannesburg')::date into v_paid_on from public.payments where id=new.payment_id;
 select greatest(coverage_starts_on,coalesce(v_paid_on,public.license_today())) into new.valid_from from public.license_seasons where year=new.season_year;
 end if;
 return new;
end $$;
create trigger annual_license_start before insert on public.annual_licenses for each row execute function private.annual_license_start();
revoke all on function private.annual_license_start() from public,anon,authenticated;
create or replace function public.has_full_license(p_player_id bigint,p_year integer) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.annual_licenses where player_id=p_player_id and revoked_at is null and valid_from<=make_date(p_year,12,31) and season_year>=p_year)
$$;
create function private.current_full_license(p_player bigint) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.annual_licenses where player_id=p_player and revoked_at is null and valid_from<=public.license_today() and make_date(season_year,12,31)>=public.license_today())
$$;
revoke all on function private.current_full_license(bigint) from public,anon,authenticated;
-- Keep projections date-aware while event eligibility remains based on its year.
do $$declare f text;begin
 select pg_get_functiondef('private.project_license(bigint)'::regprocedure) into f;
 f:=replace(f,'public.has_full_license(p_player_id,extract(year from public.license_today())::integer)','private.current_full_license(p_player_id)');execute f;
 select pg_get_functiondef('private.protect_license_projection()'::regprocedure) into f;
 f:=replace(f,'public.has_full_license(new.id,extract(year from public.license_today())::integer)','private.current_full_license(new.id)');execute f;
 select pg_get_viewdef('private.license_register',true) into f;
 if position('make_date(a.season_year, 1, 1)' in f)=0 then raise exception 'License register start-date expression changed';end if;
 f:=replace(f,'make_date(a.season_year, 1, 1)','a.valid_from');execute 'create or replace view private.license_register as '||f;
end $$;

create or replace function public.player_license_eligibility(p_player_id bigint,p_event_id bigint) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('year',extract(year from c.start_date)::integer,
 'full',public.has_full_license(p_player_id,extract(year from c.start_date)::integer),
 'temporary',exists(select 1 from public.temporary_licenses t where t.player_id=p_player_id and t.event_id=c.id and t.revoked_at is null),
 'purchase_year',s.year,'full_price',private.full_license_price(p_player_id,s.year),
 'renewal_eligible',private.full_license_renewal(p_player_id,s.year),'full_sales_open',coalesce(s.sales_open,false))
 from public.calendar c left join lateral (
 select * from public.license_seasons s where s.year>=extract(year from c.start_date)::integer
 and s.coverage_starts_on<=c.start_date::date and s.sales_open
 and s.year>=extract(year from public.license_today())::integer order by s.year limit 1
 )s on true where c.id=p_event_id
$$;

-- Seasons retain a new-license price, renewal price, and earliest coverage date.
do $$declare f text;begin
 select pg_get_functiondef('public.manage_license(text,jsonb)'::regprocedure) into f;
 f:=replace(f,
 'insert into public.license_seasons(year,price,sales_open) values(v_year,(p_input->>''price'')::numeric,coalesce((p_input->>''sales_open'')::boolean,false)) on conflict(year) do update set price=excluded.price,sales_open=excluded.sales_open,updated_at=now();',
 'insert into public.license_seasons(year,price,renewal_price,coverage_starts_on,sales_open) values(v_year,(p_input->>''price'')::numeric,coalesce((p_input->>''renewal_price'')::numeric,500),coalesce((p_input->>''coverage_starts_on'')::date,make_date(v_year,1,1)),coalesce((p_input->>''sales_open'')::boolean,false)) on conflict(year) do update set price=excluded.price,renewal_price=case when p_input ? ''renewal_price'' then excluded.renewal_price else license_seasons.renewal_price end,coverage_starts_on=case when p_input ? ''coverage_starts_on'' then excluded.coverage_starts_on else license_seasons.coverage_starts_on end,sales_open=excluded.sales_open,updated_at=now();');
 if position('renewal_price' in f)=0 then raise exception 'Season settings function changed';end if;execute f;
 -- Apply per-beneficiary pricing to verified bundled payments as well.
 select pg_get_functiondef('private.finalize_license_payment()'::regprocedure) into f;
 f:=replace(f,'(select price from public.license_seasons where year=coalesce((x->>''license_year'')::integer,(new.metadata->>''license_year'')::integer,(select extract(year from start_date)::integer from public.calendar where id=coalesce((x->>''event_id'')::bigint,new.event_id))))',
 'private.full_license_price(coalesce((x->>''player_id'')::bigint,(select id from public.players where lower(email)=lower(x->>''email'')),new.player_id),coalesce((x->>''license_year'')::integer,(new.metadata->>''license_year'')::integer,(select extract(year from start_date)::integer from public.calendar where id=coalesce((x->>''event_id'')::bigint,new.event_id))))');
 f:=replace(f,'v_year<>extract(year from v_calendar.start_date)::integer','not exists(select 1 from public.license_seasons s where s.year=v_year and s.coverage_starts_on<=v_calendar.start_date::date and make_date(s.year,12,31)>=v_calendar.start_date::date)');
 f:=replace(f,'select price into v_required from public.license_seasons where year=v_year;','select private.full_license_price(v_player,v_year) into v_required;');
 if position('private.full_license_price(v_player,v_year)' in f)=0 then raise exception 'Payment price finalizer changed';end if;execute f;
end $$;
-- Use the new immediately-valid coverage for current-status projections.
select public.refresh_license_projections();
notify pgrst, 'reload schema';
