# Internal iPhone test release — 11 November 2026

The user lifted the mobile build hold and requested a phone build plus a link
for their partner. They selected Expo direct installation before any TestFlight
submission. Use the existing `preview` profile with internal distribution.

## Preflight

- `npm run check`: TypeScript and all 719 tests across 68 runners passed.
- `git diff --check`: passed.
- Inspected the mobile-only source archive: 674 files, approximately 13 MB;
  no local environment files, signing keys, provisioning profiles or data exports.
- The original repository-root archive included an unrelated archived data export.
  It was not uploaded. Scope EAS explicitly to the mobile directory, as below.
- Development-only message request preview is gated by `__DEV__`. It does not
  create requests or alter production inbox counts.
- Remote EAS environment is `preview`; the build loads the existing Supabase
  and Google sign-in public configuration. No secret values are written here.

## Signing and upload

Reuse Apple team `52RX6X5X2T` (DIGI HIVE (PTY) LTD), app identifier
`com.fourmpadel.app`, and its three existing widget/watch targets. The user
explicitly approved the previously used Apple account and trusted phone for
two-factor sign-in. Do not record authentication codes or passwords.

Both registered iPhones (Brad and Mark) are included. Any other iPhone must be
registered and included in the ad hoc provisioning profiles before installation.

The automatic signing refresh consumed build number 40, then stopped before
upload because extension targets lacked their own App Store Connect API key.
The interactive retry uses build number 41 and the existing validated profiles.

Run from the mobile directory:

```sh
EAS_NO_VCS=1 EAS_PROJECT_ROOT="$PWD" eas build --platform ios --profile preview --no-wait
```

The explicit project root ensures only mobile source is uploaded and makes the
mobile `.easignore` effective. This includes the current tested working tree;
it does not depend on committing unrelated website changes.

Build 41 was uploaded successfully as EAS build
`2021ad74-04fc-4c8b-b552-ec1861dce78f`:
https://expo.dev/accounts/fourm-padel/projects/4m-padel/builds/2021ad74-04fc-4c8b-b552-ec1861dce78f

All four signing profiles were validated as active, on the expected Apple team,
and include both registered iPhones. Build 41 completed native compilation, but
final inspection found the host stamped as build 41 and extensions as build 1.
Do not distribute that artifact. The Xcode log also reported the version mismatch.

`app.config.js` now passes EAS's assigned iOS build number into prebuild so the
Apple targets receive the same version. The build environment guard rejects a
missing iOS version before compilation. An isolated prebuild verified the host
plist and all three target configurations resolve to build 42; local numbering,
bundle identifiers and entitlements remain unchanged.

Corrected build 42 completed successfully as EAS build
`ddd213f5-0be1-4ce2-9372-a71ea50c2730`:
https://expo.dev/accounts/fourm-padel/projects/4m-padel/builds/ddd213f5-0be1-4ce2-9372-a71ea50c2730

Final artifact verification passed: ZIP integrity, deep code-signature verification,
expected Apple team, both registered iPhones in all four profiles, production push
entitlement and disabled debugging. All four targets are version 1.0.2 / build 42.
Completed at 09:58:06 SAST on 11 November 2026. The corrected source also passed
TypeScript and all 719 tests again; `git diff --check` passed.

IPA SHA-256: `8f2517b07b9817e9595c8ed3018503b039459afd2f920e12a87ea1570744b553`.
The local verification receipt is `/tmp/fourm-iphone-build-42-verification.json`.
Phone installation and live testing remain for the user and partner to perform.

No TestFlight submission or App Store release was run. Remote Expo Doctor reported one advisory
check for newer SDK 57 patch packages (20/21 checks passed); versions are locked,
and dependencies were not upgraded during this test release.

## Backend compatibility

The compatible security protections are already deployed. The final privacy
API/raw-table cutover remains disabled for coordinated client testing. This test
build does not activate that draft or represent full security-audit closure.
See `permissions-audit-2026-11-10.md` for the remaining work.

## Phone checks

Test signed-in Home, calendar and player discovery; registration/quote/payment
return and receipts; direct/group requests and replies; event announcement and
discussion access; unread counts clearing; foreground banners and push taps.
Use the private pilot for notification tests. Verify successful payment only
from the server's verified status, never from the return URL alone.

Keep the existing tested app available if a blocking regression appears. Do not
enable the deferred database cutover as part of distributing this test binary.
