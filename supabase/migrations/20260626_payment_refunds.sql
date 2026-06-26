-- ============================================================================
-- Event Registration Refunds — Phase 1 (Foundation)
-- ----------------------------------------------------------------------------
-- Additive migration. Every change uses IF NOT EXISTS / safe defaults so that
-- existing RankedIn-synced events and their live registrations/payments are
-- completely unaffected.
--
-- Money convention: amounts are stored in RANDS (matching payments.amount,
-- NUMERIC(10,2)). Conversion to Paystack subunits (cents) happens only at the
-- Paystack API boundary inside the edge function.
-- ============================================================================

-- 1. payment_refunds: one row per Paystack refund call (or per cash refund).
--    A single original payment can have multiple partial-refund rows.
CREATE TABLE IF NOT EXISTS public.payment_refunds (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
    event_registration_id UUID REFERENCES event_registrations(id) ON DELETE SET NULL,
    paystack_refund_id TEXT,            -- Paystack refund id; idempotency key once known
    paystack_reference TEXT,            -- original transaction reference
    amount NUMERIC(10,2) NOT NULL,      -- RANDS, consistent with payments.amount
    currency TEXT DEFAULT 'ZAR',
    status TEXT DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'processed', 'failed', 'needs_attention')),
    reason TEXT NOT NULL
        CHECK (reason IN ('owner_withdraw', 'partner_withdraw', 'owner_removed_partner', 'admin_removal', 'admin_cash_refund')),
    initiated_by TEXT NOT NULL,         -- email or admin user id
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    processed_at TIMESTAMPTZ
);

-- Idempotency guard: a given Paystack refund maps to exactly one row.
-- Partial index allows multiple NULLs (cash refunds / not-yet-known ids).
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_refunds_paystack_refund_id
    ON public.payment_refunds (paystack_refund_id)
    WHERE paystack_refund_id IS NOT NULL;

-- Lookup indexes
CREATE INDEX IF NOT EXISTS idx_payment_refunds_payment_id
    ON public.payment_refunds (payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_event_registration_id
    ON public.payment_refunds (event_registration_id);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_reference
    ON public.payment_refunds (paystack_reference);

-- 2. event_registrations: refund bookkeeping columns.
--    payment_status is free-text today ('pending' | 'paid' | ...), so the new
--    'refunded' value needs no constraint change.
ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;
ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(10,2);

-- 3. RLS for payment_refunds.
--    Writes are service-role only (edge functions bypass RLS via service key).
--    Authenticated admins may read; public is blocked.
ALTER TABLE public.payment_refunds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read refunds" ON public.payment_refunds;
CREATE POLICY "Admins can read refunds"
ON public.payment_refunds
FOR SELECT
USING (
    auth.jwt() ->> 'email' IN (
        SELECT email FROM public.admin_sidebar_permissions
    )
);

-- No INSERT/UPDATE/DELETE policies are defined, so non-service-role clients
-- cannot write. The service role (used by edge functions) bypasses RLS.
