-- A verified FIP link means its provider record was checked and its name
-- matched the 4M player. It does not establish account ownership of that record.
comment on column public.player_fip_links.status is
  'verified means the official FIP or PadelAPI record matched the 4M player name; it does not prove identity ownership.';

drop policy "Players can withdraw their pending request" on public.player_fip_links;
create policy "Players can unlink their own FIP record"
  on public.player_fip_links for delete to authenticated
  using (requested_by = (select auth.uid()));
