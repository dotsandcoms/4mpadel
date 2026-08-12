-- Migration to add rankedin_id to players table
ALTER TABLE players ADD COLUMN IF NOT EXISTS rankedin_id text;
