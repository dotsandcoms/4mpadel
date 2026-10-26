CREATE OR REPLACE FUNCTION public.tm_resolve_routes(p_draw_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
#variable_conflict use_column
DECLARE m record; f record; slot integer; all_known boolean; v uuid; one_id uuid; two_id uuid; changed boolean; pass integer;
BEGIN
    PERFORM 1 FROM public.draws WHERE id=p_draw_id FOR UPDATE;
    FOR pass IN 1..(SELECT count(*) FROM public.draw_matches WHERE draw_id=p_draw_id) LOOP
        changed:=false;
        FOR m IN SELECT * FROM public.draw_matches WHERE draw_id=p_draw_id AND status IN ('pending','scheduled') ORDER BY round_number,bracket_position LOOP
            all_known:=true; one_id:=m.entry_one_id; two_id:=m.entry_two_id;
            FOR slot IN 1..2 LOOP
                SELECT d.*, CASE WHEN d.winner_to_match_id=m.id AND d.winner_to_slot=slot THEN d.winner_entry_id ELSE d.loser_entry_id END AS outcome INTO f FROM public.draw_matches d
                WHERE (d.winner_to_match_id=m.id AND d.winner_to_slot=slot) OR (d.loser_to_match_id=m.id AND d.loser_to_slot=slot) LIMIT 1;
                IF FOUND THEN
                    IF f.status IN ('completed','walkover','retired','cancelled') THEN
                        v:=f.outcome; IF slot=1 THEN one_id:=v; ELSE two_id:=v; END IF;
                    ELSE all_known:=false; END IF;
                ELSIF (slot=1 AND one_id IS NULL) OR (slot=2 AND two_id IS NULL) THEN all_known:=false;
                END IF;
            END LOOP;
            IF one_id IS DISTINCT FROM m.entry_one_id OR two_id IS DISTINCT FROM m.entry_two_id OR (all_known AND (one_id IS NULL OR two_id IS NULL)) THEN
                UPDATE public.draw_matches SET entry_one_id=one_id,entry_two_id=two_id,
                    winner_entry_id=CASE WHEN all_known AND (one_id IS NULL OR two_id IS NULL) THEN COALESCE(one_id,two_id) ELSE winner_entry_id END,
                    status=CASE WHEN all_known AND one_id IS NULL AND two_id IS NULL THEN 'cancelled' WHEN all_known AND (one_id IS NULL OR two_id IS NULL) THEN 'walkover' ELSE status END,
                    result_type=CASE WHEN all_known AND one_id IS NULL AND two_id IS NULL THEN 'cancelled' WHEN all_known AND (one_id IS NULL OR two_id IS NULL) THEN 'walkover' ELSE result_type END,
                    updated_at=clock_timestamp() WHERE id=m.id;
                changed:=true;
            END IF;
        END LOOP;
        EXIT WHEN NOT changed;
    END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.tm_resolve_routes(uuid) FROM PUBLIC,anon,authenticated;
ALTER TABLE public.draw_matches ADD COLUMN IF NOT EXISTS actual_start timestamptz, ADD COLUMN IF NOT EXISTS actual_finish timestamptz;
CREATE FUNCTION public.tm_save_draw(p_event bigint,p_division uuid,p_expected integer,p_draw jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
#variable_conflict use_column
DECLARE c public.tournament_confirmations; d public.draws; x jsonb; v_draw uuid; rotation jsonb; format_name text; r public.event_registrations;
BEGIN
 PERFORM public.tm_require(p_event,'draws');
 PERFORM pg_advisory_xact_lock(hashtextextended('tm:'||p_event,0));
 SELECT * INTO c FROM public.tournament_confirmations WHERE division_id=p_division AND event_id=p_event FOR UPDATE;
 IF c.division_id IS NULL OR c.revision<>p_expected OR c.players_confirmed_at IS NULL OR c.format_confirmed_at IS NULL OR c.players_fingerprint<>public.tm_player_fingerprint(p_division) OR (c.configuration->>'format' NOT IN('americano','team_americano') AND c.seeds_confirmed_at IS NULL) THEN RAISE EXCEPTION 'Confirm the current players, seeds and format first'; END IF;
 SELECT * INTO d FROM public.draws WHERE division_id=p_division AND draw_kind='main' FOR UPDATE;
 IF d.id IS NOT NULL AND d.status<>'draft' THEN RAISE EXCEPTION 'Published draws cannot be regenerated'; END IF;
 format_name:=CASE WHEN c.configuration->>'format'='team_americano' THEN 'americano' ELSE c.configuration->>'format' END;
 IF p_draw->>'format' IS DISTINCT FROM format_name THEN RAISE EXCEPTION 'Format changed. Generate a fresh preview'; END IF;
 v_draw:=COALESCE(d.id,gen_random_uuid());
 INSERT INTO public.draws(id,event_id,division_id,draw_kind,format,status,seeding_method,scoring_rules,group_count,advancers_per_group,generated_at)
 VALUES(v_draw,p_event,p_division,'main',format_name,'draft','manual',c.configuration||jsonb_build_object('preparation_revision',c.revision),(c.configuration->>'groups')::integer,(c.configuration->>'advancers')::integer,now())
 ON CONFLICT(id) DO UPDATE SET format=excluded.format,scoring_rules=excluded.scoring_rules,group_count=excluded.group_count,advancers_per_group=excluded.advancers_per_group,generated_at=now(),updated_at=clock_timestamp();
 DELETE FROM public.draw_matches WHERE draw_id=v_draw;
 DELETE FROM public.draw_entries WHERE draw_id=v_draw;
 DELETE FROM public.draw_groups WHERE draw_id=v_draw;
 IF format_name='americano' THEN
  rotation:=p_draw->'rotation';
  IF jsonb_typeof(rotation->'players') IS DISTINCT FROM 'array' OR jsonb_array_length(rotation->'players')<4 OR (rotation->>'points')::integer IS DISTINCT FROM (c.configuration->>'points')::integer OR jsonb_array_length(rotation->'fixtures')<1 THEN RAISE EXCEPTION 'Invalid rotation'; END IF;
  FOR x IN SELECT value FROM jsonb_array_elements(rotation->'players') LOOP
   IF NOT EXISTS(SELECT 1 FROM public.event_registrations WHERE division_id=p_division AND id::text=replace(x->>'id',':partner','') AND status<>'withdrawn' AND NOT (c.review->'excluded')?id::text) THEN RAISE EXCEPTION 'Unknown rotation entrant'; END IF;
  END LOOP;
  UPDATE public.draws SET scoring_rules=scoring_rules||jsonb_build_object('americano',rotation) WHERE id=v_draw;
  FOR x IN SELECT value FROM jsonb_array_elements(rotation->'fixtures') LOOP
   IF jsonb_array_length(x->'one')<>2 OR jsonb_array_length(x->'two')<>2 OR x->'score'<>'null'::jsonb THEN RAISE EXCEPTION 'Invalid new fixture'; END IF;
   INSERT INTO public.draw_matches(draw_id,americano_fixture_key,stage,round_code,round_label,round_number,bracket_position,status,court_name,notes)
   VALUES(v_draw,x->>'id','group','americano_r'||(x->>'round'),'Americano · Round '||(x->>'round'),(x->>'round')::integer,(x->>'wave')::integer,'pending','Court '||(x->>'court'),'Americano');
  END LOOP;
 ELSE
  IF jsonb_array_length(p_draw->'entries') IS DISTINCT FROM (SELECT count(DISTINCT ARRAY[least(lower(trim(email)),lower(trim(partner_email))),greatest(lower(trim(email)),lower(trim(partner_email)))])::integer FROM public.event_registrations WHERE division_id=p_division AND status<>'withdrawn' AND NOT (c.review->'excluded')?id::text) THEN RAISE EXCEPTION 'Every included team must appear once'; END IF;
  IF jsonb_array_length(p_draw->'entries')<2 OR jsonb_array_length(p_draw->'matches')<1 THEN RAISE EXCEPTION 'At least two teams are required'; END IF;
  FOR x IN SELECT value FROM jsonb_array_elements(p_draw->'groups') LOOP
   INSERT INTO public.draw_groups(id,draw_id,name,display_order) VALUES((x->>'id')::uuid,v_draw,x->>'name',(x->>'display_order')::integer);
  END LOOP;
  FOR x IN SELECT value FROM jsonb_array_elements(p_draw->'entries') LOOP
   SELECT * INTO r FROM public.event_registrations WHERE id=(x->>'source_registration_id')::uuid AND division_id=p_division AND status<>'withdrawn' AND NOT (c.review->'excluded')?id::text;
   IF r.id IS NULL OR NULLIF(trim(r.partner_email),'') IS NULL OR NULLIF(trim(r.partner_name),'') IS NULL THEN RAISE EXCEPTION 'Each team needs an included registration and partner'; END IF;
   IF x->>'group_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.draw_groups WHERE id=(x->>'group_id')::uuid AND draw_id=v_draw) THEN RAISE EXCEPTION 'Group belongs to another draw'; END IF;
   INSERT INTO public.draw_entries(id,draw_id,source_registration_id,player_one_id,player_two_id,team_name,player_one_name,player_two_name,seed_number,seeding_value,group_id,snapshot)
   VALUES((x->>'id')::uuid,v_draw,r.id,(SELECT id FROM public.players WHERE lower(email)=lower(r.email) LIMIT 1),(SELECT id FROM public.players WHERE lower(email)=lower(r.partner_email) LIMIT 1),r.full_name||' / '||r.partner_name,r.full_name,r.partner_name,(SELECT ord::integer FROM jsonb_array_elements_text(c.review->'seeds') WITH ORDINALITY seed(value,ord) WHERE value=r.id::text),NULL,(x->>'group_id')::uuid,jsonb_build_object('registration_email',r.email,'partner_email',r.partner_email));
  END LOOP;
  IF EXISTS(SELECT email FROM (SELECT lower(snapshot->>'registration_email') email FROM public.draw_entries WHERE draw_id=v_draw UNION ALL SELECT lower(snapshot->>'partner_email') FROM public.draw_entries WHERE draw_id=v_draw) people GROUP BY email HAVING count(*)>1) THEN RAISE EXCEPTION 'Each player must belong to one team only'; END IF;
  FOR x IN SELECT value FROM jsonb_array_elements(p_draw->'matches') LOOP
   IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(jsonb_build_array(x->>'entry_one_id',x->>'entry_two_id',x->>'winner_entry_id')) candidate(value) WHERE candidate.value IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.draw_entries WHERE draw_id=v_draw AND draw_entries.id=candidate.value::uuid)) THEN RAISE EXCEPTION 'Match entrant belongs to another draw'; END IF;
   INSERT INTO public.draw_matches(id,draw_id,group_id,stage,round_code,round_label,round_number,bracket_position,entry_one_id,entry_two_id,winner_entry_id,status,result_type)
   VALUES((x->>'id')::uuid,v_draw,(x->>'group_id')::uuid,x->>'stage',x->>'round_code',x->>'round_label',(x->>'round_number')::integer,(x->>'bracket_position')::integer,(x->>'entry_one_id')::uuid,(x->>'entry_two_id')::uuid,(x->>'winner_entry_id')::uuid,CASE WHEN x->>'result_type'='walkover' AND (x->>'entry_one_id' IS NULL OR x->>'entry_two_id' IS NULL) THEN 'walkover' ELSE 'pending' END,CASE WHEN x->>'result_type'='walkover' THEN 'walkover' ELSE NULL END);
  END LOOP;
  FOR x IN SELECT value FROM jsonb_array_elements(p_draw->'matches') LOOP
   IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(jsonb_build_array(x->>'winner_to_match_id',x->>'loser_to_match_id')) candidate(value) WHERE candidate.value IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.draw_matches WHERE draw_id=v_draw AND draw_matches.id=candidate.value::uuid)) THEN RAISE EXCEPTION 'Feeder belongs to another draw'; END IF;
   UPDATE public.draw_matches SET winner_to_match_id=(x->>'winner_to_match_id')::uuid,winner_to_slot=(x->>'winner_to_slot')::integer,loser_to_match_id=(x->>'loser_to_match_id')::uuid,loser_to_slot=(x->>'loser_to_slot')::integer WHERE id=(x->>'id')::uuid AND draw_id=v_draw;
  END LOOP;
 END IF;
 PERFORM public.tm_log(p_event,'draw.saved',jsonb_build_object('division_id',p_division,'draw_id',v_draw));
END $$;
CREATE FUNCTION public.tm_publish_draw(p_event bigint,p_draw uuid,p_expected timestamptz) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
#variable_conflict use_column
DECLARE d public.draws; c public.tournament_confirmations;
BEGIN
 PERFORM public.tm_require(p_event,'draws'); PERFORM pg_advisory_xact_lock(hashtextextended('tm:'||p_event,0));
 SELECT * INTO d FROM public.draws WHERE id=p_draw AND event_id=p_event FOR UPDATE;
 IF d.id IS NULL OR d.status<>'draft' OR d.updated_at IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Draw changed. Reload and preview again'; END IF;
 SELECT * INTO c FROM public.tournament_confirmations WHERE division_id=d.division_id;
 IF c.players_confirmed_at IS NULL OR c.format_confirmed_at IS NULL OR c.players_fingerprint IS DISTINCT FROM public.tm_player_fingerprint(d.division_id) OR (d.format<>'americano' AND c.seeds_confirmed_at IS NULL) THEN RAISE EXCEPTION 'Preparation needs confirmation'; END IF;
 IF (d.scoring_rules->>'preparation_revision')::integer IS DISTINCT FROM c.revision THEN RAISE EXCEPTION 'Preparation changed. Generate and save a fresh preview'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.draw_matches WHERE draw_id=d.id) THEN RAISE EXCEPTION 'Generate a draw first'; END IF;
 UPDATE public.draws SET status='published',published_at=now(),updated_at=clock_timestamp() WHERE id=d.id;
 PERFORM public.tm_log(p_event,'draw.published',jsonb_build_object('division_id',d.division_id));
END $$;

CREATE FUNCTION public.tm_refresh_standings(p_draw uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
#variable_conflict use_column
BEGIN
 INSERT INTO public.draw_standings(draw_id,group_id,entry_id,played,won,lost,sets_for,sets_against,games_for,games_against,standings_points,position,requires_manual_resolution,updated_at)
 WITH totals AS (
 SELECT e.id,e.group_id,e.seed_number,
 count(DISTINCT m.id)::integer played,count(DISTINCT m.id) FILTER(WHERE m.winner_entry_id=e.id)::integer won,
 count(s.id) FILTER(WHERE CASE WHEN e.id=m.entry_one_id THEN s.entry_one_games>s.entry_two_games ELSE s.entry_two_games>s.entry_one_games END)::integer sf,
 count(s.id) FILTER(WHERE CASE WHEN e.id=m.entry_one_id THEN s.entry_one_games<s.entry_two_games ELSE s.entry_two_games<s.entry_one_games END)::integer sa,
 COALESCE(sum(CASE WHEN e.id=m.entry_one_id THEN s.entry_one_games ELSE s.entry_two_games END),0)::integer gf,
 COALESCE(sum(CASE WHEN e.id=m.entry_one_id THEN s.entry_two_games ELSE s.entry_one_games END),0)::integer ga
 FROM public.draw_entries e LEFT JOIN public.draw_matches m ON m.draw_id=e.draw_id AND m.group_id=e.group_id AND e.id IN(m.entry_one_id,m.entry_two_id) AND m.status IN('completed','walkover','retired') AND m.entry_one_id IS NOT NULL AND m.entry_two_id IS NOT NULL
 LEFT JOIN public.draw_match_sets s ON s.match_id=m.id WHERE e.draw_id=p_draw AND e.group_id IS NOT NULL GROUP BY e.id
 ), with_head_to_head AS (
 SELECT t.*,CASE WHEN (SELECT count(*) FROM totals o WHERE o.group_id=t.group_id AND o.won=t.won)=2 THEN COALESCE((SELECT CASE WHEN m.winner_entry_id=t.id THEN 1 ELSE -1 END FROM public.draw_matches m JOIN totals o ON o.group_id=t.group_id AND o.won=t.won AND o.id<>t.id WHERE m.draw_id=p_draw AND m.group_id=t.group_id AND m.winner_entry_id IS NOT NULL AND t.id IN(m.entry_one_id,m.entry_two_id) AND o.id IN(m.entry_one_id,m.entry_two_id) LIMIT 1),0) ELSE 0 END AS h2h FROM totals t
 ), ranked AS (
 SELECT *,row_number() OVER(PARTITION BY group_id ORDER BY won DESC,h2h DESC,sf-sa DESC,gf-ga DESC,gf DESC,seed_number NULLS LAST,id) pos,
 count(*) OVER(PARTITION BY group_id,won,h2h,sf-sa,gf-ga,gf)>1 tied FROM with_head_to_head
 )
 SELECT p_draw,group_id,id,played,won,played-won,sf,sa,gf,ga,won*2,pos,tied,clock_timestamp() FROM ranked
 ON CONFLICT(group_id,entry_id) DO UPDATE SET played=excluded.played,won=excluded.won,lost=excluded.lost,sets_for=excluded.sets_for,sets_against=excluded.sets_against,games_for=excluded.games_for,games_against=excluded.games_against,standings_points=excluded.standings_points,position=excluded.position,requires_manual_resolution=excluded.requires_manual_resolution,updated_at=excluded.updated_at;
END $$;

CREATE FUNCTION public.tm_record_result(p_event bigint,p_match uuid,p_expected timestamptz,p_result jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
#variable_conflict use_column
DECLARE m public.draw_matches; d public.draws; score jsonb; one_wins integer:=0; two_wins integer:=0; n integer:=0; a integer; b integer; winner uuid; loser uuid; kind text:=p_result->>'kind'; correction boolean; fixture jsonb; total integer;
BEGIN
 IF NOT (public.tm_capabilities(p_event) && ARRAY['results','corrections']) THEN PERFORM public.tm_require(p_event,'results'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('tm:'||p_event,0));
 SELECT mm.* INTO m FROM public.draw_matches mm JOIN public.draws dd ON dd.id=mm.draw_id WHERE mm.id=p_match AND dd.event_id=p_event FOR UPDATE OF mm;
 SELECT * INTO d FROM public.draws WHERE id=m.draw_id FOR UPDATE;
 IF m.id IS NULL OR d.status NOT IN('published','in_progress') OR m.updated_at IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Match changed or is locked. Reload.'; END IF;
 correction:=m.status IN('completed','walkover','retired');
 IF NOT correction THEN PERFORM public.tm_require(p_event,'results'); END IF;
 IF correction THEN
  PERFORM public.tm_require(p_event,'corrections');
  IF m.stage='group' AND EXISTS(SELECT 1 FROM public.draw_matches WHERE draw_id=d.id AND stage='knockout') THEN RAISE EXCEPTION 'Elimination already uses these group standings. Reopen qualification before correcting a group result'; END IF;
  IF length(trim(COALESCE(p_result->>'reason','')))=0 THEN RAISE EXCEPTION 'Record a correction reason'; END IF;
  IF EXISTS(WITH RECURSIVE downstream AS (SELECT id,winner_to_match_id,loser_to_match_id,status FROM public.draw_matches WHERE id IN(m.winner_to_match_id,m.loser_to_match_id) UNION SELECT n.id,n.winner_to_match_id,n.loser_to_match_id,n.status FROM public.draw_matches n JOIN downstream f ON n.id IN(f.winner_to_match_id,f.loser_to_match_id)) SELECT 1 FROM downstream WHERE status NOT IN('pending','scheduled')) THEN RAISE EXCEPTION 'A downstream match has started. Resolve that match before correcting this result.'; END IF;
 END IF;
 IF kind='live' THEN
  IF correction OR m.status='cancelled' OR (d.format<>'americano' AND (m.entry_one_id IS NULL OR m.entry_two_id IS NULL)) THEN RAISE EXCEPTION 'This match cannot start'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.tournament_schedules WHERE event_id=p_event AND published_revision IS NOT NULL) THEN RAISE EXCEPTION 'Publish the tournament schedule before starting play'; END IF;
  IF EXISTS(SELECT 1 FROM public.draw_matches f WHERE f.draw_id=m.draw_id AND (f.winner_to_match_id=m.id OR f.loser_to_match_id=m.id) AND f.status NOT IN('completed','walkover','retired','cancelled')) THEN RAISE EXCEPTION 'An earlier match is still unresolved'; END IF;
  IF EXISTS(SELECT 1 FROM public.draw_matches other JOIN public.draws od ON od.id=other.draw_id WHERE od.event_id=p_event AND other.id<>m.id AND other.status='in_progress' AND (other.court_name=m.court_name OR public.tm_match_players(other.id) && public.tm_match_players(m.id))) THEN RAISE EXCEPTION 'A court or player is already in a live match'; END IF;
  UPDATE public.draw_matches SET status='in_progress',actual_start=now(),updated_at=clock_timestamp() WHERE id=m.id;
 ELSIF d.format='americano' THEN
  IF kind<>'played' THEN RAISE EXCEPTION 'Americano requires the rally-point result'; END IF;
  score:=p_result->'score'; total:=(d.scoring_rules->'americano'->>'points')::integer;
  IF jsonb_typeof(score) IS DISTINCT FROM 'array' OR jsonb_array_length(score)<>2 OR score->0='null'::jsonb OR score->1='null'::jsonb OR (score->>0)::numeric<>trunc((score->>0)::numeric) OR (score->>1)::numeric<>trunc((score->>1)::numeric) OR (score->>0)::integer<0 OR (score->>1)::integer<0 OR (score->>0)::integer+(score->>1)::integer<>total THEN RAISE EXCEPTION 'Both scores must add up to %',total; END IF;
  SELECT f INTO fixture FROM jsonb_array_elements(d.scoring_rules->'americano'->'fixtures') f WHERE f->>'id'=m.americano_fixture_key;
  IF fixture IS NULL THEN RAISE EXCEPTION 'Unknown rotation match'; END IF;
  UPDATE public.draws SET scoring_rules=jsonb_set(scoring_rules,'{americano,fixtures}',(SELECT jsonb_agg(CASE WHEN f->>'id'=m.americano_fixture_key THEN jsonb_set(f,'{score}',score) ELSE f END ORDER BY ord) FROM jsonb_array_elements(scoring_rules->'americano'->'fixtures') WITH ORDINALITY x(f,ord))),updated_at=clock_timestamp() WHERE id=d.id;
  UPDATE public.draw_matches SET status='completed',result_type='played',actual_finish=now(),updated_at=clock_timestamp() WHERE id=m.id;
 ELSE
  IF m.entry_one_id IS NULL OR m.entry_two_id IS NULL OR m.status='cancelled' OR kind NOT IN('played','walkover','retirement') THEN RAISE EXCEPTION 'This match is not ready for a result'; END IF;
  winner:=(p_result->>'winner')::uuid;
  IF winner IS NULL OR winner NOT IN(m.entry_one_id,m.entry_two_id) THEN RAISE EXCEPTION 'Choose a participating winner'; END IF;
  loser:=CASE WHEN winner=m.entry_one_id THEN m.entry_two_id ELSE m.entry_one_id END;
  IF kind<>'walkover' THEN
   FOR score IN SELECT value FROM jsonb_array_elements(p_result->'sets') LOOP
    IF kind='played' AND greatest(one_wins,two_wins)>=COALESCE((d.scoring_rules->>'sets_to_win')::integer,2) THEN RAISE EXCEPTION 'Remove sets after the match was won'; END IF;
    n:=n+1; a:=(score->>0)::integer; b:=(score->>1)::integer;
    IF a<0 OR b<0 OR a IS NULL OR b IS NULL OR (score->>0)::numeric<>a OR (score->>1)::numeric<>b OR (kind='played' AND NOT ((greatest(a,b)=6 AND least(a,b)<=4) OR (greatest(a,b)=7 AND least(a,b) IN(5,6)) OR (COALESCE((d.scoring_rules->>'match_tiebreak')::boolean,false) AND n=3 AND greatest(a,b)>=10 AND abs(a-b)>=2))) THEN RAISE EXCEPTION 'Enter a valid set score'; END IF;
    IF a>b THEN one_wins:=one_wins+1; ELSIF b>a THEN two_wins:=two_wins+1; END IF;
   END LOOP;
   IF kind='played' AND (n<1 OR n>2*COALESCE((d.scoring_rules->>'sets_to_win')::integer,2)-1 OR greatest(one_wins,two_wins)<>COALESCE((d.scoring_rules->>'sets_to_win')::integer,2) OR (winner=m.entry_one_id AND one_wins<=two_wins) OR (winner=m.entry_two_id AND two_wins<=one_wins)) THEN RAISE EXCEPTION 'The score must agree with the winner and match format'; END IF;
  END IF;
  DELETE FROM public.draw_match_sets WHERE match_id=m.id;
  IF kind<>'walkover' THEN
   INSERT INTO public.draw_match_sets(match_id,set_number,entry_one_games,entry_two_games) SELECT m.id,ord,(s->>0)::integer,(s->>1)::integer FROM jsonb_array_elements(p_result->'sets') WITH ORDINALITY x(s,ord);
  END IF;
  UPDATE public.draw_matches SET winner_entry_id=winner,loser_entry_id=loser,status=CASE kind WHEN 'walkover' THEN 'walkover' WHEN 'retirement' THEN 'retired' ELSE 'completed' END,result_type=kind,actual_finish=now(),updated_at=clock_timestamp() WHERE id=m.id;
  UPDATE public.draw_matches SET entry_one_id=CASE WHEN id=m.winner_to_match_id AND m.winner_to_slot=1 THEN winner WHEN id=m.loser_to_match_id AND m.loser_to_slot=1 THEN loser ELSE entry_one_id END,entry_two_id=CASE WHEN id=m.winner_to_match_id AND m.winner_to_slot=2 THEN winner WHEN id=m.loser_to_match_id AND m.loser_to_slot=2 THEN loser ELSE entry_two_id END,updated_at=clock_timestamp() WHERE draw_id=d.id AND id IN(m.winner_to_match_id,m.loser_to_match_id);
  PERFORM public.tm_resolve_routes(d.id);
  IF m.group_id IS NOT NULL THEN PERFORM public.tm_refresh_standings(d.id); END IF;
 END IF;
 INSERT INTO public.draw_match_audit(match_id,action,before_state,after_state,actor_email) VALUES(m.id,CASE WHEN kind='live' THEN 'status_changed' WHEN correction THEN 'score_corrected' ELSE 'score_recorded' END,to_jsonb(m),p_result,(SELECT email FROM auth.users WHERE id=auth.uid()));
 PERFORM public.tm_log(p_event,CASE WHEN kind='live' THEN 'match.started' WHEN correction THEN 'result.corrected' ELSE 'result.recorded' END,jsonb_build_object('match_id',m.id,'reason',p_result->>'reason'));
END $$;
CREATE FUNCTION public.tm_finalise(p_event bigint,p_division uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
#variable_conflict use_column
BEGIN
 PERFORM public.tm_require(p_event,'corrections'); PERFORM pg_advisory_xact_lock(hashtextextended('tm:'||p_event,0));
 IF NOT EXISTS(SELECT 1 FROM public.draws WHERE division_id=p_division AND event_id=p_event AND draw_kind='main') OR EXISTS(SELECT 1 FROM public.draws d WHERE division_id=p_division AND event_id=p_event AND (status NOT IN('published','in_progress','completed') OR (format='group_knockout' AND NOT EXISTS(SELECT 1 FROM public.draw_matches WHERE draw_id=d.id AND stage='knockout')))) OR EXISTS(SELECT 1 FROM public.draw_matches m JOIN public.draws d ON d.id=m.draw_id WHERE d.division_id=p_division AND d.event_id=p_event AND m.status NOT IN('completed','walkover','retired','cancelled')) THEN RAISE EXCEPTION 'Resolve every match, including placement and elimination rounds, first'; END IF;
 IF EXISTS(SELECT 1 FROM public.draw_standings s JOIN public.draws d ON d.id=s.draw_id WHERE d.division_id=p_division AND d.event_id=p_event AND s.requires_manual_resolution) THEN RAISE EXCEPTION 'Resolve tied group standings before finalising'; END IF;
 UPDATE public.draws SET status='completed',completed_at=now(),updated_at=clock_timestamp() WHERE division_id=p_division AND event_id=p_event;
 INSERT INTO public.tournament_finalisations(division_id,event_id,fingerprint,finalised_by) VALUES(p_division,p_event,public.tm_result_fingerprint(p_division),auth.uid()) ON CONFLICT(division_id) DO UPDATE SET fingerprint=excluded.fingerprint,finalised_by=excluded.finalised_by,finalised_at=now();
 PERFORM public.tm_log(p_event,'division.finalised',jsonb_build_object('division_id',p_division));
END $$;
REVOKE ALL ON FUNCTION public.tm_refresh_standings(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.tm_save_draw(bigint,uuid,integer,jsonb),public.tm_publish_draw(bigint,uuid,timestamptz),public.tm_record_result(bigint,uuid,timestamptz,jsonb),public.tm_finalise(bigint,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tm_save_draw(bigint,uuid,integer,jsonb),public.tm_publish_draw(bigint,uuid,timestamptz),public.tm_record_result(bigint,uuid,timestamptz,jsonb),public.tm_finalise(bigint,uuid) TO authenticated;
