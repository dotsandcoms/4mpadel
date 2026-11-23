begin;

-- Keep verified replacements held until all refund consumers understand the
-- projected aliases. The database protection can then be deployed first.
alter table private.security_release_state
  add column verified_paid_replacements_enabled boolean not null default false;

-- Checkout proofs and charge details are immutable. This side record attests
-- only who currently occupies the particular paid entry in the roster.
create table private.verified_payment_entry_transfers (
  payment_id uuid not null references public.payments(id) on delete cascade,
  registration_id uuid not null,
  cover_position integer not null check (cover_position > 0),
  event_id bigint not null,
  division_id uuid,
  division text,
  email text not null,
  primary key (payment_id,registration_id),
  unique (payment_id,cover_position)
);
alter table private.verified_payment_entry_transfers enable row level security;
revoke all on private.verified_payment_entry_transfers from public,anon,authenticated,service_role;

-- Existing ledger consumers get the same row shape. Only attested aliases are
-- projected, including after worker retries, checkout aliases or licence splits.
create function private.project_verified_payment_entry_transfers()
returns trigger language plpgsql security definer set search_path='' as $$
declare aliases jsonb;
begin
  if jsonb_typeof(new.metadata)='object' then
    new.metadata := new.metadata - 'verified_entry_transfers';
  end if;
  if tg_op='UPDATE' then
    select jsonb_agg(to_jsonb(t)-'payment_id' order by t.cover_position) into aliases
      from private.verified_payment_entry_transfers t where t.payment_id=new.id and t.event_id=new.event_id;
    if aliases is not null and exists (
      select 1 from private.event_checkout_security_quotes q where q.payment_id=new.id
        and q.cart_hash=sha256(convert_to(private.checkout_cart(new)::text,'UTF8'))
    ) then
      new.metadata := coalesce(new.metadata,'{}'::jsonb) || jsonb_build_object('verified_entry_transfers',aliases);
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.project_verified_payment_entry_transfers() from public,anon,authenticated,service_role;
create trigger verified_payment_entry_transfer_projection before insert or update on public.payments
for each row execute function private.project_verified_payment_entry_transfers();
update public.payments p set metadata=p.metadata-'verified_entry_transfers'
  where jsonb_typeof(p.metadata)='object' and p.metadata ? 'verified_entry_transfers';

-- Ordinal among entry covers, rather than all covers, stays stable when the
-- verified licence split removes only the licence lines from the checkout.
create function private.quoted_cover_positions(p_meta jsonb,p_entry public.event_registrations)
returns table(cover_ordinal integer) language sql immutable set search_path='' as $$
  select cover.cover_ordinal::integer
  from (
    select x.value, row_number() over (order by x.ordinality) as cover_ordinal
    from jsonb_array_elements(case when jsonb_typeof(p_meta->'covers')='array' then p_meta->'covers' else '[]'::jsonb end)
      with ordinality x(value,ordinality) where x.value->>'type'='entry'
  ) cover
  where (nullif(cover.value->>'registration_id','') is null or cover.value->>'registration_id'=p_entry.id::text)
    and lower(trim(cover.value->>'email'))=lower(trim(p_entry.email))
    and (case when nullif(cover.value->>'division_id','') is not null then cover.value->>'division_id'=p_entry.division_id::text
         else nullif(cover.value->>'division','') is not null and cover.value->>'division'=p_entry.division end)
$$;

create function private.replacement_payment_matches(p_payment public.payments,p_entry public.event_registrations)
returns boolean language plpgsql stable set search_path='' as $$
begin
  if exists (select 1 from private.verified_payment_entry_transfers t where t.payment_id=p_payment.id and t.registration_id=p_entry.id) then
    return exists (select 1 from private.verified_payment_entry_transfers t where t.payment_id=p_payment.id and t.registration_id=p_entry.id
      and t.event_id=p_entry.event_id and t.email=lower(trim(p_entry.email))
      and t.division_id is not distinct from p_entry.division_id and t.division is not distinct from p_entry.division);
  end if;
  if exists (select 1 from private.event_checkout_security_quotes q where q.payment_id=p_payment.id) then
    if exists (select 1 from private.quoted_cover_positions(p_payment.metadata,p_entry)) then
      return exists (select 1 from private.quoted_cover_positions(p_payment.metadata,p_entry) c where not exists (
        select 1 from private.verified_payment_entry_transfers t where t.payment_id=p_payment.id and t.cover_position=c.cover_ordinal));
    end if;
  end if;
  return private.registration_entry_payment_matches(p_payment.metadata,p_entry)
    or private.registration_entry_payment_matches(p_payment.metadata #> '{original_trx,metadata}',p_entry);
end;
$$;

create function private.link_quoted_replacement(
  p_payment public.payments,p_entry public.event_registrations,p_new_email text
) returns void language plpgsql set search_path='' as $$
declare ordinal integer; hits integer;
begin
  if not coalesce((select verified_paid_replacements_enabled and integrity_enabled from private.security_release_state where id),false) then
    raise exception 'Verified paid replacements require the updated billing service.';
  end if;
  if p_payment.event_id is distinct from p_entry.event_id or p_entry.payment_status is distinct from 'paid'
    or p_payment.payment_method is distinct from 'paystack'
    or p_payment.status is distinct from 'success' or p_payment.payment_type is distinct from 'event_entry_fee'
    or p_payment.metadata->>'source' is distinct from 'manual_event' or coalesce(p_payment.amount,0)<=0
    or coalesce(p_payment.is_test,false) is distinct from coalesce(p_entry.is_test,false)
    or not exists (select 1 from private.event_checkout_security_quotes q where q.payment_id=p_payment.id
      and q.cart_hash=sha256(convert_to(private.checkout_cart(p_payment)::text,'UTF8'))) then
    raise exception 'Review the verified payment before replacing this player. Its entry allocation cannot be confirmed.';
  end if;
  update private.verified_payment_entry_transfers t set email=p_new_email
    where t.payment_id=p_payment.id and t.registration_id=p_entry.id and t.event_id=p_entry.event_id
      and t.email=lower(trim(p_entry.email)) and t.division_id is not distinct from p_entry.division_id
      and t.division is not distinct from p_entry.division;
  if found then return; end if;

  select count(*),min(c.cover_ordinal) into hits,ordinal from private.quoted_cover_positions(p_payment.metadata,p_entry) c;
  if hits<>1 or exists (select 1 from private.verified_payment_entry_transfers t
      where t.payment_id=p_payment.id and (t.cover_position=ordinal or t.registration_id=p_entry.id)) then
    raise exception 'Review the verified payment before replacing this player. It needs one exact entry cover.';
  end if;
  insert into private.verified_payment_entry_transfers(payment_id,registration_id,cover_position,event_id,division_id,division,email)
    values(p_payment.id,p_entry.id,ordinal,p_entry.event_id,p_entry.division_id,p_entry.division,p_new_email);
end;
$$;

revoke all on function private.quoted_cover_positions(jsonb,public.event_registrations),
  private.replacement_payment_matches(public.payments,public.event_registrations),
  private.link_quoted_replacement(public.payments,public.event_registrations,text) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.replace_registration_player(
    p_registration_id uuid, p_expected_email text, p_expected_partner_email text, p_new_player_id bigint
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    entry public.event_registrations;
    teammate public.event_registrations;
    replacement public.players;
    payment public.payments;
    event_state text;
    locked_event_id bigint;
    division_key text;
    transfer jsonb;
    meta jsonb;
    inner_meta jsonb;
    successful_receipts integer := 0;
BEGIN
    IF auth.uid() IS NULL OR NOT COALESCE(public.account_is_active(), false) THEN
        RAISE EXCEPTION 'Sign in with an active event-manager account.';
    END IF;
    SELECT * INTO entry FROM public.event_registrations WHERE id = p_registration_id;
    IF NOT FOUND OR NOT COALESCE(public.can_manage_event(entry.event_id), false) THEN
        RAISE EXCEPTION 'You cannot manage entries for this event.';
    END IF;
    locked_event_id := entry.event_id;
    -- Match the lock order of the existing paid-partner and team-management RPCs.
    SELECT event_status INTO event_state FROM public.calendar WHERE id = locked_event_id FOR UPDATE;
    IF NOT FOUND OR event_state = 'cancelled' THEN RAISE EXCEPTION 'This event is unavailable or cancelled.'; END IF;
    PERFORM 1 FROM public.event_registrations WHERE event_id = locked_event_id ORDER BY id FOR UPDATE;
    PERFORM 1 FROM public.payments WHERE event_id = locked_event_id ORDER BY id FOR UPDATE;
    SELECT * INTO entry FROM public.event_registrations WHERE id = p_registration_id;
    IF entry.id IS NULL OR entry.event_id IS DISTINCT FROM locked_event_id
        OR lower(trim(entry.email)) IS DISTINCT FROM lower(trim(p_expected_email))
        OR NULLIF(lower(trim(entry.partner_email)), '') IS DISTINCT FROM NULLIF(lower(trim(p_expected_partner_email)), '') THEN
        RAISE EXCEPTION 'This entry or its partner has changed. Refresh and try again.';
    END IF;
    IF entry.status IS DISTINCT FROM 'registered' OR COALESCE(entry.payment_status, '') = 'refunded' THEN
        RAISE EXCEPTION 'Only active, non-refunded entries can be replaced.';
    END IF;
    division_key := private.registration_team_division_key(entry);
    IF division_key = 'name:' THEN RAISE EXCEPTION 'This entry needs a division before replacing a player.'; END IF;
    IF EXISTS (SELECT 1 FROM public.event_registrations r WHERE r.event_id = locked_event_id AND r.id <> entry.id
        AND r.status = 'registered' AND private.registration_team_division_key(r) = division_key
        AND lower(trim(r.email)) = lower(trim(entry.email))) THEN
        RAISE EXCEPTION 'This player has duplicate active entries. Resolve them before replacing the player.';
    END IF;
    IF (SELECT count(*) FROM public.event_registrations r WHERE r.event_id = locked_event_id
        AND r.id <> entry.id AND r.status = 'registered' AND private.registration_team_division_key(r) = division_key
        AND (lower(trim(r.email)) = lower(trim(entry.partner_email)) OR lower(trim(r.partner_email)) = lower(trim(entry.email)))) > 1 THEN
        RAISE EXCEPTION 'This player is linked to multiple entries. Resolve the team links before replacing them.';
    END IF;
    SELECT * INTO teammate FROM public.event_registrations r WHERE r.event_id = locked_event_id
        AND r.id <> entry.id AND r.status = 'registered' AND private.registration_team_division_key(r) = division_key
        AND (lower(trim(r.email)) = lower(trim(entry.partner_email)) OR lower(trim(r.partner_email)) = lower(trim(entry.email)));
    SELECT * INTO replacement FROM public.players WHERE id = p_new_player_id FOR SHARE;
    IF NOT FOUND OR NULLIF(trim(replacement.email), '') IS NULL THEN
        RAISE EXCEPTION 'Select a player with a 4M profile and email address.';
    END IF;
    IF lower(trim(replacement.email)) IN (lower(trim(entry.email)), lower(trim(teammate.email)), lower(trim(entry.partner_email))) THEN
        RAISE EXCEPTION 'Select a different player.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.event_registrations r WHERE r.event_id = locked_event_id
        AND private.registration_team_division_key(r) = division_key
        AND (lower(trim(r.email)) = lower(trim(replacement.email))
            OR (r.status = 'registered' AND r.id <> entry.id AND lower(trim(r.partner_email)) = lower(trim(replacement.email))))) THEN
        RAISE EXCEPTION 'This player already has an entry or a reserved partner spot in this division. Choose another player.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.draws d WHERE d.event_id = locked_event_id AND d.status <> 'archived'
        AND ('id:' || d.division_id::text = division_key OR EXISTS (
            SELECT 1 FROM public.draw_entries e WHERE e.draw_id = d.id AND e.source_registration_id IN (entry.id, teammate.id)
        ))) THEN RAISE EXCEPTION 'This division already has a generated draw. Clear or archive the draw before replacing a player.'; END IF;

    -- A successful refund or live checkout must not race with a substitution.
    IF EXISTS (SELECT 1 FROM public.payment_refunds r WHERE r.event_registration_id = entry.id
        AND r.status <> 'failed' AND COALESCE(r.metadata->>'cover_type', 'entry') <> 'license') THEN
        RAISE EXCEPTION 'This entry has a refund in progress or already processed. Resolve it before replacing the player.';
    END IF;
    FOR payment IN SELECT * FROM public.payments p WHERE p.event_id = locked_event_id
        AND COALESCE(p.payment_type, '') NOT ILIKE '%license%' AND COALESCE(p.payment_type, '') <> 'membership'
        AND COALESCE(p.reference, '') NOT LIKE 'LIC-%'
        AND NOT (jsonb_array_length(COALESCE(p.metadata->'covers', '[]'::jsonb)) > 0
            AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p.metadata->'covers') c WHERE c->>'type' IS DISTINCT FROM 'license'))
        AND private.replacement_payment_matches(p,entry)
    LOOP
        IF payment.status = 'success' THEN successful_receipts := successful_receipts + 1; END IF;
        IF payment.status IN ('processing', 'pending') THEN
            RAISE EXCEPTION 'This entry has an unfinished payment. Resolve it before replacing the player.';
        END IF;
        IF EXISTS (SELECT 1 FROM public.payment_refunds r WHERE r.payment_id = payment.id
            AND (r.event_registration_id = entry.id OR r.event_registration_id IS NULL)
            AND r.status <> 'failed' AND COALESCE(r.metadata->>'cover_type', 'entry') <> 'license') THEN
            RAISE EXCEPTION 'This entry has a refund in progress or already processed. Resolve it before replacing the player.';
        END IF;
    END LOOP;

    IF entry.payment_status='paid' AND entry.payment_method='paystack' AND successful_receipts=0
        AND coalesce(private.current_entry_fee(entry.event_id,entry.division_id,entry.division),0)>0 THEN
        RAISE EXCEPTION 'Review the payment before replacing this player. No exact paid entry receipt was found.';
    END IF;

    transfer := jsonb_build_object('registration_id', entry.id, 'teammate_registration_id', teammate.id,
        'previous_email', entry.email, 'previous_name', entry.full_name,
        'new_email', lower(trim(replacement.email)), 'new_name', replacement.name,
        'actor_email', auth.email(), 'replaced_at', now(), 'payment_status', entry.payment_status,
        'previous_registration', to_jsonb(entry) - 'pay_token');
    UPDATE public.event_registrations SET full_name = replacement.name, email = lower(trim(replacement.email)),
        phone = replacement.contact_number, registered_by = COALESCE(teammate.email, lower(trim(replacement.email))),
        pay_token = gen_random_uuid(), whatsapp_added = false,
        partner_name = COALESCE(teammate.full_name, entry.partner_name), partner_email = COALESCE(teammate.email, entry.partner_email),
        partner_payment_status = COALESCE(teammate.payment_status, entry.partner_payment_status),
        tshirt_size = NULL, tshirt_logo_url = NULL, tshirt_sponsor_name = NULL,
        reminder_sent_at = NULL, close_reminder_sent_at = NULL,
        reminder_1d_sent_at = NULL, reminder_3d_sent_at = NULL, reminder_7d_sent_at = NULL
    WHERE id = entry.id;
    UPDATE public.event_registrations SET partner_name = replacement.name, partner_email = lower(trim(replacement.email)),
        partner_payment_status = entry.payment_status,
        registered_by = CASE WHEN lower(trim(registered_by)) = lower(trim(entry.email)) THEN teammate.email ELSE registered_by END
    WHERE id = teammate.id;

    FOR payment IN SELECT * FROM public.payments p WHERE p.event_id = locked_event_id AND p.status = 'success'
        AND COALESCE(p.payment_type, '') NOT ILIKE '%license%' AND COALESCE(p.payment_type, '') <> 'membership'
        AND COALESCE(p.reference, '') NOT LIKE 'LIC-%'
        AND NOT (jsonb_array_length(COALESCE(p.metadata->'covers', '[]'::jsonb)) > 0
            AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p.metadata->'covers') c WHERE c->>'type' IS DISTINCT FROM 'license'))
        AND private.replacement_payment_matches(p,entry)
    LOOP
        IF EXISTS (SELECT 1 FROM private.event_checkout_security_quotes q WHERE q.payment_id=payment.id) THEN
            PERFORM private.link_quoted_replacement(payment,entry,lower(trim(replacement.email)));
            -- Updating only the projection trigger input leaves checkout/cart
            -- fields, gateway reference, amount and payer unchanged.
            UPDATE public.payments p SET metadata=p.metadata WHERE p.id=payment.id;
            CONTINUE;
        END IF;
        meta := private.transfer_registration_entry_metadata(payment.metadata, entry, teammate, replacement, transfer);
        inner_meta := payment.metadata #> '{original_trx,metadata}';
        IF jsonb_typeof(inner_meta) = 'object' THEN
            meta := jsonb_set(meta, '{original_trx,metadata}', private.transfer_registration_entry_metadata(inner_meta, entry, teammate, replacement, transfer));
        END IF;
        UPDATE public.payments SET metadata = meta WHERE id = payment.id;
    END LOOP;
    INSERT INTO public.event_activity_log(event_id, actor_email, actor_role, action, category, summary, details)
    VALUES(locked_event_id, auth.email(), 'ADMIN', 'admin.player_replaced', 'REGISTRATION',
        entry.full_name || ' replaced by ' || replacement.name || ' — existing entry transferred, no charge or refund', transfer);
    RETURN transfer;
END;
$$;

notify pgrst,'reload schema';
commit;
