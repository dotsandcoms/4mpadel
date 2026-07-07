-- ============================================================
-- Migration 3 — Amendment flow for approved org events
-- Approved events stay live; org edits are stored as a draft in
-- pending_changes and applied only when a 4M admin approves.
-- Idempotent — safe to re-run.
-- ============================================================

-- 1. Draft amendment columns on calendar
ALTER TABLE public.calendar
    ADD COLUMN IF NOT EXISTS pending_changes JSONB,
    ADD COLUMN IF NOT EXISTS pending_changes_status TEXT
        CHECK (pending_changes_status IN ('pending', 'rejected') OR pending_changes_status IS NULL),
    ADD COLUMN IF NOT EXISTS pending_changes_notes TEXT,
    ADD COLUMN IF NOT EXISTS pending_changes_submitted_at TIMESTAMPTZ;

-- 2. Org admins may now update their own events in ANY sanction state.
--    The trigger below makes approved events immutable to org users
--    EXCEPT the amendment draft columns.
DROP POLICY IF EXISTS "Org admins update own org events" ON public.calendar;
CREATE POLICY "Org admins update own org events"
ON public.calendar FOR UPDATE
USING (
    organization_id IS NOT NULL
    AND is_org_admin(organization_id)
);

-- 3. Trigger upgrade: amendment-aware sanctioning enforcement
CREATE OR REPLACE FUNCTION public.enforce_event_sanctioning()
RETURNS TRIGGER AS $$
DECLARE
    v_changes   JSONB;
    v_status    TEXT;
    v_notes     TEXT;
    v_submitted TIMESTAMPTZ;
BEGIN
    -- 4M admins (and service role) bypass all restrictions
    IF is_4m_admin() THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.organization_id IS NOT NULL THEN
            NEW.sanction_status := 'pending';
        END IF;
        RETURN NEW;
    END IF;

    -- UPDATE by a non-admin:
    IF NEW.organization_id IS NOT NULL AND OLD.sanction_status = 'approved' THEN
        -- Approved org events are frozen for org users EXCEPT the
        -- amendment draft columns — keep everything else from OLD.
        v_changes   := NEW.pending_changes;
        v_status    := NEW.pending_changes_status;
        v_notes     := NEW.pending_changes_notes;
        v_submitted := NEW.pending_changes_submitted_at;
        NEW := OLD;
        NEW.pending_changes           := v_changes;
        NEW.pending_changes_status    := v_status;
        NEW.pending_changes_notes     := v_notes;
        NEW.pending_changes_submitted_at := v_submitted;
    ELSE
        -- Pending / rejected events: editable, but sanction fields frozen
        NEW.sanction_status := OLD.sanction_status;
        NEW.rejection_notes := OLD.rejection_notes;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger itself already exists and points at this function; recreate
-- defensively in case it was dropped.
DROP TRIGGER IF EXISTS trg_enforce_event_sanctioning ON public.calendar;
CREATE TRIGGER trg_enforce_event_sanctioning
BEFORE INSERT OR UPDATE ON public.calendar
FOR EACH ROW EXECUTE FUNCTION public.enforce_event_sanctioning();
