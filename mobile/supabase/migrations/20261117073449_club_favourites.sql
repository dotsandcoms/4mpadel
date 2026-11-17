-- Private account favourites; club membership and club permissions are unchanged.
CREATE TABLE public.club_favourites (
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, club_id)
);
CREATE INDEX club_favourites_club_id_idx ON public.club_favourites (club_id);

ALTER TABLE public.club_favourites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.club_favourites FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.club_favourites TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.club_favourites TO service_role;

CREATE POLICY "Read own club favourites" ON public.club_favourites
FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Save published clubs" ON public.club_favourites
FOR INSERT TO authenticated WITH CHECK (
    (SELECT auth.uid()) = user_id AND EXISTS (
        SELECT 1 FROM public.clubs c WHERE c.id = club_id
        AND c.status IN ('published', '4m_approved', '4m_premium')
    )
);
CREATE POLICY "Remove own club favourites" ON public.club_favourites
FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY account_must_exist ON public.club_favourites AS RESTRICTIVE
FOR ALL TO authenticated USING ((SELECT public.account_is_active()))
WITH CHECK ((SELECT public.account_is_active()));
