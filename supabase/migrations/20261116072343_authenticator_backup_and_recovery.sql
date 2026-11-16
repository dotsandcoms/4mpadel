-- Recovery credentials stay in Supabase Auth. Only an audited, freshly verified
-- Super Admin can authorise the server to delete another staff account's TOTP.
create table public.authenticator_recovery_audit (
  id uuid primary key,
  actor_id uuid not null,
  target_id uuid not null,
  target_email text not null,
  factor_ids uuid[] not null check (cardinality(factor_ids) between 1 and 10),
  removed_factor_ids uuid[] not null default '{}',
  reason text not null check (char_length(reason) between 20 and 500),
  state text not null default 'processing' check (state in ('processing','completed','failed')),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  check (actor_id <> target_id)
);
create index authenticator_recovery_actor_created on public.authenticator_recovery_audit(actor_id,created_at desc);
alter table public.authenticator_recovery_audit enable row level security;
-- RPC-only audit: no direct reads/writes, including the worker role. UUID IDs
-- need no sequence. The checked routines below are the sole access contract.
revoke all on table public.authenticator_recovery_audit from public,anon,authenticated,service_role;
create index authenticator_recovery_processing_target on public.authenticator_recovery_audit(target_id,created_at desc) where state='processing';

create function public.authenticator_recovery_action(p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor auth.users; target auth.users; address text; selected uuid[]; request uuid;
  note text; existing public.authenticator_recovery_audit; details jsonb;
begin
  if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>4000 then
    raise exception 'RECOVERY_INVALID_REQUEST' using errcode='22023';
  end if;
  select u.* into actor from auth.users u join auth.sessions s on s.user_id=u.id
    where u.id=auth.uid() and s.id::text=auth.jwt()->>'session_id'
    and u.deleted_at is null and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
    and (u.banned_until is null or u.banned_until<now()) and (s.not_after is null or s.not_after>now())
    and lower(trim(u.email))=lower(trim(auth.jwt()->>'email'));
  if actor.id is null then raise exception 'RECOVERY_SIGN_IN' using errcode='42501'; end if;
  if not coalesce(public.is_super_admin(actor.email),false) then
    raise exception 'RECOVERY_SUPER_ADMIN_REQUIRED' using errcode='42501';
  end if;
  if auth.jwt()->>'aal' is distinct from 'aal2' or not exists (
    select 1 from auth.sessions s join auth.mfa_factors f on f.id=s.factor_id and f.user_id=s.user_id
    where s.id::text=auth.jwt()->>'session_id' and s.user_id=actor.id and f.status='verified' and f.factor_type='totp'
  ) or not exists (
    select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) entry
    where entry->>'method' in ('totp','mfa/totp')
    and (entry->>'timestamp')::numeric between extract(epoch from now())-300 and extract(epoch from now())+30
  ) then raise exception 'RECOVERY_MFA_REQUIRED' using errcode='42501'; end if;
  if p_action='history' then
    return coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from (
      select id,target_email,state,reason,created_at,finished_at from public.authenticator_recovery_audit
      where actor_id=actor.id order by created_at desc limit 20
    ) a),'[]');
  end if;
  if p_action not in ('lookup','prepare') or p_action is null then
    raise exception 'RECOVERY_INVALID_REQUEST' using errcode='22023';
  end if;
  address:=lower(trim(p_data->>'email'));
  if address is null or char_length(address)>254 or address !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'RECOVERY_INVALID_EMAIL' using errcode='22023';
  end if;
  select * into target from auth.users u where lower(trim(u.email))=address and u.deleted_at is null
    and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false);
  if target.id is null or not (
    coalesce(public.is_super_admin(target.email),false)
    or exists(select 1 from public.admin_sidebar_permissions p where lower(trim(p.email))=address and p.role='admin')
    or exists(select 1 from public.organisation_members m join public.organisations o on o.id=m.organisation_id
      where lower(trim(m.user_email))=address and m.role in ('owner','admin') and o.status='approved')
    or exists(select 1 from public.organisations o join public.players p on p.id=o.created_by
      where lower(trim(p.email))=address and o.status='approved')
    or exists(select 1 from public.calendar c where lower(trim(c.organiser_email))=address
      or exists(select 1 from unnest(c.event_co_admins) e where lower(trim(e))=address))
  ) then raise exception 'RECOVERY_STAFF_UNAVAILABLE' using errcode='42501'; end if;
  if target.id=actor.id then raise exception 'RECOVERY_USE_OWN_SETTINGS' using errcode='42501'; end if;
  details:=jsonb_build_object('userId',target.id,'email',target.email,'factors',coalesce((
    select jsonb_agg(jsonb_build_object('id',f.id,'friendly_name',f.friendly_name,'status',f.status,'created_at',f.created_at) order by f.created_at)
    from auth.mfa_factors f where f.user_id=target.id and f.factor_type='totp'
  ),'[]'));
  if p_action='lookup' then return details; end if;
  if p_data->'identityConfirmed' is distinct from 'true'::jsonb then
    raise exception 'RECOVERY_CONFIRM_IDENTITY' using errcode='22023';
  end if;
  note:=btrim(p_data->>'reason');
  if note is null or char_length(note) not between 20 and 500 then
    raise exception 'RECOVERY_REASON_REQUIRED' using errcode='22023';
  end if;
  if jsonb_typeof(p_data->'factorIds') is distinct from 'array' then
    raise exception 'RECOVERY_INVALID_REQUEST' using errcode='22023';
  end if;
  select array_agg(distinct v::uuid order by v::uuid) into selected from jsonb_array_elements_text(p_data->'factorIds') v;
  request:=(p_data->>'requestId')::uuid;
  if request is null or coalesce(cardinality(selected),0) not between 1 and 10
    or cardinality(selected)<>jsonb_array_length(p_data->'factorIds') then
    raise exception 'RECOVERY_INVALID_REQUEST' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(actor.id::text,6108));
  perform pg_advisory_xact_lock(hashtextextended(target.id::text,6109));
  select * into existing from public.authenticator_recovery_audit where id=request;
  if found then
    if existing.actor_id<>actor.id or existing.target_id<>target.id or existing.factor_ids<>selected or existing.reason<>note then
      raise exception 'RECOVERY_RETRY_CHANGED' using errcode='22023';
    end if;
    return jsonb_build_object('requestId',request,'state',existing.state,'execute',false);
  end if;
  if exists(select 1 from unnest(selected) wanted(factor_id) where not exists(select 1 from auth.mfa_factors f
    where f.id=wanted.factor_id and f.user_id=target.id and f.factor_type='totp')) then
    raise exception 'RECOVERY_FACTORS_CHANGED' using errcode='40001';
  end if;
  if exists(select 1 from public.authenticator_recovery_audit where target_id=target.id and state='processing' and created_at>now()-interval '5 minutes') then
    raise exception 'RECOVERY_IN_PROGRESS' using errcode='40001';
  end if;
  if (select count(*) from public.authenticator_recovery_audit where actor_id=actor.id and created_at>now()-interval '1 hour')>=10 then
    raise exception 'RECOVERY_RATE_LIMIT' using errcode='42501';
  end if;
  insert into public.authenticator_recovery_audit(id,actor_id,target_id,target_email,factor_ids,reason)
    values(request,actor.id,target.id,target.email,selected,note);
  return details||jsonb_build_object('requestId',request,'factorIds',to_jsonb(selected),'state','processing','execute',true);
end $$;
revoke all on function public.authenticator_recovery_action(text,jsonb) from public,anon,service_role;
grant execute on function public.authenticator_recovery_action(text,jsonb) to authenticated;

create function public.finish_authenticator_recovery(p_request uuid,p_removed uuid[],p_success boolean)
returns void language plpgsql security definer set search_path='' as $$
declare entry public.authenticator_recovery_audit;
begin
  if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'RECOVERY_WORKER_REQUIRED' using errcode='42501'; end if;
  select * into entry from public.authenticator_recovery_audit where id=p_request for update;
  if not found or p_removed is null or p_success is null or not p_removed <@ entry.factor_ids
    or cardinality(p_removed)>cardinality(entry.factor_ids) or (p_success and not p_removed @> entry.factor_ids) then
    raise exception 'RECOVERY_INVALID_COMPLETION' using errcode='22023';
  end if;
  if entry.state<>'processing' then return; end if;
  update public.authenticator_recovery_audit set removed_factor_ids=p_removed,
    state=case when p_success then 'completed' else 'failed' end,finished_at=now() where id=p_request;
end $$;
revoke all on function public.finish_authenticator_recovery(uuid,uuid[],boolean) from public,anon,authenticated;
grant execute on function public.finish_authenticator_recovery(uuid,uuid[],boolean) to service_role;
