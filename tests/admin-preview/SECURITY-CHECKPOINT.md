# Admin rebuild: access foundation — 8 September 2026

Branch: `brad/admin-preview-v2`. Preview remains under `/admin-preview`.
Database writes and deployments: none.

## Implemented

Staged database candidate: `security-stage-1/` contains division-write and event-log read guards, audited excess-privilege revocation, rollback and synthetic PostgreSQL tests. Executed successfully on isolated local PostgreSQL 14.17, including rollback/reapply; no production deployment. It intentionally retains legacy inherited authority helpers and does not solve calendar/payment/public-data findings. See its README for staging acceptance requirements and residual risks.

- Live preview requires authentication; event URL and preview-live parameters cannot grant a simulated super-admin role.
- Development fixture mode uses synthetic event records only.
- Event reads require the existing Event Manager tab or event assignments. Assigned event IDs constrain queries, including direct event URLs.
- Organisation and club selections narrow event queries and clear selected records. Scope identifiers distinguish the two entity types.
- Requests from previous scope/account loads cannot publish over the current request; previous data is hidden immediately when access changes.
- Shared permission resolver clears access across account changes and discards obsolete permission responses.
- Players and Calendar cannot show account-wide data under a narrower scope label; scoped support remains pending.
- Unavailable event records no longer fall back to the synthetic preview event.

## Verification

Latest local checkpoint: 59 Node tests pass, focused lint passes, and `deno check --no-lock supabase/functions/send-email/index.ts` passes. New notification gate denies browser callers regardless of the generic admin list and remains feature-disabled for trusted callers unless explicitly enabled. Nothing was deployed; the SQL catalogue audit remains unexecuted.

36 Node tests passed, including five access-policy cases. Production build passed, with existing CSS gradient and bundle-size warnings. Browser verification confirmed that `/admin-preview/event?event=463&preview-live=1` displays login when signed out.
These checks do not establish database enforcement or POPIA compliance.

## Findings requiring further work

- Permission save path review: `AdminManager.handleSave` performs a direct browser upsert. The original permission-table write policy is a fixed email allowlist, while the preview resolves role/module records. These authority sources must be reconciled against the deployed catalogue before enabling preview saves. `permission-backend-audit.sql` is a manual, read-only metadata audit, not a migration; it has NOT been executed against production.
- Existing `send-email.isAdminCaller` accepts any matching permission record (or a hard-coded email), not a specific permission-management capability. The future permission-granted notification must therefore not rely solely on that generic admin check: send it from a trusted post-save server workflow using persisted recipient/scope data, with a durable idempotency key and delivery result. Current email behaviour was not changed or deployed.
- Draft review now enumerates added/removed event IDs (and titles when available), album IDs, and Finance sections. It ignores selection ordering and numeric/string ID representation, and explicitly flags a cleared restriction as fallback/default behaviour rather than denial. Review clarity does not replace backend enforcement.

- Scope-specific memberships alone do not grant Event Manager access in this checkpoint. Federation and player context switching remains to be implemented against verified backend rules.
- `useAdminPermissions` contains a hard-coded super-admin email list. It is still used by the existing admin. Move authority to verified server-side roles in a later reviewed change.
- The repository contains historic permissive policies and later lockdown migrations. Deployment state has not been verified; do not infer live vulnerability or safety from migration files alone.
- The refund read policy in `20260626_payment_refunds.sql` checks admin membership without a per-event restriction. Verify the deployed policy and subsequent replacements.
- `20260807_critical_rls_pii_lockdown.sql` includes anonymous SECURITY DEFINER registration lookup by caller-supplied email using ILIKE. Verify deployed functions, wildcard handling and current callers before redesigning this flow.
- Older organisation migrations use `organization_id` / `organizations`, whereas the preview uses `organisation_id` / `organisations`. Verify actual schema and surviving policies before implementing tenancy migrations.
- Database policy catalogue and cross-account integration tests have not been performed. No database administration connector was available in this session.
- Preview still has synthetic operational status/activity and placeholder destinations outside this checkpoint. Inventory these before treating each page as production-ready. No existing feature has been removed as obsolete.

## Review

Sign in, open Event Manager, and choose a linked organisation or club. Verify the label and event list change together. Try a direct URL for an event outside that selection. For a restricted account, verify only assigned events load. These checks require appropriately provisioned accounts; do not alter production memberships to test them.

Next module: Finance. Rebuild its dashboard, financial summary, user payments, transactions, event finance and settings from the live components. Include existing filters, pagination, exports, record details and action flows. Reconcile server-side event access, finance access and tenant membership rules as part of those screens.

Full rebuild acceptance: every module needs functional parity with the existing admin, including dashboards, records and linked workflows. Track live reads separately from preview-only writes while the database remains read-only. Placeholder navigation is not a completed module. Flag obsolete functionality for user confirmation rather than removing it.
