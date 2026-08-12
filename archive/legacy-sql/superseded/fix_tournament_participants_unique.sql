-- Fix: Add unique constraint on tournament_participants so upserts work correctly
-- This is required for the Rankedin sync (onConflict: 'event_id,rankedin_participant_id') to function.

ALTER TABLE tournament_participants
    ADD CONSTRAINT tournament_participants_event_participant_unique
    UNIQUE (event_id, rankedin_participant_id);
