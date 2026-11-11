# Home feed

The Home screen is the discovery feed. The player’s full career, directory and rankings stay in their existing destinations.

## Approved direction

Reference: the supplied `SCR-20261106-jnsq.jpeg` and the existing 4M brand. The user approved a compact feed with native controls, real event imagery and scores, then clarified that the local selector must be **4M**, with **Premier Padel & FIP** as the international view.

- Product: a daily feed for discovering, watching and playing padel.
- Character: courtside, timely, direct.
- World: white scoreboards, court photography and restrained 4M colour.
- Moments: a prominent spotlight followed by compact activity and results.
- Signature: explicit source context for 4M, Premier Padel and FIP content.

The reference lock is the supplied mobile composition. Unslop’s dashboard reference informs only restraint and the placement of colour within content; it does not supply this app’s layout or palette. The Refero bundled craft guide informs focus, clear state and native interaction details.

## Audit and treatment

The previous first screen was dominated by the full profile card and a large generic lime promotion. Spotlight sat below them. Expandable sections hid activity, local and international content shared a long scroll, and Home mounted the full Players loader. Tracked labels, a waving emoji, repeated bell motion and a result-strip nudge added noise.

The nine unslop passes were applied in order to the replacement composition:

1. Spacing: a 4-point rhythm, 20-point page gutters, 12/16-point card padding, consistent rows and rails.
2. Colour: existing light 4M surfaces, neutral native chrome, restrained green actions, red reserved for confirmed live status.
3. Icons: system SF Symbols / Material symbols, functional icons only.
4. Copy: direct section names and explicit 4M versus international context; empty states describe actual data availability.
5. Type: platform fonts, weights 400–600, tabular scores and counts, a compact identity row.
6. Layout: spotlight, shortcuts, current activity, following, upcoming entries, results and photographs; independently virtualised sections.
7. Details: image outlines, 12/16-point surfaces, accessible whole-row targets, separate source labels and content dates.
8. Visuals: actual event artwork, player photos and published album covers. No generated imagery or invented scores.
9. Motion: native interaction feedback and a brief image transition. No staged feed entrances, repeated bell motion on Home, or automatic carousel nudges.

## Native components

- iOS: SwiftUI segmented Picker and Button controls through the already installed Expo UI package.
- Android: Material 3 single-choice segmented buttons, IconButton and TextButton controls through Jetpack Compose. Material is seeded from the 4M accent.
- Lists, card interaction, scrolling, pull-to-refresh, accessibility and images use native React Native / Expo components. Android embeds the existing native symbol view in Compose buttons through RNHostView.
- Existing native bottom navigation and error banners remain in use. Event-specific notification-follow controls retain their existing behaviour.
- No new native dependency or binary build is required for these changes in the current development client.

## Feed and notification refinements

- The source picker has an explicit height so its SwiftUI measurement cannot overlap or compress the profile row. The two explanatory source subtitles are removed.
- Spotlight uses a compact 64×96 poster, event identity, a small gold badge, an inline countdown and a filled contextual action in the footer. The separate countdown panel and full-width button are removed so the shortcuts and the next section appear sooner.
- A single “On now” event fills the rail width and uses a dark photograph-backed surface, a prominent red status and white event title. This means an event is in progress; it does not imply that live match scores are available.
- A confirmed empty On now / Live now section is omitted. Loading and failure states remain available so a failed request is not mistaken for no current events.
- Local event thumbnails use the existing bundled website tier defaults when an uploaded poster is absent or fails to load. Home, search and notification event groups share this behaviour. The bundled images are optimised copies of the website artwork; tier selection is checked against the website resolver.
- Secondary actions such as View all, Back, Settings and Review use small native bordered capsule buttons on iOS and native Material tonal buttons on Android. The soft treatment preserves clear primary actions and native touch targets.
- Results and Following are swipeable. Home Following contains only profiles the signed-in user follows, with compact cards ordered portrait, name, country flag, ranking label and position. Points are intentionally omitted from these cards. 4M results foreground the winning pair in a clearly labelled division block, with each winner’s portrait and name on their own row so long names retain the available width. Portraits fall back to initials. A link opens all division results. Winners come from the existing published results cache; no winner or score is inferred from elapsed dates. A single batch loads only public name/photo fields for the selected winners. Ambiguous name matches retain initials.
- Local shortcuts lead to tournament search, player discovery, rankings, the licence and the existing club directory. International shortcuts retain international context. Native search opens the relevant native event destination.
- The international feed restores image-led live cards and a separate FIP Promises & Bronze rail. Provider levels are presented as readable labels.
- The separate Following activity feed shows match results with both pairs, aligned set scores and an explicit winning-team marker. International results show individual portraits and flags beside each player; long names wrap rather than truncate.
- FIP calendar artwork uses `contain` so faces and poster content are not cropped. “View official event” is a filled native button.
- Notifications uses an explicitly measured sheet header with native buttons, followed by the scrolling list. **Action needed** is the first, default native segment. Event groups begin collapsed and show each event’s identity and pending count. Following activity lives under All updates.
- The notification and preference routes set header visibility before presentation. They do not register per-render native toolbar/header options. This avoids a navigation update loop when Settings opens from a form sheet. Settings has an explicit native Back control that returns to Notifications.
- The development client restores an existing session on reload. `EXPO_PUBLIC_REPLAY_ONBOARDING=1` explicitly opts into replaying onboarding in development; first-install onboarding and account eligibility remain enforced.

## Loading and account isolation

`use-home-feed.ts` owns small resources with independent loading, error and retry state. It does not mount `usePlayerHub`, the player directory, all ranking categories, or the full international feed.

- Home requests only the selected 4M or international feed. International snapshots and the live gateway start when that view is selected. Result portraits independently seed from the existing small public rankings snapshot (about 35 KB at verification, 100 players). Only the current result card looks up missing profiles through the existing gateway; swiping away or losing focus stops further lookups. Images and flags never block score rendering.
- Session identity comes from the existing native session and auth subscription. All user queries still use the normal authenticated client and server-side policies.
- `home-feed-cache.ts` keeps values in memory only, scoped to the current account and email. Switching account or signing out clears values and in-flight references. Generation checks discard late responses, including an old session for the same account.
- Requests for the same resource share an in-flight promise. Recently loaded values appear on return without re-fetching until their TTL expires. Pull-to-refresh bypasses the TTL.
- TTLs: profile/schedule/payments 60 seconds; following 45 seconds; spotlight 90 seconds; current 4M events 60 seconds; results 180 seconds; photos and upcoming personal matches 300 seconds; tour 120 seconds; fixtures/live 60 seconds; official FIP calendar 1 hour.
- Only the international live list refreshes on a 60-second timer while Home is focused, foregrounded and showing the international view. No Home polling runs in the background.
- Calendar/photo queries and horizontal rails are bounded. The media preview asks for six albums. The live gateway retains its existing server-side caching and pagination limits.
- International result portraits are matched by provider ID, reused for one hour and deduplicated while pending. The portrait cache retains only ID, HTTPS photo URL and validated country code, not the full profile response. No directory-wide provider search or new access grant is used.
- A slow payment or match request does not delay public spotlight rendering. The Watch/widget schedule is updated after its personal inputs are ready; career history and win/loss queries are omitted.
- Unknown registration state never becomes an invented paid/registered status. Confirmed balances override paid registration flags for their own event.
- Pending payment actions treat the user's primary division entry as authoritative. Reciprocal partner records cannot add a second reminder or override a paid status. Different divisions retain separate actions and each action labels its division. The simulator confirmed one Mixed Open payment action for Durban Open after the fix.
- 4M “On now” means the event date is current. International “Live” requires non-stale provider data. Old provider responses are labelled as the last update.

Home Following reads a separate `followed_players` collection from the authenticated feed RPC, bounded to 12 local and 12 international profiles. It never turns activity titles, event updates or entry deadlines into player cards. The selected source determines which profiles appear; View all opens the corresponding followed-player list. The photo preview uses active published albums; it is not a new news publishing system.

## Shared search

The native Search sheet groups event, player, club and organisation matches. Local context searches published 4M player profiles; international context uses the existing FIP player gateway. Clubs and organisations use the existing public directories and open their published website profiles in the platform's in-app browser. Event and player destinations remain native.

Directory queries begin after two characters and a 250 ms debounce, return at most 20 matches per directory, cancel superseded requests and publish each directory independently. One failed source does not discard the others; the existing error banner and retry control make missing results visible. Only named public display fields are selected, with published-club and approved-organisation filters. Search text is never sent to analytics.

## Ranking identity

- Local cards use only SAPA organisation 15809, Men-Main doubles (type 3 / age group 82) or Women-Main doubles (type 4 / age group 83). Rank and points come from the same validated source row. International cards use their separate provider identity and gendered FIP ranking.
- The profile's recorded gender selects its own Main division for cards, activity actors, movement posts and ranking pushes. A Female profile with an extra imported Men-Main row receives only Women-Main. A missing own-division rank stays unavailable; it never borrows the other division. Unknown gender with two Main rows remains ambiguous and hidden. Imported rankings are preserved, with no name-specific overrides or additional private profile fields returned by the feed.
- A player's chosen display rank can belong to a different circuit. It is never a SAPA movement baseline. Charl Vos’s SAPA Men-Main #17 / 3,381 points and SA Grand Tour #9 / 180 points are separate rankings; the code contains no player-specific override.
- Movement posts and own-ranking push notifications require a known prior position in the same SAPA main scope and an actual position change. Points-only updates, other circuits, age divisions, missing baselines and older editions do not create movement posts.
- Legacy local ranking posts lack reliable source identity and are excluded from feed reads. Their stored records remain intact. Same-day activity retains the initial position, with net-zero movement hidden.
- The migration replaces feed/trigger functions and adds internal validation helpers. It creates no tables and preserves follow ownership, public-player eligibility, private-event visibility and existing API grants. Only whitelisted public player fields are returned.

## Verification

- TypeScript check passed.
- On 9 November 2026, TypeScript and all **571 mobile tests** passed, including 33 Following tests. The isolated PostgreSQL ranking suite and all three parent Data API contract checks also passed.
- Subsequent search, reciprocal-payment and poster-default changes passed **582 mobile tests**. Six search checks cover public-field selection, publication filters, route namespaces, literal wildcards, bounded results, independent completion, cancellation and partial errors. Four new payment regressions protect reciprocal records and distinct divisions; the poster test compares website and bundled fallback choices.
- Public-client directory queries returned Mikayla Plitt, published club matches and approved organisation matches without privileged credentials. The simulator displayed the native player-search result, the website Major fallback, soft Settings/Review buttons and one Durban Mixed Open payment action. Empty On now content was absent from the Home accessibility tree.
- Twenty-four behavioural Home tests cover caching and account isolation, source/event routing, countdown transitions, winning pairs, unambiguous public portrait matching, shared international snapshot loading, profile request deduplication, ID mismatch rejection and portrait expiry. Eight notification-centre tests cover stable event grouping, safe paths, ordering and account-change races. Startup checks cover restored development sessions and the explicit onboarding opt-in.
- Public Data API checks for spotlight, current 4M events and six albums succeeded using the normal public client key. These verify query syntax/access, not private-account permissions or device-render latency.
- The existing iOS development simulator displayed the native header buttons, source selector, 4M spotlight/current events, personal entries, results and photo sections. Switching to the international view loaded actual FIP live events, following results and upcoming circuit events. The native event-details destination was also observed. The feed cards and native shortcuts were visually inspected at the simulator’s current scroll position.
- The source-specific ranking migration is tested against an isolated temporary PostgreSQL database. The cases cover circuit separation, both main divisions, malformed/ambiguous input, points-only changes, daily baselines, stale editions, owned follows, unauthenticated rejection and separate local/international identities.
- The migration was applied to the hosted database on 9 November 2026. Read-only verification returned Charl Vos’s SAPA Men-Main #17 / 3,381 points while leaving his separate display preference at #9 / 180 points. All ten old unscoped ranking records remained stored and were excluded from served activity. Client execution of internal helpers and anonymous feed access remained denied. Security advisors introduced no new notice categories.
- The refreshed iOS development simulator displayed only followed player profiles in Home Following, with two compact cards visible side by side, public portraits and labelled main-ranking stats. Event deadlines no longer appear as player cards. Android visual interaction remains unverified.
- The iOS simulator showed the compact spotlight and earlier shortcuts, plus the corrected Notifications header with Action needed selected first. Expanding an event revealed only that event’s review actions. Accessibility output confirmed actual winning pairs and divisions in the new result cards. Native search was checked from a Rockets query through to its event details.
- The reported blank Notifications/Settings failure was reproduced. After replacing dynamic header configuration, the simulator successfully opened Notifications, opened the actual notification preference sections with Settings, returned with Back, and expanded Notifications with all event groups visibly present.

Run `npm run typecheck` and `npm test`. Home tests can run independently with `node scripts/test-home-feed.cjs`; the isolated PostgreSQL checks use `npm run test:following:db`. Parent Data API access-contract checks use `npm --prefix .. run test:data-api`.

The loading structure is improved, but no device speed multiplier or production concurrency benchmark is claimed. Android still needs a device/emulator interaction check before release.

## Method credit

This redesign applies the unslop methodology by Damir Sokolovsky ([@heydamir](https://x.com/heydamir)), licensed CC BY 4.0, together with better-ui craft guidance. This attribution belongs in development documentation, not product navigation.
