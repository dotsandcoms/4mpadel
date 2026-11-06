-- Real RPC and worker tests; contained inside the disposable test transaction.
reset role;
select set_config('request.jwt.claims','{}',true);
create temp table notification_pref_baseline as select id,notification_prefs from public.players where id in (1,2,4);
update public.players set notification_prefs='{}' where id in (1,2,4);
-- Earlier assertions already exercise send limits; isolate this scenario's clock.
update messaging.audit set created_at=clock_timestamp()-interval '15 seconds' where action='send';
update public.event_registrations set payment_status='paid',status='registered' where event_id=100 and email='bob@test.test';
set local role authenticated;
select pg_temp.login(2);
select public.messaging_api('open_event','{"eventId":100}');
select public.messaging_api('notification_preferences','{"chat_discussion":"replies","chat_announcements":false}');
select pg_temp.reject($q$select public.messaging_api('notification_preferences','{"chat_discussion":"mentions"}')$q$,'Choose');
select pg_temp.reject($q$select public.messaging_api('notification_preferences','{"chat_private":"false"}')$q$,'valid');
select pg_temp.reject($q$select public.messaging_api('notification_preferences','{"playerId":1,"chat_announcements":false}')$q$,'valid');
select pg_temp.login(3);
select pg_temp.reject($q$select public.messaging_api('notification_preferences','{"chat_private":false}')$q$,'Sign in again');
reset role;
select pg_temp.expect((select notification_prefs='{}'::jsonb from public.players where id=1),'preference write affects only the current verified account');
select pg_temp.expect(not has_function_privilege('authenticated','messaging.save_alert_preferences(jsonb)','execute'),'private preference helper cannot be called directly');
set local role authenticated;
select pg_temp.login(4,'aal2');
select public.messaging_api('send',jsonb_build_object('conversationId',:'announcements','body','Silent announcement','clientId',gen_random_uuid())) as silent_announcement \gset
reset role;
select pg_temp.expect(not exists(select 1 from messaging.deliveries where message_id=(:'silent_announcement'::jsonb->>'id')::uuid and user_id='00000000-0000-0000-0000-000000000002'),'disabled announcements never enqueue a recipient push');
set local role authenticated;
select pg_temp.login(2);
select pg_temp.expect(public.messaging_api('read',jsonb_build_object('conversationId',:'announcements'))->'conversation'->'notificationMessageId'='null'::jsonb,'disabled announcements never create a foreground alert');
select pg_temp.expect(exists(select 1 from jsonb_array_elements(public.messaging_api('read',jsonb_build_object('conversationId',:'announcements'))->'messages') m where m->>'id'=:'silent_announcement'::jsonb->>'id'),'notification choice does not hide readable messages');
select public.messaging_api('mark_read',jsonb_build_object('conversationId',:'discussion','seq',9223372036854775807));
select public.messaging_api('send',jsonb_build_object('conversationId',:'discussion','body','My question','clientId',gen_random_uuid())) as own_question \gset
select pg_temp.login(4,'aal2');
select public.messaging_api('send',jsonb_build_object('conversationId',:'discussion','body','Direct answer','clientId',gen_random_uuid(),'replyId',:'own_question'::jsonb->>'id')) as own_reply \gset
select public.messaging_api('send',jsonb_build_object('conversationId',:'discussion','body','General event discussion','clientId',gen_random_uuid())) as general_discussion \gset
reset role;
select pg_temp.expect((select count(*)=1 from messaging.deliveries where message_id=(:'own_reply'::jsonb->>'id')::uuid and user_id='00000000-0000-0000-0000-000000000002'),'replies mode queues a direct reply to this player');
select pg_temp.expect(not exists(select 1 from messaging.deliveries where message_id=(:'general_discussion'::jsonb->>'id')::uuid and user_id='00000000-0000-0000-0000-000000000002'),'replies mode suppresses ordinary discussion');
set local role authenticated;
select pg_temp.login(2);
select public.messaging_api('read',jsonb_build_object('conversationId',:'discussion')) as reply_page \gset
select pg_temp.expect(:'reply_page'::jsonb->'conversation'->>'notificationMessageId'=:'own_reply'::jsonb->>'id','foreground marker finds an eligible reply even after an unrelated newer post');
select pg_temp.expect(:'reply_page'::jsonb->'conversation'->>'lastMessageId'=:'general_discussion'::jsonb->>'id','inbox preview still shows the actual latest message');
select pg_temp.expect((:'reply_page'::jsonb->'conversation'->>'unread')::int>=2,'silent discussion still contributes to actual unread counts');
select public.messaging_api('notification_preferences','{"chat_discussion":"off"}');
select pg_temp.expect(public.messaging_api('read',jsonb_build_object('conversationId',:'discussion'))->'conversation'->'notificationMessageId'='null'::jsonb,'off mode removes foreground alert eligibility');
select public.messaging_api('notification_preferences','{"chat_discussion":"replies"}');
select public.messaging_api('mark_read',jsonb_build_object('conversationId',:'discussion','seq',9223372036854775807));
select public.messaging_mark_unread(:'discussion',(:'own_reply'::jsonb->>'id')::uuid);
select pg_temp.expect(public.messaging_api('read',jsonb_build_object('conversationId',:'discussion'))->'conversation'->'notificationMessageId'='null'::jsonb,'mark unread does not re-alert an already read reply');
-- A per-chat mute overrides replies-only mode without hiding the discussion.
select public.messaging_api('member_settings',jsonb_build_object('conversationId',:'discussion','muted',true));
select pg_temp.login(4,'aal2');
select public.messaging_api('send',jsonb_build_object('conversationId',:'discussion','body','Muted direct answer','clientId',gen_random_uuid(),'replyId',:'own_question'::jsonb->>'id')) as muted_reply \gset
reset role;
select pg_temp.expect(not exists(select 1 from messaging.deliveries where message_id=(:'muted_reply'::jsonb->>'id')::uuid and user_id='00000000-0000-0000-0000-000000000002'),'chat mute overrides a permitted direct reply');
set local role authenticated;
select pg_temp.login(2);
select pg_temp.expect(public.messaging_api('read',jsonb_build_object('conversationId',:'discussion'))->'conversation'->'notificationMessageId'='null'::jsonb,'muted chat has no foreground notification marker');
select public.messaging_api('member_settings',jsonb_build_object('conversationId',:'discussion','muted',false));
-- A queued job is suppressed when the preference changes before dispatch.
reset role;
update messaging.deliveries set lease_id=gen_random_uuid() where message_id=(:'own_reply'::jsonb->>'id')::uuid and user_id='00000000-0000-0000-0000-000000000002' returning id as pref_job,lease_id as pref_lease \gset
set local role authenticated;
select pg_temp.login(2);select public.messaging_api('notification_preferences','{"chat_discussion":"off"}');
reset role;
select pg_temp.expect(messaging.delivery_api('context',jsonb_build_object('id',:'pref_job','lease',:'pref_lease'))->>'skip'='true','worker rechecks discussion preference at dispatch');
-- Request alerts and accepted-private-message alerts are independent.
set local role authenticated;
select pg_temp.login(2);select public.messaging_api('notification_preferences','{"chat_requests":false,"chat_private":true}');
select pg_temp.login(4,'aal2');
select public.messaging_api('request',jsonb_build_object('playerId',2,'body','Private introduction','clientId',gen_random_uuid()))->>'id' as pref_dm \gset
reset role;
select pg_temp.expect(not exists(select 1 from messaging.deliveries where conversation_id=:'pref_dm'::uuid and user_id='00000000-0000-0000-0000-000000000002'),'request preference is independent of accepted private messages');
set local role authenticated;
select pg_temp.login(2);select public.messaging_api('respond',jsonb_build_object('conversationId',:'pref_dm','response','accept'));
select public.messaging_api('notification_preferences','{"chat_private":false,"chat_requests":true}');
select pg_temp.login(4,'aal2');
select public.messaging_api('send',jsonb_build_object('conversationId',:'pref_dm','body','Silent private message','clientId',gen_random_uuid())) as silent_private \gset
reset role;
select pg_temp.expect(not exists(select 1 from messaging.deliveries where message_id=(:'silent_private'::jsonb->>'id')::uuid),'accepted private-message preference is enforced independently');
-- Quiet hours delay permitted pushes and suppress immediate in-app alerts.
create or replace function public.notification_quiet_until(jsonb) returns timestamptz language sql stable as $$select case when $1->>'quiet_hours_enabled'='true' then now()+interval '1 hour' else now() end$$;
select set_config('request.jwt.claims','{}',true);
update public.players set notification_prefs='{"chat_discussion":"all","quiet_hours_enabled":true}' where id=2;
set local role authenticated;
select pg_temp.login(4,'aal2');
select public.messaging_api('send',jsonb_build_object('conversationId',:'discussion','body','Quiet hours post','clientId',gen_random_uuid())) as quiet_post \gset
select pg_temp.login(2);
select pg_temp.expect(public.messaging_api('read',jsonb_build_object('conversationId',:'discussion'))->'conversation'->'notificationMessageId'='null'::jsonb,'quiet hours suppress the immediate messaging banner');
reset role;
update messaging.deliveries set lease_id=gen_random_uuid() where message_id=(:'quiet_post'::jsonb->>'id')::uuid and user_id='00000000-0000-0000-0000-000000000002' returning id as quiet_job,lease_id as quiet_lease \gset
select messaging.delivery_api('context',jsonb_build_object('id',:'quiet_job','lease',:'quiet_lease'));
select pg_temp.expect((select state='pending' and available_at>now() from messaging.deliveries where id=:'quiet_job'::uuid),'permitted quiet-hour pushes are deferred rather than discarded');
create or replace function public.notification_quiet_until(jsonb) returns timestamptz language sql stable as $$select now()$$;
-- Merge patches preserve unrelated choices; the master switch wins over categories.
select set_config('request.jwt.claims','{}',true);
update public.players set notification_prefs='{"event_cancelled":false,"push_enabled":false}' where id=2;
set local role authenticated;
select pg_temp.login(2);select public.messaging_api('notification_preferences','{"chat_discussion":"all","chat_announcements":true}');
reset role;
select pg_temp.expect((select notification_prefs->>'event_cancelled'='false' from public.players where id=2),'chat settings preserve unrelated notification choices');
select pg_temp.expect(not messaging.notification_policy('event_discussion','accepted',(select notification_prefs from public.players where id=2),true),'master push switch suppresses messaging categories');
-- Preferences can be prepared before the feature opens to this account.
update messaging.configuration set enabled=false;
set local role authenticated;
select pg_temp.login(2);select public.messaging_api('notification_preferences','{"chat_discussion":"replies"}');
reset role;
update messaging.configuration set enabled=true;
select set_config('request.jwt.claims','{}',true);
update public.players p set notification_prefs=baseline.notification_prefs from notification_pref_baseline baseline where baseline.id=p.id;
