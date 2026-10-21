# Firebase Analytics

Android and iOS use native Firebase Analytics through React Native Firebase 27.
Both streams belong to Firebase project `m-padel-e3fec` and Google Analytics
property `556169328` (account `44527830`).

[Open the shared Analytics dashboard](https://analytics.google.com/analytics/web/#/a44527830p556169328/reports/intelligenthome).

| App | Package / bundle | Stream ID |
| --- | --- | --- |
| Android | `com.fourmpadel.app` | `15856788864` |
| iOS | `com.fourmpadel.app` | `16171498661` |

Use the built-in app version, operating system, device, country, acquisition,
active users, engagement and retention reports. Filter by platform to compare
Android and iOS. The app also sets `build_number`, `app_environment`
(`simulator`, `development`, `production`) and `signed_in` user properties.
These three user properties are registered as user-scoped custom dimensions in
GA4. Payment state, payment category and content category are also registered
as event-scoped dimensions. Feature, action, selection, registration flow,
registration step and checkout status are registered too, for twelve custom
dimensions in total. Public content IDs remain available in event exports;
they are not registered as a high-cardinality reporting dimension.

## Events

Firebase collects first opens, sessions, engagement and app updates automatically.
Expo Router reports readable `screen_view` names through `useSegments`; raw
route values, deep-link query strings and password-reset tokens are excluded.
Automatic native screen reporting is disabled to avoid duplicate Activity or
view-controller screens.

| Event | Successful action / safe parameters |
| --- | --- |
| `login`, `sign_up` | Successful authentication; `method` password, Google or Apple |
| `logout` | Successful sign-out |
| `tutorial_complete` | Onboarding completion stored locally |
| `profile_completed`, `profile_updated` | Profile saved; update includes `photo_changed` |
| `schedule_change` | Event added to or removed from schedule; `enabled` |
| `player_follow` | Local/pro player followed or unfollowed; `enabled`, `content_type` |
| `match_bookmark` | Match saved/removed or reminder changed; `enabled`, `notify` |
| `notification_permission` | System permission response; `permission` |
| `notification_open` | A recognised notification is opened; no payload or deep-link parameters |
| `search_performed` | Settled event, player, ranking or album search; result count and query length, without search text |
| `share` | Native share reports the shared action; category and `method=native` |
| `support_opened` | Support email composer opened; no subject, message or contact details |
| `begin_checkout` | Valid checkout returned by the backend; category, ZAR amount |
| `registration_complete` | Registration flow completed; paid/pending state and item count |
| `payment_confirmed` | Backend confirmed a payment; category |
| `purchase` | Confirmed payment with a locally recorded server quote; ZAR value and item |
| `content_view` | Loaded event, international match/tournament, album or FIP document; public numeric event/match/tournament ID where available |
| `feature_interaction` | Event tabs, calendar/player/ranking/live-match filters, match analysis tabs, media photo/video and event directions |
| `registration_step` | Registration/pay-existing-entry step, flow and item count |
| `checkout_exit` | Explicit Back out of an incomplete entry flow; step and flow |
| `checkout_outcome` | Browser opened/returned or backend payment check remains unconfirmed; category and status |
| `action_error` | Failed authentication, registration, licence or balance action; feature only, without error messages |
| `notification_preference` | Successfully saved notification toggle; known preference and enabled state |
| `notification_timing_changed` | Successfully saved timing field name, without hours/time zone |

Search events wait 1.2 seconds for a stable query and loaded results; result
refreshes do not recount the same query. Event popularity uses public numeric
content IDs, such as `event:123`, which can be joined to the published event
catalogue. It never uses private account or registration IDs.

Payment categories are event registration, entry balance, full SAPA licence and
temporary SAPA licence. Opening/returning from Paystack never implies payment
success. A bounded local ledger hashes payment references and suppresses repeat
confirmations across app restarts. Older checkouts without a stored amount emit
only `payment_confirmed`; historical revenue is not invented. This is client
analytics, so offline termination, reinstallations and refunds are not reconciled
against a financial ledger.

The GA4 `purchase` event is a built-in revenue/key event. Additional key
events `sign_up`, `profile_completed` and `registration_complete` are configured
for both streams, counted once per event without an invented monetary value. Treat the
last one as registration completion, which can include a pending payment.

## Using the reports

| Question | Report / event journey |
| --- | --- |
| Are people returning? | Retention, active users, sessions and engagement; compare Android/iOS and app version |
| Does onboarding work? | `first_open` → `tutorial_complete` → `sign_up` → `profile_completed` |
| Which events attract interest? | `content_view` by public event ID, event-details tabs, calendar filters and search result counts |
| Where do entries lose users? | `registration_step` 1–4 → `begin_checkout` → `registration_complete` / `purchase`; inspect `checkout_exit` and `action_error` |
| Which payments convert? | Purchases/revenue by payment category; compare checkout starts and unconfirmed checks |
| What keeps users engaged? | Screen engagement, player follows, saved matches, Following filters, live-match tabs, albums/photos/videos and shares |
| Are notifications useful? | Permission responses, saved preferences and `notification_open`, then subsequent screen engagement/conversion |
| Is a new release worse? | Compare version/build, platform and production environment for errors and funnel completion |

Use GA4 Explore for step funnels and retention cohorts. A missing purchase or
explicit exit is not proof of abandonment: the client can close, lose connection
or confirm payment later. Compare funnels over a consistent observation window.
Debug-mode events validate delivery; they do not supply normal production-report
history. Standard reporting/custom definitions may take time to process after
release, and this integration does not backfill old app usage.

## Data handling

The event wrapper accepts a fixed set of categories, booleans and counts.
It does not send names, emails, phone numbers, profile text, search text, raw
account IDs, raw payment references, support messages or notification payloads.
Signed-in users have a deterministic SHA-256 pseudonymous ID for cross-platform
analysis; this is pseudonymous data, not anonymous data. Sign-out clears that ID.
Successful account deletion resets the device's Analytics data and local ledger;
it does not claim to delete historical data already retained by Google.

Analytics storage is enabled. Advertising storage, ad personalisation and ad-user
data are denied. IDFA, IDFV, Android advertising ID and SSAID collection are
disabled; the Android AD_ID permission is blocked. There is no advertising
integration or App Tracking Transparency prompt. The current app does not expose
an analytics opt-out control. Store privacy/data-safety declarations must describe
the analytics actually shipped when this held release is published.

SDK/network failures are caught outside business logic. They cannot turn a
successful payment, save, login or navigation into an app error. Web builds use a
no-op adapter; this setup covers the two native apps. Expo Observe continues to
handle existing app performance/error monitoring, and Expo Insights still records
Expo launch usage.

## Build and verify

- Use Node 24.12 or later (EAS pins 24.22.0) and JDK 17 for local Android builds.
- Keep both Firebase client configuration files in the build source:
  `google-services.json` and `GoogleService-Info.plist`. These are client app
  identifiers, not Firebase Admin/service-account credentials. Build validation
  checks their project and bundle/package against app.json without printing keys.
- Native modules require a rebuilt development/Release binary. They cannot be
  delivered to existing installations with a JavaScript-only update.
- iOS uses the React Native Firebase 27 SPM integration and dynamic frameworks.
  Keep the Expo config plugins and `firebase.json` when regenerating native files.
- Run `npm run check` to typecheck and execute the existing app checks plus the
  privacy, SDK failure and payment-deduplication tests.
- Android DebugView: `adb shell setprop debug.firebase.analytics.app com.fourmpadel.app`.
  Disable afterwards with `adb shell setprop debug.firebase.analytics.app .none.`.
- iOS DebugView: launch with `-FIRAnalyticsDebugEnabled`; relaunch with
  `-FIRAnalyticsDebugDisabled` to turn it off. These are local launch flags, not release
  configuration.
- In Firebase Analytics DebugView, verify `screen_view` and engagement for each
  stream. Use mocked tests for purchase behavior; do not make production charges
  merely to generate test analytics.

No store upload or submission is authorised until the user finishes both
simulator walkthroughs.

References: [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/),
[Expo Firebase guide](https://docs.expo.dev/guides/using-firebase/),
[React Native Firebase](https://rnfirebase.io/),
[Analytics](https://rnfirebase.io/analytics/usage),
[Screen tracking](https://rnfirebase.io/analytics/screen-tracking).
