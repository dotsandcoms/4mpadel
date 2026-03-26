-- Add is_visible column to calendar table
-- Default to true so existing events remain visible
ALTER TABLE calendar ADD COLUMN IF NOT EXISTS is_visible BOOLEAN DEFAULT true;

-- Update existing records to ensure they are visible (redundant due to DEFAULT, but safe)
UPDATE calendar SET is_visible = true WHERE is_visible IS NULL;
