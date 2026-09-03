-- Event-level court availability used by native draw scheduling.
-- Defaults are created in the admin UI from the calendar event settings, then
-- organisers can refine individual days without changing the event itself.

CREATE TABLE IF NOT EXISTS public.event_play_days (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id BIGINT NOT NULL REFERENCES public.calendar(id) ON DELETE CASCADE,
    play_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    courts_count SMALLINT NOT NULL CHECK (courts_count > 0),
    match_duration_minutes SMALLINT NOT NULL DEFAULT 60 CHECK (match_duration_minutes > 0),
    minimum_break_minutes SMALLINT NOT NULL DEFAULT 10 CHECK (minimum_break_minutes >= 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    UNIQUE (event_id, play_date),
    CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_event_play_days_event_date
    ON public.event_play_days(event_id, play_date);

ALTER TABLE public.event_play_days ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers manage event play days" ON public.event_play_days;
CREATE POLICY "Managers manage event play days"
    ON public.event_play_days
    FOR ALL
    USING (public.can_manage_native_draw(event_id))
    WITH CHECK (public.can_manage_native_draw(event_id));

COMMENT ON TABLE public.event_play_days IS
    'Per-day event availability and court capacity used by native draw auto-scheduling.';
