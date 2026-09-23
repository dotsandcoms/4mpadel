# Apple companion — Phase 1

Native SwiftUI Apple Watch app, WidgetKit Smart Stack/complications, and iPhone
Home Screen/Lock Screen widgets. These are separate native targets, not WebViews.
Android keeps the existing React Native app and safely skips Apple-only calls.

## What it shows

Watch visual reference: the existing native 4M event screen and bundled calendar hero
own the dark surfaces, padel photography and lime actions. Compact date tiles make
the agenda scannable; red marks payment pending, muted blue-grey marks saved events.
List titles are capped at three lines, with full event titles in the detail view.
Cards use each event's custom image, poster or image URL (in that order), synced from
the phone. Graphics fit without cropping poster text or sponsors. Shared 4M artwork
is the fallback for missing/loading/failed images. Remote graphics need connectivity.

- Next personal event/match with date, supplied start time, venue and court.
- Saved event / Registered / Entry paid / Payment pending are distinct states.
- Watch app has a remembered Matches / Events selector, the next few items in that
  category and a refresh-from-iPhone control. Events are saved/entered personal events.
- Event titles in the Watch agenda open a native event card with the synced title,
  date/time, city, venue and entry status. Venue links open Apple Maps. Detail cards
  respond to schedule changes/sign-out; registration and payment remain on iPhone.
- Watch venues use MKLocalSearch and native MKMapItem opening, not HTTPS Maps links
  (which watchOS rejects). Search failures remain in-app with retry guidance.
- The phone reserves snapshot space for up to ten matches and ten events so a busy
  match schedule cannot hide upcoming events.
- Last phone-sync time, stale-data warning after a day, signed-out and empty states.
- iPhone widgets open the event (or profile for RankedIn matches) in the phone app.
- Each widget can be configured to show Matches, Events, or Matches & events via
  Edit Widget → Show. Separate widget instances can use different choices. This also
  applies to Watch widgets; the Watch app's selector remains independent.
- Registration, licence purchase and payments remain on the phone.
- iPhone widgets show a date-based LIVE tag while an event is underway, and a native
  ticking countdown to registration opening/closing or a known start time. Timeline
  entries cover those boundaries and expiry. LIVE is scheduled event progress, not
  live scores. Date-only start times never get a fabricated countdown. WidgetKit
  controls refresh timing; arbitrary continuous badge animations are not used.

Date-only events say Time TBC. South African event/RankedIn local times are converted
using SAST rather than the device's timezone. Expired calendar days drop out of
WidgetKit timelines without requiring a phone refresh. Match end times are not
invented: a scheduled match remains until the end of its listed day or the next sync.

## Data and privacy

`src/lib/companion-schedule.ts` creates a bounded schedule-only snapshot. No auth token,
email, API key or payment reference is sent to the Watch or stored in the widget group.
The phone refreshes Home on focus/foreground and pull-to-refresh, then publishes the
snapshot through the local `FourMCompanion` Expo module. Failed schedule queries do not
replace the last snapshot with a successful-looking empty schedule.

The module writes the iPhone App Group and calls WidgetKit reload. WatchConnectivity's
`updateApplicationContext` sends the latest snapshot to the paired Watch; delivery is
opportunistic, not real-time. The watch app saves it to its own App Group for its widget.
The same group name does NOT share storage across devices: WatchConnectivity does that.
Refresh on Watch requests the last phone snapshot, not a new backend fetch. Open Home
on the phone to fetch a fresh schedule. There is no standalone watch login or backend
polling/background fetch in Phase 1.

Sign-out/account changes clear the phone snapshot and queue the cleared Watch state.
An offline Watch can retain its previous snapshot until the next delivery; the UI shows
the sync timestamp. Widget content is marked privacy-sensitive. Older in-flight Watch
snapshots are ignored. Native publishing verifies the current account to reject late
responses from a previous session.

## Source and generation

- `modules/four-m-companion/ios`: native phone bridge.
- `targets/watch`: SwiftUI watch app.
- `targets/watch-widget`: Watch widget entry point.
- `targets/widget`: iPhone widget entry point.
- `targets/_shared`: shared Codable schema and WidgetKit timeline/view.
- `@bacons/apple-targets`: generates targets outside the disposable `ios` directory.

```sh
npx expo prebuild --platform ios --no-install
pod install --project-directory=ios
```

Prebuild can regenerate the iOS folder. Keep source changes in targets/modules/app.json,
not only generated Xcode files. A pre-companion backup of the original native project
and app files was saved locally at `/tmp/4m-ios-before-companion.tgz` for this session.

Watch app/widget minimum: watchOS 10. iPhone widget minimum: iOS 17.
App Group: `group.com.fourmpadel.app.schedule`.
Bundle IDs: `com.fourmpadel.app.watchkitapp`, `.watchkitapp.nextup`, `.nextup`.

## Release work still required

Set the existing Apple Developer team in `ios.appleTeamId`; register/enable the App Group
and app/extension IDs for that team, and generate matching distribution profiles. No
developer-portal capabilities, credentials or App Store submission were changed here.
Use normal signing for simulator builds too; disabling signing breaks SecureStore.

Verify with a signed-in account and a paired physical Watch: refresh after entry/payment,
offline launch, account switch/sign-out delivery, expired entries, and widget navigation.
WidgetKit decides refresh timing. Neither widgets nor Watch guarantee instant changes.
