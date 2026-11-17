-- Catalog-only reproduction of legacy hosted boundaries. Fictitious rows only.
-- NEVER run against a shared database.
\set ON_ERROR_STOP on
do $$ begin if current_database()<>'fourm_permission_boundary_test' or exists(select 1 from pg_tables where schemaname='public') then raise exception 'Use an empty disposable fourm_permission_boundary_test database'; end if; end $$;
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema private; create schema storage;
create table auth.users(id uuid primary key,email text,deleted_at timestamptz,banned_until timestamptz,is_anonymous boolean default false);
create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
create function auth.email() returns text language sql stable as $$select auth.jwt()->>'email'$$;
create function auth.role() returns text language sql stable as $$select auth.jwt()->>'role'$$;
grant usage on schema public,auth,private,storage to anon,authenticated,service_role;
create table public.admin_sidebar_permissions(email text, role text, allowed_tabs text[], created_at timestamp with time zone, module_permissions jsonb);
create table public.albums(id uuid, title text, description text, cover_image_url text, is_active boolean, created_at timestamp with time zone, updated_at timestamp with time zone, event_id bigint, youtube_playlist_url text, slug text, photographer_name text, photographer_instagram text, album_date timestamp with time zone, is_featured boolean, parent_album_id uuid, organisation_id uuid);
create table public.blogs(id uuid, title text, slug text, category text, author text, content text, status text, views integer, image_url text, date date, created_at timestamp with time zone);
create table public.calendar(id bigint, event_dates text, event_name text, city text, sapa_status text, venue text, created_at timestamp with time zone, description text, start_time time without time zone, end_time time without time zone, address text, organiser_name text, organiser_phone text, organiser_email text, organiser_website text, image_url text, start_date date, slug text, end_date date, featured_event boolean, registered_players integer, rankedin_url text, sponsor_logos text[], is_league boolean, tournament_tag text, featured_result boolean, featured_live boolean, live_youtube_url text, youtube_playlist_url text, is_visible boolean, live_players text, next_match text, custom_image_url text, rankedin_id text, entry_fee numeric(10,2), category_fees jsonb, finance_managed boolean, organisation_id uuid, rejection_notes text, sanction_status text, tournament_type text, registration_deadline timestamp with time zone, golden_point boolean, courts_count integer, allowed_divisions text[], max_teams_capacity integer, partner_requirement text, court_map_link text, tournament_director_name text, tournament_director_contact text, indoor_outdoor text, court_labels text[], prize_money_breakdown text, sponsors_names text[], balls_to_be_used text, licences_required boolean, licence_types text[], max_ranking_points integer, back_draw_options text, event_co_admins text[], additional_notes text, tournament_director_phone text, tournament_director_email text, allow_payments boolean, points integer, is_manual boolean, prize_money_total numeric(12,2), points_breakdown text, sanctioning_details text, rules_regs text, withdrawal_substitution text, balls text, courts text, tournament_director text, referees text, contact_details text, cut_off_times text, draw_released text, registration_closes_at timestamp with time zone, show_in_recent_results boolean, organiser_logo_url text, organiser_badge_text text, is_spotlight boolean, pending_changes jsonb, pending_changes_status text, pending_changes_notes text, pending_changes_submitted_at timestamp with time zone, registration_opens_at timestamp with time zone, allow_temporary_license boolean, license_required_default boolean, entry_fee_notes text, scoring_point text, collect_tshirt_size boolean, poster_image_url text, venues text[], early_bird_ends_at timestamp with time zone, early_bird_fee numeric(10,2), rankings_updated_at timestamp with time zone, organiser_interim_payments jsonb, series_id uuid, is_weekly boolean, weekly_payment_policy text, club_id uuid, event_status text, cancelled_at timestamp with time zone, cancelled_by text, cancellation_reason text, cancellation_refund_status text, payment_method text, payment_bank_name text, payment_account_name text, payment_account_number text, payment_branch_code text, payment_reference_note text, external_payment_url text, player_gift_type text, federation_id uuid, sanction_requested boolean, federation_sanction_status text, default_match_format text, poster_document_url text, organiser_kit_url text, media_gallery_urls jsonb, player_gift_types jsonb, is_quick_event boolean, max_players integer, registration_access text, allow_tshirt_logo_upload boolean, allow_tshirt_sponsor_name boolean, allow_payments_after_close boolean, organiser_settlement_confirmation jsonb);
create table public.club_google_matches(id uuid, club_id uuid, match_status text, review_status text, google_place_id text, google_name text, google_address text, confidence numeric, fill_fields jsonb, meta_fields jsonb, business_status text, conflict_note text, created_at timestamp with time zone, reviewed_at timestamp with time zone);
create table public.club_groups(id uuid, name text, slug text, short_name text, status text, logo_url text, cover_image_url text, brand_color text, about text, website_url text, contact_email text, contact_phone text, whatsapp_number text, socials jsonb, city text, province text, share_logo boolean, share_website boolean, created_at timestamp with time zone, updated_at timestamp with time zone);
create table public.club_members(id uuid, club_id uuid, player_id bigint, user_email text, role text, added_by bigint, created_at timestamp with time zone);
create table public.club_organisations(id uuid, club_id uuid, organisation_id uuid, created_at timestamp with time zone);
create table public.clubs(id uuid, name text, created_at timestamp with time zone, updated_at timestamp with time zone, slug text, short_name text, status text, verified boolean, sapa_registered boolean, logo_url text, cover_image_url text, brand_color text, about text, city text, address text, lat double precision, lng double precision, website_url text, contact_email text, contact_phone text, whatsapp_number text, socials jsonb, contacts jsonb, opening_hours jsonb, courts jsonb, services jsonb, cafe jsonb, sponsors jsonb, principal_sponsor jsonb, gallery jsonb, stats jsonb, federation_id uuid, created_by bigint, rejection_notes text, approved_at timestamp with time zone, approved_by bigint, tagline text, club_type text, affiliation text, province text, country text, google_place_id text, google_maps_url text, google_rating numeric, google_ratings_total integer, google_synced_at timestamp with time zone, group_id uuid);
create table public.coach_applications(id uuid, full_name text, email text, contact_number text, bio text, profile_pic_url text, coaching_location text, instagram_link text, youtube_link text, status text, created_at timestamp with time zone, website_link text, city text, gender text);
create table public.events(id bigint, title text, date date, "time" text, location text, category text, status text, created_at timestamp with time zone, city text, organiser text, sapa_category text, event_number text, venue text);
create table public.gallery_images(id uuid, album_id uuid, image_url text, caption text, sort_order integer, created_at timestamp with time zone, thumbnail_url text);
create table public.organisation_members(id uuid, organisation_id uuid, player_id bigint, user_email text, role text, added_by bigint, created_at timestamp with time zone);
create table public.organisations(id uuid, name text, slug text, contact_email text, contact_phone text, logo_url text, status text, created_by bigint, approved_by bigint, rejection_notes text, created_at timestamp with time zone, approved_at timestamp with time zone, website_url text, cover_image_url text, about text, org_type text, coverage text, year_established integer, whatsapp_number text, socials jsonb, contacts jsonb, brand_color text, verified boolean, sapa_sanctioned boolean, sponsors jsonb, short_name text, linked_status text, linked_club_name text, sapa_intent text, federation_id uuid, payment_bank_name text, payment_account_name text, payment_account_number text, payment_branch_code text, payment_reference_note text);
create table public.player_matches(id uuid, rankedin_id character varying, upcoming_matches jsonb, past_matches jsonb, updated_at timestamp with time zone, upcoming_matches_updated_at timestamp with time zone, past_matches_updated_at timestamp with time zone);
create table public.players(id bigint, name text, rank_label text, points integer, win_rate text, image_url text, created_at timestamp with time zone, home_club text, age_group text, nationality text, category text, level text, bio text, sponsors text, contact_number text, email text, gender text, approved boolean, paid_registration boolean, skill_rating numeric, age integer, match_form text, rankings jsonb, rankedin_profile_url text, rankedin_id text, id_number text, instagram_link text, last_login timestamp with time zone, license_type text, preferred_ranking text, active_ranking_label text, region text, racket_brand text, additional_images jsonb, club_id uuid, account_type text, signup_source text, signup_device jsonb, notification_prefs jsonb, last_app_device jsonb, last_app_at timestamp with time zone, court_side text, playing_hand text);
create table public.rankedin_cache(id bigint, url text, payload jsonb, created_at timestamp with time zone, updated_at timestamp with time zone);
create table public.rankedin_results_cache(id uuid, event_id bigint, rankedin_id character varying(255), classes jsonb, winners jsonb, has_draw boolean, has_results boolean, upcoming_matches jsonb, last_synced_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone);
create table public.ranking_history(id uuid, player_id bigint, event_id bigint, division_id uuid, points_earned integer, reason text, created_at timestamp with time zone);
create table public.ranking_points_config(id uuid, tier text, category text, points_winner integer, points_finalist integer, points_semis integer, points_qf integer, points_r16_9th integer, points_r16_10th integer, points_r16_11_12 integer, points_r16_13_16 integer, points_r32_17th_plus integer, created_at timestamp with time zone);
create table public.settings(key text, value text, updated_at timestamp with time zone);
create table public.tournament_divisions(id uuid, event_id bigint, name text, max_seeding_points integer, max_teams integer, match_format text, scoring_format text, draw_type text, has_plate boolean, created_at timestamp with time zone, entry_fee numeric(10,2), format text, entries_close_at timestamp with time zone, license_required boolean, age_category text, gender text, sort_order integer, is_active boolean, details text, suggested_level text, entry_limit integer, scoring_point text, rankedin_class_id text, ranking_tier_id uuid, ranking_category smallint, seeding_ranking_source text, cancelled_at timestamp with time zone, cancelled_by text, cancellation_reason text, cancellation_refund_status text);
create table public.tournament_draws(id uuid, division_id uuid, name text, type text, metadata jsonb, created_at timestamp with time zone);
create table public.tournament_matches(id uuid, division_id uuid, draw_id uuid, round_name text, match_index integer, team_1_reg_id uuid, team_2_reg_id uuid, score text, winner_reg_id uuid, status text, scheduled_time timestamp with time zone, court_name text, duration_minutes integer, notes text, created_at timestamp with time zone);
create table public.tournament_participants(id uuid, event_id bigint, rankedin_participant_id text, full_name text, class_name text, profile_id bigint, is_paid boolean, last_synced_at timestamp with time zone, metadata jsonb, is_test boolean, email text, whatsapp_added boolean);
create table public.whatsapp_queue(id uuid, recipient_phone text, template_name text, variables jsonb, status text, error_message text, created_at timestamp with time zone, processed_at timestamp with time zone);
create table storage.objects(id uuid,bucket_id text,name text,owner_id text);
create table public.push_deliveries(id uuid);
create table public.event_notification_follows(id uuid);
create table public.tournament_notification_jobs(id uuid);
create table public.notification_event_snapshots(id uuid);
create table public.notification_match_snapshots(id uuid);
create table public.player_devices(id uuid);
create table public.player_push_tokens(id uuid);
create table public.event_activity_log(id uuid);
grant select,insert,update,delete on all tables in schema public,storage to anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.account_is_active()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select exists (select 1 from auth.users u where u.id = (select auth.uid()) and u.deleted_at is null) $function$;
CREATE OR REPLACE FUNCTION public.is_super_admin(user_email text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
    IF user_email IN (
        'brad@dotsandcoms.co.za',
        'bradein@dotsandcoms.co.za',
        'admin@4mpadel.co.za',
        'markstillerman@gmail.com'
    ) THEN
        RETURN true;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM public.admin_sidebar_permissions
        WHERE email = user_email AND role = 'super_admin'
    );
END;
$function$;
CREATE OR REPLACE FUNCTION public.is_organisation_admin(p_organisation_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT EXISTS (
        SELECT 1 FROM public.organisation_members om
        WHERE om.organisation_id = p_organisation_id
          AND om.user_email ILIKE (auth.jwt() ->> 'email')
          AND om.role IN ('owner', 'admin')
    );
$function$;
CREATE OR REPLACE FUNCTION public.can_manage_club(p_club_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT p_club_id IS NOT NULL AND (
        EXISTS (
            SELECT 1 FROM public.club_members cm
            WHERE cm.club_id = p_club_id
              AND cm.user_email ILIKE (auth.jwt() ->> 'email')
              AND cm.role IN ('owner', 'admin')
        )
        OR EXISTS (
            SELECT 1
            FROM public.club_organisations co
            JOIN public.organisation_members om ON om.organisation_id = co.organisation_id
            WHERE co.club_id = p_club_id
              AND om.user_email ILIKE (auth.jwt() ->> 'email')
              AND om.role IN ('owner', 'admin')
        )
    );
$function$;
CREATE OR REPLACE FUNCTION public.can_manage_calendar_event(p_organisation_id uuid, p_club_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT
        (p_organisation_id IS NOT NULL AND public.is_organisation_admin(p_organisation_id))
        OR (p_club_id IS NOT NULL AND public.can_manage_club(p_club_id));
$function$;
CREATE OR REPLACE FUNCTION public.can_manage_event(p_event_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
    SELECT public.is_super_admin((SELECT auth.email()))
        OR (
            (SELECT auth.uid()) IS NOT NULL
            AND (SELECT public.account_is_active())
            AND EXISTS (
                SELECT 1 FROM public.admin_sidebar_permissions permissions
                WHERE lower(permissions.email) = lower((SELECT auth.email()))
                  AND (
                      -- Explicit assignments also grant the tab in hasPermission.
                      COALESCE(permissions.module_permissions->'event-mgmt'->'allowedEvents', '[]'::jsonb)
                          @> jsonb_build_array(p_event_id)
                      OR (
                          'event-mgmt' = ANY(permissions.allowed_tabs)
                          -- An empty/missing list means Full Access in Admin Manager.
                          AND COALESCE(permissions.module_permissions->'event-mgmt'->'allowedEvents', '[]'::jsonb) = '[]'::jsonb
                      )
                  )
            )
        )
        OR (
            (SELECT auth.uid()) IS NOT NULL
            AND (SELECT public.account_is_active())
            AND EXISTS (
                SELECT 1 FROM public.calendar c
                WHERE c.id = p_event_id
                  AND (
                      public.can_manage_calendar_event(c.organisation_id, c.club_id)
                      OR
                      lower(c.organiser_email) = lower((SELECT auth.email()))
                      OR EXISTS (
                          SELECT 1 FROM unnest(c.event_co_admins) AS admin_email
                          WHERE lower(admin_email) = lower((SELECT auth.email()))
                      )
                      OR (
                          c.organisation_id IS NOT NULL
                          AND (
                              EXISTS (
                                  SELECT 1 FROM public.organisation_members om
                                  WHERE om.organisation_id = c.organisation_id
                                    AND lower(om.user_email) = lower((SELECT auth.email()))
                                    AND om.role IN ('owner', 'admin')
                              )
                              OR EXISTS (
                                  SELECT 1 FROM public.organisations o
                                  JOIN public.players p ON p.id = o.created_by
                                  WHERE o.id = c.organisation_id
                                    AND lower(p.email) = lower((SELECT auth.email()))
                              )
                          )
                      )
                  )
            )
        );
$function$;
CREATE OR REPLACE FUNCTION public.create_player_profile(p_email text, p_name text, p_contact text, p_category text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM players WHERE email = p_email) THEN
        INSERT INTO players (email, name, contact_number, approved, category, paid_registration)
        VALUES (p_email, p_name, p_contact, true, p_category, true);
    END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_player_profile(p_email text, p_name text, p_contact text, p_category text, p_gender text, p_nationality text, p_id_number text, p_bio text, p_home_club text, p_sponsors text, p_instagram_link text, p_paid_registration boolean, p_license_type text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
            sponsors,
            instagram_link,
            license_type
        )
        VALUES (
            p_email,
            p_name,
            p_contact,
            true,
            p_category,
            p_paid_registration,
            p_gender,
            p_nationality,
            p_id_number,
            p_bio,
            p_home_club,
            p_sponsors,
            p_instagram_link,
            p_license_type
        );
    ELSE
        -- Update existing player if they registered but hadn't completed profile
        UPDATE players SET
            name = p_name,
            contact_number = p_contact,
            category = p_category,
            paid_registration = p_paid_registration,
            gender = p_gender,
            nationality = p_nationality,
            id_number = p_id_number,
            bio = p_bio,
            home_club = p_home_club,
            sponsors = p_sponsors,
            instagram_link = p_instagram_link,
            license_type = p_license_type
        WHERE email = p_email;
    END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_player_profile(p_email text, p_name text, p_contact text, p_category text, p_gender text, p_nationality text, p_id_number text, p_bio text, p_home_club text, p_sponsors text, p_image_url text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
            sponsors,
            image_url
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
            p_sponsors,
            p_image_url
        );
    END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_player_profile(p_email text, p_name text, p_contact text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM players WHERE email = p_email) THEN
        INSERT INTO players (email, name, contact_number, approved, rank_label, paid_registration)
        VALUES (p_email, p_name, p_contact, false, 'Unranked', true);
    END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_player_profile(p_email text, p_name text, p_contact text, p_category text, p_gender text, p_nationality text, p_id_number text, p_bio text, p_home_club text, p_sponsors text, p_region text, p_instagram_link text, p_paid_registration boolean, p_license_type text, p_image_url text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.create_player_profile(p_bio text, p_category text, p_contact text, p_email text, p_gender text, p_home_club text, p_id_number text, p_image_url text, p_instagram_link text, p_license_type text, p_name text, p_nationality text, p_paid_registration boolean, p_sponsors text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    INSERT INTO public.players (
        email,
        name,
        contact_number,
        category,
        gender,
        nationality,
        id_number,
        bio,
        home_club,
        sponsors,
        instagram_link,
        paid_registration,
        license_type,
        image_url,
        approved
    )
    VALUES (
        p_email,
        p_name,
        p_contact,
        p_category,
        p_gender,
        p_nationality,
        p_id_number,
        p_bio,
        p_home_club,
        p_sponsors,
        p_instagram_link,
        p_paid_registration,
        p_license_type,
        p_image_url,
        true
    )
    ON CONFLICT (email) DO UPDATE SET
        name = COALESCE(EXCLUDED.name, players.name),
        contact_number = COALESCE(EXCLUDED.contact_number, players.contact_number),
        category = COALESCE(EXCLUDED.category, players.category),
        gender = COALESCE(EXCLUDED.gender, players.gender),
        nationality = COALESCE(EXCLUDED.nationality, players.nationality),
        id_number = COALESCE(EXCLUDED.id_number, players.id_number),
        bio = COALESCE(EXCLUDED.bio, players.bio),
        home_club = COALESCE(EXCLUDED.home_club, players.home_club),
        sponsors = COALESCE(EXCLUDED.sponsors, players.sponsors),
        instagram_link = COALESCE(EXCLUDED.instagram_link, players.instagram_link),
        paid_registration = EXCLUDED.paid_registration,
        license_type = EXCLUDED.license_type,
        image_url = COALESCE(EXCLUDED.image_url, players.image_url);
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_player_profile(p_email text, p_name text, p_contact text, p_category text, p_gender text, p_nationality text, p_id_number text, p_bio text, p_home_club text, p_sponsors text, p_region text, p_instagram_link text, p_paid_registration boolean, p_license_type text, p_image_url text, p_racket_brand text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
            image_url,
            racket_brand
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
            p_image_url,
            p_racket_brand
        );
    END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_player_profile(p_email text, p_name text, p_contact text, p_category text, p_gender text, p_nationality text, p_id_number text, p_bio text, p_home_club text, p_sponsors text, p_region text, p_instagram_link text, p_paid_registration boolean, p_license_type text, p_image_url text, p_racket_brand text, p_club_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
            image_url,
            racket_brand,
            club_id
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
            p_image_url,
            p_racket_brand,
            p_club_id
        );
    END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_player_profile(p_email text, p_name text, p_contact text, p_category text, p_gender text, p_nationality text, p_id_number text, p_bio text, p_home_club text, p_sponsors text, p_region text, p_instagram_link text, p_paid_registration boolean, p_license_type text, p_image_url text, p_racket_brand text, p_account_type text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF p_account_type IS NOT NULL AND p_account_type NOT IN ('player', 'organisation') THEN
        RAISE EXCEPTION 'Invalid account_type: %', p_account_type;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.players WHERE email ILIKE p_email) THEN
        INSERT INTO public.players (
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
            image_url,
            racket_brand,
            account_type
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
            p_image_url,
            p_racket_brand,
            COALESCE(NULLIF(p_account_type, ''), 'player')
        );
    END IF;
END;
$function$;
CREATE OR REPLACE FUNCTION public.create_player_profile_pay_later(p_email text, p_name text, p_contact text, p_category text, p_gender text, p_nationality text, p_id_number text, p_bio text, p_home_club text, p_sponsors text, p_instagram_link text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
            sponsors,
            instagram_link
        )
        VALUES (
            p_email,
            p_name,
            p_contact,
            true,
            p_category,
            false,
            p_gender,
            p_nationality,
            p_id_number,
            p_bio,
            p_home_club,
            p_sponsors,
            p_instagram_link
        );
    END IF;
END;
$function$;
CREATE OR REPLACE FUNCTION public.upsert_tournament_participant(p_event_id bigint, p_full_name text, p_email text, p_class_name text, p_profile_id bigint, p_is_paid boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_id uuid;
BEGIN
    SELECT id INTO v_id
    FROM public.tournament_participants
    WHERE event_id = p_event_id
      AND full_name ILIKE p_full_name
      AND class_name ILIKE p_class_name
    LIMIT 1;

    IF v_id IS NOT NULL THEN
        UPDATE public.tournament_participants
        SET is_paid = p_is_paid, last_synced_at = now()
        WHERE id = v_id;
    ELSE
        INSERT INTO public.tournament_participants
            (event_id, full_name, email, class_name, profile_id, is_paid, last_synced_at)
        VALUES (p_event_id, p_full_name, p_email, p_class_name, p_profile_id, p_is_paid, now())
        RETURNING id INTO v_id;
    END IF;

    RETURN v_id;
END;
$function$;

create function public.org_audit(text,text,text,uuid,jsonb) returns void language sql security definer as $$select$$;

create function public._insert_event_activity(bigint,text,text,text,text,text,jsonb) returns void language sql security definer as $$select$$;

create function public.push_preferences_for_email(text) returns void language sql security definer as $$select$$;

create function public.enqueue_push(text,text,text,text,text,jsonb) returns void language sql security definer as $$select$$;

create function public.refresh_tournament_notifications() returns void language sql security definer as $$select$$;

create function public.event_notification_participants(bigint,uuid) returns void language sql security definer as $$select$$;

create function public.notification_match_recipients(uuid) returns void language sql security definer as $$select$$;

create function public.notification_match_state(uuid) returns void language sql security definer as $$select$$;

create function public.plan_tournament_push(bigint,text,text,text,text,text,text,text,jsonb,timestamp with time zone,timestamp with time zone) returns void language sql security definer as $$select$$;

create function public.plan_event_change_push(bigint,text,text,jsonb,jsonb) returns void language sql security definer as $$select$$;

do $$ declare t text; begin foreach t in array array['clubs','club_groups','club_google_matches','club_organisations','albums','gallery_images','events','settings','blogs','coach_applications','calendar','tournament_divisions','tournament_draws','tournament_matches','ranking_history','ranking_points_config','rankedin_cache','rankedin_results_cache','player_matches','whatsapp_queue'] loop execute format('alter table public.%I enable row level security',t); if t not in('albums','gallery_images','coach_applications') then execute format('create policy legacy_all on public.%I for all to authenticated using(true) with check(true)',t); execute format('create policy public_read on public.%I for select using(true)',t); end if; end loop; end $$;
alter table storage.objects enable row level security;
create policy legacy_storage_write on storage.objects for all to authenticated using(true) with check(true);
create policy "Admins can manage albums" on public.albums for all to authenticated using(true) with check(true);
create policy "Admins can view all albums" on public.albums for select to authenticated using(true);
create policy public_albums on public.albums for select using(is_active);
create policy "Admins can manage gallery images" on public.gallery_images for all to authenticated using(true) with check(true);
create policy public_images on public.gallery_images for select using(exists(select 1 from public.albums a where a.id=album_id and a.is_active));
create policy "Admins can manage coach applications" on public.coach_applications for all to authenticated using(true) with check(true);
create policy "Public can apply to be a coach" on public.coach_applications for insert with check(true);
create policy public_coaches on public.coach_applications for select using(status='approved');
-- All ten historical overloads and internal worker functions had client grants.
grant execute on all functions in schema public to anon,authenticated,service_role;
