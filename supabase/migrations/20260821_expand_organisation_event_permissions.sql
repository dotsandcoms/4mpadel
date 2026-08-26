-- Expand organisation access to the current British-spelling schema and make
-- club-linked event ownership explicit. UI visibility is not authorization;
-- these helpers/policies are the database source of truth.

ALTER TABLE public.calendar
    ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES public.clubs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS calendar_club_id_idx ON public.calendar (club_id);

CREATE OR REPLACE FUNCTION public.is_organisation_member(p_organisation_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.organisation_members om
        WHERE om.organisation_id = p_organisation_id
          AND om.user_email ILIKE (auth.jwt() ->> 'email')
    );
$$;

CREATE OR REPLACE FUNCTION public.is_organisation_admin(p_organisation_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.organisation_members om
        WHERE om.organisation_id = p_organisation_id
          AND om.user_email ILIKE (auth.jwt() ->> 'email')
          AND om.role IN ('owner', 'admin')
    );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_club(p_club_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT p_club_id IS NOT NULL AND (
        EXISTS (
            SELECT 1 FROM public.club_members cm
            WHERE cm.club_id = p_club_id
              AND cm.user_email ILIKE (auth.jwt() ->> 'email')
              AND cm.role IN ('owner', 'admin')
        )
        OR EXISTS (
            SELECT 1
            FROM public.club_organisations co
            JOIN public.organisation_members om
              ON om.organisation_id = co.organisation_id
            WHERE co.club_id = p_club_id
              AND om.user_email ILIKE (auth.jwt() ->> 'email')
              AND om.role IN ('owner', 'admin')
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_calendar_event(
    p_organisation_id UUID,
    p_club_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        (p_organisation_id IS NOT NULL AND public.is_organisation_admin(p_organisation_id))
        OR (p_club_id IS NOT NULL AND public.can_manage_club(p_club_id));
$$;

GRANT EXECUTE ON FUNCTION public.is_organisation_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_organisation_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_club(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_calendar_event(UUID, UUID) TO authenticated;

ALTER TABLE public.organisation_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read organisation memberships" ON public.organisation_members;
CREATE POLICY "Members read organisation memberships"
ON public.organisation_members FOR SELECT
TO authenticated
USING (
    public.is_organisation_member(organisation_id)
    OR public.is_super_admin()
);

DROP POLICY IF EXISTS "Organisation admins manage members" ON public.organisation_members;
CREATE POLICY "Organisation admins manage members"
ON public.organisation_members FOR ALL
TO authenticated
USING (
    public.is_organisation_admin(organisation_id)
    OR public.is_super_admin()
)
WITH CHECK (
    public.is_organisation_admin(organisation_id)
    OR public.is_super_admin()
);

DROP POLICY IF EXISTS "Organisation members read own organisation" ON public.organisations;
CREATE POLICY "Organisation members read own organisation"
ON public.organisations FOR SELECT
TO authenticated
USING (public.is_organisation_member(id) OR public.is_super_admin());

DROP POLICY IF EXISTS "Organisation admins update own organisation" ON public.organisations;
CREATE POLICY "Organisation admins update own organisation"
ON public.organisations FOR UPDATE
TO authenticated
USING (public.is_organisation_admin(id) OR public.is_super_admin())
WITH CHECK (public.is_organisation_admin(id) OR public.is_super_admin());

-- Backfill an explicit club link from the legacy venue strings. Prefer the
-- longest matching club name and accept either an exact venue or a name
-- followed by an address. Direct organisation ownership remains authoritative.
UPDATE public.calendar event
SET club_id = (
    SELECT club.id AS club_id
    FROM public.clubs club
    WHERE
        lower(btrim(event.venue)) = lower(btrim(club.name))
        OR lower(btrim(event.venue)) = lower(btrim(COALESCE(club.short_name, '')))
        OR lower(btrim(event.venue)) LIKE lower(btrim(club.name)) || ',%'
        OR (
            NULLIF(btrim(club.short_name), '') IS NOT NULL
            AND lower(btrim(event.venue)) LIKE lower(btrim(club.short_name)) || ',%'
        )
    ORDER BY GREATEST(length(club.name), length(COALESCE(club.short_name, ''))) DESC
    LIMIT 1
)
WHERE event.club_id IS NULL
  AND EXISTS (
      SELECT 1
      FROM public.clubs club
      WHERE
          lower(btrim(event.venue)) = lower(btrim(club.name))
          OR lower(btrim(event.venue)) = lower(btrim(COALESCE(club.short_name, '')))
          OR lower(btrim(event.venue)) LIKE lower(btrim(club.name)) || ',%'
          OR (
              NULLIF(btrim(club.short_name), '') IS NOT NULL
              AND lower(btrim(event.venue)) LIKE lower(btrim(club.short_name)) || ',%'
          )
  );

CREATE OR REPLACE FUNCTION public.assign_calendar_club_from_venue()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.club_id IS NULL AND NULLIF(btrim(NEW.venue), '') IS NOT NULL THEN
        SELECT club.id INTO NEW.club_id
        FROM public.clubs club
        WHERE
            lower(btrim(NEW.venue)) = lower(btrim(club.name))
            OR lower(btrim(NEW.venue)) = lower(btrim(COALESCE(club.short_name, '')))
            OR lower(btrim(NEW.venue)) LIKE lower(btrim(club.name)) || ',%'
            OR (
                NULLIF(btrim(club.short_name), '') IS NOT NULL
                AND lower(btrim(NEW.venue)) LIKE lower(btrim(club.short_name)) || ',%'
            )
        ORDER BY GREATEST(length(club.name), length(COALESCE(club.short_name, ''))) DESC
        LIMIT 1;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_calendar_club_from_venue ON public.calendar;
CREATE TRIGGER trg_assign_calendar_club_from_venue
BEFORE INSERT OR UPDATE OF venue, club_id ON public.calendar
FOR EACH ROW EXECUTE FUNCTION public.assign_calendar_club_from_venue();

DROP POLICY IF EXISTS "Organisation and club admins update managed events" ON public.calendar;
CREATE POLICY "Organisation and club admins update managed events"
ON public.calendar FOR UPDATE
TO authenticated
USING (
    public.can_manage_calendar_event(organisation_id, club_id)
    OR public.is_super_admin()
)
WITH CHECK (
    public.can_manage_calendar_event(organisation_id, club_id)
    OR public.is_super_admin()
);

DROP POLICY IF EXISTS "Organisation admins insert managed events" ON public.calendar;
CREATE POLICY "Organisation admins insert managed events"
ON public.calendar FOR INSERT
TO authenticated
WITH CHECK (
    public.can_manage_calendar_event(organisation_id, club_id)
    OR public.is_super_admin()
);
