-- Private scheduling revisions and atomic, resource-validated publication.
CREATE FUNCTION public.tm_match_players(p_match uuid) RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH RECURSIVE feeder AS (
 SELECT id,draw_id,entry_one_id,entry_two_id,ARRAY[id] AS seen FROM public.draw_matches WHERE id=p_match
 UNION ALL
 SELECT m.id,m.draw_id,m.entry_one_id,m.entry_two_id,f.seen||m.id FROM public.draw_matches m JOIN feeder f ON m.draw_id=f.draw_id AND (m.winner_to_match_id=f.id OR m.loser_to_match_id=f.id) WHERE NOT m.id=ANY(f.seen)
 ), entrants AS (SELECT DISTINCT e.* FROM public.draw_entries e JOIN feeder f ON e.id IN(f.entry_one_id,f.entry_two_id)), keys AS (
 SELECT unnest(ARRAY[CASE WHEN player_one_id IS NOT NULL THEN 'player:'||player_one_id END,CASE WHEN player_two_id IS NOT NULL THEN 'player:'||player_two_id END,
 CASE WHEN NULLIF(snapshot->>'registration_email','') IS NOT NULL THEN 'email:'||lower(snapshot->>'registration_email') END,CASE WHEN NULLIF(snapshot->>'partner_email','') IS NOT NULL THEN 'email:'||lower(snapshot->>'partner_email') END,
 CASE WHEN player_one_id IS NULL AND NULLIF(snapshot->>'registration_email','') IS NULL THEN 'name:'||lower(trim(player_one_name)) END,
 CASE WHEN player_two_id IS NULL AND NULLIF(snapshot->>'partner_email','') IS NULL THEN 'name:'||lower(trim(player_two_name)) END]) AS key FROM entrants
 UNION ALL
 SELECT 'email:'||lower(CASE WHEN pid LIKE '%:partner' THEN r.partner_email ELSE r.email END) FROM public.draw_matches m JOIN public.draws d ON d.id=m.draw_id CROSS JOIN LATERAL jsonb_array_elements(d.scoring_rules->'americano'->'fixtures') f CROSS JOIN LATERAL jsonb_array_elements_text((f->'one')||(f->'two')) pid JOIN public.event_registrations r ON r.id::text=replace(pid,':partner','') WHERE m.id=p_match AND f->>'id'=m.americano_fixture_key
 ) SELECT COALESCE(array_agg(DISTINCT key) FILTER(WHERE key IS NOT NULL),'{}') FROM keys;
$$;
CREATE FUNCTION public.tm_validate_schedule(p_event bigint,p_assignments jsonb,p_fixtures jsonb,p_settings jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
#variable_conflict use_column
DECLARE a record; b record; m public.draw_matches; d public.draws; day public.event_play_days; start_at timestamptz; end_at timestamptz; court integer; rest interval; player_keys text[]; other_keys text[]; fixture jsonb; virtual_count integer;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.tournament_divisions WHERE event_id=p_event AND is_active) THEN RAISE EXCEPTION 'Add active divisions first'; END IF;
 IF EXISTS(SELECT 1 FROM public.tournament_divisions v WHERE event_id=p_event AND is_active AND NOT EXISTS(SELECT 1 FROM public.draws d WHERE d.division_id=v.id AND draw_kind='main' AND status IN('published','in_progress','completed'))) OR EXISTS(SELECT 1 FROM public.draws d JOIN public.tournament_divisions v ON v.id=d.division_id WHERE d.event_id=p_event AND v.is_active AND d.status='draft') THEN RAISE EXCEPTION 'Publish every active division draw before scheduling'; END IF;
 IF jsonb_typeof(p_assignments) IS DISTINCT FROM 'object' OR (p_settings->>'rest')::integer<0 THEN RAISE EXCEPTION 'Invalid schedule'; END IF;
 rest:=make_interval(mins=>GREATEST(COALESCE((p_settings->>'rest')::integer,10),COALESCE((SELECT max(minimum_break_minutes) FROM public.event_play_days WHERE event_id=p_event AND is_active),0)));
 IF EXISTS(SELECT 1 FROM public.draw_matches m JOIN public.draws d ON d.id=m.draw_id JOIN public.tournament_divisions v ON v.id=d.division_id WHERE d.event_id=p_event AND v.is_active AND d.status<>'archived' AND m.status IN('pending','scheduled','in_progress') AND NOT p_assignments?m.id::text) THEN RAISE EXCEPTION 'Every active match needs a court and time'; END IF;
 FOR a IN SELECT * FROM jsonb_each(p_assignments) LOOP
  start_at:=(a.value->>'scheduled_start')::timestamptz; end_at:=(a.value->>'scheduled_end')::timestamptz;
  IF start_at IS NULL OR end_at IS NULL OR end_at<=start_at THEN RAISE EXCEPTION 'Invalid match times'; END IF;
  SELECT * INTO day FROM public.event_play_days WHERE event_id=p_event AND is_active AND NOT COALESCE(is_removed,false) AND play_date=(start_at AT TIME ZONE 'Africa/Johannesburg')::date;
  court:=substring(a.value->>'court_name' FROM '^Court ([0-9]+)$')::integer;
  IF day.id IS NULL OR court IS NULL OR court<1 OR court>day.courts_count OR start_at<((day.play_date+day.start_time) AT TIME ZONE 'Africa/Johannesburg') OR end_at>((day.play_date+day.end_time) AT TIME ZONE 'Africa/Johannesburg') THEN RAISE EXCEPTION 'A booking is outside court availability'; END IF;
  IF position(':future:' IN a.key)>0 THEN
   SELECT * INTO d FROM public.draws WHERE id=split_part(a.key,':',1)::uuid AND event_id=p_event AND format='group_knockout';
   IF d.id IS NULL THEN RAISE EXCEPTION 'Unknown provisional fixture'; END IF;
   SELECT value INTO fixture FROM jsonb_array_elements(p_fixtures) WHERE value->>'id'=a.key AND value->>'draw_id'=d.id::text;
   IF fixture IS NULL THEN RAISE EXCEPTION 'Missing provisional fixture'; END IF;
   SELECT COALESCE(array_agg(DISTINCT k),'{}') INTO player_keys FROM public.draw_matches mm CROSS JOIN LATERAL unnest(public.tm_match_players(mm.id)) k WHERE mm.draw_id=d.id;
  ELSE
   SELECT mm.* INTO m FROM public.draw_matches mm JOIN public.draws dd ON dd.id=mm.draw_id WHERE mm.id=a.key::uuid AND dd.event_id=p_event;
   IF m.id IS NULL THEN RAISE EXCEPTION 'Unknown match'; END IF;
   SELECT * INTO d FROM public.draws WHERE id=m.draw_id;
   IF m.status NOT IN('pending','scheduled') AND (m.scheduled_start IS DISTINCT FROM start_at OR m.scheduled_end IS DISTINCT FROM end_at OR m.court_name IS DISTINCT FROM a.value->>'court_name') THEN RAISE EXCEPTION 'Started or resolved matches cannot be moved'; END IF;
   IF m.not_before IS NOT NULL AND start_at<m.not_before THEN RAISE EXCEPTION 'Match scheduled before its earliest start'; END IF;
   IF m.match_duration_minutes IS NOT NULL AND end_at-start_at<make_interval(mins=>m.match_duration_minutes) THEN RAISE EXCEPTION 'Match duration is too short'; END IF;
   player_keys:=public.tm_match_players(m.id);
   IF EXISTS(SELECT 1 FROM public.draw_matches f WHERE f.draw_id=m.draw_id AND (f.winner_to_match_id=m.id OR f.loser_to_match_id=m.id) AND f.status NOT IN('completed','walkover','retired','cancelled') AND (NOT p_assignments?f.id::text OR (p_assignments->f.id::text->>'scheduled_end')::timestamptz+rest>start_at)) THEN RAISE EXCEPTION 'A predecessor must finish and leave enough rest'; END IF;
  END IF;
  IF jsonb_array_length(COALESCE(p_settings->'divisionDays'->d.division_id::text,'[]'))>0 AND NOT (p_settings->'divisionDays'->d.division_id::text)?day.play_date::text THEN RAISE EXCEPTION 'Division cannot play on this day'; END IF;
  FOR b IN SELECT * FROM jsonb_each(p_assignments) WHERE key>a.key LOOP
   IF position(':future:' IN b.key)>0 THEN
    SELECT COALESCE(array_agg(DISTINCT k),'{}') INTO other_keys FROM public.draw_matches mm CROSS JOIN LATERAL unnest(public.tm_match_players(mm.id)) k WHERE mm.draw_id=split_part(b.key,':',1)::uuid;
   ELSE other_keys:=public.tm_match_players(b.key::uuid); END IF;
   IF a.value->>'court_name'=b.value->>'court_name' AND start_at<(b.value->>'scheduled_end')::timestamptz AND end_at>(b.value->>'scheduled_start')::timestamptz THEN RAISE EXCEPTION 'Court overlap'; END IF;
   IF player_keys && other_keys AND start_at<(b.value->>'scheduled_end')::timestamptz+rest AND end_at+rest>(b.value->>'scheduled_start')::timestamptz THEN RAISE EXCEPTION 'Player clash or insufficient rest'; END IF;
  END LOOP;
 END LOOP;
 FOR d IN SELECT * FROM public.draws WHERE event_id=p_event AND format='group_knockout' AND status<>'archived' LOOP
  IF NOT EXISTS(SELECT 1 FROM public.draw_matches WHERE draw_id=d.id AND stage='knockout') THEN
   SELECT count(*) INTO virtual_count FROM jsonb_each(p_assignments) WHERE key LIKE d.id::text||':future:%';
   IF virtual_count<GREATEST(0,d.group_count*d.advancers_per_group-1) THEN RAISE EXCEPTION 'Reserve the elimination rounds before publication'; END IF;
  END IF;
 END LOOP;
END $$;
CREATE FUNCTION public.tm_save_schedule(p_event bigint,p_expected integer,p_source text,p_assignments jsonb,p_fixtures jsonb,p_settings jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
#variable_conflict use_column
DECLARE s public.tournament_schedules;
BEGIN
 PERFORM public.tm_require(p_event,'schedule');
 PERFORM pg_advisory_xact_lock(hashtextextended('tm:'||p_event,0));
 SELECT * INTO s FROM public.tournament_schedules WHERE event_id=p_event FOR UPDATE;
 IF p_expected=0 AND s.event_id IS NOT NULL THEN RETURN to_jsonb(s); END IF;
 IF COALESCE(s.revision,0)<>p_expected OR p_source IS DISTINCT FROM public.tm_source_fingerprint(p_event) THEN RAISE EXCEPTION 'The tournament changed. Reload and review the schedule.'; END IF;
 PERFORM public.tm_validate_schedule(p_event,p_assignments,p_fixtures,p_settings);
 INSERT INTO public.tournament_schedules(event_id,source_fingerprint,assignments,fixtures,settings,updated_by) VALUES(p_event,p_source,p_assignments,p_fixtures,p_settings,auth.uid())
 ON CONFLICT(event_id) DO UPDATE SET source_fingerprint=p_source,assignments=p_assignments,fixtures=p_fixtures,settings=p_settings,status='draft',revision=tournament_schedules.revision+1,updated_at=clock_timestamp(),updated_by=auth.uid() RETURNING * INTO s;
 PERFORM public.tm_log(p_event,'schedule.draft_saved',jsonb_build_object('revision',s.revision)); RETURN to_jsonb(s);
END $$;
CREATE FUNCTION public.tm_publish_schedule(p_event bigint,p_expected integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
#variable_conflict use_column
DECLARE s public.tournament_schedules; d record;
BEGIN
 PERFORM public.tm_require(p_event,'schedule');
 PERFORM pg_advisory_xact_lock(hashtextextended('tm:'||p_event,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('draw-courts:'||p_event,0));
 SELECT * INTO s FROM public.tournament_schedules WHERE event_id=p_event FOR UPDATE;
 IF s.event_id IS NULL OR s.revision<>p_expected OR s.source_fingerprint IS DISTINCT FROM public.tm_source_fingerprint(p_event) THEN RAISE EXCEPTION 'The tournament changed. Reload and review the schedule.'; END IF;
 PERFORM public.tm_validate_schedule(p_event,s.assignments,s.fixtures,s.settings);
 UPDATE public.draw_matches m SET scheduled_start=NULL,scheduled_end=NULL FROM public.draws d WHERE d.id=m.draw_id AND d.event_id=p_event AND m.status IN('pending','scheduled') AND s.assignments?m.id::text;
 UPDATE public.draw_matches m SET court_name=a.value->>'court_name',scheduled_start=(a.value->>'scheduled_start')::timestamptz,scheduled_end=(a.value->>'scheduled_end')::timestamptz,status='scheduled',updated_at=clock_timestamp()
 FROM jsonb_each(s.assignments) a,public.draws d WHERE d.id=m.draw_id AND d.event_id=p_event AND m.id::text=a.key AND m.status IN('pending','scheduled');
 FOR d IN SELECT * FROM public.draws WHERE event_id=p_event AND format='americano' LOOP
  UPDATE public.draws SET scoring_rules=jsonb_set(scoring_rules,'{americano,fixtures}',(SELECT jsonb_agg(f||jsonb_build_object('scheduled_start',m.scheduled_start,'scheduled_end',m.scheduled_end,'court',substring(m.court_name FROM '[0-9]+$')::integer) ORDER BY ord) FROM jsonb_array_elements(d.scoring_rules->'americano'->'fixtures') WITH ORDINALITY x(f,ord) JOIN public.draw_matches m ON m.draw_id=d.id AND m.americano_fixture_key=f->>'id')),updated_at=clock_timestamp() WHERE id=d.id;
 END LOOP;
 UPDATE public.tournament_schedules SET status='published',published_assignments=assignments,published_revision=revision,source_fingerprint=public.tm_source_fingerprint(p_event),updated_at=clock_timestamp() WHERE event_id=p_event;
 PERFORM public.tm_log(p_event,'schedule.published',jsonb_build_object('revision',s.revision));
END $$;
REVOKE ALL ON FUNCTION public.tm_match_players(uuid),public.tm_validate_schedule(bigint,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.tm_save_schedule(bigint,integer,text,jsonb,jsonb,jsonb),public.tm_publish_schedule(bigint,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tm_save_schedule(bigint,integer,text,jsonb,jsonb,jsonb),public.tm_publish_schedule(bigint,integer) TO authenticated;
