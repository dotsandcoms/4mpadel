-- Account deletion redacts historical entries and receipts. These updates
-- must not behave like new registrations, partner changes or checkout edits.
-- Restore the previous transaction-local setting after a successful call.
-- On failure PostgreSQL rolls back both the writes and the setting.
do $$
declare
  definition text := pg_get_functiondef('public.complete_account_deletion(uuid)'::regprocedure);
  patched text;
begin
  patched := regexp_replace(definition, '\mBEGIN\M', $start$
previous_deletion_context text := current_setting('fourm.account_deletion', true);
begin
  perform set_config('fourm.account_deletion', 'on', true);
$start$, 'i');
  if patched = definition then
    raise exception 'Could not start the account deletion context';
  end if;
  definition := patched;
  patched := regexp_replace(definition, '\mreturn[[:space:]]+true[[:space:]]*;', $finish$
perform set_config('fourm.account_deletion', coalesce(previous_deletion_context, ''), true);
  return true;
$finish$, 'i');
  if patched = definition then
    raise exception 'Could not restore the account deletion context';
  end if;
  execute patched;
end;
$$;

create function private.account_deletion_context() returns boolean
language sql stable set search_path = '' as $$
  select current_setting('fourm.account_deletion', true) = 'on' and (
    current_setting('role', true) = 'service_role' or (
      session_user in ('postgres', 'supabase_admin')
      and current_setting('role', true) in ('none', 'postgres', 'supabase_admin')
    )
  );
$$;
revoke all on function private.account_deletion_context()
  from public, anon, authenticated, service_role;

-- Keep the deployed trigger bodies and privileges. Skip only UPDATEs in the
-- trusted deletion call that preserve entry status, division, and payment data.
do $$
declare
  target record;
  definition text;
  patched text;
begin
  for target in
    select unnest(array[
      'private.enforce_registration_deadline()',
      'private.enforce_division_team_capacity()',
      'public.reject_cancelled_division_entry()',
      'private.require_paid_online_registration()',
      'private.guard_registration_integrity()',
      'private.convert_saved_registration_hold()',
      'private.sync_registration_partner_status()',
      'private.sync_verified_registration_participant()',
      'public.notify_registration_change()',
      'public.following_entry_changed()',
      'public.trg_log_event_registration_activity()'
    ]) as signature, $registration$
      (to_jsonb(new) - array[
        'full_name','email','phone','tshirt_size','tshirt_sponsor_name','tshirt_logo_url',
        'partner_name','partner_email','registered_by'
      ]) is not distinct from (to_jsonb(old) - array[
        'full_name','email','phone','tshirt_size','tshirt_sponsor_name','tshirt_logo_url',
        'partner_name','partner_email','registered_by'
      ])
    $registration$ as unchanged
    union all
    select unnest(array[
      'private.guard_payment_integrity()',
      'private.capture_event_license_quote()',
      'private.finalize_license_payment()'
    ]), $payment$
      (new.player_id is null or new.player_id is not distinct from old.player_id)
      and (to_jsonb(new) - array['metadata','player_id'])
        is not distinct from (to_jsonb(old) - array['metadata','player_id'])
    $payment$
  loop
    definition := pg_get_functiondef(target.signature::regprocedure);
    patched := regexp_replace(definition, '\mBEGIN\M', format($guard$BEGIN
  IF TG_OP = 'UPDATE' AND private.account_deletion_context() THEN
    IF %s THEN RETURN NEW; END IF;
  END IF;
$guard$, target.unchanged), 'i');
    if patched = definition then
      raise exception 'Could not protect deletion anonymization in %', target.signature;
    end if;
    execute patched;
  end loop;
end;
$$;
