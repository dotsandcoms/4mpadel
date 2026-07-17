-- Link manual-event divisions to RankedIn tournament classes for draw sync.
-- Additive only — existing RankedIn-synced and manual events are unaffected.

ALTER TABLE public.tournament_divisions
    ADD COLUMN IF NOT EXISTS rankedin_class_id TEXT;

CREATE INDEX IF NOT EXISTS idx_tournament_divisions_rankedin_class_id
    ON public.tournament_divisions (rankedin_class_id)
    WHERE rankedin_class_id IS NOT NULL;

COMMENT ON COLUMN public.tournament_divisions.rankedin_class_id IS
    'RankedIn TournamentClass Id for this division (used when syncing entries/draws).';
