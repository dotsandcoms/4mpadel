-- Add registration opening date to events: registrations are locked
-- until this timestamp. NULL = open immediately (existing behaviour).
ALTER TABLE public.calendar
ADD COLUMN IF NOT EXISTS registration_opens_at TIMESTAMPTZ;
