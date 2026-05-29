-- Migration: Add court_map_link column to calendar table
-- Date: 2026-05-28

ALTER TABLE public.calendar
ADD COLUMN IF NOT EXISTS court_map_link TEXT;
