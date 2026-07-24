-- Clubs module: extend thin clubs lookup into full profiles + members + org links

-- Ensure base table exists (idempotent for environments that already have it)
CREATE TABLE IF NOT EXISTS public.clubs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL
);

-- Identity / publishing
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS short_name TEXT;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS sapa_registered BOOLEAN NOT NULL DEFAULT false;

-- Branding
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS brand_color TEXT;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS about TEXT;

-- Location / contact
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS website_url TEXT;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;

-- JSONB content
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS socials JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS contacts JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS opening_hours JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS courts JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS services JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS cafe JSONB;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS sponsors JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS principal_sponsor JSONB;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS gallery JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS stats JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Ecosystem
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS federation_id UUID REFERENCES public.federations(id) ON DELETE SET NULL;

ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Status check (ignore if already present)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'clubs_status_check'
    ) THEN
        ALTER TABLE public.clubs
            ADD CONSTRAINT clubs_status_check
            CHECK (status IN ('draft', 'published', 'archived'));
    END IF;
END $$;

-- Drop unique index/constraint first so backfill can assign collision-safe slugs in one pass
-- (re-runs / partial applies often already have this from a failed attempt)
ALTER TABLE public.clubs DROP CONSTRAINT IF EXISTS clubs_slug_unique;
DROP INDEX IF EXISTS public.clubs_slug_unique;

-- Backfill + dedupe: keep first club on a base slug; append short id for collisions
WITH prepared AS (
    SELECT
        id,
        COALESCE(
            NULLIF(btrim(slug), ''),
            NULLIF(
                trim(both '-' FROM lower(regexp_replace(coalesce(name, 'club'), '[^a-zA-Z0-9]+', '-', 'g'))),
                ''
            ),
            'club'
        ) AS base_slug
    FROM public.clubs
),
ranked AS (
    SELECT
        id,
        base_slug,
        ROW_NUMBER() OVER (PARTITION BY base_slug ORDER BY id) AS rn
    FROM prepared
)
UPDATE public.clubs c
SET slug = CASE
    WHEN r.rn = 1 THEN r.base_slug
    ELSE r.base_slug || '-' || substr(replace(c.id::text, '-', ''), 1, 8)
END
FROM ranked r
WHERE c.id = r.id
  AND (c.slug IS DISTINCT FROM CASE
      WHEN r.rn = 1 THEN r.base_slug
      ELSE r.base_slug || '-' || substr(replace(c.id::text, '-', ''), 1, 8)
  END);

CREATE UNIQUE INDEX IF NOT EXISTS clubs_slug_unique ON public.clubs (slug) WHERE slug IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.club_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    player_id BIGINT REFERENCES public.players(id) ON DELETE SET NULL,
    user_email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('owner', 'admin', 'staff')),
    added_by BIGINT REFERENCES public.players(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (club_id, user_email)
);

CREATE INDEX IF NOT EXISTS club_members_club_id_idx ON public.club_members (club_id);
CREATE INDEX IF NOT EXISTS club_members_email_idx ON public.club_members (lower(user_email));

CREATE TABLE IF NOT EXISTS public.club_organisations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    organisation_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (club_id, organisation_id)
);

CREATE INDEX IF NOT EXISTS club_organisations_club_id_idx ON public.club_organisations (club_id);
CREATE INDEX IF NOT EXISTS club_organisations_org_id_idx ON public.club_organisations (organisation_id);

-- RLS
ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_organisations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read published clubs" ON public.clubs;
CREATE POLICY "Public read published clubs"
    ON public.clubs FOR SELECT
    USING (true);

-- Practical write access: authenticated users (app enforces admin UI);
-- tighten later with JWT claims if needed.
DROP POLICY IF EXISTS "Authenticated manage clubs" ON public.clubs;
CREATE POLICY "Authenticated manage clubs"
    ON public.clubs FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Public read club organisations" ON public.club_organisations;
CREATE POLICY "Public read club organisations"
    ON public.club_organisations FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Authenticated manage club organisations" ON public.club_organisations;
CREATE POLICY "Authenticated manage club organisations"
    ON public.club_organisations FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Members read own club membership" ON public.club_members;
CREATE POLICY "Members read own club membership"
    ON public.club_members FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Authenticated manage club members" ON public.club_members;
CREATE POLICY "Authenticated manage club members"
    ON public.club_members FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);
