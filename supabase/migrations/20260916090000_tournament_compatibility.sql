-- Required additive fields for Tournament Manager on the deployed native-draw schema.
-- Intentionally does not replay unrelated pending draw-branch migrations or triggers.
ALTER TABLE public.draw_matches ADD COLUMN IF NOT EXISTS americano_fixture_key text;
ALTER TABLE public.draw_matches ADD COLUMN IF NOT EXISTS not_before timestamptz;
ALTER TABLE public.draw_matches ADD COLUMN IF NOT EXISTS match_duration_minutes integer;
ALTER TABLE public.event_play_days ADD COLUMN IF NOT EXISTS is_removed boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS draw_matches_americano_fixture ON public.draw_matches(draw_id,americano_fixture_key);
ALTER TABLE public.draws DROP CONSTRAINT IF EXISTS draws_format_check;
ALTER TABLE public.draws ADD CONSTRAINT draws_format_check CHECK(format IN('knockout','group_knockout','group_only','americano'));
