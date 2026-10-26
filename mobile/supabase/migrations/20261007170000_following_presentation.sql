-- Read-time presentation keeps approved portraits and entry deadlines current.
create function public.following_country(p_value text) returns text
language sql immutable set search_path=public as $$
 select case lower(trim(p_value))
 when 'uk' then 'GB' when 'sa' then 'ZA' when 'rsa' then 'ZA' when 'r.s.a' then 'ZA' when 'zar' then 'ZA' when '🇿🇦' then 'ZA'
 else coalesce((select code from (values
 ('ZA',array['south africa','south african','south-african','south africans','rsa (south africa)','afrique du sud']),
 ('AR',array['argentina','argentinian']),('AU',array['australia','australian']),('AT',array['austria','austrian']),
 ('BE',array['belgium','belgian']),('BJ',array['benin']),('BO',array['bolivia','bolivian']),('BW',array['botswana','motswana']),
 ('BR',array['brazil','brazilian']),('BY',array['belarus','belarusian']),('CN',array['china','chinese']),('CZ',array['czech','czechia']),
 ('DE',array['germany','german']),('ER',array['eritrea','eritrean']),('ES',array['spain','spanish']),('FR',array['france','french']),
 ('GB',array['british','english','united kingdom']),('GR',array['greece','greek']),('IE',array['ireland','irish']),
 ('IN',array['india','indian']),('IT',array['italy','italian']),('JP',array['japan','japanese']),('LB',array['lebanon','lebanese']),
 ('LS',array['lesotho']),('LU',array['luxembourg']),('MW',array['malawi','malawian']),('MZ',array['mozambique','mozambican']),
 ('NA',array['namibia','namibian']),('NG',array['nigeria','nigerian']),('NL',array['netherlands','dutch']),('PL',array['poland','polish']),
 ('PT',array['portugal','portuguese']),('RU',array['russia','russian']),('SE',array['sweden','swedish']),('SK',array['slovakia','slovak']),
 ('CH',array['switzerland','swiss']),('US',array['usa','united states of america','american']),('ZM',array['zambia','zambian']),
 ('ZW',array['zimbabwe','zimbabwean'])) countries(code,names) where lower(trim(p_value))=any(names)),
 case when trim(p_value) ~ '^[A-Za-z]{2}$' then upper(trim(p_value)) else null end) end;
$$;
revoke all on function public.following_country(text) from public,anon,authenticated;

create function public.following_activity_media(p_activity public.following_activity) returns jsonb
language plpgsql stable set search_path=public as $$
declare presentation jsonb:='{}'; actors jsonb; teams jsonb; people jsonb; participant jsonb; team_name text; person_name text; event record;
begin
  if cardinality(p_activity.local_player_ids)>0 then
    select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'photo_url',p.image_url,'nationality',following_country(p.nationality),'source','local') order by p.id)
      into actors from players p where p.id=any(p_activity.local_player_ids) and p.approved=true;
    if actors is not null then presentation:=presentation||jsonb_build_object('actors',actors); end if;
    if jsonb_typeof(p_activity.payload->'teams')='array' and jsonb_array_length(p_activity.payload->'teams')=2 then
      teams:='[]';
      for team_name in select value from jsonb_array_elements_text(p_activity.payload->'teams') loop
        people:='[]';
        for person_name in select trim(value) from unnest(string_to_array(team_name,' / ')) value limit 2 loop
          -- Ambiguous names never borrow another player's photo or country.
          select case when count(*)=1 then jsonb_build_object('id',min(p.id),'name',person_name,'photo_url',min(p.image_url),'nationality',following_country(min(p.nationality)),'source','local') else jsonb_build_object('name',person_name) end
            into participant from players p where p.approved=true and lower(trim(p.name))=lower(person_name);
          people:=people||jsonb_build_array(participant);
        end loop;
        teams:=teams||jsonb_build_array(people);
      end loop;
      presentation:=presentation||jsonb_build_object('participants',teams);
    end if;
  end if;
  if p_activity.event_id is not null then
    select c.image_url,c.registration_closes_at,c.start_date,c.end_date into event from calendar c where c.id=p_activity.event_id and c.is_visible=true and coalesce(c.registration_access,'public')='public';
    if found then presentation:=presentation||jsonb_build_object('event_image_url',event.image_url,'registration_closes_at',event.registration_closes_at,'event_start_date',event.start_date,'event_end_date',event.end_date); end if;
  end if;
  return presentation;
end $$;
revoke all on function public.following_activity_media(public.following_activity) from public,anon,authenticated;

create or replace function public.get_following_feed(p_filter text default 'all',p_limit integer default 20,p_before timestamptz default null,p_before_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare rows jsonb; own_locals bigint[]; own_pros bigint[];
begin
  if auth.uid() is null then raise exception 'Sign in to view Following'; end if;
  if p_filter is null or p_filter not in ('all','players','matches','tournaments') or p_limit is null or p_limit not between 1 and 50 or (p_before is null)<>(p_before_id is null) then raise exception 'Invalid feed filter or cursor'; end if;
  select coalesce(array_agg(f.player_id),'{}') into own_locals from local_player_follows f join players p on p.id=f.player_id and p.approved=true where f.user_id=auth.uid();
  select coalesce(array_agg(f.player_id),'{}') into own_pros from pro_player_follows f where f.user_id=auth.uid();
  select coalesce(jsonb_agg(to_jsonb(x) order by x.occurred_at desc,x.id desc),'[]') into rows from (
    select a.id,a.kind,a.title,a.body,a.photo_url,a.path,a.payload||public.following_activity_media(a) as payload,a.occurred_at,
      a.local_player_ids,a.pro_player_ids,a.event_id,a.native_match_id,a.pro_match_id
    from following_activity a
    where a.occurred_at<=now() and a.occurred_at>=now()-interval '90 days'
      and (p_before is null or (a.occurred_at,a.id)<(p_before,p_before_id))
      and (a.event_id is null or exists(select 1 from calendar c where c.id=a.event_id and c.is_visible=true and coalesce(c.registration_access,'public')='public'))
      and (a.native_match_id is null or exists(select 1 from draw_matches m join draws d on d.id=m.draw_id where m.id=a.native_match_id and d.status in ('published','in_progress','completed')))
      and (a.local_player_ids&&own_locals or a.pro_player_ids&&own_pros
        or exists(select 1 from pro_match_bookmarks b where b.user_id=auth.uid() and b.match_id=a.pro_match_id and b.bookmarked)
        or (a.kind='tournament' and exists(select 1 from event_notification_follows f where f.event_id=a.event_id and f.email=lower(trim(auth.jwt()->>'email')) and f.following)))
      and (p_filter='all'
        or p_filter='players' and (a.local_player_ids&&own_locals or a.pro_player_ids&&own_pros)
        or p_filter='matches' and a.kind in ('result','match_live','match_schedule')
        or p_filter='tournaments' and a.kind in ('entry','tournament'))
    order by a.occurred_at desc,a.id desc limit p_limit+1
  ) x;
  return jsonb_build_object('items',(select coalesce(jsonb_agg(value order by ordinality),'[]') from jsonb_array_elements(rows) with ordinality where ordinality<=p_limit),'has_more',jsonb_array_length(rows)>p_limit);
end $$;
revoke all on function public.get_following_feed(text,integer,timestamptz,uuid) from public,anon;
grant execute on function public.get_following_feed(text,integer,timestamptz,uuid) to authenticated;
