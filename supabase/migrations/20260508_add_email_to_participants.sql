-- Add email column to tournament_participants to improve matching for payments and notifications
ALTER TABLE tournament_participants ADD COLUMN IF NOT EXISTS email TEXT;

-- Create index for faster matching
CREATE INDEX IF NOT EXISTS idx_tournament_participants_email ON tournament_participants(email);
