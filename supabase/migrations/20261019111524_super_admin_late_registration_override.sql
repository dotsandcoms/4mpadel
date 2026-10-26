-- Super admins may create provisional entries after the closing time. The
-- override uses the signed-in account and server-owned role, never form data.
CREATE OR REPLACE FUNCTION private.assert_registration_deadline(
    p_event_id bigint, p_division_id uuid, p_division text, p_email text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    closes_at timestamptz;
    target_id uuid;
    target_name text;
BEGIN
    -- Keep the same lock order as capacity reservations and manager team changes.
    PERFORM 1 FROM public.calendar WHERE id = p_event_id FOR UPDATE;
    IF auth.uid() IS NOT NULL AND public.account_is_active()
        AND public.is_super_admin(auth.email()) THEN
        RETURN;
    END IF;
    SELECT d.id, d.name, COALESCE(d.entries_close_at, c.registration_closes_at)
    INTO target_id, target_name, closes_at
    FROM public.calendar c LEFT JOIN public.tournament_divisions d
      ON d.event_id = c.id AND (d.id = p_division_id OR (p_division_id IS NULL AND lower(trim(d.name)) = lower(trim(p_division))))
    WHERE c.id = p_event_id ORDER BY d.id LIMIT 1;
    IF closes_at IS NULL OR closes_at > clock_timestamp() THEN RETURN; END IF;
    IF EXISTS (
        SELECT 1 FROM public.event_registrations r
        WHERE r.event_id = p_event_id AND lower(trim(r.email)) = lower(trim(p_email))
          AND lower(COALESCE(r.status, '')) <> 'withdrawn'
          AND (r.division_id = target_id OR (r.division_id IS NULL
              AND lower(trim(r.division)) = lower(trim(COALESCE(target_name, p_division)))))
    ) THEN RETURN; END IF;
    RAISE EXCEPTION 'Registration has closed. Only existing active entries can be paid; no new entries or partners can be added.';
END;
$$;
REVOKE ALL ON FUNCTION private.assert_registration_deadline(bigint,uuid,text,text)
    FROM PUBLIC, anon, authenticated;
NOTIFY pgrst, 'reload schema';
