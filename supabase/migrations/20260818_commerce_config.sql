-- ============================================================
-- Platform commerce config: license availability, prices, and
-- optional percentage fees charged on licenses and/or event
-- bookings. Single-row table; public read, 4M-admin write.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.commerce_config (
    id TEXT PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
    full_license_enabled BOOLEAN NOT NULL DEFAULT true,
    full_license_price NUMERIC(10, 2) NOT NULL DEFAULT 450 CHECK (full_license_price >= 0),
    temp_license_enabled BOOLEAN NOT NULL DEFAULT true,
    temp_license_price NUMERIC(10, 2) NOT NULL DEFAULT 120 CHECK (temp_license_price >= 0),
    license_fee_percent NUMERIC(6, 3) NOT NULL DEFAULT 0
        CHECK (license_fee_percent >= 0 AND license_fee_percent <= 100),
    event_fee_percent NUMERIC(6, 3) NOT NULL DEFAULT 0
        CHECK (event_fee_percent >= 0 AND event_fee_percent <= 100),
    fee_label TEXT NOT NULL DEFAULT 'Management fee',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_by UUID
);

INSERT INTO public.commerce_config (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.commerce_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read commerce config" ON public.commerce_config;
CREATE POLICY "Public can read commerce config"
ON public.commerce_config FOR SELECT
TO public
USING (true);

DROP POLICY IF EXISTS "4M admins manage commerce config" ON public.commerce_config;
CREATE POLICY "4M admins manage commerce config"
ON public.commerce_config FOR ALL
TO authenticated
USING (public.is_4m_admin())
WITH CHECK (public.is_4m_admin());

GRANT SELECT ON public.commerce_config TO anon, authenticated;
GRANT INSERT, UPDATE ON public.commerce_config TO authenticated;

CREATE OR REPLACE FUNCTION public.touch_commerce_config()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := timezone('utc'::text, now());
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS commerce_config_touch ON public.commerce_config;
CREATE TRIGGER commerce_config_touch
BEFORE UPDATE ON public.commerce_config
FOR EACH ROW
EXECUTE FUNCTION public.touch_commerce_config();
