-- All mutations are confined to this isolated fixture and rolled back before existing tests.
savepoint personal_delete;
set local role anon;
select pg_temp.reject(format('select public.messaging_delete_conversation(%L::uuid)',:'dm'),'permission denied');
set local role authenticated;
select pg_temp.login(3);
select pg_temp.reject(format('select public.messaging_delete_conversation(%L::uuid)',:'dm'),'unavailable');
select pg_temp.login(1);
select public.messaging_mark_unread(:'dm'::uuid);
select public.messaging_api('member_settings',jsonb_build_object('conversationId',:'dm','archived',true));
select public.messaging_delete_conversation(:'dm'::uuid);
select public.messaging_delete_conversation(:'dm'::uuid);
select pg_temp.expect(not exists(select 1 from jsonb_array_elements(public.messaging_api('list')) r where r->>'id'=:'dm'),'deleted chat is absent from inbox and archive');
select pg_temp.expect(not exists(select 1 from jsonb_array_elements(public.messaging_snapshot(true)->'rows') r where r->>'id'=:'dm'),'snapshot also hides deleted chat');
select pg_temp.expect(jsonb_array_length(public.messaging_api('read',jsonb_build_object('conversationId',:'dm'))->'messages')=0,'deep link cannot restore cleared history');
select pg_temp.expect(public.own_app_badge_unread()=0,'deletion clears unread badge and manual reminder');
select pg_temp.reject(format('select public.messaging_mark_unread(%L::uuid)',:'dm'),'unavailable');
reset role;
select pg_temp.expect((select count(*)=2 from messaging.messages where conversation_id=:'dm'),'other participants and moderation retain message rows');
select pg_temp.expect(exists(select 1 from messaging.reports where conversation_id=:'dm'),'report evidence survives personal deletion');
select pg_temp.expect(not has_function_privilege('anon','public.messaging_delete_conversation(uuid)','execute') and not has_function_privilege('service_role','public.messaging_delete_conversation(uuid)','execute'),'only authenticated clients can call personal deletion');
select pg_temp.expect(not has_table_privilege('authenticated','messaging.members','select,update,delete'),'private memberships stay RPC-only');
set local role authenticated;
select pg_temp.login(2);
select pg_temp.expect(jsonb_array_length(public.messaging_api('read',jsonb_build_object('conversationId',:'dm'))->'messages')=2,'peer retains complete history');
select public.messaging_api('send',jsonb_build_object('conversationId',:'dm','body','New message after personal delete','replyId',:'sent'::jsonb->>'id','clientId',gen_random_uuid()));
select pg_temp.login(1);
select pg_temp.expect(exists(select 1 from jsonb_array_elements(public.messaging_api('list')) r where r->>'id'=:'dm' and r->>'preview'='New message after personal delete'),'new message reopens chat');
select public.messaging_api('read',jsonb_build_object('conversationId',:'dm')) as reopened_delete \gset
select pg_temp.expect(jsonb_array_length(:'reopened_delete'::jsonb->'messages')=1,'reopened chat contains only new history');
select pg_temp.expect(:'reopened_delete'::jsonb->'messages'->0->'reply'='null'::jsonb,'reply preview cannot leak a cleared message');
select public.messaging_api('open_event','{"eventId":100}') as delete_channels \gset
select value->>'id' as delete_channel from jsonb_array_elements(:'delete_channels'::jsonb) limit 1 \gset
select pg_temp.reject(format('select public.messaging_delete_conversation(%L::uuid)',:'delete_channel'),'unavailable');

-- Clearing a group is separate from leaving it.
reset role;
update messaging.configuration set groups_enabled=true;
set local role authenticated;
select pg_temp.login(1);
select public.messaging_api('group_create',jsonb_build_object('playerIds',jsonb_build_array(2,3),'title','Delete test group','body','Group invitation','clientId',gen_random_uuid()))->>'id' as delete_group \gset
select pg_temp.login(2);
select public.messaging_api('respond',jsonb_build_object('conversationId',:'delete_group','response','accept','groupsVersion','1'));
select pg_temp.login(1);
select public.messaging_delete_conversation(:'delete_group'::uuid);
reset role;
select pg_temp.expect(exists(select 1 from messaging.group_members where conversation_id=:'delete_group'::uuid and user_id='00000000-0000-0000-0000-000000000001' and status='accepted'),'delete does not leave group');
set local role authenticated;
select pg_temp.login(2);
select public.messaging_api('send',jsonb_build_object('conversationId',:'delete_group','body','Group message after deletion','clientId',gen_random_uuid()));
select pg_temp.login(1);
select pg_temp.expect(jsonb_array_length(public.messaging_api('read',jsonb_build_object('conversationId',:'delete_group'))->'messages')=1,'group new message returns without cleared invitation');

-- Account erasure must only update groups containing the departing recipient.
reset role;
insert into messaging.conversations(kind)
select kind from messaging.conversations where id=:'delete_group'::uuid
returning id as unrelated_group \gset
insert into messaging.groups(conversation_id,title,creator_id,source,client_id,recipients)
values (:'unrelated_group','Unrelated group','00000000-0000-0000-0000-000000000001',
  'player_group',gen_random_uuid(),array['00000000-0000-0000-0000-000000000003'::uuid])
returning ctid::text as unrelated_group_row \gset

select pg_temp.expect((select '00000000-0000-0000-0000-000000000002'::uuid = any(recipients)
  from messaging.groups where conversation_id=:'delete_group'::uuid),'erasure fixture includes departing recipient');
delete from messaging.accounts where user_id='00000000-0000-0000-0000-000000000002';
select pg_temp.expect((select recipients=array['00000000-0000-0000-0000-000000000003'::uuid]
  from messaging.groups where conversation_id=:'delete_group'::uuid),'erasure removes departing group recipient');
select pg_temp.expect((select ctid::text=:'unrelated_group_row'
  from messaging.groups where conversation_id=:'unrelated_group'::uuid),'erasure leaves unrelated group untouched');
rollback to savepoint personal_delete;
release savepoint personal_delete;
