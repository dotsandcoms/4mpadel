-- Super Admin can send as an organisation to players with no event link to it.
-- Every send below is fictional and rolled back in the isolated database.
reset role;
savepoint global_outreach;
set local role authenticated;
select pg_temp.login(4,'aal1');
select pg_temp.reject($q$select public.messaging_api('admin_players','{"scope":"org:30000000-0000-0000-0000-000000000001","query":"Group player"}')$q$,'two-factor');
select pg_temp.login(9,'aal2');
select set_config('request.jwt.claims',(auth.jwt()||'{"user_metadata":{"role":"super_admin"},"globalAudience":true}')::text,true);
select pg_temp.expect(jsonb_array_length(public.messaging_api('admin_players','{"scope":"org:30000000-0000-0000-0000-000000000001","query":"Group player","globalAudience":true}'))=2,'ordinary organisation admin remains limited, even with forged global flags');
select pg_temp.reject($q$select public.messaging_api('admin_send','{"scope":"org:30000000-0000-0000-0000-000000000001","playerIds":[56],"body":"Out of scope","clientId":"90000000-0000-0000-0000-000000000001","globalAudience":true}')$q$,'unavailable');
select pg_temp.login(4,'aal2');
select pg_temp.expect(exists(select 1 from jsonb_array_elements(public.messaging_api('admin_scopes')) s where s->>'id'='org:30000000-0000-0000-0000-000000000001' and (s->>'globalAudience')::boolean),'server advertises global audience to verified Super Admin');
select pg_temp.expect(exists(select 1 from jsonb_array_elements(public.messaging_api('admin_players','{"scope":"org:30000000-0000-0000-0000-000000000001","query":"Group player 56"}')) p where p->>'id'='56'),'Super Admin search finds a player outside the organisation');
select public.messaging_api('admin_send','{"scope":"org:30000000-0000-0000-0000-000000000001","playerIds":[56],"body":"Official org invitation","clientId":"90000000-0000-0000-0000-000000000002"}')->0->>'id' as global_private \gset
select public.messaging_api('admin_send','{"scope":"org:30000000-0000-0000-0000-000000000001","mode":"group","title":"Global organisation group","playerIds":[51,56],"body":"Join this org conversation","clientId":"90000000-0000-0000-0000-000000000003"}')->0->>'id' as global_group \gset
select pg_temp.login(56);
select pg_temp.expect(public.messaging_api('read',jsonb_build_object('conversationId',:'global_private'))->'conversation'->>'organisation'='Organisation A','unlinked player sees the organisation identity on the private invitation');
select public.messaging_api('respond',jsonb_build_object('conversationId',:'global_private','response','accept'));
select public.messaging_api('send',jsonb_build_object('conversationId',:'global_private','body','Player can reply','clientId',gen_random_uuid()));
select public.messaging_api('respond',jsonb_build_object('conversationId',:'global_group','response','accept','groupsVersion','1'));
select public.messaging_api('send',jsonb_build_object('conversationId',:'global_group','body','Group member reply','clientId',gen_random_uuid()));
select pg_temp.login(4,'aal2');
select pg_temp.expect(public.messaging_api('read',jsonb_build_object('conversationId',:'global_private'))->'messages' @> '[{"body":"Player can reply"}]','Super Admin receives the unlinked player’s reply');
select public.messaging_api('admin_send','{"scope":"org:30000000-0000-0000-0000-000000000001","playerIds":[56],"body":"Same conversation follow-up","clientId":"90000000-0000-0000-0000-000000000004"}');
reset role;
select pg_temp.expect(exists(select 1 from messaging.groups where conversation_id=:'global_private'::uuid and global_outreach),'global access is stored on the conversation, not the recipient login');
select pg_temp.expect(exists(select 1 from messaging.audit where actor_id='00000000-0000-0000-0000-000000000004' and subject_id=:'global_private'::uuid and action='super_admin_org_outreach'),'global organisation outreach records the actual staff actor');
update messaging.accounts set allow_requests=false where player_id=54;
insert into messaging.blocks(user_id,blocked_id) values('00000000-0000-0000-0000-000000000055','00000000-0000-0000-0000-000000000004');
set local role authenticated;
select pg_temp.expect(not exists(select 1 from jsonb_array_elements(public.messaging_api('admin_players','{"scope":"org:30000000-0000-0000-0000-000000000001","query":"Group player"}')) p where p->>'id' in ('54','55')),'Super Admin still respects recipient opt-outs and blocks');
select pg_temp.reject($q$select public.messaging_api('admin_send','{"scope":"org:30000000-0000-0000-0000-000000000001","playerIds":[54],"body":"Opt-out attempt","clientId":"90000000-0000-0000-0000-000000000005"}')$q$,'unavailable');
reset role;
insert into public.organisation_members values('30000000-0000-0000-0000-000000000001','staff@test.test','admin');
update public.admin_sidebar_permissions set role='admin' where email='staff@test.test';
set local role authenticated;
select pg_temp.expect(not exists(select 1 from jsonb_array_elements(public.messaging_api('admin_players','{"scope":"org:30000000-0000-0000-0000-000000000001","query":"Group player 56"}')) p where p->>'id'='56'),'revoking Super Admin immediately removes the global search exception');
select pg_temp.reject(format('select public.messaging_api(''send'',%L)',jsonb_build_object('conversationId',:'global_private','body','Downgraded sender','clientId',gen_random_uuid())),'unavailable');
select pg_temp.login(56);
select pg_temp.expect(jsonb_array_length(public.messaging_api('read',jsonb_build_object('conversationId',:'global_private'))->'messages')>0,'recipient retains history after sender loses Super Admin');
reset role;
rollback to savepoint global_outreach;
-- Date boundaries use the event's final day in South Africa, including multi-day events.
savepoint event_cutoff;
insert into public.calendar(id,event_name,start_date,end_date) values
 (3200,'Ended yesterday',current_date-2,current_date-1),
 (3201,'Last event day',current_date-1,current_date),
 (3202,'Upcoming event',current_date+1,current_date+2);
set local role authenticated;
select pg_temp.login(4,'aal2');
select pg_temp.expect(jsonb_array_length(public.messaging_event_directory('Ended yesterday'))=0,'past events do not appear in the send picker');
select pg_temp.expect(jsonb_array_length(public.messaging_event_directory('Last event day'))=1,'multi-day event stays available on its final day');
select public.messaging_api('open_event','{"eventId":3201}') as last_day_channels \gset
select (select value->>'id' from jsonb_array_elements(:'last_day_channels'::jsonb) where value->>'kind'='event_announcements') as last_day_announcements \gset
select pg_temp.expect((public.messaging_api('read',jsonb_build_object('conversationId',:'last_day_announcements'))->'conversation'->>'canSend')::boolean,'final day can send');
reset role;
update public.calendar set end_date=current_date-1 where id=3201;
set local role authenticated;
select pg_temp.expect(not (public.messaging_api('read',jsonb_build_object('conversationId',:'last_day_announcements'))->'conversation'->>'canSend')::boolean,'already-open event becomes read-only after its final day');
select pg_temp.reject(format('select public.messaging_api(''send'',%L)',jsonb_build_object('conversationId',:'last_day_announcements','body','Stale event selection','clientId',gen_random_uuid())),'read-only');
select pg_temp.expect(not exists(select 1 from jsonb_array_elements(public.messaging_api('admin_scopes')) s where s->>'id'='event:3200'),'past event is not offered as a player-message sender');
select pg_temp.reject($q$select public.messaging_api('admin_send','{"scope":"event:3200","playerIds":[56],"body":"Stale event sender","clientId":"90000000-0000-0000-0000-000000000009"}')$q$,'read-only');
reset role;
rollback to savepoint event_cutoff;
