-- One shared read-only refresh per canonical URL every two minutes, across all clients.
create table public.rankedin_draw_refresh_leases (
  url text primary key,
  next_attempt_at timestamptz not null
);
alter table public.rankedin_draw_refresh_leases enable row level security;
revoke all on public.rankedin_draw_refresh_leases from public, anon, authenticated;
grant all on public.rankedin_draw_refresh_leases to service_role;

create table public.rankedin_draw_refresh_budget (
  id boolean primary key default true check (id),
  window_start timestamptz not null,
  requests integer not null check (requests >= 0)
);
alter table public.rankedin_draw_refresh_budget enable row level security;
revoke all on public.rankedin_draw_refresh_budget from public, anon, authenticated;
grant all on public.rankedin_draw_refresh_budget to service_role;

create function public.claim_rankedin_draw_refresh(p_url text) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare claimed text; used integer; minute timestamptz := date_trunc('minute', now());
begin
  if p_url !~ '^https://api\.rankedin\.com/v1/tournament/(GetClassesAndDrawNamesAsync/\?tournamentId=[1-9][0-9]*|GetDrawsForStageAndStrengthAsync\?tournamentClassId=[1-9][0-9]*&drawStrength=[0-9]+&drawStage=[0-9]+&isReadonly=true&language=en)$' then
    return false;
  end if;
  insert into public.rankedin_draw_refresh_leases(url,next_attempt_at) values(p_url,now()+interval '2 minutes')
    on conflict(url) do update set next_attempt_at=excluded.next_attempt_at
    where public.rankedin_draw_refresh_leases.next_attempt_at<=now() returning url into claimed;
  if claimed is null then return false; end if;
  insert into public.rankedin_draw_refresh_budget(id,window_start,requests) values(true,minute,1)
    on conflict(id) do update set window_start=excluded.window_start,
      requests=case when public.rankedin_draw_refresh_budget.window_start=minute then public.rankedin_draw_refresh_budget.requests+1 else 1 end
    where public.rankedin_draw_refresh_budget.window_start<>minute or public.rankedin_draw_refresh_budget.requests<30
    returning requests into used;
  return used is not null;
end;
$$;
revoke all on function public.claim_rankedin_draw_refresh(text) from public,anon,authenticated;
grant execute on function public.claim_rankedin_draw_refresh(text) to service_role;
