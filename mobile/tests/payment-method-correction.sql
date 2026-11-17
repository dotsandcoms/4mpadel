reset role;
select set_config('request.jwt.claims','{}',false);
\ir ../supabase/migrations/20261111083129_correct_paid_manual_event_payment_method.sql
create temp table method_correction_audit(event_id bigint,actor text,details jsonb);
create or replace function public._insert_event_activity(bigint,text,text,text,text,text,jsonb) returns void
language plpgsql security definer set search_path='' as $$begin
 if $7->>'note'='simulate audit failure' then raise exception 'Synthetic audit failure'; end if;
 insert into pg_temp.method_correction_audit values($1,$2,$7);
end$$;
insert into public.event_registrations(id,event_id,email,full_name,division,payment_status,payment_method) values
 ('80000000-0000-0000-0000-000000000051',101,'actor1@example.test','Player One','Method correction','paid','eft'),
 ('80000000-0000-0000-0000-000000000052',101,'actor3@example.test','Player Three','Method correction','paid','paystack');
insert into public.payments(id,event_id,amount,currency,status,payment_type,payment_method,reference,metadata) values
 ('90000000-0000-0000-0000-000000000051',101,600,'ZAR','success','event_entry_fee','eft','MANUAL-ADMIN-80000000-0000-0000-0000-000000000051','{"source":"manual_event_admin","registration_id":"80000000-0000-0000-0000-000000000051","marked_by_admin":true,"collection_recipient":"4m","preserved":"original"}'),
 ('90000000-0000-0000-0000-000000000052',101,600,'ZAR','success','event_entry_fee','paystack','MANUAL-ADMIN-80000000-0000-0000-0000-000000000052','{"source":"manual_event_admin","registration_id":"80000000-0000-0000-0000-000000000052","marked_by_admin":true,"collection_recipient":"4m"}');
set role authenticated;
select pg_temp.identity(1);
select pg_temp.reject($q$select public.correct_manual_event_payment(101,'80000000-0000-0000-0000-000000000051','90000000-0000-0000-0000-000000000051','cash','organiser','Own payer is not event finance')$q$,'payer cannot correct their own paid receipt');
select pg_temp.identity(3);
select pg_temp.reject($q$select public.correct_manual_event_payment(101,'80000000-0000-0000-0000-000000000051','90000000-0000-0000-0000-000000000051','cash','organiser','Foreign organisation')$q$,'another organisation cannot correct this event receipt');
select pg_temp.identity(2);
select public.correct_manual_event_payment(101,'80000000-0000-0000-0000-000000000051','90000000-0000-0000-0000-000000000051','cash','organiser','Cash received at the desk');
reset role;
select pg_temp.expect((select payment_method='cash' and payment_status='paid' from public.event_registrations where id='80000000-0000-0000-0000-000000000051'),'correction updates the entry method and preserves paid status');
select pg_temp.expect((select payment_method='cash' and status='success' and amount=600 and currency='ZAR' and reference='MANUAL-ADMIN-80000000-0000-0000-0000-000000000051' and metadata->>'preserved'='original' and metadata->>'collection_recipient'='organiser' from public.payments where id='90000000-0000-0000-0000-000000000051'),'receipt method and recipient change without changing amount, currency, reference, status or other metadata');
select pg_temp.expect(exists(select 1 from method_correction_audit where event_id=101 and actor='actor2@example.test' and details->>'previous_method'='eft' and details->>'method'='cash'),'method correction has a server-authored audit record');
set role authenticated;
select pg_temp.identity(12);
select public.correct_manual_event_payment(101,'80000000-0000-0000-0000-000000000052','90000000-0000-0000-0000-000000000052','eft','4m','Correct the offline Paystack classification');
select pg_temp.reject($q$select public.correct_manual_event_payment(102,'80000000-0000-0000-0000-000000000052','90000000-0000-0000-0000-000000000052','eft','4m','Wrong event')$q$,'event-assigned admin cannot edit a foreign event');
select pg_temp.reject($q$select public.correct_manual_event_payment(101,'80000000-0000-0000-0000-000000000052','90000000-0000-0000-0000-000000000051','eft','4m','Wrong entry')$q$,'receipt and registration linkage cannot be swapped');
select pg_temp.reject($q$select public.correct_manual_event_payment(101,'80000000-0000-0000-0000-000000000051','90000000-0000-0000-0000-000000000051','comp','4m','Cannot turn paid funds into a comp')$q$,'correction cannot convert a paid receipt to complimentary');
select pg_temp.reject($q$select public.correct_manual_event_payment(101,'80000000-0000-0000-0000-000000000051','90000000-0000-0000-0000-000000000051','paystack','4m','No provider charge')$q$,'correction cannot invent a Paystack charge');
select pg_temp.reject($q$select public.correct_manual_event_payment(101,'80000000-0000-0000-0000-000000000051','90000000-0000-0000-0000-000000000051','eft','4m','')$q$,'correction requires a note');
select pg_temp.reject($q$select public.correct_manual_event_payment(101,'80000000-0000-0000-0000-000000000051','90000000-0000-0000-0000-000000000051','eft','someone','Bad recipient')$q$,'recipient must be supported');
select pg_temp.reject($q$select public.correct_manual_event_payment(101,'80000000-0000-0000-0000-000000000051','90000000-0000-0000-0000-000000000051','eft','4m','simulate audit failure')$q$,'audit failure aborts the correction');
reset role;
select pg_temp.expect((select payment_method='cash' from public.payments where id='90000000-0000-0000-0000-000000000051') and (select payment_method='cash' from public.event_registrations where id='80000000-0000-0000-0000-000000000051'),'failed audit rolls back both rows atomically');
update public.event_registrations set payment_status='paid' where id='80000000-0000-0000-0000-000000000001';
set role authenticated;
select pg_temp.identity(9);
select pg_temp.reject($q$select public.correct_manual_event_payment(101,'80000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','cash','organiser','Do not rewrite verified checkout')$q$,'even Super Admin cannot relabel a verified provider receipt');
reset role;
update auth.sessions set not_after=now()-interval '1 minute' where id='00000000-0000-0000-0000-000000000002';
set role authenticated;
select pg_temp.identity(2);
select pg_temp.reject($q$select public.correct_manual_event_payment(101,'80000000-0000-0000-0000-000000000051','90000000-0000-0000-0000-000000000051','eft','4m','Expired session')$q$,'expired admin session cannot correct payments');
reset role;
update auth.sessions set not_after=null where id='00000000-0000-0000-0000-000000000002';
select pg_temp.expect(not has_function_privilege('anon','public.correct_manual_event_payment(bigint,uuid,uuid,text,text,text)','execute'),'anonymous clients cannot execute payment correction');
select 'Payment security DB: '||count(*)||' assertions passed (manual payment correction)' from checks;
