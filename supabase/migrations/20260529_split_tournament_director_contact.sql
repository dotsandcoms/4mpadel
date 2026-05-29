-- Migration: Split tournament_director_contact into separate phone and email columns
-- Date: 2026-05-29

ALTER TABLE public.calendar
ADD COLUMN IF NOT EXISTS tournament_director_phone TEXT,
ADD COLUMN IF NOT EXISTS tournament_director_email TEXT;
