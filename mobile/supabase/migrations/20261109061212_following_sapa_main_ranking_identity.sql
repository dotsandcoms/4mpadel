begin;

-- Rank identity is the organisation + gendered Main doubles division. A player's
-- chosen display rank may legitimately belong to another circuit; never use it
-- as the baseline or current value for SAPA activity.
create or replace function public.following_sapa_main_rankings(p_rows jsonb) returns jsonb
language sql immutable set search_path = '' as $function$
  with candidates as (
    select r,
      case when nullif(r->>'age_group_id','') is not null then
        case r->>'age_group_id' when '82' then 82 when '83' then 83 end
      else case lower(trim(r->>'age_group')) when 'men-main' then 82 when 'women-main' then 83 end end as age_id
    from jsonb_array_elements(case when jsonb_typeof(p_rows)='array' then p_rows else '[]'::jsonb end) r
    where jsonb_typeof(r)='object'
      and (case when nullif(r->>'ranking_id','') is not null then r->>'ranking_id'='15809'
        else lower(trim(r->>'org')) in ('sapa','sapa ranking') end)
      and (nullif(trim(r->>'org'),'') is null or lower(trim(r->>'org')) in ('sapa','sapa ranking'))
  ), valid as (
    select *, count(*) over (partition by age_id) as scope_count from candidates
    where age_id in (82,83)
      and (nullif(trim(r->>'age_group'),'') is null or lower(trim(r->>'age_group'))=case age_id when 82 then 'men-main' else 'women-main' end)
      and (nullif(r->>'ranking_type','') is null or r->>'ranking_type'=case age_id when 82 then '3' else '4' end)
      and (nullif(trim(r->>'match_type'),'') is null or lower(trim(r->>'match_type')) in ('doubles',case age_id when 82 then 'men-doubles' else 'women-doubles' end))
      and trim(coalesce(r->>'rank','')) ~ '^[1-9][0-9]{0,8}$'
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'ranking_id',15809,'age_group_id',age_id,'ranking_type',case age_id when 82 then 3 else 4 end,
    'org','SAPA','age_group',case age_id when 82 then 'Men-Main' else 'Women-Main' end,
    'match_type',case age_id when 82 then 'Men-Doubles' else 'Women-Doubles' end,
    'ranking_scope','sapa:15809:'||case age_id when 82 then '3:82' else '4:83' end,
    'rank',trim(r->>'rank')::integer,
    'points',case when trim(coalesce(r->>'points','')) ~ '^[0-9]{1,10}(\.[0-9]{1,6})?$' then trim(r->>'points')::numeric end,
    'edition_date',case when r->>'ranking_date' ~ '^\d{4}-\d{2}-\d{2}' then left(r->>'ranking_date',10) end
  ) order by age_id) filter (where scope_count=1),'[]'::jsonb) from valid;
$function$;
revoke all on function public.following_sapa_main_rankings(jsonb) from public,anon,authenticated;
grant execute on function public.following_sapa_main_rankings(jsonb) to service_role;

-- Old generic display-rank posts cannot prove their source. Keep their records
-- for audit/retention, but do not serve them or infer a historic SAPA movement.
create or replace function public.following_ranking_relevant(p_activity public.following_activity) returns boolean
language sql immutable set search_path = '' as $function$
  select case when p_activity.kind<>'ranking' then true
    when cardinality(p_activity.pro_player_ids)>0 and cardinality(p_activity.local_player_ids)=0 then true
    else coalesce(
      p_activity.payload->>'ranking_source'='sapa_main_v1'
      and p_activity.payload->>'ranking_id'='15809'
      and ((p_activity.payload->>'ranking_scope'='sapa:15809:3:82' and p_activity.payload->>'age_group_id'='82' and p_activity.payload->>'ranking_type'='3')
        or (p_activity.payload->>'ranking_scope'='sapa:15809:4:83' and p_activity.payload->>'age_group_id'='83' and p_activity.payload->>'ranking_type'='4'))
      and p_activity.payload->>'before_rank' ~ '^[1-9][0-9]{0,8}$'
      and p_activity.payload->>'rank' ~ '^[1-9][0-9]{0,8}$'
      and p_activity.payload->>'before_rank'<>p_activity.payload->>'rank',false) end;
$function$;
revoke all on function public.following_ranking_relevant(public.following_activity) from public,anon,authenticated;
grant execute on function public.following_ranking_relevant(public.following_activity) to service_role;

create or replace function public.following_profile_changed() returns trigger
language plpgsql security definer set search_path = '' as $function$
declare changes jsonb; previous jsonb; activity_key text; label text; current_rank jsonb; prior_rank jsonb; baseline integer; baseline_points numeric;
begin
  if new.approved is distinct from true then return new; end if;
  if (new.bio,new.image_url,new.additional_images) is distinct from (old.bio,old.image_url,old.additional_images) then
    activity_key:='profile:'||new.id||':'||(now() at time zone 'UTC')::date;
    select payload into previous from public.following_activity where event_key=activity_key;
    select coalesce(jsonb_agg(distinct x),'[]') into changes from (
      select value x from jsonb_array_elements_text(coalesce(previous->'changes','[]'))
      union all select 'bio' where new.bio is distinct from old.bio
      union all select 'photos' where (new.image_url,new.additional_images) is distinct from (old.image_url,old.additional_images)
    ) changed;
    label:=case when changes@>'["bio","photos"]' then 'bio and photos' when changes@>'["bio"]' then 'player bio' else 'player photos' end;
    perform public.record_following_activity(jsonb_build_object('event_key',activity_key,'kind','profile','local_player_ids',jsonb_build_array(new.id),
      'title',new.name||' updated their '||label,'photo_url',new.image_url,'path','/players/'||new.id,'payload',jsonb_build_object('changes',changes)));
  end if;
  if new.rankings is not distinct from old.rankings then return new; end if;
  for current_rank in select value from jsonb_array_elements(public.following_sapa_main_rankings(to_jsonb(new)->'rankings')) loop
    select value into prior_rank from jsonb_array_elements(public.following_sapa_main_rankings(to_jsonb(old)->'rankings'))
      where value->>'ranking_scope'=current_rank->>'ranking_scope';
    -- No baseline, no movement. Missing ranks, new scope membership and stale
    -- editions must not become invented improvements or losses.
    if prior_rank is null or prior_rank->>'rank'=current_rank->>'rank'
      or (current_rank->>'edition_date' is not null and prior_rank->>'edition_date' is not null
        and current_rank->>'edition_date'<prior_rank->>'edition_date') then continue; end if;
    activity_key:='ranking:'||(current_rank->>'ranking_scope')||':'||new.id||':'||(now() at time zone 'UTC')::date;
    select payload into previous from public.following_activity where event_key=activity_key;
    baseline:=coalesce((previous->>'before_rank')::integer,(prior_rank->>'rank')::integer);
    baseline_points:=case when previous is not null then (previous->>'before_points')::numeric else (prior_rank->>'points')::numeric end;
    perform public.record_following_activity(jsonb_build_object('event_key',activity_key,'kind','ranking','local_player_ids',jsonb_build_array(new.id),
      'title',new.name||' moved to #'||(current_rank->>'rank'),
      'body','SAPA '||(current_rank->>'age_group')||' ranking update','photo_url',new.image_url,'path','/players/'||new.id,
      'payload',current_rank||jsonb_build_object('ranking_source','sapa_main_v1','before_rank',baseline,'before_points',baseline_points)));
  end loop;
  return new;
end $function$;
revoke all on function public.following_profile_changed() from public,anon,authenticated;
grant execute on function public.following_profile_changed() to service_role;
drop trigger if exists following_profile_changed on public.players;
create trigger following_profile_changed after update of bio,image_url,additional_images,rankings on public.players
  for each row execute function public.following_profile_changed();

create or replace function public.notify_published_rankings() returns trigger
language plpgsql security definer set search_path = '' as $function$
declare current_rank jsonb; prior_rank jsonb;
begin
  if nullif(trim(new.email),'') is null or new.approved is distinct from true then return new; end if;
  for current_rank in select value from jsonb_array_elements(public.following_sapa_main_rankings(to_jsonb(new)->'rankings')) loop
    select value into prior_rank from jsonb_array_elements(public.following_sapa_main_rankings(to_jsonb(old)->'rankings')) where value->>'ranking_scope'=current_rank->>'ranking_scope';
    if prior_rank is null or current_rank->>'rank'=prior_rank->>'rank'
      or (current_rank->>'edition_date' is not null and prior_rank->>'edition_date' is not null and current_rank->>'edition_date'<prior_rank->>'edition_date') then continue; end if;
    perform public.enqueue_push(new.email,'ranking_change','SAPA '||(current_rank->>'age_group')||' ranking update',
      'Your SAPA '||(current_rank->>'age_group')||' ranking moved from #'||(prior_rank->>'rank')||' to #'||(current_rank->>'rank')||'.',
      '/(tabs)/rankings?view=Rankings&source=4m&gender='||case current_rank->>'age_group_id' when '82' then 'men' else 'women' end);
  end loop;
  return new;
end $function$;
revoke all on function public.notify_published_rankings() from public,anon,authenticated;
grant execute on function public.notify_published_rankings() to service_role;

-- Read-time presentation and the user-scoped feed are appended below, preserving
-- the existing event, match, visibility and follow-ownership checks.

CREATE OR REPLACE FUNCTION public.following_activity_media(p_activity following_activity)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare presentation jsonb:='{}'; actors jsonb; teams jsonb; people jsonb; participant jsonb; team_name text; person_name text; event record; match_players jsonb;
begin
  if p_activity.pro_match_id is not null then
    -- Scheduled posts retain their original timestamp but use refreshed public player media.
    select coalesce(s.snapshot->'match',s.snapshot->'matches'->p_activity.pro_match_id::text)->'players' into match_players
      from following_sync_state s
      where (s.source_key='pro_match:'||p_activity.pro_match_id or s.source_key=any(array(select 'pro_player:'||id from unnest(p_activity.pro_player_ids) id)))
        and jsonb_typeof(coalesce(s.snapshot->'match',s.snapshot->'matches'->p_activity.pro_match_id::text)->'players')='object'
      order by s.checked_at desc nulls last limit 1;
    if match_players is not null then
      teams:='[]';
      for team_name in select unnest(array['team_1','team_2']) loop
        select coalesce(jsonb_agg(jsonb_build_object('name',p->>'name','photo_url',p->>'photo_url','nationality',case when p->>'nationality' ~ '^[A-Z]{2}$' then p->>'nationality' end,'source','pro') order by ordinality),'[]') into people
          from jsonb_array_elements(coalesce(match_players->team_name,'[]')) with ordinality players(p,ordinality) where ordinality<=2;
        teams:=teams||jsonb_build_array(people);
      end loop;
      presentation:=presentation||jsonb_build_object('participants',teams);
    end if;
  end if;
  if cardinality(p_activity.local_player_ids)>0 then
    select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'photo_url',p.image_url,'nationality',following_country(p.nationality),'source','local','main_rankings',public.following_sapa_main_rankings(p.rankings)) order by p.id)
      into actors from players p where p.id=any(p_activity.local_player_ids) and p.approved=true;
    if actors is not null then presentation:=presentation||jsonb_build_object('actors',actors); end if;
    if jsonb_typeof(p_activity.payload->'teams')='array' and jsonb_array_length(p_activity.payload->'teams')=2 then
      teams:='[]';
      for team_name in select value from jsonb_array_elements_text(p_activity.payload->'teams') loop
        people:='[]';
        for person_name in select trim(value) from unnest(string_to_array(team_name,' / ')) value limit 2 loop
          -- Ambiguous names never borrow another player's photo or country.
          select case when count(*)=1 then jsonb_build_object('id',min(p.id),'name',person_name,'photo_url',min(p.image_url),'nationality',following_country(min(p.nationality)),'source','local') else jsonb_build_object('name',person_name) end
            into participant from players p where p.approved=true and lower(trim(p.name))=lower(person_name);
          people:=people||jsonb_build_array(participant);
        end loop;
        teams:=teams||jsonb_build_array(people);
      end loop;
      presentation:=presentation||jsonb_build_object('participants',teams);
    end if;
  end if;
  if p_activity.event_id is not null then
    select coalesce(nullif(trim(c.poster_image_url),''),nullif(trim(c.custom_image_url),''),nullif(trim(c.image_url),'')) as image_url,c.registration_closes_at,c.early_bird_ends_at,c.start_date,c.end_date into event from calendar c where c.id=p_activity.event_id and c.is_visible=true and coalesce(c.registration_access,'public')='public';
    if found then presentation:=presentation||jsonb_build_object('event_image_url',event.image_url,'registration_closes_at',case when p_activity.payload->>'update_type'='early_bird_ending' then null else event.registration_closes_at end,'early_bird_ends_at',event.early_bird_ends_at,'event_start_date',event.start_date,'event_end_date',event.end_date); end if;
  end if;
  return presentation;
end $function$
;
revoke all on function public.following_activity_media(public.following_activity) from public,anon,authenticated;
grant execute on function public.following_activity_media(public.following_activity) to service_role;

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
  select coalesce(jsonb_agg(x.player order by x.followed_at desc,x.player_id),'[]') into followed_players from (
    select p.id as player_id,f.created_at as followed_at,jsonb_build_object('id',p.id,'name',p.name,'photo_url',p.image_url,
      'nationality',public.following_country(p.nationality),'source','local',
      'main_rankings',public.following_sapa_main_rankings(p.rankings)) as player
    from public.local_player_follows f join public.players p on p.id=f.player_id and p.approved=true
    where f.user_id=auth.uid() order by f.created_at desc,p.id limit least(p_limit,12)
  ) x;
  -- International identities stay in their own namespace and use the public
  -- provider cache, not local players with a coincidentally matching numeric ID.
  select followed_players||coalesce(jsonb_agg(x.player order by x.followed_at desc,x.player_id),'[]') into followed_players from (
    select f.player_id,f.created_at as followed_at,jsonb_build_object('id',f.player_id,
      'name',coalesce(nullif(trim(p.payload->>'name'),''),f.player_name),'photo_url',p.payload->>'photo_url',
      'nationality',public.following_country(p.payload->>'nationality'),'source','pro',
      'pro_ranking',case when p.payload->>'ranking' ~ '^[1-9][0-9]{0,8}$' then jsonb_build_object(
        'category',f.category,'rank',(p.payload->>'ranking')::integer,
        'points',case when p.payload->>'points' ~ '^[0-9]{1,10}(\.[0-9]{1,6})?$' then (p.payload->>'points')::numeric end) end) as player
    from public.pro_player_follows f left join public.padel_api_players p on p.id=f.player_id and p.payload->>'category'=f.category
    where f.user_id=auth.uid() and f.category in ('men','women') order by f.created_at desc,f.player_id limit least(p_limit,12)
  ) x;
  return jsonb_build_object('followed_players',followed_players,'items',(select coalesce(jsonb_agg(value order by ordinality),'[]') from jsonb_array_elements(rows) with ordinality where ordinality<=p_limit),'has_more',jsonb_array_length(rows)>p_limit);
end $function$
;
revoke all on function public.get_following_feed(text,integer,timestamptz,uuid) from public,anon;
grant execute on function public.get_following_feed(text,integer,timestamptz,uuid) to authenticated,service_role;

commit;
