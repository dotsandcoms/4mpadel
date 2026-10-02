-- Snapshot the provider details selected by the player. Pending claims are
-- labelled unverified; these fields do not replace editable 4M information.
alter table public.player_fip_links
  add column fip_points integer check (fip_points >= 0),
  add column fip_nationality text,
  add column fip_photo_url text check (fip_photo_url is null or fip_photo_url ~ '^https://'),
  add column fip_hand text,
  add column fip_side text;

grant select (fip_points, fip_nationality, fip_photo_url, fip_hand, fip_side)
  on public.player_fip_links to anon, authenticated;
grant insert (fip_points, fip_nationality, fip_photo_url, fip_hand, fip_side)
  on public.player_fip_links to authenticated;
