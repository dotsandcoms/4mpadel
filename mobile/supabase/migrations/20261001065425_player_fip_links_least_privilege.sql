-- Supabase's public-schema default privileges grant broad table access.
-- Limit this claim table to the columns and operations used by the app.
revoke all on public.player_fip_links from public, anon, authenticated;
grant select (local_player_id, fip_player_id, fip_player_name, fip_category, fip_rank, status)
  on public.player_fip_links to anon, authenticated;
grant insert (local_player_id, fip_player_id, fip_player_name, fip_category, fip_rank, status)
  on public.player_fip_links to authenticated;
grant delete on public.player_fip_links to authenticated;
