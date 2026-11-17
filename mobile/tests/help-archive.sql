savepoint help_archive;
reset role;
create or replace function public.can_manage_event(bigint) returns boolean language sql stable as $$
 select (auth.email()='bob@test.test' and $1=100) or auth.email()='staff@test.test'
$$;
update public.calendar set organiser_email='bob@test.test',organiser_name='Event team' where id=100;
set local role authenticated;
select pg_temp.login(1);
select public.help_api('create','{"topic":"entry","eventId":100,"body":"Please check my entry","clientId":"96000000-0000-0000-0000-000000000001"}') as archive_ticket \gset
select :'archive_ticket'::jsonb->>'id' as archive_ticket_id \gset
select pg_temp.login(2,'aal2');
select pg_temp.expect((public.help_api('inbox')->>'unread')::int=1,'organiser sees initial enquiry');
select pg_temp.expect((public.help_api('archive',jsonb_build_object('id',:'archive_ticket_id','archived',true))->>'archived')::boolean,'organiser can archive their own inbox copy');
select pg_temp.expect((public.help_api('inbox')->>'unread')::int=0,'archived Help replies do not inflate badges');
select pg_temp.login(1);
select public.help_api('read',jsonb_build_object('id',:'archive_ticket_id')) as unchanged_ticket \gset
select pg_temp.expect(not (:'unchanged_ticket'::jsonb->'request'->>'archived')::boolean,'another account keeps its own inbox preference');
select pg_temp.expect(:'unchanged_ticket'::jsonb->'request'->>'status'='open' and jsonb_array_length(:'unchanged_ticket'::jsonb->'messages')=1,'archiving keeps status, team and transcript');
select pg_temp.login(2,'aal2');
select pg_temp.expect(not (public.help_api('archive',jsonb_build_object('id',:'archive_ticket_id','archived',false))->>'archived')::boolean,'Move to inbox restores the conversation');
select pg_temp.expect((public.help_api('inbox')->>'unread')::int=1,'restoring keeps the original unread state');
select public.help_api('reply',jsonb_build_object('id',:'archive_ticket_id','body','Your entry is confirmed','clientId','96000000-0000-0000-0000-000000000002'));
select public.help_api('archive',jsonb_build_object('id',:'archive_ticket_id','archived',true));
select pg_temp.login(1);
select public.help_api('archive',jsonb_build_object('id',:'archive_ticket_id','archived',true));
select pg_temp.expect((public.help_api('inbox','{"countsOnly":true}')->>'unread')::int=0,'counts-only navigation badges exclude archived Help');
select pg_temp.login(3);
select pg_temp.reject(format('select public.help_api(''archive'',%L::jsonb)',jsonb_build_object('id',:'archive_ticket_id','archived',true)),'unavailable');
select pg_temp.login(2);
select pg_temp.reject(format('select public.help_api(''archive'',%L::jsonb)',jsonb_build_object('id',:'archive_ticket_id','archived',true)),'unavailable');
select pg_temp.login(2,'aal2');
select pg_temp.reject(format('select public.help_api(''archive'',%L::jsonb)',jsonb_build_object('id',:'archive_ticket_id','archived','false')),'Choose whether');
select public.help_api('reply',jsonb_build_object('id',:'archive_ticket_id','body','One more update','clientId','96000000-0000-0000-0000-000000000003'));
select pg_temp.expect(not (public.help_api('read',jsonb_build_object('id',:'archive_ticket_id'))->'request'->>'archived')::boolean,'sending another reply restores the author inbox too');
select pg_temp.login(1);
select public.help_api('read',jsonb_build_object('id',:'archive_ticket_id')) as restored_ticket \gset
select pg_temp.expect(not (:'restored_ticket'::jsonb->'request'->>'archived')::boolean,'a new reply brings the recipient conversation back');
select pg_temp.expect((public.help_api('inbox')->>'unread')::int=2,'new replies restore the complete unread count');
select pg_temp.expect(jsonb_array_length(:'restored_ticket'::jsonb->'messages')=3,'archive operations do not add conversation messages');
select public.help_api('status',jsonb_build_object('id',:'archive_ticket_id','status','resolved'));
select pg_temp.expect(public.help_api('archive',jsonb_build_object('id',:'archive_ticket_id','archived',true))->>'status'='resolved','resolved Help can be archived without reopening');
select public.help_api('archive',jsonb_build_object('id',:'archive_ticket_id','archived',false));
select pg_temp.expect(not has_table_privilege('authenticated','public.help_request_reads','update'),'personal preferences remain RPC-only');
select pg_temp.expect(not has_function_privilege('authenticated','private.help_restore_inbox_on_reply()','execute'),'restore trigger cannot be called directly');
rollback to savepoint help_archive;
release savepoint help_archive;
