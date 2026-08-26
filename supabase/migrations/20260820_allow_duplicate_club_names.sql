-- Club display names are not identifiers. Different venues/branches can share
-- a trading name; public routing is protected by clubs_slug_unique and Google
-- listings are protected by clubs_google_place_id_unique.
ALTER TABLE public.clubs DROP CONSTRAINT IF EXISTS clubs_name_key;

-- Some environments may have implemented the old rule as a standalone index.
DROP INDEX IF EXISTS public.clubs_name_key;
