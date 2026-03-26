-- Add columns for more granular Live event management
ALTER TABLE public.calendar 
ADD COLUMN IF NOT EXISTS live_players TEXT,
ADD COLUMN IF NOT EXISTS next_match TEXT;

-- Update existing comments or add new ones for clarity
COMMENT ON COLUMN public.calendar.live_players IS 'Current players/match-up being streamed (e.g. Mark Stillerman vs Brad Elin)';
COMMENT ON COLUMN public.calendar.next_match IS 'Information about the next upcoming match (e.g. Dan Stillerman vs Joel Kletz)';
