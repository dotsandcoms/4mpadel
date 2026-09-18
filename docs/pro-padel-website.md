# Pro Padel website rollout

Website first; React Native work follows a validated website release.

## Step 1 — Verify the provider

Live sample verification passed on 17 September 2026 using `.env.local`:
five official ranking rows per category, profiles for Agustin Tapia (66) and
Delfina Brea Senesi (434), and five match records per player. Player relationships
were present. Match samples included finished matches and a bye; byes must not be
presented as played wins in the feed. Watchability, actual start times and duration
were restricted. Upcoming fixture coverage and full pagination remain unverified.

Create a free account at https://padelapi.org/login and generate a token in the
account's API Tokens area. For local validation, add `PADEL_API_TOKEN` to the existing
`.env.local` using an editor. This file is
gitignored. Do not paste the token into chat, frontend code, or a shell command.

Run from the repository root:

```sh
node scripts/check-padel-api.mjs
```

The diagnostic makes at most six GET requests, paced 6.5 seconds apart. It checks
men's and women's official rankings, one profile from each category, and a small
sample of recent player matches. It writes nothing to Supabase and logs a summary
instead of full responses. Restricted fields are reported, never interpreted as
scores or dates. A successful check verifies sample access and relationships only;
empty match samples require further coverage checks. No automatic retries or
subscription changes occur. Other processes may share the provider quota.

Before deploying the later sync function, add `PADEL_API_TOKEN` to the existing
Supabase project's Edge Function secrets. The local file is only for the terminal
check and is not uploaded automatically. No Vite or mobile environment variable
should contain the provider token.

## Step 2 — Rankings and profiles on the website

Implemented `/pro` and `/pro/players/:id`, with a navigation entry, public browsing,
men/women URL filters, name/country search, profile photographs and available bio
fields. The first edition contains 50 men and 50 women. Missing values, ties,
loading, empty results, errors, invalid player links and stale data have explicit
handling. A provider date and last-sync timestamp distinguish rankings from live data.

The initial cache uses one normalized JSON snapshot in the dedicated public
Supabase Storage bucket `pro-padel`, object `rankings-v1.json`. This is sufficient
for the read-only rankings/profile stage and avoids premature database migrations.
The bucket allows JSON up to 1 MiB. The initial real snapshot is published.
Server writes use the service role; browser reads contain no provider credentials.
When follows/feed work starts, introduce relational player identities and follows
with RLS, then reuse or migrate this cache behind the same UI service.

`server/pro-padel.mjs` reads four provider pages, paced below the free-tier limit,
normalizes an allowlist of fields and publishes only after both categories succeed.
A failed provider request never publishes a partial snapshot. Photos remain remote
provider URLs. Local manual refresh:

```sh
node scripts/sync-pro-padel.mjs            # review in /tmp, no storage writes
node scripts/sync-pro-padel.mjs --publish  # replace only the Pro Padel cache
```

Daily refresh runs directly in Supabase using `pro-padel-sync` and pg_cron:
- Rankings: 05:00 UTC / 07:00 SAST.
- Tour/results: 05:10 UTC / 07:10 SAST.
- Fixtures: 05:20 UTC / 07:20 SAST.

The Edge Function uses server-only `PADEL_API_TOKEN` and `PRO_PADEL_CRON_SECRET`
secrets plus Supabase's built-in service credentials. Vault stores the cron bearer
secret and function URL. The database wrapper is unavailable to anonymous and
signed-in website users. The function validates authorization and scope before
calling the provider. Refresh failures preserve the previous snapshot.
Vercel schedules have been removed to prevent duplicate refreshes. The existing
Vercel token may remain, but these jobs do not depend on it or website deployment.
See `docs/pro-padel-cron.md` for deployment and monitoring instructions.
Existing production storage write policies should also be reviewed when deploying;
the bucket does not add any client-write policy of its own.

## Step 3 — Follow players

Store follows against Supabase `auth.users`, referencing internal professional
player IDs with unique provider mappings. Use a unique user/player pair and RLS
so each user can read and change only their follows. Require sign-in for following.
Handle provider player merges without losing follows; do not match people by name.

## Step 4 — My Padel

Build fixtures and results from cached matches joined to followed players.
Deduplicate by match ID when both partners or opponents are followed. Label
estimated start times clearly and render dates for South African readers.
Add ranking movement only after snapshot availability and semantics are verified.
News, social posts, live scores and push notifications are subsequent scope.

## Step 5 — Verify and publish

Check desktop and mobile web, signed-out browsing, two-account follow isolation,
refresh persistence, duplicate-match prevention and provider outages. Apply only
the Pro Padel migration, not unrelated pending migrations in this working tree.
Publish the website once data access and end-to-end checks pass. The native app
will later reuse the database and server integration.

## Provider contracts checked

- [Rankings](https://padelapi.org/docs/api-reference/ranking/list-rankings): use
  `/api/rankings` with `type=official` and `category=men|women`, not player-list
  ordering as a substitute. Rankings are paginated weekly snapshots.
- [Profiles](https://padelapi.org/docs/api-reference/player/show-player): the
  detail response is a resource object; lists use a `data` array.
- [Player matches](https://padelapi.org/docs/api-reference/player/list-player-matches):
  team player IDs support following-feed membership.
- [Limits and coverage](https://padelapi.org/docs): free access has a 10/minute
  quota as well as daily/monthly limits; coverage varies by tournament level.
- [September access changes](https://padelapi.org/docs/blog/20260814-whats-new-in-padel-api-aug-2026-top-matches-predictions-and-breaking-changes):
  free match duration and actual start-time fields can return `hidden_free_plan`.
  This change concerns match access, not a change to the rankings JSON schema.
- [Plans](https://padelapi.org): live access and webhooks are separate paid-tier
  decisions. The first validation does not require purchasing either.

## Design decisions and validation

Existing 4M rankings/navigation are the primary visual reference. Preserve the
near-black canvas, rounded controls, bold sans typography, and lime interaction
accents. Refero's bundled craft guidance supplies real links, URL state, labelled
search, visible keyboard focus, fixed image dimensions and mobile touch targets.
No new visual identity or generated imagery is introduced. Official provider photos
are used with initials when absent or failing. Tied top-three ranks share emphasis.

Both the provider diagnostic and refresh/normalization checks pass (11 tests).
Targeted ESLint and the production build pass; the build retains existing large
chunk and gradient warnings. Headless browser checks cover desktop/mobile, both
categories, search/clear, profile navigation, absent player, failed load/retry,
zero horizontal overflow and no runtime errors. Visual review used 1440px and
390px captures, followed by a real public-cache browser run. Screenshots and the
local browser runner are development evidence, not deployed assets.

The new pages run locally at http://127.0.0.1:5187/pro. The website changes have not been deployed; the Supabase cron was enabled later (see the cron operations document). No native app changes or database migrations were made.

```sh
node --test tests/padelApiCheck.test.mjs tests/proPadel.test.mjs
npm run build
```

## Expanded experience — player modals and tour coverage

The page now uses a portrait-led leaders section, a rankings/results/calendar
navigation bar, country and playing-side filters, ranking points bars, the latest
final scorecard and an upcoming-event panel. Existing 4M dark/lime styling remains
the visual anchor; the local RankingDetailsModal supplies the overview/results
interaction pattern. Provider portraits provide the main visual emphasis.

Player links open a native dialog over the current page using `?player=<id>`.
Filters remain in the URL; Escape, close, backdrop and browser Back dismiss it.
Direct `/pro/players/:id` links still open the modal. The dialog traps keyboard
focus, restores focus on close, locks background scrolling, fills mobile screens
and offers a copy-link action. Overview includes profile details and a clearly
labelled selected-round W/L record; it never presents these as career totals.

A separate `tour-v1.json` snapshot contains the Premier Padel calendar from the
previous 90 to the next 120 days, plus quarter-finals onward from the latest two
completed events. The first verified sample contains 14 events and 28 match records
(Paris Major and Madrid P1). Byes, walkovers and unconfirmed results do not count
as played wins/losses. Tiebreak scores are retained. Upcoming events support venue
expansion and an all-day .ics download with an exclusive end date. No live-score
claim, paid statistics or fabricated fixtures are introduced.

```sh
node scripts/sync-pro-padel.mjs --tour
node scripts/sync-pro-padel.mjs --tour --publish
```

The Supabase tour job runs at 05:10 UTC after rankings at 05:00 UTC, using paced requests. Tour failure leaves the previous cache intact and does not prevent rankings from loading. These jobs operate independently of website deployment.

Validation now includes 14 unit tests, targeted ESLint, a production build and
browser tests for both viewport sizes, modal focus cycling/restoration, Escape,
Back, deep links, category/country navigation, results, calendar download and tour
failure/retry. The local visual evidence is in `/tmp/4m-pro-v2-*.png`.

## Account follows and My Padel — 17 September 2026

The website now provides Follow/Following in the player modal and a My Padel tab. The existing 4M sign-in modal opens after the native player dialog closes. Follows persist in `public.pro_player_follows`, keyed by auth user ID and provider player ID, with saved name/category so selections remain removable outside the current top 50. Men and women share one feed; matching results are deduplicated by match ID.

Migration `20260917100000_pro_player_follows.sql` was applied individually to the linked 4M project and recorded in migration history. RLS grants authenticated users only select/insert/delete on their own rows. Anonymous access is revoked. Transactional database checks verified owner reads/deletes and cross-account read/insert/delete denial; test writes were rolled back.

Client state clears across account changes and logout. Writes are confirmed before displaying Following, duplicate clicks are locked, and failed reads/writes expose retry. Browser checks cover guest login from native modal, follow/unfollow, reload persistence, feed, failed save/retry, logout, and 390px layout using mocked auth/write responses. Real database policy checks are separate. Country-name search was repaired after a flag-label substitution accidentally changed its searchable text.

The feed currently uses the two completed events’ quarter-finals onward. Upcoming player fixtures, notifications, and ranking-change history are not implemented in this step. The website remains a local preview until deployment; production cache refresh now runs in Supabase as described above.

## Upcoming fixtures — next event

My Padel now loads `fixtures-v1.json` independently from rankings/results. The server fetches the next pending/in-progress Premier Padel event and all main-draw pages (up to four pages; excessive or invalid pagination aborts publication). Only scheduled matches with at least one named player are included, and shared matches are deduplicated. Opponents, dates and courts may be TBC. Times convert to SAST only when the provider supplies an explicit timezone offset; estimated/not-before qualifiers remain visible. Offset-free times are not guessed.

Run `node scripts/sync-pro-padel.mjs --fixtures --publish` to update this cache. The Supabase Edge Function accepts a JSON body with `scope=fixtures`; its daily 05:20 UTC cron is active independently of website deployment. The current real cache lists Rotterdam P2 2026 with its draw unpublished and zero fixtures. This is a saved schedule, not a live feed. Stale caches show a warning after 48 hours. Match alerts are still pending.

## Player form and partners

Player profiles now include a Form & partners tab: newest-first W/L form (up to six covered matches), played record, win percentage, complete-score set and game records, partner records and highest covered tournament rounds. It uses the existing tour cache; all sections explicitly describe the two completed events’ quarter-finals onward. The career statistics endpoint was checked with the configured token and returned HTTP 402; no subscription change was made.

Metrics deduplicate match IDs, use the player’s actual team, exclude byes/walkovers/unconfirmed matches from played counts, and exclude retirements and partial or inconsistent finished scorelines from set/game totals. A champion badge requires a finished final win. Four new unit tests cover both team perspectives, tiebreak notation, restricted/malformed scores, incomplete matches, changing partners and empty coverage.

Visual target stays the existing 4M profile dialog: dark surfaces, lime for wins and existing numeric highlights, restrained coral loss labels with explicit W/L text, no color-only meanings. Existing modal metric cards and result cards remain the layout reference; partner and tournament rows use simple separators for small-screen scanning. The signed-in browser verified Tapia’s real covered record: 3W–1L, 75%, 6–3 sets, 54–44 games, Coello partnership and Paris champion badge.

## Pro Padel motion

Added scoped CSS motion following Refero's bundled motion guidance and the existing 4M component styles: 120ms control feedback, 200ms panel transitions, 280ms modal/card entrances, and a 350ms form bar reveal. Staggers are capped at 90ms; there are no looping decorative animations or delayed interactions. Section content is keyed only by section (not search input), and profile content is keyed by tab so transitions do not restart on each keystroke. Reduced-motion preference disables animations/transitions throughout Pro Padel and its native dialog. Browser checks verified computed modal/panel/card animations, functioning tab navigation and close/focus restoration, and no horizontal overflow. Targeted lint and production build passed.

## Ranking movement

The existing ranking refresh now preserves `ranking_diff` and `points_diff` as `rankChange` and `pointsChange`. No additional provider calls or paid history endpoint are needed. Numeric zero remains distinct from missing/restricted values; rank changes require safe integers. Indicators show up/down/no recorded movement beside world-ranking positions and within player profiles. My Padel lists followed players with either a rank or points change, including unchanged ranks with changed points, and labels the official ranking week. Coverage is limited to followed players present in the current top 50 men/women; no inferred movement is generated for absent players.

The provider defines changes against the previous ranking entry and uses zero movement for re-entry after missing snapshots, so the neutral label is “No recorded ranking movement.” These are current-edition updates, not a notification delivery system or a historical ranking chart.

## Player comparison

The Compare players section supports two distinct players from the selected men's/women's top 50. A profile's Compare player control preselects that player. Query parameters `view=compare&category=men&compare=66&against=115` persist selections and produce shareable links; invalid/out-of-category or identical IDs fall back to distinct players within the selected list.

The view compares official rank/movement, points, side, hand, height and covered-round form, reusing the tested insights calculation. Against-each-other records require opposing teams and a played result, deduplicate match IDs, and exclude matches as partners, byes, walkovers and unfinished results. Every meeting retains the full pair scorecard. No full-career head-to-head or win prediction is implied. Four comparison tests cover selection recovery, team membership, duplicates, win direction and match statuses; 26 Pro Padel tests pass in total.

Visual reference: existing Pro Padel portrait cards, ranking table, result cards and lime score highlights, with equal-width comparison columns and compact responsive tables. Existing section-transition animation applies. Browser verification confirmed Tapia/Coello show no opposing meetings in this selection, while Tapia/Galán show the one covered Paris final at 1–0.

### Player profile exploration

Profiles include the earliest published fixture from the saved next-event schedule, with SAST times, schedule qualifiers and a draw-pending state that does not imply participation. Form partners show portraits and flags; selecting a known partner replaces the open profile without stacking dialogs. Tournament journeys group saved results by event and show covered rounds from earliest to latest, without inventing missing rounds.

### Tour calendar presentation

The calendar features the next scheduled event, then groups upcoming stops by month. Search matches event names, cities and country names (accent-insensitive); level buttons filter the schedule. Filters persist in `tourSearch` and `tourLevel` URL parameters. The next-stop feature remains visible independently of filters. Event details and existing all-day ICS downloads are retained. Desktop uses a large date panel; mobile uses stacked event rows with visible action labels. Motion respects reduced-motion preferences.


The original Pro Padel visual styling has been restored, including the photographic hero, lime accents and card surfaces. Pagination, full-row profile links, tournament calendar enhancements and readable URLs remain in place. Readable Pro routes retain public access; following requires sign-in.

### Match details

Result cards open a native match-details dialog with both pairs, available portraits and flags, reported set scores, outcome and tournament location. Profile links return to the match when closed. Share links use `/pro/results?match=ID` (plus the women's category when applicable); older matches outside the rolling cache show an unavailable state. Missing advanced statistics are explicitly labelled. No inferred serve or point statistics are displayed.

### Social share previews

Pro player and match links have server-rendered Open Graph and Twitter metadata via the existing crawler preview endpoint. `/api/pro-share-image?kind=player&id=66` (or `kind=match`) renders a 1200×630 PNG using saved public snapshots and provider portraits, with text fallback if a portrait is unavailable. Sharp decodes WebP portraits; Jimp bundled fonts render text consistently. Vercel includes those font assets. Only HTTPS photos on media.padelapi.org are fetched; redirects are rejected. Images cache for one day at the edge.

The Pro crawler rewrite precedes the generic crawler rewrite, and the image endpoint is exempted from that HTML rewrite. No API token is exposed. This requires deploying the functions and rewrites to 4mpadel.co.za: localhost links cannot be fetched by messaging services. Existing messaging-app preview caches may also delay refreshed images. Old match links outside the rolling cache may fall back to the site preview.
