# Pro Padel readiness — 17 September 2026

## Verified locally

- 37 Pro Padel/provider tests passed: normalization, ranking order, fixture pagination, comparisons, journeys, public routes, canonical URLs and share HTML/PNG rendering.
- Targeted Pro Padel lint passed; production build passed.
- Public media audit: all 99 supplied portrait URLs returned HTTP 200; no identical photo files across players. Juan Ignacio De Pascual has no supplied portrait and uses the existing initials fallback. This confirms file availability, not independent identity verification of every portrait.
- Mobile rankings checked at 390px: page 2 shows players 21–40, with legible rows and working navigation.
- Women’s rankings and player profile open correctly. Following while signed out opens the sign-in form.
- Followed-player hearts use the account’s confirmed follow state on hero cards and ranking rows. Isolated UI check verified that the indicator appears/disappears when its follow state changes. Signed-out rankings show no hearts.
- Player/match navigation, closing and direct-link reload were verified during the match-details implementation. Share PNGs were rendered and inspected locally.

## Still required before launch

- Verify authenticated follow/unfollow persistence and heart updates in a signed-in browser session. The current test session is signed out; no account follows were changed during this pass.
- Deploy the website and Vercel functions/rewrites, then check actual WhatsApp/iMessage previews against the public domain. Localhost previews cannot be fetched externally. Confirm bundled fonts/native Sharp support in the deployed function.
- Supabase refresh function, Vault credentials, and three daily cron jobs were configured on 17 September 2026. See `pro-padel-cron.md` for verification and operations.
- Provider draw coverage is pending for the next event; do not present unpublished fixtures as confirmed appearances or claim live scoring.

Original Pro Padel styling is retained. No production deployment was performed.
