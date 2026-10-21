-- Real database fixtures are changed only inside this rolled-back transaction.
begin;
do $$
declare actor bigint; actor_name text; actor_photo text; event bigint; prefix text:=gen_random_uuid()::text; media jsonb; item public.following_activity; own uuid; own_email text; page jsonb;
begin
  select id,name,image_url into actor,actor_name,actor_photo from players where approved and image_url like 'https://%' and nationality='South African' limit 1;
  select id into event from calendar where is_visible and coalesce(registration_access,'public')='public' limit 1;
  select user_id,u.email into own,own_email from local_player_follows f join auth.users u on u.id=f.user_id limit 1;
  if actor is null or event is null or own is null then raise exception 'Fixtures unavailable'; end if;
  perform record_following_activity(jsonb_build_object('event_key',prefix||':media','kind','result','local_player_ids',jsonb_build_array(actor),'title','Presentation fixture','path','/players/'||actor,'payload',jsonb_build_object('teams',jsonb_build_array(actor_name||' / Unregistered fixture player','Unknown fixture team'))));
  select * into item from following_activity where event_key=prefix||':media';
  media:=following_activity_media(item);
  if media#>>'{actors,0,nationality}'<>'ZA' or media#>>'{participants,0,0,photo_url}'<>actor_photo then raise exception 'Public portrait or flag missing'; end if;
  if media#>>'{participants,0,1,photo_url}' is not null then raise exception 'Unknown player borrowed a photo'; end if;
  if following_country('South African')<>'ZA' or following_country('RSA')<>'ZA' or following_country('Argentina')<>'AR' or following_country('not a country') is not null or following_country('1234567890') is not null then raise exception 'Country aliases or invalid value failed'; end if;
  insert into event_notification_follows(event_id,email,following) values(event,lower(own_email),true) on conflict(event_id,email) do update set following=true;
  perform record_following_activity(jsonb_build_object('event_key',prefix||':deadline','kind','tournament','event_id',event,'title','Deadline fixture','path','/events/'||event,'payload',jsonb_build_object('update_type','registration_closing','registration_closes_at',now()-interval '1 day')));
  update calendar set registration_closes_at=now()+interval '2 days' where id=event;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',own,'email',own_email,'role','authenticated')::text,true);
  select x into page from jsonb_array_elements(get_following_feed('tournaments',50)->'items') x where x->>'title'='Deadline fixture';
  if page is null or (page#>>'{payload,registration_closes_at}')::timestamptz<>now()+interval '2 days' then raise exception 'Feed reused a stale notification deadline'; end if;
  if has_function_privilege('authenticated','public.following_activity_media(public.following_activity)','EXECUTE') or has_function_privilege('anon','public.following_country(text)','EXECUTE') then raise exception 'Presentation helpers exposed directly'; end if;
end $$;
rollback;
select 'PASS: approved portraits, country aliases, safe unknown players, current deadlines and scoped helper privileges' result;
