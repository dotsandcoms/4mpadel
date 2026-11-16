# Explicit Data API grants

Audited on 27 October 2026 against Supabase's [30 October change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically) and [API permissions guidance](https://supabase.com/docs/guides/api/securing-your-api).

## Scope and changes

The initial audit covered all **147 migration files** in `supabase/migrations` and
`mobile/supabase/migrations`: **63 distinct public tables**, created by 64
declarations in 35 migrations. The second `draw_player_reviews` declaration is
an intentional compatibility migration and needs its own explicit grants.
Private and banking schemas are excluded from Data API grants.

Updated **25 historical migrations** to declare missing role access in the same
file as `CREATE TABLE`. All original SQL statements and row policies are
preserved. Added grants/revokes specify the API operations used by the app and
workers, rather than granting anonymous writes or client access to every table.

- Public catalog and published-draw reads receive `anon` SELECT where intended.
- Signed-in app operations receive the required SELECT/INSERT/UPDATE/DELETE
  subset; schedule and follow tables do not receive UPDATE.
- Refund/activity logs are client-readable only as allowed by their row policies.
- Device and push-token writes continue through their existing RPCs.
- Tournament workflow, notification queues, license ledgers and worker caches
  retain their intended server/RPC access; clients get no direct grants.
- Every public table creation declares service-role CRUD access explicitly.
  Sequence USAGE is explicit for all four created identity/serial sequences,
  including the previously implicit Tournament Manager audit sequence.
- The later FIP column-level restrictions remain intact. Server grants do not
  expose requester IDs or let clients insert verification timestamps.

`tests/fixtures/data-api-access.mjs` is the reviewed per-table access contract.
`AGENTS.md` documents the requirement for future changes.

## Verification

```sh
npm run test:data-api
```

The dependency-free source check inspects top-level SQL, ignoring comments and
function bodies. Each new public table must have RLS enabled, an explicit
GRANT/REVOKE decision for each API role, and a reviewed access contract in the
same creation migration. It also checks identity/serial sequence grants.

For real PostgreSQL verification, initialise an isolated local instance and
create an empty database named `fourm_data_api_grant_test`. The integration
script accepts only local sockets/loopback hosts and refuses a nonempty public
schema. It uses a transaction and rolls back all objects and test data.

```sh
# Default local socket and port: /private/tmp, 55443
createdb -h /private/tmp -p 55443 fourm_data_api_grant_test
npm run test:data-api:db
```

`PGHOST`, `PGPORT`, `PGUSER` and `PGPASSWORD` can configure a different disposable
local instance; the database name is fixed. Never use a shared/hosted database.

The integration test uses the actual table declarations, RLS enablement and
grant statements with automatic table/sequence grants disabled. It checks all
63 role contracts, four sequences, later FIP column grants, service-role worker
and identity inserts, public reads, denied anonymous writes and private queue
reads, and owner/cross-account My Schedule operations using its actual policies.
It removes foreign keys to isolate permission verification from the old base
schema; it does not replace application-wide policy or migration replay tests.

Validation completed locally:

- Source permission checks: passed.
- PostgreSQL grant/column/sequence/RLS scenarios: passed on PostgreSQL 14.
- Existing event-management-completion SQL suite: passed.
- Existing Tournament Manager SQL integration suite: passed.
- Broad Node suite: 517 passed, four failed. The finance export fixture expects
  a missing `cashVerification` state; the leaderboard cache fixture expects a
  refresh behavior absent from its unchanged source. The two existing browser
  fixtures could not launch under the sandbox, and timed out when rerun with
  Chromium access. These application files/tests were not changed by this audit.

`.github/workflows/migration-access.yml` runs the source guard and PostgreSQL 17
verification on migration-related pull requests and pushes to `main`. The
workflow has been prepared locally; it has not yet run on GitHub.

## Existing projects and reset limits

No hosted migrations, default privileges, existing grants, policies or data were
changed for this audit. Existing tables keep their permissions after 30 October;
the edits make newly created tables independent of automatic grants. Commit and
push these source changes so fresh environments use the corrected definitions.
Do not replay historical migrations on a running project to apply these edits.

Read-only inspection of the live catalog confirmed RLS is enabled on its public
base tables. Some live legacy grants are broader than the reviewed fresh-table
contracts, and the permissive `account_must_exist` policies also warrant a
separate production authorization review. This table-creation audit does not
certify or change those existing policies. Existing RPC EXECUTE privileges and
public views are outside the source guard's scope.

The repository is an incremental migration history, **not a complete empty
database bootstrap**. Early migrations assume tables such as `players`,
`calendar`, `payments`, `event_registrations` and the original organization
schema already exist. The old `organization_members` spelling also differs
from the hosted `organisation_members` table. An empty `supabase db reset` or a
new project still needs a validated baseline and ordering reconciliation; this
audit does not claim a full reset succeeded. Archived SQL is not an active
baseline and was not automatically replayed or rewritten.


## Playtomic screenshot evidence — 5 November 2026

`public.playtomic_profile_extractions` is worker/RPC-only: RLS enabled, no client policies, all anon/authenticated privileges revoked, explicit service-role CRUD and no sequence. Only the service role can execute its record RPC. The permission-checked private-profile getter exposes metrics for the currently saved screenshot to its owner or Players admin. Ownership foreign keys cascade for both pending auth accounts and attached beneficiary players. The creating forward migration and `tests/fixtures/data-api-access.mjs` declare this contract; isolated profile tests cover client denial, ownership transfer and cleanup. No old hosted migration is replayed.
