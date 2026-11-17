# Current-registration settlement

Registrations is the source of truth for the event finance screen, finance
overview, payout request limits and both Excel reports. They use the same active
email/division entries and the same per-entry allocation amounts.

The balance due from 4M is current-entry funds allocated to 4M, less a 5% fee
rounded once to cents, less completed organiser payouts. Direct club/organiser
payments earn no fee and are already retained by the organiser. Unknown
recipients and outstanding fees do not become 4M income or payout cash.

For the supplied example: 200 entries × R600 = R120,000; four direct club
payments = R2,400; 196 payments to 4M = R117,600. The fee is R5,880 and the
transfer due before any completed payouts is R111,720.

Allocation shares already exclude completed refunds, pending refunds and unused
credits. Those amounts must not be deducted a second time. A refund funded by a
different holder is shown separately as a signed funding adjustment. Withdrawals,
original receipt totals and unallocated cash remain in `cashHistory` and the
receipt/withdrawal sheets. An unclassified historical receipt that funds no
current entry remains a history review item; it does not block a separately
funded current-entry payout. Issues affecting current allocations still block
payout requests.

An external payment may cover multiple entries. Distinct successful admin
confirmations with explicit 4M recipients and different registration IDs can
share one external receipt. Their allocations are combined once. A verified
gateway amount caps the receipt, and duplicate entry confirmations remain a
review item. Preserve the external reference and original notes when correcting
recipient classifications; do not insert another payment.

Excel Summary formulas link to totals on Registrations. In the full report,
`Current entry` excludes withdrawals and duplicate non-current rows from those
totals. Filters do not change settlement totals. Insert new records inside the
data range before its last record, keeping the `Current entry` flag with the
record. Local Excel edits recalculate that file; website balances change only
when the corresponding event records are updated.

The existing `grossEntryFees` report field now represents funds allocated to
current entries after refunds/reserves. Original gross receipt amounts are
`cashHistory.grossEntryFees`; reports label these measures separately.

Run the finance calculation, export, overview and browser tests and `npm run
build` before release. The build regenerates
`supabase/functions/event-finance-summary/summary.mjs`. Deploy the summary
function and frontend together (worker first). The client requires the
`current_registrations_v1` basis and rejects an older worker's figures, so a
partial release cannot silently show the previous calculation.

## Production release — 11 November 2026

Published the website as `dpl_CaTcnDfy2XBrVDYsb5fycLJoECn1` on
https://4mpadel.co.za and the `event-finance-summary` function as version 4.
The function was published first with its existing authentication preserved.
The website source was assembled from the live production deployment, with the
seven finance modules overlaid and two normal build outputs regenerated. The
801-file source manifest was verified before promotion; 792 original files were
preserved exactly. Local environment files and financial review data were
excluded from the deployment.

Validation passed for the focused finance/export tests, ten isolated browser
checks and the exact release source's production build. Six live routes returned
200, and eight deployed JavaScript assets matched the verified candidate hashes.
The deployed summary function's retrieved source matched the tested bundle;
anonymous summary requests still return 401 and CORS preflight succeeds.
Fresh Nationals registration data produced 196 entries paid to 4M, four direct
organiser entries, a R5,880 fee and R111,720 due in the deployed summary code,
payout limit and both workbook builders. The amount-due row is highlighted and
summary fills are limited to the table's three columns.

Release evidence is in `outputs/registration-finance-release-20261111/`.
If this release requires rollback, promote the prior website deployment
`dpl_7XMsbbb8FtVPQf49jqtJutukiyCf` and restore the version-3 summary files and
authentication setting recorded in `edge-before.json`. No schema migrations
or financial transactions were performed by this deployment.
