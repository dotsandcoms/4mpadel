-- Two smaller findings from the full RLS sweep, both low severity (no
-- privilege escalation possible either way — see commit message) but
-- worth closing for defense in depth.

-- club_claim_requests: INSERT didn't force status='pending', so a
-- requester could set status to anything, letting them hide their own
-- request from the admin review queue (ClubManager's loadPendingClaims
-- filters status='pending'). Not exploitable for privilege escalation —
-- approval always re-runs the actual club_members grant through an
-- admin-gated, RLS-protected action regardless of this table's status
-- value — just closes the gap. Both existing insert call sites
-- (RegisterClubForm.jsx, ClubCreateWizard.jsx) already send
-- status: 'pending' explicitly, so this is a no-op for legitimate use.
DROP POLICY IF EXISTS "Requesters insert own claim requests" ON public.club_claim_requests;
CREATE POLICY "Requesters insert own claim requests"
    ON public.club_claim_requests FOR INSERT TO authenticated
    WITH CHECK (
        is_super_admin((auth.jwt() ->> 'email'))
        OR ((auth.jwt() ->> 'email') ILIKE requester_email AND status = 'pending')
    );

-- events: "Admins can insert events." was misleadingly named -- its
-- with_check only required auth.role()='authenticated', so any signed-up
-- user could insert rows via direct API access. No public-facing UI
-- exercises this (only admin/PlayerManager.jsx, admin/TournamentManager.jsx
-- do), but the RLS gap itself was real.
DROP POLICY IF EXISTS "Admins can insert events." ON public.events;
CREATE POLICY "Admins can insert events."
    ON public.events FOR INSERT TO authenticated
    WITH CHECK (is_super_admin((auth.jwt() ->> 'email')));
