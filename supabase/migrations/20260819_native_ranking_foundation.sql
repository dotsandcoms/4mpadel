-- Phase 1: native ranking/points foundation for manual draws.
-- Additive only; no existing RankedIn data or legacy points text is changed.

CREATE TABLE IF NOT EXISTS public.ranking_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE CHECK (code IN ('major', 'super_gold', 'gold', 'silver', 'bronze')),
    name TEXT NOT NULL,
    max_points INTEGER NOT NULL CHECK (max_points >= 0),
    display_order SMALLINT NOT NULL UNIQUE CHECK (display_order > 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

INSERT INTO public.ranking_tiers (code, name, max_points, display_order)
VALUES
    ('major', 'Major', 2600, 1),
    ('super_gold', 'Super Gold', 1500, 2),
    ('gold', 'Gold', 1000, 3),
    ('silver', 'Silver', 500, 4),
    ('bronze', 'Bronze', 300, 5)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    max_points = EXCLUDED.max_points,
    display_order = EXCLUDED.display_order;

CREATE TABLE IF NOT EXISTS public.ranking_points_table (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tier_id UUID NOT NULL REFERENCES public.ranking_tiers(id) ON DELETE CASCADE,
    category SMALLINT NOT NULL CHECK (category BETWEEN 1 AND 4),
    round_code TEXT NOT NULL,
    round_label TEXT NOT NULL,
    points INTEGER NOT NULL CHECK (points >= 0),
    display_order SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    UNIQUE (tier_id, category, round_code)
);

-- Official SAPA 2026 points grids supplied on 19 August 2026.  The Major
-- table distinguishes placement playoffs, so those outcomes remain explicit
-- machine codes for the native draw engine rather than being collapsed to R16.
WITH points_seed(tier_code, category, round_code, round_label, points, display_order) AS (
    VALUES
        ('major',1,'winner','Winner (1st)',2600,1),('major',1,'finalist','Finalist (2nd)',1560,2),('major',1,'semifinal','Semi-final (3rd–4th)',936,3),('major',1,'quarterfinal_5_8','Quarter-final (5th–8th)',468,4),('major',1,'r16_9','R16 playoff (9th place)',410,5),('major',1,'r16_10','R16 playoff (10th place)',351,6),('major',1,'r16_11_12','R16 playoff (11th/12th)',293,7),('major',1,'r16_13_16','R16 playoff (13th–16th)',234,8),('major',1,'r32_17','R32 playoff (17th+)',211,9),
        ('major',2,'winner','Winner (1st)',780,1),('major',2,'finalist','Finalist (2nd)',468,2),('major',2,'semifinal','Semi-final (3rd–4th)',234,3),('major',2,'quarterfinal_5_8','Quarter-final (5th–8th)',117,4),('major',2,'r16_9','R16 playoff (9th place)',103,5),('major',2,'r16_10','R16 playoff (10th place)',88,6),('major',2,'r16_11_12','R16 playoff (11th/12th)',74,7),('major',2,'r16_13_16','R16 playoff (13th–16th)',59,8),('major',2,'r32_17','R32 playoff (17th+)',53,9),
        ('major',3,'winner','Winner (1st)',312,1),('major',3,'finalist','Finalist (2nd)',188,2),('major',3,'semifinal','Semi-final (3rd–4th)',94,3),('major',3,'quarterfinal_5_8','Quarter-final (5th–8th)',47,4),('major',3,'r16_9','R16 playoff (9th place)',41,5),('major',3,'r16_10','R16 playoff (10th place)',36,6),('major',3,'r16_11_12','R16 playoff (11th/12th)',30,7),('major',3,'r16_13_16','R16 playoff (13th–16th)',24,8),('major',3,'r32_17','R32 playoff (17th+)',22,9),
        ('major',4,'winner','Winner (1st)',125,1),('major',4,'finalist','Finalist (2nd)',113,2),('major',4,'semifinal','Semi-final (3rd–4th)',47,3),('major',4,'quarterfinal_5_8','Quarter-final (5th–8th)',24,4),('major',4,'r16_9','R16 playoff (9th place)',21,5),('major',4,'r16_10','R16 playoff (10th place)',18,6),('major',4,'r16_11_12','R16 playoff (11th/12th)',15,7),('major',4,'r16_13_16','R16 playoff (13th–16th)',12,8),('major',4,'r32_17','R32 playoff (17th+)',11,9),
        ('super_gold',1,'winner','Winner',1500,1),('super_gold',1,'finalist','Finals',900,2),('super_gold',1,'semifinal','Semis',540,3),('super_gold',1,'quarterfinal','Quarters',270,4),('super_gold',1,'r16','R16',135,5),('super_gold',1,'r32','R32',68,6),
        ('super_gold',2,'winner','Winner',450,1),('super_gold',2,'finalist','Finals',270,2),('super_gold',2,'semifinal','Semis',162,3),('super_gold',2,'quarterfinal','Quarters',97,4),('super_gold',2,'r16','R16',58,5),('super_gold',2,'r32','R32',35,6),
        ('super_gold',3,'winner','Winner',180,1),('super_gold',3,'finalist','Finals',108,2),('super_gold',3,'semifinal','Semis',65,3),('super_gold',3,'quarterfinal','Quarters',39,4),('super_gold',3,'r16','R16',23,5),('super_gold',3,'r32','R32',14,6),
        ('super_gold',4,'winner','Winner',72,1),('super_gold',4,'finalist','Finals',43,2),('super_gold',4,'semifinal','Semis',26,3),('super_gold',4,'quarterfinal','Quarters',16,4),('super_gold',4,'r16','R16',9,5),('super_gold',4,'r32','R32',6,6),
        ('gold',1,'winner','Winner',1000,1),('gold',1,'finalist','Finals',600,2),('gold',1,'semifinal','Semis',360,3),('gold',1,'quarterfinal','Quarters',180,4),('gold',1,'r16','R16',90,5),('gold',1,'r32','R32',45,6),
        ('gold',2,'winner','Winner',300,1),('gold',2,'finalist','Finals',180,2),('gold',2,'semifinal','Semis',108,3),('gold',2,'quarterfinal','Quarters',54,4),('gold',2,'r16','R16',27,5),('gold',2,'r32','R32',14,6),
        ('gold',3,'winner','Winner',120,1),('gold',3,'finalist','Finals',72,2),('gold',3,'semifinal','Semis',43,3),('gold',3,'quarterfinal','Quarters',22,4),('gold',3,'r16','R16',11,5),('gold',3,'r32','R32',5,6),
        ('gold',4,'winner','Winner',48,1),('gold',4,'finalist','Finals',29,2),('gold',4,'semifinal','Semis',17,3),('gold',4,'quarterfinal','Quarters',9,4),('gold',4,'r16','R16',4,5),('gold',4,'r32','R32',2,6),
        ('silver',1,'winner','Winner',500,1),('silver',1,'finalist','Finals',300,2),('silver',1,'semifinal','Semis',180,3),('silver',1,'quarterfinal','Quarters',90,4),('silver',1,'r16','R16',45,5),('silver',1,'r32','R32',22,6),
        ('silver',2,'winner','Winner',180,1),('silver',2,'finalist','Finals',108,2),('silver',2,'semifinal','Semis',65,3),('silver',2,'quarterfinal','Quarters',32,4),('silver',2,'r16','R16',16,5),('silver',2,'r32','R32',8,6),
        ('silver',3,'winner','Winner',72,1),('silver',3,'finalist','Finals',43,2),('silver',3,'semifinal','Semis',26,3),('silver',3,'quarterfinal','Quarters',13,4),('silver',3,'r16','R16',6,5),('silver',3,'r32','R32',3,6),
        ('silver',4,'winner','Winner',29,1),('silver',4,'finalist','Finals',17,2),('silver',4,'semifinal','Semis',10,3),('silver',4,'quarterfinal','Quarters',5,4),('silver',4,'r16','R16',3,5),('silver',4,'r32','R32',1,6),
        ('bronze',1,'winner','Winner',300,1),('bronze',1,'finalist','Finals',180,2),('bronze',1,'semifinal','Semis',90,3),('bronze',1,'quarterfinal','Quarters',45,4),('bronze',1,'r16','R16',25,5),('bronze',1,'r32','R32',14,6),
        ('bronze',2,'winner','Winner',120,1),('bronze',2,'finalist','Finals',72,2),('bronze',2,'semifinal','Semis',43,3),('bronze',2,'quarterfinal','Quarters',22,4),('bronze',2,'r16','R16',11,5),('bronze',2,'r32','R32',5,6),
        ('bronze',3,'winner','Winner',48,1),('bronze',3,'finalist','Finals',29,2),('bronze',3,'semifinal','Semis',17,3),('bronze',3,'quarterfinal','Quarters',9,4),('bronze',3,'r16','R16',4,5),('bronze',3,'r32','R32',2,6)
)
INSERT INTO public.ranking_points_table (tier_id, category, round_code, round_label, points, display_order)
SELECT tier.id, seed.category, seed.round_code, seed.round_label, seed.points, seed.display_order
FROM points_seed seed
JOIN public.ranking_tiers tier ON tier.code = seed.tier_code
ON CONFLICT (tier_id, category, round_code) DO UPDATE SET
    round_label = EXCLUDED.round_label,
    points = EXCLUDED.points,
    display_order = EXCLUDED.display_order;

ALTER TABLE public.tournament_divisions
    ADD COLUMN IF NOT EXISTS ranking_tier_id UUID REFERENCES public.ranking_tiers(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS ranking_category SMALLINT CHECK (ranking_category BETWEEN 1 AND 4);
CREATE INDEX IF NOT EXISTS idx_tournament_divisions_ranking_tier ON public.tournament_divisions(ranking_tier_id);

CREATE TABLE IF NOT EXISTS public.player_ranking_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id BIGINT NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
    event_id BIGINT NOT NULL REFERENCES public.calendar(id) ON DELETE CASCADE,
    division_id UUID NOT NULL REFERENCES public.tournament_divisions(id) ON DELETE CASCADE,
    points_table_id UUID REFERENCES public.ranking_points_table(id) ON DELETE SET NULL,
    round_code TEXT NOT NULL,
    points INTEGER NOT NULL CHECK (points >= 0),
    event_date DATE,
    date_awarded DATE NOT NULL DEFAULT CURRENT_DATE,
    config_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    reversal_of UUID REFERENCES public.player_ranking_points(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    UNIQUE (event_id, division_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_player_ranking_points_player_date ON public.player_ranking_points(player_id, event_date DESC);

ALTER TABLE public.ranking_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ranking_points_table ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_ranking_points ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active ranking tiers" ON public.ranking_tiers;
DROP POLICY IF EXISTS "Public read ranking points table" ON public.ranking_points_table;
DROP POLICY IF EXISTS "Super admins manage ranking tiers" ON public.ranking_tiers;
DROP POLICY IF EXISTS "Super admins manage ranking points table" ON public.ranking_points_table;
DROP POLICY IF EXISTS "Players read own ranking awards" ON public.player_ranking_points;
DROP POLICY IF EXISTS "Super admins manage ranking awards" ON public.player_ranking_points;

CREATE POLICY "Public read active ranking tiers" ON public.ranking_tiers FOR SELECT USING (is_active OR public.is_super_admin());
CREATE POLICY "Public read ranking points table" ON public.ranking_points_table FOR SELECT USING (true);
CREATE POLICY "Super admins manage ranking tiers" ON public.ranking_tiers FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "Super admins manage ranking points table" ON public.ranking_points_table FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "Players read own ranking awards" ON public.player_ranking_points FOR SELECT USING (
    public.is_super_admin() OR player_id IN (SELECT id FROM public.players WHERE email ILIKE (auth.jwt() ->> 'email'))
);
CREATE POLICY "Super admins manage ranking awards" ON public.player_ranking_points FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- Tier/category tags drive official points awards, so only platform super admins
-- may set or alter them. Existing division updates remain unaffected otherwise.
CREATE OR REPLACE FUNCTION public.protect_division_ranking_tags()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT public.is_super_admin() AND (
        (TG_OP = 'INSERT' AND (NEW.ranking_tier_id IS NOT NULL OR NEW.ranking_category IS NOT NULL))
        OR (TG_OP = 'UPDATE' AND (
            NEW.ranking_tier_id IS DISTINCT FROM OLD.ranking_tier_id
            OR NEW.ranking_category IS DISTINCT FROM OLD.ranking_category
        ))
    ) THEN
        RAISE EXCEPTION 'Only super admins can change division ranking tags';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_protect_division_ranking_tags ON public.tournament_divisions;
CREATE TRIGGER trg_protect_division_ranking_tags
BEFORE INSERT OR UPDATE ON public.tournament_divisions
FOR EACH ROW EXECUTE FUNCTION public.protect_division_ranking_tags();
