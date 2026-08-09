-- Full RLS sweep across every table (prompted by "are you confident
-- there are no more RLS/data issues") turned up two further problems from
-- the original 20260807 lockdown, both fixed here:
--
-- 1. Recursive policy: club_members' own USING/WITH CHECK clauses queried
--    club_members again (to check "is caller an owner/admin of this
--    club"), which Postgres correctly rejects as infinite recursion for
--    any query that actually needs that branch (a real owner/admin
--    managing their own club's members) -- confirmed via a simulated
--    authenticated SELECT raising 42P17 in production. Fixed by moving
--    the self-referencing check into a SECURITY DEFINER helper, which
--    breaks the recursion the same way is_super_admin() already does.
--
-- 2. CRITICAL: club_members' "own row" WITH CHECK let a user self-insert
--    with ANY role value, including 'owner' -- i.e. any authenticated
--    user (self-signup, no approval) could grant themselves ownership of
--    any club with zero prior relationship to it. Confirmed exploitable
--    via a simulated authenticated INSERT that succeeded (rolled back,
--    no real data touched). Fixed by restricting self-service writes to
--    role='member'; elevation to owner/admin now requires an existing
--    owner/admin of that club, a super admin, or the new
--    accept_club_claim_invite RPC below.
--
--    club_claim_invites' INSERT policy was also too broad (any
--    authenticated user, not just admins, could create an invite for any
--    club/email/status) -- restricted to admins, matching the only real
--    call site (ClubManager.jsx, admin-only). And the client-side accept
--    flow never verified the accepting session's email matched the
--    invite's target email at all, so even a legitimately admin-issued
--    invite could be accepted by anyone who obtained the link -- the new
--    RPC checks this before granting anything.

CREATE OR REPLACE FUNCTION public.is_club_owner_or_admin(p_club_id uuid, p_email text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.club_members cm
        WHERE cm.club_id = p_club_id
          AND cm.user_email ILIKE p_email
          AND cm.role = ANY (ARRAY['owner', 'admin'])
    );
$$;

DROP POLICY IF EXISTS "Club members manage own club or admin" ON public.club_members;
DROP POLICY IF EXISTS "Club members visible to own club or admin" ON public.club_members;

CREATE POLICY "Club members manage own club or admin"
    ON public.club_members FOR ALL TO authenticated
    USING (
        (auth.jwt() ->> 'email') ILIKE user_email
        OR is_super_admin((auth.jwt() ->> 'email'))
        OR is_club_owner_or_admin(club_id, (auth.jwt() ->> 'email'))
    )
    WITH CHECK (
        is_super_admin((auth.jwt() ->> 'email'))
        OR is_club_owner_or_admin(club_id, (auth.jwt() ->> 'email'))
        OR ((auth.jwt() ->> 'email') ILIKE user_email AND role = 'member')
    );

CREATE POLICY "Club members visible to own club or admin"
    ON public.club_members FOR SELECT TO authenticated
    USING (
        (auth.jwt() ->> 'email') ILIKE user_email
        OR is_super_admin((auth.jwt() ->> 'email'))
        OR is_club_owner_or_admin(club_id, (auth.jwt() ->> 'email'))
    );

DROP POLICY IF EXISTS "Authenticated users can insert invites" ON public.club_claim_invites;

CREATE POLICY "Admins insert club claim invites"
    ON public.club_claim_invites FOR INSERT TO authenticated
    WITH CHECK (is_super_admin((auth.jwt() ->> 'email')));

CREATE OR REPLACE FUNCTION public.accept_club_claim_invite(p_token uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invite record;
    v_caller_email text := auth.jwt() ->> 'email';
    v_player_id bigint;
BEGIN
    IF v_caller_email IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT * INTO v_invite FROM public.club_claim_invites WHERE token = p_token;
    IF v_invite IS NULL THEN
        RAISE EXCEPTION 'Invite not found';
    END IF;
    IF v_invite.status <> 'pending' THEN
        RAISE EXCEPTION 'This invite has already been %', v_invite.status;
    END IF;
    IF lower(v_invite.email) <> lower(v_caller_email) THEN
        RAISE EXCEPTION 'This invite was not issued to your account';
    END IF;

    SELECT id INTO v_player_id FROM public.players WHERE email ILIKE v_caller_email LIMIT 1;
    IF v_player_id IS NULL THEN
        RAISE EXCEPTION 'PROFILE_REQUIRED';
    END IF;

    INSERT INTO public.club_members (club_id, player_id, user_email, role)
    VALUES (v_invite.club_id, v_player_id, v_caller_email, 'owner')
    ON CONFLICT (club_id, user_email) DO UPDATE SET role = 'owner';

    UPDATE public.clubs SET status = 'published', verified = true
    WHERE id = v_invite.club_id AND status IN ('unclaimed', 'draft', 'archived');

    UPDATE public.club_claim_invites SET status = 'accepted', accepted_at = now()
    WHERE id = v_invite.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_club_claim_invite(uuid) TO authenticated;
