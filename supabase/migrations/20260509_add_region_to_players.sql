-- Add region column to players table
ALTER TABLE players ADD COLUMN IF NOT EXISTS region TEXT;

-- Update the create_player_profile RPC to include the region parameter and other missing fields
CREATE OR REPLACE FUNCTION public.create_player_profile(
    p_email text, 
    p_name text, 
    p_contact text, 
    p_category text,
    p_gender text DEFAULT NULL,
    p_nationality text DEFAULT NULL,
    p_id_number text DEFAULT NULL,
    p_bio text DEFAULT NULL,
    p_home_club text DEFAULT NULL,
    p_sponsors text DEFAULT NULL,
    p_region text DEFAULT NULL,
    p_instagram_link text DEFAULT NULL,
    p_paid_registration boolean DEFAULT false,
    p_license_type text DEFAULT 'none',
    p_image_url text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM players WHERE email = p_email) THEN
        INSERT INTO players (
            email, 
            name, 
            contact_number, 
            approved, 
            category, 
            gender,
            nationality,
            id_number,
            bio,
            home_club,
            sponsors,
            region,
            instagram_link,
            paid_registration,
            license_type,
            image_url
        )
        VALUES (
            p_email, 
            p_name, 
            p_contact, 
            true, 
            p_category, 
            p_gender,
            p_nationality,
            p_id_number,
            p_bio,
            p_home_club,
            p_sponsors,
            p_region,
            p_instagram_link,
            p_paid_registration,
            p_license_type,
            p_image_url
        );
    END IF;
END;
$$;

-- Grant execution to authenticated and anonymous users
GRANT EXECUTE ON FUNCTION public.create_player_profile(text, text, text, text, text, text, text, text, text, text, text, text, boolean, text, text) TO authenticated, anon;
