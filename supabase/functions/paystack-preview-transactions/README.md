# Read-only gateway preview (staging only)

This separate endpoint does not replace `paystack-transactions`. The admin
preview gateway UI enables it only for the pinned staging project, in test mode.
The currently live-connected preview displays an availability notice instead.
Do not deploy to production as part of UI work.

Staging checkpoint, 2026-09-08: deployed version 1 to
`cefmzkwabdqqoagxhekc`, ACTIVE with `verify_jwt: true`. The test-secret name
is present. An actual anonymous GET returned HTTP 401 at the platform gateway.
Authenticated staging checks also passed: an explicitly granted super-admin
received HTTP 200 with two test transactions, page 1 of 101 (201 total,
`perPage=2`, `hasMore=true`). A custom-role account received HTTP 403.
Both temporary confirmed test accounts and their exact permission grants were
deleted, with absence verified afterward. No invitation emails were sent.
Expanded staging verification passed through the real frontend client adapter:
page 2, final page 101, non-overlapping adjacent pages, final `hasMore=false`,
success-status filtering and a South African single-day date window containing
existing test transactions. Exact midnight edge cases remain covered synthetically.
Live mode returned the expected configuration denial after confirming that no
live secret exists; no live Paystack request was made. The restricted-user check
still returned 403. Both accounts and grants from this second run were removed
and absence verified.
Production was not deployed or changed.

GET requires a verified Supabase user and an explicit `super_admin` permission
record. No hard-coded email bypass, delegated access, client-side role claim or
anonymous fallback. Database authorization errors deny access.

Query: required `mode=live|test`, optional `page` (default 1), `perPage` (1–100,
default 50), `from`/`to` (canonical UTC ISO timestamps), and `status`
(`success`, `failed`, `abandoned`, the documented gateway filters).
The caller must convert inclusive South African date selections to UTC bounds.
Other returned statuses remain unchanged. Each request fetches one page;
pagination metadata is returned, not truncated to five pages. Offset pages can
shift as new transactions arrive; these are not an immutable export snapshot.

Amounts are integer currency minor units, not formatted Rand strings. Do not
sum different currencies or label receipts as payouts. References are used
instead of parsing gateway uint64 IDs. Metadata and customer PII are omitted;
Player/event labels use separately authorized exact test-payment reference links
in the frontend. Duplicate/missing links and lookup errors stay explicit.

Secrets: `PAYSTACK_SECRET_KEY_TEST` for test and `PAYSTACK_SECRET_KEY` for live.
Each must have the corresponding `sk_test_`/`sk_live_` prefix. Never copy a live
secret into staging. Supabase URL, anon key and service-role key are runtime
configuration. Keep platform JWT verification enabled in addition to getUser.

Before connecting the UI: stage with test credentials; verify signed-in
super-admin success, delegated/anonymous denial, pagination, date boundaries,
missing configuration and timeout handling. No deploy or gateway call was
performed by the local synthetic tests; the staging checkpoint above records
the separately authorized remote checks. This endpoint cannot sync, refund,
change registrations, send mail or otherwise mutate financial data.

API contract: https://paystack.com/docs/api/transaction/ and
https://paystack.com/docs/api/pagination/
