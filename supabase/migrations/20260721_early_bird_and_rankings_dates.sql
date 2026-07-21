-- Early bird pricing + rankings milestone for tournament progress
ALTER TABLE public.calendar
  ADD COLUMN IF NOT EXISTS early_bird_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS early_bird_fee NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS rankings_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN public.calendar.early_bird_ends_at IS
  'When early-bird pricing ends; after this, division entry_fee applies.';
COMMENT ON COLUMN public.calendar.early_bird_fee IS
  'Per-player entry fee while early bird is active (overrides division entry_fee).';
COMMENT ON COLUMN public.calendar.rankings_updated_at IS
  'When rankings are expected/updated after the event (tournament progress milestone).';
