BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean,message text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION '%',message; END IF; END $$;
INSERT INTO calendar(id,event_name,start_date,end_date,registration_closes_at) VALUES(701,'Followed deadline',current_date+1,current_date+2,now()-interval '1 minute');
INSERT INTO event_registrations(event_id,email,status,payment_status) VALUES(701,'withdrawn@example.com','withdrawn','paid'),(701,'entrant@example.com','registered','paid');
INSERT INTO event_notification_follows(event_id,email,created_at) VALUES
 (701,'follower@example.com',now()-interval '1 hour'),
 (701,'withdrawn@example.com',now()-interval '1 hour'),
 (701,'entrant@example.com',now()-interval '1 hour'),
 (701,'late@example.com',now());
SELECT refresh_tournament_notifications();
SELECT pg_temp.assert((SELECT count(*)=3 FROM push_outbox WHERE type='registration_closed'),'entrant, follower and opted-in withdrawn player each get one closure');
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM push_outbox WHERE type='registration_closed' AND email='late@example.com'),'late follows do not replay a closed deadline');
SELECT pg_temp.assert((SELECT bool_and(NOT(push_delivery_context(id)?'skip')) FROM push_outbox WHERE type='registration_closed'),'current closure jobs pass delivery validation');
SELECT refresh_tournament_notifications();
SELECT pg_temp.assert((SELECT count(*)=3 FROM push_outbox WHERE type='registration_closed'),'reconciliation does not duplicate closure alerts');
UPDATE event_notification_follows SET following=false WHERE email='follower@example.com';
SELECT pg_temp.assert((SELECT push_delivery_context(id)?'skip' FROM push_outbox WHERE type='registration_closed' AND email='follower@example.com'),'unfollow suppresses a queued follower alert immediately');
UPDATE event_notification_follows SET created_at=now() WHERE email='withdrawn@example.com';
SELECT pg_temp.assert((SELECT push_delivery_context(id)?'skip' FROM push_outbox WHERE type='registration_closed' AND email='withdrawn@example.com'),'refollow after deadline does not revive a stale alert');
UPDATE calendar SET registration_closes_at=now()+interval '1 hour' WHERE id=701;
SELECT pg_temp.assert((SELECT bool_and(push_delivery_context(id)?'skip') FROM push_outbox WHERE type='registration_closed'),'a changed deadline invalidates old queued closures');
-- Saving is atomic with following, and explicit preferences remain independent afterwards.
INSERT INTO player_schedule_events(user_email,event_id) VALUES('SAVED@example.com',701);
SELECT pg_temp.assert((SELECT following FROM event_notification_follows WHERE email='saved@example.com' AND event_id=701),'adding to schedule automatically follows for the correct account');
UPDATE event_notification_follows SET following=false WHERE email='saved@example.com';
SELECT refresh_tournament_notifications();
SELECT pg_temp.assert((SELECT NOT following FROM event_notification_follows WHERE email='saved@example.com'),'scheduler respects explicit unfollow even while event remains saved');
DELETE FROM player_schedule_events WHERE lower(user_email)='saved@example.com';
INSERT INTO player_schedule_events(user_email,event_id) VALUES('saved@example.com',701);
SELECT pg_temp.assert((SELECT following FROM event_notification_follows WHERE email='saved@example.com'),'explicitly adding again turns updates back on');
DELETE FROM player_schedule_events WHERE user_email='saved@example.com';
SELECT pg_temp.assert((SELECT NOT following FROM event_notification_follows WHERE email='saved@example.com'),'removing a schedule item stops general tournament updates');
INSERT INTO player_schedule_events(user_email,event_id) VALUES('entrant@example.com',701);
DELETE FROM player_schedule_events WHERE user_email='entrant@example.com';
SELECT pg_temp.assert((SELECT NOT following FROM event_notification_follows WHERE email='entrant@example.com'),'removal unfollows an entrant too');
SELECT pg_temp.assert(EXISTS(SELECT 1 FROM event_notification_participants(701) WHERE email='entrant@example.com'),'removal preserves active-entry notification eligibility');
ROLLBACK;
