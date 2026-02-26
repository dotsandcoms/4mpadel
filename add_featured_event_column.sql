-- Add featured_event, registered_players, rankedin_url and sponsor_logos columns to calendar table
ALTER TABLE calendar ADD COLUMN IF NOT EXISTS featured_event boolean DEFAULT false;
ALTER TABLE calendar ADD COLUMN IF NOT EXISTS registered_players integer DEFAULT 0;
ALTER TABLE calendar ADD COLUMN IF NOT EXISTS rankedin_url text;
ALTER TABLE calendar ADD COLUMN IF NOT EXISTS sponsor_logos text[] DEFAULT '{}';
