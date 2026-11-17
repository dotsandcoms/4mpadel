# Internal iPhone test release — 16 November 2026

**Superseded:** Build 46 omitted mobile changes that were still uncommitted in the shared working copy. Use the replacement release documented in `internal-ios-replacement-2026-11-16.md`.

Version **1.0.2 / build 46** is finished and verified for direct installation on the existing Brad and Mark test iPhones:

https://expo.dev/accounts/fourm-padel/projects/4m-padel/builds/db2eea09-1359-45fc-8b03-f6e48ed49e28

This uses the existing `preview` internal-distribution profile. It has not been submitted to TestFlight, App Review or the App Store.

## Source and scope

Built from the reviewed, pushed app commit `7e82ce30eba1f5f21a57bf27bb85dd7e25081e79`. The mobile-only archive contains 739 files / 10,829,359 bytes, matches that commit exactly, and excludes local environment files, signing credentials, generated builds, data exports and unrelated working edits. Existing Firebase client configuration and the native companion sources are included deliberately.

Changes include direct Edit profile reminders, verified sign-in email changes, complete profile editing, dismissible Home actions, knockout bracket view, Finals-first Results, compact team photos/names, randomised player Discovery, club claims, verification tags and smaller adjacent approval/group badges. Messages and Help permit screenshots and screen recording; iOS retains the separate app-switcher cover and inactive message content remains masked.

Player messaging still uses normal authenticated sign-in. Staff admin messaging and Help access retain MFA. Admin changes are already live from `main` commit `35dba851f5544d4107079bad88581e735f2180b4`.

## Verification

- TypeScript and all 786 app tests passed on the exact scoped source.
- EAS compiled and signed the iPhone, widget, Watch and Watch-widget targets successfully.
- IPA ZIP integrity and strict deep code-signature verification passed.
- All four targets are version 1.0.2 / build 46 on Apple team `52RX6X5X2T`.
- All four provisioning profiles include both existing test iPhones, remain valid through 28 September 2027, and disable debugging. The host retains production push entitlement.
- Expo Doctor reported one non-blocking version check: newer SDK 57 patch versions are available for 19 packages. This build retains the tested dependency lock; native compilation and installer verification passed.

Installer: `/private/tmp/fourm-iphone-1.0.2-46.ipa`.

SHA-256: `15e5187e2c398ebf70f9c444f2da0f2a08f112842c5da426432c715bea8d0213`.

Source, build and verification receipts are in `outputs/iphone-internal-20261116`. Physical-device and paired-Watch testing remain for the user and partner. Keep build 45 available during testing.
