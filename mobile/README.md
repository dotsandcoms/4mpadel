# 4M Padel native app

Expo SDK 57 / React Native for iOS and Android. The website in the parent folder
is the source for backend contracts, event rules, player data and brand styling.
Screens use native React Native components and Expo Router native tabs.

## Simulator

```sh
npm install
npm start
# In another terminal:
npm run ios
```

The development server uses localhost:8081. Keep it running while reviewing a
Debug build. "No script URL provided" means Metro is not reachable. Start Metro
and relaunch the app. Do not build with CODE_SIGNING_ALLOWED=NO: even the simulator
needs an ad-hoc signed binary for SecureStore keychain access. `expo run:ios` uses
the normal Xcode signing path.

## Android

```sh
npm run android
```

Use the Android Studio bundled JDK and set ANDROID_HOME to the installed SDK if
needed. The generated android/ and ios/ directories are intentionally ignored;
app.json is the source of truth. Re-run prebuild after changing native config.

## Physical phone

The app includes native Google sign-in and needs a native build, rather than Expo
Go. `npm run ios:device` installs on a connected iPhone (Apple development signing
required); `npm run android:device` installs on an Android device. For a Debug build,
the phone must be able to reach Metro. Local-network server access requires approval
in this Codex session. For Android over USB, adb reverse tcp:8081 tcp:8081 avoids a
LAN server. Internal builds can also use the `preview` EAS profile after linking
this app to the team's EAS project and setting up signing. A preview build embeds
JavaScript and does not require Metro.

## Environment

Copy .env.example to .env and provide the same public Supabase project settings as
the website, plus Google OAuth client IDs. Never put service-role or Paystack secret
keys in EXPO_PUBLIC variables. Existing .env files are not rewritten by this work.

## Event journey

- Calendar: upcoming/past/saved views, search, city and tier filters, refresh.
- Native event details: artwork, dates, organiser, divisions, early-bird fees,
  closing states, entries, contacts, directions and schedule saving.
- Native tournament entry form follows the website Profile → Division/Partner → Review & Pay flow: SAPA points/status, Playtomic level, RankedIn account question, per-division name/email partner search and payer choice, partner-payment acknowledgement, T-shirt sizes, access codes and server-calculated fees/licences.
- Review & Pay Back restores the preceding form step, including for existing unpaid entries; it does not dismiss registration. Playtomic level and RankedIn yes/no are wizard state, matching the website.
- Paystack uses hosted checkout; `confirm-manual-payment` verifies the reference
  server-side before the app reports success. Pending checkouts can be reopened.
- Existing registrations, payments and schedules use the website's tables/RLS.
- Native checkout requires the new `native-event-checkout` Edge Function to be
  deployed from this mobile/supabase folder. Deployed 18 September 2026, including payment-only review.
- Test gateway mode is used in Debug builds and restricted server-side to the
  website's platform administrator identities. Test registrations still touch the
  shared database. Do not complete checkout merely to preview a screen.

Existing website flows remain for RankedIn-managed registration, standalone licence purchase,
paid partner changes, and advanced registration management. Tournament checkout can bundle temporary/annual licences using published commerce settings. Multi-week batch entry remains website-only.
Sponsor name/logo controls follow event settings and support each player/partner; image uploads use the website’s profile-pics/tshirt-logos event folder and 2MB limit. The native Files picker supports preview, replacement and removal; checkout preserves these fields on the shared registration rows. Weekly entries currently apply
to the selected date; browse another date to enter additional weeks. Rankings and
Explore tabs remain outside this event-journey implementation.

## Pro Padel on Home

Home now includes a native Pro Padel feed for iOS and Android: For you/Tour views,
men/women filters, professional-player search and profiles, account-based follows,
ranking updates, recent scorecards and published upcoming fixtures. It reuses the
website's public `pro-padel` Storage snapshots and `pro_player_follows` RLS table;
no provider token belongs in the app. Pull to refresh updates the feed and follows.

Coverage is currently the top 50 men and women, quarter-finals onward from the two
latest completed Premier Padel events, and the next published main draw. This is
daily data, not live scoring. Failed refreshes retain the current in-memory snapshot
with retry; updates older than 48 hours are labelled. See docs/phase-one.md for scope.

Xcode 27 replaces the standalone Simulator UI with Device Hub, available under
Xcode → Open Developer Tool → Device Hub. Metro still runs on localhost:8081.

## Verification commands

```sh
npm run check
# Optional native bundle smoke checks:
npx expo export --platform ios --output-dir /tmp/4m-ios-export
npx expo export --platform android --output-dir /tmp/4m-android-export
```

Tests cover early-bird boundaries, registration closure, multi-day calendar filtering,
Supabase joins, published text rendering, checkout authentication, server-side prices,
price-change confirmation, test-mode restrictions and licence enforcement. Checkout
tests use mocks and never contact Paystack or write to Supabase.

See docs/mobile-build.md for source references and design decisions.
