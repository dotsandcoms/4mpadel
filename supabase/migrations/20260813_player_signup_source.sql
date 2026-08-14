-- Where the player first created their 4M account, plus a small device snapshot.
-- Existing rows default to web — every profile before the app was created there.

ALTER TABLE public.players
    ADD COLUMN IF NOT EXISTS signup_source TEXT NOT NULL DEFAULT 'web';

ALTER TABLE public.players
    ADD COLUMN IF NOT EXISTS signup_device JSONB;

ALTER TABLE public.players
    DROP CONSTRAINT IF EXISTS players_signup_source_check;

ALTER TABLE public.players
    ADD CONSTRAINT players_signup_source_check
    CHECK (signup_source IN ('web', 'ios', 'android'));

COMMENT ON COLUMN public.players.signup_source IS
    'Account origin: web (4mpadel.com), ios (Apple app), or android.';

COMMENT ON COLUMN public.players.signup_device IS
    'Device snapshot at signup: model, OS, app version. No advertising IDs.';

DROP FUNCTION IF EXISTS public.set_player_signup_source(text);

CREATE OR REPLACE FUNCTION public.set_player_signup_source(p_source text, p_device jsonb DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_email text := lower(trim(auth.jwt() ->> 'email'));
BEGIN
    IF v_email IS NULL OR v_email = '' THEN
        RAISE EXCEPTION 'Not signed in';
    END IF;
    IF p_source NOT IN ('web', 'ios', 'android') THEN
        RAISE EXCEPTION 'signup_source must be web, ios, or android';
    END IF;

    UPDATE public.players
    SET
        signup_source = p_source,
        signup_device = COALESCE(p_device, signup_device)
    WHERE email ILIKE v_email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_player_signup_source(text, jsonb) TO authenticated;
