-- Calendar visibility controls listings. Approved manual events remain payable by direct link.
-- Preserve session, ownership, sanction, access-code, deadline and capacity checks.
create or replace function private.reserve_checkout_holds(p_rows jsonb,p_owner text,p_payment uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare item jsonb; incoming public.event_registrations; c public.calendar; d public.tournament_divisions;
 existing private.event_checkout_holds; actor text:=lower(trim(auth.email())); worker boolean:=private.worker_write();
begin
 if not worker and (not private.permission_actor_active() or actor is distinct from lower(trim(p_owner))) then
  raise exception 'Sign in before starting registration.' using errcode='42501';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>120 then raise exception 'Choose valid registration entries.';end if;
 perform 1 from public.calendar where id in(select distinct (value->>'event_id')::bigint from jsonb_array_elements(p_rows)) order by id for update;
 perform public.assert_event_registration_payments_open(p_rows);
 for item in select value from jsonb_array_elements(p_rows) loop
  incoming:=jsonb_populate_record(null::public.event_registrations,item);
  incoming.email:=private.canonical_entry_contact(incoming.email,incoming.event_id);
  incoming.registered_by:=private.canonical_entry_contact(incoming.registered_by,incoming.event_id);
  select * into c from public.calendar where id=incoming.event_id;
  select * into d from public.tournament_divisions where event_id=c.id and
   (id=incoming.division_id or (incoming.division_id is null and name=incoming.division)) order by id limit 1;
  if c.id is null or coalesce(c.event_status,'')='cancelled' or (not coalesce(c.is_weekly,false) and not coalesce(c.is_quick_event,false) and d.id is null)
   then raise exception 'Choose an available event and division.';end if;
  if not worker and not coalesce(private.finance_event(c.id),false) then
   if (c.is_visible is false and not coalesce(c.is_manual,false)) or c.sanction_status in('pending','rejected') then raise exception 'This event is unavailable.';end if;
   if c.registration_access in('code','protected') and not coalesce(public.event_access_grant_valid(c.id,incoming.access_grant_id),false) then raise exception 'Unlock this event before registering.';end if;
   if lower(trim(incoming.email)) is distinct from actor and
    (lower(trim(incoming.registered_by)) is distinct from actor or lower(trim(incoming.partner_email)) is distinct from actor)
    then raise exception 'Choose your own registration or your selected partner.' using errcode='42501';end if;
  end if;
  if exists(select 1 from public.event_registrations r where r.event_id=c.id and lower(trim(r.email))=lower(trim(incoming.email))
    and r.status is distinct from 'withdrawn' and lower(coalesce(r.payment_status,'')) in('paid','comped','complimentary','waived')
    and (r.division_id=d.id or (r.division_id is null and r.division=incoming.division))) then continue;end if;
  select * into existing from private.event_checkout_holds where event_id=c.id and email=lower(trim(incoming.email)) and division=coalesce(d.name,incoming.division);
  if existing.state='active' and existing.expires_at>clock_timestamp() and existing.owner_email<>lower(trim(p_owner)) then
   raise exception 'This player already has an active checkout. Please wait for it to finish or expire.';end if;
  insert into private.event_checkout_holds(event_id,division_id,division,email,owner_email,payload,payment_id,expires_at)
   values(c.id,d.id,coalesce(d.name,incoming.division),lower(trim(incoming.email)),lower(trim(p_owner)),
    item||jsonb_build_object('email',incoming.email,'division',coalesce(d.name,incoming.division),'division_id',d.id),p_payment,clock_timestamp()+interval '30 minutes')
   on conflict(event_id,email,division) do update set owner_email=excluded.owner_email,payload=excluded.payload,payment_id=excluded.payment_id,
    expires_at=case when event_checkout_holds.state='active' and event_checkout_holds.expires_at>clock_timestamp() then event_checkout_holds.expires_at else excluded.expires_at end,state='active';
 end loop;
 for incoming in select * from jsonb_populate_recordset(null::public.event_registrations,p_rows) loop
  select * into d from public.tournament_divisions where event_id=incoming.event_id and (id=incoming.division_id or name=incoming.division) order by id limit 1;
  perform private.assert_checkout_hold_capacity(incoming.event_id,d.id);
 end loop;
end $$;

notify pgrst,'reload schema';
