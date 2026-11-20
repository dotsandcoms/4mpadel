begin;

create function private.admin_review_imported_participant_payment(
  p_event_id bigint,p_participant_id uuid,p_scope text,p_expected text,p_note text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  event_row public.calendar;
  participant public.tournament_participants;
  registration public.event_registrations;
  candidate public.payments;
  receipt public.payments;
  saved_payment uuid;
  participant_metadata jsonb;
  registration_id text;
  participant_email text;
  action text;
  amount numeric;
  reviewed text;
  reset_registration boolean := false;
  note text := nullif(trim(p_note),'');
begin
  if private.permission_actor_active() is distinct from true or public.is_super_admin(auth.email()) is distinct from true then
    raise exception 'Current platform super-admin access is required.' using errcode='42501';
  end if;
  if p_event_id is null or p_participant_id is null or p_scope is null then
    raise exception 'Choose a saved event and an imported participant.' using errcode='22023';
  end if;
  -- Use the same lock order as RankedIn sync. Serialize both operations before
  -- reading the participant, payment history, and linked registration.
  select c.* into event_row from public.calendar c where c.id=p_event_id
    and (p_scope='all' or p_scope='org:'||c.organisation_id::text or p_scope='club:'||c.club_id::text) for update;
  if event_row.id is null or event_row.is_manual is true then
    raise exception 'Choose an imported event within this workspace.' using errcode='42501';
  end if;
  if event_row.cancelled_at is not null or event_row.event_status in ('cancelled','canceled','withdrawn') then
    raise exception 'Cancelled or withdrawn events use the separate refund and withdrawal workflows.' using errcode='22023';
  end if;
  select p.* into participant from public.tournament_participants p
    where p.id=p_participant_id and p.event_id=p_event_id for update;
  if participant.id is null or nullif(trim(participant.rankedin_participant_id),'') is null then
    raise exception 'Choose an imported RankedIn participant in this event.' using errcode='42501';
  end if;
  participant_metadata := coalesce(participant.metadata,'{}'::jsonb);
  if jsonb_typeof(participant_metadata) <> 'object' then
    raise exception 'This imported participant needs its payment data reconciled.' using errcode='22023';
  end if;
  if participant_metadata->>'status' in ('withdrawn','cancelled','canceled') or participant_metadata->>'withdrawn_at' is not null
    or participant_metadata->>'cancelled_at' is not null or participant_metadata->>'withdrawn'='true' then
    raise exception 'This imported entry has been withdrawn or cancelled.' using errcode='22023';
  end if;

  registration_id := nullif(participant_metadata->>'registration_id','');
  if registration_id is not null then
    if registration_id !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then
      raise exception 'The saved registration link needs reconciliation.' using errcode='22023';
    end if;
    select r.* into registration from public.event_registrations r
      where r.id=registration_id::uuid and r.event_id=p_event_id for update nowait;
    participant_email := nullif(lower(trim(participant.email)),'');
    if participant_email is null and participant.profile_id is not null then
      select lower(trim(p.email)) into participant_email from public.players p where p.id=participant.profile_id for share;
    end if;
    if registration.id is null or participant_email is null or lower(trim(registration.email)) is distinct from participant_email
      or lower(trim(registration.division)) is distinct from lower(trim(participant.class_name))
      or coalesce(registration.is_test,false) is distinct from coalesce(participant.is_test,false) then
      raise exception 'The saved registration link needs reconciliation.' using errcode='22023';
    end if;
    if registration.status in ('withdrawn','cancelled','canceled') or registration.withdrawn_at is not null then
      raise exception 'The linked entry has been withdrawn or cancelled.' using errcode='22023';
    end if;
    if registration.refunded_at is not null or coalesce(registration.refund_amount,0)>0
      or registration.payment_status in ('refunded','partially_refunded','refund_pending') then
      raise exception 'Correct refunded entries through the registration workflow.' using errcode='22023';
    end if;
  end if;
  if exists (select 1 from public.tournament_divisions d where d.event_id=p_event_id and d.cancelled_at is not null
    and (d.id=registration.division_id or (registration.division_id is null and lower(trim(d.name))=lower(trim(participant.class_name)))) for share) then
    raise exception 'This division has been cancelled.' using errcode='22023';
  end if;

  -- Match only persisted IDs. Any evidence belonging to a different source is
  -- handled through its own workflow and can never be cancelled here.
  for candidate in select p.* from public.payments p
    where p.event_id=p_event_id and p.payment_type='event_entry_fee'
      and coalesce(p.is_test,false)=coalesce(participant.is_test,false)
      and (p.metadata->>'participant_id'=p_participant_id::text or p.metadata->>'registration_id'=registration.id::text)
      and p.status in ('pending','processing','success','refunded','partially_refunded','refund_pending')
    order by p.id for update nowait
  loop
    if candidate.status<>'success' or candidate.currency is distinct from 'ZAR'
      or candidate.payment_method is distinct from 'manual'
      or candidate.metadata->>'participant_id' is distinct from p_participant_id::text
      or not coalesce(candidate.metadata->>'source'='admin_rankedin_payment'
          or (candidate.metadata->>'source' is null and candidate.reference like 'Manual - %'),false)
      or exists (select 1 from private.event_checkout_security_quotes q where q.payment_id=candidate.id) then
      raise exception 'This entry has separate payment evidence. Review it in Registrations or Payments.' using errcode='22023';
    end if;
    if receipt.id is not null then
      raise exception 'More than one manual receipt matches this participant. Reconcile those payments before continuing.' using errcode='22023';
    end if;
    receipt := candidate;
  end loop;
  if participant_metadata->>'payment_method' in ('paystack','platform','external') then
    raise exception 'This entry has a provider payment. Review it in Payments.' using errcode='22023';
  end if;
  if registration.payment_status in ('paid','comped','complimentary','waived') and (
    receipt.id is null or registration.payment_status<>'paid'
    or coalesce(registration.payment_method,'') not in ('manual','cash','eft')
    or receipt.metadata->>'registration_id' is distinct from registration.id::text
  ) then
    raise exception 'This entry has a separate registration payment. Review it in Registrations.' using errcode='22023';
  end if;

  action := case when participant.is_paid is true then 'unmark' else 'mark' end;
  if action='mark' and receipt.id is not null then
    raise exception 'A successful manual receipt already exists. Reconcile it before creating another.' using errcode='22023';
  end if;
  if action='unmark' and receipt.id is null and participant_metadata->>'payment_method' is distinct from 'manual' then
    raise exception 'There is no attributable manual payment to correct. Review this entry in Payments.' using errcode='22023';
  end if;
  if registration.payment_status='paid' then
    -- The registration sync chooses its target by this persisted ID. Refuse
    -- to change the entry when the ID is associated with multiple roster rows.
    if exists (select 1 from public.tournament_participants p where p.event_id=p_event_id and p.id<>p_participant_id
      and p.metadata->>'registration_id'=registration.id::text for share) then
      raise exception 'More than one participant is linked to this registration. Reconcile the roster before continuing.' using errcode='22023';
    end if;
    reset_registration := true;
  end if;

  amount := case when action='mark' then coalesce(event_row.entry_fee,0) else receipt.amount end;
  if amount<0 or amount::text in ('NaN','Infinity','-Infinity') then
    raise exception 'Check the recorded entry fee before continuing.' using errcode='22023';
  end if;
  reviewed := encode(sha256(convert_to(jsonb_build_array(auth.uid(),p_scope,action,
    event_row.id,event_row.organisation_id,event_row.club_id,event_row.event_name,event_row.entry_fee,event_row.event_status,
    to_jsonb(participant),to_jsonb(registration),to_jsonb(receipt))::text,'UTF8')),'hex');
  if p_expected is null then
    return jsonb_build_object('event_id',p_event_id,'participant_id',p_participant_id,'participant_name',participant.full_name,
      'division',participant.class_name,'action',action,'amount',amount,'is_test',coalesce(participant.is_test,false),
      'has_manual_receipt',receipt.id is not null,'resets_registration',reset_registration,'token',reviewed);
  end if;
  if p_expected is distinct from reviewed then
    raise exception 'The participant or payment changed after review. Open the payment again.' using errcode='40001';
  end if;
  if char_length(note)>2000 then
    raise exception 'Use up to 2,000 characters for the payment note.' using errcode='22023';
  end if;

  if action='mark' then
    insert into public.payments (player_id,event_id,amount,currency,status,payment_type,payment_method,reference,metadata,is_test)
    values (participant.profile_id,p_event_id,amount,'ZAR','success','event_entry_fee','manual','MANUAL-RANKEDIN-'||gen_random_uuid(),
      jsonb_strip_nulls(jsonb_build_object('source','admin_rankedin_payment','participant_id',p_participant_id,
        'registration_id',registration.id,'note',note,'recorded_by',auth.uid())),coalesce(participant.is_test,false))
    returning * into strict candidate;
    if candidate.status is distinct from 'success' or candidate.payment_method is distinct from 'manual'
      or candidate.amount is distinct from amount or candidate.metadata->>'participant_id' is distinct from p_participant_id::text then
      raise exception 'The manual receipt did not confirm the payment.';
    end if;
    saved_payment := candidate.id;
    participant_metadata := (participant_metadata - array['payment_correction_note','payment_corrected_at']) ||
      jsonb_build_object('manual_unpaid',false,'payment_method','manual','payment_note',note,'manual_payment_id',saved_payment);
  else
    if receipt.id is not null then
      update public.payments p set status='cancelled' where p.id=receipt.id and p.event_id=p_event_id returning p.* into strict candidate;
      if candidate.status is distinct from 'cancelled' then
        raise exception 'The manual receipt did not confirm the correction.';
      end if;
      saved_payment := candidate.id;
    end if;
    if reset_registration then
      update public.event_registrations r set payment_status='unpaid'
        where r.id=registration.id and r.event_id=p_event_id returning r.* into strict registration;
      if registration.payment_status is distinct from 'unpaid' then
        raise exception 'The linked registration did not confirm the correction.';
      end if;
    end if;
    participant_metadata := (participant_metadata - 'manual_payment_id') || jsonb_build_object('manual_unpaid',true,
      'payment_correction_note',note,'payment_corrected_at',clock_timestamp());
  end if;
  update public.tournament_participants p set is_paid=(action='mark'),metadata=participant_metadata
    where p.id=p_participant_id and p.event_id=p_event_id
    returning p.* into strict participant;
  if participant.is_paid is distinct from (action='mark') then
    raise exception 'The participant did not confirm the payment correction.';
  end if;
  return jsonb_build_object('event_id',p_event_id,'participant_id',p_participant_id,'action',action,
    'is_paid',participant.is_paid,'payment_id',saved_payment,'registration_reset',reset_registration);
end;
$$;

revoke all on function private.admin_review_imported_participant_payment(bigint,uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function private.admin_review_imported_participant_payment(bigint,uuid,text,text,text) to authenticated;

create function public.admin_review_imported_participant_payment(
  p_event_id bigint,p_participant_id uuid,p_scope text,p_expected text default null,p_note text default null
) returns jsonb language sql security invoker set search_path='' as $$
  select private.admin_review_imported_participant_payment(p_event_id,p_participant_id,p_scope,p_expected,p_note);
$$;
revoke all on function public.admin_review_imported_participant_payment(bigint,uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.admin_review_imported_participant_payment(bigint,uuid,text,text,text) to authenticated;

notify pgrst,'reload schema';
commit;
