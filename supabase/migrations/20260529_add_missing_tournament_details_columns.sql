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
