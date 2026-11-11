-- Read-state ownership and badges use real notifications, never pending actions.
reset role;
insert into public.push_outbox(id,email,type,title,body,path) values
 ('70000000-0000-0000-0000-000000000001','GROUP-51@test.test','admin_broadcast','First update','One','/(tabs)'),
 ('70000000-0000-0000-0000-000000000002','group-51@test.test','admin_broadcast','Second update','Two','/(tabs)'),
 ('70000000-0000-0000-0000-000000000003','group-52@test.test','admin_broadcast','Another account','Private','/(tabs)');
insert into public.push_outbox(email,type,title,not_before,obsolete) values
 ('group-51@test.test','admin_broadcast','Not published',now()+interval '1 day',false),
 ('group-51@test.test','admin_broadcast','Obsolete',now(),true);
update messaging.badge_cache set pending_count=90;
set local role authenticated;
select pg_temp.login(51);
select public.player_notification_api('list') as notice_snapshot \gset
select pg_temp.expect((:'notice_snapshot'::jsonb->>'unread')::int=2,'only own due notifications are unread');
select pg_temp.expect(jsonb_array_length(:'notice_snapshot'::jsonb->'items')=2,'other accounts, obsolete and future notifications stay private');
reset role;
select messaging.unread_total('00000000-0000-0000-0000-000000000051') as chat_unread \gset
set local role authenticated;
select pg_temp.expect(public.own_app_badge_unread()=:'chat_unread'::bigint+2,'icon badge combines notification and chat unread only');
select pg_temp.reject($q$select public.player_notification_api('read',array['70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000003']::uuid[])$q$,'unavailable');
select pg_temp.expect((public.player_notification_api('list')->>'unread')::int=2,'a mixed-account read fails atomically');
select public.player_notification_api('read',array['70000000-0000-0000-0000-000000000001']::uuid[]);
select pg_temp.expect(public.own_app_badge_unread()=:'chat_unread'::bigint+1,'reading one notification removes exactly one from the badge');
select public.player_notification_api('read',array['70000000-0000-0000-0000-000000000001']::uuid[]);
select pg_temp.expect(public.own_app_badge_unread()=:'chat_unread'::bigint+1,'reading again is idempotent');
reset role;
insert into public.push_outbox(email,type,title,created_at) values('group-51@test.test','admin_broadcast','After snapshot',clock_timestamp()+interval '1 second');
set local role authenticated;
select public.player_notification_api('read',null,(:'notice_snapshot'::jsonb->>'through')::timestamptz);
select pg_temp.expect((public.player_notification_api('list')->>'unread')::int=1,'mark-all read retains notifications arriving after its snapshot');
select pg_temp.login(52);
select pg_temp.expect((public.player_notification_api('list')->>'unread')::int=1,'reading one account cannot clear another account');
reset role;
select pg_temp.expect((messaging.badge_cache_api('cached','group-51@test.test')->>'pending')::int=0,'legacy pending-action cache never contributes');
select pg_temp.expect((messaging.badge_cache_api('cached','group-51@test.test')->>'total')::bigint=:'chat_unread'::bigint+1,'worker and app counts agree');
select pg_temp.expect(not has_function_privilege('anon','public.player_notification_api(text,uuid[],timestamptz)','EXECUTE'),'anonymous notification read RPC denied');
select pg_temp.expect(not has_function_privilege('authenticated','messaging.notification_snapshot(uuid)','EXECUTE'),'arbitrary account snapshots denied');
select pg_temp.expect(not has_table_privilege('authenticated','public.push_outbox','SELECT,UPDATE'),'notification rows remain RPC-only');
set local role authenticated;
select pg_temp.login(56);
select pg_temp.expect(public.own_app_badge_unread()=0,'no unread items means zero even when actions are pending');
reset role;
