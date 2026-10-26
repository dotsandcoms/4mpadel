# Security stage 1 — staging candidate, not production-ready

Stage 1 has been applied to the separate staging project only (2026-09-08). No production changes have been made. See `STAGING-SETUP.md` for the exact verification boundary.

## Scope

- Restrictive INSERT/UPDATE/DELETE policies limit division writes to event authority, even while historic permissive policies remain. Public division reads remain unchanged.
- Restrictive SELECT policies scope event activity and creator-attribution logs. A companion permissive policy supports directly assigned event managers.
- Direct `event-mgmt.allowedEvents` grants match exact numeric/string event IDs. Empty, missing or malformed selections do not become platform-wide authority. The existing UI treats explicit event assignments as independent grants even without an Event Manager tab; this patch preserves that convention.
- Existing `can_manage_event` and `can_manage_calendar_event` helpers preserve inherited organiser/co-admin/organisation/club authority. A separate membership grant can still authorise another event; a direct assignment list does not revoke independent membership authority.
- Remove audited TRUNCATE/REFERENCES/TRIGGER grants from anon/authenticated on the 12 audited tables. Ordinary CRUD and service-role grants are untouched. If those capabilities remain through inheritance or PUBLIC, the transaction fails rather than claiming success.
- No source policies are dropped. They remain visible for the next cleanup stage; restrictive guards take precedence for the scoped operations.

## Not fixed by this stage

Calendar writes and public exposure of internal calendar columns; anonymous payment inserts and player-editable payment status/amount; registration field-level integrity; commerce-config writes; hard-coded admins; wildcard identity comparisons in inherited helpers; no-JWT bypasses in legacy functions elsewhere; permission-saving transactions; email outbox/retry protection. Do not label the admin rebuild secure or production-complete after this patch.

## Local verification performed

Ran PostgreSQL 14.17 in an isolated temporary local cluster, Unix socket only, using synthetic data. The server was stopped after testing. No production credentials or records were used.

`fixture.sql` supplies minimal legacy helper test doubles. `apply.sql` compiled and executed; `verify.sql` checked numeric/string event grants, missing events, cross-event update/delete/insert/move denial, assigned insert/update/delete, unrelated permission records, ordinary players, malformed scopes, missing claims, organisation/club/organiser checks, super-admin log access, anonymous read compatibility/helper denial, and service-role writes. `rollback.sql` and `verify-rollback.sql` successfully restored the original fixture policies/grants. Reapplication also succeeded.

These are real PostgreSQL policy tests, but NOT a substitute for a production-like staging test: actual inherited helper implementations, triggers, roles and FK relationships differ from the small fixture.

## Staging rollout procedure

1. Use a separate Supabase staging project or a protected production-like database clone. Verify the current schema/policies still match the supplied audit. Take a database backup and export current grants/policies.
2. Do NOT run `fixture.sql`, `verify.sql` or `verify-rollback.sql` on Supabase; they are local synthetic-database scripts only.
3. Apply `apply.sql` to staging as the trusted database administrator. Its schema creation intentionally prevents accidental double application; failures roll the transaction back.
4. Use real staging sessions for an ordinary player, unrelated module-only admin, assigned-event manager, organiser/co-admin, organisation admin, linked-club admin and super admin. Verify division INSERT/UPDATE/DELETE, reassignment rejection and both log reads across authorised/unauthorised events. Verify ranking-tag protection, public event pages and existing draw/payment flows still behave correctly. Verify service-role webhook operations separately.
5. Review query plans/latency with representative volumes. The helper performs ownership/membership lookups; do not infer production performance from five fixture events.
6. Only after staging acceptance and explicit production approval, schedule the production apply. This repository file is deliberately outside `supabase/migrations` to prevent accidental automatic deployment.

## Rollback

`rollback.sql` removes only this stage's helper/schema/policies and restores the three audited grants to anon/authenticated. It contains no data deletes or CASCADE. It must be run only after this stage was successfully installed and rollback is authorised. It reopens the audited weaknesses; it is an emergency compatibility rollback, not a safe long-term configuration. Do not use after subsequent stages without adapting it to their dependencies.

## Code review verdict

**Needs staging verification.** Local SQL checks pass. Production release remains blocked by the actual-helper/trigger integration and performance tests above. The engineering code-review skill guided checking authority boundaries, malformed inputs, rollback behaviour and explicit limits of the synthetic tests.
