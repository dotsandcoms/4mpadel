-- ============================================================
-- Event-scoped activity log for Event Manager
-- Captures registrations, withdrawals, admin edits, payments.
-- Idempotent — safe to re-run.
-- calendar.id is BIGINT (not UUID).
-- ============================================================

DROP TABLE IF EXISTS public.event_activity_log CASCADE;
DROP FUNCTION IF EXISTS public.log_event_activity(UUID, TEXT, TEXT, TEXT, JSONB, TEXT);
DROP FUNCTION IF EXISTS public.log_event_activity(BIGINT, TEXT, TEXT, TEXT, JSONB, TEXT);
DROP FUNCTION IF EXISTS public._insert_event_activity(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS public._insert_event_activity(BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB);

CREATE TABLE public.event_activity_log (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_id        BIGINT NOT NULL REFERENCES public.calendar(id) ON DELETE CASCADE,
    actor_email     TEXT,
    actor_role      TEXT NOT NULL DEFAULT 'SYSTEM', -- ADMIN | PLAYER | SYSTEM
    action          TEXT NOT NULL,
    category        TEXT NOT NULL DEFAULT 'SYSTEM',
    summary         TEXT NOT NULL,
    details         JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_event_activity_event
    ON public.event_activity_log(event_id, created_at DESC);

ALTER TABLE public.event_activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read event activity log" ON public.event_activity_log;
CREATE POLICY "Read event activity log"
ON public.event_activity_log FOR SELECT
TO authenticated
USING (
    is_4m_admin()
    OR EXISTS (
        SELECT 1 FROM public.calendar c
        WHERE c.id = event_activity_log.event_id
          AND c.organization_id IS NOT NULL
          AND is_org_admin(c.organization_id)
    )
);

-- Internal inserter used by triggers (no auth gate)
CREATE OR REPLACE FUNCTION public._insert_event_activity(
    p_event_id BIGINT,
    p_actor_email TEXT,
    p_actor_role TEXT,
    p_action TEXT,
    p_category TEXT,
    p_summary TEXT,
    p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO public.event_activity_log (
        event_id, actor_email, actor_role, action, category, summary, details
    ) VALUES (
        p_event_id,
        NULLIF(p_actor_email, ''),
        COALESCE(NULLIF(p_actor_role, ''), 'SYSTEM'),
        p_action,
        COALESCE(NULLIF(p_category, ''), 'SYSTEM'),
        p_summary,
        COALESCE(p_details, '{}'::jsonb)
    )
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

-- Client-callable logger for Event Manager admin actions
CREATE OR REPLACE FUNCTION public.log_event_activity(
    p_event_id BIGINT,
    p_action TEXT,
    p_category TEXT,
    p_summary TEXT,
    p_details JSONB DEFAULT '{}'::jsonb,
    p_actor_role TEXT DEFAULT 'ADMIN'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_email TEXT;
    v_allowed BOOLEAN;
BEGIN
    IF p_event_id IS NULL OR COALESCE(p_action, '') = '' OR COALESCE(p_summary, '') = '' THEN
        RAISE EXCEPTION 'event_id, action and summary are required';
    END IF;

    v_email := COALESCE(auth.jwt() ->> 'email', 'anonymous');

    v_allowed := is_4m_admin()
        OR EXISTS (
            SELECT 1 FROM public.calendar c
            WHERE c.id = p_event_id
              AND c.organization_id IS NOT NULL
              AND is_org_admin(c.organization_id)
        );

    IF NOT v_allowed THEN
        RAISE EXCEPTION 'Not allowed to log activity for this event';
    END IF;

    RETURN public._insert_event_activity(
        p_event_id,
        v_email,
        COALESCE(NULLIF(p_actor_role, ''), 'ADMIN'),
        p_action,
        p_category,
        p_summary,
        p_details
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_event_activity(BIGINT, TEXT, TEXT, TEXT, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_event_activity(BIGINT, TEXT, TEXT, TEXT, JSONB, TEXT) TO service_role;

-- ------------------------------------------------------------
-- event_registrations → activity
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_log_event_registration_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_email TEXT;
    v_role TEXT := 'PLAYER';
BEGIN
    v_email := COALESCE(auth.jwt() ->> 'email', NEW.email, 'system');

    IF is_4m_admin() OR EXISTS (
        SELECT 1 FROM public.calendar c
        WHERE c.id = NEW.event_id
          AND c.organization_id IS NOT NULL
          AND is_org_admin(c.organization_id)
    ) THEN
        v_role := 'ADMIN';
    END IF;

    IF TG_OP = 'INSERT' THEN
        PERFORM public._insert_event_activity(
            NEW.event_id,
            v_email,
            v_role,
            'registration.created',
            'REGISTRATION',
            format('Registered for %s', COALESCE(NULLIF(NEW.division, ''), 'event')),
            jsonb_build_object(
                'registration_id', NEW.id,
                'player_name', NEW.full_name,
                'player_email', NEW.email,
                'division', NEW.division,
                'partner_name', NEW.partner_name
            )
        );
        RETURN NEW;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status
       AND lower(COALESCE(NEW.status, '')) = 'withdrawn' THEN
        PERFORM public._insert_event_activity(
            NEW.event_id,
            v_email,
            v_role,
            'registration.withdrawn',
            'PLAYER',
            format('Withdrawn from %s', COALESCE(NULLIF(NEW.division, ''), 'event')),
            jsonb_build_object(
                'registration_id', NEW.id,
                'player_name', NEW.full_name,
                'player_email', NEW.email,
                'division', NEW.division
            )
        );
    END IF;

    -- Skip temporary parking / archive division names used by move flow
    IF NEW.division IS DISTINCT FROM OLD.division
       AND COALESCE(NEW.division, '') NOT LIKE '\_\_moving\_\_/%' ESCAPE '\'
       AND COALESCE(OLD.division, '') NOT LIKE '\_\_moving\_\_/%' ESCAPE '\'
       AND COALESCE(NEW.division, '') NOT LIKE '\_\_archived\_\_/%' ESCAPE '\'
       AND COALESCE(OLD.division, '') NOT LIKE '\_\_archived\_\_/%' ESCAPE '\' THEN
        PERFORM public._insert_event_activity(
            NEW.event_id,
            v_email,
            v_role,
            'registration.moved',
            'ADMIN',
            format('Moved from %s to %s', COALESCE(OLD.division, '—'), COALESCE(NEW.division, '—')),
            jsonb_build_object(
                'registration_id', NEW.id,
                'player_name', NEW.full_name,
                'player_email', NEW.email,
                'from_division', OLD.division,
                'to_division', NEW.division
            )
        );
    END IF;

    IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
        PERFORM public._insert_event_activity(
            NEW.event_id,
            v_email,
            v_role,
            'payment.status_changed',
            'PAYMENT',
            format('Payment status: %s → %s', COALESCE(OLD.payment_status, '—'), COALESCE(NEW.payment_status, '—')),
            jsonb_build_object(
                'registration_id', NEW.id,
                'player_name', NEW.full_name,
                'player_email', NEW.email,
                'from_status', OLD.payment_status,
                'to_status', NEW.payment_status,
                'division', NEW.division
            )
        );
    END IF;

    IF NEW.partner_email IS DISTINCT FROM OLD.partner_email
       AND COALESCE(NEW.partner_email, '') <> '' THEN
        PERFORM public._insert_event_activity(
            NEW.event_id,
            v_email,
            v_role,
            'registration.partner_linked',
            'PLAYER',
            format('Partner linked: %s', COALESCE(NEW.partner_name, NEW.partner_email)),
            jsonb_build_object(
                'registration_id', NEW.id,
                'player_name', NEW.full_name,
                'partner_name', NEW.partner_name,
                'partner_email', NEW.partner_email,
                'division', NEW.division
            )
        );
    END IF;

    IF NEW.full_name IS DISTINCT FROM OLD.full_name
       OR (NEW.email IS DISTINCT FROM OLD.email) THEN
        PERFORM public._insert_event_activity(
            NEW.event_id,
            v_email,
            v_role,
            'registration.profile_updated',
            'ADMIN',
            format('Registration details updated for %s', COALESCE(NEW.full_name, NEW.email)),
            jsonb_build_object(
                'registration_id', NEW.id,
                'from_name', OLD.full_name,
                'to_name', NEW.full_name,
                'from_email', OLD.email,
                'to_email', NEW.email
            )
        );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_registration_activity ON public.event_registrations;
CREATE TRIGGER trg_event_registration_activity
AFTER INSERT OR UPDATE ON public.event_registrations
FOR EACH ROW EXECUTE FUNCTION public.trg_log_event_registration_activity();

-- ------------------------------------------------------------
-- payments → activity
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_log_event_payment_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_email TEXT;
    v_role TEXT := 'PLAYER';
    v_amount NUMERIC;
BEGIN
    IF NEW.event_id IS NULL THEN
        RETURN NEW;
    END IF;

    v_email := COALESCE(
        auth.jwt() ->> 'email',
        NEW.metadata ->> 'email',
        NEW.metadata ->> 'registrant_email',
        'system'
    );
    v_amount := COALESCE(NEW.amount, 0);

    IF is_4m_admin() OR EXISTS (
        SELECT 1 FROM public.calendar c
        WHERE c.id = NEW.event_id
          AND c.organization_id IS NOT NULL
          AND is_org_admin(c.organization_id)
    ) THEN
        v_role := 'ADMIN';
    END IF;

    IF TG_OP = 'INSERT' THEN
        PERFORM public._insert_event_activity(
            NEW.event_id,
            v_email,
            v_role,
            'payment.' || lower(COALESCE(NEW.status, 'created')),
            'PAYMENT',
            CASE lower(COALESCE(NEW.status, ''))
                WHEN 'success' THEN format('Payment received · R %s', trim(to_char(v_amount, '999999990.99')))
                WHEN 'processing' THEN 'Checkout started'
                WHEN 'abandoned' THEN 'Checkout abandoned'
                ELSE format('Payment %s', COALESCE(NEW.status, 'created'))
            END,
            jsonb_build_object(
                'payment_id', NEW.id,
                'status', NEW.status,
                'amount', v_amount,
                'reference', NEW.reference,
                'method', NEW.payment_method
            )
        );
        RETURN NEW;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
        PERFORM public._insert_event_activity(
            NEW.event_id,
            v_email,
            v_role,
            'payment.' || lower(COALESCE(NEW.status, 'updated')),
            'PAYMENT',
            format('Payment status: %s → %s', COALESCE(OLD.status, '—'), COALESCE(NEW.status, '—')),
            jsonb_build_object(
                'payment_id', NEW.id,
                'from_status', OLD.status,
                'to_status', NEW.status,
                'amount', v_amount,
                'reference', NEW.reference
            )
        );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_payment_activity ON public.payments;
CREATE TRIGGER trg_event_payment_activity
AFTER INSERT OR UPDATE OF status ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.trg_log_event_payment_activity();
