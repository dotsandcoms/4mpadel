-- Review queue for Google Places matches, so the admin UI can show what the
-- enrichment script found and let an admin approve/dismiss uncertain matches
-- without touching the DB directly.

CREATE TABLE IF NOT EXISTS public.club_google_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    match_status TEXT NOT NULL CHECK (match_status IN ('matched', 'low_confidence', 'no_match', 'conflict')),
    review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'applied', 'dismissed')),
    google_place_id TEXT,
    google_name TEXT,
    google_address TEXT,
    confidence NUMERIC,
    fill_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
    meta_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
    business_status TEXT,
    conflict_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at TIMESTAMPTZ,
    UNIQUE (club_id)
);

CREATE INDEX IF NOT EXISTS club_google_matches_review_status_idx ON public.club_google_matches (review_status);

ALTER TABLE public.club_google_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated manage club google matches" ON public.club_google_matches;
CREATE POLICY "Authenticated manage club google matches"
    ON public.club_google_matches FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);
