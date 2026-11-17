# Active remediation worklog

**Current status — 11 November 2026:** compatible security corrections and the
website are deployed. Integrity guards are active. The final privacy API cutoff
is held for a coordinated updated-app rollout. The user subsequently authorised
an Expo internal iPhone build: version 1.0.2 / build 42 is complete and its
installer verification passed. See `docs/internal-ios-release-2026-11-11.md`.
No TestFlight or App Store submission was run. This status supersedes the historical
“not deployed” / “still to finish” entries below. The current release receipt,
test evidence, open findings and rollback limits are in
`docs/permissions-audit-2026-11-10.md`.

User explicitly requested on 10 November: finish audit fixes, make permission
and legitimate business-flow tests pass, deploy corrections, then build for
their physical iPhone and a partner who also uses iPhone. Do not stop at another
audit report. Do not build before blockers are fixed. Preserve registration,
payment, partner entries, free events, EFT/cash, licences, refunds and switches.

Additional requested UI work: dark green/white Sign in and Create account
buttons; remove neon splash line, use unslop and restrained branded motion.
Those source changes are made, but rendered simulator verification remains.

User also asked about a missing message in “Testing Group Chats”. Read-only
hosted metadata confirmed: admin creator joined 12:04:52, Mark 12:05:19 and sent
12:05:56; Brad player joined 13:08:45 and sent 13:08:52. Admin's next message was
13:11:26. All messages exist, none removed. Existing rule deliberately shows the
invitation and only post-join messages; do not weaken it without explicit user
direction. Explain the boundary clearly in group chat UI. User was told why.

## API boundary direction being implemented

The legacy lookup/privacy problem cannot be fixed merely by hiding email in
search results while raw tables or registration creation return it again.
Maintain existing UX and query shapes via a small client data-access facade:

- Reads of registrations/payments/calendar go through checked table-returning
  RPCs (`SETOF` the original table type supports PostgREST filters and existing
  relations). These explicitly filter authorised rows and mask private fields.
- Partner contacts use stable public player references; real delivery emails
  resolve only on the server. Unknown-profile entries use event-bound entry
  references. These references are identifiers, not secret access credentials.
- Non-admin own/team reads mask every other person's email/phone and embedded
  metadata contacts; own identity stays usable. Event/finance admins see real
  contacts only within their authorised event set.
- A checked mutation RPC handles registration/payment writes, authorising old
  and new row scopes and preserving defaults, unique constraints and retries.
  Do not expose direct raw-table SELECT as a compatibility fallback.
- The facade preserves existing select/filter/insert/upsert/update/delete
  behaviour. Existing UI flows should not be rewritten or removed. Backend
  service clients still use base tables.
- Database triggers guard paid/success/refund fields, immutable financial
  details and server ranking fields even if an RPC/path is missed. Explicit
  service workers and correctly scoped admins retain legitimate operations.
- Public views need genuinely safe projections, visible-event checks and no
  reversible private-email hashes. Avoid owner-bypass views; test the actual
  PostgreSQL version/privileges, not just linter suppression.

This direction is an implementation plan, not an assertion that the facade or
these new RPCs already exist. Current concrete work remains the 116-assertion
legacy hardening migration plus local ranking/gallery compatibility changes.

## Known files / tools

- Current root `/Users/bradein/Sites/4m-Padel/mobile`; website is parent checkout.
- Existing draft migration: `20261110102648_permission_boundaries_for_legacy_admin_and_worker_access.sql`, not hosted yet.
- Existing audit: `docs/permissions-audit-2026-11-10.md`.
- Live schema/function/policy catalog snapshots: `/tmp/fourm-deep-audit.json`,
  `/tmp/fourm-permission-inventory.json`; no production rows copied.
- Sensitive client call inventory: `/tmp/fourm-sensitive-client-calls.txt`.
- New SQL regression: `node scripts/test-permission-boundaries-db.cjs` (116 pass).
- Existing broader disposable SQL runner: `/tmp/fourm-full-permission-sql.cjs`
  (seven suites pass).
- Complete prior app tests 709 pass; website non-browser tests now 614 pass.
- New auth/splash TypeScript check passed. Both changes need visual proof.
- Root writes require escalation. No reset/commit/push; lots of unrelated work.
- Node22 path `/Users/bradein/Library/Application Support/Herd/config/nvm/versions/node/v22.22.3/bin`; check installed Node24 before EAS build.
- Supabase project `uzglrpbixubfijvjbtgz`; connected MCP apply_migration and
  deploy_edge_function support reviewed production rollout. Never replay history.
- iPhone UDID `00008140-00180C260493C01C`; bundle `com.fourmpadel.app`, team
  `52RX6X5X2T`, scheme `FourMPadel`. Previous build timed out locked; no new app.
- User's partner uses iPhone. Need a genuinely shareable installation path,
  likely TestFlight; inspect existing EAS/App Store Connect access first.

## Design direction / skill record

Unslop: light polish grounded in supplied splash screenshot and existing app.
Product: local and international padel for players. Character: grounded,
sporting, precise. World: court markings. Moment: one short serve under the
existing wordmark. Signature: small court/ball glyph; no decorative loop or
loading-percentage fiction. Preserve startup timing, reduced motion, tagline.
Method reference: unslop by Damir Sokolovsky, CC BY 4.0
(https://heydamir.design/unslop); motion craft from bundled Refero references.

## Event cards — 10 November, 13:48 SAST

Latest user steering: simplify the confusing Overview/Draws/Results sheet; make
its list neat and compact; posted messages must show a richer preview and the
actual event poster when present.

Implemented native sheet with searchable, paginated (25-row) published calendar;
current/upcoming and past controls; horizontal poster/date/venue rows. Selecting
only attaches a draft. Posted cards show a poster (tier fallback only if absent),
readable date, venue/city and View event CTA. Event metadata comes from the
current published calendar, never from a client-supplied title/URL. Existing
cards also gain metadata on reload. Cards disappear if publication is withdrawn.

Forward migration `20261110114014_messaging_group_event_attachments.sql` was
applied successfully to the hosted project after comparing both existing
function bodies against the expected source. This adds card-only/group sends
without changing consent, block, membership or event visibility gates. Both
internal functions remain non-executable by authenticated clients.

Verified: TypeScript passes; 28 messaging client tests + 4 event-share tests
pass; full messaging SQL/capacity tests and 66 table/4 sequence grant contracts
pass on disposable PostgreSQL17. Tests cover card retries, different-content
retry rejection, empty messages, unaccepted/outsider access, hidden/rejected
cards, server-sourced poster/venue and removal after unpublishing. Simulator
confirmed search, compact horizontal rows, attaching a draft and the richer
posted card. No test messages were sent to real users by the agent.

The broader legacy permission/privacy/payment remediation is still unfinished;
this targeted messaging deployment is not a claim that the whole audit passes.


## Build hold and privacy API progress — 10 November, 14:00 SAST

The user explicitly said to hold off on builds for today and wait for their next
build instruction. No build/archive/upload/installation has been started.

The unfinished privacy/payment API SQL is now deliberately outside the deployable
migration directory at `docs/drafts/20261110110946_privacy_preserving_registration_and_payment_api.sql`.
The CLI-created timestamp is retained, but this is NOT a deployed migration.
This prevents an accidental `db push` from activating an incomplete checkout
cutover. Both client adapters still have `enabled: false`.

Local PostgreSQL17 private-record tests now pass 147 total assertions (116 legacy
boundary assertions plus 31 privacy/API cases). These exercise real draft SQL:
masked partner contacts and nested payment metadata, own and scoped admin reads,
foreign-event denial, paid/status/amount forgery denial, legitimate free-event
and cash-admin writes, idempotent upsert, exact partner lookup, wildcard and
partial-email enumeration denial, hidden-event roster denial, non-email public
hashes, and security-invoker public catalogues with narrow definer projections.
License-display helpers in that fixture are explicitly stand-ins; these tests
do not establish final payment/entitlement correctness.

Remaining release blockers: finish authoritative payment amount/cover validation;
replace the non-manual web registration callback's browser-written success rows
with verified server persistence; resolve contact references only inside trusted
mail delivery; preserve reciprocal/solo/reservation and paid division-switch
flows; test/activate the client/Edge adapters; revoke raw table paths only after
all those callers pass. The broader corrections have NOT been deployed. The
116-assertion legacy correction remains prepared but not hosted. Do not describe
this as a completed permission audit or as proof all business flows pass.

Final event-card verification: 713/713 mobile tests across 68 runners passed;
TypeScript passed. Build hold remains in force. No iOS/Android build, archive,
App Store upload or installation was performed.

## 11 November active work (no build)

User authorised finishing fixes/testing/deployment, explicitly no app build.
Asked about the privacy cutover vs old installed app: recommended deploying
compatible protections now and retaining the final data-API cutoff until the
updated app is installed. User asked for recommendation; stated that approach
and proceeded with independent compatible protections. Final cutoff remains
held and must be reported as an open activation item.

New local code (NOT deployed yet):
- Shared `assertPaystackPayment` binds success to exact stored reference,
  amount in cents, currency, domain/live-test mode and provider success.
- Confirm and webhook call service-only `payment_verification_context` (new SQL)
  to preserve original charge amount after licence ledger splits.
- Root/mobile paystack-refund both check verified transaction details on top-ups.
- Finalizer ignores client-paid/admin snapshot fields, preserves actual existing
  paid rows/creator, supports server-priced genuinely free entries and uses
  captured per-player licence prices for splitting.
- Legacy EventDetails now saves a processing cart before opening Paystack and
  invokes server confirmation after success; removed browser-success ledger writes.
  Pure `legacyEventCheckout` helper and provider-binding tests added.
- 71 checkout/helper/provider tests pass in `/tmp/fourm-financial-client-tests.log`.
- New CLI migration `20261111043810_verified_payment_and_registration_integrity.sql`
  adds private quote/state tables (RLS/revoked client + service table access),
  server price/cart validation, immutable payment/entry status guards, canonical
  partner paid status, protected ranking/account fields and exact-email scopes.
  Financial guards start disabled for coordinated backend/site rollout, then
  activate only after verification. This is not yet applied to hosted DB.
- Quotes retain original charged amount/currency/mode and licence price items.
  Worker-only verified licence allocation may narrow the parent ledger once,
  only if child totals and entry covers match. Original verification survives
  replays after splitting.

New local regression `tests/payment-security.sql` uses the existing 116-boundary
fixture plus actual hosted pricing function bodies and synthetic catalogue rows.
First run caught SQL variable `division` ambiguity; renamed it, rerun in progress.
Runner `scripts/test-payment-security-db.cjs`, log `/tmp/fourm-payment-security-db.log`.

Still to finish: financial SQL tests (including bundled licences, free+licence,
weekly carts, top-up/refund paths); participant sync must happen server-side for
non-manual events before the old public upsert RPC is closed (legacy policy
migration currently restricts it to event managers). New EventDetails payment
path relies on backend persistence/sync. Finish stricter public-view/search-path
and internal RPC privilege audit; deploy compatible migrations and endpoints,
website (Vercel) as needed, activate financial guard and verify live contract.
New quote RPC must exist before updated endpoints are deployed. Do not activate
the old privacy draft: it includes older guard definitions which would overwrite
new financial validation; merge/remove those first. Both data API adapters remain
`enabled:false` for installed app compatibility. No native build was run.

## 11 November deployment complete — compatible stage only

The seven reviewed forward migrations are now applied, including set-based
event scopes, Super Admin standalone receipt access, and the narrowly allowed
missing-to-self creator field on historical own-entry retries. The last change
was reproduced failing in the disposable fixture before correction; all 170
payment/permission assertions passed before deployment. The financial switch is
active. Scope helpers preserve ordinary own-only reads and organisation/event
boundaries. A production role check still shows the player only four own entries
and 14 payments; Super Admin standalone receipt access is restored.

Confirmed deployment versions, source mapping and rollback notes are recorded
in the audit. Updated confirm-manual-payment, paystack-webhook, paystack-refund
and native-event-checkout endpoints are live. The website release was built in
an isolated reviewed-source stage and promoted to 4mpadel.co.za. No native build,
archive, upload or installation was performed.

Final evidence: 715 mobile tests across 68 runners, 630 non-browser website
tests, 45 browser tests, 71 payment/helper tests, 170 compatible SQL assertions,
147 deferred privacy SQL assertions, the existing seven SQL permission families,
licence SQL, messaging/read-badge/capacity SQL and all Data API grant checks
passed. Mobile TypeScript and four endpoint Deno checks passed. No real provider
charge/refund was made as part of this verification.

Initial entry/payment read timeouts were diagnosed and corrected with cached
set-based authorised event IDs; a live read-only combined count executed in
42.954 ms. Post-fix monitoring through 05:59:40 UTC showed no further HTTP 5xx or
timeouts for these paths. One PATCH rejection was the existing registration
deadline rule, not a new financial-guard failure. Shared-cache write denials by
old clients and unrelated provider/schedule errors were classified separately.

Leaked-password protection was enabled, saved and re-opened to confirm it is on
in the correct 4M project. The corresponding advisor warning is cleared.

IMPORTANT: the final contact-privacy/raw-table cutoff is still deferred, not
complete. Both client adapters remain disabled. The draft has been reconciled
with the stronger financial guard, including the final own-entry retry guard,
and passes 147 assertions, but client/delivery/reservation/projection completion
and a coordinated updated-app release are required before activating it.
Remaining advisor categories and the public extension warning are documented;
the release is not a full no-leak or all-path security certification.

Rollback endpoint snapshots are stored with owner-only access at
`/tmp/fourm-rollback-edge-functions-20261111.json`. A blind website-only rollback
would restore browser-written paid state that the new guards correctly reject;
recover components together while preserving verified checkout. Do not replay
historical migration files to reconcile MCP deployment timestamps.
