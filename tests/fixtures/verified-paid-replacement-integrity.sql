-- Deployed checkout fingerprint and trigger definitions exercised by the fixture.
CREATE OR REPLACE FUNCTION private.checkout_cart(p payments)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 select jsonb_build_object('event',p.event_id,'payer',p.player_id,'amount',p.amount,'currency',p.currency,'test',p.is_test,
  'source',p.metadata->'source','registrant',p.metadata->'registrant_email','covers',p.metadata->'covers',
  'rows',p.metadata->'registration_rows','links',p.metadata->'solo_link_updates',
  'registration',p.metadata->'registration_id','target',p.metadata->'target_division_id')
$function$
;

CREATE OR REPLACE FUNCTION private.current_checkout_contact_rows(p_rows jsonb, p_created timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_rows jsonb:='[]'; v_row jsonb; v_key text;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' then return p_rows; end if;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(v_row)='object' then
      foreach v_key in array array['email','partner_email','registered_by','user_email','registrant_email'] loop
        if jsonb_typeof(v_row->v_key)='string' then
          v_row:=jsonb_set(v_row,array[v_key],to_jsonb(private.current_checkout_email(v_row->>v_key,p_created)));
        end if;
      end loop;
    end if;
    v_rows:=v_rows||jsonb_build_array(v_row);
  end loop;
  return v_rows;
end $function$
;

CREATE OR REPLACE FUNCTION private.current_checkout_contacts(p_value jsonb, p_created timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_value jsonb:=p_value; v_key text;
begin
  if jsonb_typeof(v_value) is distinct from 'object' then return p_value; end if;
  if jsonb_typeof(v_value->'registrant_email')='string' then
    v_value:=jsonb_set(v_value,'{registrant_email}',to_jsonb(private.current_checkout_email(v_value->>'registrant_email',p_created)));
  end if;
  foreach v_key in array array['registration_rows','solo_link_updates','covers','server_free_entries','server_license_items'] loop
    if jsonb_typeof(v_value->v_key)='array' then v_value:=jsonb_set(v_value,array[v_key],private.current_checkout_contact_rows(v_value->v_key,p_created)); end if;
  end loop;
  return v_value;
end $function$
;

CREATE OR REPLACE FUNCTION private.guard_payment_integrity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare canonical_old public.payments; trusted boolean:=private.worker_write() or coalesce(private.finance_event(new.event_id),false)
 or (private.permission_actor_active() and new.payment_type in('membership','full_license','temp_license') and public.can_manage_licenses());
 address text:=lower(auth.email()); actor_player bigint; receipt private.event_checkout_security_quotes; calculated jsonb; fingerprint bytea; split_total numeric; split_covers jsonb;
begin
 if not (select integrity_enabled from private.security_release_state where id) then return new; end if;
 if tg_op='INSERT' or trusted then new.metadata:=private.current_checkout_contacts(new.metadata,case when tg_op='UPDATE' then old.created_at else clock_timestamp() end); end if;
 if tg_op='INSERT' and new.metadata->>'source'='manual_event' and new.status in('pending','processing') then new.metadata:=new.metadata-'registrations_persisted'-'split_recorded'-'server_free_entries'-'server_license_items'; end if;
 if not trusted then
  if not private.permission_actor_active() then raise exception 'Sign in before saving a payment.' using errcode='42501'; end if;
  if tg_op='INSERT' then
   select id into actor_player from public.players where lower(trim(email))=address order by id limit 1;
   if lower(trim(new.metadata->>'registrant_email')) is distinct from address or (new.player_id is not null and new.player_id is distinct from actor_player)
     or new.status is null or new.status not in('pending','processing') or (coalesce(new.is_test,false) and not public.is_super_admin(address)) or new.amount is null or new.amount<0 then
    raise exception 'Only verified checkout or an authorised administrator can record paid entries.' using errcode='42501'; end if;
   new.created_at:=clock_timestamp();
   new.metadata:=coalesce(new.metadata,'{}')-'registrations_persisted'-'license_split_done'-'split_recorded'-'server_free_entries'-'server_license_items'-'native_authorization_url';
  elsif (to_jsonb(new)-'status') is distinct from (to_jsonb(old)-'status') or old.status not in('pending','processing','abandoned','cancelled') or new.status not in('abandoned','cancelled',old.status) then
   raise exception 'Payment details are managed by verified checkout.' using errcode='42501';
  end if;
 end if;
 if new.payment_type='event_entry_fee' and new.payment_method='paystack' and new.metadata->>'source' in('manual_event','division_switch') and new.status in('pending','processing','success') then
  fingerprint:=sha256(convert_to(private.checkout_cart(new)::text,'UTF8'));
  select * into receipt from private.event_checkout_security_quotes where payment_id=new.id;
  if receipt.payment_id is null then
   calculated:=private.validate_event_checkout(new);
   insert into private.event_checkout_security_quotes(payment_id,cart_hash,required_amount,original_amount,currency,is_test,free_entries,license_amount,license_items)
    values(new.id,fingerprint,(calculated->>'required')::numeric,new.amount,new.currency,coalesce(new.is_test,false),calculated->'free_entries',(calculated->>'license_amount')::numeric,calculated->'license_items');
   new.metadata:=new.metadata||jsonb_build_object('server_free_entries',calculated->'free_entries','server_license_items',calculated->'license_items');
  elsif receipt.cart_hash is distinct from fingerprint then
   canonical_old:=old;
   canonical_old.metadata:=private.current_checkout_contacts(old.metadata,old.created_at);
   if tg_op='UPDATE' and trusted and receipt.cart_hash=sha256(convert_to(private.checkout_cart(old)::text,'UTF8'))
     and private.checkout_cart(new)=private.checkout_cart(canonical_old)
     and (to_jsonb(new)-array['metadata','status'])=(to_jsonb(old)-array['metadata','status']) then
     update private.event_checkout_security_quotes set cart_hash=fingerprint,
       free_entries=private.current_checkout_contact_rows(free_entries,old.created_at),
       license_items=private.current_checkout_contact_rows(license_items,old.created_at) where payment_id=new.id returning * into receipt;
   elsif tg_op='UPDATE' and private.worker_write() and old.status='success' and new.status='success' and not coalesce((old.metadata->>'split_recorded')::boolean,false) and coalesce((new.metadata->>'split_recorded')::boolean,false) and receipt.license_amount>0 and new.amount=old.amount-receipt.license_amount
    and (to_jsonb(new)-array['metadata','amount'])=(to_jsonb(old)-array['metadata','amount'])
    and (new.metadata-array['covers','split_recorded','server_free_entries','server_license_items'])=(old.metadata-array['covers','split_recorded','server_free_entries','server_license_items']) then
     select coalesce(sum(child.amount),0) into split_total from public.payments child where child.metadata->>'parent_reference'=new.reference and child.status='success' and child.currency=new.currency and child.is_test is not distinct from new.is_test;
     if split_total<>receipt.license_amount or (new.metadata->'covers') is distinct from (select coalesce(jsonb_agg(c.value),'[]') from jsonb_array_elements(old.metadata->'covers') c where c.value->>'type'<>'license') then raise exception 'The licence split does not match the verified checkout.'; end if;
     update private.event_checkout_security_quotes set cart_hash=fingerprint where payment_id=new.id;
   else raise exception 'This checkout changed. Start a new payment review.' using errcode='22023'; end if;
   new.metadata:=new.metadata||jsonb_build_object('server_free_entries',receipt.free_entries,'server_license_items',receipt.license_items);
  else new.metadata:=new.metadata||jsonb_build_object('server_free_entries',receipt.free_entries,'server_license_items',receipt.license_items); end if;
 end if;
 return new;
end $function$
;
