-- Migration to add player profile enhancement columns
ALTER TABLE players ADD COLUMN IF NOT EXISTS skill_rating numeric;
ALTER TABLE players ADD COLUMN IF NOT EXISTS age integer;
ALTER TABLE players ADD COLUMN IF NOT EXISTS match_form text; -- Format: "L W W W W"
ALTER TABLE players ADD COLUMN IF NOT EXISTS rankings jsonb DEFAULT '[]';
ALTER TABLE players ADD COLUMN IF NOT EXISTS rankedin_profile_url text;
