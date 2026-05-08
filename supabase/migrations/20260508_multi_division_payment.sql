-- Update event_registrations to support multiple divisions per player
-- This allows a player (email) to have separate paid entries for different divisions in the same tournament
ALTER TABLE event_registrations DROP CONSTRAINT IF EXISTS event_registrations_event_id_email_key;
ALTER TABLE event_registrations ADD CONSTRAINT event_registrations_event_id_email_division_key UNIQUE (event_id, email, division);
