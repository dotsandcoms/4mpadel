savepoint help_inbox;
reset role;
create or replace function public.can_manage_event(bigint) returns boolean language sql stable as $$
 select (auth.email()='bob@test.test' and $1=100) or auth.email()='staff@test.test'
$$;
update public.calendar set organiser_email='bob@test.test',organiser_name='Bob’s event team' where id=100;
set local role authenticated;
select pg_temp.login(1);
select public.help_api('create','{"topic":"entry","eventId":100,"body":"A help conversation","clientId":"94000000-0000-0000-0000-000000000001"}') as ticket \gset
select :'ticket'::jsonb->>'id' as ticket_id \gset
select pg_temp.expect((public.help_api('inbox')->>'unread')::int=0,'own outgoing request is not unread');
select pg_temp.login(2);
select pg_temp.expect(jsonb_array_length(public.help_api('inbox')->'rows')=0,'unverified organiser has no staff inbox');
select pg_temp.expect((public.help_api('inbox')->>'needsVerification')::boolean,'organiser can discover the MFA step');
select pg_temp.login(2,'aal2');
select pg_temp.expect((public.help_api('inbox')->>'unread')::int=1,'verified organiser receives new player request');
select pg_temp.expect(public.help_api('inbox')->'rows'->0->'requester'->>'email'='alice@test.test','verified staff can identify the requester');
select pg_temp.expect(jsonb_array_length(public.help_api('list','{"staff":true,"query":"alice@test.test"}')->'rows')=1,'Admin search matches sender email');
select pg_temp.expect(jsonb_array_length(public.help_api('list',jsonb_build_object('staff',true,'query',:'ticket'::jsonb->>'reference'))->'rows')=1,'Admin search accepts the displayed ticket reference');
select public.help_api('read',jsonb_build_object('id',:'ticket_id')) as first_read \gset
select public.help_api('mark_read',jsonb_build_object('id',:'ticket_id','messageId',:'first_read'::jsonb->'messages'->0->>'id'));
select pg_temp.expect((public.help_api('inbox')->>'unread')::int=0,'reading the request clears organiser badge');
select public.help_api('reply',jsonb_build_object('id',:'ticket_id','body','Admin reply in the same thread','clientId','95000000-0000-0000-0000-000000000001'));
select public.help_api('reply',jsonb_build_object('id',:'ticket_id','body','Admin reply in the same thread','clientId','95000000-0000-0000-0000-000000000001'));
select pg_temp.login(1);
select pg_temp.expect((public.help_api('inbox')->>'unread')::int=1,'staff reply reaches player Messages once even on retry');
select pg_temp.expect(public.help_api('inbox')->'rows'->0->>'preview'='Admin reply in the same thread','inbox shows latest reply instead of initial enquiry');
select public.help_api('read',jsonb_build_object('id',:'ticket_id')) as player_read \gset
select pg_temp.expect(jsonb_array_length(:'player_read'::jsonb->'messages')=2,'Admin and app share one transcript');
select pg_temp.expect((:'player_read'::jsonb->'messages'->1->>'seq')::int=2,'replies have ordered read boundaries');
select pg_temp.login(2,'aal2');
select public.help_api('reply',jsonb_build_object('id',:'ticket_id','body','A concurrent newer reply','clientId',gen_random_uuid()));
select pg_temp.login(1);
select public.help_api('mark_read',jsonb_build_object('id',:'ticket_id','messageId',:'player_read'::jsonb->'messages'->1->>'id'));
select pg_temp.expect((public.help_api('inbox')->>'unread')::int=1,'read receipt cannot clear a reply that arrived after the fetched page');
select public.help_api('mark_read',jsonb_build_object('id',:'ticket_id','messageId',:'player_read'::jsonb->'messages'->0->>'id'));
select pg_temp.expect((public.help_api('inbox')->>'unread')::int=1,'older page never regresses or advances the read boundary');
select pg_temp.reject(format('select public.help_api(''mark_read'',%L)',jsonb_build_object('id',:'ticket_id','messageId',gen_random_uuid())),'unavailable');
select pg_temp.login(3,'aal2');
select pg_temp.expect(jsonb_array_length(public.help_api('inbox')->'rows')=0,'another player cannot see the help inbox');
select pg_temp.reject(format('select public.help_api(''mark_read'',%L)',jsonb_build_object('id',:'ticket_id','messageId',:'player_read'::jsonb->'messages'->1->>'id')),'unavailable');
select pg_temp.reject('select * from public.help_request_reads','permission denied');
select pg_temp.expect(not private.help_topic_allowed('help:user:00000000-0000-0000-0000-000000000001'),'other account cannot join player help signals');
select pg_temp.expect(not private.help_topic_allowed('help:event:100'),'outsider cannot join organiser help signals');
select pg_temp.expect(not private.help_topic_allowed('help:staff'),'outsider cannot join platform signals');
select set_config('test.topic','help:event:100',true);
select pg_temp.expect(not exists(select 1 from realtime.messages),'legacy permissive policy cannot expose Help topics');
select pg_temp.reject($q$insert into realtime.messages(id,extension) values(1,'broadcast')$q$,'row-level security');
select pg_temp.login(2,'aal2');
select pg_temp.expect(private.help_topic_allowed('help:event:100'),'verified event organiser can receive own event signals');
select pg_temp.expect(not private.help_topic_allowed('help:event:200'),'organiser cannot receive other event signals');
select pg_temp.login(4,'aal2');
select pg_temp.expect(private.help_topic_allowed('help:staff'),'verified super admin can receive staff signals');
reset role;
select pg_temp.expect(exists(select 1 from realtime.test_signals where topic='help:user:00000000-0000-0000-0000-000000000001' and event='help_changed' and payload='{}'::jsonb),'private signals contain no message text');
select pg_temp.expect(not has_table_privilege('service_role','public.help_request_reads','select,insert,update,delete'),'read receipts remain RPC-only for workers too');
select pg_temp.expect(not has_function_privilege('authenticated','private.help_unread(uuid,uuid)','execute'),'internal unread helper cannot inspect another account');
-- Inbox counts cover the entire scope, independently of its 50-row page.
reset role;
with tickets as (
 insert into public.help_requests(owner_id,client_id,topic,event_id,team,updated_at)
 select '00000000-0000-0000-0000-000000000001',gen_random_uuid(),'entry',100,'organiser',now()-n*interval '1 second' from generate_series(1,55)n returning id
)
insert into public.help_replies(request_id,author_id,author_role,client_id,body)
 select id,'00000000-0000-0000-0000-000000000001'::uuid,'player',gen_random_uuid(),'Initial enquiry' from tickets
 union all select id,'00000000-0000-0000-0000-000000000002'::uuid,'organiser',gen_random_uuid(),'Organiser reply' from tickets;
set local role authenticated;
select pg_temp.login(1);
select public.help_api('inbox') as inbox_page \gset
select pg_temp.expect(jsonb_array_length(:'inbox_page'::jsonb->'rows')=50 and (:'inbox_page'::jsonb->>'unread')::int=56,'unread total includes replies outside the first page');
select public.help_api('inbox',:'inbox_page'::jsonb->'next') as older_inbox_page \gset
select pg_temp.expect(jsonb_array_length(:'older_inbox_page'::jsonb->'rows')=6,'Help inbox cursor retains every request');
select pg_temp.expect(jsonb_array_length(public.help_api('inbox','{"countsOnly":true}')->'rows')=0 and (public.help_api('inbox','{"countsOnly":true}')->>'unread')::int=56,'navigation badge avoids loading row metadata and keeps the complete unread total');
rollback to savepoint help_inbox;
release savepoint help_inbox;
