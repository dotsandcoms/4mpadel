-- Catch-up: tournament wizard columns from feature/orgs-resend (all additive, safe if already applied)

-- Migration: Add Rankedin Wizard Options to Calendar table
-- Date: 2026-05-28

ALTER TABLE public.calendar
ADD COLUMN IF NOT EXISTS tournament_type TEXT DEFAULT 'Single Elimination',
ADD COLUMN IF NOT EXISTS registration_deadline TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS golden_point BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS courts_count INTEGER DEFAULT 4,
ADD COLUMN IF NOT EXISTS allowed_divisions TEXT[] DEFAULT ARRAY['Men''s Open (Pro/Elite)', 'Men''s Advanced', 'Men''s Intermediate', 'Ladies Open (Pro/Elite)', 'Ladies Advanced', 'Ladies Intermediate'],
ADD COLUMN IF NOT EXISTS max_teams_capacity INTEGER DEFAULT 16,
ADD COLUMN IF NOT EXISTS partner_requirement TEXT DEFAULT 'Required';

-- Migration: Add missing tournament details columns based on Section 4.1 specifications
-- Date: 2026-05-29

ALTER TABLE public.calendar
ADD COLUMN IF NOT EXISTS tournament_director_name TEXT,
ADD COLUMN IF NOT EXISTS tournament_director_contact TEXT,
ADD COLUMN IF NOT EXISTS indoor_outdoor TEXT DEFAULT 'Outdoor',
ADD COLUMN IF NOT EXISTS court_labels TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS prize_money_breakdown TEXT,
ADD COLUMN IF NOT EXISTS sponsors_names TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS balls_to_be_used TEXT DEFAULT 'Head Tour',
ADD COLUMN IF NOT EXISTS licences_required BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS licence_types TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS max_ranking_points INTEGER,
ADD COLUMN IF NOT EXISTS back_draw_options TEXT DEFAULT 'Plate Included',
ADD COLUMN IF NOT EXISTS event_co_admins TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS additional_notes TEXT;

-- Migration: Add court_map_link column to calendar table
-- Date: 2026-05-28

ALTER TABLE public.calendar
ADD COLUMN IF NOT EXISTS court_map_link TEXT;

-- No-op Migration: The calendar table already has a category_fees column.
-- We are mapping setup wizard pricing fields directly to category_fees.

-- Migration: Add sponsor_logos column to calendar table and create public storage bucket for tournament media
-- Date: 2026-05-28

ALTER TABLE public.calendar
ADD COLUMN IF NOT EXISTS sponsor_logos TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Create tournament-media bucket if not exists
INSERT INTO storage.buckets (id, name, public) 
VALUES ('tournament-media', 'tournament-media', true)
ON CONFLICT (id) DO NOTHING;

-- Allows public access to read any file in the tournament-media bucket
CREATE POLICY "Public Read Access on tournament-media"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'tournament-media');

-- Allows authenticated users to upload files to the tournament-media bucket
CREATE POLICY "Authenticated users can upload to tournament-media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'tournament-media');

-- Allows authenticated users to update files in the tournament-media bucket
CREATE POLICY "Authenticated users can update in tournament-media"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'tournament-media');

-- Allows authenticated users to delete files in the tournament-media bucket
CREATE POLICY "Authenticated users can delete in tournament-media"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'tournament-media');

-- Migration: Split tournament_director_contact into separate phone and email columns
-- Date: 2026-05-29

ALTER TABLE public.calendar
ADD COLUMN IF NOT EXISTS tournament_director_phone TEXT,
ADD COLUMN IF NOT EXISTS tournament_director_email TEXT;
