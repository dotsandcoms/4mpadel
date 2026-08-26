-- Multiple public notices for native tournament draws. Announcements can be
-- shown to the whole event, one division, or one specific draw/plate.

CREATE TABLE IF NOT EXISTS public.native_draw_announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id BIGINT NOT NULL REFERENCES public.calendar(id) ON DELETE CASCADE,
    division_id UUID REFERENCES public.tournament_divisions(id) ON DELETE CASCADE,
    draw_id UUID REFERENCES public.draws(id) ON DELETE CASCADE,
    title TEXT,
    message TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 500),
    is_pinned BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT native_draw_announcements_scope_check CHECK (
        draw_id IS NULL OR division_id IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS idx_native_draw_announcements_public
    ON public.native_draw_announcements(event_id, is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_native_draw_announcements_scope
    ON public.native_draw_announcements(division_id, draw_id, is_active);

ALTER TABLE public.native_draw_announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read native draw announcements" ON public.native_draw_announcements;
CREATE POLICY "Public read native draw announcements"
    ON public.native_draw_announcements FOR SELECT
    USING (
        is_active
        AND EXISTS (
            SELECT 1 FROM public.draws d
            WHERE d.event_id = native_draw_announcements.event_id
              AND d.status IN ('published', 'in_progress', 'completed')
        )
    );

DROP POLICY IF EXISTS "Managers manage native draw announcements" ON public.native_draw_announcements;
CREATE POLICY "Managers manage native draw announcements"
    ON public.native_draw_announcements FOR ALL
    USING (public.can_manage_native_draw(event_id))
    WITH CHECK (public.can_manage_native_draw(event_id));
