# Draw workspace overhaul

## Shared database installation — 12 October 2026

Installed `20261012083248_event_manager_draw_workflow_dependencies.sql` in the shared 4M Padel project (`uzglrpbixubfijvjbtgz`) with explicit user approval. This supplies the Event Manager workspace's missing `draw_player_reviews` table and organiser RLS policies, the current individual/Team Americano save function, court-conflict trigger, feeder progression function and play-day removal function. Existing match fields and the Americano format constraint were already installed by Tournament Manager's compatibility migration and were not replayed.

Verified the table through the Data API after the schema reload. Authorised review insert/update/read and unauthorised read denial passed in rollback transactions. The migration creates database objects without invoking the event-changing functions; it does not regenerate draws or rewrite event, registration, result or schedule records. Localhost still uses this shared database, so subsequent organiser saves affect the selected real event.

With separate user approval, installed `20261012084209_restrict_draw_court_trigger_execution.sql` to revoke direct execution of the internal court-check trigger from PUBLIC, anon and authenticated. Verified both client roles lack direct execution, the court-conflict trigger remains enabled, and authenticated organisers retain the draw-save RPC. The trigger return type is also excluded from the HTTP RPC schema (verified 404).

## Research and design decisions

Reviewed RankedIn’s signed-in tournament Draws and Times screens on 10 September 2026, read-only. Its useful patterns are a persistent class selector, participant count, explicit publication status, separate draw/scheduling/match-operation stages, and predefined competition structures. No RankedIn event data was modified.

Reference lock: retain 4M’s dark canvas, existing typography, fine borders and lime primary actions. Use RankedIn’s stage separation as the interaction reference; use the supplied 4M screenshot as the brand reference. Refero’s bundled form/accessibility guidance informs labelled inputs, clear state, responsive grouping and advanced disclosure. No photography is needed for this operational interface.

The draw workspace now has Setup, Review, Schedule and Run. Ranking sources, seed percentages, plates and placement playoffs live under Advanced. Pair search and round filtering help operators manage large fields. Announcements are collapsed while recording results. Existing knockout, group, group-to-knockout, plate, result and ranking-award functions are retained.

## Competition templates

Templates apply to the selected existing division; they do not create events, invent entrants or change registration limits.

| Competition | Entries | Default structure | Matches |
| --- | --- | --- | --- |
| Ladies Americano | 16 individuals | 15 rounds, 4 courts, 24 rally points | 60 |
| Men round robin | 64 players / 32 fixed pairs | 8 groups of 4 pairs | 48 |
| Men Division 2 | 32 players / 16 fixed pairs | 4 groups of 4 pairs | 24 |

The client did not specify group counts, so groups of four pairs are editable defaults. A single round-robin group is also available: 496 matches for 32 pairs or 120 for 16 pairs. The setup displays actual field and match counts before generation. Incomplete fixed pairs are rejected with a registration-repair message.

## Americano rules

Sources:
- https://americano-padel.com/americano-americano/en — individual points, new partners, fixed rally totals.
- https://padelinoapp.com/guides/americano-padel-schedule — full partner rotations for 8, 12 and 16 players.
- https://padelfast.com/formats/americano — rotating partnerships and rally-point scoring.

The organiser can enter a custom positive whole-number rally total (default 24; stored as a 32-bit positive integer).

Implemented convention: every match has a fixed **combined** point total, not first-to-N. A 24-point match may finish 14–10 or 12–12. Both partners receive their side’s score. Standings sort by points, point difference, then wins; exact ties share a position. This is a disclosed product convention, not a universal governing-body rule. The suggested serve rotation is two rallies per player.

Supported fields are 4–64 individuals in multiples of four. A full rotation is N−1 rounds, with each partnership occurring once. Shorter rotations are allowed. Opponent repeats are minimised greedily; perfect opponent balance is not promised. Fewer courts produce sequential waves, with all waves completed before the next round. No sit-out points, mixed-gender pairing restrictions or Mexicano reseeding are implied.

Every individual needs a paid, non-withdrawn registration. Reciprocal partner names are not independently converted into entrants; only registration owners enter, deduplicated by player identity/email. The existing admin registration screen supports solo entries. For public solo signup, configure the event’s partner requirement appropriately; per-division registration-form rules are outside this draw change.

## Persistence and scheduling

Apply `supabase/migrations/20260910140000_americano_draws.sql` before using Americano saves. This migration was tested locally; it has not been applied to a hosted database.

Americano’s frozen individual list, pairings, settings and scores live together under `draws.scoring_rules.americano`. A transaction validates registrations, format, scores and state transitions. An optimistic timestamp prevents stale sessions overwriting newer results. Published pairings/settings are frozen; played match times are protected, scores remain editable until completion, and every fixture must have a result before completion.

Schedule uses event play days, match duration and round rest. Complete waves are assigned within available hours and avoid existing court reservations. It fails without returning a partial schedule when there is insufficient time. Preview and save court times directly in Schedule, before or after publication. Rescheduling preserves the played portion of the rotation. The organiser can choose to publish without assigned times.

On publication, fixtures are mirrored as court reservations in `draw_matches`, keyed by `americano_fixture_key`. They are read-only in the fixed-pair scheduling board. A server trigger prevents a timed booking from overlapping an Americano reservation, including saves made after an older preview. Individual scores/public standings use the Americano state, not the fixed-pair group standings table. Published court times remain editable until completion; player substitutions are not supported.

Existing fixed-pair draws cannot be converted into Americano in place; select a division without a saved fixed-pair draw. This avoids rewriting existing draw history.

## Verification

- `node --test tests/americano.test.mjs tests/drawScheduleBoard.test.mjs`: 25 passing tests, including full partner cycles through 64 players, score correction/ties, field rejection, requested men’s formats, and timed court/rest constraints.
- Full `node --test tests/*.test.mjs` run: 35 passing tests.
- Production Vite build passes (existing bundle-size warning remains).
- New/changed manager, header, Americano component and utility pass targeted ESLint. The existing public page has unrelated `motion`/hook-dependency lint findings.
- Isolated PostgreSQL: migration applied; save/publish/score/complete tested; stale saves, locked settings, invalid totals, incomplete completion and unauthorized event rejected. Verified 60 shared court reservations and overlap rejection.
- Browser QA uses the real React components with synthetic registrations and a local in-memory Supabase replacement. Verified men’s generation-to-Review, Americano save/publish/score entry and individual totals, plus mobile layout. Hosted database integration remains a deployment check.

### Calendar adjustments
The fixed-pair scheduling board uses a day calendar with time rows and court columns. Drag cards onto time slots or select a match and click a slot; selection survives switching play days. Moving an assigned match preserves its duration. Preview validation blocks court/player clashes, insufficient rest and out-of-hours moves; Save schedule applies valid changes, while Discard restores bookings. Started matches remain read-only.

Design reference lock: preserve the existing 4M dark canvas, typography and sky-blue scheduling actions from the supplied workspace screenshots. The Refero bundled craft guidance supplies keyboard focus and form clarity. Use a vertical time axis, sticky court headers and a persistent selected-match card to make calendar moves legible; no new visual theme or imagery. Browser QA verified moving a scheduled sample to another day/court in preview and discarding it without changing saved bookings.

Selected-match timing allows an optional duration override and a SAST not-before date/time. Extra minutes extend the court reservation; earliest starts constrain automatic and manual placement. Existing bookings that become invalid must be moved before saving. The not-before rule also blocks early transitions to live in the database. Apply `20260910180000_match_timing_constraints.sql` before deploying these controls. Delays do not automatically move other matches; conflicting bookings are flagged for the organiser to adjust.

### Upfront backplates (Bloem Open reference)
Read-only inspection of Bloem Open Men's Open (RankedIn event 74119, class 175136) confirmed displayed ranges 3–4, 9–16, 17–32 and 25–32. New knockout previews include enabled Double/Triple plates immediately; Full placement creates every finishing-position branch. All branches use explicit winner/loser links within the same draw and appear in Review and the public bracket. Unknown feeder outcomes are labelled Winner/Loser, not BYE. Genuine empty paths resolve to walkovers/cancelled fixtures through `resolve_draw_routes`; apply `20260910200000_resolve_draw_routes.sql` before deployment.

The scheduling calendar accepts feeder placeholders, preserves bookings as entrants arrive, and conservatively protects every potential entrant's rest. This may reserve more sequential time than an organiser can safely compress once actual entrants are known. In groups + knockout, the elimination phase and its backplates are created once group standings are final. Existing published separate Silver/Bronze draws retain their prior flow; this does not silently rebuild a published draw. For existing drafts, regenerate and save to adopt upfront branches (as with other regeneration, this replaces prior draft match bookings).

Validation: 61 unit/regression tests including complete 32-pair placement coverage, 17-pair bye progression, unique persisted route positions and placeholder scheduling/rest. Isolated PostgreSQL test verified chained loser/winner routing through bye paths. Browser inspection verified upfront placement sections and feeder labels. No RankedIn data modified and no production migrations applied.
