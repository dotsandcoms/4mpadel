begin;
create table if not exists public.pro_player_follows (
  user_id uuid not null references auth.users(id) on delete cascade,
  player_id bigint not null check (player_id > 0),
  player_name text not null check (char_length(player_name) between 1 and 200),
  category text not null check (category in ('men', 'women')),
  created_at timestamptz not null default now(),
  primary key (user_id, player_id)
);
alter table public.pro_player_follows enable row level security;
revoke all on public.pro_player_follows from anon, authenticated;
grant select, insert, delete on public.pro_player_follows to authenticated;
-- Replace only this migration's policies, atomically, when rerun.
drop policy if exists "Read own pro follows" on public.pro_player_follows;
drop policy if exists "Create own pro follows" on public.pro_player_follows;
drop policy if exists "Delete own pro follows" on public.pro_player_follows;
create policy "Read own pro follows" on public.pro_player_follows for select to authenticated using ((select auth.uid()) = user_id);
create policy "Create own pro follows" on public.pro_player_follows for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Delete own pro follows" on public.pro_player_follows for delete to authenticated using ((select auth.uid()) = user_id);
commit;
