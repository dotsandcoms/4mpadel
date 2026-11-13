savepoint help_alerts;
reset role;
create or replace function public.can_manage_event(bigint) returns boolean language sql stable as $$select (auth.email()='bob@test.test' and $1=100) or auth.email()='staff@test.test'$$;
update public.calendar set organiser_email='bob@test.test',organiser_name='Bob’s event team' where id=100;
insert into public.event_registrations(id,event_id,email,partner_email,full_name,partner_name,division,payment_status)
 values('96000000-0000-0000-0000-000000000001',100,'alice@test.test','bob@test.test','Alice Player','Bob Partner','Open','paid');
set local role authenticated;
select pg_temp.login(1);
select public.help_api('route','{"topic":"entry","entryId":"96000000-0000-0000-0000-000000000001","eventId":100}') as entry_route \gset
select pg_temp.expect(:'entry_route'::jsonb->>'eventName'='4M Open' and :'entry_route'::jsonb->>'entryDetail' like '%Open%Alice Player%Bob Partner%','entry shortcut resolves canonical event, player, partner and division');
select pg_temp.reject($q$select public.help_api('route','{"topic":"entry","entryId":"96000000-0000-0000-0000-000000000001","eventId":200}')$q$,'does not belong');
select public.help_api('create','{"topic":"entry","entryId":"96000000-0000-0000-0000-000000000001","eventId":100,"body":"Entry question","clientId":"96000000-0000-0000-0000-000000000002"}') as ticket \gset
select :'ticket'::jsonb->>'id' as ticket_id \gset
select pg_temp.expect(:'ticket'::jsonb->>'entryId'='96000000-0000-0000-0000-000000000001','entry reference persists in the ticket');
select public.help_api('status',jsonb_build_object('id',:'ticket_id','status','resolved'));
select pg_temp.reject(format('select public.help_api(''reply'',%L)',jsonb_build_object('id',:'ticket_id','body','Blocked after close','clientId',gen_random_uuid())),'resolved');
select pg_temp.login(2,'aal2');
select pg_temp.reject(format('select public.help_api(''reply'',%L)',jsonb_build_object('id',:'ticket_id','body','Staff blocked after close','clientId',gen_random_uuid())),'resolved');
select pg_temp.reject(format('select public.help_api(''escalate'',%L)',jsonb_build_object('id',:'ticket_id')),'resolved');
select public.help_api('status',jsonb_build_object('id',:'ticket_id','status','open'));
select public.help_api('escalate',jsonb_build_object('id',:'ticket_id'));
select public.help_api('escalate',jsonb_build_object('id',:'ticket_id'));
select pg_temp.expect(jsonb_array_length(public.help_api('read',jsonb_build_object('id',:'ticket_id'))->'messages')=2,'escalation retry adds only one handover note');
select pg_temp.expect(public.help_api('read',jsonb_build_object('id',:'ticket_id'))->'request'->>'supportAlert'='queued','support handover reports the queued email');
select pg_temp.login(3,'aal2');
select pg_temp.reject($q$select public.help_api('route','{"topic":"entry","entryId":"96000000-0000-0000-0000-000000000001","eventId":100}')$q$,'unavailable');
select pg_temp.reject($q$select public.help_alert_jobs('claim')$q$,'permission denied');
select pg_temp.reject('select * from public.help_support_alerts','permission denied');
select pg_temp.login(1);
select public.help_api('create','{"topic":"problem","body":"A platform issue","clientId":"96000000-0000-0000-0000-000000000003"}');
reset role;
select pg_temp.expect((select count(*)=2 from public.help_support_alerts),'a handover and a new platform request each enqueue one email');
select pg_temp.expect(not has_table_privilege('service_role','public.help_support_alerts','select,insert,update,delete'),'service delivery uses checked RPCs without direct queue grants');
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select public.help_alert_jobs('claim') as claimed \gset
select pg_temp.expect(jsonb_array_length(:'claimed'::jsonb)=2,'worker claims support delivery jobs');
select :'claimed'::jsonb->0->>'id' as job_id, :'claimed'::jsonb->0->>'leaseId' as lease_id \gset
select pg_temp.reject(format('select public.help_alert_jobs(''prepare'',%L)',jsonb_build_object('id',:'job_id','leaseId',:'lease_id','payload',jsonb_build_object('to',jsonb_build_array('wrong@example.test')))),'Invalid support recipient');
select public.help_alert_jobs('prepare',jsonb_build_object('id',:'job_id','leaseId',:'lease_id','payload','{"to":["info@4mpadel.co.za"],"subject":"Original"}'::jsonb));
select pg_temp.expect(public.help_alert_jobs('prepare',jsonb_build_object('id',:'job_id','leaseId',:'lease_id','payload','{"to":["info@4mpadel.co.za"],"subject":"Changed"}'::jsonb))->>'subject'='Original','email payload stays frozen across retries');
select pg_temp.expect(public.help_alert_jobs('finish',jsonb_build_object('id',:'job_id','leaseId',gen_random_uuid(),'status','sent','providerId','provider-1')) is null,'stale lease cannot mark another attempt delivered');
select public.help_alert_jobs('finish',jsonb_build_object('id',:'job_id','leaseId',:'lease_id','status','sent','providerId','provider-1'));
reset role;
update public.help_support_alerts set first_attempt_at=clock_timestamp()-interval '24 hours',available_at=clock_timestamp()-interval '1 second' where state='leased';
set local role service_role;
select pg_temp.expect(jsonb_array_length(public.help_alert_jobs('claim'))=0,'uncertain sends are not replayed outside provider idempotency window');
reset role;
select pg_temp.expect((select count(*)=1 from public.help_support_alerts where state='needs_review'),'expired uncertain send requires review');
rollback to savepoint help_alerts;
release savepoint help_alerts;
