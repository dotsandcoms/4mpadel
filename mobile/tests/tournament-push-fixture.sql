-- Extend the minimal push fixture in an isolated test database only.
ALTER TABLE calendar ADD COLUMN is_visible boolean DEFAULT true,ADD COLUMN sanction_status text,ADD COLUMN registration_opens_at timestamptz,ADD COLUMN registration_closes_at timestamptz,ADD COLUMN early_bird_ends_at timestamptz,ADD COLUMN early_bird_fee numeric,ADD COLUMN start_date date,ADD COLUMN end_date date,ADD COLUMN venue text,ADD COLUMN draw_released timestamptz;
ALTER TABLE tournament_divisions ADD COLUMN entries_close_at timestamptz;
ALTER TABLE draws ADD COLUMN scoring_rules jsonb DEFAULT '{}';
CREATE TABLE draw_entries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),draw_id uuid,player_one_id bigint,player_two_id bigint,team_name text,status text DEFAULT 'active',snapshot jsonb DEFAULT '{}');
CREATE TABLE draw_matches(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),draw_id uuid,status text DEFAULT 'pending',entry_one_id uuid,entry_two_id uuid,winner_entry_id uuid,round_label text DEFAULT 'Quarter-final',round_number integer DEFAULT 1,scheduled_start timestamptz,americano_fixture_key text);
CREATE TABLE draw_match_sets(match_id uuid,set_number integer,entry_one_games integer,entry_two_games integer);
CREATE TABLE tournament_schedules(event_id bigint PRIMARY KEY,published_assignments jsonb DEFAULT '{}');
CREATE TABLE tournament_finalisations(division_id uuid PRIMARY KEY,event_id bigint,fingerprint text);
CREATE TABLE player_ranking_points(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),player_id bigint,event_id bigint,division_id uuid,points integer,round_code text,reversal_of uuid);

ALTER TABLE players ADD COLUMN rankings jsonb DEFAULT '[]';
