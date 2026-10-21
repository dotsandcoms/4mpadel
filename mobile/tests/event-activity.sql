begin;
do $$
begin
  if has_function_privilege('anon','public.get_event_activity(bigint,text,integer,timestamptz,uuid)','EXECUTE') then raise exception 'Anonymous access'; end if;
  if has_function_privilege('authenticated','public.record_event_withdrawal(uuid,timestamptz)','EXECUTE') then raise exception 'Public worker access'; end if;
end $$;
select set_config('app.test_event_id', (select c.id::text from public.calendar c join public.following_activity a on a.event_id=c.id where c.is_visible=true and coalesce(c.registration_access,'public')='public' group by c.id order by count(*) desc limit 1),true);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f2f3ce24-11ce-4b70-9d67-35a433a71e12","role":"authenticated"}',true);
do $$
declare event bigint; a jsonb; next_page jsonb; first_row jsonb;
begin
  event := current_setting('app.test_event_id')::bigint;
  a := public.get_event_activity(event,'all',1);
  if jsonb_typeof(a->'items') <> 'array' or jsonb_array_length(a->'items')>1 then raise exception 'Invalid page'; end if;
  if a->>'has_more'='true' then
    first_row := a->'items'->0;
    next_page := public.get_event_activity(event,'all',1,(first_row->>'occurred_at')::timestamptz,(first_row->>'id')::uuid);
    if first_row->>'id'=next_page->'items'->0->>'id' then raise exception 'Duplicate cursor result'; end if;
  end if;
  a := public.get_event_activity(event,'entries',50);
  if exists(select 1 from jsonb_array_elements(a->'items') x where x->>'kind'<>'entry') then raise exception 'Filter failure'; end if;
  a := public.get_event_activity(9223372036854775806,'all',20);
  if a->'items'<>'[]'::jsonb then raise exception 'Unavailable event leaked'; end if;
  begin
    perform public.get_event_activity(event,'all',51);
    raise exception 'Expected invalid limit';
  exception when raise_exception then if SQLERRM<>'Invalid activity filter or cursor' then raise; end if; end;
  perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
  begin
    perform public.get_event_activity(event);
    raise exception 'Expected missing identity';
  exception when raise_exception then if SQLERRM<>'Sign in to view tournament activity' then raise; end if; end;
end $$;
reset role;
select 'PASS: access, filters, pagination and score repair' as verification,
  (select payload->'scores' from public.following_activity where pro_match_id=13736 and kind='result') as semifinal_scores;
rollback;
