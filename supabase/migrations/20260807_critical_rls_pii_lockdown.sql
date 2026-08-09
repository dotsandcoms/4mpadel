-- CRITICAL SECURITY FIX: multiple tables had RLS policies granting
-- `USING (true)` to the anon/public role, meaning anyone with the public
-- anon API key (which ships in every page load, by design) could read the
-- ENTIRE contents of these tables with a single unauthenticated HTTP request —
-- including players.id_number (SA ID numbers), email, phone, payment
-- records, and bearer tokens (pay_token / club claim invite token) that are
-- meant to work like magic-link credentials.
--
-- This migration:
--   1. Drops every over-permissive anon/public/blanket-authenticated policy
--      found on the affected tables.
--   2. Re-adds narrowly-scoped policies: own-record (by JWT email match),
--      admin-only (via the existing is_super_admin() helper), or a
--      safe public VIEW that excludes PII columns for the small number of
--      fields that are genuinely meant to be public (e.g. a tournament
--      entry list showing names, not emails).
--   3. Adds SECURITY DEFINER RPCs for the legitimate token-based anonymous
--      flows (pay_token payment continuation, club claim invite lookup) so
--      a caller who has the exact unguessable token can still use it, but
--      can no longer enumerate every row by omitting the filter.

-- ============================================================
-- 1. players — the most severe: id_number, email, contact_number exposed
-- ============================================================
DROP POLICY IF EXISTS "Public Read Profiles" ON public.players;
DROP POLICY IF EXISTS "Public players are viewable by everyone." ON public.players;
DROP POLICY IF EXISTS "Public can view players" ON public.players;
DROP POLICY IF EXISTS "Admins can manage players" ON public.players;
DROP POLICY IF EXISTS "Admins can insert players." ON public.players;
DROP POLICY IF EXISTS "Admins can update players." ON public.players;
DROP POLICY IF EXISTS "Admins can delete players." ON public.players;
-- "Users Update Own Profile" already correctly scoped by email match — kept as-is.

CREATE POLICY "Authenticated read own or admin"
    ON public.players FOR SELECT
    TO authenticated
    USING ((auth.jwt() ->> 'email') ILIKE email OR public.is_super_admin(auth.jwt() ->> 'email'));

CREATE POLICY "Admins insert players"
    ON public.players FOR INSERT
    TO authenticated
    WITH CHECK (public.is_super_admin(auth.jwt() ->> 'email'));

CREATE POLICY "Admins delete players"
    ON public.players FOR DELETE
    TO authenticated
    USING (public.is_super_admin(auth.jwt() ->> 'email'));

CREATE POLICY "Admins update any player"
    ON public.players FOR UPDATE
    TO authenticated
    USING (public.is_super_admin(auth.jwt() ->> 'email'))
    WITH CHECK (public.is_super_admin(auth.jwt() ->> 'email'));

-- Public directory view — every column the Players/PlayerProfile public
-- pages actually display, deliberately excluding email, contact_number,
-- id_number, last_login.
CREATE OR REPLACE VIEW public.players_public AS
SELECT
    id, name, rank_label, points, win_rate, image_url, created_at, home_club,
    age_group, nationality, category, level, bio, sponsors, gender, approved,
    skill_rating, age, match_form, rankings, rankedin_profile_url, rankedin_id,
    instagram_link, license_type, preferred_ranking, active_ranking_label,
    region, racket_brand, additional_images, club_id, account_type
FROM public.players
WHERE approved = true;

GRANT SELECT ON public.players_public TO anon, authenticated;

-- ============================================================
-- 2. event_registrations — email/phone/pay_token exposed; "own" policies
--    were actually unrestricted for everyone, including UPDATE (data
--    integrity risk, not just a read leak).
-- ============================================================
DROP POLICY IF EXISTS "Allow anon read own" ON public.event_registrations;
DROP POLICY IF EXISTS "Allow public update own registration" ON public.event_registrations;
-- "Allow public inserts" kept — anonymous event signup legitimately creates
-- a new row describing only the submitter's own entry; that's fine.

CREATE POLICY "Authenticated read own or admin registrations"
    ON public.event_registrations FOR SELECT
    TO authenticated
    USING (
        (auth.jwt() ->> 'email') ILIKE email
        OR (auth.jwt() ->> 'email') ILIKE partner_email
        OR (auth.jwt() ->> 'email') ILIKE registered_by
        OR public.is_super_admin(auth.jwt() ->> 'email')
    );

CREATE POLICY "Authenticated update own or admin registrations"
    ON public.event_registrations FOR UPDATE
    TO authenticated
    USING (
        (auth.jwt() ->> 'email') ILIKE email
        OR (auth.jwt() ->> 'email') ILIKE partner_email
        OR (auth.jwt() ->> 'email') ILIKE registered_by
        OR public.is_super_admin(auth.jwt() ->> 'email')
    )
    WITH CHECK (
        (auth.jwt() ->> 'email') ILIKE email
        OR (auth.jwt() ->> 'email') ILIKE partner_email
        OR (auth.jwt() ->> 'email') ILIKE registered_by
        OR public.is_super_admin(auth.jwt() ->> 'email')
    );

-- Public entry-list view (who's registered for an event) — names only, no
-- contact info, no pay_token.
CREATE OR REPLACE VIEW public.event_registrations_public AS
SELECT
    id, event_id, full_name, partner_name, division, division_id, status,
    payment_status, created_at
FROM public.event_registrations
WHERE status <> 'withdrawn';

GRANT SELECT ON public.event_registrations_public TO anon, authenticated;

-- Anonymous "continue my payment" flow: caller must already have the exact
-- unguessable pay_token (a random UUID) from their own confirmation email/link.
CREATE OR REPLACE FUNCTION public.get_registration_by_pay_token(p_token uuid, p_event_id bigint)
RETURNS SETOF public.event_registrations
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT * FROM public.event_registrations
    WHERE pay_token = p_token AND event_id = p_event_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_registration_by_pay_token(uuid, bigint) TO anon, authenticated;

-- Anonymous "have I already paid?" / "am I already registered?" check by the
-- email the visitor themselves just typed into the form (pre-login).
CREATE OR REPLACE FUNCTION public.check_my_registration(p_event_id bigint, p_email text)
RETURNS TABLE (id uuid, division text, payment_status text, partner_name text, full_name text, email text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT id, division, payment_status, partner_name, full_name, email
    FROM public.event_registrations
    WHERE event_id = p_event_id AND email ILIKE p_email AND status <> 'withdrawn';
$$;

GRANT EXECUTE ON FUNCTION public.check_my_registration(bigint, text) TO anon, authenticated;

-- ============================================================
-- 3. club_members — user_email exposed to anyone; "manage" policy let any
--    signed-up user edit any club's membership, not just their own.
-- ============================================================
DROP POLICY IF EXISTS "Members read own club membership" ON public.club_members;
DROP POLICY IF EXISTS "Authenticated manage club members" ON public.club_members;

CREATE POLICY "Club members visible to own club or admin"
    ON public.club_members FOR SELECT
    TO authenticated
    USING (
        (auth.jwt() ->> 'email') ILIKE user_email
        OR public.is_super_admin(auth.jwt() ->> 'email')
        OR EXISTS (
            SELECT 1 FROM public.club_members cm
            WHERE cm.club_id = club_members.club_id
              AND cm.user_email ILIKE (auth.jwt() ->> 'email')
              AND cm.role IN ('owner', 'admin')
        )
    );

CREATE POLICY "Club members manage own club or admin"
    ON public.club_members FOR ALL
    TO authenticated
    USING (
        (auth.jwt() ->> 'email') ILIKE user_email
        OR public.is_super_admin(auth.jwt() ->> 'email')
        OR EXISTS (
            SELECT 1 FROM public.club_members cm
            WHERE cm.club_id = club_members.club_id
              AND cm.user_email ILIKE (auth.jwt() ->> 'email')
              AND cm.role IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        (auth.jwt() ->> 'email') ILIKE user_email
        OR public.is_super_admin(auth.jwt() ->> 'email')
        OR EXISTS (
            SELECT 1 FROM public.club_members cm
            WHERE cm.club_id = club_members.club_id
              AND cm.user_email ILIKE (auth.jwt() ->> 'email')
              AND cm.role IN ('owner', 'admin')
        )
    );

-- Public "N members" counts on club pages — no email exposed.
CREATE OR REPLACE VIEW public.club_members_public AS
SELECT id, club_id, role, player_id, created_at
FROM public.club_members;

GRANT SELECT ON public.club_members_public TO anon, authenticated;

-- ============================================================
-- 4. club_claim_requests — full_name/email/phone of club-claim applicants
-- ============================================================
DROP POLICY IF EXISTS "Public read club claim requests" ON public.club_claim_requests;
DROP POLICY IF EXISTS "Authenticated manage club claim requests" ON public.club_claim_requests;

CREATE POLICY "Requesters read own claim requests or admin"
    ON public.club_claim_requests FOR SELECT
    TO authenticated
    USING (
        (auth.jwt() ->> 'email') ILIKE requester_email
        OR public.is_super_admin(auth.jwt() ->> 'email')
    );

CREATE POLICY "Requesters insert own claim requests"
    ON public.club_claim_requests FOR INSERT
    TO authenticated
    WITH CHECK (
        (auth.jwt() ->> 'email') ILIKE requester_email
        OR public.is_super_admin(auth.jwt() ->> 'email')
    );

CREATE POLICY "Admins update or delete claim requests"
    ON public.club_claim_requests FOR UPDATE
    TO authenticated
    USING (public.is_super_admin(auth.jwt() ->> 'email'))
    WITH CHECK (public.is_super_admin(auth.jwt() ->> 'email'));

CREATE POLICY "Admins delete claim requests"
    ON public.club_claim_requests FOR DELETE
    TO authenticated
    USING (public.is_super_admin(auth.jwt() ->> 'email'));

-- ============================================================
-- 5. club_claim_invites — email + bearer token exposed to anyone
-- ============================================================
DROP POLICY IF EXISTS "Allow public read by token" ON public.club_claim_invites;
-- "Authenticated users can read/update their own invites" and "Authenticated
-- users can insert invites" were already correctly scoped — kept as-is.

-- Anonymous pre-login lookup by the exact unguessable token from the email link.
CREATE OR REPLACE FUNCTION public.get_club_claim_invite_by_token(p_token uuid)
RETURNS TABLE (
    id uuid, club_id uuid, email text, status text, created_at timestamptz,
    club_name text, club_short_name text, club_logo_url text, club_city text, club_status text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT i.id, i.club_id, i.email, i.status, i.created_at,
           c.name, c.short_name, c.logo_url, c.city, c.status
    FROM public.club_claim_invites i
    JOIN public.clubs c ON c.id = i.club_id
    WHERE i.token = p_token;
$$;

GRANT EXECUTE ON FUNCTION public.get_club_claim_invite_by_token(uuid) TO anon, authenticated;

-- ============================================================
-- 6. tournament_participants — full_name/email exposed; "admin" policy
--    open to everyone including anon.
-- ============================================================
DROP POLICY IF EXISTS "Public can view participants" ON public.tournament_participants;
DROP POLICY IF EXISTS "Admins have full access to participants" ON public.tournament_participants;

CREATE POLICY "Admins manage participants"
    ON public.tournament_participants FOR ALL
    TO authenticated
    USING (public.is_super_admin(auth.jwt() ->> 'email'))
    WITH CHECK (public.is_super_admin(auth.jwt() ->> 'email'));

CREATE POLICY "Authenticated read own participant rows"
    ON public.tournament_participants FOR SELECT
    TO authenticated
    USING ((auth.jwt() ->> 'email') ILIKE email);

-- Public draws/entry-list view — names only, no email.
CREATE OR REPLACE VIEW public.tournament_participants_public AS
SELECT id, event_id, rankedin_participant_id, full_name, class_name, profile_id, is_paid
FROM public.tournament_participants;

GRANT SELECT ON public.tournament_participants_public TO anon, authenticated;

-- Anonymous "have I already paid?" check by self-entered email (pre-login).
CREATE OR REPLACE FUNCTION public.check_my_participant_entry(p_event_id bigint, p_email text)
RETURNS TABLE (id uuid, class_name text, is_paid boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT id, class_name, is_paid
    FROM public.tournament_participants
    WHERE event_id = p_event_id AND email ILIKE p_email;
$$;

GRANT EXECUTE ON FUNCTION public.check_my_participant_entry(bigint, text) TO anon, authenticated;

-- ============================================================
-- 7. payments — financial records; the "admin" policy was open to `public`
--    (including anon), not even restricted to authenticated. Anyone could
--    have read OR written OR deleted any payment record.
-- ============================================================
DROP POLICY IF EXISTS "Public can view own payments" ON public.payments;
DROP POLICY IF EXISTS "Admins have full access to payments" ON public.payments;

CREATE POLICY "Admins manage payments"
    ON public.payments FOR ALL
    TO authenticated
    USING (public.is_super_admin(auth.jwt() ->> 'email'))
    WITH CHECK (public.is_super_admin(auth.jwt() ->> 'email'));

CREATE POLICY "Authenticated read own payments"
    ON public.payments FOR SELECT
    TO authenticated
    USING (
        player_id IN (SELECT id FROM public.players WHERE email ILIKE (auth.jwt() ->> 'email'))
        OR (metadata ->> 'email') ILIKE (auth.jwt() ->> 'email')
    );
