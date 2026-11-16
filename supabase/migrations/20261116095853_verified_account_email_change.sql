-- Verified account identity changes keep UUIDs, entries and team permissions intact.
-- Financial/provider receipts and historical actor/contact snapshots remain unchanged.
create table private.account_email_changes (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  player_id bigint references public.players(id) on delete set null,
  old_email text not null,new_email text not null,
  changed_at timestamptz not null default clock_timestamp(),
  check(old_email<>new_email)
);
create index account_email_changes_actor on private.account_email_changes(user_id,changed_at desc);
create index account_email_changes_alias on private.account_email_changes(old_email,changed_at,id);
alter table private.account_email_changes enable row level security;
revoke all on private.account_email_changes from public,anon,authenticated,service_role;
revoke all on sequence private.account_email_changes_id_seq from public,anon,authenticated,service_role;

-- This context can be established only by the Auth database role or an owner
-- maintenance session. A caller-controlled GUC or JWT cannot confer this authority.
create function private.verified_email_change_context() returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce(current_setting('fourm.verified_email_change',true),'')<>'' and (
    session_user='supabase_auth_admin' or (session_user in ('postgres','supabase_admin')
      and current_setting('role',true) in ('none','postgres','supabase_admin') and coalesce(auth.jwt(),'{}')='{}'::jsonb))
$$;

create function public.check_own_email_change(p_email text) returns void
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=private.own_profile_actor(); v_email text:=lower(trim(p_email));
begin
  if v_email is null or length(v_email)>254 or v_email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid email address.'; end if;
  if exists(select 1 from auth.users where id<>v_actor and lower(trim(email))=v_email)
    or exists(select 1 from public.players p where lower(trim(p.email))=v_email and lower(trim(p.email))<>lower(trim(auth.email()))) then
    raise exception 'This email is already linked to an account. Use another email or contact support.';
  end if;
  if (select count(*) from private.account_email_changes where user_id=v_actor and changed_at>now()-interval '24 hours')>=3 then
    raise exception 'You have reached today’s email-change limit. Try again tomorrow.';
  end if;
end $$;

-- Resolve only changes made AFTER a checkout was created. This avoids assigning a
-- later user's payment to a former owner when an old email address is reused.
create function private.current_checkout_email(p_email text,p_created timestamptz) returns text
language plpgsql stable security definer set search_path='' as $$
declare v_email text:=lower(trim(p_email)); v_at timestamptz:=p_created; v_id bigint:=0; v_change record;
begin
  if v_email is null or v_at is null then return p_email; end if;
  for n in 1..64 loop
    select c.* into v_change from private.account_email_changes c where c.old_email=v_email and (c.changed_at,c.id)>(v_at,v_id)
      order by c.changed_at,c.id limit 1;
    if not found then return case when v_id=0 then p_email else v_email end; end if;
    v_email:=v_change.new_email;v_at:=v_change.changed_at;v_id:=v_change.id;
  end loop;
  raise exception 'This account’s email history needs support review.';
end $$;
create function private.current_checkout_contact_rows(p_rows jsonb,p_created timestamptz) returns jsonb
language plpgsql stable security definer set search_path='' as $$
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
end $$;
create function private.current_checkout_contacts(p_value jsonb,p_created timestamptz) returns jsonb
language plpgsql stable security definer set search_path='' as $$
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
end $$;

create function private.sync_verified_account_email() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_old text:=lower(trim(old.email)); v_new text:=lower(trim(new.email)); v_player bigint; v_count integer;
  v_previous text:=current_setting('fourm.verified_email_change',true); v_target record; v_row record; v_json jsonb;
begin
  if v_old is not distinct from v_new or v_old is null then return new; end if;
  if v_new is null or new.email_confirmed_at is null or coalesce(new.is_anonymous,false) or new.deleted_at is not null or coalesce(new.banned_until>now(),false)
    or lower(trim(old.email_change)) is distinct from v_new then
    raise exception 'Verify the new email address before changing your account email.';
  end if;
  if exists(select 1 from public.players where lower(trim(email))=v_new) then
    raise exception 'This email is already linked to a player. Contact support before changing it.';
  end if;
  select count(*),min(id) into v_count,v_player from public.players where lower(trim(email))=v_old;
  if v_count>1 then raise exception 'Your player records need support review before changing email.'; end if;
  if (select count(*) from private.account_email_changes where user_id=new.id and changed_at>now()-interval '24 hours')>=3 then
    raise exception 'You have reached today’s email-change limit. Try again tomorrow.';
  end if;
  perform set_config('fourm.verified_email_change',new.id::text,true);
  -- Live identity/ownership fields only. Business contact addresses and audit
  -- snapshots are deliberately not part of this registry.
  for v_target in select * from (values
    ('public','players','email'),('public','admin_sidebar_permissions','email'),
    ('public','organisation_members','user_email'),('public','club_members','user_email'),('public','federation_members','user_email'),
    ('public','calendar','organiser_email'),('public','club_claim_invites','email'),('public','club_claim_requests','requester_email'),
    ('public','coach_applications','email'),('public','event_notification_follows','email'),
    ('public','player_devices','email'),('public','player_push_tokens','email'),('public','player_schedule_events','user_email'),
    ('public','push_outbox','email'),('public','tournament_notification_jobs','email'),('messaging','guardian_consents','guardian_email')
  ) fields(schema_name,table_name,column_name) loop
    execute format('update %I.%I set %I=$1 where lower(trim(%I))=$2',v_target.schema_name,v_target.table_name,v_target.column_name,v_target.column_name) using v_new,v_old;
  end loop;
  update public.calendar set event_co_admins=array(select case when lower(trim(item))=v_old then v_new else item end from unnest(event_co_admins) item)
    where exists(select 1 from unnest(event_co_admins) item where lower(trim(item))=v_old);
  for v_row in select * from public.event_registrations where lower(trim(email))=v_old or lower(trim(partner_email))=v_old or lower(trim(registered_by))=v_old for update loop
    v_json:=to_jsonb(v_row)||jsonb_build_object('email',case when lower(trim(v_row.email))=v_old then v_new else v_row.email end,
      'partner_email',case when lower(trim(v_row.partner_email))=v_old then v_new else v_row.partner_email end,
      'registered_by',case when lower(trim(v_row.registered_by))=v_old then v_new else v_row.registered_by end);
    update messaging.entry_confirmations set proof=messaging.entry_proof(v_json) where source='registration' and source_id=v_row.id and proof=messaging.entry_proof(to_jsonb(v_row));
    update public.event_registrations set email=v_json->>'email',partner_email=v_json->>'partner_email',registered_by=v_json->>'registered_by' where id=v_row.id;
  end loop;
  for v_row in select * from public.tournament_participants where lower(trim(email))=v_old for update loop
    v_json:=to_jsonb(v_row)||jsonb_build_object('email',v_new);
    update messaging.entry_confirmations set proof=messaging.entry_proof(v_json),
      division_proof=case when division_proof is not null then jsonb_set(division_proof,'{email}',to_jsonb(v_new)) end
      where source='import' and source_id=v_row.id and proof=messaging.entry_proof(to_jsonb(v_row));
    update public.tournament_participants set email=v_new where id=v_row.id;
  end loop;
  update public.email_queue set recipient_email=v_new where lower(trim(recipient_email))=v_old and status in ('pending','processing');
  insert into private.account_email_changes(user_id,player_id,old_email,new_email) values(new.id,v_player,v_old,v_new);
  perform set_config('fourm.verified_email_change',coalesce(v_previous,''),true);
  return new;
exception when others then
  perform set_config('fourm.verified_email_change',coalesce(v_previous,''),true);
  raise;
end $$;
create trigger sync_verified_account_email after update of email on auth.users
  for each row when (old.email is distinct from new.email) execute function private.sync_verified_account_email();

-- Email-only identity migration must not enforce a new entry deadline, create a
-- partner change, attest new eligibility or generate registration notifications.
-- Keep the current functions and add only this trusted, UPDATE-only early exit.
do $$
declare v_name text;v_definition text;v_patched text;
begin
  foreach v_name in array array[
    'private.enforce_registration_deadline()','private.enforce_division_team_capacity()','public.reject_cancelled_division_entry()',
    'public.notify_registration_change()','public.trg_log_event_registration_activity()','public.following_entry_changed()',
    'private.sync_registration_partner_status()','private.sync_verified_registration_participant()',
    'messaging.attest_entry()','messaging.event_changed()'
  ] loop
    v_definition:=pg_get_functiondef(v_name::regprocedure);
    v_patched:=regexp_replace(v_definition,'\mBEGIN\M',E'BEGIN\n  IF TG_OP=''UPDATE'' AND private.verified_email_change_context() THEN RETURN NEW; END IF;','i');
    if v_patched=v_definition then raise exception 'Could not protect email migration trigger %',v_name; end if;
    execute v_patched;
  end loop;
  v_definition:=pg_get_functiondef('private.worker_write()'::regprocedure);
  v_patched:=replace(v_definition,'select coalesce(auth.jwt()', 'select private.verified_email_change_context() or coalesce(auth.jwt()');
  if v_patched=v_definition then raise exception 'Could not scope verified email worker context'; end if;
  execute v_patched;
end $$;

-- Pending checkout callbacks may still hold a previously verified address. Permit
-- only a recorded email substitution to refresh its cart fingerprint. Prices,
-- currencies, payer IDs, provider receipts and every other payment field stay exact.
do $$
declare v_definition text:=pg_get_functiondef('private.guard_payment_integrity()'::regprocedure);v_patched text;
begin
  v_patched:=replace(v_definition,'declare trusted boolean:=','declare canonical_old public.payments; trusted boolean:=');
  if v_patched=v_definition then raise exception 'Unexpected checkout guard declaration'; end if;
  v_definition:=v_patched;
  v_patched:=replace(v_definition,'new.metadata:=private.canonical_checkout_contacts(new.metadata,new.event_id);',
    'if tg_op=''INSERT'' or trusted then new.metadata:=private.current_checkout_contacts(new.metadata,case when tg_op=''UPDATE'' then old.created_at else clock_timestamp() end); end if;');
  if v_patched=v_definition then raise exception 'Unexpected checkout contact canonicalisation'; end if;
  v_definition:=v_patched;
  v_patched:=replace(v_definition,'elsif receipt.cart_hash is distinct from fingerprint then',E'elsif receipt.cart_hash is distinct from fingerprint then\n   canonical_old:=old;\n   canonical_old.metadata:=private.current_checkout_contacts(old.metadata,old.created_at);\n   if tg_op=''UPDATE'' and trusted and receipt.cart_hash=sha256(convert_to(private.checkout_cart(old)::text,''UTF8''))\n     and private.checkout_cart(new)=private.checkout_cart(canonical_old)\n     and (to_jsonb(new)-array[''metadata'',''status''])=(to_jsonb(old)-array[''metadata'',''status'']) then\n     update private.event_checkout_security_quotes set cart_hash=fingerprint,\n       free_entries=private.current_checkout_contact_rows(free_entries,old.created_at),\n       license_items=private.current_checkout_contact_rows(license_items,old.created_at) where payment_id=new.id returning * into receipt;\n   els');
  -- Preserve the original licence-split branch as ELSIF after the new exact branch.
  v_patched:=replace(v_patched,E'   els\n   if tg_op=',E'   elsif tg_op=');
  if v_patched=v_definition or position('canonical_old.metadata' in v_patched)=0 then raise exception 'Unexpected checkout fingerprint guard'; end if;
  execute v_patched;
end $$;

revoke all on function private.verified_email_change_context(),private.current_checkout_email(text,timestamptz),
  private.current_checkout_contact_rows(jsonb,timestamptz),private.current_checkout_contacts(jsonb,timestamptz),
  private.sync_verified_account_email(),public.check_own_email_change(text) from public,anon,authenticated,service_role;
grant execute on function public.check_own_email_change(text) to authenticated;
