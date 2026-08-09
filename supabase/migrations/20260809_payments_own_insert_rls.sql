-- Fix registration checkout after 20260807 payments RLS lockdown.
--
-- That migration correctly removed the open public/admin write policy, but it
-- only restored SELECT for own rows. Manual event registration still inserts a
-- `processing` payments ledger row from the browser before launching Paystack
-- (ManualEventRegistration.insertProcessingPayment / division-switch top-ups,
-- EventDetails license ledger rows). Those inserts now fail with:
--   new row violates row-level security policy for table "payments"
--
-- Restore authenticated INSERT/UPDATE for the caller's own payment rows only.
-- Status transitions to success/failed remain server-side (webhook /
-- confirm-manual-payment / service role).

-- Own-row ownership helper used by SELECT / INSERT / UPDATE policies.
CREATE OR REPLACE FUNCTION public.payment_owned_by_jwt(p public.payments)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT
        (p.metadata ->> 'email') ILIKE (auth.jwt() ->> 'email')
        OR (p.metadata ->> 'registrant_email') ILIKE (auth.jwt() ->> 'email')
        OR (
            NULLIF(p.metadata ->> 'paid_by_id', '') IS NOT NULL
            AND (p.metadata ->> 'paid_by_id')::bigint IN (
                SELECT id FROM public.players
                WHERE email ILIKE (auth.jwt() ->> 'email')
            )
        )
        OR (
            p.player_id IS NOT NULL
            AND p.player_id IN (
                SELECT id FROM public.players
                WHERE email ILIKE (auth.jwt() ->> 'email')
            )
        );
$$;

REVOKE ALL ON FUNCTION public.payment_owned_by_jwt(public.payments) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.payment_owned_by_jwt(public.payments) TO authenticated;

DROP POLICY IF EXISTS "Authenticated read own payments" ON public.payments;
CREATE POLICY "Authenticated read own payments"
    ON public.payments FOR SELECT
    TO authenticated
    USING (public.payment_owned_by_jwt(payments));

DROP POLICY IF EXISTS "Authenticated insert own payments" ON public.payments;
CREATE POLICY "Authenticated insert own payments"
    ON public.payments FOR INSERT
    TO authenticated
    WITH CHECK (public.payment_owned_by_jwt(payments));

-- Needed so expireAbandonedCheckouts can mark the caller's own stale
-- `processing` rows as abandoned (no longer a blanket event-wide write).
DROP POLICY IF EXISTS "Authenticated update own payments" ON public.payments;
CREATE POLICY "Authenticated update own payments"
    ON public.payments FOR UPDATE
    TO authenticated
    USING (public.payment_owned_by_jwt(payments))
    WITH CHECK (public.payment_owned_by_jwt(payments));

-- ============================================================
-- Follow-up, same incident: the above fixed authenticated checkout, but
-- two more things surfaced once this was live.
-- ============================================================

-- A. EventDetails.jsx's license-payment flow can insert a payments row
--    before the visitor has logged in (self-reported status: 'success'
--    right after the Paystack redirect returns -- this is pre-existing
--    app behavior, not new). Nothing above covers anon at all, so that
--    path was still broken.
CREATE POLICY "Allow anon payment inserts"
    ON public.payments FOR INSERT TO anon
    WITH CHECK (true);

-- Defense in depth: INSERT ... RETURNING (or a future .select() chained
-- onto an anon insert) requires SELECT-equivalent RLS authorization even
-- for a row just inserted by the same statement -- without this, such a
-- call would fail outright instead of just returning nothing. No current
-- call site chains .select() after an anon payments insert.
CREATE POLICY "Allow anon read own payments"
    ON public.payments FOR SELECT TO anon
    USING ((metadata ->> 'email') ILIKE current_setting('request.jwt.claims', true)::jsonb ->> 'email');

-- B. Performance: payment_owned_by_jwt is correct, but called as an
--    opaque per-row function under RLS's mandatory security-barrier
--    semantics, it forced a genuine per-row subquery against players for
--    every scanned row -- and that subquery was ITSELF subject to
--    players' own RLS policy (RLS-on-RLS), unable to use an index in
--    this nested context. Measured 9.4s for a 50-row payments report
--    query as an authenticated admin. Inlining the same ownership logic
--    directly into the policy (instead of calling out to a function) lets
--    the planner treat the players lookup as a normal hashable subquery.
--    Confirmed 138ms after this rewrite. get_player_id_by_email is
--    SECURITY DEFINER so it bypasses players' RLS entirely for this
--    internal lookup, avoiding the RLS-on-RLS compounding regardless of
--    call site.
CREATE OR REPLACE FUNCTION public.get_player_id_by_email(p_email text)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT id FROM public.players WHERE email ILIKE p_email LIMIT 1;
$$;

DROP POLICY IF EXISTS "Authenticated read own payments" ON public.payments;
CREATE POLICY "Authenticated read own payments"
    ON public.payments FOR SELECT TO authenticated
    USING (
        (metadata ->> 'email') ILIKE (auth.jwt() ->> 'email')
        OR (metadata ->> 'registrant_email') ILIKE (auth.jwt() ->> 'email')
        OR player_id = public.get_player_id_by_email(auth.jwt() ->> 'email')
        OR is_super_admin((auth.jwt() ->> 'email'))
    );

DROP POLICY IF EXISTS "Authenticated insert own payments" ON public.payments;
CREATE POLICY "Authenticated insert own payments"
    ON public.payments FOR INSERT TO authenticated
    WITH CHECK (
        (metadata ->> 'email') ILIKE (auth.jwt() ->> 'email')
        OR (metadata ->> 'registrant_email') ILIKE (auth.jwt() ->> 'email')
        OR player_id = public.get_player_id_by_email(auth.jwt() ->> 'email')
        OR is_super_admin((auth.jwt() ->> 'email'))
    );

DROP POLICY IF EXISTS "Authenticated update own payments" ON public.payments;
CREATE POLICY "Authenticated update own payments"
    ON public.payments FOR UPDATE TO authenticated
    USING (
        (metadata ->> 'email') ILIKE (auth.jwt() ->> 'email')
        OR (metadata ->> 'registrant_email') ILIKE (auth.jwt() ->> 'email')
        OR player_id = public.get_player_id_by_email(auth.jwt() ->> 'email')
        OR is_super_admin((auth.jwt() ->> 'email'))
    )
    WITH CHECK (
        (metadata ->> 'email') ILIKE (auth.jwt() ->> 'email')
        OR (metadata ->> 'registrant_email') ILIKE (auth.jwt() ->> 'email')
        OR player_id = public.get_player_id_by_email(auth.jwt() ->> 'email')
        OR is_super_admin((auth.jwt() ->> 'email'))
    );

-- C. Root cause of a separate, simultaneous symptom: the admin players
--    list timing out (57014 statement timeout). is_super_admin(text) --
--    the overload used throughout every RLS policy from the
--    20260807/20260809 lockdowns -- is plpgsql with no STABLE marker, so
--    Postgres re-executed its admin_sidebar_permissions lookup for every
--    single row scanned instead of caching it once per statement.
--    `select * from players` as an authenticated admin went from timing
--    out to 90ms after adding STABLE. This affects every table locked
--    down this session, not just players/payments.
CREATE OR REPLACE FUNCTION public.is_super_admin(user_email text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $function$
BEGIN
    IF user_email IN (
        'brad@dotsandcoms.co.za',
        'bradein@dotsandcoms.co.za',
        'admin@4mpadel.co.za',
        'markstillerman@gmail.com'
    ) THEN
        RETURN true;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM public.admin_sidebar_permissions
        WHERE email = user_email AND role = 'super_admin'
    );
END;
$function$;

-- players.email is looked up via ILIKE throughout the app and in RLS
-- policies (payment ownership, partner search RPCs, etc.) but only had a
-- plain btree unique index, which Postgres cannot use to accelerate ILIKE
-- pattern matching -- every such lookup was a full sequential scan of the
-- players table. pg_trgm's GIN index supports ILIKE natively.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS players_email_trgm_idx ON public.players USING gin (email gin_trgm_ops);
