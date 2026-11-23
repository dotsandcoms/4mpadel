-- Keep the existing group ordering. The Tournament Manager may rewrite the
-- detailed set rows without updating the native writer's summary. Use those
-- rows when present, and count the last partial set only toward games.
create or replace function public.tm_refresh_standings(p_draw uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
    insert into public.draw_standings(draw_id,group_id,entry_id,played,won,lost,sets_for,sets_against,
        games_for,games_against,standings_points,position,requires_manual_resolution,updated_at)
    with results as (
        select m.id,m.group_id,m.entry_one_id,m.entry_two_id,m.winner_entry_id,
            case when m.status='walkover' then 0 when scores.sets=0 then coalesce(m.result_summary[1],0) else scores.one_wins end one_wins,
            case when m.status='walkover' then 0 when scores.sets=0 then coalesce(m.result_summary[2],0) else scores.two_wins end two_wins,
            coalesce(scores.one_games,0) one_games,coalesce(scores.two_games,0) two_games
        from public.draw_matches m
        join public.draws d on d.id=m.draw_id
        cross join lateral (
            select count(*) sets,
                count(*) filter (where finished.set_finished and s.entry_one_games>s.entry_two_games)::integer one_wins,
                count(*) filter (where finished.set_finished and s.entry_one_games<s.entry_two_games)::integer two_wins,
                sum(s.entry_one_games) one_games,sum(s.entry_two_games) two_games
            from public.draw_match_sets s
            cross join lateral (
                select greatest(s.entry_one_games,s.entry_two_games) hi,least(s.entry_one_games,s.entry_two_games) lo
            ) games
            cross join lateral (
                select m.status<>'retired' or case
                    when s.is_match_tiebreak or (
                        coalesce((d.scoring_rules->>'match_tiebreak')::boolean,false)
                        and s.set_number=2*coalesce((d.scoring_rules->>'sets_to_win')::integer,2)-1
                    ) then (games.hi=10 and games.lo<=8) or (games.hi>10 and games.hi-games.lo=2)
                    else (games.hi=6 and games.lo<=4) or (games.hi=7 and games.lo in (5,6))
                end set_finished
            ) finished
            where s.match_id=m.id
        ) scores
        where m.draw_id=p_draw and m.status in ('completed','walkover','retired')
          and m.group_id is not null and m.entry_one_id is not null and m.entry_two_id is not null
    ), totals as (
        select e.id,e.group_id,e.seed_number,
            count(m.id)::integer played,count(m.id) filter (where m.winner_entry_id=e.id)::integer won,
            coalesce(sum(case when e.id=m.entry_one_id then m.one_wins else m.two_wins end),0)::integer sf,
            coalesce(sum(case when e.id=m.entry_one_id then m.two_wins else m.one_wins end),0)::integer sa,
            coalesce(sum(case when e.id=m.entry_one_id then m.one_games else m.two_games end),0)::integer gf,
            coalesce(sum(case when e.id=m.entry_one_id then m.two_games else m.one_games end),0)::integer ga
        from public.draw_entries e
        left join results m on m.group_id=e.group_id and e.id in (m.entry_one_id,m.entry_two_id)
        where e.draw_id=p_draw and e.group_id is not null
        group by e.id
    ), with_head_to_head as (
        select t.*,case when (select count(*) from totals o where o.group_id=t.group_id and o.won=t.won)=2
            then coalesce((
                select case when m.winner_entry_id=t.id then 1 else -1 end
                from public.draw_matches m join totals o on o.group_id=t.group_id and o.won=t.won and o.id<>t.id
                where m.draw_id=p_draw and m.group_id=t.group_id and m.winner_entry_id is not null
                  and t.id in (m.entry_one_id,m.entry_two_id) and o.id in (m.entry_one_id,m.entry_two_id)
                limit 1
            ),0) else 0 end h2h
        from totals t
    ), ranked as (
        select *,row_number() over (partition by group_id order by won desc,h2h desc,sf-sa desc,gf-ga desc,gf desc,seed_number nulls last,id) pos,
            count(*) over (partition by group_id,won,h2h,sf-sa,gf-ga,gf)>1 tied
        from with_head_to_head
    )
    select p_draw,group_id,id,played,won,played-won,sf,sa,gf,ga,won*2,pos,tied,clock_timestamp() from ranked
    on conflict(group_id,entry_id) do update set played=excluded.played,won=excluded.won,lost=excluded.lost,
        sets_for=excluded.sets_for,sets_against=excluded.sets_against,games_for=excluded.games_for,games_against=excluded.games_against,
        standings_points=excluded.standings_points,position=excluded.position,requires_manual_resolution=excluded.requires_manual_resolution,
        updated_at=excluded.updated_at;
end;
$$;

create function public.native_record_reviewed_main_result(
    p_organisation_id uuid,p_event_id bigint,p_draw_id uuid,p_expected_draw timestamptz,
    p_match_id uuid,p_expected_match timestamptz,p_result jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
    draw_record public.draws;
    reviewed public.draw_matches;
    saved public.draw_matches;
begin
    if auth.uid() is null or not coalesce(public.account_is_active(),false) then
        raise exception 'An active administrator is required' using errcode='42501';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('tm:'||p_event_id,0));

    if p_organisation_id is null then
        if not coalesce(public.is_super_admin(),false) or not coalesce(public.can_manage_native_draw(p_event_id),false) then
            raise exception 'An active platform administrator is required' using errcode='42501';
        end if;
        perform 1 from public.calendar c
         where c.id=p_event_id and c.is_manual is true and c.event_status is distinct from 'cancelled' for share;
        if not found then raise exception 'Choose an active 4M-hosted event' using errcode='42501'; end if;
    else
        perform 1 from public.organisation_members member
         where member.organisation_id=p_organisation_id and lower(btrim(member.user_email))=lower(btrim(auth.email()))
           and member.role in ('owner','admin') for share;
        if not found then raise exception 'Current owner or admin access to the host organisation is required' using errcode='42501'; end if;
        perform 1 from public.calendar c join public.organisations o on o.id=c.organisation_id
         where c.id=p_event_id and c.organisation_id=p_organisation_id and o.status='approved'
           and c.is_manual is true and c.event_status is distinct from 'cancelled' for share of c,o;
        if not found then raise exception 'Choose an active event owned by the selected organisation' using errcode='42501'; end if;
    end if;

    select d.* into draw_record
      from public.draws d join public.tournament_divisions v on v.id=d.division_id and v.event_id=d.event_id
     where d.id=p_draw_id and d.event_id=p_event_id and v.is_active is distinct from false
       and d.draw_kind='main' and d.format in ('knockout','group_only','group_knockout')
       and d.status in ('published','in_progress','completed')
     for update of d for share of v;
    if not found then raise exception 'Choose a published main draw in this event' using errcode='42501'; end if;
    if p_expected_draw is null or draw_record.updated_at is distinct from p_expected_draw then
        raise exception 'The draw changed. Reopen it before continuing';
    end if;

    select m.* into reviewed
      from public.draw_matches m
      join public.draw_entries one on one.id=m.entry_one_id and one.draw_id=m.draw_id
      join public.draw_entries two on two.id=m.entry_two_id and two.draw_id=m.draw_id
     where m.id=p_match_id and m.draw_id=draw_record.id and one.id<>two.id and (
        (draw_record.format in ('group_only','group_knockout') and m.stage='group' and one.group_id=m.group_id
          and two.group_id=m.group_id and exists (select 1 from public.draw_groups g where g.id=m.group_id and g.draw_id=m.draw_id))
        or (draw_record.format in ('knockout','group_knockout') and m.stage in ('knockout','placement') and m.group_id is null)
     )
     for update of m for share of one,two;
    if not found or p_expected_match is null or reviewed.updated_at is distinct from p_expected_match then
        raise exception 'The reviewed match changed or belongs to another draw';
    end if;

    perform public.native_record_draw_result(reviewed.id,reviewed.updated_at,p_result);
    if reviewed.stage='group' and p_result->>'kind'<>'live' then
        perform public.tm_refresh_standings(draw_record.id);
    end if;
    select * into saved from public.draw_matches where id=reviewed.id and draw_id=draw_record.id;

    return jsonb_build_object('organisation_id',p_organisation_id,'event_id',p_event_id,
        'draw_id',draw_record.id,'match_id',saved.id,'status',saved.status,'winner_entry_id',saved.winner_entry_id,
        'updated_at',saved.updated_at);
end;
$$;

revoke all on function public.native_record_reviewed_main_result(uuid,bigint,uuid,timestamptz,uuid,timestamptz,jsonb)
    from public,anon,authenticated,service_role;
grant execute on function public.native_record_reviewed_main_result(uuid,bigint,uuid,timestamptz,uuid,timestamptz,jsonb)
    to authenticated;
