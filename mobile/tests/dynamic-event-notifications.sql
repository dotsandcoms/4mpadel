-- Isolated fixture database only.
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean,message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION '%',message; END IF; END $$;
INSERT INTO players(email,name) VALUES('dynamic@example.com','Dynamic tester');
INSERT INTO calendar(id,event_name,start_date,end_date,venue,registration_opens_at,registration_closes_at)
VALUES(777,'Dynamic Open',current_date+5,current_date+6,'Original club',now()-interval '1 day',now()+interval '3 days');
INSERT INTO event_registrations(event_id,email,full_name,payment_status) VALUES(777,'dynamic@example.com','Dynamic tester','paid');
SELECT refresh_tournament_notifications();
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM tournament_notification_jobs WHERE event_id=777 AND topic='event-update'),'initial snapshot is silent');
UPDATE calendar SET registration_closes_at=registration_closes_at+interval '1 day' WHERE id=777;
SELECT refresh_tournament_notifications();
SELECT pg_temp.assert((SELECT title='Entry deadline changed' AND body LIKE '%Entries close:% → % SAST.%' AND jsonb_array_length(data->'changes')=1 FROM tournament_notification_jobs WHERE event_id=777 AND topic='event-update'),'deadline message names the change and both times');
UPDATE calendar SET venue='New club' WHERE id=777;
SELECT refresh_tournament_notifications();
SELECT pg_temp.assert((SELECT jsonb_array_length(data->'changes')=2 AND body LIKE '%Original club → New club%' FROM tournament_notification_jobs WHERE event_id=777 AND topic='event-update'),'pending edits merge from original baseline');
UPDATE calendar SET registration_closes_at=registration_closes_at-interval '1 day',venue='Original club' WHERE id=777;
SELECT refresh_tournament_notifications();
SELECT pg_temp.assert((SELECT NOT active FROM tournament_notification_jobs WHERE event_id=777 AND topic='event-update'),'reverted pending edits are cancelled');
UPDATE calendar SET registration_opens_at=registration_opens_at+interval '1 hour' WHERE id=777;
SELECT refresh_tournament_notifications();
SELECT pg_temp.assert((SELECT title='Registration opening changed' AND jsonb_array_length(data->'changes')=1 FROM tournament_notification_jobs WHERE event_id=777 AND topic='event-update'),'opening date is tracked separately');
UPDATE tournament_notification_jobs SET fire_at=now()-interval '1 minute' WHERE event_id=777 AND topic='event-update';
SELECT refresh_tournament_notifications();
SELECT pg_temp.assert((SELECT NOT(push_delivery_context(outbox_id)?'skip') FROM tournament_notification_jobs WHERE event_id=777 AND topic='event-update'),'fresh dynamic notification passes delivery validation');
UPDATE calendar SET early_bird_ends_at=now()+interval '2 days' WHERE id=777;
SELECT pg_temp.assert((SELECT push_delivery_context(outbox_id)?'skip' FROM tournament_notification_jobs WHERE event_id=777 AND topic='event-update'),'new fields invalidate stale notifications before refresh');
SELECT refresh_tournament_notifications();
SELECT pg_temp.assert((SELECT jsonb_array_length(data->'changes')=1 AND body LIKE '%Early bird ends: to be confirmed → %' FROM tournament_notification_jobs WHERE event_id=777 AND topic='event-update'),'after dispatch, new updates use latest snapshot');
SELECT pg_temp.assert(notification_event_changes('{"venue":"Old venue"}','{"venue":null}')->0->>'after'='to be confirmed','removed values are explicit');
SELECT pg_temp.assert(notification_event_changes('{"entry_fee":"200"}','{"entry_fee":"250"}')->0->>'after'='R 250.00','fees are readable currency');
SELECT pg_temp.assert(notification_event_changes('{}','{"irrelevant":"changed"}')='[]','untracked edits are silent');
ROLLBACK;
