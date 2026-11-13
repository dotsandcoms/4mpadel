savepoint help_requests;
reset role;
update public.calendar set organiser_email='bob@test.test',organiser_name='Bob’s event team' where id=100;
create or replace function public.can_manage_event(bigint) returns boolean language sql stable as $$
  select (auth.email()='bob@test.test' and $1=100) or auth.email()='staff@test.test'
$$;
insert into public.payments(id,event_id,player_id,reference,metadata) values
 ('90000000-0000-0000-0000-000000000001',100,1,'PLAYER-ONE','{}'),
 ('90000000-0000-0000-0000-000000000002',200,3,'PLAYER-THREE','{}');
insert into public.payment_refunds(id,payment_id) values('91000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001');
set local role anon;
select pg_temp.reject($q$select public.help_api('list')$q$,'permission denied');
set local role authenticated;
select pg_temp.login(1);
select pg_temp.reject($q$select * from public.help_requests$q$,'permission denied');
select pg_temp.reject($q$select * from public.help_replies$q$,'permission denied');
select pg_temp.expect(public.help_api('route','{"topic":"entry","eventId":100}')->>'email'='bob@test.test','entry email routes to organiser');
select pg_temp.expect(public.help_api('route','{"topic":"profile","eventId":100}')->>'team'='4m','platform issues cannot be routed to organiser by a forged event');
select pg_temp.expect(public.help_api('route','{"topic":"payment","paymentId":"90000000-0000-0000-0000-000000000001"}')->>'eventId'='100','payment uses its canonical event');
select pg_temp.expect(public.help_api('route','{"topic":"payment","paymentKind":"refund","paymentId":"91000000-0000-0000-0000-000000000001"}')->>'eventId'='100','refund uses owned original payment event');
select pg_temp.reject($q$select public.help_api('route','{"topic":"payment","paymentId":"90000000-0000-0000-0000-000000000002"}')$q$,'unavailable');
select public.help_api('create','{"topic":"entry","eventId":100,"ownerId":"00000000-0000-0000-0000-000000000003","team":"4m","body":"Please help with my entry","clientId":"92000000-0000-0000-0000-000000000001"}') as help_created \gset
select :'help_created'::jsonb->>'id' as help_id \gset
select pg_temp.expect(:'help_created'::jsonb->>'team'='organiser','client cannot choose destination team');
select pg_temp.expect(public.help_api('create','{"topic":"entry","eventId":100,"body":"Please help with my entry","clientId":"92000000-0000-0000-0000-000000000001"}')->>'id'=:'help_id','request creation retry is idempotent');
select pg_temp.reject($q$select public.help_api('create','{"topic":"entry","eventId":100,"body":"Different body","clientId":"92000000-0000-0000-0000-000000000001"}')$q$,'different details');
select pg_temp.expect(jsonb_array_length(public.help_api('list')->'rows')=1,'own request appears');
select public.help_api('create','{"topic":"problem","body":"An app issue","clientId":"92000000-0000-0000-0000-000000000002"}') as platform_help \gset
select pg_temp.login(3,'aal2');
select pg_temp.expect(jsonb_array_length(public.help_api('list')->'rows')=0,'outsider cannot see player requests');
select pg_temp.reject(format('select public.help_api(''read'',%L)',jsonb_build_object('id',:'help_id')),'unavailable');
select pg_temp.reject(format('select public.help_api(''reply'',%L)',jsonb_build_object('id',:'help_id','body','Forged reply','clientId',gen_random_uuid())),'unavailable');
select pg_temp.login(2);
select pg_temp.reject($q$select public.help_api('list','{"staff":true}')$q$,'authenticator');
select pg_temp.reject(format('select public.help_api(''read'',%L)',jsonb_build_object('id',:'help_id')),'unavailable');
select pg_temp.login(2,'aal2');
select pg_temp.expect(jsonb_array_length(public.help_api('list','{"staff":true}')->'rows')=1,'organiser sees own event but no platform requests');
select pg_temp.reject(format('select public.help_api(''read'',%L)',jsonb_build_object('id',:'platform_help'::jsonb->>'id')),'unavailable');
select public.help_api('reply',jsonb_build_object('id',:'help_id','body','Please confirm your division','clientId','93000000-0000-0000-0000-000000000001'));
select public.help_api('reply',jsonb_build_object('id',:'help_id','body','Please confirm your division','clientId','93000000-0000-0000-0000-000000000001'));
select pg_temp.expect(public.help_api('read',jsonb_build_object('id',:'help_id'))->'request'->>'status'='waiting_on_player','organiser reply waits on player');
select pg_temp.expect(jsonb_array_length(public.help_api('read',jsonb_build_object('id',:'help_id'))->'messages')=2,'reply retry does not duplicate');
select pg_temp.login(1);
select public.help_api('reply',jsonb_build_object('id',:'help_id','body','Gold division','clientId',gen_random_uuid()));
select pg_temp.expect(public.help_api('read',jsonb_build_object('id',:'help_id'))->'request'->>'status'='open','player reply reopens request');
select pg_temp.reject(format('select public.help_api(''escalate'',%L)',jsonb_build_object('id',:'help_id')),'unavailable');
select pg_temp.login(2,'aal2');
select public.help_api('escalate',jsonb_build_object('id',:'help_id'));
select pg_temp.expect(public.help_api('read',jsonb_build_object('id',:'help_id'))->'request'->>'email'='info@4mpadel.co.za','escalation switches fallback email and destination');
select pg_temp.login(4,'aal2');
select pg_temp.expect(jsonb_array_length(public.help_api('list','{"staff":true}')->'rows')=2,'super admin sees event and platform queues');
select public.help_api('status',jsonb_build_object('id',:'help_id','status','resolved'));
select pg_temp.expect(jsonb_array_length(public.help_api('list','{"staff":true,"status":"resolved"}')->'rows')=1,'admin filters resolved requests');
reset role;
update public.calendar set organiser_email=E'bad@test.test\nBcc:wrong@test.test' where id=100;
set local role authenticated;
select pg_temp.login(1);
select pg_temp.expect(public.help_api('route','{"topic":"entry","eventId":100}')->>'email'='info@4mpadel.co.za','malformed organiser email cannot inject mail headers');
select pg_temp.expect((public.help_api('route','{"topic":"entry","eventId":100}')->>'emailFallback')::boolean,'missing valid organiser email is disclosed as fallback');
select pg_temp.login(3);
select set_config('request.jwt.claims',jsonb_set(auth.jwt(),'{email}',to_jsonb('alice@test.test'::text))::text,true);
select pg_temp.reject($q$select public.help_api('list')$q$,'Sign in again');
-- Stable cursors keep a growing queue and a long conversation bounded without losing history.
reset role;
insert into public.help_requests(owner_id,client_id,topic,event_id,team,updated_at)
  select '00000000-0000-0000-0000-000000000001',gen_random_uuid(),'entry',100,'organiser',now()-n*interval '1 second' from generate_series(1,51)n;
insert into public.help_replies(request_id,author_id,author_role,client_id,body)
  select :'help_id'::uuid,'00000000-0000-0000-0000-000000000001','player',gen_random_uuid(),'Pagination message '||n from generate_series(1,101)n;
set local role authenticated;
select pg_temp.login(1);
select public.help_api('list') as first_help_page \gset
select public.help_api('list',:'first_help_page'::jsonb->'next') as second_help_page \gset
select pg_temp.expect(jsonb_array_length(:'first_help_page'::jsonb->'rows')=50 and jsonb_array_length(:'second_help_page'::jsonb->'rows')=3,'request cursor returns every owned request');
select pg_temp.expect((select count(distinct r->>'id')=53 from jsonb_array_elements((:'first_help_page'::jsonb->'rows')||(:'second_help_page'::jsonb->'rows'))r),'queue cursor has no duplicates');
select public.help_api('read',jsonb_build_object('id',:'help_id')) as latest_help_messages \gset
select public.help_api('read',jsonb_build_object('id',:'help_id')||(:'latest_help_messages'::jsonb->'nextMessages')) as earlier_help_messages \gset
select pg_temp.expect(jsonb_array_length(:'latest_help_messages'::jsonb->'messages')=100 and jsonb_array_length(:'earlier_help_messages'::jsonb->'messages')=5,'message cursor returns complete history in bounded pages');
reset role;
select pg_temp.expect(not has_table_privilege('service_role','public.help_requests','select,insert,update,delete'),'help metadata stays RPC-only even for workers');
select pg_temp.expect(not has_function_privilege('authenticated','private.help_route(text,bigint,text,text,uuid)','execute'),'owner-spoofable internal routing helper is inaccessible');
rollback to savepoint help_requests;
release savepoint help_requests;
