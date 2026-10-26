BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean,message text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION '%',message; END IF; END $$;
INSERT INTO players(id,email,name) VALUES(1,'a@example.com','Alice'),(2,'b@example.com','Bob'),(3,'c@example.com','Charlie'),(4,'d@example.com','Diana');
INSERT INTO calendar(id,event_name,registration_opens_at,registration_closes_at,early_bird_ends_at,early_bird_fee,start_date,end_date) VALUES(101,'Test Open',now()-interval '1 hour',now()+interval '12 hours',now()+interval '4 hours',200,current_date+1,current_date+2);
INSERT INTO tournament_divisions(id,event_id,name) VALUES('00000000-0000-0000-0000-000000000101',101,'Open');
INSERT INTO event_registrations(event_id,division_id,email,partner_email,full_name,partner_name,payment_status) VALUES
(101,'00000000-0000-0000-0000-000000000101','a@example.com','b@example.com','Alice','Bob','paid'),
(101,'00000000-0000-0000-0000-000000000101','c@example.com','d@example.com','Charlie','Diana','pending');
INSERT INTO event_notification_follows(event_id,email,created_at) VALUES(101,'follower@example.com',now()-interval '2 hours');
INSERT INTO draws(id,event_id,division_id,status) VALUES('00000000-0000-0000-0000-000000000201',101,'00000000-0000-0000-0000-000000000101','published');
INSERT INTO draw_entries(id,draw_id,player_one_id,player_two_id,team_name) VALUES
('00000000-0000-0000-0000-000000000301','00000000-0000-0000-0000-000000000201',1,2,'Alice / Bob'),
('00000000-0000-0000-0000-000000000302','00000000-0000-0000-0000-000000000201',3,4,'Charlie / Diana');
INSERT INTO draw_matches(id,draw_id,entry_one_id,entry_two_id,status) VALUES('00000000-0000-0000-0000-000000000401','00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000301','00000000-0000-0000-0000-000000000302','scheduled');
INSERT INTO tournament_schedules(event_id,published_assignments) VALUES(101,jsonb_build_object('00000000-0000-0000-0000-000000000401',jsonb_build_object('scheduled_start',now()+interval '20 minutes','court_name','Court 1')));
SELECT refresh_tournament_notifications();
SELECT pg_temp.assert((SELECT count(*)=4 FROM tournament_notification_jobs WHERE type='match_reminder'),'all four actual players get match reminders');
SELECT pg_temp.assert((SELECT count(*)=0 FROM tournament_notification_jobs WHERE type='match_reminder' AND email='follower@example.com'),'spectators never get personal reminders');
SELECT pg_temp.assert((SELECT count(*)=1 FROM tournament_notification_jobs WHERE type='payment_reminder'),'paid entries have no payment reminder');
SELECT pg_temp.assert((SELECT count(*)=1 FROM push_outbox WHERE type='registration_open'),'followers notified when entries open');
SELECT pg_temp.assert((SELECT count(*)=4 FROM push_outbox WHERE type='match_reminder'),'due reminders enter outbox');
SELECT refresh_tournament_notifications();
SELECT pg_temp.assert((SELECT count(*)=4 FROM push_outbox WHERE type='match_reminder'),'repeat scheduler does not duplicate');
SELECT pg_temp.assert((SELECT bool_and(NOT(push_delivery_context(id)?'skip')) FROM push_outbox WHERE type='match_reminder'),'fresh reminders valid');
-- Change published time without running scheduler: send-time validation must already reject the old reminder.
UPDATE tournament_schedules SET published_assignments=jsonb_set(published_assignments,'{00000000-0000-0000-0000-000000000401,scheduled_start}',to_jsonb(now()+interval '2 hours'));
SELECT pg_temp.assert((SELECT bool_and(push_delivery_context(id)?'skip') FROM push_outbox WHERE type='match_reminder'),'time changes invalidate old queued reminders immediately');
SELECT refresh_tournament_notifications();
SELECT pg_temp.assert((SELECT count(*)=4 FROM tournament_notification_jobs WHERE type='schedule_changed'),'court/time changes notify four players');
SELECT pg_temp.assert((SELECT count(*)=4 FROM push_outbox WHERE type='match_reminder' AND obsolete),'replaced reminders hidden from inbox');
-- A private edit to draw_matches is not a public schedule change.
UPDATE draw_matches SET scheduled_start=now()+interval '5 hours';
SELECT refresh_tournament_notifications();
SELECT pg_temp.assert((SELECT bool_and((data->>'state')=md5(notification_match_state('00000000-0000-0000-0000-000000000401')::text)) FROM tournament_notification_jobs WHERE type='schedule_changed'),'private times do not replace published times');
UPDATE event_registrations SET payment_status='paid' WHERE email='c@example.com';
SELECT pg_temp.assert((SELECT bool_and(push_delivery_context(id)?'skip') FROM push_outbox WHERE type='payment_reminder'),'payment suppresses queued deadline reminder');
UPDATE event_notification_follows SET following=false;
SELECT pg_temp.assert((SELECT bool_and(push_delivery_context(id)?'skip') FROM push_outbox WHERE type IN('registration_open','early_bird_ending','registration_closing')),'unfollow suppresses queued updates');
UPDATE draw_matches SET status='completed',winner_entry_id='00000000-0000-0000-0000-000000000301';
INSERT INTO draw_match_sets VALUES('00000000-0000-0000-0000-000000000401',1,6,2);
SELECT refresh_tournament_notifications();
SELECT pg_temp.assert((SELECT count(*)=4 FROM tournament_notification_jobs WHERE type='result_confirmed'),'confirmed results notify all participants');
UPDATE draw_match_sets SET entry_two_games=3;
SELECT refresh_tournament_notifications();
SELECT pg_temp.assert((SELECT count(*)=4 FROM tournament_notification_jobs WHERE type='result_corrected'),'same-winner score correction is detected');
INSERT INTO tournament_finalisations VALUES('00000000-0000-0000-0000-000000000101',101,'confirmed-revision');
SELECT pg_temp.assert((SELECT count(*)=4 FROM tournament_notification_jobs WHERE type='tournament_finished'),'finalisation targets division participants');
INSERT INTO player_ranking_points(player_id,event_id,division_id,points,round_code) VALUES(1,101,'00000000-0000-0000-0000-000000000101',120,'winner');
SELECT pg_temp.assert((SELECT count(*)=1 FROM tournament_notification_jobs WHERE type='ranking_change' AND email='a@example.com'),'actual award notifies only affected player');
SELECT pg_temp.assert(notification_quiet_until('{"quiet_hours_enabled":true,"quiet_start":22,"quiet_end":7,"timezone":"Africa/Johannesburg"}','2026-09-25 23:00+02')='2026-09-26 07:00+02'::timestamptz,'overnight quiet hours');
SELECT pg_temp.assert(notification_quiet_until('{"quiet_hours_enabled":true,"quiet_start":9,"quiet_end":17,"timezone":"Africa/Johannesburg"}','2026-09-25 12:00+02')='2026-09-25 17:00+02'::timestamptz,'daytime quiet hours');
SELECT pg_temp.assert(notification_quiet_until('{"quiet_hours_enabled":true,"quiet_start":22,"quiet_end":7,"timezone":"America/New_York"}','2026-11-01 00:00-04')='2026-11-01 07:00-05'::timestamptz,'DST quiet hours');
SELECT pg_temp.assert(NOT has_function_privilege('authenticated','notification_match_recipients(uuid)','execute'),'recipient emails inaccessible to players');
SELECT pg_temp.assert(NOT has_function_privilege('authenticated','refresh_tournament_notifications()','execute'),'players cannot run scheduler');
SELECT pg_temp.assert(NOT(get_tournament_notification_matches(101)::text LIKE '%example.com%'),'match details contain no recipient emails');

-- Deliver pending non-timed updates without sleeping, then validate receipt-side gates.
UPDATE tournament_notification_jobs SET fire_at=now()-interval '1 minute' WHERE data->>'scheduled' IS DISTINCT FROM 'true';
SELECT refresh_tournament_notifications();
SELECT pg_temp.assert((SELECT bool_and(NOT(push_delivery_context(id)?'skip')) FROM push_outbox WHERE type='ranking_change' AND NOT obsolete),'award payload validates against the live award');
SELECT pg_temp.assert((SELECT count(*)=4 FROM push_outbox WHERE type='result_corrected' AND NOT obsolete),'only latest score correction dispatched');

-- Future round has no resolved entrants; never notify possible feeder players.
INSERT INTO draw_matches(id,draw_id,round_label) VALUES('00000000-0000-0000-0000-000000000402','00000000-0000-0000-0000-000000000201','Semi-final');
SELECT refresh_tournament_notifications();
SELECT pg_temp.assert((SELECT count(*)=0 FROM notification_match_recipients('00000000-0000-0000-0000-000000000402')),'unknown next round has no audience');
UPDATE draw_matches SET entry_one_id='00000000-0000-0000-0000-000000000301' WHERE id='00000000-0000-0000-0000-000000000402';
SELECT refresh_tournament_notifications();
SELECT pg_temp.assert((SELECT count(*)=2 FROM tournament_notification_jobs WHERE type='match_progression'),'advancement notifies both partners of actual advancing team');
UPDATE draw_matches SET entry_two_id='00000000-0000-0000-0000-000000000302' WHERE id='00000000-0000-0000-0000-000000000402';
SELECT refresh_tournament_notifications();
SELECT pg_temp.assert((SELECT count(*)=2 FROM tournament_notification_jobs WHERE type='opponent_confirmed'),'waiting team learns confirmed opponent');
SELECT pg_temp.assert((SELECT count(*)=2 FROM tournament_notification_jobs WHERE type='match_progression'),'newly assigned opponent gets progression');
-- Replay has no additional intent or message.
SELECT refresh_tournament_notifications();
SELECT pg_temp.assert((SELECT count(*)=4 FROM tournament_notification_jobs WHERE topic='match-update:00000000-0000-0000-0000-000000000402'),'next-round update deduplication');
UPDATE draw_matches SET status='in_progress' WHERE id='00000000-0000-0000-0000-000000000402';
SELECT refresh_tournament_notifications();
SELECT pg_temp.assert((SELECT count(*)=4 FROM tournament_notification_jobs WHERE type='tournament_live' AND topic LIKE 'match-update:%'),'actual match start triggers live stage');

-- Harmless ranking metadata/reordering must not produce a push.
UPDATE players SET rankings='[{"org":"SAPA","rank":10,"points":120,"updated_at":"old"}]' WHERE id=1;
SELECT pg_temp.assert((SELECT count(*)=1 FROM push_outbox WHERE type='ranking_change' AND data->>'job_id' IS NULL),'published ranking change is notified');
UPDATE players SET rankings='[{"org":"SAPA","rank":10,"points":120,"updated_at":"new"}]' WHERE id=1;
SELECT pg_temp.assert((SELECT count(*)=1 FROM push_outbox WHERE type='ranking_change' AND data->>'job_id' IS NULL),'ranking metadata is not a change');
INSERT INTO event_notification_follows(event_id,email) VALUES(101,'spectator@example.com');
-- Cancelling an event blocks even already-expanded personal updates.
UPDATE calendar SET event_status='cancelled' WHERE id=101;
SELECT pg_temp.assert((SELECT bool_and(push_delivery_context(id)?'skip') FROM push_outbox WHERE data?'job_id' AND NOT obsolete),'cancellation suppresses queued tournament jobs');
SELECT pg_temp.assert((SELECT count(*)=1 FROM push_outbox WHERE type='event_cancelled' AND email='spectator@example.com'),'following spectator receives cancellation');
ROLLBACK;
