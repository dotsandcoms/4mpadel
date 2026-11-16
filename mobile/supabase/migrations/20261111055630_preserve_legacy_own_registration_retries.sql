-- Current registration clients fill a missing historical booking creator with
-- their own email during an otherwise legitimate own-entry retry. Preserve that
-- path without allowing a partner to claim a row or replacing a known creator.
begin;
create or replace function private.guard_registration_integrity() returns trigger
language plpgsql security definer set search_path='' as $$
declare address text:=lower(auth.email()); fee numeric; trusted boolean:=private.worker_write() or coalesce(private.finance_event(new.event_id),false);
begin
 if not (select integrity_enabled from private.security_release_state where id) then return new; end if;
 new.email:=private.canonical_entry_contact(new.email,new.event_id);new.partner_email:=private.canonical_entry_contact(new.partner_email,new.event_id);new.registered_by:=private.canonical_entry_contact(new.registered_by,new.event_id);
 if not trusted then
  if not private.permission_actor_active() then raise exception 'Sign in before changing an entry.' using errcode='42501'; end if;
  if tg_op='INSERT' then
   if lower(trim(new.email)) is distinct from address and lower(trim(new.registered_by)) is distinct from address then raise exception 'You can only create entries for your own registration.' using errcode='42501'; end if;
   new.created_at:=clock_timestamp();new.pay_token:=gen_random_uuid();
   new.registered_by:=coalesce(new.registered_by,address);
   if lower(trim(new.registered_by))<>address or (coalesce(new.is_test,false) and not public.is_super_admin(address)) or coalesce(new.refund_amount,0)<>0 or new.refunded_at is not null or coalesce(new.whatsapp_added,false) then raise exception 'Only the event team can set administrative entry details.' using errcode='42501'; end if;
   if new.payment_status is null or new.payment_status not in('pending','unpaid','paid') then raise exception 'Choose a valid entry payment status.' using errcode='42501'; end if;
  else
   if new.id is distinct from old.id or new.event_id is distinct from old.event_id or new.email is distinct from old.email or (new.registered_by is distinct from old.registered_by and not (
      nullif(trim(old.registered_by),'') is null
      and lower(trim(old.email)) is not distinct from address
      and lower(trim(new.registered_by)) is not distinct from address
     )) or new.created_at is distinct from old.created_at or new.is_test is distinct from old.is_test or new.pay_token is distinct from old.pay_token or new.refunded_at is distinct from old.refunded_at or new.refund_amount is distinct from old.refund_amount or new.whatsapp_added is distinct from old.whatsapp_added then raise exception 'Only the event team can change registration ownership or financial history.' using errcode='42501'; end if;
   if lower(old.email)<>address then new.phone:=old.phone; end if;
   if old.payment_status='paid' and (new.payment_status is distinct from old.payment_status or new.payment_method is distinct from old.payment_method) then raise exception 'Only the event team can reverse a paid entry.' using errcode='42501'; end if;
   if old.payment_status='paid' and (new.division_id is distinct from old.division_id or new.division is distinct from old.division) and private.current_entry_fee(new.event_id,new.division_id,new.division)>private.current_entry_fee(old.event_id,old.division_id,old.division) then raise exception 'Pay the division difference through checkout before moving.' using errcode='42501'; end if;
  end if;
  if tg_op='UPDATE' and new.payment_status is distinct from old.payment_status and new.payment_status not in('pending','unpaid','failed','paid') then raise exception 'Only the event team can record refunds.' using errcode='42501'; end if;
  fee:=private.current_entry_fee(new.event_id,new.division_id,new.division);
  if new.payment_status='paid' and (tg_op='INSERT' or old.payment_status is distinct from 'paid') and coalesce(fee,0)<>0 then raise exception 'Only a verified payment or the event team can mark this entry paid.' using errcode='42501'; end if;
 end if;
 -- Partner badges are derived from actual entries for all callers, including workers.
 if new.partner_email is null then new.partner_payment_status:=null;
 else select coalesce((select r.payment_status from public.event_registrations r where r.event_id=new.event_id and (r.division_id=new.division_id or ((r.division_id is null or new.division_id is null) and lower(trim(r.division))=lower(trim(new.division)))) and lower(trim(r.email))=lower(trim(new.partner_email)) and r.status is distinct from 'withdrawn' order by (r.payment_status='paid') desc,r.created_at desc limit 1),'pending') into new.partner_payment_status; end if;
 return new;
end $$;
notify pgrst,'reload schema';
commit;
