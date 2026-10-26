-- Americano has individual entrants and rotating partnerships. Keep its versioned
-- state together so scores and the public leaderboard change atomically.
ALTER TABLE public.draws DROP CONSTRAINT IF EXISTS draws_format_check;
ALTER TABLE public.draws ADD CONSTRAINT draws_format_check
    CHECK (format IN ('knockout', 'group_knockout', 'group_only', 'americano'));

-- Published Americano fixtures reserve courts in the shared match calendar.
-- The individual rotation remains the source of truth for players and scores.
ALTER TABLE public.draw_matches ADD COLUMN IF NOT EXISTS americano_fixture_key text;
CREATE UNIQUE INDEX IF NOT EXISTS draw_matches_americano_fixture ON public.draw_matches(draw_id, americano_fixture_key);

CREATE OR REPLACE FUNCTION public.protect_americano_court_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE event bigint;
BEGIN
    IF NEW.court_name IS NULL OR NEW.scheduled_start IS NULL OR NEW.status = 'cancelled' THEN RETURN NEW; END IF;
    SELECT event_id INTO event FROM public.draws WHERE id = NEW.draw_id;
    PERFORM pg_advisory_xact_lock(hashtextextended('draw-courts:' || event::text, 0));
    IF EXISTS (SELECT 1 FROM public.draw_matches m JOIN public.draws d ON d.id = m.draw_id
        WHERE d.event_id = event AND m.id <> NEW.id AND m.status <> 'cancelled'
        AND NOT (NEW.americano_fixture_key IS NOT NULL AND m.draw_id = NEW.draw_id AND m.americano_fixture_key IS NOT DISTINCT FROM NEW.americano_fixture_key)
        AND (m.americano_fixture_key IS NOT NULL OR NEW.americano_fixture_key IS NOT NULL)
        AND m.court_name = NEW.court_name AND m.scheduled_start IS NOT NULL
        AND m.scheduled_start < COALESCE(NEW.scheduled_end, NEW.scheduled_start + interval '30 minutes')
        AND COALESCE(m.scheduled_end, m.scheduled_start + interval '30 minutes') > NEW.scheduled_start
    ) THEN RAISE EXCEPTION 'This court time overlaps another draw. Rebuild the schedule before publishing'; END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS protect_americano_court_booking ON public.draw_matches;
CREATE TRIGGER protect_americano_court_booking BEFORE INSERT OR UPDATE OF court_name, scheduled_start, scheduled_end ON public.draw_matches
FOR EACH ROW EXECUTE FUNCTION public.protect_americano_court_booking();

CREATE OR REPLACE FUNCTION public.save_americano_draw(
    p_event_id bigint, p_division_id uuid, p_state jsonb, p_status text,
    p_expected_updated_at timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
    current_draw public.draws;
    result public.draws;
    n integer;
    rounds integer;
    points integer;
    courts integer;
    fixture jsonb;
    old_fixture jsonb;
    participant_ids text[];
    side_ids text[];
    seen_ids text[] := '{}';
    round_ids text[];
    r integer;
    score_one integer;
    score_two integer;
BEGIN
    IF NOT COALESCE(public.can_manage_native_draw(p_event_id), false) THEN
        RAISE EXCEPTION 'You cannot manage this event';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.tournament_divisions WHERE id = p_division_id AND event_id = p_event_id) THEN
        RAISE EXCEPTION 'Division does not belong to this event';
    END IF;
    -- Serialise even the first save, when no draw row exists to lock yet.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_division_id::text, 0));
    SELECT * INTO current_draw FROM public.draws WHERE division_id = p_division_id AND draw_kind = 'main' FOR UPDATE;
    IF current_draw.id IS NOT NULL THEN
        IF current_draw.format <> 'americano' AND current_draw.status <> 'draft' THEN RAISE EXCEPTION 'This division already has a fixed-pair draw'; END IF;
        IF current_draw.updated_at IS DISTINCT FROM p_expected_updated_at THEN
            RAISE EXCEPTION 'This draw changed in another session. Reload before saving';
        END IF;
        IF current_draw.status IN ('completed', 'archived') THEN RAISE EXCEPTION 'This draw is locked'; END IF;
    ELSIF p_expected_updated_at IS NOT NULL THEN
        RAISE EXCEPTION 'The draw no longer exists. Reload before saving';
    END IF;
    IF p_status IS NULL OR p_status NOT IN ('draft', 'published', 'in_progress', 'completed') THEN RAISE EXCEPTION 'Invalid draw status'; END IF;
    IF jsonb_typeof(p_state->'players') IS DISTINCT FROM 'array' OR jsonb_typeof(p_state->'fixtures') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Players and fixtures are required'; END IF;
    n := jsonb_array_length(p_state->'players');
    rounds := (p_state->>'rounds')::integer;
    points := (p_state->>'points')::integer;
    courts := (p_state->>'courts')::integer;
    IF n < 4 OR n > 64 OR n % 4 <> 0 OR rounds IS NULL OR rounds < 1 OR rounds >= n
        OR points IS NULL OR points < 1 OR courts IS NULL OR courts < 1 OR courts > n/4 THEN
        RAISE EXCEPTION 'Invalid Americano player count, rounds, points or courts';
    END IF;
    SELECT array_agg(p->>'id') INTO participant_ids FROM jsonb_array_elements(p_state->'players') p;
    IF (SELECT count(DISTINCT id) FROM unnest(participant_ids) id) <> n THEN RAISE EXCEPTION 'Duplicate or missing players'; END IF;
    IF current_draw.id IS NULL OR current_draw.status = 'draft' THEN
        IF EXISTS (SELECT 1 FROM unnest(participant_ids) pid WHERE NOT EXISTS (
            SELECT 1 FROM public.event_registrations er WHERE er.id::text = pid AND er.division_id = p_division_id
                AND lower(er.payment_status) = 'paid' AND lower(COALESCE(er.status, '')) <> 'withdrawn'
        )) THEN RAISE EXCEPTION 'Every player must have a paid, active registration in this division'; END IF;
        IF p_status NOT IN ('draft', 'published') THEN RAISE EXCEPTION 'Save and publish the rotation before recording results'; END IF;
    ELSE
        IF p_status NOT IN ('published', 'in_progress', 'completed') OR (current_draw.status = 'in_progress' AND p_status = 'published') THEN RAISE EXCEPTION 'Published rotations cannot return to draft'; END IF;
        IF (p_state - 'fixtures') IS DISTINCT FROM ((current_draw.scoring_rules->'americano') - 'fixtures') THEN
            RAISE EXCEPTION 'Published players and settings are locked';
        END IF;
    END IF;
    IF jsonb_array_length(p_state->'fixtures') <> rounds * n / 4 THEN RAISE EXCEPTION 'Incomplete rotation'; END IF;
    FOR fixture IN SELECT value FROM jsonb_array_elements(p_state->'fixtures') LOOP
        IF fixture->>'id' IS NULL OR fixture->>'id' = ANY(seen_ids) THEN RAISE EXCEPTION 'Duplicate or missing fixture ID'; END IF;
        seen_ids := array_append(seen_ids, fixture->>'id');
        IF jsonb_typeof(fixture->'one') IS DISTINCT FROM 'array' OR jsonb_typeof(fixture->'two') IS DISTINCT FROM 'array'
            OR jsonb_array_length(fixture->'one') <> 2 OR jsonb_array_length(fixture->'two') <> 2 THEN RAISE EXCEPTION 'Each match needs two pairs'; END IF;
        SELECT array_agg(value) INTO side_ids FROM jsonb_array_elements_text((fixture->'one') || (fixture->'two'));
        IF NOT side_ids <@ participant_ids OR (SELECT count(DISTINCT id) FROM unnest(side_ids) id) <> 4 THEN RAISE EXCEPTION 'Invalid match players'; END IF;
        IF (fixture->>'round')::integer IS NULL OR (fixture->>'round')::integer NOT BETWEEN 1 AND rounds
            OR (fixture->>'court')::integer IS NULL OR (fixture->>'court')::integer NOT BETWEEN 1 AND courts
            OR (fixture->>'wave')::integer IS NULL OR (fixture->>'wave')::integer < 1 THEN RAISE EXCEPTION 'Invalid round or court'; END IF;
        IF fixture->>'scheduled_start' IS NOT NULL THEN
            IF fixture->>'scheduled_end' IS NULL OR (fixture->>'scheduled_end')::timestamptz <= (fixture->>'scheduled_start')::timestamptz THEN
                RAISE EXCEPTION 'Each scheduled match needs a valid finish time';
            END IF;
        END IF;
        IF current_draw.id IS NOT NULL AND current_draw.status <> 'draft' THEN
            SELECT value INTO old_fixture FROM jsonb_array_elements(current_draw.scoring_rules->'americano'->'fixtures') WHERE value->>'id' = fixture->>'id';
            IF (fixture - ARRAY['score', 'scheduled_start', 'scheduled_end']) IS DISTINCT FROM (old_fixture - ARRAY['score', 'scheduled_start', 'scheduled_end']) THEN RAISE EXCEPTION 'Published pairings are locked'; END IF;
            IF old_fixture->'score' IS NOT NULL AND old_fixture->'score' <> 'null'::jsonb
                AND (fixture->>'scheduled_start', fixture->>'scheduled_end') IS DISTINCT FROM (old_fixture->>'scheduled_start', old_fixture->>'scheduled_end') THEN
                RAISE EXCEPTION 'Played match times are locked';
            END IF;
        END IF;
        IF fixture->'score' IS NOT NULL AND fixture->'score' <> 'null'::jsonb THEN
            IF current_draw.id IS NULL OR current_draw.status = 'draft' THEN RAISE EXCEPTION 'Publish before entering results'; END IF;
            IF jsonb_typeof(fixture->'score') <> 'array' OR jsonb_array_length(fixture->'score') <> 2
                OR jsonb_typeof(fixture->'score'->0) IS DISTINCT FROM 'number' OR jsonb_typeof(fixture->'score'->1) IS DISTINCT FROM 'number'
                OR (fixture->'score'->>0) !~ '^[0-9]+$' OR (fixture->'score'->>1) !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Invalid score'; END IF;
            score_one := (fixture->'score'->>0)::integer; score_two := (fixture->'score'->>1)::integer;
            IF score_one IS NULL OR score_two IS NULL OR score_one::bigint + score_two::bigint <> points THEN RAISE EXCEPTION 'Scores must equal the total rally points'; END IF;
        ELSIF p_status = 'completed' THEN RAISE EXCEPTION 'Complete every match before finishing';
        END IF;
    END LOOP;
    FOR r IN 1..rounds LOOP
        SELECT array_agg(id) INTO round_ids FROM jsonb_array_elements(p_state->'fixtures') m,
            LATERAL jsonb_array_elements_text((m->'one') || (m->'two')) id WHERE (m->>'round')::integer = r;
        IF COALESCE(cardinality(round_ids), 0) <> n OR (SELECT count(DISTINCT id) FROM unnest(round_ids) id) <> n THEN
            RAISE EXCEPTION 'Each player must play once per round';
        END IF;
    END LOOP;
    IF current_draw.id IS NOT NULL AND current_draw.format <> 'americano' THEN
        -- All validation above must pass before replacing an editable fixed-pair draft.
        DELETE FROM public.draw_matches WHERE draw_id = current_draw.id;
        DELETE FROM public.draw_standings WHERE draw_id = current_draw.id;
        DELETE FROM public.draw_entries WHERE draw_id = current_draw.id;
        DELETE FROM public.draw_groups WHERE draw_id = current_draw.id;
    END IF;
    IF current_draw.id IS NULL THEN
        INSERT INTO public.draws(event_id, division_id, draw_kind, format, status, seeding_method, scoring_rules, generated_at, published_at)
        VALUES(p_event_id, p_division_id, 'main', 'americano', p_status, 'random', jsonb_build_object('americano', p_state), now(), CASE WHEN p_status='published' THEN now() END) RETURNING * INTO result;
    ELSE
        UPDATE public.draws SET format = 'americano', group_count = NULL, advancers_per_group = NULL, seeding_method = 'random', scoring_rules = jsonb_build_object('americano', p_state), status = p_status,
            updated_at = clock_timestamp(), published_at = CASE WHEN p_status='published' THEN COALESCE(published_at, now()) ELSE published_at END,
            completed_at = CASE WHEN p_status='completed' THEN now() ELSE NULL END
        WHERE id = current_draw.id RETURNING * INTO result;
    END IF;
    IF p_status <> 'draft' THEN
        -- Release this rotation's previous reservations atomically before rebuilding.
        -- The event lock prevents another scheduler taking those slots mid-save.
        PERFORM pg_advisory_xact_lock(hashtextextended('draw-courts:' || p_event_id::text, 0));
        UPDATE public.draw_matches SET scheduled_start = NULL, scheduled_end = NULL
        WHERE draw_id = result.id AND americano_fixture_key IS NOT NULL;
        INSERT INTO public.draw_matches(draw_id, americano_fixture_key, stage, round_code, round_label, round_number,
            bracket_position, status, court_name, scheduled_start, scheduled_end, notes)
        SELECT result.id, m->>'id', 'group', 'americano_r' || (m->>'round'), 'Americano · Round ' || (m->>'round'),
            (m->>'round')::smallint, ordinal::smallint,
            CASE WHEN m->'score' IS NOT NULL AND m->'score' <> 'null'::jsonb THEN 'completed' WHEN m->>'scheduled_start' IS NOT NULL THEN 'scheduled' ELSE 'pending' END,
            'Court ' || (m->>'court'), (m->>'scheduled_start')::timestamptz, (m->>'scheduled_end')::timestamptz,
            'Americano · rotating pairs'
        FROM jsonb_array_elements(p_state->'fixtures') WITH ORDINALITY AS fixtures(m, ordinal)
        ON CONFLICT (draw_id, americano_fixture_key) DO UPDATE SET status = EXCLUDED.status, court_name = EXCLUDED.court_name,
            scheduled_start = EXCLUDED.scheduled_start, scheduled_end = EXCLUDED.scheduled_end;
    END IF;
    RETURN to_jsonb(result);
END;
$$;
REVOKE ALL ON FUNCTION public.save_americano_draw(bigint, uuid, jsonb, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_americano_draw(bigint, uuid, jsonb, text, timestamptz) TO authenticated;
