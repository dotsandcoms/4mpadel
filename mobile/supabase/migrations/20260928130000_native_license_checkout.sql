-- Server-owned quotes and gateway references for native annual licence purchases.
create table if not exists public.native_license_checkouts (
  reference text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  player_id bigint not null references public.players(id),
  amount numeric(12,2) not null check (amount > 0),
  pricing jsonb not null,
  authorization_url text,
  created_at timestamptz not null default now()
);
alter table public.native_license_checkouts enable row level security;
revoke all on public.native_license_checkouts from anon, authenticated;
grant all on public.native_license_checkouts to service_role;
