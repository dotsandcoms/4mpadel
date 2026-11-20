-- Score exactly one reviewed rotation fixture in the two existing durable
-- representations. Keep the ordinary Tournament Manager permission and the
-- public RPC signature when sharing its rotation writer with the host gateway.
create function private.tm_valid_rotation_score(p_score jsonb,p_points integer,p_allow_strings boolean default false)
returns boolean language plpgsql immutable set search_path = ''
as $$
declare
    val jsonb;
    points numeric;
    sum_points numeric:=0;
begin
    if p_points is null or p_points<1 or jsonb_typeof(p_score) is distinct from 'array' then return false; end if;
    if jsonb_array_length(p_score)<>2 then return false; end if;
    for val in select value from jsonb_array_elements(p_score) loop
        if jsonb_typeof(val)='number' or (p_allow_strings and jsonb_typeof(val)='string' and (val#>>'{}') ~ '^[0-9]+([.]0+)?$') then
            points:=(val#>>'{}')::numeric;
            if points<0 or points>p_points or points<>trunc(points) then return false; end if;
            sum_points:=sum_points+points;
        else return false;
        end if;
    end loop;
    return sum_points=p_points;
end;
$$;

create function private.tm_store_rotation_score(p_draw uuid,p_match uuid,p_score jsonb)
returns void language plpgsql set search_path = ''
as $$
declare
    total integer;
    fixture_key text;
    rotation jsonb;
    score jsonb;
begin
    select d.scoring_rules->'americano',m.americano_fixture_key into rotation,fixture_key
    from public.draws d join public.draw_matches m on m.draw_id=d.id
    where d.id=p_draw and d.format='americano' and m.id=p_match;
    total:=(rotation->>'points')::integer;
    if not private.tm_valid_rotation_score(p_score,total,true) then
        raise exception 'Both scores must add up to %',total;
    end if;
    if jsonb_typeof(rotation->'fixtures') is distinct from 'array'
        or (select count(*) from jsonb_array_elements(rotation->'fixtures') f where f->>'id'=fixture_key)<>1 then
        raise exception 'Unknown rotation match';
    end if;
    score:=jsonb_build_array((p_score->>0)::numeric::integer,(p_score->>1)::numeric::integer);
    update public.draws d set scoring_rules=jsonb_set(d.scoring_rules,'{americano,fixtures}',(
        select jsonb_agg(case when f->>'id'=fixture_key then jsonb_set(f,'{score}',score) else f end order by ord)
        from jsonb_array_elements(rotation->'fixtures') with ordinality x(f,ord)
    )),updated_at=clock_timestamp() where d.id=p_draw;
    update public.draw_matches m set status='completed',result_type='played',actual_finish=now(),updated_at=clock_timestamp()
    where m.id=p_match and m.draw_id=p_draw;
end;
$$;

CREATE OR REPLACE FUNCTION public.tm_record_result(p_event bigint,p_match uuid,p_expected timestamptz,p_result jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
#variable_conflict use_column
DECLARE m public.draw_matches; d public.draws; score jsonb; one_wins integer:=0; two_wins integer:=0; n integer:=0; a integer; b integer; winner uuid; loser uuid; kind text:=p_result->>'kind'; correction boolean;
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
  PERFORM private.tm_store_rotation_score(d.id,m.id,p_result->'score');
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

create function public.tm_host_rotation_result(
    p_organisation uuid,p_event bigint,p_action text,p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
    d public.draws;
    m public.draw_matches;
    proposed_score jsonb:=p_payload->'p_score';
    fixture jsonb;
    rotation jsonb;
    total integer;
    correction boolean;
    verdict text;
    reason text:=nullif(btrim(p_payload->>'p_reason'),'');
    expected timestamptz:=(p_payload->>'p_expected')::timestamptz;
begin
    if auth.uid() is null or not coalesce(public.account_is_active(),false)
        or p_action is null or p_action not in ('record_rotation_score','complete_rotation') then
        raise exception 'Rotation results require the reviewed event host' using errcode='42501';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('tm:'||p_event,0));
    perform 1 from public.organisation_members member where member.organisation_id=p_organisation
        and lower(btrim(member.user_email))=lower(btrim(auth.email())) and member.role in ('owner','admin') for share;
    if not found then raise exception 'Current owner or admin access to the host organisation is required' using errcode='42501'; end if;
    perform 1 from public.calendar c join public.organisations o on o.id=c.organisation_id
        where c.id=p_event and c.organisation_id=p_organisation and o.status='approved'
        and c.is_manual is true and c.is_visible is true and c.event_status is distinct from 'cancelled' for share of c,o;
    if not found then raise exception 'Choose a public 4M event in the selected approved organisation' using errcode='42501'; end if;

    select x.* into d from public.draws x join public.tournament_divisions v on v.id=x.division_id and v.event_id=x.event_id
        where x.id=(p_payload->>'p_draw')::uuid and x.event_id=p_event and x.draw_kind='main'
        and x.format='americano' and v.is_active is distinct from false for update of x for share of v;
    if d.id is null then raise exception 'Choose the published Americano draw in this event' using errcode='42501'; end if;
    if expected is null or expected is distinct from d.updated_at or d.status not in ('published','in_progress') then
        raise exception 'The Americano draw changed or is closed. Reload before continuing';
    end if;
    rotation:=d.scoring_rules->'americano';
    total:=(rotation->>'points')::integer;
    if jsonb_typeof(rotation->'fixtures') is distinct from 'array' or total is null or total<1 then
        raise exception 'The published draw has no valid rotation fixtures';
    end if;

    if p_action='record_rotation_score' then
        select * into m from public.draw_matches where id=(p_payload->>'p_match')::uuid
            and draw_id=d.id and stage='group' and americano_fixture_key is not null for update;
        if m.id is null or (p_payload->>'p_expected_match')::timestamptz is null
            or m.updated_at is distinct from (p_payload->>'p_expected_match')::timestamptz
            or m.status not in ('pending','scheduled','in_progress','completed') then
            raise exception 'The reviewed rotation match changed or belongs to another draw';
        end if;
        select f into fixture from jsonb_array_elements(rotation->'fixtures') f where f->>'id'=m.americano_fixture_key;
        if fixture is null or (fixture->>'round')::integer is distinct from m.round_number then
            raise exception 'The reviewed match is not in this rotation';
        end if;
        correction:=m.status='completed';
        if (correction and not private.tm_valid_rotation_score(fixture->'score',total,true))
            or (not correction and fixture->'score' is not null and fixture->'score'<>'null'::jsonb) then
            raise exception 'The stored fixture and score disagree. Ask a Tournament Manager administrator to repair this result';
        end if;
        if correction and (reason is null or length(reason)>500) then
            raise exception 'Record a correction reason of up to 500 characters';
        end if;
        if not private.tm_valid_rotation_score(proposed_score,total) then
            raise exception 'Both scores must add up to %',total;
        end if;
        perform private.tm_store_rotation_score(d.id,m.id,proposed_score);
        -- Starting the rotation only changes its own status. Keep all courts,
        -- play windows, participant identities and ranking settings as stored.
        update public.draws set status='in_progress' where id=d.id and status='published';
        insert into public.draw_match_audit(match_id,action,before_state,after_state,actor_email)
        values(m.id,case when correction then 'score_corrected' else 'score_recorded' end,
            jsonb_build_object('status',m.status,'score',fixture->'score'),
            jsonb_build_object('status','completed','score',proposed_score,'reason',case when correction then reason end),
            auth.email());
        perform public.tm_log(p_event,case when correction then 'result.corrected' else 'result.recorded' end,
            jsonb_build_object('draw_id',d.id,'match_id',m.id,'reason',case when correction then reason end));
        verdict:='in_progress';
    else
        perform 1 from public.draw_matches where draw_id=d.id order by id for update;
        if p_payload->'p_match_versions' is distinct from (
            select coalesce(jsonb_object_agg(x.id::text,x.updated_at),'{}'::jsonb) from public.draw_matches x where x.draw_id=d.id
        ) then
            raise exception 'The reviewed match list changed. Refresh before completing';
        end if;
        if jsonb_array_length(rotation->'fixtures')=0 or exists (
            select 1 from jsonb_array_elements(rotation->'fixtures') f
            left join public.draw_matches x on x.draw_id=d.id and x.americano_fixture_key=f->>'id'
            where x.id is null or x.stage<>'group' or x.status<>'completed'
                or (f->>'round')::integer is distinct from x.round_number
                or not private.tm_valid_rotation_score(f->'score',total,true)
        ) or exists (
            select 1 from public.draw_matches x where x.draw_id=d.id
            having count(*)<>jsonb_array_length(rotation->'fixtures')
                or count(distinct x.americano_fixture_key)<>jsonb_array_length(rotation->'fixtures')
        ) or exists (
            select 1 from jsonb_array_elements(rotation->'fixtures') f group by f->>'id' having count(*)<>1
        ) then
            raise exception 'Score every match in this rotation before completing';
        end if;
        update public.draws set status='completed',completed_at=now(),updated_at=clock_timestamp() where id=d.id;
        perform public.tm_log(p_event,'rotation.completed',jsonb_build_object('draw_id',d.id,'division_id',d.division_id));
        verdict:='completed';
    end if;
    return jsonb_build_object('organisationId',p_organisation,'eventId',p_event,'action',p_action,'drawId',d.id,
        'divisionId',d.division_id,'matchId',m.id,'status',verdict);
end;
$$;

revoke all on function private.tm_valid_rotation_score(jsonb,integer,boolean),
    private.tm_store_rotation_score(uuid,uuid,jsonb),public.tm_host_rotation_result(uuid,bigint,text,jsonb)
    from public,anon,authenticated,service_role;
grant execute on function public.tm_host_rotation_result(uuid,bigint,text,jsonb) to authenticated;
notify pgrst, 'reload schema';
