-- ============================================================
-- Migration 5 — Organisation audit log
-- Every org-related action (applications, approvals, rejections,
-- member changes, event submissions, sanctions, amendments,
-- profile edits) is recorded automatically by triggers.
-- Rows are written by SECURITY DEFINER functions only — clients
-- cannot insert, update or delete audit entries.
-- Idempotent — safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. TABLE
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.org_audit_log (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    actor_email     TEXT NOT NULL,
    action          TEXT NOT NULL,          -- e.g. org.approved, member.added, event.sanctioned, amendment.rejected
    entity_type     TEXT NOT NULL,          -- organization | member | event
    entity_id       TEXT,
    organization_id UUID,                   -- no FK: log survives org deletion
    details         JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_org_audit_org     ON public.org_audit_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_audit_created ON public.org_audit_log(created_at DESC);

ALTER TABLE public.org_audit_log ENABLE ROW LEVEL SECURITY;

-- Read: 4M admins only. Write: nobody via the API (triggers insert as owner).
DROP POLICY IF EXISTS "4M admins read audit log" ON public.org_audit_log;
CREATE POLICY "4M admins read audit log"
ON public.org_audit_log FOR SELECT
TO authenticated
USING ( is_4m_admin() );

-- ------------------------------------------------------------
-- 2. HELPERS
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_actor()
RETURNS TEXT AS $$
    SELECT COALESCE(
        auth.jwt() ->> 'email',
        CASE
            WHEN COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role' THEN 'service-role'
            WHEN NULLIF(current_setting('request.jwt.claims', true), '') IS NULL THEN 'direct-db'
            ELSE 'anonymous'
        END
    );
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION public.org_audit(
    p_action TEXT, p_entity_type TEXT, p_entity_id TEXT,
    p_org_id UUID, p_details JSONB
) RETURNS VOID AS $$
BEGIN
    INSERT INTO public.org_audit_log (actor_email, action, entity_type, entity_id, organization_id, details)
    VALUES (audit_actor(), p_action, p_entity_type, p_entity_id, p_org_id, COALESCE(p_details, '{}'::jsonb));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- 3. ORGANIZATIONS trigger
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_organizations()
RETURNS TRIGGER AS $$
DECLARE
    changed TEXT[] := '{}';
    col TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM org_audit('org.applied', 'organization', NEW.id::text, NEW.id,
            jsonb_build_object('name', NEW.name, 'contact_email', NEW.contact_email));
        RETURN NEW;
    END IF;

    -- Status transitions (approved / rejected / suspended / back to pending)
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        PERFORM org_audit('org.' || NEW.status, 'organization', NEW.id::text, NEW.id,
            jsonb_build_object('name', NEW.name, 'from', OLD.status,
                'notes', NEW.rejection_notes));
    END IF;

    -- Badge changes
    IF NEW.verified IS DISTINCT FROM OLD.verified OR NEW.sapa_sanctioned IS DISTINCT FROM OLD.sapa_sanctioned THEN
        PERFORM org_audit('org.badges_changed', 'organization', NEW.id::text, NEW.id,
            jsonb_build_object('name', NEW.name, 'verified', NEW.verified, 'sapa_sanctioned', NEW.sapa_sanctioned));
    END IF;

    -- Profile content edits
    FOREACH col IN ARRAY ARRAY['name','contact_email','contact_phone','whatsapp_number','website_url',
                               'about','org_type','coverage','year_established','brand_color',
                               'logo_url','cover_image_url','socials','contacts'] LOOP
        IF to_jsonb(NEW) -> col IS DISTINCT FROM to_jsonb(OLD) -> col THEN
            changed := array_append(changed, col);
        END IF;
    END LOOP;
    IF array_length(changed, 1) > 0 THEN
        PERFORM org_audit('org.profile_updated', 'organization', NEW.id::text, NEW.id,
            jsonb_build_object('name', NEW.name, 'fields', changed));
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_audit_organizations ON public.organizations;
CREATE TRIGGER trg_audit_organizations
AFTER INSERT OR UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.audit_organizations();

-- ------------------------------------------------------------
-- 4. ORGANIZATION MEMBERS trigger
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_org_members()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM org_audit('member.added', 'member', NEW.id::text, NEW.organization_id,
            jsonb_build_object('member_email', NEW.user_email, 'role', NEW.role));
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.role IS DISTINCT FROM OLD.role THEN
            PERFORM org_audit('member.role_changed', 'member', NEW.id::text, NEW.organization_id,
                jsonb_build_object('member_email', NEW.user_email, 'from', OLD.role, 'to', NEW.role));
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        PERFORM org_audit('member.removed', 'member', OLD.id::text, OLD.organization_id,
            jsonb_build_object('member_email', OLD.user_email, 'role', OLD.role));
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_audit_org_members ON public.organization_members;
CREATE TRIGGER trg_audit_org_members
AFTER INSERT OR UPDATE OR DELETE ON public.organization_members
FOR EACH ROW EXECUTE FUNCTION public.audit_org_members();

-- ------------------------------------------------------------
-- 5. CALENDAR trigger (org events only)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_org_events()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.organization_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        PERFORM org_audit('event.submitted', 'event', NEW.id::text, NEW.organization_id,
            jsonb_build_object('event_name', NEW.event_name, 'tier', NEW.sapa_status));
        RETURN NEW;
    END IF;

    -- Sanction transitions
    IF NEW.sanction_status IS DISTINCT FROM OLD.sanction_status THEN
        PERFORM org_audit(
            CASE NEW.sanction_status
                WHEN 'approved' THEN 'event.sanctioned'
                WHEN 'rejected' THEN 'event.rejected'
                ELSE 'event.pending'
            END,
            'event', NEW.id::text, NEW.organization_id,
            jsonb_build_object('event_name', NEW.event_name, 'notes', NEW.rejection_notes));
    END IF;

    -- Amendment lifecycle
    IF NEW.pending_changes_status IS DISTINCT FROM OLD.pending_changes_status THEN
        IF NEW.pending_changes_status = 'pending' THEN
            PERFORM org_audit('amendment.submitted', 'event', NEW.id::text, NEW.organization_id,
                jsonb_build_object('event_name', NEW.event_name));
        ELSIF NEW.pending_changes_status = 'rejected' THEN
            PERFORM org_audit('amendment.rejected', 'event', NEW.id::text, NEW.organization_id,
                jsonb_build_object('event_name', NEW.event_name, 'notes', NEW.pending_changes_notes));
        ELSIF NEW.pending_changes_status IS NULL AND OLD.pending_changes_status = 'pending' THEN
            PERFORM org_audit('amendment.approved', 'event', NEW.id::text, NEW.organization_id,
                jsonb_build_object('event_name', NEW.event_name));
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_audit_org_events ON public.calendar;
CREATE TRIGGER trg_audit_org_events
AFTER INSERT OR UPDATE ON public.calendar
FOR EACH ROW EXECUTE FUNCTION public.audit_org_events();
