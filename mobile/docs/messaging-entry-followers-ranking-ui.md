# Messaging entry, public followers and ranking rows — 11 November 2026

## Design lock

Product: help padel players find event conversations, people and current rankings.
Character: practical, sociable, precise.
World: the existing 4M court-green interface, with blue for messaging navigation.
Moments: real player portraits and actual ranking movement carry identity/status.
Signature: consistent native disclosure cues, source labels and compact player rows.

References: the supplied Event announcements button and follower screenshots;
the supplied FIP ranking rows as the primary layout target; the established
HomeAction/FeedPortrait components; Refero's bundled touch, navigation and
semantic-action craft guidance; better-ui component consistency; Unslop spacing,
copy and quiet chrome. No new palette, imagery or decorative motion was added.
Unslop by Damir Sokolovsky, CC BY 4.0 (https://heydamir.design/unslop).

Confirmed issues: the centred event button did not describe what opens; other
players' follower counts were static and the existing list API was own-only;
SAPA used a different dense table from FIP; Tour duplicated Home; international
shortcuts still used the old Tour tab and an unfiltered following feed.

## Changes

- Messages now has an Event chats navigation row: calendar icon, explanation,
  disclosure chevron, full-row native tap target and screen-reader hint. Its
  destination and existing channel permissions are unchanged.
- Other player profiles expose a tappable follower count. The list names the
  selected player, uses public photos/initials and links to each public profile.
  Pagination and sign-out/request-race protections remain. Errors use the app
  banner and an explicit retry state.
- SAPA now uses the FIP row proportions: rank, 44-point portrait, name, source/
  category/points and the same native follow control. Actual nonzero StandingDiff
  appears beside rank as an up/down indicator; missing movement is not invented.
  Ranking identity, points and movement stay within the requested provider
  organisation/category. Portrait/follow linkage prefers exact RankedIn IDs and
  refuses ambiguous identities. Follow state is shared with the existing Players
  screen instead of fetched once per row.
- Players has Discover, Following and Rankings. Old Tour deep links redirect to
  the international calendar. Home retains its international feed.
- International Home shortcuts open: international calendar, pro live scores,
  FIP rankings, FIP player directory and followed FIP players. Local shortcuts
  keep their local destinations. Coming up opens the international calendar;
  Latest results opens its Past selection.

## Backend access contract

Applied `public_player_follower_directory` to project
`uzglrpbixubfijvjbtgz`, hosted version `20261111064102`; source migration
`20261111063524_public_player_follower_directory.sql`.

No new tables or broad table grants were added. Follow records retain owner-only
RLS. The public RPC is SECURITY INVOKER with EXECUTE for authenticated users only;
its definer helper remains in the unexposed profile_social schema and validates
a current non-banned/non-deleted/non-anonymous session and confirmed account.
Other profiles must be approved; an owner retains access to their own unpublished
profile list. Blocks apply in either direction between viewer/target, viewer/
follower and target/follower. Hidden, deleted, banned and unverified follower
identities are omitted.

Only public player ID, name, image URL and home club are returned. Emails, Auth
IDs, phones and raw follow records are never returned. The existing public
aggregate count is retained, so hidden profiles can contribute to a total without
being named. The old own-list API preserves its ownership restriction and now
uses the same session, block and visibility filters.

## Verification

- TypeScript and the complete mobile suite passed: 719 tests across 68 runners,
  zero failures/skips. This includes invoking all five shortcut callbacks under both
  source selections and exact ranking identity/movement cases.
- Disposable PostgreSQL directory suite: 29 assertions passed, including old
  endpoint compatibility, revoked/expired sessions, anonymous denial, own versus
  other hidden profiles, blocks, pagination and field allowlisting.
- Data API migration source checks: three passed; no table contracts changed.
- Hosted authenticated read verified Adam Van Harte's five public followers and
  the response field allowlist. Anonymous EXECUTE is absent; the public wrapper
  is invoker. Post-deployment advisors were checked.
- Existing iPhone development app visually confirmed the event navigation row,
  loaded follower list, SAPA/FIP-style rows, removal of Tour and Chevaan Davids'
  real +3 movement beside rank 16. No follows, messages, payments or registrations
  were created by these checks.
- Native iOS/Android build, archive, install and store upload remain on hold.
  Development JavaScript refreshed in the existing simulator app only. Android
  rendering has not been inspected in a device session in this pass.

The separate contact-privacy API cutoff documented in the permission audit is
still deferred. This directory change does not activate it or modify checkout.
