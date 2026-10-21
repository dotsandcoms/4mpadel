begin;

-- Shared facts, never client-authored posts or copies of private payment messages.
create table public.following_activity (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  kind text not null check (kind in ('entry','result','profile','ranking','match_live','match_schedule','tournament')),
  local_player_ids bigint[] not null default '{}',
  pro_player_ids bigint[] not null default '{}',
  event_id bigint references public.calendar(id) on delete cascade,
  native_match_id uuid references public.draw_matches(id) on delete cascade,
  pro_match_id integer,
  title text not null,
  body text not null default '',
  photo_url text,
  path text not null,
  payload jsonb not null default '{}',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index following_activity_time on public.following_activity(occurred_at desc,id desc);
create index following_activity_local on public.following_activity using gin(local_player_ids);
create index following_activity_pro on public.following_activity using gin(pro_player_ids);
create index following_activity_event on public.following_activity(event_id);
create index following_activity_match on public.following_activity(pro_match_id);
alter table public.following_activity enable row level security;
revoke all on public.following_activity from public,anon,authenticated;
grant all on public.following_activity to service_role;

create function public.record_following_activity(p_item jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare result uuid; locals bigint[]; pros bigint[];
begin
  if nullif(p_item->>'event_key','') is null or length(p_item->>'event_key')>500 then raise exception 'Invalid activity key'; end if;
  select coalesce(array_agg(distinct value::bigint),'{}') into locals from jsonb_array_elements_text(coalesce(p_item->'local_player_ids','[]'));
  select coalesce(array_agg(distinct value::bigint),'{}') into pros from jsonb_array_elements_text(coalesce(p_item->'pro_player_ids','[]'));
  insert into following_activity(event_key,kind,local_player_ids,pro_player_ids,event_id,native_match_id,pro_match_id,title,body,photo_url,path,payload,occurred_at)
  values(p_item->>'event_key',p_item->>'kind',locals,pros,(p_item->>'event_id')::bigint,(p_item->>'native_match_id')::uuid,(p_item->>'pro_match_id')::integer,
    left(p_item->>'title',400),left(coalesce(p_item->>'body',''),1000),p_item->>'photo_url',p_item->>'path',coalesce(p_item->'payload','{}'),coalesce((p_item->>'occurred_at')::timestamptz,now()))
  on conflict(event_key) do update set
    local_player_ids=(select coalesce(array_agg(distinct x),'{}') from unnest(following_activity.local_player_ids||excluded.local_player_ids) x),
    pro_player_ids=(select coalesce(array_agg(distinct x),'{}') from unnest(following_activity.pro_player_ids||excluded.pro_player_ids) x),
    title=excluded.title,body=excluded.body,photo_url=excluded.photo_url,path=excluded.path,payload=excluded.payload,
    occurred_at=greatest(following_activity.occurred_at,excluded.occurred_at)
  where (following_activity.title,following_activity.body,following_activity.photo_url,following_activity.payload,following_activity.local_player_ids@>excluded.local_player_ids,following_activity.pro_player_ids@>excluded.pro_player_ids)
    is distinct from (excluded.title,excluded.body,excluded.photo_url,excluded.payload,true,true)
  returning id into result;
  return result;
end $$;
revoke all on function public.record_following_activity(jsonb) from public,anon,authenticated;
grant execute on function public.record_following_activity(jsonb) to service_role;

create function public.get_following_feed(p_filter text default 'all',p_limit integer default 20,p_before timestamptz default null,p_before_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare rows jsonb; own_locals bigint[]; own_pros bigint[];
begin
  if auth.uid() is null then raise exception 'Sign in to view Following'; end if;
  if p_filter is null or p_filter not in ('all','players','matches','tournaments') or p_limit is null or p_limit not between 1 and 50 or (p_before is null)<>(p_before_id is null) then raise exception 'Invalid feed filter or cursor'; end if;
  select coalesce(array_agg(f.player_id),'{}') into own_locals from local_player_follows f join players p on p.id=f.player_id and p.approved=true where f.user_id=auth.uid();
  select coalesce(array_agg(f.player_id),'{}') into own_pros from pro_player_follows f where f.user_id=auth.uid();
  select coalesce(jsonb_agg(to_jsonb(x) order by x.occurred_at desc,x.id desc),'[]') into rows from (
    select a.id,a.kind,a.title,a.body,a.photo_url,a.path,a.payload,a.occurred_at,
      a.local_player_ids,a.pro_player_ids,a.event_id,a.native_match_id,a.pro_match_id
    from following_activity a
    where a.occurred_at<=now() and a.occurred_at>=now()-interval '90 days'
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
end $$;
revoke all on function public.get_following_feed(text,integer,timestamptz,uuid) from public,anon;
grant execute on function public.get_following_feed(text,integer,timestamptz,uuid) to authenticated;

create function public.following_profile_changed() returns trigger
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
    old_rank:=coalesce(previous->>'before_rank',old.rank_label); old_points:=coalesce((previous->>'before_points')::integer,old.points);
    perform record_following_activity(jsonb_build_object('event_key',activity_key,'kind','ranking','local_player_ids',jsonb_build_array(new.id),
      'title',new.name||case when new.rank_label is distinct from old_rank and nullif(new.rank_label,'') is not null then ' moved to '||case when new.rank_label ~ '^#' then new.rank_label else '#'||new.rank_label end else ' has updated ranking points' end,
      'body','SAPA ranking update','photo_url',new.image_url,'path','/players/'||new.id,
      'payload',jsonb_build_object('before_rank',old_rank,'rank',new.rank_label,'before_points',old_points,'points',new.points)));
  end if;
  return new;
end $$;
revoke all on function public.following_profile_changed() from public,anon,authenticated;
create trigger following_profile_changed after update of bio,image_url,additional_images,rank_label,points on public.players for each row execute function public.following_profile_changed();

create function public.record_following_entry(p_registration uuid,p_time timestamptz default now()) returns void
language plpgsql security definer set search_path=public as $$
declare r record; ids bigint[]; names text[]; photo text; key text;
begin
  select er.*,c.event_name,c.image_url event_photo into r from event_registrations er join calendar c on c.id=er.event_id
    where er.id=p_registration and er.payment_status in ('paid','comped') and er.status is distinct from 'withdrawn' and er.is_test is distinct from true
      and c.is_visible=true and coalesce(c.registration_access,'public')='public';
  if not found then return; end if;
  select array_agg(p.id order by p.id),array_agg(p.name order by p.id) into ids,names from players p
    where p.approved=true and lower(trim(p.email)) in (lower(trim(r.email)),lower(trim(r.partner_email)));
  if coalesce(array_length(ids,1),0)=0 then return; end if;
  select image_url into photo from players where id=ids[1];
  key:='entry:'||r.event_id||':'||coalesce(r.division_id::text,r.division,'open')||':'||array_to_string(ids,':');
  perform record_following_activity(jsonb_build_object('event_key',key,'kind','entry','local_player_ids',to_jsonb(ids),'event_id',r.event_id,
    'title',array_to_string(names,' & ')||' entered '||r.event_name,'body',coalesce(r.division,''),'photo_url',coalesce(photo,r.event_photo),
    'path','/events/'||r.event_id,'payload',jsonb_build_object('event_name',r.event_name,'division',r.division),'occurred_at',p_time));
end $$;
revoke all on function public.record_following_entry(uuid,timestamptz) from public,anon,authenticated;

create function public.following_entry_changed() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  perform record_following_entry(new.id);
  return new;
end $$;
revoke all on function public.following_entry_changed() from public,anon,authenticated;
create trigger following_entry_changed after insert or update of payment_status,status,partner_email on public.event_registrations for each row execute function public.following_entry_changed();

create function public.record_following_native_result(p_match uuid,p_time timestamptz default now()) returns void
language plpgsql security definer set search_path=public as $$
declare m record; ids bigint[]; teams jsonb; scores jsonb; score_label text; winner integer; title text;
begin
  select dm.*,d.event_id,d.division_id,c.event_name,a.player_one_id a1,a.player_two_id a2,b.player_one_id b1,b.player_two_id b2,
    coalesce(nullif(a.team_name,''),concat_ws(' / ',a.player_one_name,a.player_two_name)) one_name,
    coalesce(nullif(b.team_name,''),concat_ws(' / ',b.player_one_name,b.player_two_name)) two_name,
    (select image_url from players where id=a.player_one_id) photo
  into m from draw_matches dm join draws d on d.id=dm.draw_id join calendar c on c.id=d.event_id
    join draw_entries a on a.id=dm.entry_one_id join draw_entries b on b.id=dm.entry_two_id
  where dm.id=p_match and dm.status in ('completed','walkover','retired') and dm.winner_entry_id in (dm.entry_one_id,dm.entry_two_id)
    and d.status in ('published','in_progress','completed') and c.is_visible=true and coalesce(c.registration_access,'public')='public';
  if not found then return; end if;
  select coalesce(array_agg(distinct id),'{}') into ids from unnest(array[m.a1,m.a2,m.b1,m.b2]) id where id is not null;
  winner:=case when m.winner_entry_id=m.entry_one_id then 0 else 1 end;
  select coalesce(jsonb_agg(jsonb_build_array(entry_one_games,entry_two_games) order by set_number),'[]'),
    string_agg(case when winner=0 then entry_one_games||'–'||entry_two_games else entry_two_games||'–'||entry_one_games end,', ' order by set_number)
    into scores,score_label from draw_match_sets where match_id=m.id;
  if jsonb_array_length(scores)=0 and m.status<>'walkover' then return; end if;
  teams:=jsonb_build_array(m.one_name,m.two_name);
  title:=(teams->>winner)||case when m.status='walkover' then ' advanced by walkover against ' else ' won '||coalesce(score_label,'')||' against ' end||(teams->>(1-winner));
  perform record_following_activity(jsonb_build_object('event_key','native-result:'||m.id,'kind','result','local_player_ids',to_jsonb(ids),'event_id',m.event_id,'native_match_id',m.id,
    'title',title,'body',concat_ws(' · ',m.event_name,m.round_label),'photo_url',m.photo,'path','/events/'||m.event_id||'?division='||m.division_id||'&match='||m.id,
    'payload',jsonb_build_object('teams',teams,'scores',scores,'winner',winner,'event_name',m.event_name,'round',m.round_label,'result_type',m.result_type),'occurred_at',p_time));
end $$;
revoke all on function public.record_following_native_result(uuid,timestamptz) from public,anon,authenticated;

create function public.following_native_result_changed() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  perform record_following_native_result(case when tg_table_name='draw_match_sets' then (to_jsonb(new)->>'match_id')::uuid else new.id end);
  return new;
end $$;
revoke all on function public.following_native_result_changed() from public,anon,authenticated;
create constraint trigger following_native_result_changed after insert or update on public.draw_matches deferrable initially deferred for each row execute function public.following_native_result_changed();
create constraint trigger following_native_score_changed after insert or update on public.draw_match_sets deferrable initially deferred for each row execute function public.following_native_result_changed();

create function public.following_tournament_changed() returns trigger
language plpgsql security definer set search_path=public as $$
declare c public.calendar; label text; kind text; rev text; url text;
begin
  if tg_table_name='calendar' then
    c:=new;
    if new.event_status='cancelled' and old.event_status is distinct from new.event_status then label:=' has been cancelled'; kind:='cancelled';
    elsif (new.start_date,new.end_date,new.venue,new.registration_closes_at) is distinct from (old.start_date,old.end_date,old.venue,old.registration_closes_at) then label:=' has updated tournament details'; kind:='details';
    else return new; end if;
    rev:=md5(jsonb_build_array(new.event_status,new.start_date,new.end_date,new.venue,new.registration_closes_at)::text); url:='/events/'||c.id;
  else
    select * into c from calendar where id=new.event_id;
    if new.status='completed' and (tg_op='INSERT' or old.status is distinct from new.status) then label:=' has published final results'; kind:='results';
    elsif new.status in ('published','in_progress') and (tg_op='INSERT' or old.status not in ('published','in_progress','completed')) then label:=' has published a draw'; kind:='draw';
    else return new; end if;
    rev:=new.id::text; url:='/events/'||c.id||'?division='||new.division_id||'&tab='||case when kind='results' then 'Results' else 'Draws' end;
  end if;
  if c.is_visible is distinct from true or coalesce(c.registration_access,'public')<>'public' then return new; end if;
  perform record_following_activity(jsonb_build_object('event_key','event:'||c.id||':'||kind||':'||rev,'kind','tournament','event_id',c.id,
    'title',c.event_name||label,'body',coalesce(c.venue,c.city,''),'photo_url',c.image_url,'path',url,'payload',jsonb_build_object('event_name',c.event_name,'update_type',kind)));
  return new;
end $$;
revoke all on function public.following_tournament_changed() from public,anon,authenticated;
create trigger following_calendar_changed after update of event_status,start_date,end_date,venue,registration_closes_at on public.calendar for each row execute function public.following_tournament_changed();
create trigger following_draw_changed after insert or update of status on public.draws for each row execute function public.following_tournament_changed();

create function public.refresh_following_activity() returns void
language plpgsql security definer set search_path=public as $$
declare j record; label text; body text; m record;
begin
  -- Stage announcements are durable even when a recipient has disabled push.
  for j in select distinct jobs.event_id,jobs.topic,jobs.revision,jobs.type,jobs.fire_at,c.event_name,c.image_url,c.venue
    from tournament_notification_jobs jobs join calendar c on c.id=jobs.event_id
    where jobs.active and jobs.fire_at<=now() and jobs.fire_at>=now()-interval '30 days'
      and jobs.type in ('registration_open','early_bird_ending','registration_closing','registration_closed')
      and c.is_visible=true and coalesce(c.registration_access,'public')='public'
      and exists(select 1 from event_notification_follows f where f.event_id=c.id and f.following)
  loop
    label:=case j.type when 'registration_open' then 'Registration is open for ' when 'early_bird_ending' then 'Early bird entries end soon for '
      when 'registration_closing' then 'Entries close soon for ' when 'registration_closed' then 'Entries have closed for ' else 'Tournament details updated for ' end;
    perform record_following_activity(jsonb_build_object('event_key','stage:'||j.event_id||':'||j.topic||':'||j.revision,'kind','tournament','event_id',j.event_id,
      'title',label||j.event_name,'body',coalesce(j.venue,''),'photo_url',j.image_url,'path','/events/'||j.event_id,
      'payload',jsonb_build_object('event_name',j.event_name,'update_type',j.type),'occurred_at',j.fire_at));
  end loop;
  -- Results can be completed before their draw is made public.
  for m in select dm.id,coalesce(dm.actual_finish,dm.updated_at) occurred_at from draw_matches dm join draws d on d.id=dm.draw_id
    where dm.status in ('completed','walkover','retired') and d.status in ('published','in_progress','completed') and dm.updated_at>=now()-interval '60 days'
  loop perform record_following_native_result(m.id,m.occurred_at); end loop;
end $$;
revoke all on function public.refresh_following_activity() from public,anon,authenticated;
grant execute on function public.refresh_following_activity() to service_role;

-- External sources are leased, bounded and refreshed by the existing minute worker.
create table public.following_sync_state (
  source_key text primary key,
  snapshot jsonb not null default '{}',
  checked_at timestamptz,
  lease_id uuid,
  lease_until timestamptz
);
alter table public.following_sync_state enable row level security;
revoke all on public.following_sync_state from public,anon,authenticated;
grant all on public.following_sync_state to service_role;

create function public.claim_following_sources(p_limit integer default 6) returns jsonb
language plpgsql security definer set search_path=public as $$
declare item record; result jsonb:='[]'; lease uuid;
begin
  if p_limit not between 1 and 12 then raise exception 'Invalid batch size'; end if;
  for item in
    with targets as (
      select distinct 'local:'||p.id source_key,'local' source,p.id::text target_id,p.rankedin_id,p.name,p.image_url photo_url,interval '15 minutes' refresh
        from local_player_follows f join players p on p.id=f.player_id and p.approved=true where nullif(p.rankedin_id,'') is not null
      union all
      select distinct 'pro_player:'||f.player_id,'pro_player',f.player_id::text,null,f.player_name,null,interval '15 minutes' from pro_player_follows f
      union all
      select distinct 'pro_match:'||b.match_id,'pro_match',b.match_id::text,null,null,null,interval '1 minute'
        from pro_match_bookmarks b where b.bookmarked and b.expires_at>now()
    ) select t.*,s.snapshot from targets t left join following_sync_state s using(source_key)
      where (s.checked_at is null or s.checked_at<now()-t.refresh) and (s.lease_until is null or s.lease_until<now())
      order by s.checked_at nulls first,t.source_key limit p_limit
  loop
    lease:=gen_random_uuid();
    insert into following_sync_state(source_key,lease_id,lease_until) values(item.source_key,lease,now()+interval '3 minutes')
    on conflict(source_key) do update set lease_id=excluded.lease_id,lease_until=excluded.lease_until
      where following_sync_state.lease_until is null or following_sync_state.lease_until<now();
    if found then result:=result||jsonb_build_array(to_jsonb(item)||jsonb_build_object('lease_id',lease)); end if;
  end loop;
  return result;
end $$;
revoke all on function public.claim_following_sources(integer) from public,anon,authenticated;
grant execute on function public.claim_following_sources(integer) to service_role;

create function public.finish_following_source(p_key text,p_lease uuid,p_snapshot jsonb,p_items jsonb default '[]') returns void
language plpgsql security definer set search_path=public as $$
declare item jsonb;
begin
  perform 1 from following_sync_state where source_key=p_key and lease_id=p_lease for update;
  if not found then return; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>200 then raise exception 'Invalid activity batch'; end if;
  for item in select value from jsonb_array_elements(p_items) loop perform record_following_activity(item); end loop;
  update following_sync_state set snapshot=coalesce(p_snapshot,snapshot),checked_at=now(),lease_id=null,lease_until=null where source_key=p_key and lease_id=p_lease;
end $$;
revoke all on function public.finish_following_source(text,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.finish_following_source(text,uuid,jsonb,jsonb) to service_role;

-- Seed real recent activity without emitting historical push notifications.
do $$ declare r record; begin
  for r in select id,created_at from event_registrations where created_at>=now()-interval '60 days' and payment_status in ('paid','comped')
  loop perform record_following_entry(r.id,r.created_at); end loop;
  perform refresh_following_activity();
end $$;

commit;
