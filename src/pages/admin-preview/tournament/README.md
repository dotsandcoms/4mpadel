# Light-admin Tournament Manager

Source: current MAIN `/Users/bradein/Sites/4m-Padel`, copied selectively on 19 October 2026. `utils/` is the required tournament pure-logic dependency graph, not the worktree's older native-draw implementations. `playerRankingSelection.js` is the MAIN shared function implementation rather than its relative re-export. The four workspace controllers retain the source RPC contracts, capability checks, revision checks, draw generators, schedules and result rules. No migration is included or required by this integration.

## Shell contract

```jsx
<TournamentWorkspace
  client={supabase}
  session={session}
  scopeId="all"
  refreshRevision={revision}
  canBuildEvents={canBuildEvents}
  onCreateEvent={() => openNewEventEditor()}
  onEditEvent={(event, refresh) => openEventEditor(event, refresh)}
/>
```

Import `./tournament/TournamentWorkspace`. Requires the shell's React Router. Preserves all shell query parameters, including `page=tournaments`; owns only `event`, `workspace`, `division`. Changing event, identity, scope or refreshRevision remounts the workspace. Parent should avoid changing refreshRevision for routine modal open/close. `onEditEvent` gets a snapshot event, not a complete EventBuilder record: load the authoritative editable record using the existing editor logic. No old EventBuilder or profile modal is rendered.

Raw Supabase clients are adapted using `createTournamentClient`. Before mutations the displayed session's user ID must still match fresh `auth.getUser()` and scope must be `all`. Existing narrow `tm_*` RPCs enforce actual tournament capabilities and expected revisions. Injected source-shaped clients are supported for synthetic QA. No credential, service key, private data or test access bypass is included.

## Deliberate UI safety changes

- Schedule entry does **not** save automatically. “Generate private schedule” is explicit; the source generator and `tm_save_schedule` arguments are unchanged.
- Publishing the schedule asks for confirmation; draft/public distinction remains visible.
- Single-flight action guard prevents double-click writes; event/identity-bound loads discard stale completions.
- Every action failure locks further changes until an explicit successful fresh-snapshot refresh. A failed refresh retains that barrier. Captured event/session/scope contexts are invalidated on navigation/unmount; each subsequent mutation checks that context both before and after fresh authentication. An already-sent RPC cannot be cancelled or assumed rolled back.
- Sequential format→seeds and settings→schedule operations report partial completion truthfully. These remain separate source RPCs, not an invented transaction.
- Searchable dropdowns reuse the light admin's existing component. Player text search includes email as well as names.
- Legacy dark style tokens are replaced with light admin surfaces. Bracket layout logic is retained with light styles. Native dialogs trap focus and restore the invoking control.

## Source limitations and bounded profile boundary

Finances displays registration payment status; it does not introduce refunds, settlement or Paystack transfers. Finalisation does not award ranking points or federation approval. Manual group-tie resolution is not implemented in source; backend rejects unresolved qualification ties. Event creation/edit callbacks must be wired by the shell.

Known source concurrency limitation for release review: `tm_save_draw` checks the confirmation revision, not the existing private draw's `updated_at`. Two managers using the same confirmation revision can overwrite one another's private draft. This needs a separately approved backend contract improvement; this UI batch does not change that contract or claim to solve concurrent-manager private-draft overwrites.

Player details show only `tm_snapshot` fields and event registrations. The old profile modal performed a separate broader `players` query and licence hydration. This integration intentionally does not expand tournament-only access to contact/preferences/bio queries. A fully authorized player-directory callback/read contract is needed for that optional expansion.

## Verification

`node --test tests/admin-preview/tournament-*.test.mjs` runs isolated source draw/scheduler/PDF regression tests and RPC guard/capability tests.

`node tests/admin-preview/tournament-qa.mjs` uses the local Vite fixture on port 5175 with synthetic records and a fake client. Browser interception and fixture CSP block external hosts. It checks all workspaces, capability routing, no mount writes, explicit private-schedule generation, profile/registration dialogs and mobile overflow. These tests do not claim production RPC integration verification and never publish production draws, results or schedules.

Visual lock: existing light admin (`AdminPreview.css`), with its paper surfaces, lime primary actions, muted borders and readable green statuses. Source workspace structure and compact tournament progress rail are retained; no new visual system or decorative assets.
