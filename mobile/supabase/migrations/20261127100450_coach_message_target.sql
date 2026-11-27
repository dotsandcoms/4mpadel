-- Resolve only approved coach listings. Account and email matching stay inside the RPC.
create function messaging.coach_message_target(p_coach_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with viewer as (
    select u.id
    from auth.users u
    join messaging.accounts a on a.user_id = u.id
    where u.id = auth.uid() and not a.suspended
      and u.email_confirmed_at is not null and u.deleted_at is null and not coalesce(u.is_anonymous, false)
      and (u.banned_until is null or u.banned_until < now())
      and lower(btrim(u.email)) = lower(btrim(auth.jwt()->>'email'))
      and exists (
        select 1 from auth.sessions s
        where s.user_id = u.id and s.id::text = auth.jwt()->>'session_id'
          and (s.not_after is null or s.not_after > now())
      )
      and messaging.enabled_for(u.id)
  )
  select case
    when thread.can_read or (
      cfg.sending_enabled and cfg.requests_enabled and recipient.allow_requests and messaging.interactive(coach_account.id)
      and (c.id is null or (c.state = 'declined' and (c.declined_until is null or c.declined_until <= now())))
    ) then jsonb_strip_nulls(jsonb_build_object(
      'playerId', target.player_id::text,
      'conversationId', case when thread.can_read then c.id end
    ))
    else '{"unavailable":true}'::jsonb
  end
  from public.coach_applications coach
  cross join viewer
  cross join lateral (
    select min(p.id) as player_id from public.players p
    where lower(btrim(p.email)) = lower(btrim(coach.email))
    having count(*) = 1
  ) target
  join public.players_public published on published.id = target.player_id
  cross join lateral (
    select (array_agg(u.id))[1] as id from auth.users u
    where lower(btrim(u.email)) = lower(btrim(coach.email))
      and u.email_confirmed_at is not null and u.deleted_at is null and not coalesce(u.is_anonymous, false)
      and (u.banned_until is null or u.banned_until < now())
    having count(*) = 1
  ) coach_account
  left join messaging.accounts recipient on recipient.player_id = target.player_id
  join messaging.configuration cfg on cfg.singleton
  left join messaging.conversations c on c.kind = 'direct'
    and c.pair_key = least(viewer.id::text, coach_account.id::text) || ':' || greatest(viewer.id::text, coach_account.id::text)
  cross join lateral (
    select recipient.user_id is not null and c.id is not null and messaging.can_read(c.id, viewer.id) as can_read
  ) thread
  where coach.id = p_coach_id and coach.status = 'approved' and nullif(btrim(coach.email), '') is not null
    and coach_account.id <> viewer.id
    and (recipient.user_id is null or (recipient.user_id = coach_account.id and not recipient.suspended))
    and not messaging.blocked(viewer.id, coach_account.id);
$$;

create function public.coach_message_target(p_coach_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select messaging.coach_message_target(p_coach_id);
$$;

revoke all on function messaging.coach_message_target(uuid), public.coach_message_target(uuid)
  from public, anon, authenticated, service_role;
grant execute on function messaging.coach_message_target(uuid), public.coach_message_target(uuid) to authenticated;
