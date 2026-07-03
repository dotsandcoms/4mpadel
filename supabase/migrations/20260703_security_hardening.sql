-- ============================================================
-- Migration 4 — Security hardening
-- Closes pre-existing holes that matter now that outside
-- organisers hold accounts. Idempotent — safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. CALENDAR: previously ANY authenticated user could insert /
--    update / delete ANY event ("FOR ALL TO authenticated USING true").
--    Replace with 4M-admins-only; org admins keep their scoped
--    insert/update policies from migrations 1 & 3.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage calendar" ON public.calendar;
DROP POLICY IF EXISTS "Anon can manage calendar" ON public.calendar;

CREATE POLICY "4M admins manage calendar"
ON public.calendar FOR ALL
TO authenticated
USING ( is_4m_admin() )
WITH CHECK ( is_4m_admin() );

-- ------------------------------------------------------------
-- 2. TOURNAMENT DIVISIONS: was "FOR ALL USING (true)" — any
--    authenticated user could rewrite divisions. Public read stays;
--    writes restricted to 4M admins + org admins on their own
--    UNSANCTIONED events (approved-event division changes only land
--    via the admin-applied amendment flow).
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Admins have full access to divisions" ON public.tournament_divisions;

CREATE POLICY "4M admins manage divisions"
ON public.tournament_divisions FOR ALL
TO authenticated
USING ( is_4m_admin() )
WITH CHECK ( is_4m_admin() );

DROP POLICY IF EXISTS "Org admins manage own pending event divisions" ON public.tournament_divisions;
CREATE POLICY "Org admins manage own pending event divisions"
ON public.tournament_divisions FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.calendar c
        WHERE c.id = tournament_divisions.event_id
          AND c.organization_id IS NOT NULL
          AND is_org_admin(c.organization_id)
          AND c.sanction_status IN ('pending', 'rejected')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.calendar c
        WHERE c.id = tournament_divisions.event_id
          AND c.organization_id IS NOT NULL
          AND is_org_admin(c.organization_id)
          AND c.sanction_status IN ('pending', 'rejected')
    )
);

-- ------------------------------------------------------------
-- 3. EMAIL QUEUE: any authenticated user could UPDATE any queue row
--    (subject/body tampering). The send-email edge function runs as
--    service role, which bypasses RLS — client update access is not
--    needed.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can update own email_queue status" ON public.email_queue;

-- ------------------------------------------------------------
-- 4. ORGANIZATIONS: throttle applications — one PENDING application
--    per creator at a time (blocks spam-flooding the approval queue).
-- ------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pending_org_per_creator
ON public.organizations (created_by)
WHERE status = 'pending';
