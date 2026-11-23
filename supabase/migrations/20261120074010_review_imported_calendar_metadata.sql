create function public.admin_review_imported_calendar_event(
  p_event_id bigint, p_expected text default null, p_changes jsonb default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  editable constant text[] := array[
    'event_name','sapa_status','tournament_tag','points','description',
    'start_date','end_date','start_time','end_time','city','venue','address',
    'organisation_id','organiser_name','organiser_email','organiser_phone','organiser_website',
    'entry_fee','allow_payments','finance_managed','is_visible','featured_event','featured_result',
    'is_spotlight','featured_live','is_league','live_youtube_url','youtube_playlist_url','live_players','next_match',
    'image_url','custom_image_url'
  ];
  identity_fields constant text[] := array[
    'id','slug','rankedin_id','rankedin_url','club_id','is_manual','is_quick_event',
    'event_status','event_dates','is_weekly','series_id','show_in_recent_results'
  ];
  reviewed public.calendar;
  changed public.calendar;
  snapshot jsonb;
  record_version text;
  assignments text;
begin
  if auth.uid() is null or not coalesce(public.account_is_active(), false)
    or not coalesce(public.is_super_admin(auth.email()), false) then
    raise exception 'An active platform administrator is required' using errcode = '42501';
  end if;
  if p_changes is null then
    select * into reviewed from public.calendar where id = p_event_id;
  else
    select * into reviewed from public.calendar where id = p_event_id for update;
  end if;
  if not found or reviewed.is_manual is true or reviewed.is_quick_event is true
    or reviewed.event_status = 'cancelled' or (reviewed.is_weekly is true and reviewed.series_id is not null) then
    raise exception 'Choose an active imported calendar event';
  end if;
  select jsonb_object_agg(key, value) into snapshot
    from jsonb_each(to_jsonb(reviewed)) where key = any(editable || identity_fields);
  record_version := md5(snapshot::text);
  if p_changes is null then
    return jsonb_build_object('record', snapshot, 'version', record_version);
  end if;
  if p_expected is distinct from record_version then
    raise exception 'The event changed after review';
  end if;
  if jsonb_typeof(p_changes) is distinct from 'object' or p_changes = '{}'::jsonb
    or p_changes - editable <> '{}'::jsonb or length(p_changes::text) > 30000 then
    raise exception 'Review valid calendar metadata changes';
  end if;
  changed := jsonb_populate_record(reviewed, p_changes);
  if p_changes ? 'event_name' and nullif(btrim(changed.event_name), '') is null then
    raise exception 'Enter an event name';
  end if;
  if p_changes ?| array['start_date','end_date','start_time','end_time'] and (
    (changed.end_date is not null and (changed.start_date is null or changed.end_date < changed.start_date))
    or (changed.start_date is not null and coalesce(changed.end_date, changed.start_date) = changed.start_date
      and changed.start_time is not null and changed.end_time is not null and changed.end_time < changed.start_time)
  ) then
    raise exception 'Choose a valid event date and time range';
  end if;
  if (p_changes ? 'entry_fee' and (jsonb_typeof(p_changes->'entry_fee') not in ('number','null') or changed.entry_fee < 0))
    or (p_changes ? 'points' and (jsonb_typeof(p_changes->'points') not in ('number','null') or changed.points < 0)) then
    raise exception 'Use non-negative entry fees and ranking points';
  end if;
  if exists (select 1 from jsonb_each(p_changes) as supplied(key, value)
    where key = any(array['allow_payments','finance_managed','is_visible','featured_event','featured_result',
      'is_spotlight','featured_live','is_league']) and jsonb_typeof(value) is distinct from 'boolean') then
    raise exception 'Choose a valid publishing option';
  end if;
  if exists (select 1 from jsonb_each_text(p_changes) as supplied(key, value)
    where key = any(array['organiser_website','image_url','custom_image_url','live_youtube_url','youtube_playlist_url'])
      and nullif(value, '') is not null and value !~* '^https?://[^[:space:]]+$') then
    raise exception 'Use full HTTP or HTTPS web links';
  end if;
  if changed.organisation_id is not null and changed.organisation_id is distinct from reviewed.organisation_id then
    perform 1 from public.organisations where id = changed.organisation_id and status = 'approved' for share;
    if not found then raise exception 'Choose a current approved organisation'; end if;
  end if;
  if p_changes ?| array['start_date','end_date'] then
    changed.event_dates := case
      when changed.start_date is null then ''
      when changed.end_date is null or changed.end_date = changed.start_date then to_char(changed.start_date, 'FMDD FMMonth YYYY')
      when date_trunc('month', changed.start_date) = date_trunc('month', changed.end_date)
        then to_char(changed.start_date, 'FMDD') || ' - ' || to_char(changed.end_date, 'FMDD FMMonth')
      when extract(year from changed.start_date) = extract(year from changed.end_date)
        then to_char(changed.start_date, 'FMDD Mon') || ' - ' || to_char(changed.end_date, 'FMDD Mon')
      else to_char(changed.start_date, 'FMDD Mon YYYY') || ' - ' || to_char(changed.end_date, 'FMDD Mon YYYY')
    end;
    p_changes := p_changes || jsonb_build_object('event_dates', changed.event_dates);
  end if;
  if p_changes ? 'featured_result' then
    changed.show_in_recent_results := changed.featured_result;
    p_changes := p_changes || jsonb_build_object('show_in_recent_results', changed.show_in_recent_results);
  end if;

  -- Updating an unchanged venue still fires the Calendar club assignment trigger.
  -- Only allowlisted changed columns and the two derived fields enter the statement.
  select string_agg(format('%1$I = ($1::public.calendar).%1$I', key), ', ' order by key)
    into assignments from jsonb_object_keys(p_changes) as keys(key);
  execute format('update public.calendar set %s where id = $2 returning id', assignments)
    into p_event_id using changed, reviewed.id;
  if p_event_id is distinct from reviewed.id then raise exception 'Could not confirm the saved calendar event'; end if;
  return jsonb_build_object('event_id', p_event_id);
end;
$$;

revoke all on function public.admin_review_imported_calendar_event(bigint,text,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.admin_review_imported_calendar_event(bigint,text,jsonb) to authenticated;
