begin;

-- Shared by feed visibility and personal ranking pushes. Unknown positions do
-- not prove movement; small moves count only when entering a top milestone.
create or replace function public.following_ranking_change_relevant(p_before text,p_rank text) returns boolean
language sql immutable set search_path = '' as $function$
  select case when p_before ~ '^[1-9][0-9]{0,8}$' and p_rank ~ '^[1-9][0-9]{0,8}$' then
    abs(p_before::integer-p_rank::integer)>5
    or exists(select 1 from unnest(array[10,20,100]) milestone where p_before::integer>milestone and p_rank::integer<=milestone)
    else false end;
$function$;
revoke all on function public.following_ranking_change_relevant(text,text) from public,anon,authenticated;
grant execute on function public.following_ranking_change_relevant(text,text) to service_role;

-- Apply to existing activity at read time, before the feed is paginated.
-- Keep raw daily rollups so later changes retain their original baseline.
create or replace function public.following_ranking_relevant(p_activity public.following_activity) returns boolean
language sql stable set search_path = '' as $function$
  select case when p_activity.kind<>'ranking' then true
    when not public.following_ranking_change_relevant(p_activity.payload->>'before_rank',p_activity.payload->>'rank') then false
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


create or replace function public.notify_published_rankings() returns trigger
language plpgsql security definer set search_path = '' as $function$
declare current_rank jsonb; prior_rank jsonb;
begin
  if nullif(trim(new.email),'') is null or new.approved is distinct from true then return new; end if;
  for current_rank in select value from jsonb_array_elements(public.following_sapa_main_rankings(to_jsonb(new)->'rankings',new.gender)) loop
    select value into prior_rank from jsonb_array_elements(public.following_sapa_main_rankings(to_jsonb(old)->'rankings',old.gender)) where value->>'ranking_scope'=current_rank->>'ranking_scope';
    if prior_rank is null or not public.following_ranking_change_relevant(prior_rank->>'rank',current_rank->>'rank')
      or (current_rank->>'edition_date' is not null and prior_rank->>'edition_date' is not null and current_rank->>'edition_date'<prior_rank->>'edition_date') then continue; end if;
    perform public.enqueue_push(new.email,'ranking_change','SAPA '||(current_rank->>'age_group')||' ranking update',
      'Your SAPA '||(current_rank->>'age_group')||' ranking moved from #'||(prior_rank->>'rank')||' to #'||(current_rank->>'rank')||'.',
      '/(tabs)/rankings?view=Rankings&source=4m&gender='||case current_rank->>'age_group_id' when '82' then 'men' else 'women' end);
  end loop;
  return new;
end $function$;
revoke all on function public.notify_published_rankings() from public,anon,authenticated;
grant execute on function public.notify_published_rankings() to service_role;

-- Sample from all own follows before limiting, separately for local and FIP.
-- The chosen order stays fixed in the response until the next refresh.
CREATE OR REPLACE FUNCTION public.get_following_feed(p_filter text DEFAULT 'all'::text, p_limit integer DEFAULT 20, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare rows jsonb; own_locals bigint[]; own_pros bigint[]; followed_players jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to view Following'; end if;
  if p_filter is null or p_filter not in ('all','players','matches','tournaments') or p_limit is null or p_limit not between 1 and 50 or (p_before is null)<>(p_before_id is null) then raise exception 'Invalid feed filter or cursor'; end if;
  select coalesce(array_agg(f.player_id),'{}') into own_locals from local_player_follows f join players p on p.id=f.player_id and p.approved=true where f.user_id=auth.uid();
  select coalesce(array_agg(f.player_id),'{}') into own_pros from pro_player_follows f where f.user_id=auth.uid();
  select coalesce(jsonb_agg(to_jsonb(x) order by x.occurred_at desc,x.id desc),'[]') into rows from (
    select a.id,a.kind,a.title,a.body,a.photo_url,a.path,a.payload||case when a.kind='tournament' and a.payload->>'update_type'='details' then jsonb_build_object('changes',public.following_tournament_changes(a.payload->'changes')) else '{}'::jsonb end||public.following_activity_media(a) as payload,a.occurred_at,
      a.local_player_ids,a.pro_player_ids,a.event_id,a.native_match_id,a.pro_match_id
    from following_activity a
    where a.occurred_at<=now() and a.occurred_at>=now()-interval '90 days'
      and public.following_tournament_relevant(a)
      and public.following_ranking_relevant(a)
      and (p_before is null or (a.occurred_at,a.id)<(p_before,p_before_id))
      and (a.event_id is null or exists(select 1 from calendar c where c.id=a.event_id and c.is_visible=true and coalesce(c.registration_access,'public')='public'))
      and (a.native_match_id is null or exists(select 1 from draw_matches m join draws d on d.id=m.draw_id where m.id=a.native_match_id and d.status in ('published','in_progress','completed')))
      and (a.local_player_ids&&own_locals or a.pro_player_ids&&own_pros
        or exists(select 1 from pro_match_bookmarks b where b.user_id=auth.uid() and b.match_id=a.pro_match_id and b.bookmarked)
        or (a.kind='tournament' and exists(select 1 from event_notification_follows f where f.event_id=a.event_id and f.email=lower(trim(auth.jwt()->>'email')) and f.following)))
      and (p_filter='all'
        or p_filter='players' and (a.local_player_ids&&own_locals or a.pro_player_ids&&own_pros)
        or p_filter='matches' and a.kind in ('result','match_live','match_schedule')
        or p_filter='tournaments' and a.kind in ('entry','tournament'))
    order by a.occurred_at desc,a.id desc limit p_limit+1
  ) x;
  select coalesce(jsonb_agg(x.player order by x.sample_order,x.player_id),'[]') into followed_players from (
    select p.id as player_id,random() as sample_order,jsonb_build_object('id',p.id,'name',p.name,'photo_url',p.image_url,
      'nationality',public.following_country(p.nationality),'source','local',
      'main_rankings',public.following_sapa_main_rankings(p.rankings,p.gender)) as player
    from public.local_player_follows f join public.players p on p.id=f.player_id and p.approved=true
    where f.user_id=auth.uid() order by sample_order,p.id limit least(p_limit,12)
  ) x;
  -- International identities stay in their own namespace and use the public
  -- provider cache, not local players with a coincidentally matching numeric ID.
  select followed_players||coalesce(jsonb_agg(x.player order by x.sample_order,x.player_id),'[]') into followed_players from (
    select f.player_id,random() as sample_order,jsonb_build_object('id',f.player_id,
      'name',coalesce(nullif(trim(p.payload->>'name'),''),f.player_name),'photo_url',p.payload->>'photo_url',
      'nationality',public.following_country(p.payload->>'nationality'),'source','pro',
      'pro_ranking',case when p.payload->>'ranking' ~ '^[1-9][0-9]{0,8}$' then jsonb_build_object(
        'category',f.category,'rank',(p.payload->>'ranking')::integer,
        'points',case when p.payload->>'points' ~ '^[0-9]{1,10}(\.[0-9]{1,6})?$' then (p.payload->>'points')::numeric end) end) as player
    from public.pro_player_follows f left join public.padel_api_players p on p.id=f.player_id and p.payload->>'category'=f.category
    where f.user_id=auth.uid() and f.category in ('men','women') order by sample_order,f.player_id limit least(p_limit,12)
  ) x;
  return jsonb_build_object('followed_players',followed_players,'items',(select coalesce(jsonb_agg(value order by ordinality),'[]') from jsonb_array_elements(rows) with ordinality where ordinality<=p_limit),'has_more',jsonb_array_length(rows)>p_limit);
end $function$
;
revoke all on function public.get_following_feed(text,integer,timestamptz,uuid) from public,anon;
grant execute on function public.get_following_feed(text,integer,timestamptz,uuid) to authenticated,service_role;


commit;
