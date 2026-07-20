-- Payment reminder stages: 7 / 3 / 1 days before registration closes.
-- Idempotent. Old reminder_sent_at / close_reminder_sent_at kept for history.

ALTER TABLE public.event_registrations
    ADD COLUMN IF NOT EXISTS reminder_7d_sent_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS reminder_3d_sent_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS reminder_1d_sent_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_event_registrations_reminder_7d
    ON public.event_registrations(reminder_7d_sent_at);
CREATE INDEX IF NOT EXISTS idx_event_registrations_reminder_3d
    ON public.event_registrations(reminder_3d_sent_at);
CREATE INDEX IF NOT EXISTS idx_event_registrations_reminder_1d
    ON public.event_registrations(reminder_1d_sent_at);

COMMENT ON COLUMN public.event_registrations.reminder_7d_sent_at IS
    'When the 7-days-before-close unpaid payment reminder was sent';
COMMENT ON COLUMN public.event_registrations.reminder_3d_sent_at IS
    'When the 3-days-before-close unpaid payment reminder was sent';
COMMENT ON COLUMN public.event_registrations.reminder_1d_sent_at IS
    'When the 1-day-before-close unpaid payment reminder was sent';
