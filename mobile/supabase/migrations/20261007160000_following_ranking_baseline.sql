begin;
create or replace function public.following_profile_changed() returns trigger
language plpgsql security definer set search_path=public as $$
declare changes jsonb; previous jsonb; activity_key text; label text; old_rank text; old_points integer;
begin
  if new.approved is distinct from true then return new; end if;
  if (new.bio,new.image_url,new.additional_images) is distinct from (old.bio,old.image_url,old.additional_images) then
    activity_key:='profile:'||new.id||':'||(now() at time zone 'UTC')::date;
    select payload into previous from following_activity where event_key=activity_key;
    select coalesce(jsonb_agg(distinct x),'[]') into changes from (
      select value x from jsonb_array_elements_text(coalesce(previous->'changes','[]'))
      union all select 'bio' where new.bio is distinct from old.bio
      union all select 'photos' where (new.image_url,new.additional_images) is distinct from (old.image_url,old.additional_images)
    ) changed;
    label:=case when changes@>'["bio","photos"]' then 'bio and photos' when changes@>'["bio"]' then 'player bio' else 'player photos' end;
    perform record_following_activity(jsonb_build_object('event_key',activity_key,'kind','profile','local_player_ids',jsonb_build_array(new.id),
      'title',new.name||' updated their '||label,'photo_url',new.image_url,'path','/players/'||new.id,'payload',jsonb_build_object('changes',changes)));
  end if;
  if (new.rank_label,new.points) is distinct from (old.rank_label,old.points) then
    activity_key:='ranking:'||new.id||':'||(now() at time zone 'UTC')::date;
    select payload into previous from following_activity where event_key=activity_key;
    old_rank:=case when previous ? 'before_rank' then previous->>'before_rank' else old.rank_label end;
    old_points:=case when previous ? 'before_points' then (previous->>'before_points')::integer else old.points end;
    perform record_following_activity(jsonb_build_object('event_key',activity_key,'kind','ranking','local_player_ids',jsonb_build_array(new.id),
      'title',new.name||case when new.rank_label is distinct from old_rank and nullif(new.rank_label,'') is not null then ' moved to '||case when new.rank_label ~ '^#' then new.rank_label else '#'||new.rank_label end else ' has updated ranking points' end,
      'body','SAPA ranking update','photo_url',new.image_url,'path','/players/'||new.id,
      'payload',jsonb_build_object('before_rank',old_rank,'rank',new.rank_label,'before_points',old_points,'points',new.points)));
  end if;
  return new;
end $$;
revoke all on function public.following_profile_changed() from public,anon,authenticated;
commit;
