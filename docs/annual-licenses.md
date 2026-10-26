# Annual licenses — review release

**Bradein approved publishing the annual-license module for partner review on 19 October 2026. Annual sales remain closed until separately approved.** This supersedes the 15 October deployment hold for the module and its required backend changes only.

## Confirmed rules

- Previous Full-license holders pay R500 to renew for 2027. Temporary-only players pay the R650 new Full-license price.
- A new 2027 Full license bought during the remainder of 2026 covers the player immediately through 31 December 2027. Purchases during 2027 cover the remainder of that year.
- Existing 2026 records and coverage remain in history. New 2026 sales stay closed.
- Temporary licenses remain available separately, for each player and each event. Annual coverage takes precedence when it covers that event.
- A player's permanent `4M-` number stays the same across renewals. Numbers are private to the player and authorized admins.
- No additional license fee is charged initially. Shared fee settings remain in Settings; license prices and availability live in Licenses.

## Player and admin presentation

The player card shows Full-holder status, the permanent number, coverage dates and the purchase date. Imported 2026 Full coverage starts on its linked purchase date when known; otherwise it retains **1 January 2026**. The register, player panel, export and mobile screens use the same date. For example, a known 16 April purchase displays **16 April 2026–31 December 2026**. The purchase-line fallback does not insert a payment or change the historical ledger. Complimentary coverage displays its grant date.

The checkout lists missing profile fields and links to the profile editor. The required core fields are full name, email and mobile number. The account email is used when completing a missing player profile.

Playing hand and court side are optional profile preferences shared with the app. Web profile editors load and save `playing_hand` (`left` / `right`) and `court_side` (`left` / `right` / `either`) on the existing player record. They do not block license checkout. The pending checkout handler also allows an admin without a player profile to quote the selected player; the older server handler checked the admin's own profile first and could incorrectly report an incomplete profile during impersonation.

The admin register defaults to the current year in Africa/Johannesburg. Clicking a row opens that player's license panel. Its payment history includes unlinked historical payments, duplicates, failed payments and test payments with their actual status. Multiple ambiguous charges do not create extra licenses or fabricated revenue.

## Local review sequence

1. Review an existing 2026 Full holder: correct number and status, recorded purchase date or the January fallback, unchanged current coverage and R500 renewal quote.
2. Review a new player and a temporary-only player: R650 Full quote, immediate coverage through December 2027.
3. Choose a temporary license: select a specific event; check each partner has their own event coverage and their own price.
4. Remove required profile data in an isolated fixture: check the missing field names, Edit profile link, save and return to checkout.
5. Review the register on desktop and mobile: current-year default, search, filters, row navigation, payment history, pagination and CSV.
6. Exercise manual payment, complimentary grant, revoke and restore with a reason. Check administrator attribution, timestamps and audit history. Revocation alone must not refund money.
7. Verify saved checkout recovery, price changes, closed sales, duplicate callbacks, rejected test/failed payments, refunds and event-year eligibility in the isolated database.

Use mocked or isolated data for these checks. A local website configured with the production Supabase URL still talks to production; it is not a payment sandbox.

## Automated checks

From the repository root:

```sh
node --test tests/licenseCallbackReplay.test.mjs tests/manualEventPayment.test.mjs tests/adminEventRegistration.test.mjs tests/publicPlayerPayment.test.mjs
./node_modules/.bin/eslint src/components/PlayerLicenseCard.jsx src/components/LicensePaymentModal.jsx src/components/admin/LicenseManager.jsx src/components/admin/TemporaryLicenseSales.jsx src/utils/licenses.js src/utils/commerce.js
```

From `mobile`:

```sh
npm run typecheck
npm test
```

The database fixtures are in `tests/licenses`. Run the original behavior, sales and purchase-date fixtures before the later pricing migration; run renewal pricing and retained-event-quote fixtures after their corresponding migrations. Each behavior fixture rolls back its changes. Never run the bootstrap against production.

The website build passed locally using the readable tracked copy of `featuredbg.jpeg` through `.tmp/license-build/vite.config.mjs`; macOS access to the original asset had been denied. The fallback does not alter the original image.

## Review deployment — 19 October 2026

Bradein approved publishing the module for partner review. The website is live at [Admin → Licenses](https://4mpadel.co.za/admin?tab=licenses). Both 2026 and 2027 annual sales remain closed. Opening sales requires a separate instruction.

The isolated release includes the license register, per-player management, temporary-sales reporting, price settings, player card, annual checkout, and event-year eligibility. All unrelated production files were preserved. The temporary-assignment hotfix is retained through the shared audited save helper.

The backend migrations are applied as `20261019144459_retain_server_event_license_quotes.sql` and `20261019144512_align_legacy_full_license_start_dates.sql`; local filenames match production history. Saved server event quotes survive later price changes. The date migration corrected 282 imported 2026 starts using linked purchase evidence. Permanent numbers, license counts, payment counts and payment totals did not change.

`native-license-checkout` version 6 handles renewal prices, profile validation and admin beneficiary quotes. `native-event-checkout` version 18 prices each player's Full license separately and retains the current event/deadline/capacity behavior. Both functions retain their own authentication checks and reject unauthenticated requests.

Validation passed: 101 core/payment tests, 21 license-checkout tests, 35 event-checkout tests, the isolated PostgreSQL behavior/sales/history/pricing/date/quote fixtures, mobile typecheck, all 394 mobile tests, scoped ESLint, the isolated website build, browser review with mocked data, Vercel production build, and live asset checks. Three stale mobile test mocks were aligned with existing exports/RPCs; no native app binary was released. No new security warnings were introduced; the new private quote table intentionally has RLS without public policies and no client grants.

The release contains no test payments or test licenses in production. Source selection, checksums, before/after evidence, screenshots, previous Edge Function sources, and rollback information are saved in `outputs/annual-license-release`. The initial module deployment was `dpl_GuYktsyHSwxXtjA48S5Uzaph6Wad`. Concurrent finance deployments subsequently replaced it. The 19 October combined deployment was `dpl_GHommYiXyn3AeeiH7EktPRzxQFQj`, which restores the module while retaining the final finance export changes from `dpl_CGQem9PCLmS45dY4u3uWcBJw8Up6`. The combined source passed 47 license/finance tests and both builds. Production pages match the candidate bundle checksum, and the authenticated admin browser shows Licenses immediately below Players with the register loaded. Evidence is saved in `outputs/annual-license-menu-repair-final`. The preceding deployment lacks the module; use it only for an intentional UI rollback.


## Offering and profile update — 20 October 2026

Sales and prices now provides Remove year with a reason and inline confirmation, plus a Removed years section with Restore. Removal archives the season and closes its sales; it never deletes licenses, permanent numbers, payments or history. Restoring preserves pricing and leaves sales closed. The license register continues to include removed years. Archived years are excluded from web purchase choices and new administrative grants, and RLS hides them from existing ordinary-player app clients. The native source also filters them explicitly; no native binary was released for this update.

The player profile license card now ends at the 4M license number and a View button. Its accessible modal contains the coverage history, purchase/grant dates, statuses and renewal action. Escape, backdrop and the close control dismiss it, restoring focus to View.

Playing hand and Court side are included in all existing web profile edit layouts. They load from and save to the existing shared player fields, with Right-handed/Left-handed and Left/Right/Either options. No profile preferences are changed by deployment.

The migration `20261020055919_archive_license_year_offerings.sql` extends the existing permission-checked and audited license management endpoint. Evidence and isolated release source selection are in `outputs/license-year-offerings-20261020`.

The current website deployment is `dpl_5CxaaQrmBQVT9mhiyUtwN7X9tKQS`, based on the latest finance deployment `dpl_zNxtuNBdQE65bYmz86a7pWRkdEw3`. It preserves both intervening finance changes. The authenticated live UI successfully removed 2026, with actor attribution; only 2027 remains offered and sales are closed. Annual licenses (514), temporary licenses (558), license accounts (895), payments (3274), and the payment total (R1,514,036) were unchanged by the removal. The compact card, full details modal, focus return, and current playing-preference values were verified in the real profile. No real profile values were changed. Production routes serve the exact verified bundle checksum.
