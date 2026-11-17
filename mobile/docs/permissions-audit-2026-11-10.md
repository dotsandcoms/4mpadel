# Permission audit — compatible security release

**Updated 11 November 2026. Compatible backend and website corrections are
deployed. The final privacy API cutoff remains deferred; this is not a full
security sign-off. The subsequently authorised internal iPhone build 42 is
complete; no Android build or TestFlight/App Store submission was run.**

The user authorised security remediation, registration/payment regression tests
and deployment. Website builds were explicitly approved separately. The user
then requested an Expo internal iPhone build for phone testing. Its receipt and
artifact verification are in `docs/internal-ios-release-2026-11-11.md`.

## Release status

| Area | Status |
| --- | --- |
| Legacy admin writes, worker RPC/queues, shared caches and media writes | Compatible permission boundaries deployed |
| Payment amount/status, registration paid/refund state and server ranking fields | Integrity guards deployed and active |
| Verified Paystack confirmation, webhook, refunds and native checkout | Updated endpoints deployed |
| Website checkout and finance report regressions | Tested website deployed to production |
| Slow registration/payment reads after initial rollout | Set-based permission scopes deployed and verified |
| Standalone licence receipts | Existing Super Admin access restored; unrelated players, event managers and event-scoped Finance denied |
| Leaked-password protection | Enabled and saved in the correct 4M Supabase project; advisor warning cleared |
| Partner contact privacy, raw-table cutoff and safe public projections | Deferred client/API rollout; not represented as solved |
| Native mobile release | Internal iPhone build 42 verified; final privacy cutover still disabled |

## Audit scope and limits

Initial hosted inspection of project `uzglrpbixubfijvjbtgz` covered 119 public
tables, 283 policies, four public views, 389 application functions, 27 Storage
policies and relevant profile/payment triggers. Both migration directories share
the hosted database and were reviewed. Historical migrations were not replayed
and no hosted reset was performed.

Local PostgreSQL tests use synthetic people and events with copied
schema/function/policy definitions and real pricing helper definitions. Worker
bodies are stand-ins where only EXECUTE grants are tested; unrelated constraints
and legacy profile defaults are omitted. These fixtures are not a complete
production clone. They do not establish historical misuse, prove that all access
paths are safe, or replace an external penetration test.

## Deployed protections

- Restrictive role/event/organisation/club boundaries constrain legacy
  permissive admin policies. Sensitive helpers validate active sessions and
  reject expired, banned and deleted identities. Ownership transfers cannot
  manufacture access to unrelated clubs or events.
- Assigned Gallery uploads use immutable album UUID paths. Worker queues and
  planning/recipient RPCs are unavailable to clients. Shared ranking/match caches
  are written by trusted workers; browser refresh uses bounded local memory.
- All historical profile-creation overloads enforce the caller's own account or
  explicit Players administration permission.
- Before-write guards protect paid/success/refund fields, immutable financial
  details and server-controlled ranking/account fields. Entry rosters are
  synchronised server-side. Partner paid state comes from the actual partner
  entry rather than a supplied flag.
- Server-priced checkout quotes retain original amount, currency, reference,
  provider mode and per-player licence prices. Provider confirmation verifies
  these against Paystack success. Licence splitting preserves original charge
  verification. Free entries, weekly carts, partner covers and division top-ups
  have positive and adversarial regression coverage.
- The legacy web checkout saves a processing cart before payment and asks the
  trusted confirmation endpoint to persist the verified result. It no longer
  writes a successful payment or paid registration from the browser.
- Four public catalogue views have had write privileges removed. Mutable
  search paths were fixed on 19 functions; internal trigger/audit RPC execution
  and unauthorised lazy event-promotion writes were closed.

The financial release switch `private.security_release_state.integrity_enabled`
is **true**. The separate protected-data API adapters remain **disabled**.

## Deployment receipt

Applied through Supabase MCP as forward migrations:

| Hosted version | Migration | Local source timestamp |
| --- | --- | --- |
| 20261111052140 | permission_boundaries_for_legacy_admin_and_worker_access | 20261110102648 |
| 20261111052200 | verified_payment_and_registration_integrity | 20261111043810 |
| 20261111052218 | public_catalogue_readonly_and_function_paths | 20261111050311 |
| 20261111053731 | optimize_private_record_scope_checks | 20261111053342 |
| 20261111054214 | set_based_authorized_event_scopes | 20261111053948 |
| 20261111055217 | retain_superadmin_access_to_unassigned_receipts | 20261111054457 |
| 20261111055827 | preserve_legacy_own_registration_retries | 20261111055630 |

MCP deployment timestamps differ from CLI-created local filenames. Do not use
`db push --include-all` to reconcile that difference or replay these changes.

Updated endpoints:

| Endpoint | Deployed version | Authentication |
| --- | --- | --- |
| confirm-manual-payment | 37 | JWT verification plus caller checks |
| paystack-webhook | 43 | Paystack HMAC validation |
| paystack-refund | 40 | Explicit user and permission checks |
| native-event-checkout | 20 | Explicit user and checkout ownership checks |

The website at [4mpadel.co.za](https://4mpadel.co.za) was built and promoted to
deployment `dpl_64Kg16BDw8GVsqFhMUEvuduw51u1`:
[deployed release](https://4mpadel-fh8yr267q-brad-elins-projects.vercel.app).
Domain resolution and HTTP 200 were verified.

Deployment used a reviewed 800-file source stage at
`/tmp/fourm-web-security-release-20261111`, excluding env files, native build
artifacts and node_modules. It retains the existing private draw rehearsal
prebuild sources and only the two mobile facade files imported by the website.
Direct root archival packaging omitted nested ignored exceptions, so the
reviewed staged-source workflow was used.

## Performance and production checks

A final client/policy comparison reproduced a compatibility regression for
historical entries with a missing booking creator. The current register-only
client fills this with its own account on retry. The final migration permits
only that missing-to-self change on the caller's own entry; a partner cannot
claim it, a recorded creator cannot be replaced, and paid/financial fields
remain protected. The expanded 170-assertion suite passed before deployment.

Initial row-by-row event checks caused registration/payment GET timeouts.
The follow-up migrations calculate exact authorised event IDs once per
statement with set-based joins. They preserve explicit role assignments and
organisation/club/event scope rather than introducing broad admin access.

A read-only signed-in player query counted accessible registrations and payments
in **42.954 ms execution / 1.752 ms planning** after optimisation. Both the
player and Super Admin checks completed within a two-second statement limit.
After the receipt correction, the player saw four own entries and 14 payments;
Super Admin saw 1,983 entries and 3,880 payments. These are observations of the
current database, not a general latency guarantee.

The 05:42–05:59:40 UTC post-fix log sample showed successful registration GET/PATCH
and payment GET/POST/PATCH requests and no further read timeouts or HTTP 5xx
for those paths. One registration PATCH was rejected by the existing
`private.assert_registration_deadline` rule: registration had closed, so a new
entry/partner could not be added. This was not an integrity guard failure.
Unrelated duplicate schedule/provider errors and old cache-write attempts were
classified separately rather than treated as successful payment tests.

Unauthenticated calls to the four payment endpoints returned 401. Public
catalogue limit-zero reads returned 200, service-only verification RPC access
was denied to anonymous callers, and public-view write privileges were absent.
No real payment was charged/refunded and no real registration was created by
the agent as a smoke test.

## Validation evidence

| Check | Result |
| --- | --- |
| Final complete mobile feature/unit suite | 715 passed across 68 runners; zero failed/skipped/cancelled |
| Native checkout focused suite, including identity/resume cases | 37 passed |
| Mobile TypeScript | Passed |
| Four deployed payment endpoint bundles, Deno typecheck | Passed |
| Website non-browser suite | 630 passed |
| Seven browser fixtures, including registration ownership and verified finance exports | 45 passed |
| Payment helpers, legacy checkout and provider binding | 71 passed |
| Compatible payment/permission SQL | 170 assertions passed |
| Deferred privacy API SQL draft | 147 assertions passed; not activated |
| Existing seven permission/finance/registration SQL families | All passed |
| Licence entitlement, renewal, sales, assignment and history SQL | Passed |
| Messaging/group/read-badge/capacity SQL | Passed |
| Data API source access-contract checks | 3 passed |
| Fresh disposable table/sequence grants with automatic grants disabled | 66 public contracts, four sequences and FIP column restrictions passed |
| Website local and remote production builds | Passed; remote release promoted |

Representative logs under `/tmp`:
`fourm-legacy-retry-after.log`,
`fourm-superadmin-receipt-tests.log`,
`fourm-setbased-security-tests.log`,
`fourm-mobile-final-release.log`,
`fourm-root-final-20261111.log`,
`fourm-all-browser-final-20261111.log`,
`fourm-final-payment-helper-tests.log`,
`fourm-private-api-final-release.log`,
`fourm-license-db-20261111.log`,
`fourm-permission-families-20261111.log`,
`fourm-messaging-db-20261111.log`,
`fourm-data-api-final-release.log`.

Tests cover legitimate pending/paid entries, genuinely free entries, bundled
licences, reciprocal partners and solo links, weekly dates, EFT/cash permissions,
refund read scope, replacement and higher-division top-ups. Browser regressions
caught and corrected original-booker removal handling and finance exports that
needed a single verified gateway snapshot. Automated verification has not
performed a charged end-to-end provider checkout or a fresh physical-device
role matrix. No iOS/Android build or installation was run.

## Open privacy work — held for coordinated client release

**Do not describe this audit as fully closed.** Existing installed apps still
depend on raw registration/payment reads and contact-bearing partner lookup
responses. Their final removal would break affected installed registration and
payment screens. This known exposure remains until the coordinated cutover.

The draft is deliberately outside the deployable migrations directory:
`docs/drafts/20261110110946_privacy_preserving_registration_and_payment_api.sql`.
Its tests pass, and obsolete weaker guards were removed so it cannot overwrite
the stronger compatible financial guards. It is not deployed. Both client
facades still have `enabled: false`.

Before activation:

1. Finish and verify every web/native caller, delivery/reservation alias and
   partner flow against opaque references and masked checked RPCs.
2. Complete published/hidden-event and operational-field projections, including
   raw contact/hash paths and remaining callable definer call sites.
3. Install/test the updated native app when the user authorises a build; verify
   registration, checkout and receipt screens using the protected APIs.
4. Enable compatible clients/endpoints, revoke raw access with explicit reviewed
   grants and RLS, then rerun enumeration, cross-event and business-flow tests.
   Do not leave a raw-table fallback or activate the current draft blindly.

## Supabase advisory review

Saved leaked-password protection is enabled; that warning and mutable
function-search-path warnings are absent in the final advisor query.
Remaining categories: 32 RLS-without-policy tables, four owner-privilege public
views, one public-schema extension, 44 anonymous-callable definer functions and
104 authenticated-callable definer functions. These counts include intentional
worker-only tables and checked public RPCs; they are not a security pass metric.

Private quote/release-state tables intentionally have no client policies.
Catalogue views are now read-only, but their final field/visibility projection
belongs to the deferred cutoff. The public `pg_trgm` extension advisory remains;
it was not relocated during this compatibility-sensitive deployment.

References:
[view privileges](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view),
[definer RPC execution](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable),
[private tables without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy),
[extension location](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public),
[password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Rollback and release hold

Previous website deployment: `dpl_3Cegm9hk616exM7tUjeo8bGQci5k`.
Payment endpoint source snapshots were retained for coordinated recovery at
`/tmp/fourm-rollback-edge-functions-20261111.json` (owner-only file access).
Do not blindly restore the old website alone: its former browser-written paid
state is intentionally rejected by the new guards. Keep integrity protections
active while restoring a compatible verified checkout; disabling them requires
a verified critical-flow incident and an explicit recovery decision.

Rollback triggers include a reproducible legitimate checkout/registration
failure, cross-account access, or renewed entry/payment read timeouts.
The final privacy cutoff remains disabled. The later user-authorised internal
iPhone test build 42 does not activate it; see the separate build receipt.
