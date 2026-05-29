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
