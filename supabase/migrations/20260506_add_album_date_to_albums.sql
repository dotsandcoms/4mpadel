-- Migration to add album_date to albums table
ALTER TABLE public.albums ADD COLUMN IF NOT EXISTS album_date TIMESTAMPTZ;

-- Comment on the column
COMMENT ON COLUMN public.albums.album_date IS 'Optional manual override for the date displayed on the gallery album. Falls back to created_at if null.';
