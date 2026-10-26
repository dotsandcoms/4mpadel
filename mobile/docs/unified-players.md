# Unified native Players section

Implemented 29 September 2026. No EAS build was started for this change.

## Experience

The Players bottom tab replaces the Rankings label while retaining the existing route. Players and Pro Padel drawer/deep links lead into the hub. Discover, Following, Rankings and Tour share one destination.

Discover supports All players / 4M / Pro and All / Men / Women filters. Featured local cards show the top 20 available approved 4M profiles for the selected gender, ordered by the official SAPA national standings. Profile age-group rank labels are not used. All shows separate men's and women's local rails. Blue identifies local cards; green identifies professionals. A missing/unmatched public profile is not fabricated, so national rank numbers can have gaps.

Search covers all approved local profiles and the provider's paginated pro directory, beyond the former top-50 snapshot. Pro search requires sign-in. Search is debounced and supports loading further pages. Results, profiles and follow controls remain native. Provider coverage determines which professionals and profile details are available.

Following combines local and professional favourites with namespaced identities. Existing professional follows remain intact. Local profiles have their own Follow control, and local ranking details link to the native player profile. The existing local ranking table and filters remain under Rankings → 4M; Pro has a separate gender-filtered list. Tour retains published professional results and fixtures.

## Backend

Applied `supabase/migrations/20260929090000_local_player_follows.sql` to the linked project. Own-account read/insert/delete policies protect local follows; insert requires an approved public player. Notification delivery is unchanged.

Deployed `supabase/functions/player-search/index.ts`. The function validates the signed-in account, validates search inputs, uses a fixed upstream origin and keeps the provider credential server-side. It uses bounded per-instance caching, a request gate, timeout and friendly provider-limit errors. The provider's API quota still applies; cache/rate limiting is per function instance, not a global quota coordinator.

## Verification

- `npm run check` passed including five player-hub tests.
- Subsequent profile navigation/layout edits passed `npm run typecheck`.
- Database tests verified owner read/write, other-account read/insert/delete denial, then rolled the test transaction back.
- Simulator showed correct men's and women's national ranks, royal-blue player cards and the Players bottom tab.
- Live native search returned Alonso Villavicencio, outside the previous top-50 snapshot.
- Existing production follow preferences were not modified during database verification.

Physical-device installation remains a separate next build. This change does not alter the Bradley-only push test restriction.

## Profile follower counts — 20 October 2026

Approved local player profiles and the account's own Profile header show the follower total beneath the player's name, using the existing light-theme typography. Zero and singular counts display as `0 followers` and `1 follower`. Counts refresh on focus, pull-to-refresh and successful follow/unfollow actions. Failed or superseded reads never become a false zero or another player's count.

Applied `20261020091314_player_follower_counts.sql` to the linked 4M project. The public `get_player_follower_count` RPC uses invoker rights and reads an intentionally owner-rights aggregate in the unexposed `profile_social` schema. It returns only a total for approved players, including to guests. Follow identities retain their existing owner-only RLS; the aggregate view contains only player IDs and counts. A player-ID index supports the lookup.

Validation: player-hub, public-player, profile-login and photo regression tests passed, as did TypeScript. `tests/player-followers.sql` passed against the linked backend and rolled back all fixtures. It checks multiple followers, guest totals, zero counts, hidden profiles, owner-only follow reads and immediate count changes after following/unfollowing. No new security-advisor findings were introduced. The profile display requires the next app build.

### Your follower list

The follower count on the account's own Profile is a button. It opens `/followers`
with profile photos, player names and optional home clubs. Tapping a row opens the
existing `/players/[id]` profile; Back returns to the list. Missing photos use
initials. The list supports refresh, paging, retry and zero-follower states on iOS
and Android. Public profile totals remain text and do not expose another player's
private follower list.

`get_my_player_followers` verifies the signed-in account owns the requested player
using the authoritative Auth record. Its invoker wrapper calls a helper in the
unexposed `profile_social` schema. It returns only approved public profile IDs,
names, photos and clubs; no emails or Auth IDs. Existing follow-table RLS remains
unchanged. Followers without public profiles remain counted, with an explanation
when the visible list is shorter than the total. Signing out or changing accounts
clears loaded names and invalidates pending reads.

Applied migration `20261021091413_player_follower_lists.sql` to the linked backend.
`tests/player-follower-lists.sql` passed in a disposable local PostgreSQL database;
its fixtures never ran against production. New client tests cover pagination,
errors, session changes, stale responses, photo fallback and profile navigation.
The native app feature requires the updated app; store releases remain on hold.
