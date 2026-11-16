begin;

-- Select the player's own Main division before presenting or comparing ranks.
-- Keep imported snapshots intact; names and the best-looking rank are not gender.
create or replace function public.following_sapa_main_rankings(p_rows jsonb,p_gender text) returns jsonb
language sql immutable set search_path = '' as $function$
  with ranks as (select public.following_sapa_main_rankings(p_rows) as rows),
  profile as (select case lower(trim(p_gender))
    when 'female' then 'Women-Main' when 'f' then 'Women-Main' when 'woman' then 'Women-Main' when 'women' then 'Women-Main'
    when 'male' then 'Men-Main' when 'm' then 'Men-Main' when 'man' then 'Men-Main' when 'men' then 'Men-Main' end as division)
  select coalesce(jsonb_agg(r),'[]'::jsonb) from ranks cross join profile cross join lateral jsonb_array_elements(ranks.rows) r
    where r->>'age_group'=profile.division or (profile.division is null and jsonb_array_length(ranks.rows)=1);
$function$;
revoke all on function public.following_sapa_main_rankings(jsonb,text) from public,anon,authenticated;
grant execute on function public.following_sapa_main_rankings(jsonb,text) to service_role;

-- Patch only the source-selector calls in the existing definitions, retaining
-- their ownership, visibility, routing, presentation and pagination rules.
do $patch$
declare signature text; definition text; revised text;
begin
  foreach signature in array array['public.following_profile_changed()','public.notify_published_rankings()',
    'public.following_activity_media(public.following_activity)','public.get_following_feed(text,integer,timestamp with time zone,uuid)'] loop
    definition:=pg_get_functiondef(signature::regprocedure);
    revised:=replace(definition,'public.following_sapa_main_rankings(p.rankings)','public.following_sapa_main_rankings(p.rankings,p.gender)');
    revised:=replace(revised,'public.following_sapa_main_rankings(to_jsonb(new)->''rankings'')','public.following_sapa_main_rankings(to_jsonb(new)->''rankings'',new.gender)');
    revised:=replace(revised,'public.following_sapa_main_rankings(to_jsonb(old)->''rankings'')','public.following_sapa_main_rankings(to_jsonb(old)->''rankings'',old.gender)');
    if revised=definition then raise exception 'Expected main-ranking source selector missing in %',signature; end if;
    execute revised;
  end loop;
end $patch$;

-- Previously recorded source-scoped activity also has to match the player's
-- current Main division. Unscoped legacy records remain hidden, not deleted.
create or replace function public.following_ranking_relevant(p_activity public.following_activity) returns boolean
language sql stable set search_path = '' as $function$
  select case when p_activity.kind<>'ranking' then true
    when cardinality(p_activity.pro_player_ids)>0 and cardinality(p_activity.local_player_ids)=0 then true
    else coalesce(
      p_activity.payload->>'ranking_source'='sapa_main_v1'
      and p_activity.payload->>'ranking_id'='15809'
      and ((p_activity.payload->>'ranking_scope'='sapa:15809:3:82' and p_activity.payload->>'age_group_id'='82' and p_activity.payload->>'ranking_type'='3')
        or (p_activity.payload->>'ranking_scope'='sapa:15809:4:83' and p_activity.payload->>'age_group_id'='83' and p_activity.payload->>'ranking_type'='4'))
      and p_activity.payload->>'before_rank' ~ '^[1-9][0-9]{0,8}$'
      and p_activity.payload->>'rank' ~ '^[1-9][0-9]{0,8}$'
      and p_activity.payload->>'before_rank'<>p_activity.payload->>'rank'
      and exists(select 1 from public.players p cross join lateral jsonb_array_elements(public.following_sapa_main_rankings(p.rankings,p.gender)) r
        where p.id=any(p_activity.local_player_ids) and p.approved=true and r->>'ranking_scope'=p_activity.payload->>'ranking_scope'),false) end;
$function$;
revoke all on function public.following_ranking_relevant(public.following_activity) from public,anon,authenticated;
grant execute on function public.following_ranking_relevant(public.following_activity) to service_role;

commit;
