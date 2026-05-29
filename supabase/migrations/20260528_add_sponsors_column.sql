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
