-- Existing public-view shapes from the catalog, no hosted data.
create extension if not exists pgcrypto;
create view public.club_members_public as  SELECT id,
    club_id,
    role,
    player_id,
    created_at
   FROM club_members;;
create view public.tournament_participants_public as  SELECT id,
    event_id,
    rankedin_participant_id,
    full_name,
    class_name,
    profile_id,
    is_paid
   FROM tournament_participants;;
create view public.event_registrations_public as  SELECT id,
    event_id,
    full_name,
    partner_name,
    division,
    division_id,
    status,
    payment_status,
    created_at,
        CASE
            WHEN (NULLIF(email, ''::text) IS NOT NULL) THEN encode(digest(lower(email), 'sha256'::text), 'hex'::text)
            ELSE NULL::text
        END AS email_hash,
        CASE
            WHEN (NULLIF(partner_email, ''::text) IS NOT NULL) THEN encode(digest(lower(partner_email), 'sha256'::text), 'hex'::text)
            ELSE NULL::text
        END AS partner_email_hash,
        CASE
            WHEN (NULLIF(registered_by, ''::text) IS NOT NULL) THEN encode(digest(lower(registered_by), 'sha256'::text), 'hex'::text)
            ELSE NULL::text
        END AS registered_by_hash
   FROM event_registrations
  WHERE (status <> 'withdrawn'::text);;
create view public.players_public as  SELECT id,
    name,
    rank_label,
    points,
    win_rate,
    image_url,
    created_at,
    home_club,
    age_group,
    nationality,
    category,
    level,
    bio,
    sponsors,
    gender,
    approved,
    skill_rating,
    age,
    match_form,
    rankings,
    rankedin_profile_url,
    rankedin_id,
    instagram_link,
    license_type,
    preferred_ranking,
    active_ranking_label,
    region,
    racket_brand,
    additional_images,
    club_id,
    account_type,
    court_side,
    playing_hand
   FROM players
  WHERE (approved = true);;
create table public.temporary_licenses(player_id bigint,event_id bigint,revoked_at timestamptz);
-- License entitlement pricing/finalization is covered in the separate real license suites.
-- These display-only helpers are stand-ins for this lookup projection test.
create function public.license_today() returns date language sql as $$select current_date$$;
create function public.has_full_license(bigint,integer) returns boolean language sql as $$select false$$;
