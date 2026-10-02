-- Some official FIP players are absent from PadelAPI's player directory.
-- Let an account attach an independently checked FIP profile URL while
-- leaving the link visibly unverified until identity review.
alter table public.player_fip_links
  alter column fip_player_id drop not null,
  add column fip_profile_url text
    check (fip_profile_url is null or fip_profile_url ~ '^https://www[.]padelfip[.]com/player/[a-z0-9-]+/$'),
  add constraint player_fip_links_has_source
    check (fip_player_id is not null or fip_profile_url is not null);

create unique index player_fip_links_verified_url
  on public.player_fip_links (fip_profile_url)
  where status = 'verified' and fip_profile_url is not null;

grant select (fip_profile_url) on public.player_fip_links to anon, authenticated;
grant insert (fip_profile_url) on public.player_fip_links to authenticated;
