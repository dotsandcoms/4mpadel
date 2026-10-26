# Finance overview — first review batch

Route: `/admin-preview/reports` (Money → Finance reports).

## Table sorting

Ledger Date/Amount and summary name/count/gross/refunds/net headers toggle ascending/descending with aria-sort and keyboard-operable buttons. Sorting applies after filters and before pagination; Excel receives the same ordered full result set. Sort changes reset pagination. Numeric amounts (including negative refunds) compare numerically; dates compare timestamps rather than ISO text, with missing dates last and stable ID tie-breaks. Source arrays remain unchanged. All 88 tests and build pass; synthetic browser checked ledger amount toggling and summary net sorting.

## Slow linked-detail loading

User reported long apparent hangs. Code trace found serial batches of 50, each followed by an empty request even when all requested IDs had returned. Loader now uses up to four concurrent batches, skips redundant empty reads for fully returned ID batches, retains short-page handling for server caps/missing rows, preserves result order, and cancels workers on failure/abort. Progress reports requested payment IDs checked, not invented linked-record counts. Drawer shows determinate progress and aborts after 45 seconds with retry guidance; incomplete totals are never rendered. Synthetic 2,000-ID test confirms 40 requests instead of the prior 80 and maximum concurrency four. All 84 tests/build and synthetic event-drawer completion pass. Actual live latency was not measured; database/network delay may still contribute.

## Event-payment summary — first batch

View event payments groups the applied period's ledger by the joined calendar.id. Same-name events remain separate; missing joins remain separate per payment. Reuses FinancePaymentSummary for search, pagination, gross/refund/net totals, Excel and in-drawer ledger drilldown/back navigation. Adds only calendar.id to the minimal payment-link query. Includes all linked payment types (including licences), explicitly not organiser settlement or entry-fee-only collections. Live EventFinance registration reconciliation, payouts and editing flows are not replaced or removed. Shared export helper renamed financeSummaryExcel; obsolete player-only component name removed. All 83 tests and build pass; synthetic browser checked event grouping/drilldown/back and player-summary regression. Live-data reconciliation remains pending.

## Player-summary Excel

Summary drawer now exports all matching records across pages to Player payments and Export details worksheets. Includes linked/unlinked identifier, receipt count, gross/refunds/net, reporting period, search, timezone and privacy/accounting disclosures. Values remain numeric and names literal; totals are checked for safe-integer overflow. Export is disabled for empty results and download is suppressed after summary unmount. No new data requests. Workbook tests cover 12 records, unlinked identity, formula-like names, negative net and invalid totals; synthetic browser checked filtered completion and empty-state disablement. All 81 tests and build pass.

## Player-payments summary — first batch

View player payments opens the approved right-side drawer with profile pictures, name/ID search, ten-row pagination, receipt count, gross, non-failed refunds and net for the applied period. Selecting a record drills into its ledger within the same drawer, with Excel export and a back action that preserves summary search/page. Grouping uses the joined players.id only; same-name players remain separate and missing joins are grouped per payment rather than guessed. The existing minimal payment-link select adds only the player ID. Exports include explicit selected-player scope.

This is period-based receipt/refund reporting, not full UserPayments parity: no zero-activity player directory, failed/pending receipt history, inferred licence status, balances owed or deletion actions. Platform-super-admin restriction remains. Refero direction reuses the approved table, avatar and drawer patterns. Synthetic browser verified opening, ID search, single-player drilldown, back/search retention and Escape; screenshot reviewed. All 79 tests and build pass. Live-account reconciliation and delegated backend access still need separate verification.

## Loading and export-lifetime checks

Added regression tests for 123 unique linked payment IDs, deduplication, batches capped at 50, a simulated server cap of 17, later-page failures, cancellation, and denied tenant contexts issuing no queries. Tests assert minimal selects exclude wildcard/email/metadata. Overview Excel now captures an access-context lifetime token and suppresses delayed download/status updates after unmount or context change. All 77 Node tests and build pass. This is client lifecycle protection, not backend authorization acceptance; database scoped-access verification remains outstanding.

Ledger details now use a right-side native modal dialog rather than an inline bottom panel. Fixed header, independently scrolling body, Escape/backdrop close, focus wrapping/restoration and reduced-motion support were checked in a synthetic browser at 1280px and 390px. User approved this direction; other modules are not automatically converted.

## Combined ledger checkpoint

View combined ledger opens all eligible payment types in the applied period, using the existing detail component, ten-row pagination and Excel export. Search includes readable payment types and methods as well as linked identities/references. Each row retains its payment type, including refunds of earlier receipts; Excel adds that classification as a separate column. This is a receipts/non-failed-refunds ledger, not a complete all-status Paystack transaction manager. No new permissions, writes or metadata queries. Refero reference lock preserves the user-approved detail layout. Synthetic browser checked combined rows and readable type search; screenshot reviewed. All 73 tests and build pass.

Live-source issue to address before rebuilding delegated player payments: UserPayments.jsx fetches players with wildcard nested payments then filters allowed events client-side. Do not reuse this as an authorization boundary. The new preview remains platform-super-admin-only pending verified scoped backend access. Live component unchanged.

## Ledger Excel export follow-up

Ledger details now export all matching search results across pages to native XLSX, using only already-loaded authorised records. Includes period/search/scope disclosures, linked names/events, references, receipt/refund status and signed numeric Rand amounts. Missing links stay explicit; database text remains literal Excel strings. Empty results disable export, and leaving the detail view cancels delivery of a pending workbook. No extra database requests or permission changes. Workbook round-trip tests cover 12 rows, negative refunds, totals, literal formula-like names and invalid inputs. All 74 Node tests and build pass; synthetic browser verifies completion and empty-search disablement. Live signed-in reconciliation remains a separate review.

The obsolete preview CSV helper and CSV-only tests were removed with user approval. Equivalent report-context and invalid-input tests cover Excel. The papaparse dependency remains because archive/debug-scripts/import_players.js still imports it; that separate importer was not removed.

## Payment-type drill-down

Payment-type buttons open a read-only inline ledger for the applied period. Receipt and refund rows independently follow the same period/status/test exclusions as the overview; refunds of older payments reconcile without repeating the old receipt. Search covers linked player name, event, payment reference/ID, entry kind and status; pagination is ten rows. Confirmed payments_player_id_fkey and payments_event_id_fkey from exported deployed schema. Minimal linked fields are loaded on demand for the relevant payment IDs in batches of 50, paginated within each batch. No email, financial metadata or guessed player matching. Missing links and read failures are explicit, requests abort on unmount/context change.

Reference lock: preserve current Finance table spacing, teal text actions, inline detail navigation and existing avatar treatment, following Refero methodology with user screenshots/current UI as source. Synthetic browser check passed for opening details, linked identity/reference and empty search; screenshot reviewed. All 72 Node tests and build pass. Real-account joined query and record reconciliation still need signed-in review. This is not the complete transaction-management module and does not enable payment edits or broaden delegated access.

## Aggregate Excel export

Export Excel uses the applied period, all payment-type rows (not table search/pagination), totals and previous-calendar-month comparison when selected. Summary and Payment types worksheets include timezone, currency, generation time and refund/date-basis disclosures. No additional queries, identities or permission changes. Unknown labels remain literal text cells; monetary cells stay numeric, including negative net receipts. Workbook tests cover totals, text safety, context, all supplied rows and invalid inputs.

## Period and spacing follow-up

Added All time, Year, Month on month (selected full calendar month versus previous full calendar month) and inclusive custom dates. Draft controls apply together using Apply period; reversed/invalid ranges are rejected. Timestamp boundaries use Africa/Johannesburg consistently. Comparisons show absolute currency changes, including when the previous total is zero or negative, without misleading percentage division.

User screenshots identified missing breakdown-panel inset. Explicit panel padding now surrounds title/search, notes, table and pagination. Period controls have a padded container and consistent heights. Cards remount on applied-period changes and refresh for staggered opacity/translate entrance; reduced-motion disables animation. Existing colour/icon roles retained following Refero's reference-lock workflow. Synthetic browser inspection confirmed new controls render. Pixel-level/user review remains needed. All 65 tests pass, including leap-month, January rollover and inclusive SA midnight boundaries.

## Design lock

Refero tools were unavailable; followed the bundled craft guidance and existing user screenshots/design system. Primary target: current light admin-preview canvas and typography. Preserve restrained numeric colour, faint decorative background icons, thin borders, compact labelled controls and explicit pagination. No new imagery, heavy accent borders or changes to the live admin. User screenshots supply card treatment; existing preview supplies navigation and typography; craft guide supplies form labels, focus and table semantics.

## Source and accounting boundary

Read `src/components/admin/FinanceManager.jsx` and `FinancialDashboard.jsx`. This batch reads only successful payments and non-failed refunds, paginating both sources. Test receipts are excluded; refunds must link to an included successful payment. All-time gross/refunds/net follow the dashboard basis. Year selection uses payment date and refund processed/created date separately, so a refund for a prior-year payment remains visible in its refund year.

Payment types are shown exactly as recorded, without inferring full/temporary licence categories from price. This intentionally does not claim parity with the old dashboard's inferred licence buckets. Values are summed in cents; missing/invalid amounts cause an explicit error. Non-failed refunds include pending refunds, matching the existing source; this is labelled in the UI. These are not Paystack balance, payout, profit or organiser settlement figures.

## Permissions

This first platform-wide overview requires a signed-in super admin and `all` workspace before issuing its queries. Delegated Finance/dashboard grants and organisation/club contexts receive a clear unavailable state and no requests from this component. This temporary preview restriction does not change existing live admin permissions. Backend authorization weaknesses remain tracked separately; the UI check is not an RLS fix.

Session/scope/role changes remount the workspace. Pending requests are aborted and stale results ignored. No writes, Edge Function calls, payment synchronization, emails or production deployment.

## Verification and next review

- Four new calculation/access tests cover refund-year attribution, test/status exclusions, invalid amounts and denied users making no query.
- Vite build passes (existing gradient/import/bundle warnings remain).
- Synthetic-only browser harness at `tests/admin-preview/finance-qa.html` rendered totals, filter, search and 5-row pagination in accessibility inspection. Live browser is signed out. Pixel-level screenshot validation and live reconciliation remain pending user review; do not call this a full visual or accounting acceptance.
- Next: review signed in as super admin, All 4M Padel → Money → Finance reports. Check spacing, figures and year selection. Continue with scoped reporting, licence reconciliation, transaction drill-down/export and remaining Finance sections in separate batches.
