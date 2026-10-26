# Staging setup — 2026-09-08

## Targets and isolation

- Staging: `cefmzkwabdqqoagxhekc` (4M Padel Staging).
- Production: `uzglrpbixubfijvjbtgz`; read-only public-schema export only. No production SQL changes.
- Separate staging CLI workdir: `/private/tmp/4m-supabase-staging.V95sMZ`. Repository CLI link and application environment were not repointed.
- Temporary schema exports and preparation script are outside the repository. CLI authentication uses the user's local login; no credentials were copied into source or chat.

## Imported and checked

- Actual public-schema structure: 61 tables and 153 original policies. All 61 tables were checked and contained zero rows after import.
- No production Auth accounts, player/payment/registration records, storage objects, Edge Functions, cron jobs or email-provider secrets were copied.
- Four hard-coded live admin email literals replaced with `staging-admin-1@example.invalid` through `staging-admin-4@example.invalid`. Embedded registration URL replaced with `https://example.invalid/calendar?register=true`.
- `trigger_enqueue_partner` explicitly disabled in staging; confirmed `tgenabled = D`. No outbound HTTP function calls found in the exported public schema; webhook mentions were comments. Edge Functions and external workers are not cloned by this export.
- Added required `pg_trgm` extension in public for the existing email search index. Initial import failed for that dependency and rolled back; zero public tables confirmed before retry. Corrected import committed successfully.
- Applied `apply.sql` to staging. All eight Rebuild policies confirmed; its privilege postconditions completed successfully.

## Still required — not production approved

Schema compatibility and database-role integration checks now pass (see below). Real signed-in API/browser-session tests and representative-volume performance checks remain outstanding. No fixture or verification scripts for the minimal local database were run on Supabase. Do not run those local scripts against this schema.

The application still uses its existing configuration. Do not switch it to staging until staging-only accounts, synthetic operational data and explicit environment separation are ready. Keep permission notifications disabled. Production rollout requires the remaining integration checks and separate approval.

## Actual-schema integration results

`staging-checks.mjs` generates staging-pinned, transaction-only SQL. Executed successfully through the Management API on 2026-09-08, using SET LOCAL ROLE and synthetic JWT claims. These are actual PostgreSQL RLS/helper/trigger tests, NOT end-to-end authentication tests: an administrator supplies claims inside the transaction, rather than obtaining signed tokens through Auth.

- Tested assigned-event manager (numeric/string IDs), unrelated module grant, malformed assignment, empty assignment, ordinary player, organisation admin, club admin, organiser, co-admin and super admin.
- Verified exact helper authority for five existing events and a missing event, scoped activity/creator-log visibility, and permitted division updates for every identity.
- Verified cross-event insert/delete/update/move denial, assigned insert/delete success, missing-claims denial, anonymous division read compatibility and no anonymous updates, and service-role updates.
- Actual ranking-tag trigger rejected an assigned manager's protected-field update.
- Rollback and reapply compiled and executed inside an outer rolled-back transaction against the actual clone.
- Final query confirmed all public tables empty and all eight installed protections still present. Sequence counters may advance during rolled-back test inserts; no records persist.
- All 59 preview Node tests passed. Vite build passed with existing gradient syntax, mixed static/dynamic imports and bundle-size warnings.

Code-review verdict: suitable to continue read-only/local-draft admin-preview development; NOT approval for production permission writes or a full security sign-off. Existing payment-integrity, calendar exposure/write-policy, legacy helper and notification-save/outbox issues remain listed in README.md. The engineering code-review checklist informed boundary, trigger compatibility and rollback checks.
