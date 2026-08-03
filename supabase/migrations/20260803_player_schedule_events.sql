-- User-curated "My Schedule" events (interest / watch list — not registration)
CREATE TABLE IF NOT EXISTS public.player_schedule_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_email TEXT NOT NULL,
    event_id BIGINT NOT NULL REFERENCES public.calendar(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS player_schedule_events_email_event_uidx
    ON public.player_schedule_events (lower(user_email), event_id);

CREATE INDEX IF NOT EXISTS player_schedule_events_email_idx
    ON public.player_schedule_events (lower(user_email));

CREATE INDEX IF NOT EXISTS player_schedule_events_event_id_idx
    ON public.player_schedule_events (event_id);

ALTER TABLE public.player_schedule_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own schedule events" ON public.player_schedule_events;
CREATE POLICY "Users read own schedule events"
    ON public.player_schedule_events FOR SELECT
    USING (lower(user_email) = lower(auth.email()));

DROP POLICY IF EXISTS "Users insert own schedule events" ON public.player_schedule_events;
CREATE POLICY "Users insert own schedule events"
    ON public.player_schedule_events FOR INSERT
    WITH CHECK (lower(user_email) = lower(auth.email()));

DROP POLICY IF EXISTS "Users delete own schedule events" ON public.player_schedule_events;
CREATE POLICY "Users delete own schedule events"
    ON public.player_schedule_events FOR DELETE
    USING (lower(user_email) = lower(auth.email()));
