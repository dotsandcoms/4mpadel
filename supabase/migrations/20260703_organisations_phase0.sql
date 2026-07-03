-- ============================================================
-- Organisations Phase 0 — foundation
-- Date: 2026-07-03  Branch: feature/organisations
-- Safe to run on live DB: the 20260528 migration WAS applied
-- (organizations, email_queue, calendar.organization_id /
-- sanction_status / rejection_notes all exist). Everything here
-- is additive or an explicit, intentional policy upgrade.
-- ============================================================

-- ------------------------------------------------------------
-- 1. HELPER FUNCTIONS (replace hardcoded-email checks)
-- ------------------------------------------------------------

-- True for service role (edge functions) and for super_admins
-- registered in admin_sidebar_permissions.
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
    SELECT
        COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role'
        OR EXISTS (
            SELECT 1 FROM public.admin_sidebar_permissions
            WHERE email ILIKE (auth.jwt() ->> 'email')
              AND role = 'super_admin'
        );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Any registered 4M admin (super_admin or custom role)
CREATE OR REPLACE FUNCTION public.is_4m_admin()
RETURNS BOOLEAN AS $$
    SELECT
        COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role'
        OR EXISTS (
            SELECT 1 FROM public.admin_sidebar_permissions
            WHERE email ILIKE (auth.jwt() ->> 'email')
        );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE organization_id = p_org_id
          AND user_email ILIKE (auth.jwt() ->> 'email')
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- owner/admin (staff excluded)
CREATE OR REPLACE FUNCTION public.is_org_admin(p_org_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE organization_id = p_org_id
          AND user_email ILIKE (auth.jwt() ->> 'email')
          AND role IN ('owner', 'admin')
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ------------------------------------------------------------
-- 2. ORGANIZATIONS — additive profile columns (PDF core-profile)
-- ------------------------------------------------------------
ALTER TABLE public.organizations
    ADD COLUMN IF NOT EXISTS cover_image_url  TEXT,
    ADD COLUMN IF NOT EXISTS about            TEXT,
    ADD COLUMN IF NOT EXISTS org_type         TEXT DEFAULT 'Tournament Organiser',
    ADD COLUMN IF NOT EXISTS coverage         TEXT,
    ADD COLUMN IF NOT EXISTS year_established INT,
    ADD COLUMN IF NOT EXISTS whatsapp_number  TEXT,
    ADD COLUMN IF NOT EXISTS socials          JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS contacts         JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS brand_color      TEXT,
    ADD COLUMN IF NOT EXISTS verified         BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS sapa_sanctioned  BOOLEAN DEFAULT false;

-- Extend status check to allow 'suspended'
ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_status_check;
ALTER TABLE public.organizations
    ADD CONSTRAINT organizations_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'suspended'));

-- ------------------------------------------------------------
-- 3. ORGANIZATION MEMBERS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_members (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    player_id       BIGINT REFERENCES public.players(id) ON DELETE SET NULL,
    user_email      TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('owner', 'admin', 'staff')),
    added_by        BIGINT REFERENCES public.players(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (organization_id, user_email)
);

CREATE INDEX IF NOT EXISTS idx_org_members_org   ON public.organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_email ON public.organization_members(user_email);

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read own org membership" ON public.organization_members;
CREATE POLICY "Members read own org membership"
ON public.organization_members FOR SELECT
USING ( is_org_member(organization_id) OR is_super_admin() );

-- Only 4M super admins assign/remove org admins (per requirement)
DROP POLICY IF EXISTS "Super admins manage members" ON public.organization_members;
CREATE POLICY "Super admins manage members"
ON public.organization_members FOR ALL
USING ( is_super_admin() )
WITH CHECK ( is_super_admin() );

-- ------------------------------------------------------------
-- 4. ORGANIZATIONS — policy upgrade (drop hardcoded emails)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Super admins read all organizations"   ON public.organizations;
DROP POLICY IF EXISTS "Super admins manage all organizations" ON public.organizations;
DROP POLICY IF EXISTS "Creator can update pending organization" ON public.organizations;
DROP POLICY IF EXISTS "Members read own organization" ON public.organizations;
DROP POLICY IF EXISTS "Org admins update own organization" ON public.organizations;

CREATE POLICY "Super admins manage all organizations"
ON public.organizations FOR ALL
USING ( is_super_admin() )
WITH CHECK ( is_super_admin() );

CREATE POLICY "Members read own organization"
ON public.organizations FOR SELECT
USING ( is_org_member(id) );

-- Org owners/admins edit their profile; status/verified/sapa flags
-- are protected by the trigger in section 6.
CREATE POLICY "Org admins update own organization"
ON public.organizations FOR UPDATE
USING ( is_org_admin(id) );

-- Kept from old migration (still valid): public read approved,
-- creator read own, authenticated insert own application,
-- creator update pending.

-- ------------------------------------------------------------
-- 5. CALENDAR — org event policies (additive)
-- ------------------------------------------------------------
-- NOTE: existing broad authenticated policies on calendar remain
-- for the current admin UI; tightening them is a Phase 5/6 task.

DROP POLICY IF EXISTS "Org admins insert own org events" ON public.calendar;
CREATE POLICY "Org admins insert own org events"
ON public.calendar FOR INSERT
WITH CHECK (
    organization_id IS NOT NULL AND is_org_admin(organization_id)
);

-- Org admins may only edit their events while pending/rejected.
-- Editing an approved event requires re-submission (Phase 4 portal
-- flow) or a 4M admin doing it — prevents silent post-approval edits.
DROP POLICY IF EXISTS "Org admins update own org events" ON public.calendar;
CREATE POLICY "Org admins update own org events"
ON public.calendar FOR UPDATE
USING (
    organization_id IS NOT NULL
    AND is_org_admin(organization_id)
    AND sanction_status IN ('pending', 'rejected')
);

-- ------------------------------------------------------------
-- 6. TRIGGERS — enforce sanctioning & protect privileged fields
-- ------------------------------------------------------------

-- 6a. Org-created events always enter as pending; only 4M admins
-- (super or custom) can set/change sanction fields.
CREATE OR REPLACE FUNCTION public.enforce_event_sanctioning()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT is_4m_admin() THEN
        IF TG_OP = 'INSERT' THEN
            IF NEW.organization_id IS NOT NULL THEN
                NEW.sanction_status := 'pending';
            END IF;
        ELSIF TG_OP = 'UPDATE' THEN
            NEW.sanction_status := OLD.sanction_status;
            NEW.rejection_notes := OLD.rejection_notes;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_enforce_event_sanctioning ON public.calendar;
CREATE TRIGGER trg_enforce_event_sanctioning
BEFORE INSERT OR UPDATE ON public.calendar
FOR EACH ROW EXECUTE FUNCTION public.enforce_event_sanctioning();

-- 6b. Org members cannot self-elevate org status/badges.
CREATE OR REPLACE FUNCTION public.protect_org_privileged_fields()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT is_4m_admin() THEN
        NEW.status          := OLD.status;
        NEW.verified        := OLD.verified;
        NEW.sapa_sanctioned := OLD.sapa_sanctioned;
        NEW.approved_by     := OLD.approved_by;
        NEW.approved_at     := OLD.approved_at;
        NEW.rejection_notes := OLD.rejection_notes;
        NEW.slug            := OLD.slug;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_protect_org_fields ON public.organizations;
CREATE TRIGGER trg_protect_org_fields
BEFORE UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.protect_org_privileged_fields();

-- ------------------------------------------------------------
-- 7. BACKFILL SAFETY
-- ------------------------------------------------------------
-- Any pre-existing rows keep working: events with NULL
-- organization_id are untouched; sanction_status default stays
-- 'approved' for admin-created events (trigger only forces
-- pending for org-created ones).
