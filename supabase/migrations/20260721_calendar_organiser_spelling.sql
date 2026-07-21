-- British spelling for calendar organiser identity columns.
-- Idempotent: only renames when the American-spelled column still exists.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'calendar' AND column_name = 'organizer_name'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'calendar' AND column_name = 'organiser_name'
    ) THEN
        ALTER TABLE public.calendar RENAME COLUMN organizer_name TO organiser_name;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'calendar' AND column_name = 'organizer_logo_url'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'calendar' AND column_name = 'organiser_logo_url'
    ) THEN
        ALTER TABLE public.calendar RENAME COLUMN organizer_logo_url TO organiser_logo_url;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'calendar' AND column_name = 'organizer_phone'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'calendar' AND column_name = 'organiser_phone'
    ) THEN
        ALTER TABLE public.calendar RENAME COLUMN organizer_phone TO organiser_phone;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'calendar' AND column_name = 'organizer_email'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'calendar' AND column_name = 'organiser_email'
    ) THEN
        ALTER TABLE public.calendar RENAME COLUMN organizer_email TO organiser_email;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'calendar' AND column_name = 'organizer_website'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'calendar' AND column_name = 'organiser_website'
    ) THEN
        ALTER TABLE public.calendar RENAME COLUMN organizer_website TO organiser_website;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'calendar' AND column_name = 'organizer_badge_text'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'calendar' AND column_name = 'organiser_badge_text'
    ) THEN
        ALTER TABLE public.calendar RENAME COLUMN organizer_badge_text TO organiser_badge_text;
    END IF;
END $$;
