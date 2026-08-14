-- Devices used to open the native app. Separate from signup_source / signup_device,
-- which stay as account origin (web users who later install the app keep source=web).

CREATE TABLE IF NOT EXISTS public.player_devices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL,
    player_id bigint REFERENCES public.players(id) ON DELETE SET NULL,
    platform text NOT NULL CHECK (platform IN ('ios', 'android')),
    fingerprint text NOT NULL,
    device jsonb NOT NULL,
    first_seen_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (email, fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_player_devices_email
    ON public.player_devices (lower(email));
CREATE INDEX IF NOT EXISTS idx_player_devices_player_id
    ON public.player_devices (player_id);

COMMENT ON TABLE public.player_devices IS
    'Every native device that has opened the app for this account. Model/OS only — no advertising IDs.';

ALTER TABLE public.players
    ADD COLUMN IF NOT EXISTS last_app_device JSONB;
ALTER TABLE public.players
    ADD COLUMN IF NOT EXISTS last_app_at TIMESTAMPTZ;

COMMENT ON COLUMN public.players.last_app_device IS
    'Most recent native-app device snapshot. Does not replace signup_device.';
COMMENT ON COLUMN public.players.last_app_at IS
    'When this account last opened the iOS or Android app.';

ALTER TABLE public.player_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Own devices" ON public.player_devices;
CREATE POLICY "Own devices"
    ON public.player_devices
    FOR ALL
    TO authenticated
    USING ((auth.jwt() ->> 'email') ILIKE email)
    WITH CHECK ((auth.jwt() ->> 'email') ILIKE email);

CREATE OR REPLACE FUNCTION public.record_player_device(p_device jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_email text := lower(trim(auth.jwt() ->> 'email'));
    v_platform text;
    v_fingerprint text;
    v_player_id bigint;
BEGIN
    IF v_email IS NULL OR v_email = '' THEN
        RAISE EXCEPTION 'Not signed in';
    END IF;
    IF p_device IS NULL THEN
        RAISE EXCEPTION 'device is required';
    END IF;

    v_platform := lower(trim(p_device ->> 'source'));
    IF v_platform NOT IN ('ios', 'android') THEN
        RAISE EXCEPTION 'device source must be ios or android';
    END IF;

    v_fingerprint := v_platform || ':' || coalesce(
        nullif(trim(p_device ->> 'modelId'), ''),
        nullif(trim(p_device ->> 'model'), ''),
        'unknown'
    );

    SELECT id INTO v_player_id
    FROM public.players
    WHERE email ILIKE v_email
    LIMIT 1;

    INSERT INTO public.player_devices (email, player_id, platform, fingerprint, device)
    VALUES (v_email, v_player_id, v_platform, v_fingerprint, p_device)
    ON CONFLICT (email, fingerprint) DO UPDATE SET
        player_id = COALESCE(EXCLUDED.player_id, public.player_devices.player_id),
        device = EXCLUDED.device,
        last_seen_at = now();

    UPDATE public.players
    SET
        last_app_device = p_device,
        last_app_at = now()
    WHERE email ILIKE v_email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_player_device(jsonb) TO authenticated;

-- Origin is write-once: a web signup that later opens the app must not become ios.
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
        signup_source = CASE
            WHEN signup_device IS NULL THEN p_source
            ELSE signup_source
        END,
        signup_device = COALESCE(signup_device, p_device)
    WHERE email ILIKE v_email;
END;
$$;
