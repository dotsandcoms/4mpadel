# Internal iPhone test release — 13 November 2026

Build 45 is the latest verified release for partner testing. Build 44 fixed the shared Messages refresh regression; build 45 adds the requested blue onboarding/account palette. See `messaging-refresh-hotfix-2026-11-13.md` for the cause, fix and lifecycle regression coverage.

The user requested a fresh app build for partner testing after completing the Help and Admin changes. The existing direct-install workflow uses the EAS `preview` profile and Apple team `52RX6X5X2T`, including the two previously registered test iPhones. This is an internal build, not a TestFlight submission or App Store release.

## Verified source

- TypeScript and all 756 tests across 71 runners pass.
- The simulator Release build passes and is installed on iPhone 18 Pro.
- Simulator checks confirm Manage entry → Help opens the correct event, division, player and partner; the organiser destination is visible before sending.
- Resolved Help conversations show history and Reopen only. Admin has the same restriction; the server rejects new replies while resolved.
- Admin desktop actions measure 402 × 52 px each in the preview. Event titles and help types have distinct colours.
- The neon default is replaced by blue; existing SAPA tier colours remain event data colours.
- Widget and Watch changes from the current working tree are included.
- Web production compilation passes using an identical Git-tracked copy of the Calendar background asset, because macOS denies reading that asset at its original path. The temporary build configuration changes no tracked source.
- `git diff --check` passes.

The mobile-only source archive was inspected at `/private/tmp/fourm-partner-20261113-source`: 717 files, 13,712,007 bytes, no symlinks, local environment files, signing credentials, build artifacts or data exports. Native companion module source is intentionally included. The archive matches the latest Help, entry, theme, widget and Watch source.

## Backend and rollout

Help entry-context, resolved-request guards and the support-alert queue migration `20261113091431` are live, together with `deliver-help-alerts` version 1. Its authenticated non-sending readiness check passes. No real request, reply or email was created during verification. 4M email alerts go to the configured support inbox; remote push is not added by this change.

Admin website source and the labelled fictional preview are updated. The Admin website has not been published as part of this build request.

## Distribution

The user explicitly approved uploading mobile source to the existing fourm-padel Expo/EAS project after automatic approval review requested destination-specific confirmation. The approved upload succeeded. Version 1.0.2 / build 43 is running as EAS build `4bb4154c-7b9b-4f20-bc7d-213fcda8a65c`:

https://expo.dev/accounts/fourm-padel/projects/4m-padel/builds/4bb4154c-7b9b-4f20-bc7d-213fcda8a65c

Build 43 finished at 11:38:33 SAST. The IPA passes ZIP integrity and strict deep code-signature verification. All four targets are version 1.0.2 / build 43, on Apple team `52RX6X5X2T`, include both registered test iPhones, and disallow debugging. The host has the production push entitlement. SHA-256: `037cc594d9087f93a1b9ff86ef875aee08bbe1ff174d6e0db76c2d434c154cd1`.

The verified installer is `/private/tmp/fourm-iphone-1.0.2-43.ipa`; its local verification receipt is `/private/tmp/fourm-iphone-build-43-verification.json`. Share the EAS build link above and open it on either registered iPhone to install. Physical-phone and paired-Watch testing remain for the user and partner.

The source archive above was inspected before adding this release receipt; only release documentation changed before upload. App and Admin changes were committed and pushed to `brad/mobile-messaging` in commit `3174d95970311fd5c71f01b9875712b456d0e333`. Separate finance edits were left untouched.

Keep the previous verified internal build 42 available during partner testing. Do not activate the deferred raw-table/privacy API cutover. No destructive migrations or account resets are part of this release.

## Replacement build 44

EAS build `daee1f96-06df-473d-8de8-4764209dbc81` completed at 12:39:56 SAST from the reviewed source in commit `a295a5ef`:

https://expo.dev/accounts/fourm-padel/projects/4m-padel/builds/daee1f96-06df-473d-8de8-4764209dbc81

It includes the chat refresh fix, personal Help archives and the revised Android controls. TypeScript and all 762 mobile tests pass. Both local native Release builds pass. iPhone checks confirm a chat and draft stay stable for several minutes, and Help Archive → Archived → Move to inbox works against the live backend; the test archive was restored. No test message was sent. The user chose to visually review Android; the new APK is installed and launched without startup errors.

The mobile-only source audit covers 725 files / 13,758,653 bytes with no local environment files, signing credentials or data exports. Source matching checks cover the exact provider fix, Help options, Android controls and dependency lock. Final release documentation was updated after upload.

Installer verification passes: intact ZIP, strict deep code signatures, Apple team `52RX6X5X2T`, all four targets at version 1.0.2 / build 44, both registered iPhones included, production push entitlement and debugging disabled. The IPA SHA-256 is `2e92208348af7d9b906bb4d05df5024e2088d45770c8607450790ca20c2b3614`. The local installer is `/private/tmp/fourm-iphone-1.0.2-44.ipa`; verification receipt: `/private/tmp/fourm-iphone-build-44-verification.json`.

The updated Android APK SHA-256 is `1a16ee1507128f480622c98e4affaebed22e8c120c05e41975e7b77363473cf9`; APK signature and 16 KB ZIP-alignment checks pass. It remains an emulator test APK signed with the existing Android Debug certificate.

Admin Help is now live on production deployment `dpl_3A4ztWfaXKUkNPxhZRKr3JkUkpbG`; its source and live bundle verification are recorded in `outputs/help-admin-release-20261113`. Personal Help archive migration `20261113101314` is also live.

## Blue onboarding — build 45

The user requested another Expo build after finding the neon onboarding button. The NativeWind `padel` alias still held `#CCFF00` independently of the JavaScript palette. It now matches the light blue brand fill (`#8DB9E0`). Primary onboarding, sign-in, profile setup, profile-save and password-reset controls use dark blue (`#27517B`) with white labels. Onboarding indicators, Expo primary colour and notification colour are also blue. The design guidance and a cross-configuration palette test prevent the old split from recurring.

Expo build `d84a37f9-1d84-4d5c-bc13-ee9af8c92a64` completed at 13:01:39 SAST from source commit `d1eb9aef`:

https://expo.dev/accounts/fourm-padel/projects/4m-padel/builds/d84a37f9-1d84-4d5c-bc13-ee9af8c92a64

TypeScript and all 763 tests pass; the compiled NativeWind CSS resolves the expected blue backgrounds and white text. Both local native builds pass. All five onboarding steps were checked in the iPhone simulator, including the blue final profile button. Preview screenshot: `/private/tmp/fourm-onboarding-blue-first.png`.

The inspected archive has 725 files / 13,762,244 bytes and excludes local environment files, signing credentials and data exports. Exact source checks cover onboarding, sign-in, profile setup, app metadata, NativeWind configuration and the messaging providers. The build retains the Messages fix, Help archive/restore and Android controls from build 44. Final release documentation was updated after upload.

The final IPA passes ZIP integrity and strict deep code-signature verification. All four targets are version 1.0.2 / build 45, signed by the expected Apple team, include both registered iPhones, have unexpired profiles and disallow debugging. The host retains its production push entitlement. SHA-256: `ade2ad07a375e75f2d77fc6c10571f4ecf3d524d155d34e6b626ada80a22358f`.

Verified installer: `/private/tmp/fourm-iphone-1.0.2-45.ipa`. Receipt: `/private/tmp/fourm-iphone-build-45-verification.json`. Share the build 45 link above for installation on either registered test phone. No TestFlight submission or App Store release was performed.

The Android APK was rebuilt with the same palette and targeted native colour-resource updates. SHA-256: `7bef48d2ac95a364ecc3eb71893b4475c248a3c6fc7010a034855e03c8366f05`. The emulator had been closed by the time installation was attempted, so this latest APK is ready at the recorded build-output path; its installation was not claimed. The earlier Android update remains documented separately.
