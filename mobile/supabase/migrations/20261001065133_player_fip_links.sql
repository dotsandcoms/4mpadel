-- A 4M account owns the editable profile. A FIP identity is a claim until
-- independently reviewed; pending links are visibly marked as unverified.
create table public.player_fip_links (
  local_player_id bigint primary key references public.players(id) on delete cascade,
  fip_player_id bigint not null check (fip_player_id > 0),
  fip_player_name text not null check (length(trim(fip_player_name)) between 2 and 160),
  fip_category text not null check (fip_category in ('men', 'women')),
  fip_rank integer check (fip_rank > 0),
  status text not null default 'pending' check (status in ('pending', 'verified')),
  requested_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  check ((status = 'verified') = (verified_at is not null))
);

create unique index player_fip_links_verified_identity
  on public.player_fip_links (fip_player_id) where status = 'verified';

create index player_fip_links_requester on public.player_fip_links (requested_by);
alter table public.player_fip_links enable row level security;

create policy "Public can see player links and their verification status"
  on public.player_fip_links for select to anon, authenticated
  using (true);
create policy "Players can see own link requests"
  on public.player_fip_links for select to authenticated
  using (requested_by = (select auth.uid()));
create policy "Players can request a link for their own profile"
  on public.player_fip_links for insert to authenticated
  with check (
    status = 'pending' and verified_at is null
    and requested_by = (select auth.uid())
    and exists (
      select 1 from public.players p where p.id = local_player_id
      and lower(trim(p.email)) = lower(trim((select auth.jwt() ->> 'email')))
    )
  );
create policy "Players can withdraw their pending request"
  on public.player_fip_links for delete to authenticated
  using (status = 'pending' and requested_by = (select auth.uid()));

grant select on public.player_fip_links to anon;
grant select, insert, delete on public.player_fip_links to authenticated;
