# Club decisions — staging verification, 23 September 2026

Target verified using Supabase project metadata: **4M Padel Staging**,
`cefmzkwabdqqoagxhekc`. The main worktree remains linked to production
`uzglrpbixubfijvjbtgz`; it was not used for installation or tests.

## Installed only in staging

1. `bootstrap-decisions.sql`: private schema, no profile RPC or policy changes.
2. `claims.sql`: atomic claim decision, owner membership, eligible publication,
   reviewer attribution, audit and notification outbox.
3. `applications.sql`: atomic application decision, source applicant-contact
   fallback, nullable owner linkage, audit and notification outbox.
4. `notification-delivery.sql`: service-role-only reservation, token-fenced
   acknowledgement and explicit known-failure retry RPCs.
5. `club-decision-notifications`: staging-only, provider-disabled simulation
   worker. Requires platform JWT authentication and a dedicated worker secret.

Fresh staging catalog checks established the current columns, constraints and
absence of outbound triggers on the fixture tables before testing. In particular,
`reviewed_by` exists on claim requests. Both RPCs require a current server-resolved
super-admin identity; clients cannot select the owner or notification recipient.
Reviewed snapshots prevent stale decisions. Identical retries return the recorded
outcome without repeating membership or notification writes.

The candidates are explicit SQL files, not automatic migrations. Do not run the
old profile `apply.sql` as a prerequisite. Installation files are deliberately not
blindly repeatable: inspect installed objects before any subsequent deployment.

## Verification

`staging-check.sql` runs synthetic fixtures in one transaction ending in rollback.
It uses random IDs, `.invalid` recipients, and an explicit negative player ID so
the player identity sequence is not advanced. No email delivery function runs.

Verified permissions, snapshot conflicts, linked and email-only claimants,
application/claim approval and rejection, repeat-decision deduplication, no-email
applications, and full rollback when notification insertion deliberately fails.
An expanded staging run also passed first-primary/first-contact recipient fallback,
linked creator and staff-to-owner upsert without duplicate membership, conflicting
retries, blank rejection feedback and duplicate case-insensitive authority denial.
Post-test catalog queries confirmed all four private decision/notification tables
were empty, no synthetic users/clubs or test triggers remained, and authenticated
users had no direct access to the private schema. RPCs use a fixed `pg_catalog`
search path and deny anonymous execution.

Existing admin unit suite: 292 passing tests. Older local claim SQL fixtures were
updated for the new snapshot arguments but not rerun locally (no local PostgreSQL
server was available); actual staging assertions are the runtime evidence.

`notification-check.sql` passed in staging and rolled back its fixtures. It covers
service-only access, duplicate reservation protection, stale attempt tokens,
provider-ID requirements, explicit failed-job retries and expired leases becoming
uncertain without automatic resend. Simulated delivery is distinct from sent.

The deployed worker check rendered both source email templates for synthetic
application/claim jobs and recorded `simulated`, with one attempt and no provider
message ID. The worker has no email-provider call path. The check removed its four
private queue/audit rows; a subsequent query confirmed all four private tables
were empty. No real recipient was used.

The new application/claim review UI requires both the exact staging project URL
and `VITE_ENABLE_CLUB_DECISIONS=staging`. It rechecks authority and reviewed
snapshots before RPC submission, separates approval from notification status and
prevents blind retries after errors. The production-connected preview remains
disabled. Synthetic desktop/mobile browser checks, the existing club management
regression, production build and worker Deno type check passed.

## Not enabled

- Production schema, policies and records were not changed.
- No emails were sent. The installed worker simulates only `.invalid` recipients;
  real provider delivery, reconciliation and end-to-end delivery remain unenabled.
- The production-connected preview UI does not call these staging-only RPCs.
- Existing legacy client-write approval routes remain unchanged.
- Concurrent multi-session and email-provider delivery tests remain outstanding.

## Member role/removal candidate — 1 October 2026

`members.sql` adds a private, audited implementation with a public invoker wrapper.
It preserves the source owner/admin/staff roles and permits last-owner changes as
the legacy workflow does. The UI explicitly warns about that outcome. No member
addition, invitation, email or legacy policy changes are included.

This candidate is **not installed**. It and `members-check.sql` were composed into
one staging transaction ending in ROLLBACK. Both the initial and expanded checks
passed on the freshly verified staging project. Coverage includes anonymous and
custom-role denial, revoked authority even on replay, all role transitions,
cross-club and stale email/role/creation-time snapshots, deduplicated operations,
conflicting operation IDs, private audit read denial and mutation rollback when
the audit insert fails. Real records were not targets; fixtures used fixed test
UUIDs and `.invalid` identities. Current trigger metadata was inspected first.

Post-test checks confirmed no candidate function/table, synthetic users, clubs or
members remained. The temporary private-schema grant was rolled back too. No
persistent staging or production deployment occurred during this follow-up.

The member UI has its own default-off `VITE_ENABLE_CLUB_MEMBERS=staging` flag plus
an exact staging-URL check, independent of approval decisions. Until the candidate
is deliberately installed and enabled, actions are labelled local review previews.
Normal discard/close does not reload; uncertain failures require an explicit
reload. Synthetic desktop/mobile browser tests and 296 unit tests passed.

## Add-member candidate — 2 October 2026

Fresh project metadata again confirmed `cefmzkwabdqqoagxhekc` as 4M Padel Staging.
Column and trigger checks confirmed the expected player/member shapes and no
non-internal triggers on the synthetic fixture tables before execution.

`member-add.sql` and `member-add-check.sql` were composed into a single transaction
ending in ROLLBACK. Checks passed for anonymous/unsigned/custom/revoked authority,
invalid roles, changed selected-player snapshot, normalized membership creation,
exact retry deduplication, conflicting operation IDs, duplicate-email rejection
without role overwrite, private outbox denial, source notification payload and
full membership/audit rollback when queuing deliberately fails. Fixture players
used explicit negative IDs to avoid advancing the identity sequence.

Post-test queries confirmed the candidate function, audit table and outbox were
absent; synthetic users/clubs/members/players all counted zero; the temporary
private-schema grant had also rolled back. No production query/write or persistent
staging deployment was performed. The standalone candidate must not be installed
blindly, and its pending-only notification outbox still needs a reviewed delivery
consumer before activation. Legacy direct writes do not acquire its club lock,
so a global case-insensitive uniqueness guarantee is not claimed.

The new UI defaults to local review, with its own exact-host plus explicit staging
flag. Synthetic browser tests cover immediate-access wording versus queued-email
status, selection/search exclusion, stale searches, disabled default, authorization,
context changes, busy closing and uncertain retry locks. The suite now has 307
passing unit tests, including invitation metadata/review and claim-profile-link
regression coverage. No real invitation or email was sent.

## Claim-invitation creation candidate — 2 October 2026

Fresh project, schema and trigger metadata confirmed the staging target and the
existing invitation/player/club shapes. There were no non-internal triggers on
the synthetic fixture tables and no fixture ID/email collisions. Candidate DDL
and synthetic checks were composed into one transaction ending in ROLLBACK.

Checks cover fresh authorization, revoked replay, recipient validation, changed
club/player snapshots, normalized email, exact-operation idempotency, distinct
“send another invite” operations, literal-star recipients, private outbox denial,
no premature owner access, and complete invitation/audit rollback on queue failure.
Fixture players use explicit negative IDs without advancing identity sequences.

Post-test metadata confirmed candidate function/tables absent, all synthetic
users/clubs/players/invitations/members absent, and private-schema usage rolled
back. There was no production access or persistent staging change. Missing-profile
OTP and notification delivery remain unconnected; the outbox is pending-only.
Legacy invitation/acceptance and profile writes do not participate in candidate
locking, so this is not a claim of global cross-workflow serializability. Frozen
idempotent receipts describe creation; UI history must read current status.
