-- Migration: Add slug column to albums table
-- Created at: 2026-04-08

-- 1. Add the slug column
ALTER TABLE public.albums ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;

-- 2. Populate slugs for existing albums based on their titles
-- We use a simple regex-based slugification for the backfill
UPDATE public.albums 
SET slug = LOWER(REGEXP_REPLACE(REGEXP_REPLACE(title, '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g'))
WHERE slug IS NULL;

-- 3. Ensure any duplicates from the backfill are handled (adding ID fragment if needed)
-- (This is a simplified version, usually you'd use a loop or more complex SQL for guaranteed uniqueness)
UPDATE public.albums a
SET slug = slug || '-' || SUBSTR(id::text, 1, 4)
WHERE id IN (
    SELECT id 
    FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY slug ORDER BY created_at) as rn 
        FROM public.albums
    ) t 
    WHERE rn > 1
);
