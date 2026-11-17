-- Public projection of final SAPA awards only. The private award ledger,
-- recipient contacts and unfinished/unpublished divisions remain inaccessible.
create or replace function public.get_event_points_sheet(p_event bigint) returns jsonb
language plpgsql stable security definer set search_path='' as $function$
declare result jsonb;
begin
  if p_event is null or p_event<=0 then return null; end if;
  if not exists(select 1 from public.calendar c where c.id=p_event and c.is_visible is distinct from false
    and (c.sanction_status is null or c.sanction_status='approved')
    and coalesce(c.registration_access,'public')='public'
    and nullif(trim(c.sapa_status),'') is not null and lower(trim(c.sapa_status))<>'none'
    and c.event_status is distinct from 'cancelled'
    and (c.event_status in ('finished','completed') or coalesce(c.end_date,c.start_date)<(now() at time zone 'Africa/Johannesburg')::date)) then return null; end if;
  with finalised as materialized (
    select v.id,v.name,f.finalised_at from public.tournament_finalisations f
    join public.tournament_divisions v on v.id=f.division_id and v.event_id=f.event_id
    where f.event_id=p_event and f.fingerprint=public.tm_result_fingerprint(f.division_id)
      and exists(select 1 from public.draws d where d.division_id=v.id and d.event_id=p_event and d.status='completed')
  ), awards as (
    select f.id as division_id,f.name as division_name,f.finalised_at,p.id,p.name,a.points,
      coalesce(t.round_label,a.round_code) as position,coalesce(t.display_order,999) as position_order
    from finalised f join public.player_ranking_points a on a.event_id=p_event and a.division_id=f.id
    join public.players p on p.id=a.player_id and p.approved=true
    left join public.ranking_points_table t on t.id=a.points_table_id
    where a.reversal_of is null and a.points>=0
      and not exists(select 1 from public.player_ranking_points reversed where reversed.reversal_of=a.id)
  ), divisions as (
    select division_id,division_name,max(finalised_at) as updated_at,
      jsonb_agg(jsonb_build_object('position',position,'players',jsonb_build_array(name),'points',points)
        order by position_order,points desc,name,id) as rows
    from awards group by division_id,division_name
  )
  select case when count(*)>0 then jsonb_build_object('updatedAt',max(updated_at),
    'divisions',jsonb_agg(jsonb_build_object('name',division_name,'rows',rows) order by division_name,division_id)) end into result from divisions;
  return result;
end $function$;
revoke all on function public.get_event_points_sheet(bigint) from public,anon,authenticated,service_role;
grant execute on function public.get_event_points_sheet(bigint) to anon,authenticated,service_role;
notify pgrst,'reload schema';
