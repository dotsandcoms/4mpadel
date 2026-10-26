-- Rollback-only: does not contact RankedIn or consume provider quota.
begin;
set local role service_role;
delete from public.rankedin_draw_refresh_budget;
do $$ declare i integer; begin
  if not public.claim_rankedin_draw_refresh('https://api.rankedin.com/v1/tournament/GetClassesAndDrawNamesAsync/?tournamentId=991000') then raise exception 'First refresh must succeed'; end if;
  if public.claim_rankedin_draw_refresh('https://api.rankedin.com/v1/tournament/GetClassesAndDrawNamesAsync/?tournamentId=991000') then raise exception 'Duplicate refresh must be blocked'; end if;
  for i in 991001..991029 loop
    if not public.claim_rankedin_draw_refresh('https://api.rankedin.com/v1/tournament/GetClassesAndDrawNamesAsync/?tournamentId='||i) then raise exception 'Within budget denied'; end if;
  end loop;
  if public.claim_rankedin_draw_refresh('https://api.rankedin.com/v1/tournament/GetClassesAndDrawNamesAsync/?tournamentId=991030') then raise exception 'Minute cap must hold'; end if;
  if public.claim_rankedin_draw_refresh('https://evil.example/private') then raise exception 'Arbitrary URL must be denied'; end if;
end $$;
rollback;
