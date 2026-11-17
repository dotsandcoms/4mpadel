-- Draw-level audit survives fixture replacement and is visible only to managers.
CREATE TABLE public.native_draw_edit_audit (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    draw_id uuid NOT NULL REFERENCES public.draws(id) ON DELETE CASCADE,
    generation timestamptz,
    action text NOT NULL CHECK (action IN ('group_edit', 'group_undo', 'qualification', 'qualification_override')),
    undo_of uuid REFERENCES public.native_draw_edit_audit(id),
    details jsonb NOT NULL,
    actor_id uuid NOT NULL,
    actor_email text,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CHECK ((action = 'group_undo') = (undo_of IS NOT NULL))
);
CREATE INDEX native_draw_edit_audit_draw ON public.native_draw_edit_audit(draw_id, created_at DESC);
CREATE UNIQUE INDEX native_draw_edit_audit_undo ON public.native_draw_edit_audit(undo_of) WHERE undo_of IS NOT NULL;
ALTER TABLE public.native_draw_edit_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.native_draw_edit_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.native_draw_edit_audit TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.native_draw_edit_audit TO service_role;
CREATE POLICY "Draw managers read edit history" ON public.native_draw_edit_audit FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.draws d WHERE d.id = draw_id AND public.can_manage_native_draw(d.event_id)));
CREATE POLICY "Draw managers record edit history" ON public.native_draw_edit_audit FOR INSERT TO authenticated
    WITH CHECK (actor_id = (SELECT auth.uid()) AND actor_email IS NOT DISTINCT FROM (SELECT auth.jwt()->>'email')
        AND EXISTS (SELECT 1 FROM public.draws d WHERE d.id = draw_id AND public.can_manage_native_draw(d.event_id)));

CREATE FUNCTION public.native_save_group_draw(
    p_event bigint, p_division uuid, p_expected timestamptz, p_format text, p_places smallint,
    p_rules jsonb, p_groups jsonb, p_entries jsonb, p_matches jsonb, p_history jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
    d public.draws;
    group_total integer := jsonb_array_length(p_groups);
BEGIN
    IF NOT COALESCE(public.can_manage_native_draw(p_event), false) OR NOT EXISTS (
        SELECT 1 FROM public.tournament_divisions WHERE id = p_division AND event_id = p_event
    ) THEN RAISE EXCEPTION 'You cannot manage this division'; END IF;
    IF p_format NOT IN ('group_only', 'group_knockout') OR group_total < 1 THEN RAISE EXCEPTION 'Choose a group format'; END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(p_division::text, 0));
    SELECT * INTO d FROM public.draws WHERE division_id = p_division AND draw_kind = 'main' FOR UPDATE;
    IF d.updated_at IS DISTINCT FROM p_expected OR (d.id IS NOT NULL AND d.status <> 'draft') THEN
        RAISE EXCEPTION 'The saved draw changed. Reload and try again';
    END IF;
    IF d.id IS NULL THEN
        INSERT INTO public.draws(event_id, division_id, format, group_count, advancers_per_group, scoring_rules, seeding_method, generated_at)
        VALUES(p_event, p_division, p_format, group_total, p_places, p_rules, 'native_ranking', clock_timestamp()) RETURNING * INTO d;
    ELSE
        DELETE FROM public.draw_matches WHERE draw_id = d.id;
        DELETE FROM public.draw_entries WHERE draw_id = d.id;
        DELETE FROM public.draw_groups WHERE draw_id = d.id;
        UPDATE public.draws SET format = p_format, group_count = group_total, advancers_per_group = p_places,
            scoring_rules = p_rules, seeding_method = 'native_ranking', generated_at = clock_timestamp(), updated_at = clock_timestamp()
        WHERE id = d.id RETURNING * INTO d;
    END IF;
    INSERT INTO public.draw_groups (id, draw_id, name, display_order)
    SELECT g.id, d.id, g.name, g.display_order FROM jsonb_populate_recordset(NULL::public.draw_groups, p_groups) g;
    INSERT INTO public.draw_entries (id, draw_id, group_id, source_registration_id, player_one_id, player_two_id,
        team_name, player_one_name, player_two_name, seed_number, seeding_value, snapshot)
    SELECT e.id, d.id, e.group_id, e.source_registration_id, e.player_one_id, e.player_two_id,
        e.team_name, e.player_one_name, e.player_two_name, e.seed_number, e.seeding_value, e.snapshot
    FROM jsonb_populate_recordset(NULL::public.draw_entries, p_entries) e
    JOIN public.draw_groups g ON g.id = e.group_id AND g.draw_id = d.id;
    IF (SELECT count(*) FROM public.draw_entries WHERE draw_id = d.id) <> jsonb_array_length(p_entries) THEN
        RAISE EXCEPTION 'Every team needs a group in this draw';
    END IF;
    INSERT INTO public.draw_standings(draw_id, group_id, entry_id)
    SELECT d.id, group_id, id FROM public.draw_entries WHERE draw_id = d.id;
    INSERT INTO public.draw_matches (draw_id, group_id, stage, round_code, round_label, round_number,
        bracket_position, entry_one_id, entry_two_id, status)
    SELECT d.id, m.group_id, 'group', m.round_code, m.round_label, m.round_number,
        m.bracket_position, m.entry_one_id, m.entry_two_id, 'pending'
    FROM jsonb_populate_recordset(NULL::public.draw_matches, p_matches) m
    JOIN public.draw_entries a ON a.id = m.entry_one_id AND a.draw_id = d.id AND a.group_id = m.group_id
    JOIN public.draw_entries b ON b.id = m.entry_two_id AND b.draw_id = d.id AND b.group_id = m.group_id;
    IF (SELECT count(*) FROM public.draw_matches WHERE draw_id = d.id) <> jsonb_array_length(p_matches)
        OR jsonb_array_length(p_matches) IS DISTINCT FROM (
            SELECT sum(group_size * (group_size - 1) / 2)
            FROM (SELECT count(*) AS group_size FROM public.draw_entries WHERE draw_id = d.id GROUP BY group_id) sizes
        ) OR EXISTS (
            SELECT 1 FROM public.draw_groups g WHERE g.draw_id = d.id
                AND NOT EXISTS (SELECT 1 FROM public.draw_entries e WHERE e.group_id = g.id)
        ) OR EXISTS (
            SELECT 1 FROM public.draw_matches WHERE draw_id = d.id
            GROUP BY least(entry_one_id, entry_two_id), greatest(entry_one_id, entry_two_id) HAVING count(*) > 1
        ) THEN
        RAISE EXCEPTION 'Each group needs a complete set of round robin fixtures';
    END IF;
    INSERT INTO public.native_draw_edit_audit(id, draw_id, generation, action, undo_of, details, actor_id, actor_email)
    SELECT (h.value->>'id')::uuid, d.id, d.generated_at, h.value->>'action',
        (h.value->>'undo_of')::uuid, h.value->'details', auth.uid(), auth.jwt()->>'email'
    FROM jsonb_array_elements(p_history) WITH ORDINALITY h(value, seq) ORDER BY h.seq;
    RETURN d.id;
END;
$$;

CREATE FUNCTION public.native_apply_group_edit(
    p_draw uuid, p_expected timestamptz, p_versions jsonb, p_two_groups uuid[],
    p_source uuid, p_target uuid, p_fixtures jsonb, p_undo uuid
) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
    d public.draws;
    source_entry public.draw_entries;
    target_entry public.draw_entries;
    prior public.native_draw_edit_audit;
    edit jsonb;
    changed_ids uuid[];
    fixture_count integer;
    cleared integer;
BEGIN
    SELECT * INTO d FROM public.draws WHERE id = p_draw FOR UPDATE;
    IF d.id IS NULL OR NOT COALESCE(public.can_manage_native_draw(d.event_id), false)
        OR d.updated_at IS DISTINCT FROM p_expected OR d.format NOT IN ('group_knockout', 'group_only')
        OR d.status NOT IN ('draft', 'published', 'in_progress') THEN
        RAISE EXCEPTION 'The draw changed or is locked. Reload and try again';
    END IF;
    IF cardinality(p_two_groups) <> 2 OR p_two_groups[1] = p_two_groups[2]
        OR (SELECT count(*) FROM public.draw_groups WHERE draw_id = d.id AND id = ANY(p_two_groups)) <> 2 THEN
        RAISE EXCEPTION 'Choose two different groups';
    END IF;
    PERFORM 1 FROM public.draw_matches WHERE draw_id = d.id AND stage = 'group' ORDER BY id FOR UPDATE;
    IF EXISTS (SELECT 1 FROM public.draw_matches WHERE draw_id = d.id AND stage = 'knockout')
        OR EXISTS (SELECT 1 FROM public.draw_matches WHERE draw_id = d.id AND stage = 'group'
            AND (group_id = ANY(p_two_groups) OR p_undo IS NOT NULL) AND status NOT IN ('pending', 'scheduled')) THEN
        RAISE EXCEPTION 'Group play has started. The affected fixtures are locked';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.draw_matches m
        WHERE m.draw_id = d.id AND m.group_id = ANY(p_two_groups)
        AND m.updated_at IS DISTINCT FROM (p_versions->>m.id::text)::timestamptz
    ) OR (SELECT count(*) FROM public.draw_matches WHERE draw_id = d.id AND group_id = ANY(p_two_groups))
      <> (SELECT count(*) FROM jsonb_object_keys(p_versions)) THEN
        RAISE EXCEPTION 'A fixture or booking changed. Reload the draw first';
    END IF;

    SELECT * INTO source_entry FROM public.draw_entries WHERE id = p_source AND draw_id = d.id AND group_id = p_two_groups[1];
    SELECT * INTO target_entry FROM public.draw_entries WHERE id = p_target AND draw_id = d.id AND group_id = p_two_groups[2];
    IF source_entry.id IS NULL OR (p_target IS NOT NULL AND target_entry.id IS NULL) THEN
        RAISE EXCEPTION 'A team has moved. Reload the draw first';
    END IF;
    edit := jsonb_build_object(
        'source', jsonb_build_object('id', p_source, 'registration', source_entry.source_registration_id,
            'name', source_entry.team_name, 'group', (SELECT name FROM public.draw_groups WHERE id = p_two_groups[1])),
        'target', jsonb_build_object('id', p_target, 'registration', target_entry.source_registration_id,
            'name', target_entry.team_name, 'group', (SELECT name FROM public.draw_groups WHERE id = p_two_groups[2]))
    );
    IF p_undo IS NOT NULL THEN
        SELECT * INTO prior FROM public.native_draw_edit_audit a WHERE a.draw_id = d.id
            AND a.generation IS NOT DISTINCT FROM d.generated_at AND a.action = 'group_edit'
            AND NOT EXISTS (SELECT 1 FROM public.native_draw_edit_audit u WHERE u.undo_of = a.id)
            ORDER BY a.created_at DESC, a.id DESC LIMIT 1;
        IF prior.id IS DISTINCT FROM p_undo
            OR (edit->'source'->>'group') IS DISTINCT FROM (prior.details->'target'->>'group')
            OR (edit->'target'->>'group') IS DISTINCT FROM (prior.details->'source'->>'group')
            OR COALESCE(edit->'source'->>'registration', edit->'source'->>'id') IS DISTINCT FROM COALESCE(prior.details->'source'->>'registration', prior.details->'source'->>'id')
            OR COALESCE(edit->'target'->>'registration', edit->'target'->>'id') IS DISTINCT FROM COALESCE(prior.details->'target'->>'registration', prior.details->'target'->>'id') THEN
            RAISE EXCEPTION 'Only the most recent group edit can be undone';
        END IF;
    ELSIF p_target IS NULL AND (
        (SELECT count(*) FROM public.draw_entries WHERE group_id = p_two_groups[1]) <= COALESCE(d.advancers_per_group, 1)
        OR (SELECT count(*) FROM public.draw_entries WHERE group_id = p_two_groups[2]) >=
            (SELECT max(group_size) FROM (SELECT count(*) AS group_size FROM public.draw_entries WHERE draw_id = d.id GROUP BY group_id) groups)
    ) THEN RAISE EXCEPTION 'The destination has no open spot or the source needs its current teams';
    END IF;

    UPDATE public.draw_entries SET group_id = CASE WHEN id = p_source THEN p_two_groups[2] ELSE p_two_groups[1] END
    WHERE id IN (p_source, p_target);
    DELETE FROM public.draw_standings WHERE draw_id = d.id AND entry_id IN (p_source, p_target);
    INSERT INTO public.draw_standings(draw_id, group_id, entry_id)
    SELECT d.id, group_id, id FROM public.draw_entries WHERE id IN (p_source, p_target);

    SELECT sum(group_size * (group_size - 1) / 2) INTO fixture_count
    FROM (SELECT count(*) AS group_size FROM public.draw_entries WHERE group_id = ANY(p_two_groups) GROUP BY group_id) groups;
    IF fixture_count IS DISTINCT FROM jsonb_array_length(p_fixtures) OR EXISTS (
        SELECT 1 FROM jsonb_populate_recordset(NULL::public.draw_matches, p_fixtures) f
        LEFT JOIN public.draw_entries a ON a.id = f.entry_one_id AND a.draw_id = d.id AND a.group_id = f.group_id
        LEFT JOIN public.draw_entries b ON b.id = f.entry_two_id AND b.draw_id = d.id AND b.group_id = f.group_id
        LEFT JOIN public.draw_matches m ON m.id = f.id AND m.draw_id = d.id AND m.group_id = f.group_id AND m.stage = 'group'
        WHERE a.id IS NULL OR b.id IS NULL OR a.id = b.id OR NOT (f.group_id = ANY(p_two_groups))
            OR (f.id IS NOT NULL AND m.id IS NULL)
    ) OR EXISTS (
        SELECT 1 FROM jsonb_populate_recordset(NULL::public.draw_matches, p_fixtures) f
        GROUP BY least(entry_one_id, entry_two_id), greatest(entry_one_id, entry_two_id) HAVING count(*) > 1
    ) OR EXISTS (
        SELECT 1 FROM jsonb_populate_recordset(NULL::public.draw_matches, p_fixtures) f
        WHERE f.id IS NOT NULL GROUP BY f.id HAVING count(*) > 1
    ) THEN RAISE EXCEPTION 'The updated group fixtures are incomplete'; END IF;

    DELETE FROM public.draw_matches m WHERE m.draw_id = d.id AND m.stage = 'group' AND m.group_id = ANY(p_two_groups)
        AND NOT EXISTS (SELECT 1 FROM jsonb_populate_recordset(NULL::public.draw_matches, p_fixtures) f WHERE f.id = m.id);
    SELECT array_agg(m.id) INTO changed_ids FROM public.draw_matches m
    JOIN jsonb_populate_recordset(NULL::public.draw_matches, p_fixtures) f ON f.id = m.id
    WHERE (m.entry_one_id, m.entry_two_id) IS DISTINCT FROM (f.entry_one_id, f.entry_two_id);
    UPDATE public.draw_matches m SET entry_one_id = f.entry_one_id, entry_two_id = f.entry_two_id,
        round_number = f.round_number, bracket_position = f.bracket_position, round_code = f.round_code,
        round_label = f.round_label, updated_at = clock_timestamp()
    FROM jsonb_populate_recordset(NULL::public.draw_matches, p_fixtures) f WHERE m.id = f.id
        AND (m.entry_one_id, m.entry_two_id, m.round_number, m.bracket_position)
        IS DISTINCT FROM (f.entry_one_id, f.entry_two_id, f.round_number, f.bracket_position);
    INSERT INTO public.draw_matches(draw_id, group_id, stage, round_number, bracket_position, round_code, round_label, entry_one_id, entry_two_id)
    SELECT d.id, f.group_id, 'group', f.round_number, f.bracket_position, f.round_code, f.round_label, f.entry_one_id, f.entry_two_id
    FROM jsonb_populate_recordset(NULL::public.draw_matches, p_fixtures) f WHERE f.id IS NULL;

    -- Reuse the old court times where the replacement teams can play.
    UPDATE public.draw_matches m SET scheduled_start = NULL, scheduled_end = NULL, court_name = NULL,
        status = 'pending', updated_at = clock_timestamp()
    WHERE m.id = ANY(changed_ids) AND m.scheduled_start IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.draw_matches other
        JOIN public.draws od ON od.id = other.draw_id AND od.event_id = d.event_id AND od.status <> 'archived'
        JOIN public.draw_entries a ON a.id = m.entry_one_id
        JOIN public.draw_entries b ON b.id = m.entry_two_id
        JOIN public.draw_entries c ON c.id = other.entry_one_id
        JOIN public.draw_entries e ON e.id = other.entry_two_id
        LEFT JOIN public.event_play_days day ON day.event_id = d.event_id AND day.play_date = (m.scheduled_start AT TIME ZONE 'Africa/Johannesburg')::date
        WHERE m.id <> other.id AND other.status <> 'cancelled'
        AND other.scheduled_start < COALESCE(m.scheduled_end, m.scheduled_start + interval '30 minutes') + make_interval(mins => COALESCE(day.minimum_break_minutes, 0))
        AND COALESCE(other.scheduled_end, other.scheduled_start + interval '30 minutes') + make_interval(mins => COALESCE(day.minimum_break_minutes, 0)) > m.scheduled_start
        AND (ARRAY[a.id, b.id] && ARRAY[c.id, e.id]
            OR ARRAY[a.player_one_id, a.player_two_id, b.player_one_id, b.player_two_id]
                && ARRAY[c.player_one_id, c.player_two_id, e.player_one_id, e.player_two_id])
    );
    GET DIAGNOSTICS cleared = ROW_COUNT;
    INSERT INTO public.native_draw_edit_audit(draw_id, generation, action, undo_of, details, actor_id, actor_email)
    VALUES(d.id, d.generated_at, CASE WHEN p_undo IS NULL THEN 'group_edit' ELSE 'group_undo' END,
        p_undo, edit, auth.uid(), auth.jwt()->>'email');
    UPDATE public.draws SET updated_at = clock_timestamp() WHERE id = d.id;
    RETURN cleared;
END;
$$;

CREATE FUNCTION public.native_create_group_elimination(
    p_draw uuid, p_expected timestamptz, p_versions jsonb, p_matches jsonb, p_qualification jsonb
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
    d public.draws;
    mode text;
    match_count integer;
    total integer;
    bracket integer := (p_qualification->>'bracket')::integer;
BEGIN
    SELECT * INTO d FROM public.draws WHERE id = p_draw FOR UPDATE;
    IF d.id IS NULL OR NOT COALESCE(public.can_manage_native_draw(d.event_id), false)
        OR d.updated_at IS DISTINCT FROM p_expected OR d.format <> 'group_knockout'
        OR d.status NOT IN ('published', 'in_progress')
        OR EXISTS (SELECT 1 FROM public.draw_matches WHERE draw_id = d.id AND stage <> 'group') THEN
        RAISE EXCEPTION 'The draw changed or elimination already exists. Reload first';
    END IF;
    PERFORM 1 FROM public.draw_matches WHERE draw_id = d.id ORDER BY id FOR UPDATE;
    SELECT count(*) INTO match_count FROM public.draw_matches WHERE draw_id = d.id AND stage = 'group';
    IF match_count <> (SELECT count(*) FROM jsonb_object_keys(p_versions)) OR EXISTS (
        SELECT 1 FROM public.draw_matches m WHERE m.draw_id = d.id AND m.stage = 'group'
        AND (m.status NOT IN ('completed', 'walkover', 'retired') OR m.updated_at IS DISTINCT FROM (p_versions->>m.id::text)::timestamptz)
    ) THEN RAISE EXCEPTION 'Group results changed. Reload and review the qualifiers'; END IF;

    mode := COALESCE(d.scoring_rules->'qualification'->>'mode', 'fixed');
    SELECT CASE WHEN mode = 'all' THEN sum(size) ELSE sum(least(size, d.advancers_per_group)) END
        + CASE WHEN mode = 'best_placed' THEN COALESCE((d.scoring_rules->'qualification'->>'extras')::integer, 0) ELSE 0 END
    INTO total FROM (SELECT count(*) AS size FROM public.draw_entries WHERE draw_id = d.id GROUP BY group_id) counts;
    IF total IS NULL OR total < 2 OR bracket IS NULL OR bracket < total OR bracket >= total * 2
        OR (bracket & (bracket - 1)) <> 0 OR jsonb_array_length(p_qualification->'advancing') IS DISTINCT FROM total
        OR (SELECT count(*) FROM jsonb_populate_recordset(NULL::public.draw_matches, p_matches) f WHERE f.stage = 'knockout') <> bracket - 1
        OR (SELECT count(DISTINCT e.id) FROM jsonb_populate_recordset(NULL::public.draw_matches, p_matches) f
            CROSS JOIN LATERAL unnest(ARRAY[f.entry_one_id, f.entry_two_id]) e(id) WHERE f.stage = 'knockout' AND f.round_number = 1) <> total
        OR (SELECT count(e.id) FROM jsonb_populate_recordset(NULL::public.draw_matches, p_matches) f
            CROSS JOIN LATERAL unnest(ARRAY[f.entry_one_id, f.entry_two_id]) e(id) WHERE f.stage = 'knockout' AND f.round_number = 1) <> total
    THEN RAISE EXCEPTION 'The elimination bracket is incomplete'; END IF;
    IF EXISTS (
        (SELECT value::uuid FROM jsonb_array_elements_text(p_qualification->'advancing')
        EXCEPT
        SELECT e.id FROM jsonb_populate_recordset(NULL::public.draw_matches, p_matches) f
        CROSS JOIN LATERAL unnest(ARRAY[f.entry_one_id, f.entry_two_id]) e(id) WHERE f.stage = 'knockout' AND f.round_number = 1)
    ) OR EXISTS (
        SELECT 1 FROM jsonb_populate_recordset(NULL::public.draw_matches, p_matches) f
        CROSS JOIN LATERAL unnest(ARRAY[f.entry_one_id, f.entry_two_id, f.winner_entry_id]) e(id)
        WHERE e.id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.draw_entries WHERE id = e.id AND draw_id = d.id
        )
    ) THEN RAISE EXCEPTION 'The knockout contains a team outside this draw'; END IF;
    INSERT INTO public.draw_matches(id, draw_id, stage, round_code, round_label, round_number, bracket_position,
        entry_one_id, entry_two_id, winner_entry_id, status, result_type)
    SELECT f.id, d.id, f.stage, f.round_code, f.round_label, f.round_number, f.bracket_position,
        f.entry_one_id, f.entry_two_id, f.winner_entry_id,
        CASE WHEN f.result_type = 'walkover' THEN 'walkover' ELSE 'pending' END, f.result_type
    FROM jsonb_populate_recordset(NULL::public.draw_matches, p_matches) f;
    IF EXISTS (
        SELECT 1 FROM jsonb_populate_recordset(NULL::public.draw_matches, p_matches) f
        CROSS JOIN LATERAL unnest(ARRAY[f.winner_to_match_id, f.loser_to_match_id]) e(id)
        WHERE e.id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.draw_matches WHERE id = e.id AND draw_id = d.id AND stage <> 'group')
    ) THEN RAISE EXCEPTION 'The knockout contains an invalid route'; END IF;
    UPDATE public.draw_matches m SET winner_to_match_id = f.winner_to_match_id, winner_to_slot = f.winner_to_slot,
        loser_to_match_id = f.loser_to_match_id, loser_to_slot = f.loser_to_slot
    FROM jsonb_populate_recordset(NULL::public.draw_matches, p_matches) f WHERE m.id = f.id;
    INSERT INTO public.native_draw_edit_audit(draw_id, generation, action, details, actor_id, actor_email)
    VALUES(d.id, d.generated_at, CASE WHEN NULLIF(trim(p_qualification->>'reason'), '') IS NULL THEN 'qualification' ELSE 'qualification_override' END,
        p_qualification, auth.uid(), auth.jwt()->>'email');
    UPDATE public.draws SET updated_at = clock_timestamp() WHERE id = d.id;
    PERFORM public.resolve_draw_routes(d.id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.native_save_group_draw(bigint, uuid, timestamptz, text, smallint, jsonb, jsonb, jsonb, jsonb, jsonb),
    public.native_apply_group_edit(uuid, timestamptz, jsonb, uuid[], uuid, uuid, jsonb, uuid),
    public.native_create_group_elimination(uuid, timestamptz, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.native_save_group_draw(bigint, uuid, timestamptz, text, smallint, jsonb, jsonb, jsonb, jsonb, jsonb),
    public.native_apply_group_edit(uuid, timestamptz, jsonb, uuid[], uuid, uuid, jsonb, uuid),
    public.native_create_group_elimination(uuid, timestamptz, jsonb, jsonb, jsonb) TO authenticated;
