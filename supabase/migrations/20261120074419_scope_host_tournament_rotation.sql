-- Rotation preparation uses the same reviewed event-year entrants and private
-- Tournament Manager persistence as fixed-pair draws. Derive any publicly
-- visible names from that roster, and accept only unscheduled, unscored rounds.
create function private.tm_host_rotation_state(
    p_event bigint, p_division uuid, p_review jsonb, p_configuration jsonb, p_state jsonb
) returns jsonb
language plpgsql stable set search_path = ''
as $$
declare
    team_mode boolean := p_configuration->>'format' = 'team_americano';
    rounds integer := (p_state->>'rounds')::integer;
    points integer := (p_configuration->>'points')::integer;
    courts integer := (p_state->>'courts')::integer;
    n integer;
    expected integer;
    valid_players integer;
    unique_people integer;
    players jsonb;
    teams jsonb;
    allowed_ids jsonb;
    allowed_pairs jsonb;
    fixtures jsonb;
    rests jsonb;
begin
    if jsonb_typeof(p_state->'players') is distinct from 'array'
        or jsonb_typeof(p_state->'fixtures') is distinct from 'array'
        or coalesce(p_state->>'variant','individual') <> (case when team_mode then 'team' else 'individual' end) then
        raise exception 'Generate a complete Americano rotation';
    end if;
    n := jsonb_array_length(p_state->'players');
    if n < 4 or n > (case when team_mode then 512 else 64 end)
        or n % (case when team_mode then 2 else 4 end) <> 0
        or rounds is null or rounds not between 1 and n-1
        or rounds is distinct from (case when team_mode then n/2 - 1 + (n/2)%2
            else coalesce((p_configuration->>'rounds')::integer,n-1) end)
        or points is null or points < 1 or points is distinct from (p_state->>'points')::integer
        or courts is null or courts not between 1 and n/4
        or courts is distinct from least(n/4,(p_configuration->>'courts')::integer)
        or jsonb_array_length(p_state->'fixtures') <> rounds * (n/4) then
        raise exception 'Rotation settings changed or the round list is incomplete';
    end if;

    with eligible as (
        select r.* from public.event_registrations r
        where r.event_id = p_event and r.division_id = p_division and lower(r.status) <> 'withdrawn'
            and not coalesce(p_review->'excluded','[]'::jsonb) ? r.id::text
            and (lower(r.payment_status) = 'paid' or nullif(btrim(p_review->'exceptions'->>r.id::text),'') is not null)
    ), roster as (
        select id::text id,full_name name,lower(btrim(email)) email from eligible
        union all
        select id::text||':partner',partner_name,lower(btrim(partner_email)) from eligible where team_mode
    )
    select count(r.id),count(distinct nullif(r.email,'')),
        jsonb_agg(jsonb_build_object('id',r.id,'name',r.name) order by requested.ordinal),
        (select case when team_mode then count(distinct array[least(lower(btrim(e.email)),lower(btrim(e.partner_email))),
            greatest(lower(btrim(e.email)),lower(btrim(e.partner_email)))])*2
            else count(distinct lower(btrim(e.email))) end from eligible e)
    into valid_players,unique_people,players,expected
    from jsonb_array_elements(p_state->'players') with ordinality requested(player,ordinal)
    join roster r on r.id = requested.player->>'id' and nullif(btrim(r.name),'') is not null;
    if valid_players <> n or unique_people <> n or expected <> n then
        raise exception 'Include each reviewed eligible entrant once from this division';
    end if;
    select jsonb_object_agg(person->>'id',true) into allowed_ids from jsonb_array_elements(players) person;
    if team_mode then
        if exists (
            select 1 from jsonb_array_elements(players) with ordinality captain(player,ordinal)
            where captain.ordinal % 2 = 1
                and (players->(captain.ordinal::integer)->>'id') is distinct from (captain.player->>'id')||':partner'
        ) then
            raise exception 'Team Americano needs the two registered partners in every pair';
        end if;
        select jsonb_agg(jsonb_build_object('id','team-'||((captain.ordinal+1)/2),
            'name',(captain.player->>'name')||' / '||(players->(captain.ordinal::integer)->>'name'),
            'players',jsonb_build_array(captain.player->>'id',players->(captain.ordinal::integer)->>'id')) order by captain.ordinal)
        into teams from jsonb_array_elements(players) with ordinality captain(player,ordinal) where captain.ordinal % 2 = 1;
        select jsonb_object_agg((team->'players')::text,true) into allowed_pairs from jsonb_array_elements(teams) team;
    end if;

    if exists (
        select 1 from jsonb_to_recordset(p_state->'fixtures')
            f(id text,round integer,court integer,wave integer,one text[],two text[],score jsonb,scheduled_start text,scheduled_end text)
        where f.id is null or f.id !~ ('^r'||f.round||'-m[1-9][0-9]*$')
            or f.round is null or f.round not between 1 and rounds
            or f.court is null or f.court not between 1 and courts or f.wave is null or f.wave < 1
            or f.id is distinct from 'r'||f.round||'-m'||((f.wave-1)::bigint*courts+f.court)
            or ((f.wave-1)::bigint*courts+f.court) > n/4
            or cardinality(f.one) is distinct from 2 or cardinality(f.two) is distinct from 2
            or f.score is not null or f.scheduled_start is not null or f.scheduled_end is not null
            or exists (select 1 from unnest(f.one||f.two) entrant(id)
                where entrant.id is null or not allowed_ids ? entrant.id)
            or (team_mode and (
                not allowed_pairs ? to_jsonb(f.one)::text or not allowed_pairs ? to_jsonb(f.two)::text
            ))
    ) or exists (
        select 1 from jsonb_to_recordset(p_state->'fixtures') f(id text,round integer,one text[],two text[])
        cross join lateral unnest(f.one||f.two) entrant(id)
        group by f.round,entrant.id having count(*) <> 1
    ) or exists (
        select 1 from jsonb_to_recordset(p_state->'fixtures') f(id text) group by f.id having count(*) <> 1
    ) then
        raise exception 'Rotation contains an invalid or repeated player, round or court slot';
    end if;
    if team_mode and exists (
        select 1 from jsonb_to_recordset(p_state->'fixtures') f(one text[],two text[])
        group by least(f.one[1],f.two[1]),greatest(f.one[1],f.two[1]) having count(*) <> 1
    ) then
        raise exception 'Every fixed team must meet each other team once';
    elsif not team_mode and exists (
        select 1 from jsonb_to_recordset(p_state->'fixtures') f(one text[],two text[])
        cross join lateral (values(f.one[1],f.one[2]),(f.two[1],f.two[2])) pair(a,b)
        group by least(pair.a,pair.b),greatest(pair.a,pair.b) having count(*) <> 1
    ) then
        raise exception 'A rotating pair cannot play together more than once';
    end if;

    select jsonb_agg(jsonb_build_object('id',f.id,'round',f.round,'court',f.court,'wave',f.wave,
        'one',f.one,'two',f.two,'score',null) order by f.round,f.wave,f.court)
    into fixtures from jsonb_to_recordset(p_state->'fixtures') f(id text,round integer,court integer,wave integer,one text[],two text[]);
    if team_mode then
        with occupying as (
            select f.round,side.captain from jsonb_to_recordset(fixtures) f(round integer,one text[],two text[])
            cross join lateral (values(f.one[1]),(f.two[1])) side(captain)
        )
        select coalesce(jsonb_agg(jsonb_build_object('round',r,'team_id',team->>'id') order by r),'[]'::jsonb)
        into rests from generate_series(1,rounds) r cross join jsonb_array_elements(teams) team
        left join occupying used on used.round=r and used.captain=team->'players'->>0
        where used.captain is null;
    end if;
    return jsonb_build_object('players',players,'rounds',rounds,'points',points,'courts',courts,'fixtures',fixtures)
        || case when team_mode then jsonb_build_object('variant','team','teams',teams,'rests',rests) else '{}'::jsonb end;
end;
$$;

create function public.tm_host_rotation_preparation(
    p_organisation uuid, p_event bigint, p_action text, p_payload jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
    event public.calendar;
    c public.tournament_confirmations;
    d public.draws;
    v_division uuid;
    configuration jsonb;
    rotation jsonb;
    expected_revision integer;
begin
    if auth.uid() is null or not coalesce(public.account_is_active(),false)
        or p_action is null or p_action not in ('confirm','save_draw','publish_draw') then
        raise exception 'This rotation action requires the event host' using errcode = '42501';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('tm:'||p_event,0));
    perform 1 from public.organisation_members m
        where m.organisation_id=p_organisation and lower(btrim(m.user_email))=lower(btrim(auth.email()))
        and m.role in ('owner','admin') for share;
    if not found then raise exception 'Current owner or admin access to the host organisation is required' using errcode = '42501'; end if;
    select calendar_row.* into event from public.calendar calendar_row join public.organisations o on o.id=calendar_row.organisation_id
        where calendar_row.id=p_event and calendar_row.organisation_id=p_organisation and o.status='approved'
        and calendar_row.is_manual is true and calendar_row.event_status is distinct from 'cancelled' for share of calendar_row,o;
    if not found then raise exception 'Choose an active 4M event in the selected approved organisation' using errcode = '42501'; end if;

    if p_action='publish_draw' then
        select division_id into v_division from public.draws where id=(p_payload->>'p_draw')::uuid
            and event_id=p_event and draw_kind='main' and format='americano';
    else
        v_division := (p_payload->>'p_division')::uuid;
        expected_revision := (p_payload->>'p_expected')::integer;
    end if;
    perform 1 from public.tournament_divisions v
        where v.id=v_division and v.event_id=p_event and v.is_active is distinct from false for update;
    if not found then raise exception 'Choose an active division in the reviewed event' using errcode = '42501'; end if;
    perform 1 from public.event_registrations r where r.division_id=v_division order by r.id for share;
    if exists(select 1 from public.event_registrations r where r.division_id=v_division and r.event_id is distinct from p_event)
        or exists(select 1 from public.draws x where x.division_id=v_division and x.event_id is distinct from p_event) then
        raise exception 'A division record belongs to another event';
    end if;
    select * into c from public.tournament_confirmations where event_id=p_event and division_id=v_division for update;
    if c.players_confirmed_at is null or c.players_fingerprint is distinct from public.tm_player_fingerprint(v_division) then
        raise exception 'Confirm the current player list first';
    end if;

    if p_action='confirm' then
        configuration:=p_payload->'p_payload';
        if p_payload->>'p_kind' is distinct from 'format'
            or coalesce(configuration->>'format','') not in ('americano','team_americano')
            or coalesce((configuration->>'points')::integer,0)<1
            or coalesce((configuration->>'courts')::integer,0) not between 1 and 128
            or (configuration->>'rounds' is not null and (configuration->>'rounds')::integer not between 1 and 63) then
            raise exception 'Check the Americano format, rounds, rally points and courts';
        end if;
        select jsonb_object_agg(key,value) into configuration from jsonb_each(configuration)
            where key in ('format','points','courts','rounds','sets_to_win','ranking_source');
        perform private.tm_review_confirm(p_event,v_division,'format',configuration,expected_revision,p_organisation);
    else
        -- Take both draw-writer locks in the existing order before reviewing the stored bracket.
        perform pg_advisory_xact_lock(hashtextextended(v_division::text,0));
        select * into d from public.draws where event_id=p_event and division_id=v_division and draw_kind='main' for update;
        if d.id is not null then
            perform 1 from public.draw_groups where draw_id=d.id order by id for share;
            perform 1 from public.draw_entries where draw_id=d.id order by id for share;
            perform 1 from public.draw_matches where draw_id=d.id order by id for share;
        end if;
        if private.tm_host_draw_token(d.id) is distinct from (p_payload->>'p_draw_token')
            or (d.id is not null and (d.status is distinct from 'draft' or d.published_at is not null)) then
            raise exception 'The saved draw changed. Reload and review the draft again';
        end if;
        if c.format_confirmed_at is null or coalesce(c.configuration->>'format','') not in ('americano','team_americano') then
            raise exception 'Confirm the rotation format before saving';
        end if;
        if d.id is not null and exists (
            select 1 from public.draw_matches m where m.draw_id=d.id and (
                m.scheduled_start is not null or m.scheduled_end is not null
                or m.status not in ('pending','walkover')
                or exists(select 1 from public.draw_match_sets s where s.match_id=m.id)
            )
        ) then
            raise exception 'An assigned tournament administrator must review scheduled or played matches';
        end if;

        if p_action='save_draw' then
            rotation:=private.tm_host_rotation_state(p_event,v_division,c.review,c.configuration,p_payload->'p_draw'->'rotation');
            perform private.tm_review_save_draw(p_event,v_division,expected_revision,
                jsonb_build_object('format','americano','rotation',rotation),p_organisation);
            select * into strict d from public.draws where event_id=p_event and division_id=v_division and draw_kind='main';
        else
            if event.is_visible is distinct from true then raise exception 'Make the event public before publishing its draw'; end if;
            if d.id is distinct from (p_payload->>'p_draw')::uuid or d.format is distinct from 'americano' then
                raise exception 'Choose the reviewed main rotation in this division';
            end if;
            rotation:=private.tm_host_rotation_state(p_event,v_division,c.review,c.configuration,d.scoring_rules->'americano');
            if rotation is distinct from d.scoring_rules->'americano' or exists (
                select 1 from public.draw_matches m
                left join jsonb_to_recordset(rotation->'fixtures') f(id text,round integer,court integer,wave integer)
                    on f.id=m.americano_fixture_key and f.round=m.round_number and f.wave=m.bracket_position and 'Court '||f.court=m.court_name
                where m.draw_id=d.id and (
                    f.id is null or m.stage <> 'group' or m.status <> 'pending' or m.entry_one_id is not null or m.entry_two_id is not null
                    or m.winner_entry_id is not null or m.result_type is not null or m.group_id is not null
                    or m.winner_to_match_id is not null or m.winner_to_slot is not null
                    or m.loser_to_match_id is not null or m.loser_to_slot is not null
                )
            ) or exists(select 1 from public.draw_matches where draw_id=d.id
                having count(*) <> jsonb_array_length(rotation->'fixtures')
                or count(distinct americano_fixture_key) <> jsonb_array_length(rotation->'fixtures')) then
                raise exception 'The stored rotation fixtures changed. Generate a fresh preview';
            end if;
            perform private.tm_review_publish_draw(p_event,d.id,(p_payload->>'p_expected')::timestamptz,p_organisation);
        end if;
    end if;
    return jsonb_build_object('organisationId',p_organisation,'eventId',p_event,'action',p_action,
        'divisionId',v_division,'drawId',d.id);
end;
$$;

revoke all on function private.tm_host_rotation_state(bigint,uuid,jsonb,jsonb,jsonb),
    public.tm_host_rotation_preparation(uuid,bigint,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.tm_host_rotation_preparation(uuid,bigint,text,jsonb) to authenticated;
