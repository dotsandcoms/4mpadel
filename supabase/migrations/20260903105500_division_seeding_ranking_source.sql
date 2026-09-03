-- Keep the ranking series used for seeding on the division itself so the
-- registration list, public event card and draw generator all resolve the
-- same locally-synced player ranking records.
ALTER TABLE public.tournament_divisions
    ADD COLUMN IF NOT EXISTS seeding_ranking_source TEXT NOT NULL DEFAULT 'active';

COMMENT ON COLUMN public.tournament_divisions.seeding_ranking_source IS
    'DB-backed draw source: active or organisation:<ranking organisation>. Legacy linked snapshots may use rankedin_class.';
