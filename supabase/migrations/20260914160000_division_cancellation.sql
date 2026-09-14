ALTER TABLE public.tournament_divisions
    ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cancelled_by TEXT,
    ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
    ADD COLUMN IF NOT EXISTS cancellation_refund_status TEXT
        CHECK (cancellation_refund_status IN ('processing', 'complete', 'needs_attention'));

ALTER TABLE public.payment_refunds DROP CONSTRAINT IF EXISTS payment_refunds_reason_check;
ALTER TABLE public.payment_refunds ADD CONSTRAINT payment_refunds_reason_check CHECK (reason IN (
    'owner_withdraw', 'partner_withdraw', 'owner_removed_partner', 'admin_removal',
    'admin_cash_refund', 'division_switch', 'event_cancelled', 'division_cancelled'
));

-- Enforce this for all clients, including stale browser tabs and admin inserts.
CREATE OR REPLACE FUNCTION public.reject_cancelled_division_entry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE division_cancelled_at TIMESTAMPTZ;
BEGIN
    IF NEW.status = 'withdrawn' THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' THEN
        IF NEW.event_id IS NOT DISTINCT FROM OLD.event_id
           AND NEW.division_id IS NOT DISTINCT FROM OLD.division_id
           AND NEW.division IS NOT DISTINCT FROM OLD.division
           AND OLD.status IS DISTINCT FROM 'withdrawn' THEN RETURN NEW; END IF;
    END IF;
    -- Share the division row lock with the cancellation claim, so registrations
    -- committing before cancellation are included in its subsequent snapshot.
    SELECT cancelled_at INTO division_cancelled_at FROM public.tournament_divisions
    WHERE event_id = NEW.event_id
      AND ((NEW.division_id IS NOT NULL AND id = NEW.division_id)
        OR (NEW.division_id IS NULL AND name = NEW.division))
    FOR SHARE;
    IF division_cancelled_at IS NOT NULL THEN
        RAISE EXCEPTION 'This division has been cancelled and is closed to entries';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER reject_cancelled_division_entry
BEFORE INSERT OR UPDATE ON public.event_registrations
FOR EACH ROW EXECUTE FUNCTION public.reject_cancelled_division_entry();

ALTER TABLE public.tournament_divisions ADD CONSTRAINT cancelled_division_inactive
CHECK (cancelled_at IS NULL OR is_active = false);
