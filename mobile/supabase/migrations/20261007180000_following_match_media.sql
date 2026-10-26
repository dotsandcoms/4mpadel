-- Refresh media without creating new schedule facts.
create or replace function public.following_activity_media(p_activity public.following_activity) returns jsonb
language plpgsql stable set search_path=public as $$
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
    select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'photo_url',p.image_url,'nationality',following_country(p.nationality),'source','local') order by p.id)
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
    select c.image_url,c.registration_closes_at,c.start_date,c.end_date into event from calendar c where c.id=p_activity.event_id and c.is_visible=true and coalesce(c.registration_access,'public')='public';
    if found then presentation:=presentation||jsonb_build_object('event_image_url',event.image_url,'registration_closes_at',event.registration_closes_at,'event_start_date',event.start_date,'event_end_date',event.end_date); end if;
  end if;
  return presentation;
end $$;
revoke all on function public.following_activity_media(public.following_activity) from public,anon,authenticated;
