# 4M app UI and flow benchmark

Reviewed 6 November 2026. The brief is to make the app feel personal, direct and native on iOS and Android, while retaining 4M’s identity and strict access boundaries.

## Reference evidence

This review uses the user’s screenshots and official product screens and documented flows. It is not a claim to have logged into or exhaustively tested the current private versions of these apps. “Top apps” is a quality benchmark here, not an App Store ranking claim.

| Reference | Useful pattern | Applied in 4M |
| --- | --- | --- |
| Apple Sports | Personal favourites, immediate scores and a short path into a game | Keep live events and following easy to scan; one card opens its tournament or match. Keep source selection explicit. |
| Strava | Followed people give a feed its relevance; time and activity outcomes stay clear | Home shows only followed player profiles and their correctly scoped stats. The separate chronological activity feed retains match pairs, results and recency. |
| Airbnb | Discovery and booked commitments have distinct purposes, with imagery leading exploration | Home is the feed; “My next events” is the personal entry list. Real event photos and swipeable previews lead into details. |
| Playtomic | Find a player, open their profile, then start a conversation; chat actions live together | “Find a partner” opens player discovery, with the existing profile-to-message-request flow. Preserve the established chat action menu and privacy controls. |

Apple’s published screens demonstrate favourite scoreboards and navigation from scores into details. The launch article is dated 21 February 2024 and is used as a pattern reference, not a current feature inventory. [Apple Sports overview and screens](https://www.apple.com/newsroom/2024/02/introducing-apple-sports-a-new-app-for-sports-fans/).

Strava documents both personalised and chronological feed ordering. 4M’s current feed remains based on actual following relationships and recency; this change does not introduce behavioural ranking or tracking. [Strava feed ordering](https://support.strava.com/en-us/articles/15402105-how-does-strava-order-my-activity-feed).

Airbnb’s May 2025 app release separates Explore, Trips, Messages and Profile, and its published flow illustrates moving from discovery to booked details. These inform 4M’s separation of discovery and entries. [Airbnb app and flow reference](https://news.airbnb.com/en-au/2025-may-release-now-you-can-airbnb-more-than-an-airbnb).

Playtomic documents profile-first private chat and mute/block actions in the chat menu. 4M retains its own eligibility, message-request, reporting and organisation-access rules. [Playtomic player-chat flow](https://playerhelp.playtomic.com/hc/en-gb/articles/19832055834769-Private-chat-between-players-in-Playtomic).

## Flow decisions implemented

### Discover and enter a 4M event

Home → Find tournaments / search → native event detail → existing division and registration flow → existing payment review → My entries.

The search uses Expo SDK 57’s native stack search bar on iOS and Android. It searches event, city and venue. Results stay in the app. The spotlight’s primary action reflects registration, payment, an outstanding balance, an existing entry or results. A balance action opens the specific balance destination rather than sending the player through a new entry.

### Follow international padel

Home → Premier Padel & FIP → photo-led Live now card → native tournament → native match detail / follow action.

The live rail supports swiping and native previous/next buttons. Stale provider data remains labelled as a saved update. International search searches tour and official FIP data; local search stays with 4M. FIP Promises & Bronze has its own image-led rail using the existing official snapshot.

### Find and contact a player

Home → Find a partner → player discovery → public player profile → existing message request → accepted conversation.

The shortcut supplies the 4M source. International player and ranking shortcuts supply the international source. This changes navigation clarity; it does not grant messaging access to otherwise ineligible players.

### Handle an update or pending action

Notifications → event group → action or recent update → its native destination.

Groups start collapsed and use the event ID, image, name and date. Identically named events remain separate. Pending actions and notification history are labelled separately within a group. Action needed is the first and default native segment; All updates follows it. An explicitly measured sheet header with native buttons keeps the title, summary and tabs from overlapping. Navigation header visibility is configured before presentation, avoiding the dynamic option-registration loop found when opening Settings from a sheet. Account and international match updates retain separate groups when the current API does not supply an event identity.

Notification content and metadata are cleared or masked on an account change. Late responses from a previous account are discarded. Metadata is fetched in batches using the normal authenticated client and existing policies. No new SQL, permissions or privileged client access were introduced.

## Shared interaction rules

- Keep five stable native bottom tabs: Home, Events, Players, Messages and Profile.
- Give native segmented controls explicit dimensions inside scrolling headers. Their layout must not change the avatar/name row’s dimensions.
- Use personal labels for commitments: My next events, My entry and My following.
- Make the next consequential action visually clear. Keep registration state and payment eligibility authoritative.
- Use one event identity per card/group. Details remain behind a tap; repeated generic headings and explanatory source subtitles are removed.
- Let the OS own buttons, segmented selection, search and interaction feedback. Use native React Native views for product-specific event/score composition.
- Preserve swipeable previews without auto-advancing carousels or decorative animation.
- A single preview fills its available width. Multiple previews expose the next card to indicate swiping.
- Keep spotlight’s countdown and contextual CTA on a compact footer rather than two additional full-width blocks. Give current 4M events a distinct dark treatment. Put the winning pair and their actual division ahead of result-card metadata, with public portraits or initials.
- Keep notification and loading errors visible through the shared native banner.
- Home Following uses compact followed-player cards, with no event/activity fallbacks. Rank and points retain their exact source and main division; never compare positions from different circuits. On activity match-result cards, show both pairs and align set scores in columns; mark the known winner without inferring missing outcomes. International result rows give each player their own photo and country flag. Preserve full FIP artwork and use a filled native action for the official destination.
- The development client honours the normal saved-session flow. Replaying onboarding is an explicit dev-only opt-in. First-install and account eligibility gates still run.

## Scope and limits

The benchmark has been applied to the shared controls and the Home, search, notifications and related entry/navigation paths in this change. Existing payment confirmation, event-role permissions, private chat access and profile verification remain authoritative. This is not a completed visual redesign of every registration, finance or organiser screen.

Find clubs opens the existing club directory in the platform’s in-app browser. It does not request device location or promise distance sorting. A dedicated native nearby-club flow would need a separate location/venue implementation.

Android controls are implemented and type checked; device interaction/visual verification is still required before release. No production load-test or measured speed multiplier is claimed.

Craft methodology: unslop by Damir Sokolovsky ([@heydamir](https://x.com/heydamir)), CC BY 4.0; better-ui and the supplied 4M references guide the visual treatment.
