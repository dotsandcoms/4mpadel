# Android emulator testing — 13 November 2026

This records the initial emulator build earlier in the day. It was replaced with the Messages hotfix, personal Help archiving and revised Android controls. The updated APK is installed for the user's visual check; its SHA-256 is `1a16ee1507128f480622c98e4affaebed22e8c120c05e41975e7b77363473cf9`. See `messaging-refresh-hotfix-2026-11-13.md`, `android-controls-2026-11-13.md` and the replacement-build section in `internal-ios-release-2026-11-13.md`.

The latest app is installed and launched on the existing `Medium_Phone_API_35` ARM64 emulator (`emulator-5554`). Installation used `adb install -r`, preserving app data. The activity reports `Status: ok` and remains the resumed activity with a live app process; AndroidRuntime and ReactNativeJS startup error checks are empty. Interactive screen testing remains for the user: computer-use tooling could not attach to the standalone emulator window.

## Verified build

- Package: `com.fourmpadel.app`.
- App version: 1.0.2; local emulator version code: 1.
- Minimum SDK 24; compile and target SDK 36.
- Bundled release JavaScript, so Metro is not required to run this APK.
- Local Java 17 build passed: 1,018 Gradle tasks, 4 minutes 18 seconds.
- APK v2 signature verifies. This local APK uses the existing Android Debug certificate and is for emulator testing.
- All 26 ARM64 native libraries have at least 16 KB ELF segment alignment; APK ZIP alignment verification also passes.
- APK SHA-256: `0ea7c57fc504d5666ee6bda57c0f9497d91ced31d968a3fe849c8a5f03d1f0e0`.

APK: `mobile/android/app/build/outputs/apk/release/app-release.apk`. Native verification receipt: `/private/tmp/fourm-android-20261113-native-verification.json`. Build log: `/private/tmp/fourm-android-20261113-release-build.log`.

The generated Android project had an old 1.0.1 version label. Automatic approval review blocked running Prebuild because it could overwrite native customisations. A targeted update to the ignored local `android/app/build.gradle` version label preserved the existing project. The tracked Expo app configuration already specifies 1.0.2. No dependencies were upgraded and the iOS project was not regenerated.

## Before a Play Store release

The existing EAS `production` profile builds an Android App Bundle with automatic version increments. The remote EAS version-code baseline is 10; it must still be compared with the latest uploaded Play Console version before release. The production environment includes the required Android Maps key and public Supabase/Google sign-in configuration; only variable names were inspected.

The emulator APK above is not the Play Store upload artifact. After user testing, create a production AAB with the existing upload key and verify the final artifact. Confirm Maps and Google sign-in use the Play app-signing certificate fingerprints, which can differ from the local debug/upload certificates. Production Maps restrictions have not been inspected or changed.

Play Console release checks remain: signing/version history, app-access instructions, current privacy/Data safety disclosures (including Firebase analytics, messaging, photos and calendar use), store listing, and the selected testing track. No AAB upload, Play Console submission or production rollout was performed.

Useful emulator checks: sign-in; Home and FIP shortcuts; upcoming tournament search; event details/draws and Back navigation; Manage entry → Help context; Messages → Help unread replies and resolved history; chat deletion/block confirmation; photo/profile actions; Android back gestures, keyboard insets and notifications. Use the private pilot for message/notification tests. Do not infer payment success from a browser return.

References checked 13 November 2026: [Google Play target API policy](https://support.google.com/googleplay/android-developer/answer/11926878), [native 16 KB page-size checks](https://developer.android.com/guide/practices/page-sizes), and [Play App Signing/API fingerprints](https://support.google.com/googleplay/android-developer/answer/9842756).
