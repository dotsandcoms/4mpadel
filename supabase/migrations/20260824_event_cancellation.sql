-- Event cancellation is distinct from deleting an event: the calendar row and
-- audit trail remain, registrations are refunded, and saved schedules are cleared.
ALTER TABLE public.calendar
    ADD COLUMN IF NOT EXISTS event_status TEXT NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cancelled_by TEXT,
    ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
    ADD COLUMN IF NOT EXISTS cancellation_refund_status TEXT;

ALTER TABLE public.calendar
    DROP CONSTRAINT IF EXISTS calendar_event_status_check;
ALTER TABLE public.calendar
    ADD CONSTRAINT calendar_event_status_check
    CHECK (event_status IN ('active', 'cancelled'));

ALTER TABLE public.calendar
    DROP CONSTRAINT IF EXISTS calendar_cancellation_refund_status_check;
ALTER TABLE public.calendar
    ADD CONSTRAINT calendar_cancellation_refund_status_check
    CHECK (
        cancellation_refund_status IS NULL
        OR cancellation_refund_status IN ('processing', 'complete', 'needs_attention')
    );

ALTER TABLE public.payment_refunds
    DROP CONSTRAINT IF EXISTS payment_refunds_reason_check;
ALTER TABLE public.payment_refunds
    ADD CONSTRAINT payment_refunds_reason_check
    CHECK (reason IN (
        'owner_withdraw',
        'partner_withdraw',
        'owner_removed_partner',
        'admin_removal',
        'admin_cash_refund',
        'division_switch',
        'event_cancelled'
    ));

CREATE INDEX IF NOT EXISTS calendar_event_status_idx
    ON public.calendar (event_status);

COMMENT ON COLUMN public.calendar.event_status IS
    'Lifecycle state. Cancelled events remain visible but cannot accept registrations.';
COMMENT ON COLUMN public.calendar.cancellation_refund_status IS
    'Aggregate state of automatic refunds initiated when the event was cancelled.';
