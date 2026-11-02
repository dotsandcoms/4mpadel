# License dashboard

The admin Licenses page opens with sales totals, followed by the register,
temporary sales history, and prices/availability. All reports use South African
dates. Existing prices and sales availability are not changed by this release.

## Count definitions

- **Sold:** paid, non-test licenses with verified payment evidence. Refunds stay
  in gross unit sales and are shown separately. Complimentary coverage and
  unmatched imports are excluded from sold totals.
- **New Full:** a paid Full license for a player without a previous Full license
  at issuance. Temporary-only players buying Full coverage count here.
- **Renewal:** a paid Full license for a previous Full holder. A later revocation
  of the old license does not change the sale classification.
- **Temporary sale:** one player/event unit from the existing deduplicated sales
  ledger. Parent charges, allocations and repeated division entries count once.
- **Sales year:** purchase year. A 2027 license purchased in 2026 is a 2026 sale.
- **Current Full:** the latest currently valid annual license for each player,
  across coverage years. Overlapping 2026/2027 records count once.
- **Current temporary:** non-revoked, unexpired event licenses, including events
  that have not started. A player with current Full coverage is counted under
  Full. Multiple event licenses for one person remain separate license units;
  the distinct player count is also displayed.
- **Current renewals:** renewal holders included in the current Full count.
  This is a subset, not an extra category to add to the total.

Current-license cards cover all years. Clicking a card selects the matching
current records and clears the register's narrower filters. The table retains
separate coverage-year, type, date-status, payment-source and search filters.
It defaults to 10 records per page, with 25/50 options and navigation at both
ends. Exports fetch all matching records in explicit 50-row batches.

An upcoming event is labelled **Upcoming** in the date-status column while its
already-issued temporary license contributes to **Current licenses**.

## Payment presentation

The player panel groups allocations with their explicit parent reference.
After splitting, the parent payment amount is the event-entry portion. The
displayed checkout total restores that amount plus its recorded license splits.
For example, R600 entry + R120 license is one R720 checkout. Processing attempts
remain separate; unrelated payments are never grouped by event or timestamp.

Profile photos appear beside names in the register, lookup and player header.
Missing and failed photos fall back to initials.

## Access and validation

No public tables are created. The reporting RPC checks `can_manage_licenses`,
has an empty search path and an explicit authenticated execution grant; anonymous
execution is revoked. Private views/helpers retain no direct client access.
The Supabase advisor's authenticated-definer notice for `license_sales_overview`
was reviewed: the explicit license-admin check is required before private
reporting data can be returned. The isolated test rejects a normal player.

```sh
node --test tests/licenseReporting.test.mjs tests/licenseDates.test.mjs tests/temporaryLicenseAssignment.test.mjs tests/licenseCallbackReplay.test.mjs
node scripts/test-license-dashboard-db.mjs
npx eslint src/components/admin/LicenseManager.jsx src/components/admin/LicenseOverview.jsx src/components/admin/TemporaryLicenseSales.jsx src/utils/licenseReporting.js
npm run build
```

The database runner creates and removes a disposable local PostgreSQL cluster;
it never connects to a hosted database. It checks reporting, upcoming/current
semantics, refunds, deduplication, renewal classification, permissions, profile
photos and pagination, plus the existing license regression fixtures.

Visual validation used desktop and 390px mobile renders with sample data, plus
the authenticated admin UI against real records. Data API contract checks were
also run against the local grant-test database with automatic grants disabled.

## Design direction

The existing 4M product is the visual target: black canvas, rounded sans type,
lime brand accent and restrained panels. Refero's bundled color, typography and
visual-QA references informed the hierarchy: larger tabular figures, brighter
secondary copy, distinct section surfaces, and category colors used consistently
in the sales cards, legend and chart. No bitmap assets or external fonts were
added. Current licenses, paid sales and payment attempts have separate labels.

## Release evidence

Production source selection, previous deployment, candidate manifest, route
checks and rollback target are recorded in the ignored
`outputs/license-dashboard-release-20261102` directory. The release copies the
current production source and overlays only the five license runtime files, so
other published finance, profile and tournament changes are preserved.
