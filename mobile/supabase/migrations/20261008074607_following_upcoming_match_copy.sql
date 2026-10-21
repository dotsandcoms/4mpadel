-- Clarify existing schedule cards without replaying notifications or changing feed order.
-- Old cards did not retain their previous schedule, so they describe the upcoming fixture.
do $migration$
declare
  activity record;
  scheduled timestamptz;
  details text;
begin
  for activity in
    select id, title, body, payload from public.following_activity
    where kind = 'match_schedule' and title like 'Schedule updated for %'
  loop
    scheduled := null;
    begin
      scheduled := nullif(activity.payload->>'scheduled_at', '')::timestamptz;
    exception when invalid_datetime_format or datetime_field_overflow then
      scheduled := null;
    end;
    details := case when scheduled is not null and extract(year from scheduled) > 2000
      then to_char(scheduled at time zone 'Africa/Johannesburg', 'FMDD Mon, HH24:MI') || ' SAST'
      else 'Time to be confirmed' end;
    details := concat_ws(' · ', details, nullif(activity.payload->>'court', ''));
    update public.following_activity
    set title = regexp_replace(activity.title, '^Schedule updated for ', 'Upcoming match: '),
        body = concat_ws(E'\n', nullif(split_part(activity.body, E'\n', 1), ''), details),
        payload = activity.payload || jsonb_build_object('schedule_update', 'upcoming', 'scores', '[]'::jsonb)
    where id = activity.id;
  end loop;
end;
$migration$;
