-- Additive Tournament Manager pilot. No legacy UI or existing access grants change.
CREATE TABLE public.tournament_access (
 event_id bigint REFERENCES public.calendar(id) ON DELETE CASCADE,
 user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
 capabilities text[] NOT NULL DEFAULT '{}',
 updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid REFERENCES auth.users(id),
 PRIMARY KEY(event_id,user_id),
 CHECK(capabilities <@ ARRAY['settings','players','seeds','draws','schedule','results','corrections','finance','access']::text[])
);
CREATE TABLE public.tournament_workspace (
 event_id bigint PRIMARY KEY REFERENCES public.calendar(id) ON DELETE CASCADE,
 settings jsonb NOT NULL DEFAULT '{}', revision integer NOT NULL DEFAULT 0,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.tournament_confirmations (
 division_id uuid PRIMARY KEY REFERENCES public.tournament_divisions(id) ON DELETE CASCADE,
 event_id bigint NOT NULL REFERENCES public.calendar(id) ON DELETE CASCADE,
 configuration jsonb NOT NULL DEFAULT '{"format":"knockout","groups":1,"advancers":2,"points":24,"sets_to_win":2}',
 review jsonb NOT NULL DEFAULT '{"excluded":[],"exceptions":{},"seeds":[]}',
 players_fingerprint text, players_confirmed_at timestamptz, seeds_confirmed_at timestamptz, format_confirmed_at timestamptz,
 revision integer NOT NULL DEFAULT 0, updated_by uuid REFERENCES auth.users(id)
);
CREATE TABLE public.tournament_schedules (
 event_id bigint PRIMARY KEY REFERENCES public.calendar(id) ON DELETE CASCADE,
 revision integer NOT NULL DEFAULT 1, source_fingerprint text NOT NULL,
 assignments jsonb NOT NULL DEFAULT '{}', fixtures jsonb NOT NULL DEFAULT '[]', settings jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
 published_assignments jsonb NOT NULL DEFAULT '{}', published_revision integer,
 updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid REFERENCES auth.users(id)
);
CREATE TABLE public.tournament_finalisations (
 division_id uuid PRIMARY KEY REFERENCES public.tournament_divisions(id) ON DELETE CASCADE,
 event_id bigint NOT NULL REFERENCES public.calendar(id) ON DELETE CASCADE,
 fingerprint text NOT NULL, finalised_at timestamptz NOT NULL DEFAULT now(), finalised_by uuid NOT NULL REFERENCES auth.users(id)
);
CREATE TABLE public.tournament_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 event_id bigint NOT NULL REFERENCES public.calendar(id) ON DELETE CASCADE,
 action text NOT NULL, details jsonb NOT NULL DEFAULT '{}', actor uuid REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tournament_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_workspace ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_finalisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_audit ENABLE ROW LEVEL SECURITY;
-- All writes use the narrowly authorised RPCs below. No direct client table grants.
REVOKE ALL ON public.tournament_access,public.tournament_workspace,public.tournament_confirmations,public.tournament_schedules,public.tournament_finalisations,public.tournament_audit FROM anon,authenticated;

CREATE FUNCTION public.tm_capabilities(p_event bigint) RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE WHEN auth.uid() IS NULL THEN '{}'::text[] WHEN public.is_super_admin() THEN ARRAY['settings','players','seeds','draws','schedule','results','corrections','finance','access'] ELSE COALESCE((SELECT capabilities FROM public.tournament_access WHERE event_id=p_event AND user_id=auth.uid()),'{}') END;
$$;
CREATE FUNCTION public.tm_require(p_event bigint,p_cap text) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
#variable_conflict use_column
BEGIN
 IF auth.uid() IS NULL OR NOT p_cap=ANY(public.tm_capabilities(p_event)) THEN RAISE EXCEPTION 'You do not have % access for this tournament',p_cap USING ERRCODE='42501'; END IF;
END $$;
CREATE FUNCTION public.tm_log(p_event bigint,p_action text,p_details jsonb DEFAULT '{}') RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 INSERT INTO public.tournament_audit(event_id,action,details,actor) VALUES(p_event,p_action,p_details,auth.uid());
$$;
CREATE FUNCTION public.tm_player_fingerprint(p_division uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT md5(COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id)::text FROM public.event_registrations r WHERE r.division_id=p_division),'[]') || COALESCE((SELECT jsonb_agg(jsonb_build_array(p.id,p.email,p.license_type,(SELECT jsonb_agg(t.event_id ORDER BY t.event_id) FROM public.temporary_licenses t WHERE t.player_id=p.id)) ORDER BY p.id)::text FROM public.players p WHERE EXISTS(SELECT 1 FROM public.event_registrations r WHERE r.division_id=p_division AND lower(p.email) IN (lower(r.email),lower(r.partner_email)))),'[]'));
$$;
CREATE FUNCTION public.tm_source_fingerprint(p_event bigint) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT md5(jsonb_build_array(
 (SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id) FROM public.draws d WHERE event_id=p_event),
 (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM public.draw_matches m JOIN public.draws d ON d.id=m.draw_id WHERE d.event_id=p_event),
 (SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id) FROM public.tournament_divisions d WHERE event_id=p_event),
 (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.play_date) FROM public.event_play_days p WHERE event_id=p_event),
 (SELECT settings FROM public.tournament_workspace WHERE event_id=p_event))::text);
$$;
CREATE FUNCTION public.tm_result_fingerprint(p_division uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT md5(jsonb_build_array((SELECT jsonb_agg(jsonb_build_array(m.id,m.status,m.winner_entry_id,m.loser_entry_id) ORDER BY m.id) FROM public.draw_matches m JOIN public.draws d ON d.id=m.draw_id WHERE d.division_id=p_division),(SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM public.draw_match_sets s JOIN public.draw_matches m ON m.id=s.match_id JOIN public.draws d ON d.id=m.draw_id WHERE d.division_id=p_division),(SELECT jsonb_agg(d.scoring_rules->'americano' ORDER BY d.id) FROM public.draws d WHERE d.division_id=p_division))::text);
$$;
CREATE FUNCTION public.tm_list_events() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',c.id,'event_name',c.event_name,'start_date',c.start_date,'end_date',c.end_date,'venue',c.venue,'slug',c.slug,'capabilities',public.tm_capabilities(c.id)) ORDER BY c.start_date DESC),'[]') FROM public.calendar c WHERE c.is_manual AND cardinality(public.tm_capabilities(c.id))>0;
$$;
CREATE FUNCTION public.tm_snapshot(p_event bigint) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
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
 'players',CASE WHEN prep THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'email',p.email,'license_type',p.license_type,'points',to_jsonb(p)->'points','rankings',to_jsonb(p)->'rankings','preferred_ranking',to_jsonb(p)->'preferred_ranking','active_ranking_label',to_jsonb(p)->'active_ranking_label','rank_label',to_jsonb(p)->'rank_label','gender',to_jsonb(p)->'gender','category',to_jsonb(p)->'category','temporary_licenses',COALESCE((SELECT jsonb_agg(jsonb_build_object('event_id',t.event_id)) FROM public.temporary_licenses t WHERE t.player_id=p.id),'[]'))) FROM public.players p WHERE EXISTS(SELECT 1 FROM public.event_registrations r WHERE r.event_id=p_event AND lower(p.email) IN(lower(r.email),lower(r.partner_email)))),'[]') ELSE '[]'::jsonb END,
 'playDays',COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.play_date) FROM public.event_play_days p WHERE event_id=p_event AND NOT COALESCE(is_removed,false)),'[]'),
 'settings',COALESCE((SELECT settings FROM public.tournament_workspace WHERE event_id=p_event),'{}'),
 'settingsRevision',COALESCE((SELECT revision FROM public.tournament_workspace WHERE event_id=p_event),0),
 'confirmations',CASE WHEN prep THEN COALESCE((SELECT jsonb_agg(to_jsonb(c)||jsonb_build_object('players_valid',c.players_fingerprint=public.tm_player_fingerprint(c.division_id),'seeds_valid',c.players_fingerprint=public.tm_player_fingerprint(c.division_id))) FROM public.tournament_confirmations c WHERE event_id=p_event),'[]') ELSE '[]'::jsonb END,
 'schedule',CASE WHEN 'schedule'=ANY(caps) THEN (SELECT to_jsonb(s) FROM public.tournament_schedules s WHERE event_id=p_event) ELSE NULL END,
 'sourceFingerprint',CASE WHEN 'schedule'=ANY(caps) THEN public.tm_source_fingerprint(p_event) ELSE NULL END,
 'finalisations',COALESCE((SELECT jsonb_agg(to_jsonb(f)||jsonb_build_object('valid',f.fingerprint=public.tm_result_fingerprint(f.division_id))) FROM public.tournament_finalisations f WHERE event_id=p_event),'[]'),
 'audit',COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC) FROM (SELECT id,event_id,action,CASE WHEN 'access'=ANY(caps) OR action NOT LIKE 'access.%' THEN details ELSE '{}'::jsonb END AS details,actor,created_at FROM public.tournament_audit WHERE event_id=p_event ORDER BY id DESC LIMIT 100) a),'[]'),
 'access',CASE WHEN 'access'=ANY(caps) THEN COALESCE((SELECT jsonb_agg(to_jsonb(a)||jsonb_build_object('email',u.email,'inheritedAccess',false)) FROM public.tournament_access a JOIN auth.users u ON u.id=a.user_id WHERE event_id=p_event),'[]') ELSE '[]'::jsonb END
 ) INTO result;
 RETURN result;
END $$;

CREATE FUNCTION public.tm_save_settings(p_event bigint,p_settings jsonb,p_days jsonb,p_expected integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
#variable_conflict use_column
DECLARE current_revision integer; day jsonb;
BEGIN
 PERFORM public.tm_require(p_event,'settings');
 PERFORM pg_advisory_xact_lock(hashtextextended('tm:'||p_event,0));
 SELECT revision INTO current_revision FROM public.tournament_workspace WHERE event_id=p_event FOR UPDATE;
 IF COALESCE(current_revision,0)<>p_expected THEN RAISE EXCEPTION 'Settings changed elsewhere. Reload before saving.'; END IF;
 IF COALESCE((p_settings->>'duration')::integer,0)<1 OR COALESCE((p_settings->>'rest')::integer,-1)<0 THEN RAISE EXCEPTION 'Check match duration and rest.'; END IF;
 FOR day IN SELECT value FROM jsonb_array_elements(p_days) LOOP
  IF (day->>'end_time')::time <= (day->>'start_time')::time OR COALESCE((day->>'courts_count')::integer,0)<1 THEN RAISE EXCEPTION 'Check court count and opening hours.'; END IF;
  INSERT INTO public.event_play_days(event_id,play_date,start_time,end_time,courts_count,match_duration_minutes,minimum_break_minutes,is_active)
  VALUES(p_event,(day->>'play_date')::date,(day->>'start_time')::time,(day->>'end_time')::time,(day->>'courts_count')::integer,(p_settings->>'duration')::integer,(p_settings->>'rest')::integer,COALESCE((day->>'is_active')::boolean,true))
  ON CONFLICT(event_id,play_date) DO UPDATE SET start_time=excluded.start_time,end_time=excluded.end_time,courts_count=excluded.courts_count,match_duration_minutes=excluded.match_duration_minutes,minimum_break_minutes=excluded.minimum_break_minutes,is_active=excluded.is_active;
 END LOOP;
 INSERT INTO public.tournament_workspace(event_id,settings,revision) VALUES(p_event,p_settings,1) ON CONFLICT(event_id) DO UPDATE SET settings=excluded.settings,revision=tournament_workspace.revision+1,updated_at=clock_timestamp();
 PERFORM public.tm_log(p_event,'settings.saved');
END $$;

CREATE FUNCTION public.tm_confirm(p_event bigint,p_division uuid,p_kind text,p_payload jsonb,p_expected integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
    IF NULLIF(trim(participant),'') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.players p WHERE lower(p.email)=lower(participant) AND (lower(p.license_type)='full' OR EXISTS(SELECT 1 FROM public.temporary_licenses t WHERE t.player_id=p.id AND t.event_id=p_event))) AND length(trim(COALESCE(v_review->'exceptions'->>r.id::text,'')))=0 THEN RAISE EXCEPTION 'Licence check needs an exception: %',participant; END IF;
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

CREATE FUNCTION public.tm_set_access(p_event bigint,p_email text,p_capabilities text[]) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
#variable_conflict use_column
DECLARE target uuid;
BEGIN
 PERFORM public.tm_require(p_event,'access');
 SELECT id INTO target FROM auth.users WHERE lower(email)=lower(trim(p_email));
 IF target IS NULL THEN RAISE EXCEPTION 'This person must create an account before receiving tournament access.'; END IF;
 IF target=auth.uid() THEN RAISE EXCEPTION 'Ask another administrator to change your own access.'; END IF;
 INSERT INTO public.tournament_access(event_id,user_id,capabilities,updated_by) VALUES(p_event,target,p_capabilities,auth.uid()) ON CONFLICT(event_id,user_id) DO UPDATE SET capabilities=excluded.capabilities,updated_by=auth.uid(),updated_at=clock_timestamp();
 PERFORM public.tm_log(p_event,'access.updated',jsonb_build_object('email',p_email,'capabilities',p_capabilities));
END $$;

-- Helpers are private even though functions live in public for migration portability.
REVOKE ALL ON FUNCTION public.tm_require(bigint,text),public.tm_log(bigint,text,jsonb),public.tm_player_fingerprint(uuid),public.tm_source_fingerprint(bigint),public.tm_result_fingerprint(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.tm_capabilities(bigint),public.tm_list_events(),public.tm_snapshot(bigint),public.tm_save_settings(bigint,jsonb,jsonb,integer),public.tm_confirm(bigint,uuid,text,jsonb,integer),public.tm_set_access(bigint,text,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tm_capabilities(bigint),public.tm_list_events(),public.tm_snapshot(bigint),public.tm_save_settings(bigint,jsonb,jsonb,integer),public.tm_confirm(bigint,uuid,text,jsonb,integer),public.tm_set_access(bigint,text,text[]) TO authenticated;
