alter table public.players
  add column if not exists court_side text,
  add column if not exists playing_hand text;

alter table public.players
  add constraint players_court_side_check
    check (court_side is null or court_side in ('left', 'right', 'either')),
  add constraint players_playing_hand_check
    check (playing_hand is null or playing_hand in ('left', 'right'));

-- Keep the existing approved-player public projection and append only the
-- preferences players choose to share on their profile.
create or replace view public.players_public as
select
  id, name, rank_label, points, win_rate, image_url, created_at, home_club,
  age_group, nationality, category, level, bio, sponsors, gender, approved,
  skill_rating, age, match_form, rankings, rankedin_profile_url, rankedin_id,
  instagram_link, license_type, preferred_ranking, active_ranking_label,
  region, racket_brand, additional_images, club_id, account_type,
  court_side, playing_hand
from public.players
where approved = true;

grant select on public.players_public to anon, authenticated;
