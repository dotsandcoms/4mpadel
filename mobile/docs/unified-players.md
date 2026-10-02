# Unified native Players section

Implemented 29 September 2026. No EAS build was started for this change.

## Experience

The Players bottom tab replaces the Rankings label while retaining the existing route. Players and Pro Padel drawer/deep links lead into the hub. Discover, Following, Rankings and Tour share one destination.

Discover supports All players / 4M / Pro and All / Men / Women filters. Featured local cards show the top 20 available approved 4M profiles for the selected gender, ordered by the official SAPA national standings. Profile age-group rank labels are not used. All shows separate men's and women's local rails. Blue identifies local cards; green identifies professionals. A missing/unmatched public profile is not fabricated, so national rank numbers can have gaps.

Search covers all approved local profiles and the provider's paginated pro directory, beyond the former top-50 snapshot. Pro search requires sign-in. Search is debounced and supports loading further pages. Results, profiles and follow controls remain native. Provider coverage determines which professionals and profile details are available.

Following combines local and professional favourites with namespaced identities. Existing professional follows remain intact. Local profiles have their own Follow control, and local ranking details link to the native player profile. The existing local ranking table and filters remain under Rankings → 4M; Pro has a separate gender-filtered list. Tour retains published professional results and fixtures.

## Backend

Applied `supabase/migrations/20260929090000_local_player_follows.sql` to the linked project. Own-account read/insert/delete policies protect local follows; insert requires an approved public player. No public follower counts or notification delivery changes were introduced.

Deployed `supabase/functions/player-search/index.ts`. The function validates the signed-in account, validates search inputs, uses a fixed upstream origin and keeps the provider credential server-side. It uses bounded per-instance caching, a request gate, timeout and friendly provider-limit errors. The provider's API quota still applies; cache/rate limiting is per function instance, not a global quota coordinator.

## Verification

- `npm run check` passed including five player-hub tests.
- Subsequent profile navigation/layout edits passed `npm run typecheck`.
- Database tests verified owner read/write, other-account read/insert/delete denial, then rolled the test transaction back.
- Simulator showed correct men's and women's national ranks, royal-blue player cards and the Players bottom tab.
- Live native search returned Alonso Villavicencio, outside the previous top-50 snapshot.
- Existing production follow preferences were not modified during database verification.

Physical-device installation remains a separate next build. This change does not alter the Bradley-only push test restriction.
