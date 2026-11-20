-- Extend Tournament Manager through one explicit host gateway. Retain the current
-- public signatures and permissions. The shared implementations are private.


create function private.tm_review_snapshot(p_event bigint, p_host_organisation uuid) returns jsonb
language plpgsql stable security definer set search_path = public
as $$
#variable_conflict use_column
DECLARE caps text[]:=CASE WHEN p_host_organisation IS NULL THEN public.tm_capabilities(p_event)
 ELSE ARRAY['host_players_review','seeds','draws'] END; prep boolean; finance boolean; result jsonb;
BEGIN
 IF cardinality(caps)=0 THEN RAISE EXCEPTION 'No access to this tournament' USING ERRCODE='42501'; END IF;
 prep:=caps && ARRAY['players','host_players_review','seeds','draws']; finance:='finance'=ANY(caps);
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
 'players',CASE WHEN prep THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'email',p.email,'license_type',case when public.has_full_license(p.id,(select extract(year from start_date)::integer from public.calendar where id=p_event)) then 'full' else 'none' end,'event_license',public.player_license_eligibility(p.id,p_event),'points',to_jsonb(p)->'points','rankings',to_jsonb(p)->'rankings','preferred_ranking',to_jsonb(p)->'preferred_ranking','active_ranking_label',to_jsonb(p)->'active_ranking_label','rank_label',to_jsonb(p)->'rank_label','gender',to_jsonb(p)->'gender','category',to_jsonb(p)->'category','temporary_licenses',COALESCE((SELECT jsonb_agg(jsonb_build_object('event_id',t.event_id)) FROM public.temporary_licenses t WHERE t.player_id=p.id and t.revoked_at is null and (p_host_organisation is null or t.event_id=p_event)),'[]'))) FROM public.players p WHERE EXISTS(SELECT 1 FROM public.event_registrations r WHERE r.event_id=p_event AND lower(p.email) IN(lower(r.email),lower(r.partner_email)))),'[]') ELSE '[]'::jsonb END,
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

create function private.tm_review_confirm(p_event bigint, p_division uuid, p_kind text, p_payload jsonb, p_expected integer, p_host_organisation uuid) returns void
language plpgsql security definer set search_path = public
as $$
#variable_conflict use_column
DECLARE c public.tournament_confirmations; r record; cfg jsonb; v_review jsonb; participant text;
BEGIN
 IF p_host_organisation IS NULL THEN PERFORM public.tm_require(p_event,CASE WHEN p_kind='players' THEN 'players' ELSE 'seeds' END); END IF;
 IF p_kind IS NULL OR p_kind NOT IN ('players','seeds','format') THEN RAISE EXCEPTION 'Unknown confirmation'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('tm:'||p_event,0));
 IF NOT EXISTS(SELECT 1 FROM public.tournament_divisions WHERE id=p_division AND event_id=p_event) THEN RAISE EXCEPTION 'Wrong division'; END IF;
 IF EXISTS(SELECT 1 FROM public.draws WHERE division_id=p_division AND status IN('published','in_progress','completed')) THEN RAISE EXCEPTION 'Published preparation is locked. Reopen the draw through the existing correction workflow first.'; END IF;
 INSERT INTO public.tournament_confirmations(division_id,event_id) VALUES(p_division,p_event) ON CONFLICT DO NOTHING;
 SELECT * INTO c FROM public.tournament_confirmations WHERE division_id=p_division FOR UPDATE;
 IF c.revision IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Preparation changed elsewhere. Reload.'; END IF;
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
  IF c.players_confirmed_at IS NULL OR c.players_fingerprint IS DISTINCT FROM public.tm_player_fingerprint(p_division) THEN RAISE EXCEPTION 'Confirm the current players first'; END IF;
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

create function private.tm_review_save_draw(p_event bigint,p_division uuid,p_expected integer,p_draw jsonb, p_host_organisation uuid) returns void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
#variable_conflict use_column
DECLARE c public.tournament_confirmations; d public.draws; x jsonb; v_draw uuid; rotation jsonb; format_name text; r public.event_registrations;
BEGIN
 IF p_host_organisation IS NULL THEN PERFORM public.tm_require(p_event,'draws'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('tm:'||p_event,0));
 SELECT * INTO c FROM public.tournament_confirmations WHERE division_id=p_division AND event_id=p_event FOR UPDATE;
 IF c.division_id IS NULL OR c.revision IS DISTINCT FROM p_expected OR c.players_confirmed_at IS NULL OR c.format_confirmed_at IS NULL OR c.players_fingerprint IS DISTINCT FROM public.tm_player_fingerprint(p_division) OR (c.configuration->>'format' NOT IN('americano','team_americano') AND c.seeds_confirmed_at IS NULL) THEN RAISE EXCEPTION 'Confirm the current players, seeds and format first'; END IF;
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

create function private.tm_review_publish_draw(p_event bigint,p_draw uuid,p_expected timestamptz, p_host_organisation uuid) returns void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
#variable_conflict use_column
DECLARE d public.draws; c public.tournament_confirmations;
BEGIN
 IF p_host_organisation IS NULL THEN PERFORM public.tm_require(p_event,'draws'); END IF; PERFORM pg_advisory_xact_lock(hashtextextended('tm:'||p_event,0));
 SELECT * INTO d FROM public.draws WHERE id=p_draw AND event_id=p_event FOR UPDATE;
 IF d.id IS NULL OR d.status<>'draft' OR d.updated_at IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Draw changed. Reload and preview again'; END IF;
 SELECT * INTO c FROM public.tournament_confirmations WHERE division_id=d.division_id;
 IF c.players_confirmed_at IS NULL OR c.format_confirmed_at IS NULL OR c.players_fingerprint IS DISTINCT FROM public.tm_player_fingerprint(d.division_id) OR (d.format<>'americano' AND c.seeds_confirmed_at IS NULL) THEN RAISE EXCEPTION 'Preparation needs confirmation'; END IF;
 IF (d.scoring_rules->>'preparation_revision')::integer IS DISTINCT FROM c.revision THEN RAISE EXCEPTION 'Preparation changed. Generate and save a fresh preview'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.draw_matches WHERE draw_id=d.id) THEN RAISE EXCEPTION 'Generate a draw first'; END IF;
 UPDATE public.draws SET status='published',published_at=now(),updated_at=clock_timestamp() WHERE id=d.id;
 PERFORM public.tm_log(p_event,'draw.published',jsonb_build_object('division_id',d.division_id));
END $$;

create or replace function public.tm_snapshot(p_event bigint) returns jsonb
language sql stable security definer set search_path = public
as $$ select private.tm_review_snapshot(p_event,null::uuid); $$;

create or replace function public.tm_confirm(p_event bigint, p_division uuid, p_kind text, p_payload jsonb, p_expected integer) returns void
language sql security definer set search_path = public
as $$ select private.tm_review_confirm(p_event,p_division,p_kind,p_payload,p_expected,null::uuid); $$;

create or replace function public.tm_save_draw(p_event bigint,p_division uuid,p_expected integer,p_draw jsonb) returns void
language sql security definer set search_path = public
as $$ select private.tm_review_save_draw(p_event,p_division,p_expected,p_draw,null::uuid); $$;

create or replace function public.tm_publish_draw(p_event bigint,p_draw uuid,p_expected timestamptz) returns void
language sql security definer set search_path = public
as $$ select private.tm_review_publish_draw(p_event,p_draw,p_expected,null::uuid); $$;

revoke all on function
    private.tm_review_snapshot(bigint,uuid),
    private.tm_review_confirm(bigint,uuid,text,jsonb,integer,uuid),
    private.tm_review_save_draw(bigint,uuid,integer,jsonb,uuid),
    private.tm_review_publish_draw(bigint,uuid,timestamptz,uuid)
from public, anon, authenticated, service_role;

-- A read of the exact stored bracket binds both save and publish to the
-- version the organiser had open, including edits to its child rows.
create function private.tm_host_draw_token(p_draw uuid) returns text
language sql stable set search_path = ''
as $$
    select md5(jsonb_build_array(
        to_jsonb(d),
        (select jsonb_agg(g order by g.id) from public.draw_groups g where g.draw_id = d.id),
        (select jsonb_agg(e order by e.id) from public.draw_entries e where e.draw_id = d.id),
        (select jsonb_agg(m order by m.id) from public.draw_matches m where m.draw_id = d.id)
    )::text)
    from public.draws d where d.id = p_draw;
$$;

create function private.tm_validate_host_fixed_draw(p_draw uuid, p_format text, p_groups integer) returns void
language plpgsql stable set search_path = ''
as $$
begin
    if p_format not in ('knockout', 'group_only', 'group_knockout') then
        raise exception 'Choose a supported fixed-pair format';
    end if;

    if exists (
        select 1 from public.draw_entries e
        left join public.draw_groups g on g.id = e.group_id and g.draw_id = p_draw
        where e.draw_id = p_draw and (
            (p_format = 'knockout' and e.group_id is not null)
            or (p_format <> 'knockout' and g.id is null)
        )
    ) or exists (
        select 1 from public.draw_matches m
        left join public.draw_groups g on g.id = m.group_id and g.draw_id = p_draw
        left join public.draw_entries one on one.id = m.entry_one_id and one.draw_id = p_draw
        left join public.draw_entries two on two.id = m.entry_two_id and two.draw_id = p_draw
        where m.draw_id = p_draw and (
            m.entry_one_id is not null and one.id is null
            or m.entry_two_id is not null and two.id is null
            or m.entry_one_id is not null and m.entry_one_id = m.entry_two_id
            or m.round_number is null or m.round_number < 1
            or (m.result_type is null and (m.winner_entry_id is not null or m.status <> 'pending'))
            or (m.result_type is not null and (
                m.result_type <> 'walkover' or m.status <> 'walkover' or m.stage <> 'knockout'
                or m.round_number <> 1 or (one.id is null) = (two.id is null)
                or m.winner_entry_id is distinct from coalesce(one.id,two.id)
            ))
            or (p_format = 'knockout' and (m.group_id is not null or m.stage not in ('knockout','placement')))
            or (p_format <> 'knockout' and (
                m.stage <> 'group' or g.id is null or one.id is null or two.id is null
                or one.group_id is distinct from m.group_id or two.group_id is distinct from m.group_id
            ))
        )
    ) then
        raise exception 'A fixture references a different draw or group, or has invalid entrants';
    end if;

    if p_format <> 'knockout' then
        if (select count(*) from public.draw_groups where draw_id = p_draw) is distinct from p_groups::bigint
            or exists (
                select 1 from public.draw_groups g
                cross join lateral (select count(*) n from public.draw_entries e where e.draw_id = p_draw and e.group_id = g.id) teams
                cross join lateral (select count(*) n from public.draw_matches m where m.draw_id = p_draw and m.group_id = g.id) fixtures
                where g.draw_id = p_draw and (teams.n < 2 or fixtures.n <> teams.n * (teams.n - 1) / 2)
            ) or exists (
                select 1 from public.draw_matches m where m.draw_id = p_draw
                group by m.group_id, least(m.entry_one_id,m.entry_two_id), greatest(m.entry_one_id,m.entry_two_id)
                having count(*) > 1
            ) then
            raise exception 'Every group must contain each pairing exactly once';
        end if;
    elsif exists (select 1 from public.draw_groups where draw_id = p_draw) then
        raise exception 'Knockout draws cannot contain groups';
    end if;

    -- A feeder must advance within the same bracket. Every destination slot
    -- has at most one feeder, and only a known opening-round bye may prefill it.
    if exists (
        select 1 from public.draw_matches source
        cross join lateral (values
            (source.winner_to_match_id,source.winner_to_slot,source.winner_entry_id,true),
            (source.loser_to_match_id,source.loser_to_slot,null::uuid,false)
        ) route(target_id,slot,known_entry,is_winner)
        left join public.draw_matches target on target.id = route.target_id and target.draw_id = p_draw
        where source.draw_id = p_draw and (
            (route.target_id is null and route.slot is not null)
            or (route.target_id is not null and (
                route.slot is null or route.slot not in (1,2) or target.id is null
                or source.stage = 'group' or target.stage = 'group' or target.round_number <= source.round_number
                or (target.stage = 'knockout' and (source.stage <> 'knockout' or not route.is_winner
                    or target.round_number <> source.round_number + 1))
                or (case route.slot when 1 then target.entry_one_id else target.entry_two_id end)
                   is distinct from case when source.result_type = 'walkover' and route.is_winner then route.known_entry end
            ))
        )
    ) or exists (
        select 1 from public.draw_matches m
        cross join lateral (values (m.winner_to_match_id,m.winner_to_slot), (m.loser_to_match_id,m.loser_to_slot)) route(target_id,slot)
        where m.draw_id = p_draw and route.target_id is not null
        group by route.target_id,route.slot having count(*) > 1
    ) then
        raise exception 'A match feeds a different draw or an invalid or already occupied slot';
    end if;

    if p_format = 'knockout' and (
        (select count(*) from public.draw_matches
         where draw_id = p_draw and stage = 'knockout' and winner_to_match_id is null) <> 1
        or exists (
            select 1 from public.draw_matches m
            left join lateral (
                select count(*) n from public.draw_matches source
                cross join lateral (values (source.winner_to_match_id),(source.loser_to_match_id)) route(target_id)
                where source.draw_id = p_draw and route.target_id = m.id
            ) feeds on true
            where m.draw_id = p_draw and (
                (m.stage = 'placement' or m.round_number > 1) and feeds.n <> 2
                or m.stage = 'knockout' and m.winner_to_match_id is not null and not exists (
                    select 1 from public.draw_matches target where target.id = m.winner_to_match_id and target.stage = 'knockout'
                )
            )
        ) or exists (
            select 1 from public.draw_entries e
            left join lateral (
                select count(*) n from public.draw_matches m
                where m.draw_id = p_draw and m.stage = 'knockout' and m.round_number = 1
                  and e.id in (m.entry_one_id,m.entry_two_id)
            ) opening on true
            where e.draw_id = p_draw and opening.n <> 1
        )
    ) then
        raise exception 'Every team needs one opening slot and every later match needs two feeders';
    end if;
end;
$$;

create function public.tm_host_draw_preparation(
    p_organisation uuid, p_event bigint, p_action text, p_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
    event public.calendar;
    draft public.draws;
    v_division uuid;
    selected_draw uuid;
    kind text := p_payload->>'p_kind';
    details jsonb := p_payload->'p_payload';
    configuration jsonb;
    snapshot jsonb;
begin
    if auth.uid() is null or not coalesce(public.account_is_active(),false) then
        raise exception 'An active organisation administrator is required' using errcode = '42501';
    end if;
    if p_action is null or p_action not in ('snapshot','confirm','save_draw','publish_draw') then
        raise exception 'This Tournament Manager action is not available for organisation hosts' using errcode = '42501';
    end if;

    if p_action <> 'snapshot' then
        perform pg_advisory_xact_lock(hashtextextended('tm:' || p_event,0));
    end if;
    perform 1 from public.organisation_members m
     where m.organisation_id = p_organisation and lower(btrim(m.user_email)) = lower(btrim(auth.email()))
       and m.role in ('owner','admin') for share;
    if not found then
        raise exception 'Current owner or admin access to the host organisation is required' using errcode = '42501';
    end if;
    select c.* into event from public.calendar c join public.organisations o on o.id = c.organisation_id
     where c.id = p_event and c.organisation_id = p_organisation and o.status = 'approved'
       and c.is_manual is true and c.event_status is distinct from 'cancelled' for share of c,o;
    if not found then
        raise exception 'Choose an active 4M event in the selected approved organisation' using errcode = '42501';
    end if;

    if p_action = 'snapshot' then
        snapshot := private.tm_review_snapshot(p_event,p_organisation);
        return (snapshot - 'registrations' - 'playDays' - 'finalisations' - 'audit' - 'settings')
            || jsonb_build_object(
                'organisationId',p_organisation,'hostDrawPreparation',true,
                'event',snapshot->'event' || jsonb_build_object('is_visible',event.is_visible),
                'playDays','[]'::jsonb,'finalisations','[]'::jsonb,'audit','[]'::jsonb,
                'settings',jsonb_build_object('divisionColors',coalesce(snapshot->'settings'->'divisionColors','{}'::jsonb)),
                'divisions',coalesce((select jsonb_agg(row) from jsonb_array_elements(snapshot->'divisions') row
                    where row->>'is_active' is distinct from 'false'),'[]'::jsonb),
                'registrations',coalesce((
                    select jsonb_agg(jsonb_build_object(
                        'id',r.id,'event_id',r.event_id,'division_id',r.division_id,'status',r.status,
                        'full_name',r.full_name,'email',r.email,'partner_name',r.partner_name,'partner_email',r.partner_email,
                        'payment_status',r.payment_status) order by r.id)
                    from public.event_registrations r join public.tournament_divisions v on v.id = r.division_id and v.event_id = r.event_id
                    where r.event_id = p_event and v.is_active is distinct from false
                ),'[]'::jsonb),
                'draws',coalesce((select jsonb_agg(row || jsonb_build_object('_review_token',
                    case when row->>'status' = 'draft' then private.tm_host_draw_token((row->>'id')::uuid) end))
                    from jsonb_array_elements(snapshot->'draws') row),'[]'::jsonb)
            );
    end if;

    if p_action = 'publish_draw' then
        select d.division_id into v_division from public.draws d
         where d.id = (p_payload->>'p_draw')::uuid and d.event_id = p_event and d.draw_kind = 'main';
    else
        v_division := (p_payload->>'p_division')::uuid;
    end if;
    perform 1 from public.tournament_divisions v where v.id = v_division and v.event_id = p_event
        and v.is_active is distinct from false for update;
    if not found then
        raise exception 'Choose an active division in the reviewed event' using errcode = '42501';
    end if;

    perform 1 from public.event_registrations r where r.division_id = v_division order by r.id for share;
    if exists (select 1 from public.event_registrations r where r.division_id = v_division
        and r.event_id is distinct from p_event) then
        raise exception 'A registration belongs to a different event. Ask an administrator to review this division';
    end if;
    if exists (select 1 from public.draws d where d.division_id = v_division and d.event_id is distinct from p_event) then
        raise exception 'A draw belongs to a different event. Ask an administrator to review this division';
    end if;

    if p_action = 'confirm' then
        if kind in ('format','format_and_seeds') then
            configuration := case when kind = 'format' then details else details->'configuration' end;
            if jsonb_typeof(configuration) is distinct from 'object'
                or coalesce(configuration->>'format','') not in ('knockout','group_only','group_knockout') then
                raise exception 'Organisation hosts can prepare fixed-pair draws';
            end if;
            -- Only fields consumed by the fixed-pair format form belong in a
            -- delegated configuration. No operational or ranking writes.
            select jsonb_object_agg(key,value) into configuration from jsonb_each(configuration)
             where key in ('format','groups','group_seeding','advancers','ranking_source','sets_to_win',
                'match_tiebreak','seeded_team_count','plate_mode','playoff_mode');
        end if;
        if kind = 'format_and_seeds' then
            -- Save the reviewed configuration and seed order together.
            perform private.tm_review_confirm(p_event,v_division,'format',configuration,
                (p_payload->>'p_expected')::integer,p_organisation);
            perform private.tm_review_confirm(p_event,v_division,'seeds',jsonb_build_object('seeds',details->'seeds'),
                (p_payload->>'p_expected')::integer + 1,p_organisation);
        else
            perform private.tm_review_confirm(p_event,v_division,kind,case when kind = 'format' then configuration else details end,
                (p_payload->>'p_expected')::integer,p_organisation);
        end if;
    else
        select * into draft from public.draws d where d.event_id = p_event and d.division_id = v_division
            and d.draw_kind = 'main' for update;
        if draft.id is not null then
            perform 1 from public.draw_groups where draw_id = draft.id order by id for share;
            perform 1 from public.draw_entries where draw_id = draft.id order by id for share;
            perform 1 from public.draw_matches where draw_id = draft.id order by id for share;
        end if;
        if private.tm_host_draw_token(draft.id) is distinct from (p_payload->>'p_draw_token') then
            raise exception 'The saved draw changed. Reload and review the draft again';
        end if;

        if p_action = 'save_draw' then
            if draft.published_at is not null or exists (
                select 1 from public.draw_matches m where m.draw_id = draft.id and (
                    m.scheduled_start is not null or m.status not in ('pending','walkover')
                    or exists (select 1 from public.draw_match_sets s where s.match_id = m.id)
                )
            ) then
                raise exception 'An assigned tournament administrator must replace a previously published or scheduled draw';
            end if;
            if coalesce(p_payload->'p_draw'->>'format','') not in ('knockout','group_only','group_knockout')
                or jsonb_typeof(p_payload->'p_draw'->'groups') is distinct from 'array'
                or jsonb_typeof(p_payload->'p_draw'->'entries') is distinct from 'array'
                or jsonb_typeof(p_payload->'p_draw'->'matches') is distinct from 'array' then
                raise exception 'Generate a complete fixed-pair preview';
            end if;
            perform private.tm_review_save_draw(p_event,v_division,(p_payload->>'p_expected')::integer,p_payload->'p_draw',p_organisation);
            select * into strict draft from public.draws d where d.event_id = p_event and d.division_id = v_division
                and d.draw_kind = 'main';
            perform private.tm_validate_host_fixed_draw(draft.id,draft.format,draft.group_count);
            selected_draw := draft.id;
        else
            if draft.id is distinct from (p_payload->>'p_draw')::uuid or draft.status is distinct from 'draft' then
                raise exception 'Choose the saved main draw in this division';
            end if;
            if event.is_visible is distinct from true then
                raise exception 'Make the event public before publishing its draw';
            end if;
            perform private.tm_validate_host_fixed_draw(draft.id,draft.format,draft.group_count);
            perform private.tm_review_publish_draw(p_event,draft.id,(p_payload->>'p_expected')::timestamptz,p_organisation);
            selected_draw := draft.id;
        end if;
    end if;

    return jsonb_build_object('organisationId',p_organisation,'eventId',p_event,'action',p_action,
        'divisionId',v_division,'drawId',selected_draw);
end;
$$;

revoke all on function private.tm_host_draw_token(uuid), private.tm_validate_host_fixed_draw(uuid,text,integer)
    from public, anon, authenticated, service_role;
revoke all on function public.tm_host_draw_preparation(uuid,bigint,text,jsonb)
    from public, anon, authenticated, service_role;
grant execute on function public.tm_host_draw_preparation(uuid,bigint,text,jsonb) to authenticated;
