-- Operator repair. Load in the same transaction as the calls to
-- pg_temp.merge_apple_relay_player(original_player_id, relay_player_id).
-- Rehearse with ROLLBACK before running the explicitly reviewed pairs.
create function pg_temp.require_no_player_merge_references(
  p_parent regclass, p_id text, p_handled regclass[]
) returns void language plpgsql as $$
declare ref record; referenced boolean;
begin
  for ref in
    select c.conrelid::regclass as child, a.attname as column_name
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = p_parent and cardinality(c.conkey) = 1
      and not (c.conrelid = any(p_handled))
  loop
    execute format('select exists (select 1 from %s where %I::text = $1)',
      ref.child, ref.column_name) into referenced using p_id;
    if referenced then raise exception 'Review merge references in %.%', ref.child, ref.column_name; end if;
  end loop;
end;
$$;

create function pg_temp.merge_apple_relay_player(p_original bigint, p_relay bigint)
returns bigint language plpgsql as $$
declare
  original public.players%rowtype;
  relay public.players%rowtype;
  original_user auth.users%rowtype;
  relay_user auth.users%rowtype;
  apple_identity uuid;
begin
  perform 1 from public.players where id in (p_original, p_relay) order by id for update;
  select * into strict original from public.players where id = p_original;
  select * into strict relay from public.players where id = p_relay;
  if lower(original.email) like '%@privaterelay.appleid.com'
    or lower(relay.email) not like '%@privaterelay.appleid.com'
    or lower(btrim(original.name)) is distinct from lower(btrim(relay.name))
    or nullif(original.rankedin_id, '') is null or original.rankedin_id is distinct from relay.rankedin_id
    or original.created_at >= relay.created_at then
    raise exception 'The reviewed player records no longer match';
  end if;

  select * into strict original_user from auth.users
    where lower(email) = lower(original.email) and email_confirmed_at is not null for update;
  select * into strict relay_user from auth.users
    where lower(email) = lower(relay.email) and email_confirmed_at is not null for update;
  if original_user.deleted_at is not null or relay_user.deleted_at is not null
    or coalesce(original_user.banned_until > now(), false) or coalesce(relay_user.banned_until > now(), false)
    or not exists (select 1 from auth.identities where user_id = original_user.id)
    or exists (select 1 from auth.identities where user_id = original_user.id and provider = 'apple')
    or (select count(*) from auth.identities where user_id = relay_user.id) <> 1 then
    raise exception 'Review the Auth accounts before merging';
  end if;
  select id into strict apple_identity from auth.identities
    where user_id = relay_user.id and provider = 'apple' and lower(email) = lower(relay.email) for update;

  if exists (select 1 from public.player_profile_details where player_id = p_original)
    or exists (select 1 from public.player_profile_details where player_id = p_relay
      and playtomic_proof_path is not null and playtomic_proof_path not like 'signup/' || relay_user.id || '/%')
    or exists (select 1 from public.event_registrations r where lower(relay.email) in
      (lower(r.email), lower(r.partner_email), lower(r.registered_by)))
    or exists (select 1 from public.payments p where lower(p.metadata->>'registrant_email') = lower(relay.email))
    or exists (select 1 from messaging.accounts where user_id = relay_user.id and (rules_version is not null or suspended)) then
    raise exception 'Review profile details, entries, payments or messaging before merging';
  end if;

  perform pg_temp.require_no_player_merge_references('public.players', p_relay::text, array[
    'public.player_profile_details', 'public.playtomic_profile_extractions', 'public.player_devices',
    'messaging.accounts'
  ]::regclass[]);
  perform pg_temp.require_no_player_merge_references('messaging.accounts', relay_user.id::text, '{}'::regclass[]);

  update public.players set
    contact_number = coalesce(nullif(btrim(original.contact_number), ''), relay.contact_number),
    id_number = coalesce(nullif(btrim(original.id_number), ''), relay.id_number),
    bio = coalesce(nullif(btrim(original.bio), ''), relay.bio),
    court_side = coalesce(original.court_side, relay.court_side),
    playing_hand = coalesce(original.playing_hand, relay.playing_hand),
    last_app_at = greatest(original.last_app_at, relay.last_app_at),
    last_app_device = case when original.last_app_at is null or relay.last_app_at > original.last_app_at
      then coalesce(relay.last_app_device, original.last_app_device) else original.last_app_device end
  where id = p_original;
  update public.player_profile_details set player_id = p_original where player_id = p_relay;
  update public.playtomic_profile_extractions set player_id = p_original where player_id = p_relay;

  -- Keep both the earliest and latest observation for a device seen on each login.
  update public.player_devices d set
    first_seen_at = least(d.first_seen_at, r.first_seen_at),
    last_seen_at = greatest(d.last_seen_at, r.last_seen_at),
    device = case when r.last_seen_at > d.last_seen_at then r.device else d.device end
  from public.player_devices r
  where r.player_id = p_relay and d.email = original.email and d.fingerprint = r.fingerprint;
  delete from public.player_devices r where r.player_id = p_relay and exists (
    select 1 from public.player_devices d where d.email = original.email and d.fingerprint = r.fingerprint
  );
  update public.player_devices set email = original.email, player_id = p_original where player_id = p_relay;

  if exists (select 1 from messaging.accounts where user_id = original_user.id) then
    delete from messaging.accounts where user_id = relay_user.id;
  else
    update messaging.accounts set user_id = original_user.id, player_id = p_original where user_id = relay_user.id;
  end if;
  -- Pending signup messages for a second profile should stop. Retain delivery history.
  update public.native_welcome_emails set status = 'needs_review', last_error = 'Merged into existing player'
    where user_id = relay_user.id and status = 'pending';
  update public.push_outbox set obsolete = true where lower(email) = lower(relay.email)
    and type = 'registration_complete' and not obsolete;

  update auth.identities set user_id = original_user.id, updated_at = now() where id = apple_identity;
  update auth.users u set raw_app_meta_data = jsonb_set(coalesce(u.raw_app_meta_data, '{}'), '{providers}',
    (select jsonb_agg(distinct i.provider order by i.provider) from auth.identities i where i.user_id = u.id))
    where u.id = original_user.id;
  update auth.users set banned_until = now() + interval '100 years',
    raw_app_meta_data = jsonb_set(coalesce(raw_app_meta_data, '{}'), '{providers}', '[]')
    where id = relay_user.id;
  update auth.refresh_tokens set revoked = true where user_id::text = relay_user.id::text and not revoked;
  delete from auth.sessions where user_id = relay_user.id;

  perform pg_temp.require_no_player_merge_references('public.players', p_relay::text, '{}'::regclass[]);
  delete from public.players where id = p_relay;
  return p_original;
end;
$$;
