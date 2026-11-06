-- Synthetic data only; included within the isolated test transaction.
-- This measures database work, not 2,000 concurrent devices or provider delivery.
select set_config('request.jwt.claims','{}',true);
create temp table capacity_users as select n,md5('messaging-capacity-'||n)::uuid uid,'load-'||n||'@test.test' email from generate_series(10000,11999)n;
insert into auth.users(id,email) select uid,email from capacity_users;
insert into auth.sessions(id,user_id) select md5('capacity-session-'||n)::uuid,uid from capacity_users;
insert into public.players(id,email,name,region,racket_brand) select n,email,'Capacity player','Gauteng','Other' from capacity_users;
insert into public.player_profile_details(player_id,date_of_birth) select n,'1990-01-01' from capacity_users;
insert into messaging.accounts(user_id,player_id,rules_version) select uid,n,'2026-11-05' from capacity_users;
insert into public.calendar(id,event_name,start_date,end_date) select n,'Capacity event '||n,current_date,current_date from generate_series(10000,10099)n;
alter table public.event_registrations disable trigger messaging_registration_changed;
insert into public.event_registrations(event_id,email,payment_status) select 100,email,'paid' from capacity_users;
insert into public.event_registrations(event_id,email,payment_status) select 10000+n%100,email,'paid' from capacity_users;
alter table public.event_registrations enable trigger messaging_registration_changed;
insert into messaging.conversations(kind,event_id) select kind,n from generate_series(10000,10099)n cross join (values('event_announcements'),('event_discussion')) kinds(kind);
insert into messaging.members(conversation_id,user_id) select c.id,u.uid from messaging.conversations c cross join capacity_users u where c.event_id=100 or c.event_id=10000+u.n%100;
insert into public.player_push_tokens(email,token) select email,'ExponentPushToken[capacity-'||n||']' from capacity_users;
create temp table capacity_results(label text,ms numeric);
do $$declare started timestamptz; cid uuid; message jsonb; batch jsonb; snapshot jsonb;
begin
  perform pg_temp.login(4,'aal2');
  select id into cid from messaging.conversations where event_id=100 and kind='event_announcements';
  started:=clock_timestamp();
  message:=public.messaging_api('send',jsonb_build_object('conversationId',cid,'body','Synthetic capacity check','clientId',gen_random_uuid()));
  insert into capacity_results values('enqueue 2,000 recipients',extract(epoch from clock_timestamp()-started)*1000);
  perform pg_temp.expect((select count(*)>=2000 from messaging.deliveries where message_id=(message->>'id')::uuid),'one durable job per synthetic recipient');
  -- Previous tests leave leased jobs; this batch isolates the capacity message.
  update messaging.deliveries set available_at=now()+interval '1 day' where message_id<>(message->>'id')::uuid;
  update messaging.deliveries set available_at=now()-interval '1 second' where message_id=(message->>'id')::uuid;
  started:=clock_timestamp(); batch:=public.messaging_push_batch();
  insert into capacity_results values('claim + fresh context for 200 jobs',extract(epoch from clock_timestamp()-started)*1000);
  perform pg_temp.expect((batch->>'claimed')::int=200,'worker batch claims 200');
  perform pg_temp.expect((select bool_and(value->'context'->>'title'='4M Open' and value->'context'->>'path'='/messages/'||cid::text) from jsonb_array_elements(batch->'jobs')),'every event push has event title and exact chat path');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',md5('messaging-capacity-10000')::uuid,'email','load-10000@test.test','session_id',md5('capacity-session-10000')::uuid,'aal','aal1')::text,true);
  started:=clock_timestamp(); snapshot:=public.messaging_snapshot(false);
  insert into capacity_results values('own inbox snapshot across 100 events',extract(epoch from clock_timestamp()-started)*1000);
  perform pg_temp.expect(jsonb_array_length(snapshot->'rows')=4 and not exists(select 1 from jsonb_array_elements(snapshot->'rows') r where (r->>'eventId')::bigint not in (100,10000)),'capacity snapshot includes only this player event memberships');
end $$;
-- Exercise segmented fanout over the same 2,000-account fixture.
select set_config('request.jwt.claims','{}',true);
alter table public.event_registrations disable trigger messaging_registration_changed;
update public.event_registrations r set division_id=case when u.n%2=0 then 'a0000000-0000-0000-0000-000000000001'::uuid else 'a0000000-0000-0000-0000-000000000002'::uuid end from capacity_users u where r.event_id=100 and r.email=u.email;
alter table public.event_registrations enable trigger messaging_registration_changed;
do $$declare started timestamptz; cid uuid; result jsonb; post jsonb;
begin
  perform pg_temp.login(4,'aal2');select id into cid from messaging.conversations where event_id=100 and kind='event_announcements';
  started:=clock_timestamp();result:=public.messaging_api('audience',jsonb_build_object('conversationId',cid,'divisionIds',jsonb_build_array('a0000000-0000-0000-0000-000000000001')));
  insert into capacity_results values('division audience across 2,000 accounts',extract(epoch from clock_timestamp()-started)*1000);
  perform pg_temp.expect((result->>'selectedCount')::int=1000,'division count selects exactly half the synthetic accounts');
  started:=clock_timestamp();post:=public.messaging_api('send',jsonb_build_object('conversationId',cid,'body','Synthetic division capacity check','clientId',gen_random_uuid(),'divisionIds',jsonb_build_array('a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001')));
  insert into capacity_results values('enqueue 1,000 division recipients',extract(epoch from clock_timestamp()-started)*1000);
  perform pg_temp.expect((select count(*)=1000 from messaging.deliveries where message_id=(post->>'id')::uuid),'duplicate division IDs never duplicate recipients or queue jobs');
end $$;
select 'Messaging capacity: '||label||' = '||round(ms,1)||' ms' from capacity_results;
