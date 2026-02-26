-- Create a function to bypass RLS when creating a new player profile during signup
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
    p_sponsors text DEFAULT NULL
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
            paid_registration,
            gender,
            nationality,
            id_number,
            bio,
            home_club,
            sponsors
        )
        VALUES (
            p_email, 
            p_name, 
            p_contact, 
            true, 
            p_category, 
            true,
            p_gender,
            p_nationality,
            p_id_number,
            p_bio,
            p_home_club,
            p_sponsors
        );
    END IF;
END;
$$;

-- Grant execution to authenticated and anonymous users
GRANT EXECUTE ON FUNCTION public.create_player_profile(text, text, text, text, text, text, text, text, text, text) TO authenticated, anon;
