begin;

-- Registration profile lookups are by email. Align the name of the existing
-- exact contact without running a player substitution or relinking a receipt.
create function private.admin_align_registration_profile_name(
  p_event bigint,p_registration uuid,p_player bigint,p_scope text,p_expected jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  event_row public.calendar;
  entry public.event_registrations;
  saved public.event_registrations;
  profile public.players;
begin
  if private.permission_actor_active() is distinct from true
    or public.can_manage_event(p_event) is distinct from true then
    raise exception 'Current Event Manager access is required.' using errcode='42501';
  end if;
  select c.* into event_row from public.calendar c where c.id=p_event and c.is_manual is true
    and (p_scope='all' or p_scope='org:'||c.organisation_id::text or p_scope='club:'||c.club_id::text) for update;
  if event_row.id is null or event_row.cancelled_at is not null or event_row.event_status='cancelled' then
    raise exception 'Choose an active event in this workspace.' using errcode='42501';
  end if;
  select r.* into entry from public.event_registrations r
    where r.id=p_registration and r.event_id=p_event for update;
  if entry.id is null or entry.status is distinct from 'registered' or entry.withdrawn_at is not null then
    raise exception 'Choose an active registration in this event.' using errcode='22023';
  end if;
  select p.* into profile from public.players p where p.id=p_player for share;
  if profile.id is null or nullif(trim(profile.email),'') is null or nullif(trim(profile.name),'') is null
    or lower(trim(entry.email)) is distinct from lower(trim(profile.email))
    or exists (select 1 from public.players p where p.id<>profile.id and lower(trim(p.email))=lower(trim(profile.email))) then
    raise exception 'A unique player profile with the same email is required.' using errcode='22023';
  end if;
  if jsonb_build_object('entry_name',entry.full_name,'entry_email',entry.email,'profile_name',profile.name,
    'profile_email',profile.email,'division',entry.division,'division_id',entry.division_id) is distinct from p_expected then
    raise exception 'The displayed registration or profile changed. Open it again.' using errcode='40001';
  end if;
  if entry.full_name is not distinct from profile.name then
    raise exception 'The registration already matches this profile.' using errcode='22023';
  end if;
  if exists (select 1 from public.draws d where d.event_id=p_event and d.status is distinct from 'archived'
      and (d.division_id=entry.division_id or exists (select 1 from public.draw_entries de
        where de.draw_id=d.id and de.source_registration_id=entry.id))) then
    raise exception 'This registration is in an active draw. Review the draw before changing its displayed name.' using errcode='22023';
  end if;

  update public.event_registrations r set full_name=profile.name
    where r.id=p_registration and r.event_id=p_event returning r.* into strict saved;
  if (to_jsonb(saved)-'full_name') is distinct from (to_jsonb(entry)-'full_name')
    or saved.full_name is distinct from profile.name then
    raise exception 'The name update would also change unreviewed registration information.';
  end if;
  perform public._insert_event_activity(p_event,auth.email(),
    case when public.is_super_admin(auth.email()) then 'SUPER_ADMIN' else 'ADMIN' end,
    'admin.linked_profile','ADMIN','Matched the registration name to its existing player profile',
    jsonb_build_object('registration_id',saved.id,'player_id',profile.id,'from_name',entry.full_name,'to_name',saved.full_name));
  return jsonb_build_object('event_id',p_event,'registration_id',saved.id,'player_id',profile.id,'full_name',saved.full_name);
end;
$$;

-- The existing correction service handles the actual receipt write and audit.
-- Check the withdrawn state and exact reviewed receipt under the same locks.
create function private.admin_correct_withdrawn_registration_receipt(
  p_event bigint,p_registration uuid,p_payment uuid,p_method text,p_recipient text,p_note text,p_expected jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  event_row public.calendar;
  entry public.event_registrations;
  saved_entry public.event_registrations;
  receipt public.payments;
  saved_receipt public.payments;
  meta jsonb;
  result jsonb;
begin
  if private.permission_actor_active() is distinct from true or public.is_super_admin(auth.email()) is distinct from true then
    raise exception 'Current platform super-admin access is required.' using errcode='42501';
  end if;
  select c.* into event_row from public.calendar c where c.id=p_event and c.is_manual is true for update;
  if event_row.id is null then raise exception 'Choose a 4M-hosted event to correct a withdrawn receipt.' using errcode='42501'; end if;
  -- Match the receipt-then-entry lock order of the deployed correction RPC.
  select p.* into receipt from public.payments p where p.id=p_payment and p.event_id=p_event for update nowait;
  select r.* into entry from public.event_registrations r where r.id=p_registration and r.event_id=p_event for update nowait;
  if entry.id is null or entry.status is distinct from 'withdrawn' or entry.payment_status is distinct from 'paid'
    or receipt.id is null or receipt.status is distinct from 'success' or receipt.payment_type is distinct from 'event_entry_fee'
    or coalesce(receipt.amount,0)<=0 or coalesce(receipt.payment_method,'') not in ('manual','cash','eft','external')
    or coalesce(p_method,'') not in ('manual','cash','eft','external') then
    raise exception 'Choose a successful manual receipt for a paid withdrawn registration.' using errcode='22023';
  end if;
  meta := coalesce(receipt.metadata,'{}'::jsonb);
  if jsonb_typeof(meta) <> 'object'
    or coalesce(nullif(meta->>'registration_id',''),case when receipt.reference='MANUAL-ADMIN-'||entry.id::text then entry.id::text end) is distinct from entry.id::text then
    raise exception 'This receipt is not linked to the withdrawn registration.' using errcode='22023';
  end if;
  if entry.refunded_at is not null or coalesce(entry.refund_amount,0)>0
    or exists (select 1 from public.payment_refunds r
      where (r.event_registration_id=entry.id or r.payment_id=receipt.id)
        and r.status is distinct from 'failed' for share) then
    raise exception 'This receipt has a refund record. Review it in Payments.' using errcode='22023';
  end if;
  if jsonb_build_object('full_name',entry.full_name,'email',entry.email,'entry_method',entry.payment_method,
    'amount',receipt.amount,'method',receipt.payment_method,'reference',receipt.reference,'metadata',meta)
    is distinct from p_expected then
    raise exception 'The withdrawn registration or receipt changed. Open it again.' using errcode='40001';
  end if;

  result := private.correct_manual_event_payment(p_event,p_registration,p_payment,p_method,p_recipient,p_note);
  select r.* into strict saved_entry from public.event_registrations r where r.id=p_registration and r.event_id=p_event;
  select p.* into strict saved_receipt from public.payments p where p.id=p_payment and p.event_id=p_event;
  if result->>'paymentId' is distinct from p_payment::text
    or (to_jsonb(saved_entry)-'payment_method') is distinct from (to_jsonb(entry)-'payment_method')
    or (to_jsonb(saved_receipt)-array['payment_method','metadata']) is distinct from (to_jsonb(receipt)-array['payment_method','metadata'])
    or (coalesce(saved_receipt.metadata,'{}')-array['collection_recipient','note','payment_note','method_corrected_at'])
      is distinct from (meta-array['collection_recipient','note','payment_note','method_corrected_at']) then
    raise exception 'The correction would also change unreviewed financial or withdrawal information.';
  end if;
  return result;
end;
$$;

revoke all on function private.admin_align_registration_profile_name(bigint,uuid,bigint,text,jsonb),
  private.admin_correct_withdrawn_registration_receipt(bigint,uuid,uuid,text,text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.admin_align_registration_profile_name(bigint,uuid,bigint,text,jsonb),
  private.admin_correct_withdrawn_registration_receipt(bigint,uuid,uuid,text,text,text,jsonb) to authenticated;

create function public.admin_align_registration_profile_name(p_event bigint,p_registration uuid,p_player bigint,p_scope text,p_expected jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select private.admin_align_registration_profile_name(p_event,p_registration,p_player,p_scope,p_expected);
$$;
create function public.admin_correct_withdrawn_registration_receipt(
  p_event bigint,p_registration uuid,p_payment uuid,p_method text,p_recipient text,p_note text,p_expected jsonb
) returns jsonb language sql security invoker set search_path='' as $$
  select private.admin_correct_withdrawn_registration_receipt(p_event,p_registration,p_payment,p_method,p_recipient,p_note,p_expected);
$$;
revoke all on function public.admin_align_registration_profile_name(bigint,uuid,bigint,text,jsonb),
  public.admin_correct_withdrawn_registration_receipt(bigint,uuid,uuid,text,text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.admin_align_registration_profile_name(bigint,uuid,bigint,text,jsonb),
  public.admin_correct_withdrawn_registration_receipt(bigint,uuid,uuid,text,text,text,jsonb) to authenticated;

notify pgrst,'reload schema';
commit;
