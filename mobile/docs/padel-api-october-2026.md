# International match experience — November 2026

## Prediction consistency audit — 9 November

The reported 89% versus 95% comparison is a difference between prediction models. The actual Padel API simulation response for Coello/Tapia (`65`, `66`) against Alfonso/Libaak (`18`, `93`), with reference date `2026-11-08`, is **95.38% / 4.62%**, Elo difference 263. The app correctly rounds that response to 95%. Padel API documents a logistic curve with divisor 200, using the two players' average Elo. Padelnachos' explanation describes its own strength model using recent results and official rankings, then tournament simulation. Its 89% is not a value returned by our provider and is not substituted into our data.

The partnerships also match: reversing the two names does not change pair identity. Padel API's Nacho Vilariño (`86`) corresponds to FIP's Ignacio Vilariño Gestoso: birth date `2000-01-27`, birthplace Vigo, height 172 cm, paired with Mario Del Castillo. The app preserves provider identities rather than matching players by surname or overwriting one source with another's naming convention.

The journey now explicitly states whose win chance is displayed, the source (**Padel API · Elo model**), and the reference date. Expanded alternatives have their own estimates and no longer duplicate the pair already shown above. Alternative estimates load in groups of three. A keyed hook prevents a previous opponent's percentage appearing beside a new opponent after a draw update, handles delayed responses, and supports explicit refresh. Background draw refreshes no longer trigger the pull-to-refresh indicator.

The explorer deployment is now **v18**, with JWT verification preserved. Before projecting a probability, the server validates all four returned player IDs and their resource namespaces, team sides, competition, reference date, and probability range/total. It returns public identity metadata with the model numbers, without returning raw player profiles. The device independently validates that metadata against its selected matchup. Incorrect or unverifiable data stays unavailable. The previous deployed source was compared before deployment: only the reviewed prediction projection changed; the shared provider cache and quota code are unchanged.

Validation: **628 tests pass** and TypeScript passes; targeted tests also cover same-matchup refresh retries. The deployed endpoint rejects anonymous requests with **401**. The signed-in iPhone simulator verified the source labels, Coello/Tapia's 95% estimate against Libaak/Alfonso, and separate estimates against Aguirre/Lijo and Vilariño/Del Castillo. No database schema or access-grant changes were made. Rollback of the server alone to v17 would safely make new-client estimates unavailable until the compatible protocol is restored.

Sources: [Padel API prediction model](https://padelapi.org/docs/guides/padel-match-prediction), [simulation endpoint](https://padelapi.org/docs/api-reference/match/simulate-match), [FIP player profile](https://www.padelfip.com/player/ignacio-vilarino-gestoso/), [Padelnachos reference and model explanation](https://padelnachos.com/tournaments/9f50b503-24e1-4f75-b742-3f21679a24da?tab=entries&category=men&pair=coello-tapia).

## Entries and pair journeys — 9 November

The tournament centre now has native Overview / Entries / Matches controls. Entries separates Men / Women and Main draw / Qualifying, shows the top four published seeds before the remaining pairs, and searches either player's name. Paired professional photos use the existing bounded public-photo cache, with initials for missing images. Entry rows use static React Native styles; the Pressable style callback was not being applied by the current NativeWind interop. Native link buttons use horizontal icon/text layouts on iOS and Android.

Each pair opens a stack route at `/pro/tournament/[id]/pair/[pair]?category=men|women`. Identity is the canonical pair of numeric Padel API player IDs, scoped to tournament and competition. Seeds and status are stored separately for each draw; a qualifying seed never becomes a main-draw seed. The screen reuses the loaded tournament draw from a six-event memory cache. Refresh remains foreground-only. Tournament-list match resources omit their parent tournament, so the parser now binds the requested tournament ID and rejects an explicitly conflicting parent.

The route uses the provider's zero-based `index` within complete knockout rounds; `connections.next` is chronological navigation and is never interpreted as a bracket link. Counts, consecutive round sizes, slot uniqueness, and published parent/child teams are checked before deriving future rounds. Partial or inconsistent brackets show only published matches. Byes require an explicit provider status; an unpublished qualifier is not a bye. A loss ends the knockout journey. Qualifying is not attached to an invented main-draw slot. Possible opponents come from the opposite branch and exclude explicit losing pairs. The UI distinguishes actual results, upcoming matches, and conditional projections, with expandable alternatives and links to match details and other pair journeys.

Per-match win estimates use the existing authenticated Padel API simulation endpoint, with the selected pair first and the tournament's start date as the pre-tournament Elo reference. They are not live odds. The displayed future opponent favours the best published seed in its branch; unseeded alternatives are not ranked. No championship percentage is inferred by multiplying one hypothetical path, and no Padelnachos forecast is copied. Overall title forecasts and community voting are not supplied by this implementation. Near-100% estimates display `>99%`, preserving the distinction from a model output of exactly 100%.

Simulations are serialized, coalesced by both partnerships and reference date, cached for an hour, and cancelled before dispatch when no subscriber is active. They do not gate draw rendering or create a request for every possible opponent. Unknown/invalid model data stays unavailable. Entries are currently derived from published draws; the provider's separate official entry-list endpoint is not wired into the app yet.

International Home now leads with a larger event-poster card and a native **View matches** action that opens the tournament's Matches tab. It enriches at most three visible event resources, without blocking the feed, to replace old snapshot logos with current event artwork. **On the circuit** previously selected only the first featured event and could duplicate Live now. It is replaced by **Coming up**, which lists future events, excludes ongoing events, and appears once. The earlier duplicate calendar rail is removed. Today counts are deduplicated, scoped to the event, calculated in SAST, and labelled as listed matches rather than complete coverage.

References: [user-supplied Entries/journey reference](https://padelnachos.com/tournaments/9f50b503-24e1-4f75-b742-3f21679a24da?tab=entries&category=men&pair=coello-tapia), [official tournament players documentation](https://padelapi.org/docs/api-reference/tournament/list-tournament-players), [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/). The existing unslop / better-ui direction is retained. No database schema, access grants, authentication or deployed function changes are required for this addition.

Validation: **625 mobile tests pass**, TypeScript passes, and `git diff --check` is clean. New coverage includes canonical pair identity; tournament/gender isolation; zero-indexed progression; explicit byes versus unpublished players; feeder results; elimination, walkovers and retirement; partial draws; qualifier boundaries; title confirmation; seed parsing; parent tournament binding; bounded caching; prediction deduplication, cancellation and validation; and duplicate Home event suppression. The real cached Dubai draw was checked against Coello / Tapia's R64 bye and five remaining rounds. iPhone simulator checks cover search, top seeds, qualifying results, live match estimates, compact projected routes, alternatives and Home-to-Matches navigation. Android visual QA remains outstanding.

The PadelAPI October update adds player/pair rivals (Pro), player form and pair synergy (Business), and qualifying draws. Source: https://padelapi.org/docs/blog/20261030-whats-new-in-padel-api-oct-2026-rivals-qualifying-draws-and-player-form

## Audit and direction

Product: a courtside companion for local players and international fans.
Character: compact, legible and factual.
World: real players, tournament artwork, scoreboards and court schedules.
Moments: find a live match, see the latest point, then explore a player or rivalry.
Signature: dark green scoreboards, restrained red live indicators and native platform controls.

References: the existing 4M Home redesign; Padel Nachos Dubai P1 tournament and Aragon/Roglan–Nunes/Sans match pages supplied by the user. Adopt the hierarchy (live/upcoming, latest point first, set/game drill-down); keep 4M styling. Do not copy editorial content or invent fan predictions, point timestamps, individual servers or broadcast links.

## Decisions

- Tournament overview shows live matches and named upcoming fixtures across main and qualifying draws for the selected gender. The Matches screen defaults to all draws.
- A live match opens on Live feed. The latest game is expanded; past games can be opened individually. Scores remain in team order. Only an unambiguous recorded transition identifies a point or game winner.
- Set results, current game score, serving team, coverage and update time have distinct labels. Partial coverage is explicit. Provider data can be revised.
- Optional rivals, Elo form and pair synergy load only when requested. Main-draw rivalry records and qualifying-inclusive form must never be labelled as the same statistical scope.
- All professional data stays behind authenticated Edge Functions. Provider credentials remain server-side; IDs retain separate player, pair, match and tournament meanings.
- Shared request leases, daily/monthly budgets, stale fallback and foreground-only refresh remain in place. Active resources have shorter cache lifetimes; finished data stays cached for seven days. Budget exhaustion pauses freshness and is shown to the user; this is not a guarantee of uninterrupted real-time coverage.

UI skills: unslop by Damir Sokolovsky (https://x.com/heydamir), CC BY 4.0; better-ui. Native segmented controls and platform buttons reuse the current app components.

## Live transport

Official reference: https://padelapi.org/docs/websockets . Initial state and reconnection recovery use the authenticated REST proxy. While the match is open, the platform WebSocket subscribes to the exact provider-issued public channel. No REST token or app-user identity enters that connection. It disconnects on blur/background or final confirmation, reconnects with backoff and heartbeats, and validates match identity before accepting a full snapshot. REST remains a fallback; periodic metadata refresh is slower while connected. No native dependency/build change is needed.

## Deployment verification

No database schema or grants change. Existing authentication and provider budgets are preserved. Deploy the authenticated `pro-padel-explore` proxy and private `pro-padel-provider` gateway with the shared cache module. Verify anonymous rejection, existing match details/qualifying data, optional insight availability and source response identity. Roll back the affected function if existing match reads regress or authentication failures rise. Before this update the deployed versions were explore 15 and provider 3; source is retained in Git history. A simulator review checks native selectors, live-feed expansion and the tournament-to-match route; it does not certify Android device rendering.

Verified deployment: explore v16 and provider v4; anonymous requests return 401. The provider returned 10 rivals for player 65 and 10 for the provider-issued pair 65–66. Form and synergy returned subscription unavailable, confirming that the current subscription does not include Business insights. The live channel accepted a real WebSocket subscription; no point event occurred during the initial 40-second smoke window. Unit tests cover pushed snapshots, identity rejection, reconnection repair, heartbeats and final completion.

Simulator review (iPhone 17 Pro, iOS 26.5): corrected the calendar's legacy detail-sheet route so provider tournaments open the same tournament centre as Home. Removed the unused legacy fixture/detail loader; official FIP-calendar events retain their separate route. The new centre preserves Add to calendar. Verified Dubai's live qualifiers, native set/view selectors, current-game collapse/expansion, player details, and live score progression from 4–4 to 5–4. Compacted the scoreboard using provider-issued short names; full names, IDs and profile navigation remain intact. Android rendering still requires a device/emulator review.

Final review: Stats, Players and H2H native tabs switch correctly; H2H displays zero recorded meetings for this pair matchup. The current-game panel updates through 0–0, 15–0, 30–0 and 40–0 while the live connection remains active. Left the simulator on Live feed. Final validation: TypeScript and all 600 mobile tests pass; `git diff --check` is clean.

## Compact match UI revision

Audit: heavy live outlines, oversized individual game cards, repeated full pair names, sparse photos and redundant captions obscured the score hierarchy.

Product: fast match tracking for padel players and fans.
Character: precise, courtside, restrained.
World: tournament scoreboards and real player portraits.
Moments: a compact ink scoreboard for live play; a continuous point timeline with small pair portraits.
Signature: aligned set/point columns and a serving-team marker, shared by the tournament and match screens.

Reference lock: the user's compact dark score row sets density and column alignment; the existing 4M match centre supplies the ink/green palette; the existing native iOS/Android pickers supply interaction. Use portraits as content, remove heavy coloured outlines, preserve unknown-score and missing-photo fallbacks. Game summaries show the cumulative score after a confirmed game rather than its pre-game score. Timeline points use short pair labels with full accessible names.

Photo loading: one bounded batch (up to 32 professional IDs) from the existing server-only public-sports cache, with explicit projection of photo URL/country/ID. Photos never resolve by name or local player-account ID. Client requests coalesce, deduplicate and cache; draw lists load portraits only for visible rows. No new database table, grant or migration is needed.

The portrait endpoint additionally verifies each cached payload's `/api/players/{id}` resource identity before projecting it, so another resource with the same numeric ID cannot supply a portrait. Deployed `pro-padel-explore` v17 with JWT verification retained. Simulator verification shows real Araujo, Leygue, Moya, Abud and Belluati portraits; unavailable portraits keep initials. Verified compact score columns, serving marker, flat per-set game grouping, current/past game expansion and live point updates. Final checks: 606 mobile tests and TypeScript pass. Android visual review remains pending.
