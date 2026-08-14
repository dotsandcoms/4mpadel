-- Push foundation: device tokens, per-event prefs, and a service-role outbox.
-- Features enqueue; a later Edge Function (Expo Push) delivers. Clients never
-- send to another player — partner / payment / withdrawal notifies go through
-- the same outbox the emails already use.

ALTER TABLE public.players
    ADD COLUMN IF NOT EXISTS notification_prefs JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.players.notification_prefs IS
    'Opt-out map keyed by push event type. Missing key = enabled. {"payment_reminder": false} mutes that type.';

CREATE TABLE IF NOT EXISTS public.player_push_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL,
    player_id bigint REFERENCES public.players(id) ON DELETE SET NULL,
    token text NOT NULL,
    token_kind text NOT NULL DEFAULT 'expo'
        CHECK (token_kind IN ('expo', 'apns', 'fcm')),
    platform text NOT NULL CHECK (platform IN ('ios', 'android')),
    app_version text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS idx_player_push_tokens_email
    ON public.player_push_tokens (lower(email));
CREATE INDEX IF NOT EXISTS idx_player_push_tokens_player_id
    ON public.player_push_tokens (player_id);

COMMENT ON TABLE public.player_push_tokens IS
    'Expo / device push tokens. One row per device. Upserted on launch when permission is already granted.';

ALTER TABLE public.player_push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Own push tokens" ON public.player_push_tokens;
CREATE POLICY "Own push tokens"
    ON public.player_push_tokens
    FOR ALL
    TO authenticated
    USING ((auth.jwt() ->> 'email') ILIKE email)
    WITH CHECK ((auth.jwt() ->> 'email') ILIKE email);

CREATE TABLE IF NOT EXISTS public.push_outbox (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL,
    type text NOT NULL CHECK (type IN (
        'partner_assigned',
        'partner_entry_paid',
        'partner_invite',
        'event_registration',
        'payment_confirmation',
        'payment_reminder',
        'entry_withdrawn',
        'entry_refunded',
        'draws_ready',
        'division_changed',
        'match_reminder',
        'ranking_change',
        'club_announcement'
    )),
    title text NOT NULL,
    body text NOT NULL,
    path text,
    data jsonb NOT NULL DEFAULT '{}'::jsonb,
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'sent', 'skipped', 'failed')),
    error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_push_outbox_pending
    ON public.push_outbox (created_at)
    WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_push_outbox_email
    ON public.push_outbox (lower(email), created_at DESC);

COMMENT ON TABLE public.push_outbox IS
    'Queued pushes. Service role only. partner_entry_paid is the “you were registered as partner” event.';

ALTER TABLE public.push_outbox ENABLE ROW LEVEL SECURITY;
-- No client policies: authenticated/anon cannot read or write the outbox.

CREATE OR REPLACE FUNCTION public.register_push_token(
    p_token text,
    p_platform text,
    p_token_kind text DEFAULT 'expo',
    p_app_version text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_email text := lower(trim(auth.jwt() ->> 'email'));
    v_player_id bigint;
BEGIN
    IF v_email IS NULL OR v_email = '' THEN
        RAISE EXCEPTION 'Not signed in';
    END IF;
    IF p_token IS NULL OR length(trim(p_token)) < 8 THEN
        RAISE EXCEPTION 'Invalid push token';
    END IF;
    IF p_platform NOT IN ('ios', 'android') THEN
        RAISE EXCEPTION 'platform must be ios or android';
    END IF;
    IF p_token_kind NOT IN ('expo', 'apns', 'fcm') THEN
        RAISE EXCEPTION 'token_kind must be expo, apns, or fcm';
    END IF;

    SELECT id INTO v_player_id
    FROM public.players
    WHERE email ILIKE v_email
    LIMIT 1;

    INSERT INTO public.player_push_tokens (email, player_id, token, token_kind, platform, app_version)
    VALUES (v_email, v_player_id, trim(p_token), p_token_kind, p_platform, p_app_version)
    ON CONFLICT (token) DO UPDATE SET
        email = EXCLUDED.email,
        player_id = EXCLUDED.player_id,
        token_kind = EXCLUDED.token_kind,
        platform = EXCLUDED.platform,
        app_version = EXCLUDED.app_version,
        updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.unregister_push_token(p_token text)
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
    DELETE FROM public.player_push_tokens
    WHERE token = trim(p_token)
      AND email ILIKE v_email;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_notification_pref(p_type text, p_enabled boolean)
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
    IF p_type NOT IN (
        'partner_assigned',
        'partner_entry_paid',
        'partner_invite',
        'event_registration',
        'payment_confirmation',
        'payment_reminder',
        'entry_withdrawn',
        'entry_refunded',
        'draws_ready',
        'division_changed',
        'match_reminder',
        'ranking_change',
        'club_announcement'
    ) THEN
        RAISE EXCEPTION 'Unknown notification type';
    END IF;

    UPDATE public.players
    SET notification_prefs = jsonb_set(
        COALESCE(notification_prefs, '{}'::jsonb),
        ARRAY[p_type],
        to_jsonb(p_enabled),
        true
    )
    WHERE email ILIKE v_email;
END;
$$;

-- Features (paystack-webhook, registration, withdrawals) call this with the
-- service role. Recipients who muted the type are stored as skipped, not sent.
CREATE OR REPLACE FUNCTION public.enqueue_push(
    p_email text,
    p_type text,
    p_title text,
    p_body text,
    p_path text DEFAULT NULL,
    p_data jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_email text := lower(trim(p_email));
    v_pref text;
    v_status text := 'pending';
    v_id uuid;
BEGIN
    IF v_email IS NULL OR v_email = '' THEN
        RAISE EXCEPTION 'email is required';
    END IF;

    SELECT notification_prefs ->> p_type
    INTO v_pref
    FROM public.players
    WHERE email ILIKE v_email
    LIMIT 1;

    IF v_pref = 'false' THEN
        v_status := 'skipped';
    END IF;

    INSERT INTO public.push_outbox (email, type, title, body, path, data, status)
    VALUES (v_email, p_type, p_title, p_body, p_path, COALESCE(p_data, '{}'::jsonb), v_status)
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_push_token(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unregister_push_token(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_notification_pref(text, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.enqueue_push(text, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_push(text, text, text, text, text, jsonb) TO service_role;
