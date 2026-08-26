-- Phase 3B: organiser-controlled public draw content.
-- Additive only. These fields affect the public tournament presentation, not
-- registrations, recorded results, or player ranking points.

ALTER TABLE public.draws
    ADD COLUMN IF NOT EXISTS public_announcement TEXT,
    ADD COLUMN IF NOT EXISTS announcement_updated_at TIMESTAMPTZ;

ALTER TABLE public.draw_matches
    ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_draw_matches_featured
    ON public.draw_matches(draw_id, is_featured)
    WHERE is_featured = true;
