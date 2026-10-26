-- Organisation event autonomy and expanded immutable audit trail.
-- Organisation owners/admins publish and edit their own events directly.
-- Federation sanctioning remains independent in federation_sanction_status.

-- Only true super admins may read the global organisation audit trail.
DROP POLICY IF EXISTS "4M admins read audit log" ON public.org_audit_log;
DROP POLICY IF EXISTS "Super admins read audit log" ON public.org_audit_log;
CREATE POLICY "Super admins read audit log"
ON public.org_audit_log FOR SELECT
TO authenticated
USING (public.is_super_admin());

REVOKE INSERT, UPDATE, DELETE ON public.org_audit_log FROM anon, authenticated;

-- Organisation-managed events no longer enter a platform approval queue.
CREATE OR REPLACE FUNCTION public.enforce_event_sanctioning()
RETURNS TRIGGER AS $$
BEGIN
    -- Platform admins and service-role/database work retain full control.
    IF public.is_4m_admin() THEN
        RETURN NEW;
    END IF;

    IF NEW.organisation_id IS NOT NULL THEN
        NEW.sanction_status := 'approved';
        NEW.rejection_notes := NULL;

        IF TG_OP = 'UPDATE' THEN
            -- A direct save replaces any legacy approval draft.
            NEW.pending_changes := NULL;
            NEW.pending_changes_status := NULL;
            NEW.pending_changes_notes := NULL;
            NEW.pending_changes_submitted_at := NULL;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_enforce_event_sanctioning ON public.calendar;
CREATE TRIGGER trg_enforce_event_sanctioning
BEFORE INSERT OR UPDATE ON public.calendar
FOR EACH ROW EXECUTE FUNCTION public.enforce_event_sanctioning();

-- Sensitive and purely technical fields are never copied into audit details.
CREATE OR REPLACE FUNCTION public.audit_safe_event(p_row JSONB)
RETURNS JSONB AS $$
    SELECT COALESCE(p_row, '{}'::jsonb)
        - ARRAY[
            'registration_access_code_hash', 'access_code_hash', 'password_hash',
            'pending_changes', 'pending_changes_status', 'pending_changes_notes',
            'pending_changes_submitted_at', 'updated_at'
        ];
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.audit_org_events()
RETURNS TRIGGER AS $$
DECLARE
    v_org_id UUID;
    v_event_id TEXT;
    v_event_name TEXT;
    v_old JSONB;
    v_new JSONB;
    v_changes JSONB;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_org_id := OLD.organisation_id;
        IF v_org_id IS NULL THEN RETURN OLD; END IF;
        PERFORM public.org_audit(
            'event.deleted', 'event', OLD.id::text, v_org_id,
            jsonb_build_object('event_name', OLD.event_name, 'before', public.audit_safe_event(to_jsonb(OLD)))
        );
        RETURN OLD;
    END IF;

    v_org_id := NEW.organisation_id;
    IF v_org_id IS NULL THEN RETURN NEW; END IF;
    v_event_id := NEW.id::text;
    v_event_name := NEW.event_name;

    IF TG_OP = 'INSERT' THEN
        PERFORM public.org_audit(
            'event.created', 'event', v_event_id, v_org_id,
            jsonb_build_object('event_name', v_event_name, 'after', public.audit_safe_event(to_jsonb(NEW)))
        );
        RETURN NEW;
    END IF;

    v_old := public.audit_safe_event(to_jsonb(OLD));
    v_new := public.audit_safe_event(to_jsonb(NEW));

    SELECT COALESCE(
        jsonb_object_agg(key, jsonb_build_object('from', v_old -> key, 'to', v_new -> key)),
        '{}'::jsonb
    )
    INTO v_changes
    FROM jsonb_object_keys(v_old || v_new) AS changed(key)
    WHERE v_old -> key IS DISTINCT FROM v_new -> key;

    IF v_changes <> '{}'::jsonb THEN
        PERFORM public.org_audit(
            'event.updated', 'event', v_event_id, v_org_id,
            jsonb_build_object('event_name', v_event_name, 'changes', v_changes)
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_audit_org_events ON public.calendar;
CREATE TRIGGER trg_audit_org_events
AFTER INSERT OR UPDATE OR DELETE ON public.calendar
FOR EACH ROW EXECUTE FUNCTION public.audit_org_events();

-- Division edits are stored as their own auditable actions.
CREATE OR REPLACE FUNCTION public.audit_event_divisions()
RETURNS TRIGGER AS $$
DECLARE
    v_event_id BIGINT;
    v_org_id UUID;
    v_event_name TEXT;
    v_before JSONB;
    v_after JSONB;
    v_changes JSONB;
    v_division_name TEXT;
BEGIN
    v_event_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.event_id ELSE NEW.event_id END;
    SELECT organisation_id, event_name INTO v_org_id, v_event_name
    FROM public.calendar WHERE id = v_event_id;

    IF v_org_id IS NULL THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        v_after := to_jsonb(NEW) - ARRAY['updated_at'];
        v_division_name := COALESCE(v_after ->> 'name', v_after ->> 'division_name', 'Division');
        PERFORM public.org_audit('division.created', 'division', NEW.id::text, v_org_id,
            jsonb_build_object('event_name', v_event_name, 'division_name', v_division_name, 'after', v_after));
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        v_before := to_jsonb(OLD) - ARRAY['updated_at'];
        v_division_name := COALESCE(v_before ->> 'name', v_before ->> 'division_name', 'Division');
        PERFORM public.org_audit('division.deleted', 'division', OLD.id::text, v_org_id,
            jsonb_build_object('event_name', v_event_name, 'division_name', v_division_name, 'before', v_before));
        RETURN OLD;
    END IF;

    v_before := to_jsonb(OLD) - ARRAY['updated_at'];
    v_after := to_jsonb(NEW) - ARRAY['updated_at'];
    v_division_name := COALESCE(v_after ->> 'name', v_after ->> 'division_name', 'Division');

    SELECT COALESCE(
        jsonb_object_agg(key, jsonb_build_object('from', v_before -> key, 'to', v_after -> key)),
        '{}'::jsonb
    )
    INTO v_changes
    FROM jsonb_object_keys(v_before || v_after) AS changed(key)
    WHERE v_before -> key IS DISTINCT FROM v_after -> key;

    IF v_changes <> '{}'::jsonb THEN
        PERFORM public.org_audit('division.updated', 'division', NEW.id::text, v_org_id,
            jsonb_build_object('event_name', v_event_name, 'division_name', v_division_name, 'changes', v_changes));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_audit_event_divisions ON public.tournament_divisions;
CREATE TRIGGER trg_audit_event_divisions
AFTER INSERT OR UPDATE OR DELETE ON public.tournament_divisions
FOR EACH ROW EXECUTE FUNCTION public.audit_event_divisions();

-- Release historical organisation events from the obsolete platform queue.
UPDATE public.calendar
SET sanction_status = 'approved', rejection_notes = NULL
WHERE organisation_id IS NOT NULL
  AND sanction_status IS DISTINCT FROM 'approved';
