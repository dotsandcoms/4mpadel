-- Targeted announcement security uses the same real API, worker and counters.
reset role;
select set_config('request.jwt.claims','{}',true);
insert into public.tournament_divisions(id,event_id,name) values
 ('a0000000-0000-0000-0000-000000000001',100,'Open'),('a0000000-0000-0000-0000-000000000002',100,'Advanced'),('a0000000-0000-0000-0000-000000000003',200,'Other event');
update public.event_registrations set status='registered',division_id='a0000000-0000-0000-0000-000000000001' where event_id=100 and email='alice@test.test';
update public.event_registrations set status='registered',division_id='a0000000-0000-0000-0000-000000000002' where event_id=100 and email='bob@test.test';
insert into public.event_registrations(event_id,division_id,email,partner_email,status,payment_status) values(100,'a0000000-0000-0000-0000-000000000002','alice@test.test','partner@test.test','registered','paid');
set local role authenticated;
select pg_temp.login(4,'aal2');
select public.messaging_api('audience',jsonb_build_object('conversationId',:'announcements','divisionIds',jsonb_build_array('a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002'))) as segments \gset
select pg_temp.expect((:'segments'::jsonb->>'selectedCount')::int=3,'union counts each eligible account once, including mapped partner');
select pg_temp.reject(format('select public.messaging_api(''send'',%L)',jsonb_build_object('conversationId',:'announcements','clientId',gen_random_uuid(),'body','wrong event','divisionIds',jsonb_build_array('a0000000-0000-0000-0000-000000000003'))),'belonging');
select pg_temp.reject(format('select public.messaging_api(''send'',%L)',jsonb_build_object('conversationId',:'announcements','clientId',gen_random_uuid(),'body','empty audience','divisionIds','[]'::jsonb)),'Choose');
select pg_temp.reject(format('select public.messaging_api(''send'',%L)',jsonb_build_object('conversationId',:'announcements','clientId',gen_random_uuid(),'body','invalid audience','divisionIds',jsonb_build_array('garbage'))),'Choose');
select pg_temp.reject(format('select public.messaging_api(''send'',%L)',jsonb_build_object('conversationId',:'discussion','clientId',gen_random_uuid(),'body','discussion target','divisionIds',jsonb_build_array('a0000000-0000-0000-0000-000000000001'))),'announcements channel');
select gen_random_uuid() as segment_client \gset
select public.messaging_api('send',jsonb_build_object('conversationId',:'announcements','clientId',:'segment_client','body','Open division private update','divisionIds',jsonb_build_array('a0000000-0000-0000-0000-000000000001'))) as division_post \gset
select pg_temp.reject(format('select public.messaging_api(''send'',%L)',jsonb_build_object('conversationId',:'announcements','clientId',:'segment_client','body','different target retry','divisionIds',jsonb_build_array('a0000000-0000-0000-0000-000000000002'))),'different audience');
select pg_temp.expect(:'division_post'::jsonb->'audience'->'divisions'->>0='Open','message labels preserve selected audience');
select public.messaging_api('pin',jsonb_build_object('conversationId',:'announcements','messageId',:'division_post'::jsonb->>'id'));
select pg_temp.expect((select (row->>'audience')::int=1 from jsonb_array_elements(public.messaging_event_analytics(100)->'announcements') row where row->>'id'=:'division_post'::jsonb->>'id'),'statistics count only targeted app audience');
reset role;
select pg_temp.expect((select count(*)=1 from messaging.deliveries where message_id=(:'division_post'::jsonb->>'id')::uuid),'push queued only for targeted player');
set local role authenticated;
select pg_temp.login(2);
select pg_temp.expect(not exists(select 1 from jsonb_array_elements(public.messaging_api('read',jsonb_build_object('conversationId',:'announcements'))->'messages') row where row->>'id'=:'division_post'::jsonb->>'id'),'other division cannot read targeted message');
select pg_temp.expect(public.messaging_api('read',jsonb_build_object('conversationId',:'announcements'))->'conversation'->'pinned'='null'::jsonb,'other division cannot read targeted pin');
select pg_temp.expect(public.messaging_api('read',jsonb_build_object('conversationId',:'announcements'))->'conversation'->>'lastMessageId' is distinct from :'division_post'::jsonb->>'id','other division preview excludes targeted message');
select pg_temp.reject(format('select public.messaging_api(''report'',%L)',jsonb_build_object('conversationId',:'announcements','messageId',:'division_post'::jsonb->>'id','reason','spam')),'unavailable');
select pg_temp.reject(format('select public.messaging_api(''audience'',%L)',jsonb_build_object('conversationId',:'announcements')),'access');
select pg_temp.login(1);
select pg_temp.expect(exists(select 1 from jsonb_array_elements(public.messaging_api('read',jsonb_build_object('conversationId',:'announcements'))->'messages') row where row->>'id'=:'division_post'::jsonb->>'id'),'selected division reads targeted announcement');
select public.messaging_api('mark_read',jsonb_build_object('conversationId',:'announcements','seq',:'division_post'::jsonb->'seq'));
select pg_temp.login(4,'aal2');
select public.messaging_api('send',jsonb_build_object('conversationId',:'announcements','clientId',gen_random_uuid(),'body','All players reply','replyId',:'division_post'::jsonb->>'id')) as general_reply \gset
select pg_temp.login(2);
select pg_temp.expect((select row->'reply'='null'::jsonb from jsonb_array_elements(public.messaging_api('read',jsonb_build_object('conversationId',:'announcements'))->'messages') row where row->>'id'=:'general_reply'::jsonb->>'id'),'general reply cannot leak restricted quote');
-- Untrusted legacy division edits revoke, rather than grant, access.
reset role;
select pg_temp.login(2);
update public.event_registrations set division_id='a0000000-0000-0000-0000-000000000001' where event_id=100 and email='bob@test.test';
select pg_temp.expect(not messaging.visible((:'division_post'::jsonb->>'id')::uuid,'00000000-0000-0000-0000-000000000002'),'forged division does not grant visibility');
-- A trusted transfer revokes history and worker context for the old division.
select set_config('request.jwt.claims','{}',true);
update public.event_registrations set division_id='a0000000-0000-0000-0000-000000000002' where event_id=100 and email='alice@test.test' and division_id='a0000000-0000-0000-0000-000000000001';
select pg_temp.expect(not messaging.visible((:'division_post'::jsonb->>'id')::uuid,'00000000-0000-0000-0000-000000000001'),'transfer revokes previous division history');
update messaging.deliveries set lease_id=gen_random_uuid() where message_id=(:'division_post'::jsonb->>'id')::uuid returning id as division_job,lease_id as division_lease \gset
select pg_temp.expect(messaging.delivery_api('context',jsonb_build_object('id',:'division_job','lease',:'division_lease'))->>'skip'='true','worker rechecks current division before push');
-- Imported class mappings require a trusted, unambiguous division attestation.
insert into public.tournament_participants(event_id,email,class_name) values(100,'charlie@test.test','Open');
select pg_temp.expect('a0000000-0000-0000-0000-000000000001'::uuid=any(messaging.player_divisions(100,'00000000-0000-0000-0000-000000000003')),'trusted imported class maps to this event division');
select pg_temp.login(3);
update public.tournament_participants set class_name='Advanced' where email='charlie@test.test';
select pg_temp.expect(cardinality(messaging.player_divisions(100,'00000000-0000-0000-0000-000000000003'))=0,'untrusted imported class edit invalidates segment mapping');
select set_config('request.jwt.claims','{}',true);
