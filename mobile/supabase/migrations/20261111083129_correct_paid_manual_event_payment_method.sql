-- Correct an administrator-recorded receipt without rewriting a provider charge,
-- changing paid status, repricing an entry, refunding or creating another receipt.
begin;

create function private.correct_manual_event_payment(
  p_event bigint,p_registration uuid,p_payment uuid,p_method text,p_recipient text,p_note text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare receipt public.payments; entry public.event_registrations;
  method text:=lower(btrim(coalesce(p_method,''))); recipient text:=lower(btrim(coalesce(p_recipient,'')));
  note text:=btrim(coalesce(p_note,'')); meta jsonb;
begin
  if p_event is null or not coalesce(private.finance_event(p_event),false) then
    raise exception 'You do not have permission to edit this event payment.' using errcode='42501';
  end if;
  if char_length(note)<1 or char_length(note)>2000 then raise exception 'Add a payment correction note of up to 2,000 characters.'; end if;
  if recipient not in ('4m','organiser') then raise exception 'Choose who received this payment.'; end if;
  select * into receipt from public.payments where id=p_payment and event_id=p_event for update;
  select * into entry from public.event_registrations where id=p_registration and event_id=p_event for update;
  if receipt.id is null or entry.id is null then raise exception 'This event payment is unavailable.' using errcode='42501'; end if;
  meta:=coalesce(receipt.metadata,'{}'::jsonb);
  if receipt.status is distinct from 'success' or entry.payment_status is distinct from 'paid'
    or receipt.payment_type is distinct from 'event_entry_fee' or coalesce(receipt.amount,0)<=0
    or meta->>'free_entry'='true' or meta->>'comp_entry'='true' or meta->>'source'='admin_add_player'
    or coalesce(receipt.reference,'') like 'MANUAL-ADMIN-COMP-%' then
    raise exception 'Only a paid manual event receipt can be corrected.' using errcode='42501';
  end if;
  if meta->>'source' in ('manual_event','division_switch','native_event')
    or exists(select 1 from private.event_checkout_security_quotes q where q.payment_id=receipt.id)
    or not coalesce(meta->>'marked_by_admin'='true' or meta->>'source'='manual_event_admin' or coalesce(receipt.reference,'') like 'MANUAL-ADMIN-%',false) then
    raise exception 'Verified provider receipts keep their original payment method.' using errcode='42501';
  end if;
  if coalesce(nullif(meta->>'registration_id',''),case when receipt.reference='MANUAL-ADMIN-'||entry.id::text then entry.id::text end) is distinct from entry.id::text then
    raise exception 'This receipt is not linked to this event entry. Reconcile it before changing its method.' using errcode='42501';
  end if;
  if method not in ('eft','external','manual','cash') and not (method='paystack' and receipt.payment_method='paystack') then
    raise exception 'Choose EFT, cash, an external provider or another manual method.';
  end if;
  if method='paystack' then recipient:='4m'; end if;
  update public.payments set payment_method=method,metadata=meta||jsonb_build_object(
    'collection_recipient',recipient,'note',note,'payment_note',note,'method_corrected_at',clock_timestamp())
    where id=receipt.id;
  update public.event_registrations set payment_method=method where id=entry.id;
  perform public._insert_event_activity(p_event,auth.email(),
    case when public.is_super_admin(auth.email()) then 'SUPER_ADMIN' else 'EVENT_FINANCE' end,
    'payment.method_corrected','FINANCE','Corrected a paid manual payment method',
    jsonb_build_object('payment_id',receipt.id,'registration_id',entry.id,
      'previous_method',receipt.payment_method,'method',method,
      'previous_collection_recipient',meta->>'collection_recipient','collection_recipient',recipient,'note',note));
  return jsonb_build_object('paymentId',receipt.id,'method',method,'recipient',recipient);
end $$;
revoke all on function private.correct_manual_event_payment(bigint,uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function private.correct_manual_event_payment(bigint,uuid,uuid,text,text,text) to authenticated;

create function public.correct_manual_event_payment(
  p_event bigint,p_registration uuid,p_payment uuid,p_method text,p_recipient text,p_note text
) returns jsonb language sql security invoker set search_path='' as $$
  select private.correct_manual_event_payment(p_event,p_registration,p_payment,p_method,p_recipient,p_note)
$$;
revoke all on function public.correct_manual_event_payment(bigint,uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.correct_manual_event_payment(bigint,uuid,uuid,text,text,text) to authenticated;

commit;
