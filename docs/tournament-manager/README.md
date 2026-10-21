# Tournament Manager — local implementation

Branch: `brad/tournament-manager`. This is a separate admin module built on the existing native tournament records and local draw implementation. Event Manager remains available. On 16 September 2026, the user chose the shared Supabase database for real-data review. The five additive Tournament Manager migrations are now installed there. No application deployment, Git push or merge was performed.

## Review inside the existing system

Run `npm run dev` and open **http://localhost:5173/admin?tab=tournament-mgmt**. Sign in with your normal admin account. Tournament Manager appears in the existing admin sidebar and reads the existing calendar, registration, player and native draw records. The local development banner makes clear that saved changes affect the shared system.

The connection was verified for all **17 native events**, **6 existing draws** and **134 existing matches**, using the authenticated database role. Migration installation did not change entrants, results or schedules. No new schedule or workflow audit rows were created during validation. Unauthenticated API calls correctly return permission denied. Signed-in browser verification confirmed the integrated tournament list and Cape Town Open overview (5 divisions, 106 registration records), plus its Men's Open player list (40 active registrations) without errors or saves.

The branch isolates application code; it does not isolate shared-database writes. Use the synthetic demo below when experimenting without changing real records.

## Optional isolated demo

```sh
npm run dev:tournament
```

Open http://127.0.0.1:5186/. This isolated demo uses synthetic data in this browser's local storage. Its Vite resolver replaces all Supabase imports, its environment directory excludes the project's live environment, and its CSP prevents calls to hosted services.

- **Published draws** starts with three divisions ready for scheduling. Open Schedule to generate the private court plan.
- **Start preparation**, followed by **Reset demo**, starts with registrations and no draws. Confirm Players, confirm Format and Seeds, generate/save/review/publish each draw.
- **Preview as** switches between administrator, draw/schedule, results and finance views. This is a demo control; live permissions come from authenticated RPCs.
- Moves can be made by dragging, or selecting a match and clicking a free court/time slot. Save the draft before publishing. Manual moves are pinned during regeneration.
- Finals: Ladies Open at 17:00 on the last day on Court 1; Men's Open at 18:00 with the default 60-minute duration; Men's Advanced at 17:00 on another court. These roles, court, duration, rest and allowed division days can be changed in Advanced settings.

## Implemented

The new admin navigation entry opens the tournament list and event-scoped workspaces: Overview, Event details, Players, Divisions, Draws, Schedule, Results, Finances, Activity and Access. The phase rail derives Setup / Prepare / Schedule / Live / Complete from stored readiness and results.

Preparation includes eligibility exceptions, inclusion/exclusion, player/partner editing, pending-payment entries, active-profile or explicit ranking-category seed order, format confirmation, private previews and deliberate draw publication. Existing knockout, round-robin, groups-to-knockout, Americano and team Americano generators are reused. Format and seeding revisions invalidate older previews.

Scheduling is tournament-wide. All active divisions must have published draws. The default plan accounts for feeder matches, possible participants, cross-division identities, court availability, earliest starts, rest, pinned moves and the finals programme. Future group elimination rounds reserve capacity. Qualification materialises those fixtures and carries across their reserved court times. An impossible plan reports a conflict instead of moving named finals or extending operating hours.

A saved schedule revision is private. Publication validates and updates existing public match times in one transaction. Source fingerprints and revision checks detect stale edits. Existing public schedules remain visible while private edits are prepared.

Results include live status, played scores, walkovers, retirements, winner/loser progression, group and rotation standings, correction reasons and division finalisation. Live views refresh every 15 seconds while visible and no result dialog is open. The backend rejects starting a court/player already in a live match. Results operators cannot alter schedules, draws, settings, access or completed results.

Access is event-scoped, backed by `tournament_access`, with capability presets and custom assignments to existing accounts. New private workflow tables have RLS and no direct client write grants; narrow RPCs enforce authorisation. Super admins retain access. Existing broader legacy permissions are not revoked by assigning a narrower Tournament Manager role.

Super admins can open the existing Event Builder from this module to create tournaments or edit event, fee and ranking settings. Existing Event Manager components and records were not replaced.

## Database integration

The main app route is `/admin?tab=tournament-mgmt`. The current local environment points to the shared Supabase project selected by the user. The migrations below have been installed and recorded in its migration history; do not replay them. They can also be applied to a separate environment with the existing native schema.

The new additive migrations, in order:

0. `20260916090000_tournament_compatibility.sql` — adds missing rotation/timing/play-day fields and permits the Americano format without replaying unrelated branch migrations.
1. `20260916100000_tournament_manager.sql` — private workflow/access tables, snapshots, settings and confirmation RPCs.
2. `20260916110000_tournament_schedule.sql` — schedule validation and atomic publication.
3. `20260916120000_tournament_operations.sql` — private draw persistence, results/progression and finalisation.
4. `20260916130000_tournament_preparation.sql` — scoped registration/division changes and group qualification.

They depend on the existing native-draw schema. The compatibility migration supplies the missing fields observed in the shared database. Unrelated older branch migrations and their legacy triggers were not replayed. The bundle passed a rollback transaction against the actual schema before being committed atomically. The RPC client shows a clear message when the Tournament Manager schema is unavailable.

## Review boundaries

This is a working local implementation for iteration, not a production release approval.

- Shared-database list/snapshot reads and authenticated access were verified for every existing native event. Write behavior is covered by the disposable PostgreSQL integration suite; real-event write and concurrent-operator acceptance testing has not been performed. The shared installation added schema and functions only.
- Finances currently shows shared registration payment status. Detailed settlements, refunds, exports and ranking-point awards remain in the existing Event Manager workflow. Finalising results does **not** award ranking points or approve federation results.
- Published preparation and completed divisions are deliberately locked. Reopening, complex substitution after publication and post-qualification group corrections still use the existing controlled correction workflow. Corrections that would invalidate already-started downstream matches are rejected.
- Unresolved standings ties block qualification/finalisation; a dedicated manual tie-resolution screen is not included in this first local version.
- Automatic live retiming and federation approval are deferred. An administrator can review and publish a revised schedule.
- The demo client simulates persistence and access for UI review. Database integration tests, not the demo, establish the server-side permission guarantees.

## Verification

```sh
node --test tests/*.test.mjs tests/tournament/*.test.mjs
npx eslint src/components/admin/tournament src/utils/tournament src/services/tournament sandbox/tournament-manager src/hooks/useAdminPermissions.js
npm run build
```

The SQL integration suite is documented in `tests/tournament/README.md`. Browser review covered automatic schedule creation/publication, the named finals, results-only navigation, match start and scoring, player → format → seeds → private draw → publication, and scheduling remaining locked while other divisions are unpublished. Responsive review at 390px and 320px found no document-level horizontal overflow; wide brackets, tables and court boards scroll within their own containers.

### Division exports, seed controls and placement guidance

Players/division preparation now offers full-division Team members PDF and Seedings PDF downloads using the same jsPDF library as DrawPlayerReview. Exports identify working copies and include every entry regardless of table pagination. Divisions → Edit includes position selectors, up/down controls, protected seed count and group/knockout guidance. Confirm seeds saves the current configuration and then the seed order using a refreshed revision. This is sequential: a failed second step reports the error and requires confirmation again.

Back-draw presets, selectable placement ranges and explanations reuse `drawBackplates` from the existing draw workspace. Custom ranges retain their required feeder matches. The tournament draw adapter now passes the selected protected seed count to both knockout and group generators. Published preparation remains locked.

Validation: 25 tournament/grouped-seeding/backplate/PDF tests passed; production build and targeted lint passed. Integrated UI seed movement and custom range selection checked without saving live records. PDF content/pagination was tested directly; the in-app browser did not expose a download event during the UI download check.

### Traidcor scheduling correction

Read-only reproduction against event 439 (Traidcor Atlantic Padel Open, 24–26 July 2026) found overlapping possible finalists in Men's Open/Advanced and 33 Americano fixtures using the 60-minute tournament default. Added explicit division final-time and duration overrides, detailed shared-player errors, and preflight generation before persisting settings. Playing dates now use readable formatted text rather than disabled native date inputs.

A local run using Advanced at 14:50, Open at the existing 16:00, and Ladies Intermediate at 20 minutes produced 114 bookings with zero client schedule conflicts. These values are a review proposal, not a published or saved schedule. Fifteen tournament tests, targeted lint and production build passed. Upcoming event 469 was not changed.

### Activity attribution

Activity rows now display `By <account name>` (email fallback), including historical actions. Migration `20260916140000_tournament_activity_actors.sql` enriches the authorised snapshot from the recorded actor UUID; it does not rewrite history or expose a general account lookup. Null actors show System and unresolved account IDs show Unknown account. Verified historical actor resolution on Traidcor in a rolled-back transaction before installing; anonymous snapshot access remains denied.
