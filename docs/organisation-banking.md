# Organisation payout banking

Banking details support **manual payments only**. No bank transfer or Paystack recipient is created. Amounts requested still need manual reconciliation against event finances before payment.

## Interface and design decisions

The supplied Club Settings and payout screenshots are the visual reference: existing dark panels, lime primary actions, the same typography, and responsive form spacing. Banking lives in its own private panel after the public profile. Refero's form guidance supplies explicit labels, inline errors, visible keyboard focus and clear submitting states. The payout modal confirms a masked destination; the event finance panel lets 4M super admins reveal the request snapshot for 60 seconds after authenticator verification.

## Access and storage

- Organisation owners/admins and 4M super admins can see bank name, last four digits and save date. Staff and event co-admin access do not grant banking access. Legacy owners must have an explicit owner/admin membership.
- Saving/replacing/removing banking, requesting a payout, and processing/revealing requests require a TOTP verification within the last five minutes. Initial TOTP enrolment is supported in the UI. The backend checks live Auth users and sessions, not user-editable metadata.
- Complete banking data is encrypted with pgcrypto AES-256 in the unexposed `banking_private` schema. The random encryption key is held in Supabase Vault. There are no client or service-role table grants, no RLS policies, and no public views. The only API is an authenticated, narrowly scoped RPC.
- Each payout stores an immutable encrypted banking snapshot. Replacing/removing the current bank does not redirect existing requests. Pending requests must be paid or cancelled before another request for that event. Cancellation followed by a new request is how a destination is changed.
- Full details can only be revealed for pending requests by 4M super admins. The UI clears them after 60 seconds, on tab hiding, on sign-out and on component teardown. RPC responses have `Cache-Control: no-store`. No banking data is saved in browser storage, emails, analytics or ordinary event audit logs.
- A private append-only audit records successful saves, removals, reveals, requests and manual paid/cancelled decisions. Marking a completed manual payment as paid also records it in the existing event payout ledger, so the remaining balance reduces; do not record that payment again as a separate interim payment. Access to the database/SQL editor must remain restricted to trusted operators: database owners can decrypt data. This design does not protect against a compromised database owner or an authorised viewer copying visible details.

The existing `payment_*` fields on organisations/events are payment instructions intentionally used for entrant EFT payments. They are separate from private payout banking and are not reused or migrated by this feature.

## Release and verification

1. Apply `20261021111219_organisation_banking_details.sql` to the target Supabase project. The migration creates its Vault key internally; never print/export that key. Keep `banking_private` out of exposed schemas and replication/publication lists.
2. Ensure Auth TOTP enrolment/verification is enabled. Deploy the updated `send-email` function and frontend together: payout notifications now accept only a saved request ID and always go to the existing 4M payout administrator (`markstillerman@gmail.com`).
3. Run the SQL security integration test against a disposable local database with the prerequisite schema (the test rolls back). Run the JS tests and production build.
4. Smoke-test as org owner, unrelated org owner, staff, event co-admin, and 4M super admin. Check MFA expiry, stale versions, duplicate/retried requests, replacement during a pending request, reveal expiry, and manual paid/cancelled handling.
5. Protect database backups and operator accounts with MFA. Retain payout snapshots only for the business's approved accounting retention period; removing saved banking is not deletion of historical payout evidence. A super admin hard-deleting an organisation or event removes its associated banking snapshots; keep any required accounting evidence before deleting those parent records. Key rotation requires re-encrypting both accounts and snapshots before retiring the old Vault key.

Local integration check (use a newly created, disposable PostgreSQL database only):

```sh
psql "$BANKING_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f tests/fixtures/banking-database.sql \
  -f supabase/migrations/20261021111219_organisation_banking_details.sql \
  -f tests/organisationBanking.security.sql
node --test tests/organisationBankingEmail.test.mjs tests/eventSettlement.test.mjs tests/eventCashReceipts.test.mjs tests/compedEntryEmail.test.mjs tests/eventFinanceExport.test.mjs tests/eventReceiptReport.test.mjs
npm run build
```

The local fixture substitutes only Supabase Auth state and Vault key retrieval; the migration's PostgreSQL permissions, RPC checks, AES encryption/decryption, snapshots, audit and payout ledger code run directly. It does not replace an end-to-end Supabase Auth/MFA smoke test before release.
