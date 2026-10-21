-- Per-match timing overrides, shared by calendar adjustments and automation.
ALTER TABLE public.draw_matches
    ADD COLUMN IF NOT EXISTS match_duration_minutes integer CHECK (match_duration_minutes > 0),
    ADD COLUMN IF NOT EXISTS not_before timestamptz;
CREATE OR REPLACE FUNCTION public.enforce_match_not_before()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
    IF NEW.not_before IS NOT NULL THEN
        IF NEW.scheduled_start IS NOT NULL AND NEW.scheduled_start < NEW.not_before THEN
            RAISE EXCEPTION 'Match start must be on or after its not-before time';
        END IF;
        IF NEW.status = 'in_progress' AND OLD.status IS DISTINCT FROM 'in_progress' AND now() < NEW.not_before THEN
            RAISE EXCEPTION 'This match cannot go live before its not-before time';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER enforce_match_not_before BEFORE INSERT OR UPDATE ON public.draw_matches
FOR EACH ROW EXECUTE FUNCTION public.enforce_match_not_before();
