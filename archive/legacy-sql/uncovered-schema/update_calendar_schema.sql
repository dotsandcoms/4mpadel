-- Add new columns for event details and SORTING
alter table calendar
add column if not exists description text,
add column if not exists start_time text,
add column if not exists end_time text,
add column if not exists address text,
add column if not exists organizer_name text,
add column if not exists organizer_phone text,
add column if not exists organizer_email text,
add column if not exists organizer_website text,
add column if not exists image_url text,
add column if not exists start_date date; -- New column for proper sorting

-- UPDATE 1: Try to parse start_date from event_dates (Best Effort for 2025)
-- This assumes event_dates format like '7 - 8 February' or '24 Feb'
-- We will try to extract the first day and month.
-- NOTE: This is complex in SQL. It might be easier to just add the column and let the user update via Admin.
-- But let's try to set a default for existing rows so they aren't null.

-- For now, let's just add the column. 
-- You (The User) should go to Admin > Calendar and update the dates for correct sorting.

-- Example manual update you can run if you want to fix specific ones now:
-- update calendar set start_date = '2025-02-07' where event_dates like '7%';

-- UPDATE 2: Add slug column for human-readable URLs
ALTER TABLE calendar ADD COLUMN IF NOT EXISTS slug text;

-- Backfill slugs for existing events
UPDATE calendar 
SET slug = lower(regexp_replace(event_name, '[^a-zA-Z0-9]+', '-', 'g'))
WHERE slug IS NULL;
