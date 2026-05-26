-- Migration: Create TMS Core Database Schema
-- Date: 2026-05-26

-- 1. Create Tournament Divisions Table
CREATE TABLE IF NOT EXISTS tournament_divisions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    event_id BIGINT REFERENCES calendar(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL, -- e.g. "Cat 1 Men's Open"
    max_seeding_points INT DEFAULT 999999,
    max_teams INT DEFAULT 16,
    match_format TEXT DEFAULT 'best_of_3_with_match_tiebreak', -- 'best_of_3_full', 'best_of_3_with_match_tiebreak', 'two_sets_super_tiebreak', 'single_set', 'pro_set'
    scoring_format TEXT DEFAULT 'standard', -- 'standard', 'no_ad' (golden point)
    draw_type TEXT DEFAULT 'single_elimination', -- 'single_elimination', 'group_stage'
    has_plate BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create Tournament Draws Table
CREATE TABLE IF NOT EXISTS tournament_draws (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    division_id UUID REFERENCES tournament_divisions(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL, -- e.g., "Main Draw", "Plate Draw", "Group A"
    type TEXT DEFAULT 'bracket', -- 'bracket', 'group'
    metadata JSONB DEFAULT '{}'::jsonb, -- holds seeds and placements
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Create Tournament Matches Table
CREATE TABLE IF NOT EXISTS tournament_matches (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    division_id UUID REFERENCES tournament_divisions(id) ON DELETE CASCADE NOT NULL,
    draw_id UUID REFERENCES tournament_draws(id) ON DELETE CASCADE,
    round_name TEXT NOT NULL, -- e.g. 'R16', 'QF', 'SF', 'Final', 'Group Match 1'
    match_index INT NOT NULL, -- visually determines placement inside the bracket structure
    team_1_reg_id UUID REFERENCES event_registrations(id) ON DELETE SET NULL,
    team_2_reg_id UUID REFERENCES event_registrations(id) ON DELETE SET NULL,
    score TEXT, -- e.g., '6-4, 3-6, 10-8'
    winner_reg_id UUID REFERENCES event_registrations(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'completed', 'walkover', 'retired')),
    scheduled_time TIMESTAMP WITH TIME ZONE,
    court_name TEXT,
    duration_minutes INT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Create Ranking Points Config Table
CREATE TABLE IF NOT EXISTS ranking_points_config (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    tier TEXT NOT NULL CHECK (tier IN ('Bronze', 'Silver', 'Gold', 'Super Gold', 'Major')),
    category TEXT NOT NULL CHECK (category IN ('CAT 1', 'CAT 2', 'CAT 3', 'CAT 4')),
    points_winner INT DEFAULT 0,
    points_finalist INT DEFAULT 0,
    points_semis INT DEFAULT 0,
    points_qf INT DEFAULT 0,
    points_r16_9th INT DEFAULT 0,
    points_r16_10th INT DEFAULT 0,
    points_r16_11_12 INT DEFAULT 0,
    points_r16_13_16 INT DEFAULT 0,
    points_r32_17th_plus INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(tier, category)
);

-- 5. Create Ranking History Table (Audited points ledger)
CREATE TABLE IF NOT EXISTS ranking_history (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    player_id BIGINT REFERENCES players(id) ON DELETE CASCADE NOT NULL,
    event_id BIGINT REFERENCES calendar(id) ON DELETE SET NULL,
    division_id UUID REFERENCES tournament_divisions(id) ON DELETE SET NULL,
    points_earned INT NOT NULL,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==========================================
-- ROW LEVEL SECURITY (RLS) & POLICIES
-- ==========================================

-- Enable RLS
ALTER TABLE tournament_divisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_draws ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE ranking_points_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE ranking_history ENABLE ROW LEVEL SECURITY;

-- Select Policies (Public read access)
CREATE POLICY "Public read tournament_divisions" ON tournament_divisions FOR SELECT USING (true);
CREATE POLICY "Public read tournament_draws" ON tournament_draws FOR SELECT USING (true);
CREATE POLICY "Public read tournament_matches" ON tournament_matches FOR SELECT USING (true);
CREATE POLICY "Public read ranking_points_config" ON ranking_points_config FOR SELECT USING (true);
CREATE POLICY "Public read ranking_history" ON ranking_history FOR SELECT USING (true);

-- Insert/Update/Delete Policies (Admins and Organisers)
CREATE POLICY "Admin write tournament_divisions" ON tournament_divisions FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Admin write tournament_draws" ON tournament_draws FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Admin write tournament_matches" ON tournament_matches FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Admin write ranking_points_config" ON ranking_points_config FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Admin write ranking_history" ON ranking_history FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ==========================================
-- INDEXES FOR HIGH PERFORMANCE
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_divisions_event ON tournament_divisions(event_id);
CREATE INDEX IF NOT EXISTS idx_draws_division ON tournament_draws(division_id);
CREATE INDEX IF NOT EXISTS idx_matches_division ON tournament_matches(division_id);
CREATE INDEX IF NOT EXISTS idx_matches_draw ON tournament_matches(draw_id);
CREATE INDEX IF NOT EXISTS idx_matches_winner ON tournament_matches(winner_reg_id);
CREATE INDEX IF NOT EXISTS idx_ranking_player ON ranking_history(player_id);
CREATE INDEX IF NOT EXISTS idx_ranking_event ON ranking_history(event_id);

-- ==========================================
-- SEED DEFAULT RANKING POINTS CONFIGURATIONS
-- ==========================================
INSERT INTO ranking_points_config 
(tier, category, points_winner, points_finalist, points_semis, points_qf, points_r16_9th, points_r16_10th, points_r16_11_12, points_r16_13_16, points_r32_17th_plus)
VALUES
-- Major Tiers
('Major', 'CAT 1', 2600, 1560, 936, 468, 410, 351, 293, 234, 211),
('Major', 'CAT 2', 780, 468, 234, 117, 103, 88, 74, 59, 53),
('Major', 'CAT 3', 312, 188, 94, 47, 41, 36, 30, 24, 22),
('Major', 'CAT 4', 125, 113, 47, 24, 21, 18, 15, 12, 11),

-- Super Gold Tiers
('Super Gold', 'CAT 1', 1500, 900, 540, 270, 237, 203, 169, 135, 122),
('Super Gold', 'CAT 2', 450, 270, 162, 98, 88, 78, 69, 59, 54),
('Super Gold', 'CAT 3', 180, 108, 65, 39, 35, 32, 28, 24, 22),
('Super Gold', 'CAT 4', 72, 44, 26, 16, 14, 13, 11, 10, 9),

-- Gold Tiers
('Gold', 'CAT 1', 1000, 600, 360, 180, 158, 135, 113, 90, 81),
('Gold', 'CAT 2', 300, 180, 108, 54, 48, 41, 34, 27, 25),
('Gold', 'CAT 3', 120, 72, 44, 22, 19, 17, 14, 11, 10),
('Gold', 'CAT 4', 48, 29, 18, 9, 8, 7, 6, 5, 4),

-- Silver Tiers
('Silver', 'CAT 1', 600, 360, 180, 90, 79, 68, 57, 45, 41),
('Silver', 'CAT 2', 180, 108, 65, 33, 29, 25, 21, 17, 15),
('Silver', 'CAT 3', 72, 44, 26, 13, 12, 10, 9, 7, 6),
('Silver', 'CAT 4', 29, 18, 11, 6, 5, 4, 4, 3, 3),

-- Bronze Tiers
('Bronze', 'CAT 1', 300, 180, 90, 45, 40, 35, 30, 25, 23),
('Bronze', 'CAT 2', 120, 72, 44, 22, 19, 17, 14, 11, 10),
('Bronze', 'CAT 3', 48, 29, 18, 9, 8, 7, 6, 5, 4),
('Bronze', 'CAT 4', 20, 12, 7, 4, 4, 3, 3, 2, 2)

ON CONFLICT (tier, category) 
DO UPDATE SET
    points_winner = EXCLUDED.points_winner,
    points_finalist = EXCLUDED.points_finalist,
    points_semis = EXCLUDED.points_semis,
    points_qf = EXCLUDED.points_qf,
    points_r16_9th = EXCLUDED.points_r16_9th,
    points_r16_10th = EXCLUDED.points_r16_10th,
    points_r16_11_12 = EXCLUDED.points_r16_11_12,
    points_r16_13_16 = EXCLUDED.points_r16_13_16,
    points_r32_17th_plus = EXCLUDED.points_r32_17th_plus;

