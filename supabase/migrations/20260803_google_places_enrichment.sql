-- Track Google Places enrichment on clubs so re-syncs are idempotent and reviewable

ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS google_place_id TEXT;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS google_maps_url TEXT;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS google_rating NUMERIC;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS google_ratings_total INTEGER;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS google_synced_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS clubs_google_place_id_unique
    ON public.clubs (google_place_id)
    WHERE google_place_id IS NOT NULL;
