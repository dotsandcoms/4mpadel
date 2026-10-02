-- Public player cards need link/ranking fields, never the requesting user's ID.
revoke select on public.player_fip_links from anon, authenticated;
grant select (local_player_id, fip_player_id, fip_player_name, fip_category, fip_rank, status)
  on public.player_fip_links to anon, authenticated;
