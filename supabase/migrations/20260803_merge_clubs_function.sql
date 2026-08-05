-- Merge two duplicate club records into one: moves players, memberships,
-- org links, claim requests/invites from the source club into the target,
-- de-duplicating against rows the target already has, backfills any empty
-- profile fields on the target from the source, then deletes the source club.

CREATE OR REPLACE FUNCTION public.merge_clubs(p_source_id UUID, p_target_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_source_name TEXT;
    v_target_name TEXT;
    v_players_moved INT;
    v_members_moved INT;
    v_members_skipped INT;
    v_orgs_moved INT;
    v_orgs_skipped INT;
    v_claims_moved INT;
    v_claims_skipped INT;
    v_invites_moved INT;
BEGIN
    IF p_source_id = p_target_id THEN
        RAISE EXCEPTION 'Source and target club cannot be the same';
    END IF;

    SELECT name INTO v_source_name FROM public.clubs WHERE id = p_source_id;
    SELECT name INTO v_target_name FROM public.clubs WHERE id = p_target_id;
    IF v_source_name IS NULL THEN RAISE EXCEPTION 'Source club not found'; END IF;
    IF v_target_name IS NULL THEN RAISE EXCEPTION 'Target club not found'; END IF;

    UPDATE public.players SET club_id = p_target_id WHERE club_id = p_source_id;
    GET DIAGNOSTICS v_players_moved = ROW_COUNT;

    -- club_members: unique (club_id, user_email) — drop source rows that would collide
    DELETE FROM public.club_members s
    WHERE s.club_id = p_source_id
      AND EXISTS (
          SELECT 1 FROM public.club_members t
          WHERE t.club_id = p_target_id AND lower(t.user_email) = lower(s.user_email)
      );
    GET DIAGNOSTICS v_members_skipped = ROW_COUNT;
    UPDATE public.club_members SET club_id = p_target_id WHERE club_id = p_source_id;
    GET DIAGNOSTICS v_members_moved = ROW_COUNT;

    -- club_organisations: unique (club_id, organisation_id)
    DELETE FROM public.club_organisations s
    WHERE s.club_id = p_source_id
      AND EXISTS (
          SELECT 1 FROM public.club_organisations t
          WHERE t.club_id = p_target_id AND t.organisation_id = s.organisation_id
      );
    GET DIAGNOSTICS v_orgs_skipped = ROW_COUNT;
    UPDATE public.club_organisations SET club_id = p_target_id WHERE club_id = p_source_id;
    GET DIAGNOSTICS v_orgs_moved = ROW_COUNT;

    -- club_claim_requests: unique (club_id, lower(email)) WHERE status='pending'
    DELETE FROM public.club_claim_requests s
    WHERE s.club_id = p_source_id
      AND s.status = 'pending'
      AND EXISTS (
          SELECT 1 FROM public.club_claim_requests t
          WHERE t.club_id = p_target_id AND t.status = 'pending'
            AND lower(t.requester_email) = lower(s.requester_email)
      );
    GET DIAGNOSTICS v_claims_skipped = ROW_COUNT;
    UPDATE public.club_claim_requests SET club_id = p_target_id WHERE club_id = p_source_id;
    GET DIAGNOSTICS v_claims_moved = ROW_COUNT;

    -- club_claim_invites: no per-club uniqueness beyond the invite token
    UPDATE public.club_claim_invites SET club_id = p_target_id WHERE club_id = p_source_id;
    GET DIAGNOSTICS v_invites_moved = ROW_COUNT;

    -- club_google_matches: unique (club_id) — target already has its own row, drop source's
    DELETE FROM public.club_google_matches WHERE club_id = p_source_id;

    -- Backfill empty target profile fields from the source before it's discarded
    UPDATE public.clubs t
    SET
        short_name = COALESCE(NULLIF(t.short_name, ''), s.short_name),
        about = COALESCE(NULLIF(t.about, ''), s.about),
        city = COALESCE(NULLIF(t.city, ''), s.city),
        province = COALESCE(NULLIF(t.province, ''), s.province),
        country = COALESCE(NULLIF(t.country, ''), s.country),
        address = COALESCE(NULLIF(t.address, ''), s.address),
        lat = COALESCE(t.lat, s.lat),
        lng = COALESCE(t.lng, s.lng),
        website_url = COALESCE(NULLIF(t.website_url, ''), s.website_url),
        contact_email = COALESCE(NULLIF(t.contact_email, ''), s.contact_email),
        contact_phone = COALESCE(NULLIF(t.contact_phone, ''), s.contact_phone),
        whatsapp_number = COALESCE(NULLIF(t.whatsapp_number, ''), s.whatsapp_number),
        logo_url = COALESCE(NULLIF(t.logo_url, ''), s.logo_url),
        cover_image_url = COALESCE(NULLIF(t.cover_image_url, ''), s.cover_image_url)
    FROM public.clubs s
    WHERE t.id = p_target_id AND s.id = p_source_id;

    DELETE FROM public.clubs WHERE id = p_source_id;

    RETURN jsonb_build_object(
        'source_name', v_source_name,
        'target_name', v_target_name,
        'players_moved', v_players_moved,
        'members_moved', v_members_moved,
        'members_skipped_duplicate', v_members_skipped,
        'orgs_moved', v_orgs_moved,
        'orgs_skipped_duplicate', v_orgs_skipped,
        'claims_moved', v_claims_moved,
        'claims_skipped_duplicate', v_claims_skipped,
        'invites_moved', v_invites_moved
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.merge_clubs(UUID, UUID) TO authenticated;
