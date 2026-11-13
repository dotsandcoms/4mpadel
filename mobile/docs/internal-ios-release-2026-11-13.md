# Internal iPhone test release — 13 November 2026

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
