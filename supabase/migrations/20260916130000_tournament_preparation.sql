-- Event-scoped preparation changes; shared registrations remain authoritative.
CREATE FUNCTION public.tm_save_registration(p_event bigint,p_division uuid,p_registration uuid,p_payload jsonb,p_expected text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
#variable_conflict use_column
DECLARE v public.tournament_divisions; r public.event_registrations;
BEGIN
 PERFORM public.tm_require(p_event,'players'); PERFORM pg_advisory_xact_lock(hashtextextended('tm:'||p_event,0));
 SELECT * INTO v FROM public.tournament_divisions WHERE id=p_division AND event_id=p_event;
 IF v.id IS NULL OR NOT v.is_active THEN RAISE EXCEPTION 'Choose an active division'; END IF;
 SELECT * INTO r FROM public.event_registrations WHERE id=p_registration AND event_id=p_event FOR UPDATE;
 IF p_registration IS NOT NULL AND (r.id IS NULL OR md5(to_jsonb(r)::text) IS DISTINCT FROM p_expected) THEN RAISE EXCEPTION 'Registration changed. Reload first'; END IF;
 IF EXISTS(SELECT 1 FROM public.draws WHERE division_id IN(v.id,r.division_id) AND status IN('published','in_progress','completed')) THEN RAISE EXCEPTION 'Published entrants are locked'; END IF;
 IF length(trim(COALESCE(p_payload->>'full_name','')))=0 OR COALESCE(p_payload->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'Enter a player name and valid email'; END IF;
 IF NULLIF(trim(p_payload->>'partner_email'),'') IS NOT NULL AND (COALESCE(p_payload->>'partner_email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR length(trim(COALESCE(p_payload->>'partner_name','')))=0 OR lower(p_payload->>'partner_email')=lower(p_payload->>'email')) THEN RAISE EXCEPTION 'Enter a different partner with a name and valid email'; END IF;
 IF EXISTS(SELECT 1 FROM public.event_registrations WHERE division_id=v.id AND lower(email)=lower(trim(p_payload->>'email')) AND status<>'withdrawn' AND id IS DISTINCT FROM p_registration) THEN RAISE EXCEPTION 'This player already has an entry in this division'; END IF;
 IF p_registration IS NULL THEN
  INSERT INTO public.event_registrations(event_id,division_id,division,full_name,email,partner_name,partner_email,status,payment_status)
  VALUES(p_event,v.id,v.name,trim(p_payload->>'full_name'),lower(trim(p_payload->>'email')),NULLIF(trim(p_payload->>'partner_name'),''),NULLIF(lower(trim(p_payload->>'partner_email')),''),'registered','pending');
 ELSE
  UPDATE public.event_registrations SET division_id=v.id,division=v.name,full_name=trim(p_payload->>'full_name'),email=lower(trim(p_payload->>'email')),partner_name=NULLIF(trim(p_payload->>'partner_name'),''),partner_email=NULLIF(lower(trim(p_payload->>'partner_email')),'') WHERE id=r.id;
 END IF;
 UPDATE public.tournament_confirmations SET players_confirmed_at=NULL,seeds_confirmed_at=NULL,revision=revision+1 WHERE division_id IN(v.id,r.division_id);
 PERFORM public.tm_log(p_event,'registration.saved',jsonb_build_object('division_id',v.id,'registration_id',r.id));
END $$;
CREATE FUNCTION public.tm_save_division(p_event bigint,p_division uuid,p_name text,p_active boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
#variable_conflict use_column
BEGIN
 PERFORM public.tm_require(p_event,'settings'); PERFORM pg_advisory_xact_lock(hashtextextended('tm:'||p_event,0));
 IF length(trim(COALESCE(p_name,'')))=0 THEN RAISE EXCEPTION 'Division name is required'; END IF;
 IF p_division IS NULL THEN
  INSERT INTO public.tournament_divisions(event_id,name,is_active,sort_order) VALUES(p_event,trim(p_name),p_active,COALESCE((SELECT max(sort_order)+1 FROM public.tournament_divisions WHERE event_id=p_event),0));
 ELSE
  IF EXISTS(SELECT 1 FROM public.draws WHERE division_id=p_division AND status IN('published','in_progress','completed')) THEN RAISE EXCEPTION 'Published divisions are locked'; END IF;
  UPDATE public.tournament_divisions SET name=trim(p_name),is_active=p_active WHERE id=p_division AND event_id=p_event;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown division'; END IF;
 END IF;
 PERFORM public.tm_log(p_event,'division.saved',jsonb_build_object('division_id',p_division));
END $$;
CREATE FUNCTION public.tm_qualify(p_event bigint,p_draw uuid,p_expected timestamptz,p_matches jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
#variable_conflict use_column
DECLARE d public.draws; x jsonb; v_id uuid; mapping jsonb:='{}'; old_key text; new_key text; s public.tournament_schedules;
BEGIN
 PERFORM public.tm_require(p_event,'draws'); PERFORM pg_advisory_xact_lock(hashtextextended('tm:'||p_event,0));
 SELECT * INTO d FROM public.draws WHERE id=p_draw AND event_id=p_event FOR UPDATE;
 IF d.id IS NULL OR d.updated_at IS DISTINCT FROM p_expected OR d.format<>'group_knockout' OR d.status NOT IN('published','in_progress') OR EXISTS(SELECT 1 FROM public.draw_matches WHERE draw_id=d.id AND stage='knockout') THEN RAISE EXCEPTION 'Draw changed or elimination already exists'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.draw_matches WHERE draw_id=d.id AND stage='group') OR EXISTS(SELECT 1 FROM public.draw_matches WHERE draw_id=d.id AND stage='group' AND status NOT IN('completed','walkover','retired')) THEN RAISE EXCEPTION 'Finish all group matches first'; END IF;
 PERFORM public.tm_refresh_standings(d.id);
 IF EXISTS(SELECT 1 FROM public.draw_standings WHERE draw_id=d.id AND requires_manual_resolution) THEN RAISE EXCEPTION 'Resolve group ties before qualifying'; END IF;
 IF jsonb_array_length(p_matches)<d.group_count*d.advancers_per_group-1 THEN RAISE EXCEPTION 'Elimination bracket is incomplete'; END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(p_matches) LOOP
  FOR v_id IN SELECT value::uuid FROM jsonb_array_elements_text(jsonb_build_array(x->>'entry_one_id',x->>'entry_two_id',x->>'winner_entry_id')) WHERE value IS NOT NULL LOOP
   IF NOT EXISTS(SELECT 1 FROM public.draw_standings WHERE draw_id=d.id AND entry_id=v_id AND position<=d.advancers_per_group) THEN RAISE EXCEPTION 'Entrant did not qualify'; END IF;
  END LOOP;
  INSERT INTO public.draw_matches(id,draw_id,stage,round_code,round_label,round_number,bracket_position,entry_one_id,entry_two_id,winner_entry_id,status,result_type)
  VALUES((x->>'id')::uuid,d.id,x->>'stage',x->>'round_code',x->>'round_label',(x->>'round_number')::integer,(x->>'bracket_position')::integer,(x->>'entry_one_id')::uuid,(x->>'entry_two_id')::uuid,(x->>'winner_entry_id')::uuid,CASE WHEN x->>'result_type'='walkover' THEN 'walkover' ELSE 'pending' END,x->>'result_type');
  mapping:=mapping||jsonb_build_object(d.id::text||':future:'||(x->>'key'),x->>'id');
 END LOOP;
 FOR x IN SELECT value FROM jsonb_array_elements(p_matches) LOOP
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(jsonb_build_array(x->>'winner_to_match_id',x->>'loser_to_match_id')) candidate(value) WHERE candidate.value IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.draw_matches WHERE draw_id=d.id AND id=candidate.value::uuid AND stage<>'group')) THEN RAISE EXCEPTION 'Invalid elimination route'; END IF;
  UPDATE public.draw_matches SET winner_to_match_id=(x->>'winner_to_match_id')::uuid,winner_to_slot=(x->>'winner_to_slot')::integer,loser_to_match_id=(x->>'loser_to_match_id')::uuid,loser_to_slot=(x->>'loser_to_slot')::integer WHERE id=(x->>'id')::uuid;
 END LOOP;
 SELECT * INTO s FROM public.tournament_schedules WHERE event_id=p_event FOR UPDATE;
 IF s.event_id IS NOT NULL THEN
  FOR old_key,new_key IN SELECT * FROM jsonb_each_text(mapping) LOOP
   IF s.assignments?old_key THEN s.assignments:=(s.assignments-old_key)||jsonb_build_object(new_key,s.assignments->old_key); END IF;
   IF s.published_assignments?old_key THEN
    s.published_assignments:=(s.published_assignments-old_key)||jsonb_build_object(new_key,s.published_assignments->old_key);
    UPDATE public.draw_matches SET scheduled_start=(s.published_assignments->new_key->>'scheduled_start')::timestamptz,scheduled_end=(s.published_assignments->new_key->>'scheduled_end')::timestamptz,court_name=s.published_assignments->new_key->>'court_name',status='scheduled' WHERE id=new_key::uuid AND status='pending';
   END IF;
   s.fixtures:=replace(s.fixtures::text,old_key,new_key)::jsonb;
  END LOOP;
  UPDATE public.tournament_schedules SET assignments=s.assignments,published_assignments=s.published_assignments,fixtures=s.fixtures,revision=revision+1,source_fingerprint=public.tm_source_fingerprint(p_event),updated_at=clock_timestamp() WHERE event_id=p_event;
 END IF;
 UPDATE public.draws SET updated_at=clock_timestamp() WHERE id=d.id;
 UPDATE public.tournament_schedules SET source_fingerprint=public.tm_source_fingerprint(p_event) WHERE event_id=p_event;
 PERFORM public.tm_resolve_routes(d.id);
 PERFORM public.tm_log(p_event,'groups.qualified',jsonb_build_object('draw_id',d.id));
END $$;
REVOKE ALL ON FUNCTION public.tm_save_registration(bigint,uuid,uuid,jsonb,text),public.tm_save_division(bigint,uuid,text,boolean),public.tm_qualify(bigint,uuid,timestamptz,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tm_save_registration(bigint,uuid,uuid,jsonb,text),public.tm_save_division(bigint,uuid,text,boolean),public.tm_qualify(bigint,uuid,timestamptz,jsonb) TO authenticated;
