-- Phase 2A: native draw data model.
-- Additive only. Existing RankedIn caches, registrations, and player points are
-- neither read nor altered by this migration.

CREATE TABLE IF NOT EXISTS public.draws (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id BIGINT NOT NULL REFERENCES public.calendar(id) ON DELETE CASCADE,
    division_id UUID NOT NULL REFERENCES public.tournament_divisions(id) ON DELETE CASCADE,
    draw_kind TEXT NOT NULL DEFAULT 'main' CHECK (draw_kind IN ('main', 'silver', 'bronze')),
    format TEXT NOT NULL CHECK (format IN ('knockout', 'group_knockout', 'group_only')),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'in_progress', 'completed', 'archived')),
    scoring_rules JSONB NOT NULL DEFAULT '{"sets_to_win":2,"golden_point":true,"match_tiebreak":false}'::jsonb,
    seeding_method TEXT NOT NULL DEFAULT 'manual' CHECK (seeding_method IN ('native_ranking', 'manual', 'random')),
    group_count SMALLINT CHECK (group_count IS NULL OR group_count > 0),
    advancers_per_group SMALLINT CHECK (advancers_per_group IS NULL OR advancers_per_group > 0),
    generated_at TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    UNIQUE (division_id, draw_kind)
);
CREATE INDEX IF NOT EXISTS idx_draws_event ON public.draws(event_id);
CREATE INDEX IF NOT EXISTS idx_draws_division_status ON public.draws(division_id, status);

-- A draw entry is a frozen team snapshot. It is deliberately independent from
-- the registration record after generation so late changes cannot rewrite a
-- published bracket's history.
CREATE TABLE IF NOT EXISTS public.draw_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draw_id UUID NOT NULL REFERENCES public.draws(id) ON DELETE CASCADE,
    source_registration_id UUID REFERENCES public.event_registrations(id) ON DELETE SET NULL,
    player_one_id BIGINT REFERENCES public.players(id) ON DELETE SET NULL,
    player_two_id BIGINT REFERENCES public.players(id) ON DELETE SET NULL,
    team_name TEXT NOT NULL,
    player_one_name TEXT NOT NULL,
    player_two_name TEXT,
    seed_number SMALLINT CHECK (seed_number IS NULL OR seed_number > 0),
    seeding_value NUMERIC(12,2),
    group_id UUID,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'withdrawn', 'disqualified', 'replaced')),
    snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    UNIQUE (draw_id, source_registration_id)
);
CREATE INDEX IF NOT EXISTS idx_draw_entries_draw_seed ON public.draw_entries(draw_id, seed_number);

CREATE TABLE IF NOT EXISTS public.draw_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draw_id UUID NOT NULL REFERENCES public.draws(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    display_order SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    UNIQUE (draw_id, name),
    UNIQUE (draw_id, display_order)
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'draw_entries_group_id_fkey'
    ) THEN
        ALTER TABLE public.draw_entries
            ADD CONSTRAINT draw_entries_group_id_fkey
            FOREIGN KEY (group_id) REFERENCES public.draw_groups(id) ON DELETE SET NULL;
    END IF;
END;
$$;
CREATE INDEX IF NOT EXISTS idx_draw_entries_group ON public.draw_entries(group_id);

CREATE TABLE IF NOT EXISTS public.draw_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draw_id UUID NOT NULL REFERENCES public.draws(id) ON DELETE CASCADE,
    group_id UUID REFERENCES public.draw_groups(id) ON DELETE SET NULL,
    stage TEXT NOT NULL CHECK (stage IN ('group', 'knockout', 'placement', 'consolation')),
    round_code TEXT NOT NULL,
    round_label TEXT NOT NULL,
    round_number SMALLINT NOT NULL DEFAULT 0,
    bracket_position SMALLINT,
    entry_one_id UUID REFERENCES public.draw_entries(id) ON DELETE SET NULL,
    entry_two_id UUID REFERENCES public.draw_entries(id) ON DELETE SET NULL,
    winner_entry_id UUID REFERENCES public.draw_entries(id) ON DELETE SET NULL,
    loser_entry_id UUID REFERENCES public.draw_entries(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'in_progress', 'completed', 'walkover', 'retired', 'cancelled')),
    result_type TEXT CHECK (result_type IS NULL OR result_type IN ('played', 'walkover', 'retirement', 'withdrawal', 'cancelled')),
    scheduled_start TIMESTAMPTZ,
    scheduled_end TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CHECK (entry_one_id IS NULL OR entry_two_id IS NULL OR entry_one_id <> entry_two_id),
    CHECK (winner_entry_id IS NULL OR winner_entry_id = entry_one_id OR winner_entry_id = entry_two_id)
);
CREATE INDEX IF NOT EXISTS idx_draw_matches_draw_stage_round ON public.draw_matches(draw_id, stage, round_number, bracket_position);
CREATE INDEX IF NOT EXISTS idx_draw_matches_group ON public.draw_matches(group_id);

-- These links make winner/loser advancement explicit, including future Silver
-- and Bronze plate draws, without parsing a display bracket in the client.
ALTER TABLE public.draw_matches
    ADD COLUMN IF NOT EXISTS winner_to_match_id UUID REFERENCES public.draw_matches(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS winner_to_slot SMALLINT CHECK (winner_to_slot IN (1, 2)),
    ADD COLUMN IF NOT EXISTS loser_to_match_id UUID REFERENCES public.draw_matches(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS loser_to_slot SMALLINT CHECK (loser_to_slot IN (1, 2));

CREATE TABLE IF NOT EXISTS public.draw_match_sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL REFERENCES public.draw_matches(id) ON DELETE CASCADE,
    set_number SMALLINT NOT NULL CHECK (set_number > 0),
    entry_one_games SMALLINT NOT NULL CHECK (entry_one_games >= 0),
    entry_two_games SMALLINT NOT NULL CHECK (entry_two_games >= 0),
    is_match_tiebreak BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    UNIQUE (match_id, set_number)
);

CREATE TABLE IF NOT EXISTS public.draw_match_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL REFERENCES public.draw_matches(id) ON DELETE CASCADE,
    action TEXT NOT NULL CHECK (action IN ('created', 'score_recorded', 'score_corrected', 'status_changed', 'entry_replaced', 'advanced')),
    before_state JSONB,
    after_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    actor_email TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_draw_match_audit_match ON public.draw_match_audit(match_id, created_at DESC);

-- Group standings are materialised so published draw pages have a simple,
-- stable read model. A later score-entry RPC will recalculate it atomically.
CREATE TABLE IF NOT EXISTS public.draw_standings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draw_id UUID NOT NULL REFERENCES public.draws(id) ON DELETE CASCADE,
    group_id UUID NOT NULL REFERENCES public.draw_groups(id) ON DELETE CASCADE,
    entry_id UUID NOT NULL REFERENCES public.draw_entries(id) ON DELETE CASCADE,
    played SMALLINT NOT NULL DEFAULT 0 CHECK (played >= 0),
    won SMALLINT NOT NULL DEFAULT 0 CHECK (won >= 0),
    lost SMALLINT NOT NULL DEFAULT 0 CHECK (lost >= 0),
    sets_for SMALLINT NOT NULL DEFAULT 0 CHECK (sets_for >= 0),
    sets_against SMALLINT NOT NULL DEFAULT 0 CHECK (sets_against >= 0),
    games_for SMALLINT NOT NULL DEFAULT 0 CHECK (games_for >= 0),
    games_against SMALLINT NOT NULL DEFAULT 0 CHECK (games_against >= 0),
    standings_points SMALLINT NOT NULL DEFAULT 0,
    position SMALLINT,
    requires_manual_resolution BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    UNIQUE (group_id, entry_id)
);
CREATE INDEX IF NOT EXISTS idx_draw_standings_group_position ON public.draw_standings(group_id, position);

-- Event organisers can operate draws for their own events; 4M admins retain
-- platform-wide control. This is used only by the native draw tables below.
CREATE OR REPLACE FUNCTION public.can_manage_native_draw(p_event_id BIGINT)
RETURNS BOOLEAN AS $$
    SELECT public.is_4m_admin() OR EXISTS (
        SELECT 1
        FROM public.calendar c
        WHERE c.id = p_event_id
          AND c.organization_id IS NOT NULL
          AND public.is_org_admin(c.organization_id)
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

ALTER TABLE public.draws ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draw_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draw_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draw_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draw_match_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draw_match_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draw_standings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read published native draws" ON public.draws;
DROP POLICY IF EXISTS "Managers manage native draws" ON public.draws;
CREATE POLICY "Public read published native draws" ON public.draws FOR SELECT USING (status IN ('published', 'in_progress', 'completed'));
CREATE POLICY "Managers manage native draws" ON public.draws FOR ALL USING (public.can_manage_native_draw(event_id)) WITH CHECK (public.can_manage_native_draw(event_id));

-- Child rows inherit public visibility from their published parent draw.
DROP POLICY IF EXISTS "Public read published native draw entries" ON public.draw_entries;
DROP POLICY IF EXISTS "Managers manage native draw entries" ON public.draw_entries;
CREATE POLICY "Public read published native draw entries" ON public.draw_entries FOR SELECT USING (EXISTS (SELECT 1 FROM public.draws d WHERE d.id = draw_id AND d.status IN ('published', 'in_progress', 'completed')));
CREATE POLICY "Managers manage native draw entries" ON public.draw_entries FOR ALL USING (EXISTS (SELECT 1 FROM public.draws d WHERE d.id = draw_id AND public.can_manage_native_draw(d.event_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.draws d WHERE d.id = draw_id AND public.can_manage_native_draw(d.event_id)));

DROP POLICY IF EXISTS "Public read published native draw groups" ON public.draw_groups;
DROP POLICY IF EXISTS "Managers manage native draw groups" ON public.draw_groups;
CREATE POLICY "Public read published native draw groups" ON public.draw_groups FOR SELECT USING (EXISTS (SELECT 1 FROM public.draws d WHERE d.id = draw_id AND d.status IN ('published', 'in_progress', 'completed')));
CREATE POLICY "Managers manage native draw groups" ON public.draw_groups FOR ALL USING (EXISTS (SELECT 1 FROM public.draws d WHERE d.id = draw_id AND public.can_manage_native_draw(d.event_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.draws d WHERE d.id = draw_id AND public.can_manage_native_draw(d.event_id)));

DROP POLICY IF EXISTS "Public read published native draw matches" ON public.draw_matches;
DROP POLICY IF EXISTS "Managers manage native draw matches" ON public.draw_matches;
CREATE POLICY "Public read published native draw matches" ON public.draw_matches FOR SELECT USING (EXISTS (SELECT 1 FROM public.draws d WHERE d.id = draw_id AND d.status IN ('published', 'in_progress', 'completed')));
CREATE POLICY "Managers manage native draw matches" ON public.draw_matches FOR ALL USING (EXISTS (SELECT 1 FROM public.draws d WHERE d.id = draw_id AND public.can_manage_native_draw(d.event_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.draws d WHERE d.id = draw_id AND public.can_manage_native_draw(d.event_id)));

DROP POLICY IF EXISTS "Public read published native draw match sets" ON public.draw_match_sets;
DROP POLICY IF EXISTS "Managers manage native draw match sets" ON public.draw_match_sets;
CREATE POLICY "Public read published native draw match sets" ON public.draw_match_sets FOR SELECT USING (EXISTS (SELECT 1 FROM public.draw_matches m JOIN public.draws d ON d.id = m.draw_id WHERE m.id = match_id AND d.status IN ('published', 'in_progress', 'completed')));
CREATE POLICY "Managers manage native draw match sets" ON public.draw_match_sets FOR ALL USING (EXISTS (SELECT 1 FROM public.draw_matches m JOIN public.draws d ON d.id = m.draw_id WHERE m.id = match_id AND public.can_manage_native_draw(d.event_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.draw_matches m JOIN public.draws d ON d.id = m.draw_id WHERE m.id = match_id AND public.can_manage_native_draw(d.event_id)));

DROP POLICY IF EXISTS "Managers read native draw audit" ON public.draw_match_audit;
DROP POLICY IF EXISTS "Managers write native draw audit" ON public.draw_match_audit;
CREATE POLICY "Managers read native draw audit" ON public.draw_match_audit FOR SELECT USING (EXISTS (SELECT 1 FROM public.draw_matches m JOIN public.draws d ON d.id = m.draw_id WHERE m.id = match_id AND public.can_manage_native_draw(d.event_id)));
CREATE POLICY "Managers write native draw audit" ON public.draw_match_audit FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.draw_matches m JOIN public.draws d ON d.id = m.draw_id WHERE m.id = match_id AND public.can_manage_native_draw(d.event_id)));

DROP POLICY IF EXISTS "Public read published native draw standings" ON public.draw_standings;
DROP POLICY IF EXISTS "Managers manage native draw standings" ON public.draw_standings;
CREATE POLICY "Public read published native draw standings" ON public.draw_standings FOR SELECT USING (EXISTS (SELECT 1 FROM public.draws d WHERE d.id = draw_id AND d.status IN ('published', 'in_progress', 'completed')));
CREATE POLICY "Managers manage native draw standings" ON public.draw_standings FOR ALL USING (EXISTS (SELECT 1 FROM public.draws d WHERE d.id = draw_id AND public.can_manage_native_draw(d.event_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.draws d WHERE d.id = draw_id AND public.can_manage_native_draw(d.event_id)));
