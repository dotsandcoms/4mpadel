-- Payment is required for NEW player-initiated pay-now entries only.
-- Authorised event staff can keep adding unpaid players/teams, and existing
-- accepted entries retain their right to pay later.
create or replace function private.require_paid_online_registration() returns trigger
language plpgsql security definer set search_path='' as $$
declare c public.calendar; fee numeric;
begin
 if new.status='withdrawn' or private.worker_write() or coalesce(private.finance_event(new.event_id),false) then return new;end if;
 select * into c from public.calendar where id=new.event_id for update;
 fee:=private.current_entry_fee(new.event_id,new.division_id,new.division);
 if coalesce(c.payment_method,case when c.allow_payments is false then 'free' else 'platform' end)='platform'
  and coalesce(fee,0)>0 and coalesce(new.payment_method,'platform') in('platform','paystack')
  and coalesce(new.payment_status,'') not in('paid','comped','complimentary','waived') then
  if tg_op='UPDATE' and old.status='registered' and old.payment_status in('pending','unpaid','failed')
   and (new.event_id,new.email,new.division_id,new.division) is not distinct from (old.event_id,old.email,old.division_id,old.division) then return new;end if;
  if c.weekly_payment_policy is distinct from 'allow_reserve' then
   raise exception 'Registration is only confirmed after successful payment. This event does not allow pay-later registration.' using errcode='42501';end if;
 end if;
 return new;
end $$;
-- A public roster includes accepted unpaid entries. Checkout holds are private
-- and never appear here. Preserve the existing sanitised columns and grants.
create or replace view public.event_registrations_public as
 SELECT id,
    event_id,
    full_name,
    partner_name,
    division,
    division_id,
    status,
    payment_status,
    created_at,
        CASE
            WHEN NULLIF(email, ''::text) IS NOT NULL THEN encode(digest(lower(email), 'sha256'::text), 'hex'::text)
            ELSE NULL::text
        END AS email_hash,
        CASE
            WHEN NULLIF(partner_email, ''::text) IS NOT NULL THEN encode(digest(lower(partner_email), 'sha256'::text), 'hex'::text)
            ELSE NULL::text
        END AS partner_email_hash,
        CASE
            WHEN NULLIF(registered_by, ''::text) IS NOT NULL THEN encode(digest(lower(registered_by), 'sha256'::text), 'hex'::text)
            ELSE NULL::text
        END AS registered_by_hash
   FROM public.event_registrations
  WHERE status <> 'withdrawn'::text;
grant select on public.event_registrations_public to anon,authenticated,service_role;


-- Restore only rows soft-withdrawn by the earlier backfill. Do not change money,
-- paid replacements or player/admin withdrawals made after that transaction.
do $restore$
declare suppressed jsonb; trigger_record record;
begin
 -- Reinstating accepted entries must not reapply entry deadlines/capacity or
 -- announce them as new registrations. Retain every trigger's original mode.
 select coalesce(jsonb_agg(jsonb_build_object('name',tgname,'mode',tgenabled)),'[]') into suppressed from pg_trigger
 where tgrelid='public.event_registrations'::regclass and tgenabled in('O','A') and tgname in(
  'enforce_division_team_capacity','enforce_registration_deadline','trg_enforce_quick_event_capacity',
  'reject_cancelled_division_entry','trg_enforce_event_registration_access','trg_event_registration_activity',
  'notify_registration_change','notify_single_row_partner','trigger_enqueue_partner','following_entry_changed','event_withdrawal_changed');
 for trigger_record in select * from jsonb_to_recordset(suppressed) as t(name text,mode text) loop
  execute format('alter table public.event_registrations disable trigger %I',trigger_record.name);
 end loop;
 update public.event_registrations r set status='registered',withdrawn_at=null
 from private.event_checkout_policy policy
 where policy.id and r.status='withdrawn' and r.payment_status in('pending','unpaid')
  and r.created_at<policy.activated_at and r.withdrawn_at between policy.activated_at and policy.activated_at+interval '1 second'
  and r.division not like '__archived__/%'
  and not exists(select 1 from public.event_registrations active where active.id<>r.id and active.event_id=r.event_id
   and lower(trim(active.email))=lower(trim(r.email)) and (active.division=r.division or active.division_id=r.division_id) and active.status='registered');
 -- A later successful/retried checkout can archive an old row and overwrite
 -- its hold payload. Recover an archived division only when the saved original
 -- cart has exactly one division not represented by any other registration.
 with candidates as (
  select r.id,min(d.id::text)::uuid as division_id,min(d.name) as division
  from public.event_registrations r cross join private.event_checkout_policy policy
  join public.payments p on p.created_at<policy.activated_at and p.event_id=r.event_id
  cross join lateral jsonb_array_elements(case when jsonb_typeof(p.metadata->'registration_rows')='array' then p.metadata->'registration_rows' else '[]'::jsonb end) item
  join public.tournament_divisions d on d.event_id=r.event_id and (d.id=nullif(item->>'division_id','')::uuid or d.name=item->>'division')
  where policy.id and r.status='withdrawn' and r.payment_status in('pending','unpaid') and r.created_at<policy.activated_at
   and r.withdrawn_at between policy.activated_at and policy.activated_at+interval '1 second' and r.division like '__archived__/%'
   and lower(trim(item->>'email'))=lower(trim(r.email))
   and not exists(select 1 from public.event_registrations other where other.id<>r.id and other.event_id=r.event_id
    and lower(trim(other.email))=lower(trim(r.email)) and (other.division=d.name or other.division_id=d.id))
  group by r.id having count(distinct d.id)=1
 ) update public.event_registrations r set status='registered',withdrawn_at=null,division=c.division,division_id=c.division_id
  from candidates c where r.id=c.id;
 update private.event_checkout_holds h set state='converted'
 where h.payload ? 'legacy_registration_id' and exists(select 1 from public.event_registrations r where r.id::text=h.payload->>'legacy_registration_id' and r.status='registered');
 for trigger_record in select * from jsonb_to_recordset(suppressed) as t(name text,mode text) loop
  execute format('alter table public.event_registrations enable %strigger %I',case when trigger_record.mode='A' then 'always ' else '' end,trigger_record.name);
 end loop;
end $restore$;
notify pgrst,'reload schema';
