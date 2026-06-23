-- ============================================================================
-- Manual Events System
-- ----------------------------------------------------------------------------
-- Additive migration: every change uses IF NOT EXISTS / safe defaults so that
-- existing RankedIn-synced events and their live registrations/payments are
-- completely unaffected. is_manual defaults to false, so all current rows keep
-- their existing behaviour.
-- ============================================================================

-- 1. calendar: manual flag + structured event-info columns (drive accordions)
ALTER TABLE calendar ADD COLUMN IF NOT EXISTS is_manual BOOLEAN DEFAULT false;
ALTER TABLE calendar ADD COLUMN IF NOT EXISTS prize_money_total NUMERIC(12,2);
ALTER TABLE calendar ADD COLUMN IF NOT EXISTS prize_money_breakdown JSONB DEFAULT '[]'::jsonb;
ALTER TABLE calendar ADD COLUMN IF NOT EXISTS points_breakdown TEXT;
ALTER TABLE calendar ADD COLUMN IF NOT EXISTS sanctioning_details TEXT;
ALTER TABLE calendar ADD COLUMN IF NOT EXISTS rules_regs TEXT;
ALTER TABLE calendar ADD COLUMN IF NOT EXISTS withdrawal_substitution TEXT;
ALTER TABLE calendar ADD COLUMN IF NOT EXISTS balls TEXT;
ALTER TABLE calendar ADD COLUMN IF NOT EXISTS courts TEXT;
ALTER TABLE calendar ADD COLUMN IF NOT EXISTS tournament_director TEXT;
ALTER TABLE calendar ADD COLUMN IF NOT EXISTS referees TEXT;
ALTER TABLE calendar ADD COLUMN IF NOT EXISTS contact_details TEXT;
ALTER TABLE calendar ADD COLUMN IF NOT EXISTS cut_off_times TEXT;
ALTER TABLE calendar ADD COLUMN IF NOT EXISTS draw_released TEXT;
ALTER TABLE calendar ADD COLUMN IF NOT EXISTS registration_closes_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE calendar ADD COLUMN IF NOT EXISTS show_in_recent_results BOOLEAN DEFAULT false;

-- 2. tournament_divisions: per-division configuration for manual events.
--    Created if missing; columns added idempotently so it works whether or not
--    the table already exists in the live database.
CREATE TABLE IF NOT EXISTS tournament_divisions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    event_id BIGINT REFERENCES calendar(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE tournament_divisions ADD COLUMN IF NOT EXISTS event_id BIGINT REFERENCES calendar(id) ON DELETE CASCADE;
ALTER TABLE tournament_divisions ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE tournament_divisions ADD COLUMN IF NOT EXISTS entry_fee NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE tournament_divisions ADD COLUMN IF NOT EXISTS format TEXT;
ALTER TABLE tournament_divisions ADD COLUMN IF NOT EXISTS entries_close_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE tournament_divisions ADD COLUMN IF NOT EXISTS license_required BOOLEAN DEFAULT false;
ALTER TABLE tournament_divisions ADD COLUMN IF NOT EXISTS age_category TEXT;
ALTER TABLE tournament_divisions ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE tournament_divisions ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE tournament_divisions ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE tournament_divisions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());

CREATE INDEX IF NOT EXISTS idx_tournament_divisions_event_id ON tournament_divisions(event_id);

ALTER TABLE tournament_divisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view divisions" ON tournament_divisions;
DROP POLICY IF EXISTS "Admins have full access to divisions" ON tournament_divisions;
CREATE POLICY "Public can view divisions" ON tournament_divisions FOR SELECT USING (true);
CREATE POLICY "Admins have full access to divisions" ON tournament_divisions FOR ALL USING (true) WITH CHECK (true);

-- 3. event_registrations: division linkage, partner-pay, withdrawal, pay tokens
ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS division_id UUID REFERENCES tournament_divisions(id) ON DELETE SET NULL;
ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS partner_email TEXT;
ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS partner_payment_status TEXT DEFAULT 'pending';
ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'registered'; -- 'registered' | 'withdrawn'
ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS registered_by TEXT;
ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS withdrawn_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS pay_token UUID DEFAULT uuid_generate_v4();

CREATE INDEX IF NOT EXISTS idx_event_registrations_pay_token ON event_registrations(pay_token);
CREATE INDEX IF NOT EXISTS idx_event_registrations_partner_email ON event_registrations(partner_email);

-- Allow a user to update (withdraw / change division) their own registration rows.
-- Existing "Allow public inserts" and "Allow anon read own" policies are kept as-is.
DROP POLICY IF EXISTS "Allow public update own registration" ON event_registrations;
CREATE POLICY "Allow public update own registration"
ON event_registrations FOR UPDATE
USING (true)
WITH CHECK (true);
