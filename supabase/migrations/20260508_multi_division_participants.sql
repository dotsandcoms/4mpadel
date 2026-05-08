-- Update tournament_participants to support multiple divisions per player
-- This allows a player (rankedin_participant_id) to have separate entries for different divisions in the same tournament
ALTER TABLE tournament_participants DROP CONSTRAINT IF EXISTS tournament_participants_event_participant_unique;

-- Add the new constraint that includes class_name
-- This ensures uniqueness per (Event, Player, Division)
ALTER TABLE tournament_participants ADD CONSTRAINT tournament_participants_event_participant_division_unique UNIQUE (event_id, rankedin_participant_id, class_name);
