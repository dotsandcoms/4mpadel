-- Super Admin intervention is independent of a legacy single-event grant.
reset role;
insert into public.calendar(id,event_name,start_date,end_date,event_status,organisation_id) values
 (3100,'Cancelled intervention',current_date-14,current_date-14,'cancelled','30000000-0000-0000-0000-000000000001'),
 (3101,'Expired retention',current_date-100,current_date-100,null,'30000000-0000-0000-0000-000000000001');
set local role authenticated;
select pg_temp.login(4,'aal1');
select pg_temp.reject($q$select public.messaging_api('open_event','{"eventId":3100}')$q$,'two-factor');
select pg_temp.login(4,'aal2');
select public.messaging_api('open_event','{"eventId":3100}') as intervention_channels \gset
select (select value->>'id' from jsonb_array_elements(:'intervention_channels'::jsonb) where value->>'kind'='event_announcements') as intervention_announcements \gset
select pg_temp.expect(jsonb_array_length(:'intervention_channels'::jsonb)=2,'Super Admin opens both channels in another organisation');
select pg_temp.expect(public.messaging_event_directory('Cancelled intervention')->0->>'accessMode'='super_admin','directory labels server-verified global access');
select pg_temp.expect((public.messaging_event_analytics(3100)->'event'->>'postingOpen')::boolean,'analytics exposes the same intervention posting state');
select public.messaging_api('send',jsonb_build_object('conversationId',:'intervention_announcements','body','Event team support update','clientId',gen_random_uuid())) as intervention_post \gset
select pg_temp.expect(:'intervention_post'::jsonb->'sender'->>'role'='admin','intervention keeps the actual sender and Admin role');
reset role;
select pg_temp.expect(exists(select 1 from messaging.audit where actor_id='00000000-0000-0000-0000-000000000004' and action='event_admin_access' and event_id=3100),'cross-organisation access is audited against the event');
set local role authenticated;
select pg_temp.login(9,'aal2');
select pg_temp.expect(jsonb_array_length(public.messaging_api('open_event','{"eventId":3100}'))=2,'event owner keeps read access');
select pg_temp.reject(format('select public.messaging_api(''send'',%L)',jsonb_build_object('conversationId',:'intervention_announcements','body','Cannot bypass closure','clientId',gen_random_uuid())),'read-only');
select pg_temp.login(10,'aal2');
select pg_temp.reject($q$select public.messaging_api('open_event','{"eventId":3100}')$q$,'Register');
select pg_temp.login(4,'aal2');
select pg_temp.expect(jsonb_array_length(public.messaging_event_directory('Expired retention'))=0,'global access preserves event retention');
select pg_temp.reject(format('select public.messaging_api(''read'',%L)',jsonb_build_object('conversationId',:'dm')),'unavailable');
reset role;
update public.admin_sidebar_permissions set role='admin' where email='staff@test.test';
set local role authenticated;
select pg_temp.login(4,'aal2');
select set_config('request.jwt.claims',(current_setting('request.jwt.claims')::jsonb||'{"user_metadata":{"role":"super_admin"}}')::text,true);
select pg_temp.reject($q$select public.messaging_api('open_event','{"eventId":3100}')$q$,'Register');
reset role;
update public.admin_sidebar_permissions set role='super_admin' where email='staff@test.test';
