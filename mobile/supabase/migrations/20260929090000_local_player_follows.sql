begin;
create table if not exists public.local_player_follows (
  user_id uuid not null references auth.users(id) on delete cascade,
  player_id bigint not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, player_id)
);
alter table public.local_player_follows enable row level security;
revoke all on public.local_player_follows from anon, authenticated;
grant select, insert, delete on public.local_player_follows to authenticated;
drop policy if exists "Read own local follows" on public.local_player_follows;
drop policy if exists "Create own local follows" on public.local_player_follows;
drop policy if exists "Delete own local follows" on public.local_player_follows;
create policy "Read own local follows" on public.local_player_follows for select to authenticated using ((select auth.uid()) = user_id);
create policy "Create own local follows" on public.local_player_follows for insert to authenticated with check ((select auth.uid()) = user_id and exists (select 1 from public.players_public p where p.id = player_id));
create policy "Delete own local follows" on public.local_player_follows for delete to authenticated using ((select auth.uid()) = user_id);
commit;
