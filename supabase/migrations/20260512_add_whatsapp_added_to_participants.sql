-- Add whatsapp_added column to tournament_participants
ALTER TABLE tournament_participants ADD COLUMN IF NOT EXISTS whatsapp_added BOOLEAN DEFAULT FALSE;

-- Update existing records to FALSE (though default handle it)
UPDATE tournament_participants SET whatsapp_added = FALSE WHERE whatsapp_added IS NULL;
