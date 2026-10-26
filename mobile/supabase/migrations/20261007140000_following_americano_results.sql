begin;
create or replace function public.record_following_native_result(p_match uuid,p_time timestamptz default now()) returns void
language plpgsql security definer set search_path=public as $$
declare m record; ids bigint[]; teams jsonb; scores jsonb; score_label text; winner integer; title text; state jsonb; fixture jsonb; one_names text; two_names text; score_one integer; score_two integer;
begin
  -- Americano pairs rotate per fixture; their published totals are rally points, not sets.
  select dm.*,d.event_id,d.division_id,d.scoring_rules->'americano' state,c.event_name into m
  from draw_matches dm join draws d on d.id=dm.draw_id join calendar c on c.id=d.event_id
  where dm.id=p_match and dm.americano_fixture_key is not null and dm.status='completed'
    and d.status in ('published','in_progress','completed') and c.is_visible=true and coalesce(c.registration_access,'public')='public';
  if found then
    state:=m.state;
    select f into fixture from jsonb_array_elements(coalesce(state->'fixtures','[]')) f where f->>'id'=m.americano_fixture_key;
    if jsonb_typeof(fixture->'score') is distinct from 'array' or jsonb_array_length(fixture->'score')<>2
      or (fixture->'score'->>0)!~'^[0-9]+$' or (fixture->'score'->>1)!~'^[0-9]+$' then return; end if;
    score_one:=(fixture->'score'->>0)::integer; score_two:=(fixture->'score'->>1)::integer;
    select string_agg(p->>'name',' / ' order by ord) into one_names from jsonb_array_elements_text(fixture->'one') with ordinality t(pid,ord)
      join lateral jsonb_array_elements(state->'players') p on p->>'id'=pid;
    select string_agg(p->>'name',' / ' order by ord) into two_names from jsonb_array_elements_text(fixture->'two') with ordinality t(pid,ord)
      join lateral jsonb_array_elements(state->'players') p on p->>'id'=pid;
    if nullif(one_names,'') is null or nullif(two_names,'') is null then return; end if;
    select coalesce(array_agg(distinct p.id),'{}') into ids from jsonb_array_elements_text((fixture->'one')||(fixture->'two')) t(pid)
      join event_registrations r on r.id::text=split_part(pid,':',1) and r.event_id=m.event_id
      join players p on p.approved=true and lower(trim(p.email))=lower(trim(case when pid like '%:partner' then r.partner_email else r.email end));
    winner:=case when score_one>score_two then 0 when score_two>score_one then 1 else null end;
    teams:=jsonb_build_array(one_names,two_names); scores:=jsonb_build_array(jsonb_build_array(score_one,score_two));
    title:=case when winner is null then one_names||' drew '||score_one||'–'||score_two||' with '||two_names
      else (teams->>winner)||' won '||greatest(score_one,score_two)||'–'||least(score_one,score_two)||' against '||(teams->>(1-winner)) end;
    perform record_following_activity(jsonb_build_object('event_key','native-result:'||m.id,'kind','result','local_player_ids',to_jsonb(ids),'event_id',m.event_id,'native_match_id',m.id,
      'title',title,'body',concat_ws(' · ',m.event_name,m.round_label),'path','/events/'||m.event_id||'?division='||m.division_id||'&match='||m.id,
      'payload',jsonb_build_object('teams',teams,'scores',scores,'winner',winner,'event_name',m.event_name,'round',m.round_label,'score_unit','points','result_type',case when winner is null then 'draw' else 'completed' end),'occurred_at',p_time));
    return;
  end if;
  select dm.*,d.event_id,d.division_id,c.event_name,a.player_one_id a1,a.player_two_id a2,b.player_one_id b1,b.player_two_id b2,
    coalesce(nullif(a.team_name,''),concat_ws(' / ',a.player_one_name,a.player_two_name)) one_name,
    coalesce(nullif(b.team_name,''),concat_ws(' / ',b.player_one_name,b.player_two_name)) two_name,
    (select image_url from players where id=a.player_one_id) photo
  into m from draw_matches dm join draws d on d.id=dm.draw_id join calendar c on c.id=d.event_id
    join draw_entries a on a.id=dm.entry_one_id join draw_entries b on b.id=dm.entry_two_id
  where dm.id=p_match and dm.status in ('completed','walkover','retired') and dm.winner_entry_id in (dm.entry_one_id,dm.entry_two_id)
    and d.status in ('published','in_progress','completed') and c.is_visible=true and coalesce(c.registration_access,'public')='public';
  if not found then return; end if;
  select coalesce(array_agg(distinct id),'{}') into ids from unnest(array[m.a1,m.a2,m.b1,m.b2]) id where id is not null;
  winner:=case when m.winner_entry_id=m.entry_one_id then 0 else 1 end;
  select coalesce(jsonb_agg(jsonb_build_array(entry_one_games,entry_two_games) order by set_number),'[]'),
    string_agg(case when winner=0 then entry_one_games||'–'||entry_two_games else entry_two_games||'–'||entry_one_games end,', ' order by set_number)
    into scores,score_label from draw_match_sets where match_id=m.id;
  if jsonb_array_length(scores)=0 and m.status<>'walkover' then return; end if;
  teams:=jsonb_build_array(m.one_name,m.two_name);
  title:=(teams->>winner)||case when m.status='walkover' then ' advanced by walkover against ' else ' won '||coalesce(score_label,'')||' against ' end||(teams->>(1-winner));
  perform record_following_activity(jsonb_build_object('event_key','native-result:'||m.id,'kind','result','local_player_ids',to_jsonb(ids),'event_id',m.event_id,'native_match_id',m.id,
    'title',title,'body',concat_ws(' · ',m.event_name,m.round_label),'photo_url',(select image_url from players where id=case when winner=0 then m.a1 else m.b1 end),'path','/events/'||m.event_id||'?division='||m.division_id||'&match='||m.id,
    'payload',jsonb_build_object('teams',teams,'scores',scores,'winner',winner,'event_name',m.event_name,'round',m.round_label,'result_type',m.result_type),'occurred_at',p_time));
end $$;
revoke all on function public.record_following_native_result(uuid,timestamptz) from public,anon,authenticated;

commit;
