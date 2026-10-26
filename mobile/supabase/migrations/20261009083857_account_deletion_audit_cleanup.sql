create or replace function public.complete_account_deletion(p_user_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare account_email text; player_ids bigint[]; registration_ids text[]; phones text[]; identity_values text[]; deleted_email text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  select lower(email) into account_email from auth.users where id=p_user_id for update;
  if account_email is null then raise exception 'Account not found'; end if;
  select coalesce(array_agg(id),'{}'),coalesce(array_agg(contact_number) filter(where contact_number is not null),'{}')
    into player_ids,phones from public.players where lower(email)=account_email;
  select coalesce(array_agg(distinct lower(v)) filter(where v is not null and v<>''),'{}') into identity_values
    from public.players p cross join lateral unnest(array[p.name,p.email,p.contact_number,p.id_number,p.image_url,p.bio,p.instagram_link,p.rankedin_profile_url,p.rankedin_id]) v
    where p.id=any(player_ids);
  identity_values=array_append(identity_values,account_email);
  select coalesce(array_agg(id::text),'{}') into registration_ids from public.event_registrations
    where lower(email)=account_email or lower(partner_email)=account_email;
  deleted_email='deleted-'||p_user_id::text||'@deleted.invalid';
  if jsonb_array_length(public.account_deletion_storage(p_user_id))>0 then raise exception 'Profile photos must be removed first'; end if;

  delete from public.player_push_tokens where lower(email)=account_email or player_id=any(player_ids);
  delete from public.tournament_notification_jobs where lower(email)=account_email;
  delete from public.pro_match_bookmarks where user_id=p_user_id;
  delete from public.push_outbox where lower(email)=account_email;
  delete from public.event_notification_follows where lower(email)=account_email;
  delete from public.player_schedule_events where lower(user_email)=account_email;
  delete from public.player_devices where lower(email)=account_email or player_id=any(player_ids);
  delete from public.email_queue where lower(recipient_email)=account_email;
  delete from public.whatsapp_queue where recipient_phone=any(phones);
  delete from public.admin_sidebar_permissions where lower(email)=account_email;
  delete from public.coach_applications where lower(email)=account_email;
  delete from public.club_claim_requests where lower(requester_email)=account_email or requester_player_id=any(player_ids);
  delete from public.club_claim_invites where lower(email)=account_email;
  delete from public.club_members where lower(user_email)=account_email or player_id=any(player_ids);
  delete from public.federation_members where lower(user_email)=account_email or player_id=any(player_ids);
  delete from public.organisation_members where lower(user_email)=account_email or player_id=any(player_ids);
  delete from public.native_license_checkouts where user_id=p_user_id or player_id=any(player_ids);
  delete from public.player_fip_links where local_player_id=any(player_ids);
  delete from public.local_player_follows where player_id=any(player_ids) or user_id=p_user_id;
  -- The feed is a disposable presentation cache, not the tournament ledger.
  delete from public.following_activity where local_player_ids&&player_ids;
  delete from public.following_sync_state where source_key=any(select 'local:'||id::text from unnest(player_ids) id);

  update public.event_registrations set full_name='Deleted player',email=deleted_email,phone=null,
    tshirt_size=null,tshirt_sponsor_name=null,tshirt_logo_url=null
    where lower(email)=account_email;
  update public.event_registrations set partner_name='Deleted player',partner_email=deleted_email where lower(partner_email)=account_email;
  update public.event_registrations set registered_by=null where lower(registered_by)=account_email;
  update public.tournament_participants set full_name='Deleted player',email=null,rankedin_participant_id=null,
    metadata=private.scrub_account_json(metadata,identity_values)
    where profile_id=any(player_ids) or lower(email)=account_email;
  update public.draw_entries set player_one_name='Deleted player' where player_one_id=any(player_ids);
  update public.draw_entries set player_two_name='Deleted player' where player_two_id=any(player_ids);
  update public.draw_entries set team_name=concat_ws(' / ',player_one_name,player_two_name),
    snapshot=private.scrub_account_json(snapshot,array[account_email])
    where player_one_id=any(player_ids) or player_two_id=any(player_ids);
  update public.payments set metadata=private.scrub_account_json(metadata,identity_values) where player_id=any(player_ids);
  update public.payment_refunds set initiated_by='Deleted user',metadata=private.scrub_account_json(metadata,array[account_email]) where lower(initiated_by)=account_email;
  update public.event_activity_log set
    actor_email=case when lower(actor_email)=account_email then null else actor_email end,
    summary='Account activity (deleted player)', details=private.scrub_account_json(details,identity_values)
    where lower(actor_email)=account_email or details->>'registration_id'=any(registration_ids)
      or lower(details->>'player_email')=account_email or lower(details->>'partner_email')=account_email;
  update public.event_creation_audit set creator_user_id=null,creator_email=null,creator_name='Deleted user' where creator_user_id=p_user_id or lower(creator_email)=account_email;
  update public.org_audit_log set actor_email=deleted_email,details=private.scrub_account_json(details,identity_values) where lower(actor_email)=account_email;
  -- Registration triggers may produce new notifications during anonymization.
  delete from public.tournament_notification_jobs where lower(email) in (account_email,deleted_email);
  delete from public.push_outbox where lower(email) in (account_email,deleted_email);
  delete from public.event_notification_follows where lower(email) in (account_email,deleted_email);

  -- Preserve shared club/event documents while detaching their former author.
  update public.club_claim_invites set invited_by=null where invited_by=p_user_id;
  update public.player_fip_links set requested_by=null where requested_by=p_user_id;
  update public.tournament_access set updated_by=null where updated_by=p_user_id;
  update public.tournament_audit set actor=null where actor=p_user_id;
  update public.tournament_confirmations set updated_by=null where updated_by=p_user_id;
  update public.tournament_finalisations set finalised_by=null where finalised_by=p_user_id;
  update public.tournament_schedules set updated_by=null where updated_by=p_user_id;
  update storage.objects set owner=null,owner_id=null where owner=p_user_id or owner_id=p_user_id::text;

  delete from public.players where id=any(player_ids);
  delete from auth.refresh_tokens where user_id=p_user_id::text;
  delete from auth.users where id=p_user_id;
  return true;
end $$;
revoke all on function public.complete_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.complete_account_deletion(uuid) to service_role;
