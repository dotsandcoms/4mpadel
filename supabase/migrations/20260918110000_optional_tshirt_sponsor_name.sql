-- Sponsor names are independent of shirt sizes and logo uploads.
ALTER TABLE public.calendar
    ADD COLUMN IF NOT EXISTS allow_tshirt_sponsor_name BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.calendar.allow_tshirt_sponsor_name IS
    'Show optional player and partner T-shirt sponsor name fields during registration.';
