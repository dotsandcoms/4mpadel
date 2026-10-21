-- Run with the migration in a rolled-back transaction, or alone after deployment.
begin;
do $$
declare event bigint; division uuid; actor uuid; recipient_email text; prefix text:=gen_random_uuid()::text;
  before_state jsonb; after_state jsonb; changes jsonb; feed jsonb; item jsonb; row public.following_activity;
  draw_id uuid; job public.tournament_notification_jobs; outbox uuid; amount bigint; marker text;
begin
  select c.id,v.id into event,division from calendar c join tournament_divisions v on v.event_id=c.id
    where c.is_visible=true and coalesce(c.registration_access,'public')='public'
      and c.event_status is distinct from 'cancelled' and v.cancelled_at is null limit 1;
  select u.id,u.email into actor,recipient_email from auth.users u where u.email is not null
    and not exists(select 1 from event_notification_participants(event) p where p.email=lower(trim(u.email))) limit 1;
  if event is null or actor is null then raise exception 'Test fixtures unavailable'; end if;
  insert into event_notification_follows(event_id,email,following) values(event,lower(recipient_email),true)
    on conflict(event_id,email) do update set following=true;
  update calendar set registration_opens_at=now()-interval '1 day',registration_closes_at=now()+interval '12 hours',
    early_bird_ends_at=now()+interval '10 hours',early_bird_fee=100 where id=event;

  before_state:='{"event_name":"Old name","entry_fee":200,"early_bird_fee":100,"draw_released":"2026-11-01T10:00:00Z","venue":"Old club","start_date":"2026-11-02"}';
  after_state:=before_state||'{"event_name":"New sponsor name","entry_fee":300,"early_bird_fee":120,"draw_released":"2026-11-01T12:00:00Z"}';
  if notification_event_details(before_state)<>notification_event_details(after_state)
    or notification_event_changes(before_state,after_state)<>'[]' then raise exception 'Cosmetic edits still notify'; end if;
  perform plan_event_change_push(event,recipient_email,'Fixture tournament',before_state,after_state);
  if exists(select 1 from tournament_notification_jobs where event_id=event and email=lower(recipient_email) and topic='event-update' and active)
    then raise exception 'Name or fee change created a job'; end if;
  after_state:=after_state||'{"venue":"New club","start_date":"2026-11-03"}';
  changes:=notification_event_changes(before_state,after_state);
  if jsonb_array_length(changes)<>2 then raise exception 'Date/venue change filtering failed'; end if;
  perform plan_event_change_push(event,recipient_email,'Fixture tournament',before_state,after_state);
  select * into job from tournament_notification_jobs where event_id=event and email=lower(recipient_email) and topic='event-update';
  if not job.active or job.body not like '%Old club → New club%' or job.body like '%Tournament name%'
    or job.body like '%Entry fee%' then raise exception 'Mixed edits kept noise or lost useful change'; end if;
  perform plan_event_change_push(event,recipient_email,'Fixture tournament',after_state,before_state);
  if exists(select 1 from tournament_notification_jobs where id=job.id and active) then raise exception 'Reverted edits stayed active'; end if;
  if notification_event_changes('{"early_bird_ends_at":"2026-11-01T10:00:00Z"}','{}')<>'[]'
    then raise exception 'Unknown early bird deadline created a notice'; end if;

  perform record_following_activity(jsonb_build_object('event_key',prefix||':name','kind','tournament','event_id',event,
    'title','Cosmetic fixture','path','/events/'||event,'payload',jsonb_build_object('update_type','details','changes',
      jsonb_build_array(jsonb_build_object('field','event_name','after','New sponsor name','label','Tournament name')))));
  perform record_following_activity(jsonb_build_object('event_key',prefix||':mixed','kind','tournament','event_id',event,
    'title','Mixed fixture','path','/events/'||event,'payload',jsonb_build_object('update_type','details','changes',
      jsonb_build_array(jsonb_build_object('field','event_name','after','New sponsor name','label','Tournament name'),
        jsonb_build_object('field','venue','after','New club','label','Venue')))));
  perform record_following_activity(jsonb_build_object('event_key',prefix||':unknown-early','kind','tournament','event_id',event,
    'title','Unknown early fixture','path','/events/'||event,'payload',jsonb_build_object('update_type','details','changes',
      jsonb_build_array(jsonb_build_object('field','early_bird_ends_at','after','to be confirmed','label','Early bird ends')))));
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'email',recipient_email,'role','authenticated')::text,true);
  feed:=get_following_feed('tournaments',50);
  if exists(select 1 from jsonb_array_elements(feed->'items') x where x->>'title' in ('Cosmetic fixture','Unknown early fixture'))
    then raise exception 'Historical noise remained in the feed'; end if;
  select x into item from jsonb_array_elements(feed->'items') x where x->>'title'='Mixed fixture';
  if item is null or jsonb_array_length(item#>'{payload,changes}')<>1 or item#>>'{payload,changes,0,field}'<>'venue'
    then raise exception 'Mixed historical feed sanitization failed'; end if;

  select count(*) into amount from push_outbox;
  perform plan_tournament_push(event,recipient_email,prefix||':early',prefix,'early_bird_ending','Fixture early','private recipient copy',
    '/events/'||event,jsonb_build_object('field','early_bird_ends_at','at',now()+interval '10 hours'),now()-interval '1 second',now()+interval '10 hours');
  perform plan_tournament_push(event,recipient_email,prefix||':closing',prefix,'registration_closing','Fixture closing','private recipient copy',
    '/events/'||event,jsonb_build_object('field','registration_closes_at','at',now()+interval '12 hours'),now()-interval '1 second',now()+interval '12 hours');
  perform refresh_following_activity();
  if (select count(*) from following_activity where event_key in ('stage:'||event||':'||prefix||':early:'||prefix,
    'stage:'||event||':'||prefix||':closing:'||prefix))<>2 then raise exception 'Real deadline stages missing'; end if;
  select * into row from following_activity where event_key='stage:'||event||':'||prefix||':early:'||prefix;
  if row.body not like 'Early bird ends % SAST' or row.body like '%confirmed%' or row.body like '%private%'
    or following_activity_media(row)->>'registration_closes_at' is not null
    then raise exception 'Early bird deadline used recipient copy or wrong countdown'; end if;
  if (select count(*) from push_outbox)<>amount then raise exception 'Feed refresh duplicated pushes'; end if;

  -- Editing a private schedule is silent; publishing all its matches creates one post.
  insert into tournament_schedules(event_id,revision,source_fingerprint,status,assignments,published_assignments,published_revision)
    values(event,4001,'fixture','draft','{}','{}',null)
    on conflict(event_id) do update set status='draft',revision=4001,published_assignments='{}',published_revision=null;
  if exists(select 1 from following_activity where event_key='event:'||event||':schedule:4001') then raise exception 'Private schedule leaked'; end if;
  update tournament_schedules set status='published',published_revision=4001,
    published_assignments=jsonb_build_object(gen_random_uuid()::text,jsonb_build_object('court_name','Court 1','scheduled_start',now()+interval '2 days'),
      gen_random_uuid()::text,jsonb_build_object('court_name','Court 2','scheduled_start',now()+interval '2 days')) where event_id=event;
  update tournament_schedules set updated_at=now(),revision=4002 where event_id=event;
  if (select count(*) from following_activity where event_key='event:'||event||':schedule:4001')<>1
    or exists(select 1 from following_activity where event_key='event:'||event||':schedule:4002') then raise exception 'Schedule repeated per match or private revision'; end if;
  select * into job from tournament_notification_jobs where event_id=event and email=lower(recipient_email) and topic='tournament-schedule';
  if job.id is null or job.type<>'schedule_published' then raise exception 'Follower schedule push missing'; end if;
  outbox:=enqueue_push(recipient_email,job.type,job.title,job.body,job.path,job.data||jsonb_build_object('job_id',job.id,'revision',job.revision,'event_id',event));
  if push_delivery_context(outbox)?'skip' then raise exception 'Published schedule could not be delivered'; end if;
  update tournament_schedules set status='draft' where event_id=event;
  if not(push_delivery_context(outbox)?'skip') then raise exception 'Unpublished schedule push still delivered'; end if;
  update tournament_schedules set status='published',published_revision=4002 where event_id=event;
  if not(push_delivery_context(outbox)?'skip') then raise exception 'Superseded schedule push still delivered'; end if;
  if (select count(*) from following_activity where event_key='event:'||event||':schedule:4002')<>1 then raise exception 'Republished schedule missing'; end if;

  select id into draw_id from draws where division_id=division and draw_kind='main';
  if draw_id is null then
    insert into draws(event_id,division_id,draw_kind,format,status,seeding_method) values(event,division,'main','knockout','draft','manual') returning id into draw_id;
  else update draws set status='draft' where id=draw_id; end if;
  if exists(select 1 from tournament_notification_jobs where event_id=event and email=lower(recipient_email) and topic='followed-draw:'||draw_id and active)
    then update tournament_notification_jobs set active=false where event_id=event and email=lower(recipient_email) and topic='followed-draw:'||draw_id; end if;
  update draws set status='published' where id=draw_id;
  select * into job from tournament_notification_jobs where event_id=event and email=lower(recipient_email) and topic='followed-draw:'||draw_id;
  if job.id is null or not job.active then raise exception 'Follower draw announcement missing'; end if;
  outbox:=enqueue_push(recipient_email,job.type,job.title,job.body,job.path,job.data||jsonb_build_object('job_id',job.id,'revision',job.revision,'event_id',event));
  if push_delivery_context(outbox)?'skip' then raise exception 'Published draw could not be delivered'; end if;
  update draws set status='archived' where id=draw_id;
  if not(push_delivery_context(outbox)?'skip') then raise exception 'Archived draw push still delivered'; end if;
  update draws set status='published' where id=draw_id;
  update event_notification_follows set following=false where event_id=event and event_notification_follows.email=lower(recipient_email);
  if not(push_delivery_context(outbox)?'skip') then raise exception 'Unfollowed draw still delivered'; end if;
  if exists(select 1 from jsonb_array_elements(get_following_feed('tournaments',50)->'items') x where (x->>'event_id')::bigint=event)
    then raise exception 'Unfollowed tournament remained in the feed'; end if;
  update calendar set is_visible=false where id=event;
  update tournament_schedules set published_revision=4003 where event_id=event;
  if exists(select 1 from following_activity where event_key='event:'||event||':schedule:4003') then raise exception 'Hidden event schedule leaked'; end if;

  if has_function_privilege('anon','public.get_following_feed(text,integer,timestamptz,uuid)','EXECUTE')
    or has_function_privilege('authenticated','public.following_tournament_changes(jsonb)','EXECUTE')
    or has_function_privilege('authenticated','public.following_schedule_published()','EXECUTE')
    or has_function_privilege('anon','public.notify_followed_draw_published()','EXECUTE') then raise exception 'Private helper exposed'; end if;
end $$;
rollback;
select 'PASS: cosmetic silence, date/venue changes, historical filtering, real closing deadlines, publication deduplication, delivery invalidation and privileges' result;
