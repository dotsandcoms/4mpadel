# Event finance summaries

The event list loads calendar/completion metadata first. It requests summaries
for visible events in batches of 5; completed events join those requests when
expanded or searched. Registration details load only when opening an event.

This function uses the caller's Auth token and bounded
`event_finance_overview_source` RPC batches. The RPC checks every requested event and
retains caller RLS. It has no service-role bypass and is not executable by anon.
The legacy gateway JWT verifier is disabled for compatibility with ES256 and
publishable keys; `getUser(token)` validates every user session in the handler
before the permission-checked RPC runs.
Source rows stay on the server; responses contain only list statistics and the
settlement fields used by the list/footer. Summaries are read-only estimates;
payment, payout and export workflows retain their existing fresh-data checks.

The financial rules come from `src/utils/eventSettlement.js`. Regenerate the
deployable bundle with `node scripts/build-event-finance-summary.mjs` (also run
by `npm run build`). Do not edit `summary.mjs` directly. The parity test checks
that the bundle matches the current report rules.

Deployment order:

1. Apply the forward migrations `20261110072130_event_finance_overview_source.sql`
   and `20261110073604_optimize_event_finance_summary.sql`. Do not reset the hosted project or replay historical migrations.
2. Deploy the `event-finance-summary` Edge Function, including `summary.mjs`.
3. Publish the frontend.

Without the new backend, event metadata still renders and totals show a retryable
error; the frontend does not silently fall back to downloading the ledger.

The frontend cache is memory-only, expires after two minutes, is partitioned by
account/permission/tier scope, and clears on sign-out. Returning from an event
invalidates that event's cached figures; metadata and visible summaries refresh
in the background. Cached figures never authorize financial actions.

Validation:

- `node --test tests/eventFinanceSummary.test.mjs tests/eventFinanceOverview.test.mjs tests/eventSettlement.test.mjs`
- `npm run test:data-api`
- `tests/eventFinanceOverviewSource.sql` on a disposable PostgreSQL instance
  using port 55446; the fixture rolls back all objects and data.

The production backend was deployed on 10 November 2026 (function version 3).
The caller confirmed totals load successfully after the bulk lookup/index fix.
