-- Continue within the isolated messaging test database/transaction.
reset role;
alter table public.push_outbox add column data jsonb default '{}';
\ir ../supabase/migrations/20261116082904_notification_inbox_retention.sql

insert into public.calendar(id,event_name,start_date,end_date) values
  (91001,'Past multi-day event',current_date-5,current_date-1),
  (91002,'Ongoing multi-day event',current_date-2,current_date+1),
  (91003,'Single-day event',current_date,null),
  (91004,'Undated event',null,null),
  (91005,'SAST boundary event','2026-11-16','2026-11-16');

do $$declare row public.push_outbox;begin
  row.created_at:='2026-11-16T08:00:00Z'; row.not_before:=row.created_at; row.obsolete:=false; row.data:='{}';
  row.path:='/events/91005?tab=Results';
  if not messaging.notification_is_current(row,'2026-11-16T21:59:59Z') then raise exception 'Event must stay through its final day in SAST'; end if;
  if messaging.notification_is_current(row,'2026-11-16T22:00:00Z') then raise exception 'Event must disappear at midnight SAST, independently of database timezone'; end if;
  row.path:='/(tabs)/rankings';
  row.created_at:='2026-11-02T08:00:00Z'; row.not_before:=row.created_at;
  if not messaging.notification_is_current(row,'2026-11-16T08:00:00Z') then raise exception 'Fourteen-day cutoff is inclusive'; end if;
  if messaging.notification_is_current(row,'2026-11-16T08:00:01Z') then raise exception 'Non-event history must expire after fourteen days'; end if;
  row.data:='{"event_id":"99999999999999999999999999999999999999999"}';
  if messaging.notification_is_current(row,'2026-11-16T08:00:01Z') then raise exception 'Malformed event metadata must fall back safely'; end if;
end $$;

delete from public.push_outbox where lower(trim(email))='group-56@test.test';
insert into public.push_outbox(email,type,title,path,created_at,data) values
  ('group-56@test.test','ranking_change','Recent ranking','/(tabs)/rankings',now()-interval '13 days','{}'),
  ('group-56@test.test','ranking_change','Old ranking','/(tabs)/rankings',now()-interval '15 days','{}'),
  ('group-56@test.test','event_updated','Past event','/events/91001?tab=Overview',now(),'{}'),
  ('group-56@test.test','event_updated','Old notification for ongoing event','/events/91002',now()-interval '45 days','{}'),
  ('group-56@test.test','event_updated','Final day','/events/91003',now(),'{}'),
  ('group-56@test.test','event_updated','Undated old event','/events/91004',now()-interval '15 days','{}'),
  ('group-56@test.test','event_updated','Removed event','/events/999999',now(),'{}'),
  ('group-56@test.test','payment_confirmation','Past event via metadata','/(tabs)',now(),'{"event_id":91001}'),
  ('group-56@test.test','payment_confirmation','Past event via registration route','/events/register?mode=pay&id=91001',now(),'{}'),
  ('group-56@test.test','admin_broadcast','Recent general update','/(tabs)',now(),'{}'),
  ('group-52@test.test','admin_broadcast','Other account retention','/(tabs)',now(),'{}');
-- A wall of recent-but-expired events must not displace current notifications.
insert into public.push_outbox(email,type,title,path)
  select 'group-56@test.test','event_updated','Expired filler '||id,'/events/91001' from generate_series(1,60) id;

select messaging.unread_total('00000000-0000-0000-0000-000000000056') as retention_chat_unread \gset
set local role authenticated;
select pg_temp.login(56);
select public.player_notification_api('list') as retention_snapshot \gset
select pg_temp.expect(jsonb_array_length(:'retention_snapshot'::jsonb->'items')=4,'past events and old general history are removed before the fifty-row limit');
select pg_temp.expect((:'retention_snapshot'::jsonb->>'unread')::int=4,'expired updates never inflate the notification unread count');
select pg_temp.expect(public.own_app_badge_unread()=:'retention_chat_unread'::bigint+4,'icon badge uses the same retention policy without changing chat unread');
select pg_temp.expect((select count(*)=4 from public.get_player_notifications()),'legacy notification RPC follows the same retention rule');
select pg_temp.expect(not exists(select 1 from public.get_player_notifications() where title='Other account retention'),'legacy RPC keeps ownership checks');
select public.player_notification_api('read',null,(:'retention_snapshot'::jsonb->>'through')::timestamptz);
select pg_temp.expect((public.player_notification_api('list')->>'unread')::int=0,'mark-all-read still clears all current notifications');
select pg_temp.expect(jsonb_array_length(public.player_notification_api('list')->'items')=4,'reading does not remove current history');
reset role;
select pg_temp.expect((select count(*)=70 from public.push_outbox where lower(trim(email))='group-56@test.test'),'expired delivery and audit records remain stored');
select pg_temp.expect(not has_function_privilege('anon','public.get_player_notifications()','EXECUTE'),'legacy inbox denies anonymous access');
select pg_temp.expect(not has_function_privilege('authenticated','messaging.notification_is_current(public.push_outbox,timestamptz)','EXECUTE'),'retention helper stays private');
select pg_temp.expect(not has_function_privilege('authenticated','messaging.notification_unread(uuid)','EXECUTE'),'arbitrary account unread totals stay private');
select pg_temp.expect(not has_table_privilege('authenticated','public.push_outbox','SELECT,UPDATE'),'inbox storage remains RPC-only');
\echo 'Notification retention DB: event final days, SAST midnight, fourteen-day history, unread badges, pagination and account isolation passed.'
