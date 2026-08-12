-- DDL migration to support multiple images on player profiles
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS additional_images JSONB DEFAULT '[]'::jsonb;
