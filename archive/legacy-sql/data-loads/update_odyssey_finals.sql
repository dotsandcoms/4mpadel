-- SQL Script to update Padel Odyssey Summer Finals data
-- Run this in your Supabase SQL Editor

UPDATE calendar
SET 
    event_name = 'Padel Odyssey Summer Finals',
    event_dates = '7 - 8 February 2026',
    start_date = '2026-02-07',
    start_time = '08:00 AM',
    end_time = '10:00 PM',
    city = 'Johannesburg',
    venue = 'Padel Odyssey',
    address = '38 Bath Avenue, Rosebank',
    sapa_status = 'Major',
    description = 'Padel Odyssey Major Travel Package & Sponsor Gift Bag. The tournament is part of the Padel Odyssey Cup, structured across multiple divisions (Men''s Pro, Men''s A, Men''s B, Ladies A, Ladies Pro, Mixed) based on Playtomic levels (1.0–7.0). The finals follow qualifying events and are played under specific SAPA rankings.',
    organizer_name = 'Padel Odyssey',
    organizer_website = 'https://www.rankedin.com/en/tournament/63194/padel-odyssey-summer-finals',
    image_url = 'https://rankedin-file-uploads.s3.eu-central-1.amazonaws.com/tournament/63194/cover/1200_300_20241219_103632_78C5389F-8344-4E57-BF69-5C482A0937BB.jpeg'
WHERE slug = 'padel-odyssey-finals';
