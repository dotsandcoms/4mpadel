-- 1. Add entry_fee to calendar table
ALTER TABLE calendar ADD COLUMN IF NOT EXISTS entry_fee DECIMAL(10,2) DEFAULT 0.00;

-- 2. Create tournament_participants table for local Rankedin player caching
CREATE TABLE IF NOT EXISTS tournament_participants (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    event_id BIGINT REFERENCES calendar(id) ON DELETE CASCADE,
    rankedin_participant_id TEXT, -- The ID from Rankedin API
    full_name TEXT NOT NULL,
    class_name TEXT,
    profile_id BIGINT REFERENCES players(id) ON DELETE SET NULL, -- Manual or auto mapping to system profiles
    is_paid BOOLEAN DEFAULT false,
    last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- 3. Create payments table for local transaction tracking
CREATE TABLE IF NOT EXISTS payments (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    player_id BIGINT REFERENCES players(id) ON DELETE SET NULL,
    event_id BIGINT REFERENCES calendar(id) ON DELETE SET NULL,
    amount DECIMAL(10,2) NOT NULL,
    currency TEXT DEFAULT 'ZAR',
    status TEXT NOT NULL DEFAULT 'pending', -- 'success', 'failed', 'pending'
    payment_type TEXT NOT NULL, -- 'membership', 'event_entry_fee', 'temp_license'
    payment_method TEXT DEFAULT 'paystack', -- 'paystack', 'manual', 'cash'
    reference TEXT UNIQUE, -- Custom: "[Full Name] - [Event Name]"
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Enable RLS
ALTER TABLE tournament_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- 5. Policies (Clean up existing if any)
DROP POLICY IF EXISTS "Public can view own payments" ON payments;
DROP POLICY IF EXISTS "Admins have full access to payments" ON payments;
DROP POLICY IF EXISTS "Public can view participants" ON tournament_participants;
DROP POLICY IF EXISTS "Admins have full access to participants" ON tournament_participants;

CREATE POLICY "Public can view own payments" ON payments FOR SELECT USING (true);
CREATE POLICY "Admins have full access to payments" ON payments FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Public can view participants" ON tournament_participants FOR SELECT USING (true);
CREATE POLICY "Admins have full access to participants" ON tournament_participants FOR ALL USING (true) WITH CHECK (true);
