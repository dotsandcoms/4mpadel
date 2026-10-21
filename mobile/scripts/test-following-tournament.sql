-- Run through the Supabase SQL tool. Every fixture change is rolled back.
begin;
do $$
declare event bigint; own uuid; own_email text; second_email text; revision text:=gen_random_uuid()::text; item jsonb; push_count bigint;
begin
  select id into event from calendar where is_visible=true and coalesce(registration_access,'public')='public' limit 1;
  select id,email into own,own_email from auth.users where email is not null limit 1;
  select email into second_email from auth.users where id<>own and email is not null limit 1;
  insert into event_notification_follows(event_id,email,following) values(event,lower(own_email),true)
    on conflict(event_id,email) do update set following=true;
  select count(*) into push_count from push_outbox;
  perform plan_tournament_push(event,own_email,'following-test',revision,'event_updated','Venue changed','PRIVATE RECIPIENT COPY','/events/'||event,
    jsonb_build_object('changes',jsonb_build_array(jsonb_build_object('field','venue','label','Venue','before','Old venue','after','Published venue'))),now()-interval '1 second',now()+interval '1 day');
  perform plan_tournament_push(event,second_email,'following-test',revision,'event_updated','Venue changed','OTHER PRIVATE COPY','/events/'||event,
    jsonb_build_object('changes',jsonb_build_array(jsonb_build_object('field','venue','label','Venue','before','Different baseline','after','Published venue'))),now()-interval '1 second',now()+interval '1 day');
  perform refresh_following_activity();
  if (select count(*) from following_activity where event_key='event:'||event||':details:'||revision)<>1 then raise exception 'Recipient notifications duplicated public activity'; end if;
  select to_jsonb(a) into item from following_activity a where event_key='event:'||event||':details:'||revision;
  if item->>'body'<>'Venue: Published venue' or item::text like '%PRIVATE%' or item::text like '%Different baseline%' then raise exception 'Private or recipient-dependent copy exposed'; end if;
  if (select count(*) from push_outbox)<>push_count then raise exception 'Feed refresh generated a push'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',own,'email',own_email,'role','authenticated')::text,true);
  if not exists(select 1 from jsonb_array_elements(get_following_feed('tournaments')->'items') x where x->>'id'=item->>'id') then raise exception 'Event update missing from subscriber feed'; end if;
end $$;
rollback;
select 'PASS: event notifications share one feed record, use only public copy and do not send duplicate pushes' result;
