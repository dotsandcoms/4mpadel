# Phase 1 — September 2026

Primary outcome: download the app, sign in, discover a tournament and complete registration.
Target: ready by 30 September 2026. Store review timing is external to this implementation.

## Release priorities

1. Verify iOS and Android sign-in, account/profile creation and returning sessions.
2. Verify calendar → event → division/partner → registration → payment → confirmed entry.
   Confirm deployment of `native-event-checkout`; the earlier README records it as pending.
   Cover cancelled checkout, payment pending, expired entries and required licences.
3. Verify schedule and pending actions reflect the same account/entries as the website.
4. Ship the native Pro Padel Home feed as the return-visit feature.
5. Keep the Apple companion small: next personal match/event, when/where, entry status,
   last updated and an honest empty/offline state. Registration/payment remain on the phone.

Native directories, coaching bookings, social match creation, full FIP coverage and a
general editorial news system are subsequent phases unless required for registration.

## Pro Padel Home feed — implemented 18 September

- Native React Native UI for iOS and Android; no embedded website.
- For you / Tour, men/women filters, portrait cards, searchable professional-player list,
  native player detail modal, follow/unfollow, ranking movement, results and published fixtures.
- Reuses the website's public Supabase `pro-padel` snapshots and `pro_player_follows` table.
- Phone follows use the signed-in Supabase account and existing RLS policies.
- Home pull-to-refresh and foreground/focus refresh update snapshots and follows.
- Last successful in-memory data remains visible if refresh fails; each source has retry
  and data older than 48 hours is labelled. No persistent offline feed in this phase.
- Ranking coverage is 50 men / 50 women. Results are quarter-finals onward from the two
  latest completed Premier Padel events; upcoming coverage is the next published main draw.
- Does not claim live scoring, news/article coverage or match push alerts.

Design reference lock: existing native 4M Home and `theme/tokens.ts` own the dark canvas,
type and lime accent; website Pro Padel owns portrait roles, scorecard information,
follow flow and coverage labels. Native 44pt controls, virtualized player browsing,
safe-area-aware modals and readable missing/error states follow Refero craft guidance.

Validation: TypeScript and 26 tests passed; iOS and Android production JS/Hermes exports
passed. Public live snapshots checked read-only: 18 September updates, 100 players,
28 results and Rotterdam's unpublished draw. Home's new feed rendered on the iPhone
17 Pro / iOS 26.5 simulator. Signed-in follow persistence and Android interaction checks
remain outstanding; bundle exports do not establish device correctness. Device Hub was
opened, but native UI automation was blocked by a locked Mac and then timed out.

## Apple companion scope

User selected both, starting with Apple Watch. Implemented separate native watchOS app,
Watch Smart Stack widget and iPhone widgets. The Watch shows the next personal match/event
and a short agenda, timestamped phone sync and distinct saved/registered/payment states.
Registration and checkout remain on the phone. See `apple-companion.md` for sync limits.
Native iPhone and Watch builds passed. The Watch empty state rendered in the simulator;
signed-in populated schedule delivery and widget interaction remain release checks.

## Verification before release

Calendar now includes a South Africa / Pro Tour switch, with South Africa as the default.
Pro Tour uses existing public Premier Padel snapshots, with tournament/location search,
level filters, upcoming/past lists and native tournament details with available fixtures
and results. Home's Pro Padel feed links to this calendar. This is not the full FIP
calendar; international tournament registration is not offered. The Rotterdam detail
screen was visually verified on the iPhone simulator with its unpublished-draw state.

- Signed-in follow/unfollow persistence across app refresh and website; account isolation.
- iOS device/simulator and Android device/emulator interaction checks.
- Payment confirmation and pending recovery against the intended gateway environment.
- Build signing, distribution, store metadata and submission readiness.
- Apple companion signed-in data sync, widgets and physical-device checks.

## Native calendar export

Pro Tour details and South African event details now use the OS event composer via
`expo-calendar/legacy` (supported SDK 57 entry point). Dates and venue are prefilled;
the user picks a calendar and saves. These are all-day tournament entries, with an
exclusive end date so the last day is included. Android uses UTC all-day boundaries;
iOS uses local date boundaries. This creates a calendar copy, not a live subscription.
No calendar permission is requested on iOS 17+ or Android for the composer; older iOS
requests calendar permission. Cancellation is not reported as a successful save.
Physical-device save/cancel and calendar-account checks remain release validation.

## Existing-entry payment

`mode=pay` opens server-priced review directly from Pay Entry, Pay Now and Home's
Complete payment action. The endpoint derives unpaid divisions from authenticated
registrations, restores partner details per division, and optionally includes existing
partners' unpaid fees. Payment-only metadata has no registration upserts or partner
link changes; the shared payment finalizer updates existing entries using `covers`.
Already-paid, withdrawn, missing and other-account entries cannot become new entries
through this flow. Existing licence requirements still need to be met before checkout.

Deployed `native-event-checkout` to the app's configured 4M backend on 18 September.
Verified adidas payment review on the signed-in iPhone: Men's Open, R800 outstanding.
No checkout transaction, payment, registration mutation or email was triggered by this
verification. Gateway completion and Android interaction remain device release checks.
