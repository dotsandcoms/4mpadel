-- Review an exact RankedIn roster, then apply the same plan in a single transaction.
create function public.admin_import_rankedin_participants(
  p_event_id bigint, p_rankedin_id text, p_entries jsonb, p_expected text default null
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  selected_event public.calendar;
  linked_rankedin_id text;
  plan jsonb;
  token text;
  item jsonb;
  inserted integer := 0;
  updated integer := 0;
  removed integer := 0;
  touched integer;
begin
  if auth.uid() is null or public.account_is_active() is distinct from true
     or public.is_super_admin(auth.email()) is distinct from true
     or public.can_manage_event(p_event_id) is distinct from true then
    raise exception 'Current platform Event Manager authority is required.' using errcode = '42501';
  end if;
  if p_expected is not null then
    select * into selected_event from public.calendar where id = p_event_id for update;
  else
    select * into selected_event from public.calendar where id = p_event_id;
  end if;
  if not found or selected_event.is_manual is true or selected_event.event_status = 'cancelled' then
    raise exception 'Select a saved active RankedIn event.';
  end if;
  linked_rankedin_id := coalesce(nullif(btrim(selected_event.rankedin_id), ''),
    substring(selected_event.rankedin_url from '/(?:tournament|clubleague|draws|results)/([0-9]+)'),
    substring(selected_event.rankedin_url from '[?&]id=([0-9]+)'),
    substring(selected_event.rankedin_url from '/([0-9]+)/?$'));
  if p_rankedin_id is null or p_rankedin_id !~ '^[1-9][0-9]*$'
     or p_rankedin_id is distinct from linked_rankedin_id then
    raise exception 'The event’s RankedIn link changed. Open a fresh review.';
  end if;
  if jsonb_typeof(p_entries) is distinct from 'array' or jsonb_array_length(p_entries) > 5000 then
    raise exception 'Review a complete roster of no more than 5,000 entries.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_entries) as r(item)
    where jsonb_typeof(r.item) is distinct from 'object'
      or jsonb_typeof(r.item->'id') is distinct from 'string'
      or jsonb_typeof(r.item->'name') is distinct from 'string'
      or jsonb_typeof(r.item->'division') is distinct from 'string'
      or r.item->>'id' !~ '^[A-Za-z0-9._:-]{1,100}$' or r.item->>'id' = '0'
      or char_length(btrim(r.item->>'name')) not between 1 and 200
      or char_length(btrim(r.item->>'division')) not between 1 and 200
  ) or exists (
    select 1 from jsonb_to_recordset(p_entries) as r(id text, name text, division text)
    group by r.id, btrim(r.division) having count(*) > 1
  ) then
    raise exception 'The RankedIn roster contains an invalid or repeated entry.';
  end if;
  if p_expected is not null then
    perform 1 from public.tournament_participants p where p.event_id = p_event_id order by p.id for update;
  end if;

  with source as (
    select r.id, btrim(r.name) as name, btrim(r.division) as division
    from jsonb_to_recordset(p_entries) as r(id text, name text, division text)
  ), current_roster as (
    select p.* from public.tournament_participants p where p.event_id = p_event_id
  ), combined as (
    select s.id as source_id, s.name, s.division, p.id as row_id, p.rankedin_participant_id,
      p.full_name, p.class_name, p.profile_id, p.email, p.is_paid, p.metadata, to_jsonb(p) as before_row,
      p.is_test is true or p.metadata->>'source' = 'event_registration' or coalesce(p.metadata ? 'registration_id', false) as local_entry,
      p.whatsapp_added is true or p.profile_id is not null or nullif(btrim(p.email), '') is not null
        or p.is_paid is true or coalesce(p.metadata, '{}'::jsonb) - 'payment_method' <> '{}'::jsonb
        or exists (select 1 from public.payments pay where pay.event_id = p_event_id and
          (pay.metadata->>'participant_id' = p.id::text or exists (
            select 1 from jsonb_array_elements(case when jsonb_typeof(pay.metadata->'line_items') = 'array'
              then pay.metadata->'line_items' else '[]'::jsonb end) as line(entry)
            where line.entry->>'participant_id' = p.id::text
          ))) as protected
    from source s full join current_roster p on p.rankedin_participant_id = s.id and p.class_name = s.division
    where s.id is not null or (p.rankedin_participant_id is not null and p.rankedin_participant_id <> '0')
  ), resolved as (
    select c.*, coalesce(c.profile_id, candidate.profile_id) as next_profile,
      coalesce(nullif(btrim(c.email), ''), nullif(btrim(linked.email), ''), candidate.email) as next_email
    from combined c
    left join public.players linked on linked.id = c.profile_id
    left join lateral (
      select min(a.id) as profile_id, min(nullif(btrim(a.email), '')) as email
      from public.players a where c.profile_id is null and a.rankedin_id = c.source_id
        and (nullif(btrim(c.email), '') is null or lower(btrim(a.email)) = lower(btrim(c.email)))
      having count(*) = 1
    ) candidate on true
  ), payable as (
    select c.*, coalesce(c.is_paid, false) or (
      c.metadata->>'manual_unpaid' is distinct from 'true' and c.next_email is not null and exists (
        select 1 from public.event_registrations r
        where r.event_id = p_event_id and r.division = c.division
          and lower(btrim(r.email)) = lower(btrim(c.next_email))
          and r.status is distinct from 'withdrawn' and r.payment_status = 'paid'
      )) as next_paid
    from resolved c
  ), actions as (
    select c.*, case
      when c.source_id is null and (coalesce(c.local_entry, false) or c.protected) then 'retain'
      when c.source_id is null then 'remove'
      when c.row_id is null then 'add'
      when not coalesce(c.local_entry, false) and
        (c.name is distinct from c.full_name or c.next_profile is distinct from c.profile_id
         or c.next_email is distinct from c.email or c.next_paid is distinct from coalesce(c.is_paid, false)) then 'update'
      else 'unchanged'
    end as kind from payable c
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'action', kind, 'row_id', row_id, 'source_id', source_id, 'name', coalesce(name, full_name),
    'division', coalesce(division, class_name), 'profile', next_profile, 'email', next_email, 'paid', next_paid,
    'before', before_row
  ) order by coalesce(division, class_name), coalesce(source_id, rankedin_participant_id), row_id), '[]'::jsonb)
  into plan from actions where kind <> 'unchanged';

  token := encode(sha256(convert_to(jsonb_build_array(auth.uid(), p_event_id, p_rankedin_id, p_entries, plan)::text, 'UTF8')), 'hex');
  if p_expected is null then
    return jsonb_build_object('event_id', p_event_id, 'token', token, 'changes',
      (select coalesce(jsonb_agg(entry - array['email','before','row_id','profile'] order by position), '[]'::jsonb)
       from jsonb_array_elements(plan) with ordinality as p(entry,position)));
  end if;
  if p_expected is distinct from token then
    raise exception 'The imported roster or its payment evidence changed. Review it again.';
  end if;

  for item in select value from jsonb_array_elements(plan) loop
    case item->>'action'
      when 'add' then
        insert into public.tournament_participants (
          event_id, rankedin_participant_id, full_name, class_name, profile_id, email, is_paid
        ) values (p_event_id, item->>'source_id', item->>'name', item->>'division',
          (item->>'profile')::bigint, item->>'email', (item->>'paid')::boolean);
        inserted := inserted + 1;
      when 'update' then
        update public.tournament_participants
        set full_name = item->>'name', profile_id = (item->>'profile')::bigint, email = item->>'email',
            is_paid = (item->>'paid')::boolean, last_synced_at = clock_timestamp()
        where event_id = p_event_id and id = (item->>'row_id')::uuid;
        get diagnostics touched = row_count;
        if touched <> 1 then raise exception 'Could not update the reviewed participant.'; end if;
        updated := updated + 1;
      when 'remove' then
        delete from public.tournament_participants where event_id = p_event_id and id = (item->>'row_id')::uuid;
        get diagnostics touched = row_count;
        if touched <> 1 then raise exception 'Could not remove the reviewed participant.'; end if;
        removed := removed + 1;
      else null;
    end case;
  end loop;
  if inserted + updated + removed > 0 then
    if public.log_event_activity(p_event_id, 'admin.import_rankedin_roster', 'ADMIN', 'Updated the RankedIn roster.',
      jsonb_build_object('rankedin_id', p_rankedin_id, 'inserted', inserted, 'updated', updated, 'removed', removed), 'ADMIN') is null then
      raise exception 'Could not record the roster import in the event activity log.';
    end if;
  end if;
  return jsonb_build_object('event_id', p_event_id, 'status', 'saved', 'inserted', inserted, 'updated', updated, 'removed', removed);
end;
$$;

revoke all on function public.admin_import_rankedin_participants(bigint, text, jsonb, text)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_import_rankedin_participants(bigint, text, jsonb, text) to authenticated;
