-- Shirt-size collection does not enable logo uploads automatically.
ALTER TABLE public.calendar
    ADD COLUMN IF NOT EXISTS allow_tshirt_logo_upload BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.calendar.allow_tshirt_logo_upload IS
    'Show optional player and partner T-shirt logo uploads during registration.';
