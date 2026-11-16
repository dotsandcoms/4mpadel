# Profile and event updates — 16 November 2026

The user resumed internal iPhone builds after the change pause. The complete mobile release is tracked in `internal-ios-replacement-2026-11-16.md`; no App Store submission is authorised.

Messages and Help chats now allow screenshots and screen recording, as requested. iOS retains its separate app-switcher cover; all platforms still mask inactive message content. Player-to-player messaging needs normal sign-in, with no extra authenticator code. Admin messaging and staff Help access retain their MFA checks.

## Profile completion

Home has a persistent, separate incomplete-profile reminder. Both its Edit profile action and individual Region/Racket brand Review actions open `/edit-profile` directly. Optional signup fields remain optional, and the reminder does not block login. The editor opens Player details, includes self-reported identity/contact/player fields, and supports verified sign-in email changes. Private DOB/Playtomic completeness is represented in the Home cache only as completion flags. Saving invalidates the relevant cached profile data and discards older in-flight responses. Field selection/focus uses the mobile blue palette, and profile labels no longer append “(optional)”.

The general Home action banner has its own X. Its dismissed preference belongs to the current user and Auth session ID, survives screen remount/token refresh, and resets for another login. It does not dismiss the incomplete-profile reminder.

The checked profile/private-identity migration `20261116095716_profile_completion_and_private_identity` and explicitly approved `20261116095853_verified_account_email_change` are hosted. Email requests use Supabase Auth verification; there is no direct client rewrite of player email. Confirmed changes preserve the existing account/player IDs and reviewed entry/team/access references. The isolated email-change suite passed, including pending-payment integrity and historical-record preservation. No real email change was requested during automated testing. Actual-device email-link confirmation remains to be exercised.

## Draws, results and player discovery

Knockout Draws offer List and Bracket modes. Bracket round order stays unchanged. Compact teams have small profile photos with initial fallbacks and single-line ellipsised names; opening a match shows full names. Group play and Results do not receive a misleading knockout bracket.

Results show the Final first, then earlier rounds. Explicit match links still select the requested match. Discovery samples Men, Women and FIP Tour from their full fetched eligible pools before limiting the cards, stays stable during ordinary rerenders, and reshuffles on refresh or return to Discover. Rank values and the Rankings tab retain their existing meaning.

## Validation

Targeted profile, Home, cache, sign-in email, draw/bracket, discovery and notification tests passed, as did TypeScript. The running iPhone 18 Pro preview confirmed that a Region Review action opens Edit profile directly. Club claim/tag changes and their separate native checks are documented in `native-clubs.md`. The earlier build pause was lifted by the user’s subsequent request for an internal test build.
