# Event Manager refund-read timeout

Installed `20261027080748_optimize_refund_read_authorization.sql` in the shared
4M Supabase project on 27 October 2026. No application deployment is needed:
existing clients continue using the same refund queries.

## Cause and change

The three overlapping refund SELECT policies joined payments, players and
registrations through those tables' own RLS policies. This expanded nested
event-management permission checks and timed out even with refund lookup
indexes present. The same authenticated lookup reproduced the timeout under
`mfmoosa786@gmail.com` with a four-second statement limit.

One SELECT policy now uses the private read-only
`private.can_read_payment_refund` helper. It validates a signed-in, active
account and checks only the linked payment ID/reference and registration ID
using existing indexes. It preserves payer, participant, partner, original
registrant, refund-initiator, super-admin and authorized event-manager access.
Event management still uses the existing `can_manage_event` authorization.
Reference-only and withdrawn-registration history remain available.

The helper bypasses nested table policies solely for these bounded authorization
lookups, returns only a boolean, uses an empty search path, and is not a public
RPC. Anonymous and service-role callers receive no direct helper EXECUTE grant.

The refund table's active-account policy is now restrictive: being active is
an additional condition, not independent access to every refund. Client
INSERT/UPDATE/DELETE privileges are revoked; trusted server refund workers
retain access. No refund/payment/registration records or money were changed.
The frontend still fails explicitly if refunds cannot be verified.

## Verification

- The identical refund query returned all **17** matching Cape Town Open refund
  records under both affected accounts, matching the unrestricted source count.
- Database execution fell from a **four-second timeout** to **31.6–31.8 ms**.
- PostgreSQL plan cost fell from 7230.71 to 16.17; the old nested payment-policy
  subplans are absent.
- Local PostgreSQL authorization checks cover assigned managers, organisers,
  co-admins, payer ownership, metadata ownership, historical/reference-only
  refunds, registration/partner/booker access, unrelated users/admin modules,
  forged user metadata, deleted/unsigned accounts, anonymous denial and trusted
  server writes. A deliberately failing payments RLS policy proves refund reads
  do not recursively invoke it.
- Twenty targeted finance/team/migration tests and the 63-table access-contract
  integration test passed.

Run the SQL regression only on the empty disposable local database:

```sh
psql -X -q -h /private/tmp -p 55443 -d fourm_data_api_grant_test \
  -v ON_ERROR_STOP=1 -f tests/refundReadAuthorization.sql
```

The fixture rolls back all roles, schema and data, and refuses other database
names or a populated public schema. The migration-access GitHub workflow also
runs it against its disposable PostgreSQL service once these files are pushed.
