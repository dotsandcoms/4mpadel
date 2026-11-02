-- A purchased, non-expired event license is current even before its event
-- starts. Count current Full coverage once per player across overlapping years.
-- Keep calendar timing (active/upcoming) available in the detailed register.
create function private.current_license_holder_summary() returns jsonb
language sql stable security definer set search_path='' as $$
with register as materialized (select * from private.license_register),
full_holders as (
 select distinct on(player_id) player_id,id,is_renewal from register
 where license_type='full' and status='active' order by player_id,season_year desc,created_at desc,id
), temporary as (
 select r.* from register r where r.license_type='temporary' and r.status in('active','upcoming')
 and not exists(select 1 from full_holders f where f.player_id=r.player_id)
)
select jsonb_build_object(
 'full',(select count(*) from full_holders),
 'temporary',(select count(*) from temporary),
 'renewals',(select count(*) from full_holders where is_renewal),
 'total',(select count(*) from full_holders)+(select count(*) from temporary),
 'temporary_holders',(select count(distinct player_id) from temporary),
 'temporary_upcoming',(select count(*) from temporary where status='upcoming'),
 'temporary_in_progress',(select count(*) from temporary where status='active')
);
$$;
revoke all on function private.current_license_holder_summary() from public,anon,authenticated,service_role;

do $$declare definition text;
begin
 select pg_get_functiondef('public.manage_license(text,jsonb)'::regprocedure) into definition;
 if position('or r.status=p_input->>''status'')' in definition)=0 or position('return v_result || jsonb_build_object(''reviews'',' in definition)=0 then
  raise exception 'License register status/summary changed; review before applying';
 end if;
 definition:=replace(definition,'or r.status=p_input->>''status'')',
  'or r.status=p_input->>''status'' or (p_input->>''status''=''current'' and (
   (r.license_type=''full'' and r.status=''active'' and not exists(
    select 1 from private.license_register newer where newer.player_id=r.player_id
     and newer.license_type=''full'' and newer.status=''active'' and newer.season_year>r.season_year))
   or (r.license_type=''temporary'' and r.status in(''active'',''upcoming'') and not exists(
    select 1 from private.license_register full_cover where full_cover.player_id=r.player_id
     and full_cover.license_type=''full'' and full_cover.status=''active''))
  )))');
 definition:=replace(definition,'return v_result || jsonb_build_object(''reviews'',',
  'return v_result || jsonb_build_object(''current_counts'',private.current_license_holder_summary()) || jsonb_build_object(''reviews'',');
 execute definition;
end $$;
notify pgrst, 'reload schema';
