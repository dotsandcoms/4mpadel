begin;
create or replace function public.following_tournament_changed() returns trigger
language plpgsql security definer set search_path=public as $$
declare c public.calendar; label text; kind text; rev text; url text;
begin
  if tg_table_name='calendar' then
    c:=new;
    if new.event_status='cancelled' and old.event_status is distinct from new.event_status then label:=' has been cancelled'; kind:='cancelled';
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
create or replace function public.refresh_following_activity() returns void
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
  -- Reuse the settled public changes behind tournament notifications. Recipient copy,
  -- payment messages and push preferences are never copied into the shared feed.
  for j in select jobs.event_id,jobs.revision,c.event_name,c.image_url,min(jobs.fire_at) fire_at,
      jsonb_agg(distinct jsonb_build_object('field',change->>'field','label',change->>'label','after',change->>'after')) changes
    from tournament_notification_jobs jobs join calendar c on c.id=jobs.event_id
      cross join lateral jsonb_array_elements(coalesce(jobs.data->'changes','[]')) change
    where jobs.active and jobs.type='event_updated' and jobs.fire_at<=now() and jobs.fire_at>=now()-interval '30 days'
      and c.is_visible=true and coalesce(c.registration_access,'public')='public'
      and exists(select 1 from event_notification_follows f where f.event_id=c.id and f.following)
    group by jobs.event_id,jobs.revision,c.event_name,c.image_url
  loop
    select string_agg((change->>'label')||': '||(change->>'after'),' · ' order by change->>'field') into body from jsonb_array_elements(j.changes) change;
    perform record_following_activity(jsonb_build_object('event_key','event:'||j.event_id||':details:'||j.revision,'kind','tournament','event_id',j.event_id,
      'title',j.event_name||' has updated tournament details','body',coalesce(body,''),'photo_url',j.image_url,'path','/events/'||j.event_id,
      'payload',jsonb_build_object('event_name',j.event_name,'update_type','details','changes',j.changes),'occurred_at',j.fire_at));
  end loop;
  -- Results can be completed before their draw is made public.
  for m in select dm.id,coalesce(dm.actual_finish,dm.updated_at) occurred_at from draw_matches dm join draws d on d.id=dm.draw_id
    where dm.status in ('completed','walkover','retired') and d.status in ('published','in_progress','completed') and dm.updated_at>=now()-interval '60 days'
  loop perform record_following_native_result(m.id,m.occurred_at); end loop;
end $$;
revoke all on function public.refresh_following_activity() from public,anon,authenticated;
grant execute on function public.refresh_following_activity() to service_role;

select public.refresh_following_activity();
commit;
