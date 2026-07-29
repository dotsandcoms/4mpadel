-- Club claim invites: allow admins to invite someone to claim a club via email
CREATE TABLE IF NOT EXISTS public.club_claim_invites (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id     uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    email       text NOT NULL,
    token       uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    status      text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
    invited_by  uuid REFERENCES auth.users(id),
    created_at  timestamptz NOT NULL DEFAULT now(),
    accepted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_club_claim_invites_token ON public.club_claim_invites(token);
CREATE INDEX IF NOT EXISTS idx_club_claim_invites_email ON public.club_claim_invites(email);
CREATE INDEX IF NOT EXISTS idx_club_claim_invites_club  ON public.club_claim_invites(club_id);

ALTER TABLE public.club_claim_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read their own invites"
    ON public.club_claim_invites FOR SELECT
    USING (lower(email) = lower(auth.email()) OR invited_by = auth.uid());

CREATE POLICY "Authenticated users can update their own invites"
    ON public.club_claim_invites FOR UPDATE
    USING (lower(email) = lower(auth.email()));

CREATE POLICY "Authenticated users can insert invites"
    ON public.club_claim_invites FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow public read by token"
    ON public.club_claim_invites FOR SELECT
    USING (true);
