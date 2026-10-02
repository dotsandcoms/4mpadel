-- Isolated fixture database only.
BEGIN;
ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS payment_method text;
CREATE FUNCTION pg_temp.assert(ok boolean,message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION '%',message; END IF; END $$;
INSERT INTO calendar(id,event_name) VALUES(999,'Free entry regression');
INSERT INTO event_registrations(event_id,email,full_name,payment_status,payment_method)
VALUES(999,'free@example.com','Free player','paid','free');
SELECT pg_temp.assert((SELECT count(*)=1 FROM push_outbox WHERE email='free@example.com' AND type='event_registration'),'free entry confirmation still sent');
SELECT pg_temp.assert((SELECT count(*)=0 FROM push_outbox WHERE email='free@example.com' AND type='payment_confirmation'),'free entry must not claim payment received');
INSERT INTO event_registrations(event_id,email,full_name,payment_status,payment_method)
VALUES(999,'paid@example.com','Paid player','pending','platform');
UPDATE event_registrations SET payment_status='paid' WHERE email='paid@example.com';
UPDATE event_registrations SET payment_status='paid' WHERE email='paid@example.com';
SELECT pg_temp.assert((SELECT count(*)=1 FROM push_outbox WHERE email='paid@example.com' AND type='payment_confirmation'),'real payment still notifies once');
ROLLBACK;
