-- Share the same useful tournament facts with mobile, web and push delivery.
begin;

create or replace function public.notification_event_details(p_state jsonb) returns jsonb
language sql immutable set search_path=public as $$
  select jsonb_object_agg(field,coalesce(nullif(trim(p_state->>field),''),'') order by field)
  from unnest(array['start_date','end_date','venue','city','registration_closes_at','early_bird_ends_at']) field;
$$;

create or replace function public.notification_event_changes(p_before jsonb,p_after jsonb) returns jsonb
language sql stable set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object('field',field,'label',label,
    'before',notification_event_value(field,p_before->>field),
    'after',notification_event_value(field,p_after->>field)) order by position),'[]'::jsonb)
  from (values (1,'start_date','Tournament starts'),(2,'end_date','Tournament ends'),
    (3,'venue','Venue'),(4,'city','City'),(5,'registration_closes_at','Entries close'),
    (6,'early_bird_ends_at','Early bird ends')) fields(position,field,label)
  where coalesce(nullif(trim(p_before->>field),''),'') is distinct from coalesce(nullif(trim(p_after->>field),''),'')
    and (field<>'early_bird_ends_at' or nullif(trim(p_after->>field),'') is not null);
$$;

create or replace function public.plan_event_change_push(p_event bigint,p_email text,p_label text,p_before jsonb,p_after jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare previous tournament_notification_jobs; baseline jsonb; details jsonb; changes jsonb; copy text; heading text;
begin
  select * into previous from tournament_notification_jobs
    where event_id=p_event and email=lower(trim(p_email)) and topic='event-update' for update;
  baseline:=notification_event_details(p_before); details:=notification_event_details(p_after);
  if previous.active and previous.expires_at>now() and previous.fired_revision is distinct from previous.revision
    and previous.data ? 'event_before' then baseline:=notification_event_details(previous.data->'event_before'); end if;
  changes:=notification_event_changes(baseline,details);
  if jsonb_array_length(changes)=0 then
    update tournament_notification_jobs set active=false where id=previous.id;
    update push_outbox set obsolete=true where id=previous.outbox_id and status<>'sent';
    return;
  end if;
  select string_agg((change->>'label')||': '||(change->>'before')||' → '||(change->>'after'),'; ' order by ordinality)
    into copy from jsonb_array_elements(changes) with ordinality items(change,ordinality);
  heading:=case when jsonb_array_length(changes)=1 then case changes->0->>'field'
    when 'start_date' then 'Tournament date changed' when 'end_date' then 'Tournament date changed'
    when 'venue' then 'Tournament venue changed' when 'city' then 'Tournament venue changed'
    when 'registration_closes_at' then 'Entry deadline changed'
    when 'early_bird_ends_at' then 'Early bird deadline changed' else 'Tournament details changed' end
    else 'Tournament details changed' end;
  perform plan_tournament_push(p_event,p_email,'event-update',md5(details::text),'event_updated',heading,
    p_label||' — '||copy||'.','/events/'||p_event,
    jsonb_build_object('audience','interested','event_revision',md5(details::text),'event_details',details,
      'event_before',baseline,'changes',changes),now()+interval '60 seconds',now()+interval '24 hours');
end $$;

-- Older posts keep their timestamps, but cosmetic edits cannot appear in a feed.
create function public.following_tournament_changes(p_changes jsonb) returns jsonb
language sql immutable set search_path=public as $$
  select coalesce(jsonb_agg(change order by ordinality),'[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(p_changes)='array' then p_changes else '[]'::jsonb end)
    with ordinality items(change,ordinality)
  where change->>'field' in ('start_date','end_date','venue','city','registration_closes_at','early_bird_ends_at')
    and (change->>'field'<>'early_bird_ends_at' or nullif(trim(change->>'after'),'') is not null
      and change->>'after'<>'to be confirmed');
$$;
revoke all on function public.following_tournament_changes(jsonb) from public,anon,authenticated;

create function public.following_tournament_relevant(p_item public.following_activity) returns boolean
language sql stable set search_path=public as $$
  select p_item.kind<>'tournament' or case p_item.payload->>'update_type'
    when 'details' then jsonb_array_length(following_tournament_changes(p_item.payload->'changes'))>0
    when 'early_bird_ending' then exists(select 1 from calendar c where c.id=p_item.event_id
      and c.early_bird_ends_at is not null and c.early_bird_fee is not null)
    else coalesce(p_item.payload->>'update_type' in ('registration_closing','draw','schedule','cancelled','results'),false) end;
$$;
revoke all on function public.following_tournament_relevant(public.following_activity) from public,anon,authenticated;

create or replace function public.refresh_following_activity() returns void
language plpgsql security definer set search_path=public as $$
declare j record; label text; body text; m record;
begin
  -- One public post for each real deadline, independent of recipients/push preferences.
  for j in select distinct jobs.event_id,jobs.topic,jobs.revision,jobs.type,jobs.fire_at,
      c.event_name,c.image_url,c.venue,
      case jobs.type when 'early_bird_ending' then c.early_bird_ends_at else c.registration_closes_at end deadline
    from tournament_notification_jobs jobs join calendar c on c.id=jobs.event_id
    where jobs.active and jobs.fire_at<=now() and jobs.fire_at>=now()-interval '30 days'
      and jobs.type in ('early_bird_ending','registration_closing')
      and c.is_visible=true and coalesce(c.registration_access,'public')='public' and c.event_status is distinct from 'cancelled'
      and (jobs.data->>'at')::timestamptz=case jobs.type when 'early_bird_ending' then c.early_bird_ends_at else c.registration_closes_at end
      and (jobs.type<>'early_bird_ending' or c.early_bird_fee is not null)
      and exists(select 1 from event_notification_follows f where f.event_id=c.id and f.following)
  loop
    label:=case j.type when 'early_bird_ending' then 'Early bird entries end soon for ' else 'Entries close soon for ' end;
    body:=case j.type when 'early_bird_ending' then 'Early bird ends ' else 'Entries close ' end
      ||to_char(j.deadline at time zone 'Africa/Johannesburg','DD Mon YYYY, HH24:MI')||' SAST';
    perform record_following_activity(jsonb_build_object('event_key','stage:'||j.event_id||':'||j.topic||':'||j.revision,
      'kind','tournament','event_id',j.event_id,'title',label||j.event_name,'body',body,'photo_url',j.image_url,
      'path','/events/'||j.event_id,'payload',jsonb_build_object('event_name',j.event_name,'update_type',j.type,
        'deadline_at',j.deadline),'occurred_at',j.fire_at));
  end loop;
  for j in select jobs.event_id,jobs.revision,c.event_name,c.image_url,min(jobs.fire_at) fire_at,
      jsonb_agg(distinct jsonb_build_object('field',change->>'field','label',change->>'label','after',change->>'after')) changes
    from tournament_notification_jobs jobs join calendar c on c.id=jobs.event_id
      cross join lateral jsonb_array_elements(following_tournament_changes(jobs.data->'changes')) change
    where jobs.active and jobs.type='event_updated' and jobs.fire_at<=now() and jobs.fire_at>=now()-interval '30 days'
      and c.is_visible=true and coalesce(c.registration_access,'public')='public'
      and exists(select 1 from event_notification_follows f where f.event_id=c.id and f.following)
    group by jobs.event_id,jobs.revision,c.event_name,c.image_url
  loop
    select string_agg((change->>'label')||': '||(change->>'after'),' · ' order by change->>'field')
      into body from jsonb_array_elements(j.changes) change;
    perform record_following_activity(jsonb_build_object('event_key','event:'||j.event_id||':details:'||j.revision,
      'kind','tournament','event_id',j.event_id,'title',j.event_name||' has updated tournament details','body',coalesce(body,''),
      'photo_url',j.image_url,'path','/events/'||j.event_id,
      'payload',jsonb_build_object('event_name',j.event_name,'update_type','details','changes',j.changes),'occurred_at',j.fire_at));
  end loop;
  for m in select dm.id,coalesce(dm.actual_finish,dm.updated_at) occurred_at from draw_matches dm join draws d on d.id=dm.draw_id
    where dm.status in ('completed','walkover','retired') and d.status in ('published','in_progress','completed')
      and dm.updated_at>=now()-interval '60 days'
  loop perform record_following_native_result(m.id,m.occurred_at); end loop;
end $$;

-- Publication is one event, regardless of how many matches the schedule contains.
create function public.following_schedule_published() returns trigger
language plpgsql security definer set search_path=public as $$
declare c public.calendar; follower record;
begin
  if new.status<>'published' or new.published_revision is null or jsonb_typeof(new.published_assignments) is distinct from 'object' or new.published_assignments='{}'::jsonb then return new; end if;
  if tg_op='UPDATE' and new.published_revision is not distinct from old.published_revision then return new; end if;
  select * into c from calendar where id=new.event_id;
  if c.is_visible is distinct from true or coalesce(c.registration_access,'public')<>'public'
    or c.event_status='cancelled' then return new; end if;
  perform record_following_activity(jsonb_build_object('event_key','event:'||c.id||':schedule:'||new.published_revision,
    'kind','tournament','event_id',c.id,'title',c.event_name||' has published the tournament schedule',
    'body','Court assignments and match times are ready to view.','photo_url',c.image_url,'path','/events/'||c.id||'?tab=Draws',
    'payload',jsonb_build_object('event_name',c.event_name,'update_type','schedule','published_revision',new.published_revision)));
  for follower in select f.email from event_notification_follows f where f.event_id=c.id and f.following
    and not exists(select 1 from event_notification_participants(c.id) p where p.email=f.email)
  loop
    perform plan_tournament_push(c.id,follower.email,'tournament-schedule',new.published_revision::text,
      'schedule_published','Tournament schedule published',c.event_name||': court assignments and match times are ready to view.',
      '/events/'||c.id||'?tab=Draws',jsonb_build_object('audience','follower','published_revision',new.published_revision),
      now()+interval '60 seconds',now()+interval '24 hours');
  end loop;
  return new;
end $$;
revoke all on function public.following_schedule_published() from public,anon,authenticated;
create trigger following_schedule_published after insert or update on public.tournament_schedules
  for each row execute function public.following_schedule_published();

-- Entrants already receive a draw alert; opted-in spectators receive it once too.
create function public.notify_followed_draw_published() returns trigger
language plpgsql security definer set search_path=public as $$
declare c public.calendar; follower record;
begin
  if new.status<>'published' then return new; end if;
  if tg_op='UPDATE' and old.status='published' then return new; end if;
  select * into c from calendar where id=new.event_id;
  if c.is_visible is distinct from true or coalesce(c.registration_access,'public')<>'public'
    or c.event_status='cancelled' then return new; end if;
  for follower in select f.email from event_notification_follows f where f.event_id=c.id and f.following
    and not exists(select 1 from event_registrations r where r.division_id=new.division_id
      and r.status is distinct from 'withdrawn' and f.email in (lower(trim(r.email)),lower(trim(r.partner_email))))
  loop
    perform plan_tournament_push(c.id,follower.email,'followed-draw:'||new.id,new.id::text,'draws_ready',
      'Draws are ready','The draw for '||c.event_name||' is ready.',
      '/events/'||c.id||'?division='||new.division_id||'&tab=Draws',
      jsonb_build_object('audience','draw-follower','draw_id',new.id),now()+interval '60 seconds',now()+interval '24 hours');
  end loop;
  return new;
end $$;
revoke all on function public.notify_followed_draw_published() from public,anon,authenticated;
create trigger notify_followed_draw_published after insert or update on public.draws
  for each row execute function public.notify_followed_draw_published();

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
    select c.image_url,c.registration_closes_at,c.early_bird_ends_at,c.start_date,c.end_date into event from calendar c where c.id=p_activity.event_id and c.is_visible=true and coalesce(c.registration_access,'public')='public';
    if found then presentation:=presentation||jsonb_build_object('event_image_url',event.image_url,'registration_closes_at',case when p_activity.payload->>'update_type'='early_bird_ending' then null else event.registration_closes_at end,'early_bird_ends_at',event.early_bird_ends_at,'event_start_date',event.start_date,'event_end_date',event.end_date); end if;
  end if;
  return presentation;
end $function$;


CREATE OR REPLACE FUNCTION public.get_following_feed(p_filter text DEFAULT 'all'::text, p_limit integer DEFAULT 20, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare rows jsonb; own_locals bigint[]; own_pros bigint[];
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
  return jsonb_build_object('items',(select coalesce(jsonb_agg(value order by ordinality),'[]') from jsonb_array_elements(rows) with ordinality where ordinality<=p_limit),'has_more',jsonb_array_length(rows)>p_limit);
end $function$;


CREATE OR REPLACE FUNCTION public.push_delivery_context(p_outbox uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE o public.push_outbox; j public.tournament_notification_jobs; c public.calendar; prefs jsonb; until_time timestamptz; valid boolean:=true; m jsonb;
BEGIN
 SELECT * INTO o FROM push_outbox WHERE id=p_outbox;
 IF o.id IS NULL OR o.obsolete OR o.expires_at<=now() THEN RETURN jsonb_build_object('skip','Notification superseded or expired'); END IF;
 prefs:=push_preferences_for_email(o.email);
 IF o.data->>'followed_event'='true' AND (prefs->>'followed_events'='false' OR NOT EXISTS(SELECT 1 FROM event_notification_follows WHERE event_id=(o.data->>'event_id')::bigint AND email=o.email AND following)) THEN RETURN jsonb_build_object('skip','Event no longer followed'); END IF;
 IF o.data ? 'job_id' THEN
  SELECT * INTO j FROM tournament_notification_jobs WHERE id=(o.data->>'job_id')::uuid;
  SELECT * INTO c FROM calendar WHERE id=j.event_id;
  valid:=j.id IS NOT NULL AND j.active AND j.revision=o.data->>'revision' AND j.expires_at>now() AND c.is_visible IS DISTINCT FROM false AND (c.sanction_status IS NULL OR c.sanction_status='approved') AND c.event_status IS DISTINCT FROM 'cancelled';
  IF j.data->>'audience'='follower' THEN
   valid:=valid AND EXISTS(SELECT 1 FROM event_notification_follows WHERE event_id=j.event_id AND email=o.email AND following)
    AND (j.type='registration_closed' OR NOT EXISTS(SELECT 1 FROM event_notification_participants(j.event_id) p WHERE p.email=o.email)) AND prefs->>'followed_events' IS DISTINCT FROM 'false';
  ELSIF j.data->>'audience'='draw-follower' THEN
   valid:=valid AND c.registration_access IS DISTINCT FROM 'private' AND EXISTS(SELECT 1 FROM event_notification_follows WHERE event_id=j.event_id AND email=o.email AND following)
    AND prefs->>'followed_events' IS DISTINCT FROM 'false';
  ELSIF j.data->>'audience' IN('participant','match') THEN
   valid:=valid AND EXISTS(SELECT 1 FROM event_notification_participants(j.event_id,nullif(j.data->>'division_id','')::uuid) p WHERE p.email=o.email);
  ELSIF j.data->>'audience'='interested' THEN
   valid:=valid AND (EXISTS(SELECT 1 FROM event_notification_participants(j.event_id) p WHERE p.email=o.email) OR (prefs->>'followed_events' IS DISTINCT FROM 'false' AND EXISTS(SELECT 1 FROM event_notification_follows WHERE event_id=j.event_id AND email=o.email AND following)));
  ELSIF j.data->>'audience'='unpaid' THEN
   valid:=valid AND EXISTS(SELECT 1 FROM event_registrations r LEFT JOIN tournament_divisions v ON v.id=r.division_id WHERE r.id=(j.data->>'registration_id')::uuid AND lower(trim(r.email))=o.email AND r.status IS DISTINCT FROM 'withdrawn' AND r.payment_status NOT IN('paid','comped','refunded') AND v.cancelled_at IS NULL AND least(coalesce(v.entries_close_at,c.registration_closes_at),coalesce(c.registration_closes_at,v.entries_close_at))=(j.data->>'deadline')::timestamptz);
  ELSIF j.data->>'audience'='award' THEN
   valid:=valid AND EXISTS(SELECT 1 FROM player_ranking_points a JOIN players p ON p.id=a.player_id WHERE a.id=(j.data->>'award_id')::uuid AND lower(trim(p.email))=o.email AND a.points=(j.data->>'points')::integer AND a.round_code=j.data->>'round' AND to_jsonb(a.reversal_of) IS NOT DISTINCT FROM nullif(j.data->'reversal','null'));
  END IF;
  IF j.type='registration_closed' AND j.data->>'audience'='follower' THEN valid:=valid AND EXISTS(SELECT 1 FROM event_notification_follows WHERE event_id=j.event_id AND email=o.email AND following AND created_at<=(j.data->>'at')::timestamptz); END IF;
  IF j.type='early_bird_ending' THEN valid:=valid AND c.early_bird_fee IS NOT NULL AND (c.registration_closes_at IS NULL OR c.registration_closes_at>now()); END IF;
  IF j.type IN('registration_open','registration_closing') THEN valid:=valid AND (c.registration_closes_at IS NULL OR c.registration_closes_at>now()); END IF;
  IF j.data ? 'field' THEN valid:=valid AND nullif(to_jsonb(c)->>(j.data->>'field'),'')::timestamptz=(j.data->>'at')::timestamptz; END IF;
  IF j.data ? 'published_revision' THEN
   valid:=valid AND coalesce(c.registration_access,'public')='public'
    AND EXISTS(SELECT 1 FROM tournament_schedules s WHERE s.event_id=j.event_id AND s.status='published' AND s.published_revision=(j.data->>'published_revision')::integer);
  END IF;
  IF j.data ? 'draw_id' THEN
   valid:=valid AND coalesce(c.registration_access,'public')='public'
    AND EXISTS(SELECT 1 FROM draws d JOIN tournament_divisions v ON v.id=d.division_id WHERE d.id=(j.data->>'draw_id')::uuid AND d.event_id=j.event_id AND d.status IN('published','in_progress','completed') AND v.cancelled_at IS NULL);
  END IF;
  IF j.data ? 'match_id' THEN
   m:=notification_match_state((j.data->>'match_id')::uuid);
   valid:=valid AND md5(m::text)=j.data->>'state' AND EXISTS(SELECT 1 FROM notification_match_recipients((j.data->>'match_id')::uuid) p WHERE p.email=o.email)
    AND EXISTS(SELECT 1 FROM draw_matches mm JOIN draws d ON d.id=mm.draw_id JOIN tournament_divisions v ON v.id=d.division_id WHERE mm.id=(j.data->>'match_id')::uuid AND d.status IN('published','in_progress','completed') AND v.cancelled_at IS NULL);
   IF j.type='match_reminder' THEN valid:=valid AND coalesce((prefs->>'reminder_minutes')::int,30)=(j.data->>'reminder_minutes')::int AND (m->>'start')::timestamptz>now() AND m->>'status' IN('pending','scheduled'); END IF;
  END IF;
  IF j.data ? 'finalisation' THEN valid:=valid AND EXISTS(SELECT 1 FROM tournament_finalisations tf WHERE tf.event_id=j.event_id AND tf.division_id=(j.data->>'division_id')::uuid AND tf.fingerprint=j.data->>'finalisation'); END IF;
  IF j.data ? 'event_details' THEN valid:=valid AND notification_event_details(to_jsonb(c))=j.data->'event_details';
  ELSIF j.data ? 'event_revision' THEN valid:=valid AND md5(jsonb_build_array(to_jsonb(c)->'start_date',to_jsonb(c)->'end_date',to_jsonb(c)->'venue',to_jsonb(c)->'registration_closes_at',to_jsonb(c)->'draw_released')::text)=j.data->>'event_revision'; END IF;
 END IF;
 IF valid IS DISTINCT FROM true THEN RETURN jsonb_build_object('skip','Tournament update is no longer relevant'); END IF;
 until_time:=greatest(o.not_before,notification_quiet_until(prefs));
 IF until_time>=coalesce(o.expires_at,o.created_at+interval '24 hours') THEN RETURN jsonb_build_object('skip','Update expires during quiet hours'); END IF;
 RETURN jsonb_build_object('defer_until',until_time,'preferences',prefs);
END $function$;

-- Sanitize the already settled queue without replaying delivered announcements.
update public.tournament_notification_jobs j set active=false
where j.type='event_updated' and jsonb_array_length(public.following_tournament_changes(j.data->'changes'))=0;
update public.push_outbox o set obsolete=true from public.tournament_notification_jobs j
where o.id=j.outbox_id and j.type='event_updated' and not j.active;
update public.tournament_notification_jobs j set
  data=j.data||jsonb_build_object('changes',public.following_tournament_changes(j.data->'changes'),
    'event_details',public.notification_event_details(j.data->'event_details')),
  title='Tournament details changed',
  body=c.event_name||' — '||(select string_agg((change->>'label')||': '||
    coalesce((change->>'before')||' → ','')||(change->>'after'),'; ' order by ordinality)
    from jsonb_array_elements(public.following_tournament_changes(j.data->'changes')) with ordinality items(change,ordinality))||'.'
from public.calendar c where j.event_id=c.id and j.type='event_updated' and j.active;
update public.push_outbox o set title=j.title,body=j.body,
  data=o.data||jsonb_build_object('changes',j.data->'changes','event_details',j.data->'event_details')
from public.tournament_notification_jobs j where o.id=j.outbox_id and j.type='event_updated' and j.active and o.status<>'sent';
update public.following_activity a set
  payload=a.payload||jsonb_build_object('changes',public.following_tournament_changes(a.payload->'changes')),
  body=coalesce((select string_agg((change->>'label')||': '||(change->>'after'),' · ' order by ordinality)
    from jsonb_array_elements(public.following_tournament_changes(a.payload->'changes')) with ordinality items(change,ordinality)),'')
where a.kind='tournament' and a.payload->>'update_type'='details';

select public.refresh_following_activity();
commit;

