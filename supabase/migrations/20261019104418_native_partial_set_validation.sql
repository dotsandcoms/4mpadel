-- A normal set can be live at 6-6; 7-7 is not a game score.
-- Audited score corrections retain established brackets and points.
CREATE OR REPLACE FUNCTION public.native_record_draw_result(p_match uuid,p_expected timestamptz,p_result jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE
 m public.draw_matches; d public.draws; s jsonb; n integer:=0; a integer; b integer;
 hi integer; lo integer; tb_a integer; tb_b integer; duration integer;
 wins integer[]:=ARRAY[0,0]; summary smallint[]; winner uuid; loser uuid;
 kind text:=p_result->>'kind'; target integer; complete boolean; match_tb boolean; correction boolean; winner_changed boolean;
BEGIN
 SELECT * INTO m FROM public.draw_matches WHERE id=p_match;
 SELECT * INTO d FROM public.draws WHERE id=m.draw_id FOR UPDATE;
 IF d.id IS NULL THEN RAISE EXCEPTION 'Match not found'; END IF;
 -- Database operators already own these tables; client callers retain the
 -- existing manager check and row-level policies. No actor is impersonated.
 IF current_user<>'postgres' AND NOT COALESCE(public.can_manage_native_draw(d.event_id),false) THEN RAISE EXCEPTION 'You cannot manage this draw'; END IF;
 SELECT * INTO m FROM public.draw_matches WHERE id=p_match FOR UPDATE;
 correction:=m.status IN ('completed','walkover','retired');
 IF d.status NOT IN ('published','in_progress','completed') OR m.status NOT IN ('pending','scheduled','in_progress','completed','walkover','retired') OR (d.status='completed' AND NOT correction) OR m.updated_at IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Match changed or is locked. Reload the draw.'; END IF;
 IF m.entry_one_id IS NULL OR m.entry_two_id IS NULL OR kind IS NULL OR kind NOT IN ('live','played','walkover','withdrawal','retirement') THEN RAISE EXCEPTION 'This match is not ready for a result'; END IF;
 IF EXISTS (SELECT 1 FROM public.draw_matches f WHERE f.draw_id=d.id AND (f.winner_to_match_id=m.id OR f.loser_to_match_id=m.id) AND f.status NOT IN ('completed','walkover','retired','cancelled')) THEN RAISE EXCEPTION 'An earlier match is still unresolved'; END IF;
 IF correction THEN
  IF kind='live' THEN RAISE EXCEPTION 'A recorded result cannot become a live score'; END IF;
  IF length(trim(COALESCE(p_result->>'reason','')))=0 THEN RAISE EXCEPTION 'Enter a correction reason'; END IF;
  IF m.stage='group' AND EXISTS(SELECT 1 FROM public.draw_matches WHERE draw_id=d.id AND stage='knockout') THEN RAISE EXCEPTION 'The elimination draw uses these group standings. Reopen qualification before correcting this result.'; END IF;
 END IF;
 target:=COALESCE((d.scoring_rules->>'sets_to_win')::integer,2);
 IF target NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'Unsupported match format'; END IF;
 IF jsonb_typeof(p_result->'sets') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Supply the set scores'; END IF;
 IF jsonb_array_length(p_result->'sets')>target*2-1 THEN RAISE EXCEPTION 'Too many sets'; END IF;
 IF kind IN ('walkover','withdrawal') AND jsonb_array_length(p_result->'sets')<>0 THEN RAISE EXCEPTION 'An unplayed match cannot have set scores'; END IF;
 FOR s IN SELECT value FROM jsonb_array_elements(p_result->'sets') LOOP
  IF greatest(wins[1],wins[2])>=target THEN RAISE EXCEPTION 'Remove sets after the match was won'; END IF;
  n:=n+1;
  IF jsonb_typeof(s->'games') IS DISTINCT FROM 'array' OR jsonb_array_length(s->'games')<>2 THEN RAISE EXCEPTION 'Enter both game scores'; END IF;
  a:=(s->'games'->>0)::integer; b:=(s->'games'->>1)::integer;
  IF a IS NULL OR b IS NULL OR a NOT BETWEEN 0 AND 32767 OR b NOT BETWEEN 0 AND 32767 OR (s->'games'->>0)::numeric<>a OR (s->'games'->>1)::numeric<>b THEN RAISE EXCEPTION 'Enter whole non-negative game scores'; END IF;
  hi:=greatest(a,b); lo:=least(a,b);
  match_tb:=COALESCE((d.scoring_rules->>'match_tiebreak')::boolean,false) AND n=target*2-1;
  complete:=CASE WHEN match_tb THEN (hi=10 AND lo<=8) OR (hi>10 AND hi-lo=2) ELSE (hi=6 AND lo<=4) OR (hi=7 AND lo IN (5,6)) END;
  IF NOT complete AND NOT (kind IN ('live','retirement') AND n=jsonb_array_length(p_result->'sets') AND CASE WHEN match_tb THEN hi<10 OR hi-lo<2 ELSE hi<=6 END) THEN RAISE EXCEPTION 'Enter a valid set score'; END IF;
  IF complete THEN IF a>b THEN wins[1]:=wins[1]+1; ELSE wins[2]:=wins[2]+1; END IF; END IF;
  IF s->'tiebreak' IS NOT NULL AND s->'tiebreak'<>'null'::jsonb THEN
   tb_a:=(s->'tiebreak'->>0)::integer; tb_b:=(s->'tiebreak'->>1)::integer;
   IF jsonb_array_length(s->'tiebreak')<>2 OR tb_a IS NULL OR tb_b IS NULL OR tb_a NOT BETWEEN 0 AND 32767 OR tb_b NOT BETWEEN 0 AND 32767 OR (s->'tiebreak'->>0)::numeric<>tb_a OR (s->'tiebreak'->>1)::numeric<>tb_b OR match_tb OR hi<>7 OR lo<>6 OR (a>b)<>(tb_a>tb_b) OR NOT ((greatest(tb_a,tb_b)=7 AND least(tb_a,tb_b)<=5) OR (greatest(tb_a,tb_b)>7 AND abs(tb_a-tb_b)=2)) THEN RAISE EXCEPTION 'Tiebreak does not agree with the game score'; END IF;
  END IF;
  IF s->>'duration' IS NOT NULL THEN
   duration:=(s->>'duration')::integer;
   IF duration NOT BETWEEN 0 AND 32767 OR (s->>'duration')::numeric<>duration THEN RAISE EXCEPTION 'Enter whole non-negative minutes'; END IF;
  END IF;
 END LOOP;
 IF n>0 THEN summary:=wins::smallint[];
 ELSIF p_result->'summary' IS NOT NULL AND p_result->'summary'<>'null'::jsonb THEN
  IF jsonb_typeof(p_result->'summary') IS DISTINCT FROM 'array' OR jsonb_array_length(p_result->'summary')<>2 THEN RAISE EXCEPTION 'Enter both set totals'; END IF;
  a:=(p_result->'summary'->>0)::integer; b:=(p_result->'summary'->>1)::integer;
  IF a IS NULL OR b IS NULL OR a<0 OR b<0 OR a>target OR b>target OR (p_result->'summary'->>0)::numeric<>a OR (p_result->'summary'->>1)::numeric<>b THEN RAISE EXCEPTION 'Enter valid set totals'; END IF;
  summary:=ARRAY[a,b]::smallint[];
 ELSIF kind='live' THEN summary:=ARRAY[0,0]::smallint[];
 END IF;
 IF kind='played' THEN
  IF summary IS NULL OR greatest(summary[1],summary[2])<>target OR least(summary[1],summary[2])>=target THEN RAISE EXCEPTION 'The winner must win % sets',target; END IF;
  winner:=CASE WHEN summary[1]>summary[2] THEN m.entry_one_id ELSE m.entry_two_id END;
  IF p_result->>'winner' IS NOT NULL AND (p_result->>'winner')::uuid<>winner THEN RAISE EXCEPTION 'Winner does not agree with the score'; END IF;
 ELSIF kind='live' THEN
  IF greatest(summary[1],summary[2])>=target THEN RAISE EXCEPTION 'The match has been won. Save the final result.'; END IF;
 ELSE
  winner:=(p_result->>'winner')::uuid;
  IF winner IS NULL OR winner NOT IN (m.entry_one_id,m.entry_two_id) THEN RAISE EXCEPTION 'Choose a participating winner'; END IF;
 END IF;
 winner_changed:=correction AND m.winner_entry_id IS DISTINCT FROM winner;
 IF winner_changed THEN
  IF d.status='completed' THEN RAISE EXCEPTION 'The draw is complete. Changing the winner requires reopening placements and reviewing awarded points. Score-only corrections can keep the same winner.'; END IF;
  IF EXISTS(WITH RECURSIVE downstream AS (SELECT id,winner_to_match_id,loser_to_match_id,status FROM public.draw_matches WHERE id IN(m.winner_to_match_id,m.loser_to_match_id) UNION SELECT child.id,child.winner_to_match_id,child.loser_to_match_id,child.status FROM public.draw_matches child JOIN downstream parent ON child.id IN(parent.winner_to_match_id,parent.loser_to_match_id)) SELECT 1 FROM downstream WHERE status NOT IN('pending','scheduled')) THEN RAISE EXCEPTION 'A dependent match has already started or finished. Reopen its result before changing this winner.'; END IF;
 END IF;
 loser:=CASE WHEN winner=m.entry_one_id THEN m.entry_two_id WHEN winner=m.entry_two_id THEN m.entry_one_id END;
 DELETE FROM public.draw_match_sets WHERE match_id=m.id;
 INSERT INTO public.draw_match_sets(match_id,set_number,entry_one_games,entry_two_games,is_match_tiebreak,entry_one_tiebreak,entry_two_tiebreak,duration_minutes)
 SELECT m.id,ord,(v->'games'->>0)::smallint,(v->'games'->>1)::smallint,COALESCE((d.scoring_rules->>'match_tiebreak')::boolean,false) AND ord=target*2-1,(v->'tiebreak'->>0)::smallint,(v->'tiebreak'->>1)::smallint,(v->>'duration')::smallint FROM jsonb_array_elements(p_result->'sets') WITH ORDINALITY x(v,ord);
 UPDATE public.draw_matches SET result_summary=summary,winner_entry_id=winner,loser_entry_id=loser,
  status=CASE kind WHEN 'live' THEN 'in_progress' WHEN 'walkover' THEN 'walkover' WHEN 'withdrawal' THEN 'walkover' WHEN 'retirement' THEN 'retired' ELSE 'completed' END,
  result_type=CASE WHEN kind='live' THEN NULL ELSE kind END,
  updated_at=clock_timestamp() WHERE id=m.id;
 IF kind<>'live' AND (NOT correction OR winner_changed) THEN
  UPDATE public.draw_matches SET entry_one_id=CASE WHEN id=m.winner_to_match_id AND m.winner_to_slot=1 THEN winner WHEN id=m.loser_to_match_id AND m.loser_to_slot=1 THEN loser ELSE entry_one_id END,entry_two_id=CASE WHEN id=m.winner_to_match_id AND m.winner_to_slot=2 THEN winner WHEN id=m.loser_to_match_id AND m.loser_to_slot=2 THEN loser ELSE entry_two_id END,updated_at=clock_timestamp() WHERE draw_id=d.id AND id IN (m.winner_to_match_id,m.loser_to_match_id);
  PERFORM public.resolve_draw_routes(d.id);
 END IF;
 INSERT INTO public.draw_match_audit(match_id,action,before_state,after_state,actor_email)
 VALUES(m.id,CASE WHEN correction THEN 'score_corrected' WHEN kind='live' THEN 'status_changed' ELSE 'score_recorded' END,to_jsonb(m),p_result,COALESCE(auth.jwt()->>'email','Database operator (Supabase)'));
END;
$$;
REVOKE ALL ON FUNCTION public.native_record_draw_result(uuid,timestamptz,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.native_record_draw_result(uuid,timestamptz,jsonb) TO authenticated;
