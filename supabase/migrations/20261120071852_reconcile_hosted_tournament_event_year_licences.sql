-- Reconcile the function definitions already running in the shared database.
-- Keep Tournament Manager eligibility tied to the event year and ignore revoked
-- temporary licences. CREATE OR REPLACE retains the current grants.

create or replace function public.tm_player_fingerprint(p_division uuid) returns text
language sql stable security definer set search_path = public
as $$
 SELECT md5(COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id)::text FROM public.event_registrations r WHERE r.division_id=p_division),'[]') || COALESCE((SELECT jsonb_agg(jsonb_build_array(p.id,p.email,(select jsonb_agg(jsonb_build_array(a.season_year,a.revoked_at) order by a.season_year) from public.annual_licenses a where a.player_id=p.id),(SELECT jsonb_agg(t.event_id ORDER BY t.event_id) FROM public.temporary_licenses t WHERE t.player_id=p.id and t.revoked_at is null)) ORDER BY p.id)::text FROM public.players p WHERE EXISTS(SELECT 1 FROM public.event_registrations r WHERE r.division_id=p_division AND lower(p.email) IN (lower(r.email),lower(r.partner_email)))),'[]'));
$$;

create or replace function public.tm_confirm(p_event bigint, p_division uuid, p_kind text, p_payload jsonb, p_expected integer) returns void
language plpgsql security definer set search_path = public
as $$
#variable_conflict use_column
DECLARE c public.tournament_confirmations; r record; cfg jsonb; v_review jsonb; participant text;
BEGIN
 PERFORM public.tm_require(p_event,CASE WHEN p_kind='players' THEN 'players' ELSE 'seeds' END);
 IF p_kind NOT IN ('players','seeds','format') THEN RAISE EXCEPTION 'Unknown confirmation'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('tm:'||p_event,0));
 IF NOT EXISTS(SELECT 1 FROM public.tournament_divisions WHERE id=p_division AND event_id=p_event) THEN RAISE EXCEPTION 'Wrong division'; END IF;
 IF EXISTS(SELECT 1 FROM public.draws WHERE division_id=p_division AND status IN('published','in_progress','completed')) THEN RAISE EXCEPTION 'Published preparation is locked. Reopen the draw through the existing correction workflow first.'; END IF;
 INSERT INTO public.tournament_confirmations(division_id,event_id) VALUES(p_division,p_event) ON CONFLICT DO NOTHING;
 SELECT * INTO c FROM public.tournament_confirmations WHERE division_id=p_division FOR UPDATE;
 IF c.revision<>p_expected THEN RAISE EXCEPTION 'Preparation changed elsewhere. Reload.'; END IF;
 IF p_kind='players' THEN
  v_review:=jsonb_build_object('excluded',COALESCE(p_payload->'excluded','[]'),'exceptions',COALESCE(p_payload->'exceptions','{}'),'seeds','[]'::jsonb);
  IF NOT EXISTS(SELECT 1 FROM public.event_registrations r WHERE division_id=p_division AND status<>'withdrawn' AND NOT (v_review->'excluded')?r.id::text) THEN RAISE EXCEPTION 'Include at least one registration'; END IF;
  FOR r IN SELECT * FROM public.event_registrations WHERE division_id=p_division AND status<>'withdrawn' AND NOT (v_review->'excluded')?id::text LOOP
   IF lower(COALESCE(r.payment_status,'')) NOT IN('paid','comped') AND length(trim(COALESCE(v_review->'exceptions'->>r.id::text,'')))=0 THEN RAISE EXCEPTION 'Payment check needs an exception: %',r.full_name; END IF;
   FOREACH participant IN ARRAY ARRAY[r.email,r.partner_email] LOOP
    IF NULLIF(trim(participant),'') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.players p WHERE lower(p.email)=lower(participant) AND (public.has_full_license(p.id,(select extract(year from start_date)::integer from public.calendar where id=p_event)) OR EXISTS(SELECT 1 FROM public.temporary_licenses t WHERE t.player_id=p.id AND t.event_id=p_event and t.revoked_at is null))) AND length(trim(COALESCE(v_review->'exceptions'->>r.id::text,'')))=0 THEN RAISE EXCEPTION 'Licence check needs an exception: %',participant; END IF;
   END LOOP;
  END LOOP;
  UPDATE public.tournament_confirmations SET review=v_review,players_fingerprint=public.tm_player_fingerprint(p_division),players_confirmed_at=now(),seeds_confirmed_at=NULL WHERE division_id=p_division;
 ELSIF p_kind='seeds' THEN
  IF c.players_confirmed_at IS NULL OR c.players_fingerprint<>public.tm_player_fingerprint(p_division) THEN RAISE EXCEPTION 'Confirm the current players first'; END IF;
  IF jsonb_typeof(p_payload->'seeds') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Seed order is required'; END IF;
  IF EXISTS(SELECT seed FROM jsonb_array_elements_text(p_payload->'seeds') seed GROUP BY seed HAVING count(*)>1) OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_payload->'seeds') seed WHERE NOT EXISTS(SELECT 1 FROM public.event_registrations r WHERE r.id::text=seed AND r.division_id=p_division AND r.status<>'withdrawn' AND NOT (c.review->'excluded')?r.id::text)) THEN RAISE EXCEPTION 'Seed order contains duplicate or ineligible registrations'; END IF;
  UPDATE public.tournament_confirmations SET review=jsonb_set(tournament_confirmations.review,'{seeds}',p_payload->'seeds'),seeds_confirmed_at=now() WHERE division_id=p_division;
 ELSE
  cfg:=p_payload;
  IF COALESCE(cfg->>'format','') NOT IN('knockout','group_only','group_knockout','americano','team_americano') THEN RAISE EXCEPTION 'Choose a valid format'; END IF;
  IF COALESCE((cfg->>'sets_to_win')::integer,2) NOT IN(1,2) OR (cfg->>'format' IN('group_only','group_knockout') AND COALESCE((cfg->>'groups')::integer,0)<1) OR (cfg->>'format'='group_knockout' AND COALESCE((cfg->>'groups')::integer,0)*COALESCE((cfg->>'advancers')::integer,0)<2) THEN RAISE EXCEPTION 'Check format settings'; END IF;
  UPDATE public.tournament_confirmations SET configuration=cfg,format_confirmed_at=now(),seeds_confirmed_at=CASE WHEN configuration->>'format' IS DISTINCT FROM cfg->>'format' THEN NULL ELSE seeds_confirmed_at END WHERE division_id=p_division;
 END IF;
 UPDATE public.tournament_confirmations SET revision=revision+1,updated_by=auth.uid() WHERE division_id=p_division;
 PERFORM public.tm_log(p_event,p_kind||'.confirmed',jsonb_build_object('division_id',p_division));
END $$;

create or replace function public.tm_snapshot(p_event bigint) returns jsonb
language plpgsql stable security definer set search_path = public
as $$
#variable_conflict use_column
DECLARE caps text[]:=public.tm_capabilities(p_event); prep boolean; finance boolean; result jsonb;
BEGIN
 IF cardinality(caps)=0 THEN RAISE EXCEPTION 'No access to this tournament' USING ERRCODE='42501'; END IF;
 prep:=caps && ARRAY['players','seeds','draws']; finance:='finance'=ANY(caps);
 SELECT jsonb_build_object(
 'event',(SELECT CASE WHEN 'settings'=ANY(caps) THEN to_jsonb(c) ELSE jsonb_build_object('id',c.id,'event_name',c.event_name,'start_date',c.start_date,'end_date',c.end_date,'venue',c.venue,'slug',c.slug) END FROM public.calendar c WHERE id=p_event),
 'capabilities',caps,
 'divisions',COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.sort_order,d.id) FROM public.tournament_divisions d WHERE event_id=p_event),'[]'),
 'draws',COALESCE((SELECT jsonb_agg(CASE WHEN prep THEN to_jsonb(d) ELSE to_jsonb(d)-'created_by'-'seeding_method' || jsonb_build_object('scoring_rules',jsonb_build_object('sets_to_win',d.scoring_rules->'sets_to_win','match_tiebreak',d.scoring_rules->'match_tiebreak','americano',CASE WHEN d.format='americano' THEN d.scoring_rules->'americano' ELSE NULL END)) END ORDER BY d.id) FROM public.draws d WHERE event_id=p_event AND (prep OR status IN ('published','in_progress','completed'))),'[]'),
 'matches',COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM public.draw_matches m JOIN public.draws d ON d.id=m.draw_id WHERE d.event_id=p_event AND (prep OR d.status IN ('published','in_progress','completed'))),'[]'),
 'entries',COALESCE((SELECT jsonb_agg(CASE WHEN prep OR 'schedule'=ANY(caps) THEN to_jsonb(e) ELSE jsonb_build_object('id',e.id,'draw_id',e.draw_id,'team_name',e.team_name,'player_one_name',e.player_one_name,'player_two_name',e.player_two_name,'group_id',e.group_id) END ORDER BY e.id) FROM public.draw_entries e JOIN public.draws d ON d.id=e.draw_id WHERE d.event_id=p_event AND (prep OR d.status IN ('published','in_progress','completed'))),'[]'),
 'sets',COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.match_id,s.set_number) FROM public.draw_match_sets s JOIN public.draw_matches m ON m.id=s.match_id JOIN public.draws d ON d.id=m.draw_id WHERE d.event_id=p_event),'[]'),
 'standings',COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.group_id,s.position) FROM public.draw_standings s JOIN public.draws d ON d.id=s.draw_id WHERE d.event_id=p_event),'[]'),
 'registrations',CASE WHEN prep OR finance THEN COALESCE((SELECT jsonb_agg((to_jsonb(r)-'pay_token')||jsonb_build_object('_revision',md5(to_jsonb(r)::text)) ORDER BY r.id) FROM public.event_registrations r WHERE event_id=p_event),'[]') ELSE '[]'::jsonb END,
 'players',CASE WHEN prep THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'email',p.email,'license_type',case when public.has_full_license(p.id,(select extract(year from start_date)::integer from public.calendar where id=p_event)) then 'full' else 'none' end,'event_license',public.player_license_eligibility(p.id,p_event),'points',to_jsonb(p)->'points','rankings',to_jsonb(p)->'rankings','preferred_ranking',to_jsonb(p)->'preferred_ranking','active_ranking_label',to_jsonb(p)->'active_ranking_label','rank_label',to_jsonb(p)->'rank_label','gender',to_jsonb(p)->'gender','category',to_jsonb(p)->'category','temporary_licenses',COALESCE((SELECT jsonb_agg(jsonb_build_object('event_id',t.event_id)) FROM public.temporary_licenses t WHERE t.player_id=p.id and t.revoked_at is null),'[]'))) FROM public.players p WHERE EXISTS(SELECT 1 FROM public.event_registrations r WHERE r.event_id=p_event AND lower(p.email) IN(lower(r.email),lower(r.partner_email)))),'[]') ELSE '[]'::jsonb END,
 'playDays',COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.play_date) FROM public.event_play_days p WHERE event_id=p_event AND NOT COALESCE(is_removed,false)),'[]'),
 'settings',COALESCE((SELECT settings FROM public.tournament_workspace WHERE event_id=p_event),'{}'),
 'settingsRevision',COALESCE((SELECT revision FROM public.tournament_workspace WHERE event_id=p_event),0),
 'confirmations',CASE WHEN prep THEN COALESCE((SELECT jsonb_agg(to_jsonb(c)||jsonb_build_object('players_valid',c.players_fingerprint=public.tm_player_fingerprint(c.division_id),'seeds_valid',c.players_fingerprint=public.tm_player_fingerprint(c.division_id))) FROM public.tournament_confirmations c WHERE event_id=p_event),'[]') ELSE '[]'::jsonb END,
 'schedule',CASE WHEN 'schedule'=ANY(caps) THEN (SELECT to_jsonb(s) FROM public.tournament_schedules s WHERE event_id=p_event) ELSE NULL END,
 'sourceFingerprint',CASE WHEN 'schedule'=ANY(caps) THEN public.tm_source_fingerprint(p_event) ELSE NULL END,
 'finalisations',COALESCE((SELECT jsonb_agg(to_jsonb(f)||jsonb_build_object('valid',f.fingerprint=public.tm_result_fingerprint(f.division_id))) FROM public.tournament_finalisations f WHERE event_id=p_event),'[]'),
 'audit',COALESCE((SELECT jsonb_agg(to_jsonb(a) || jsonb_build_object('actor_name',(SELECT COALESCE(NULLIF(u.raw_user_meta_data->>'full_name',''),NULLIF(u.raw_user_meta_data->>'name',''),u.email) FROM auth.users u WHERE u.id=a.actor)) ORDER BY a.created_at DESC) FROM (SELECT id,event_id,action,CASE WHEN 'access'=ANY(caps) OR action NOT LIKE 'access.%' THEN details ELSE '{}'::jsonb END AS details,actor,created_at FROM public.tournament_audit WHERE event_id=p_event ORDER BY id DESC LIMIT 100) a),'[]'),
 'access',CASE WHEN 'access'=ANY(caps) THEN COALESCE((SELECT jsonb_agg(to_jsonb(a)||jsonb_build_object('email',u.email,'inheritedAccess',false)) FROM public.tournament_access a JOIN auth.users u ON u.id=a.user_id WHERE event_id=p_event),'[]') ELSE '[]'::jsonb END
 ) INTO result;
 RETURN result;
END $$;
