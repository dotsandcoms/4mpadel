# Complete mobile replacement — 16 November 2026

**Version 1.0.2 / internal iPhone build 47 is finished and verified.**

Install on Brad or Mark’s registered test iPhone: https://expo.dev/accounts/fourm-padel/projects/4m-padel/builds/c32b6be4-c58b-487c-a9b8-ce285a8030af

This release replaces build 46, whose committed-source snapshot omitted mobile changes still present in the shared working copy. The omission was in release preparation, not lost source. All morning mobile changes must be committed together on `brad/mobile-messaging` before preparing the replacement. The website's `main` release remains separate.

## Included mobile changes

- Event details: poster beside the title, SAPA/organisation/sponsor layout, and player-list PDF download after eligible SAPA registrations close. Includes the native Print/Sharing dependencies and config plugin.
- Event Activity: published SAPA per-player points notice, points sheet, completion/publication checks and refresh handling.
- Player profiles: current-season trophy shelf and shared trophy data with Results, preserving ranking/results identity.
- Following feed: meaningful ranking movements and threshold entries; stable shuffled feed ordering. Notification history and unread counts respect event completion and retention.
- Clubs: randomised browse order, Claim Club with the existing review process, verified approval ticks, applicable group/type/SAPA tags and compact adjacent approval/group badges.
- Home/profile: persistent completion reminders opening Edit profile directly, session-dismissible general action banner, complete editable profile, verified sign-in email changes, blue selection/focus and simplified labels.
- Draws/Results: List/Bracket option, small team photos and single-line names, Final-first Results while preserving bracket round order.
- Messages/Help: screenshots allowed, app-switcher protection retained, normal player sign-in, and staff MFA unchanged. All previously committed messaging, support, entry-management and Android-control work remains included.
- Follow controls: stable width across Loading, Follow, Following and Saving, with trailing ranking space reserved before profile/follow data arrives. SAPA and FIP use the same control.

The three previously uncommitted mobile migrations for Following rankings, notification retention and published event points are already applied to the shared hosted database. Their exact version entries were verified read-only; they must not be replayed.

## Release source gate

1. Inspect all mobile changes, including untracked files, and all mobile commits since the morning baseline. Check the active worktrees for additional mobile edits.
2. Commit every intended mobile source/dependency/test/migration change. Do not build from a partial staging manifest or an older chat-specific commit. Require a clean `git status --porcelain -- mobile` immediately before source capture.
3. Export the whole committed `mobile` tree to a new directory outside the repository. Include native companion modules/targets and Firebase public client configuration. Exclude local environment files, credentials, generated native folders, dependencies, cookies and release artifacts.
4. Inspect the actual EAS upload archive. Verify every archived file against its committed bytes, and verify every committed mobile file is included except explicit generated-file exclusions. Record source commit, file hashes and the complete morning-change inventory under `outputs/iphone-internal-20261116-replacement`.
5. Use only the existing `preview` internal-distribution profile for the two registered test iPhones. Wait for the finished build and verify the downloaded IPA's signatures, all four target versions and provisioning profiles before sharing the installer.
6. Check the working copy again before handoff: any newer mobile change requires review rather than silently claiming it was included.

## Validation before source capture

The full app TypeScript and test suite, plus isolated event-points, Following-ranking, messaging/notification-retention and Data API grant tests passed. Follow layout regressions cover initial profile absence and all follow states. In the running iPhone preview, SAPA Men/Women and FIP controls align consistently; a real public event generated a PDF and its Activity action opened the published points sheet (including 2,600 winner points per player).

## Finished build and installer

- Source: `1078422372a10846dd5a6fba504463829a4576b2`, pushed on `brad/mobile-messaging`.
- All 85 mobile paths changed since the morning baseline (`92ef35f7`) are included. The 756-file / 10,918,734-byte upload archive matches the committed source; only the environment example is excluded by the existing EAS ignore rule. No later app code edits were pending at verification.
- TypeScript and **801 / 801 app tests** passed. Isolated event-points, Following, messaging/retention and 71 table / 4 sequence API access contracts passed.
- The actual compiled build 47 bundle contains the player-list PDF action, Activity points action, ranking-points screen and profile trophy shelf. Those features were absent from build 46’s bundle.
- EAS finished the iPhone, widget, Watch and Watch-widget targets. All four are version 1.0.2 / build 47, correctly signed on team `52RX6X5X2T`, and provisioned for both registered test iPhones through 28 September 2027. Debugging is disabled and the host retains production push.
- ZIP integrity and strict deep code-signature verification passed. The existing non-blocking Expo Doctor SDK patch warning remains (19 available package patches); native compilation and installer verification succeeded with the tested lockfile.
- Installer: `/private/tmp/fourm-iphone-1.0.2-47.ipa`. SHA-256: `269ce6b8fe41dd37ceffc3a8524a9c39596b50080b38762270a7ba90ef83dc84`.
- Source manifests, the complete morning coverage inventory, tests, build state, compiled-feature checks and installer receipts are stored in `outputs/iphone-internal-20261116-replacement`.

Nothing is submitted to TestFlight, App Review or the App Store. Physical-device and paired-Watch testing remain with the user and partner. Build 47 supersedes build 46 for this test pass.
