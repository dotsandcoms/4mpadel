create table public.fip_tournament_cache (
  event_id integer primary key check (event_id < 0),
  payload jsonb,
  refresh_after timestamptz,
  lease_until timestamptz,
  last_error text
);
alter table public.fip_tournament_cache enable row level security;
revoke all on public.fip_tournament_cache from anon, authenticated;
grant all on public.fip_tournament_cache to service_role;

create table public.fip_refresh_budget (
  id boolean primary key default true check (id),
  window_started_at timestamptz not null default now(),
  requests integer not null default 0
);
alter table public.fip_refresh_budget enable row level security;
revoke all on public.fip_refresh_budget from anon, authenticated;
grant all on public.fip_refresh_budget to service_role;

create function public.claim_fip_tournament_refresh(p_event_id integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_now timestamptz := now(); v_row public.fip_tournament_cache; v_budget public.fip_refresh_budget;
begin
  if p_event_id >= 0 then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(1604202617);
  insert into public.fip_tournament_cache(event_id) values(p_event_id) on conflict do nothing;
  select * into v_row from public.fip_tournament_cache where event_id = p_event_id;
  if v_row.refresh_after > v_now or v_row.lease_until > v_now then return false; end if;
  insert into public.fip_refresh_budget(id) values(true) on conflict do nothing;
  select * into v_budget from public.fip_refresh_budget where id = true;
  if v_budget.window_started_at <= v_now - interval '1 minute' then
    update public.fip_refresh_budget set window_started_at = v_now, requests = 0 where id = true;
  elsif v_budget.requests >= 12 then return false;
  end if;
  update public.fip_refresh_budget set requests = requests + 1 where id = true;
  update public.fip_tournament_cache set lease_until = v_now + interval '2 minutes' where event_id = p_event_id;
  return true;
end;
$$;
revoke all on function public.claim_fip_tournament_refresh(integer) from public, anon, authenticated;
grant execute on function public.claim_fip_tournament_refresh(integer) to service_role;
