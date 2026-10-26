-- Preserve the license component of native event quotes across later price or
-- sales-availability changes. Only a trusted server can capture a quote.
create table private.event_license_quotes(
 payment_id uuid primary key references public.payments(id) on delete cascade,
 amount numeric not null,license_covers jsonb not null,created_at timestamptz not null default now()
);
alter table private.event_license_quotes enable row level security;
revoke all on private.event_license_quotes from public,anon,authenticated;
create function private.license_covers(p_meta jsonb) returns jsonb language sql immutable set search_path='' as $$
 select coalesce(jsonb_agg(x.value order by x.ordinality),'[]'::jsonb)
 from jsonb_array_elements(case when jsonb_typeof(p_meta->'covers')='array' then p_meta->'covers' else '[]'::jsonb end) with ordinality x
 where x.value->>'type'='license'
$$;
create function private.capture_event_license_quote() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.role()='service_role' and new.status in('processing','pending') and new.reference like 'MOBILE-%'
 and new.metadata->>'source'='manual_event' and jsonb_array_length(private.license_covers(new.metadata))>0 then
 insert into private.event_license_quotes(payment_id,amount,license_covers) values(new.id,new.amount,private.license_covers(new.metadata)) on conflict do nothing;
 end if;return new;
end $$;
create trigger capture_event_license_quote after insert or update on public.payments for each row execute function private.capture_event_license_quote();
create function private.event_license_quote_matches(p_id uuid,p_amount numeric,p_meta jsonb) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.event_license_quotes where payment_id=p_id and amount=p_amount and license_covers=private.license_covers(p_meta))
$$;
revoke all on function private.license_covers(jsonb),private.capture_event_license_quote(),private.event_license_quote_matches(uuid,numeric,jsonb) from public,anon,authenticated;
do $$declare f text;begin
 select pg_get_functiondef('private.finalize_license_payment()'::regprocedure) into f;
 f:=replace(f,' if new.metadata ? ''parent_reference''',
 ' if exists(select 1 from private.event_license_quotes where payment_id=new.id) and not private.event_license_quote_matches(new.id,new.amount,new.metadata) then
 insert into public.license_audit_log(player_id,action,reason,details) values(new.player_id,''payment_review'',''Payment does not match the saved server license quote'',jsonb_build_object(''payment_id'',new.id));return new;end if;
 if new.metadata ? ''parent_reference''');
 f:=replace(f,'if new.amount+0.01<coalesce(v_required,0)','if not private.event_license_quote_matches(new.id,new.amount,new.metadata) and new.amount+0.01<coalesce(v_required,0)');
 f:=replace(f,'v_saved.reference is null and new.amount+0.01','v_saved.reference is null and not private.event_license_quote_matches(new.id,new.amount,new.metadata) and new.amount+0.01');
 f:=replace(f,'v_saved.reference is null and new.payment_method=''paystack'' and new.created_at>=','v_saved.reference is null and not private.event_license_quote_matches(new.id,new.amount,new.metadata) and new.payment_method=''paystack'' and new.created_at>=');
 if position('Payment does not match the saved server license quote' in f)=0 then raise exception 'Payment finalizer changed';end if;execute f;
end $$;
notify pgrst, 'reload schema';
