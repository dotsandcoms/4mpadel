-- A withdrawn partner entry can be invisible to the new registrant under RLS.
-- Archive only its old unique-key slot as part of an actual replacement INSERT.
-- The new row still passes the caller's RLS, capacity, deadline and access checks;
-- any failure rolls this archival back with the insert.
CREATE OR REPLACE FUNCTION private.archive_withdrawn_registration_conflict()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    IF lower(COALESCE(NEW.status, '')) = 'withdrawn' THEN RETURN NEW; END IF;

    -- Use the same parent lock as reservations, withdrawals and team changes.
    PERFORM 1 FROM public.calendar WHERE id = NEW.event_id FOR UPDATE;
    UPDATE public.event_registrations r
    SET division = '__archived__/' || r.id::text, division_id = NULL
    WHERE r.event_id = NEW.event_id
      AND lower(trim(r.email)) = lower(trim(NEW.email))
      AND r.division = NEW.division
      AND r.id IS DISTINCT FROM NEW.id
      AND lower(COALESCE(r.status, '')) = 'withdrawn';
    RETURN NEW;
END;
$$;

-- This privileged helper is trigger-only, never an RPC or a broader update grant.
REVOKE ALL ON FUNCTION private.archive_withdrawn_registration_conflict()
    FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER archive_withdrawn_registration_conflict
BEFORE INSERT ON public.event_registrations
FOR EACH ROW EXECUTE FUNCTION private.archive_withdrawn_registration_conflict();

NOTIFY pgrst, 'reload schema';
