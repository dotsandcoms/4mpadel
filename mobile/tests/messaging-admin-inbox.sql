-- Hosted calendar.address previously collided with the scope_player variable.
set local role authenticated;
select pg_temp.login(9,'aal2');
select pg_temp.expect(jsonb_array_length(public.messaging_api('admin_players','{"scope":"org:30000000-0000-0000-0000-000000000001","query":"Group player"}'))=2,'organisation search works with the real calendar.address column');
select pg_temp.expect(jsonb_array_length(public.messaging_admin_inbox()->'rows')=3,'queue includes existing official conversations');
select pg_temp.expect(public.messaging_admin_inbox('{"kind":"group"}')->'rows'->0->>'title'='Practice squad','group filter uses canonical metadata');
select pg_temp.expect(jsonb_array_length(public.messaging_admin_inbox('{"query":"Group player 52"}')->'rows')=2,'search finds private and group conversations by participant');
select pg_temp.expect(jsonb_array_length(public.messaging_admin_inbox('{"status":"waiting"}')->'rows')>=1,'waiting filter includes outstanding invitations');
select pg_temp.expect(jsonb_array_length(public.messaging_admin_inbox('{"status":"unread"}')->'rows')=0,'unread filter excludes outgoing invitations');
select pg_temp.login(9,'aal1');
select pg_temp.reject($q$select public.messaging_admin_inbox()$q$,'two-factor');
select pg_temp.login(10,'aal2');
select pg_temp.expect(jsonb_array_length(public.messaging_admin_inbox()->'rows')=0,'another organisation cannot browse conversations');
select pg_temp.reject($q$select public.messaging_admin_inbox('{"scope":"org:30000000-0000-0000-0000-000000000001"}')$q$,'access denied');
select pg_temp.login(4,'aal2');
select pg_temp.expect(jsonb_array_length(public.messaging_admin_inbox()->'rows')=0,'Super Admin cannot browse another sender’s private conversations');
select pg_temp.login(9,'aal2');
select pg_temp.reject($q$select public.messaging_admin_inbox('{"kind":"invented"}')$q$,'valid conversation');
select pg_temp.reject($q$select public.messaging_admin_inbox('{"before":{"id":"50000000-0000-0000-0000-000000000099"}}')$q$,'valid conversation page');
reset role;
select pg_temp.expect(not has_function_privilege('anon','public.messaging_admin_inbox(jsonb)','execute') and not has_function_privilege('service_role','public.messaging_admin_inbox(jsonb)','execute'),'queue RPC only permits authenticated callers');
savepoint inbox_pagination;
insert into messaging.conversations(id,kind,updated_at)
select ('80000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'direct',now() from generate_series(1,121)n;
insert into messaging.groups(conversation_id,title,creator_id,source,scope,client_id,recipients)
select ('80000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'Queue fixture '||n,'00000000-0000-0000-0000-000000000009','admin_group','org:30000000-0000-0000-0000-000000000001',gen_random_uuid(),array['00000000-0000-0000-0000-000000000052'::uuid] from generate_series(1,121)n;
insert into messaging.group_members(conversation_id,user_id,status)
select g.conversation_id,u,'accepted' from messaging.groups g cross join unnest(array['00000000-0000-0000-0000-000000000009'::uuid,'00000000-0000-0000-0000-000000000052'::uuid]) u where g.title like 'Queue fixture %';
insert into messaging.members(conversation_id,user_id) select conversation_id,user_id from messaging.group_members where conversation_id::text like '80000000-%';
set local role authenticated;
select pg_temp.login(9,'aal2');
select public.messaging_admin_inbox('{"query":"Queue fixture"}') as inbox_page1 \gset
select public.messaging_admin_inbox(jsonb_build_object('query','Queue fixture','before',:'inbox_page1'::jsonb->'next')) as inbox_page2 \gset
select public.messaging_admin_inbox(jsonb_build_object('query','Queue fixture','before',:'inbox_page2'::jsonb->'next')) as inbox_page3 \gset
select pg_temp.expect(jsonb_array_length(:'inbox_page1'::jsonb->'rows')=50 and jsonb_array_length(:'inbox_page2'::jsonb->'rows')=50 and jsonb_array_length(:'inbox_page3'::jsonb->'rows')=21,'pages cover more than the old 100-conversation limit');
select pg_temp.expect((select count(distinct row->>'id')=121 from jsonb_array_elements((:'inbox_page1'::jsonb->'rows')||(:'inbox_page2'::jsonb->'rows')||(:'inbox_page3'::jsonb->'rows')) row),'equal timestamps do not duplicate or skip conversations');
select pg_temp.expect(:'inbox_page3'::jsonb->'next'='null'::jsonb,'last page has no cursor');
select pg_temp.expect(jsonb_array_length(public.messaging_admin_inbox('{"query":"Queue fixture 1"}')->'rows')=33,'search runs before pagination across the entire inbox');
reset role;
rollback to savepoint inbox_pagination;
savepoint inbox_activity;
set local role authenticated;
select pg_temp.login(55);
select public.messaging_api('send',jsonb_build_object('conversationId',:'admin_sent'::jsonb->1->>'id','body','Queue unread fixture','clientId',gen_random_uuid())) as queue_reply \gset
select pg_temp.login(9,'aal2');
select pg_temp.expect(jsonb_array_length(public.messaging_admin_inbox('{"status":"unread"}')->'rows')=1,'incoming player reply appears in unread filter');
select pg_temp.expect(public.messaging_admin_inbox('{"status":"unread"}')->'rows'->0->>'preview'='Queue unread fixture','queue preview uses the canonical visible message');
select public.messaging_api('mark_read',jsonb_build_object('conversationId',:'admin_sent'::jsonb->1->>'id','seq',:'queue_reply'::jsonb->'seq'));
select pg_temp.expect(jsonb_array_length(public.messaging_admin_inbox('{"status":"unread"}')->'rows')=0,'reading removes the reply from unread filter');
reset role;
update public.organisations set created_by=null where created_by=9;
delete from public.organisation_members where user_email='org-a@test.test';
set local role authenticated;
select pg_temp.expect(jsonb_array_length(public.messaging_admin_inbox()->'rows')=0,'removing organisation permission immediately removes its queue rows');
reset role;
rollback to savepoint inbox_activity;
