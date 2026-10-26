# Admin integration status — 23 September 2026

Reference: current main checkout `/Users/bradein/Sites/4m-Padel`, not an assumed
schema or a screenshot-only reconstruction. This is a local integration status,
not a deployment claim. Existing database permissions remain authoritative.

| Module | Connected in new UI | Remaining |
| --- | --- | --- |
| Events / registrations | Existing entry/payment/comp/move/remove/pair logic, grouped seeded teams, imported participants, event editing/cancellation | Native draw generation/results, broadcasts, broader delegated write permissions |
| Calendar | Read directory, existing full and quick editors, full-event and quick-event creation | Duplication, deletion, automatic result promotion |
| Players | Directory/connections; all 21 live profile editor fields, source dropdowns and custom brands, club lookup, photo upload/preview/removal, approval and licence flags, review and conflict-guarded update | Auth identity migration, creation, invites/reset/impersonation/deletion |
| Clubs | Directory/details/media reads; full source profile editor with Google Places, facilities/hours/contacts/socials, branding, source status/verification/federation controls, inherited group website/logo, staged image previews/uploads, review and conflict-guarded updates; shared live club-creation wizard | Application/claim decisions, membership/invites/organisation links, group management, Google Sync, deletion/merge, delegated club-owner permissions |
| Coaches | Paginated directory, source filters, landscape profile, complete live profile editor with searchable club selection and photo replacement, confirmed approval/rejection/revocation | Deletion |
| Payments | Recorded payments/refunds with reasons/references; staging/test-only read-only gateway comparison | Live gateway access policy, single/bulk reconciliation, refund write workflow |
| Payouts | Recorded organiser interim payments | Request/approval/execution and verified bank settlement |
| Finance reports | Existing receipt/refund reporting and exports | Settlement operations and reconciliation writes |
| Access & permissions | Existing access workspace and grant review | Full review of per-event action enforcement and delegated module parity |
| Organisations / federations | Navigation placeholders | Main managers, member workflows and profile editors |
| Gallery | Authorised album/photo reads, all 13 source album fields, image previews, selection/cover/upload/removal reviews; local drafts by default; staging-only mutation adapter | Production write enablement after staging verification; storage cleanup policy |
| Blog | Navigation placeholder | Main content management workflows |
| Email broadcast | Source audience filters, paginated authorised reads, normalized deduplication, manual recipients/exclusions, rich-text composer and fresh broadcast/test reviews | Server-side module authorization, durable/idempotent batch delivery and delivery reporting; actual sending remains disabled |
| Integrations / Settings / global Audit | Navigation placeholders | Source-by-source feature and permission mapping; event activity reads already exist |

## Findings requiring explicit design decisions

- Main player editing updates `players.email` without an accompanying login or
  email-linked registration migration. Full editor parity exposes this source behaviour with an explicit warning at review; it does not claim to migrate identity.
- Main `UserPayments` permanently deletes ledger rows. Prefer discussing an
  auditable correction/reversal workflow before porting this action.
- Current club save sends a broad snapshot. The new full profile editor patches
  changed source fields and guards against concurrent changes. Group-shared
  website/logo are reapplied on every save, matching the source and appearing in
  the review. Status fields affect public listing and existing member access;
  claims, membership grants and application-notification workflows remain separate.
- Some main refund displays reference fields not established by repository
  migrations. This batch only selects confirmed refund fields.
- Multi-request event saves remain nontransactional. A partial failure is not
  safely retryable without inspecting records. Server transactions/version checks
  are a follow-up, not silently substituted logic.

## This parallel batch

Players, Clubs and Finance were separate agent scopes; root integrated Coaches,
checked shared navigation and reviewed write authorization. Review caught literal
ILIKE-email matching and logout-dialog issues, both corrected before handoff.
The global badge now says Admin preview, not Read-only preview: connected editing
can affect live records when explicitly confirmed. Unconnected destinations show
their real status rather than inactive buttons labelled as available workspaces.

Coaches design lock: existing new-admin Players/Clubs tables and native drawer;
current MAIN CoachManager supplies fields and filters. Refero's existing-product
workflow and bundled craft guidance were used; live Refero tools were unavailable.
No invented coach metrics, stock profiles or status transformations. Approval and
rejection now use the live manager's status-only update. Confirmation and an atomic
original-status predicate protect against accidental and concurrent decisions;
the directory and counts update locally without a reload.

Verification uses synthetic clients/browser fixtures only. No real profile, club,
payment, application, email, refund, transfer or deployment was performed.

Shared dropdown standard: all native-only select sites in the new admin now use
`SearchableDropdown`, including preview-mode full/quick event builders. Existing
option values, form data, change handlers and required validation are retained.
Search is inside the popup; keyboard, disabled options, no-results, reset and
dialog top-layer behaviour have mocked desktop/mobile browser coverage. Legacy
non-preview event-builder controls are unchanged.

Coach profile follow-up: portrait, contact details, club chips and plain-text bio
now have explicit spacing and typography. Bio paragraphs and line breaks retain
the original wording. Approved profiles place revocation behind Manage approval.
The editor preserves the live field set and three-club rule. Replacement images
are uploaded only after review/confirmation; old photos are retained rather than
deleted before the replacement succeeds. Mocked desktop/mobile tests cover this
and preserve application status during profile edits.

Combined handoff: 273 unit tests pass; production build passes with the existing
bundle-size warning; mocked player/club edits, recorded refund details and Coaches
desktop/mobile checks pass. `git diff --check` passes.

## Calendar quick-edit integration and module parity audit

Calendar and Event Manager now route existing quick events to the shared live
`QuickEventBuilder` in the new theme, not the full tournament editor or a demo form.
The wrapper loads the complete event and existing division before opening, checks
fresh super-admin access and concurrent changes before writes, and preserves the
save confirmation until closed. Quick editing requires one recorded division;
missing or ambiguous divisions block editing rather than silently invent defaults.
Closing without saving does not reload Calendar. The underlying multi-request
save is unchanged; partial failures block blind retries and refresh on close.

Synthetic tests cover update-only persistence, preserving visibility/slug, blank
access-code retention, replacement/removal RPCs, denied/stale/missing records,
retry guards and full/quick Calendar routing. No live records were changed.

Source-by-source audit of remaining Coaches/Clubs functions (main checkout):

- `CoachManager.jsx` — `handleDelete` is not integrated. Counts are present;
  the live status/timeline charts are not yet reproduced. There is no live admin
  coach-create workflow to copy.
- `ClubManager.jsx` — `handleSave`, `handleUpload` and Places attachment now supply
  the integrated full profile field/normalization/media/location contract.
  Creation via `ClubCreateWizard` is now connected (see follow-up below).
- Club application approve/reject, ownership-claim approve/reject/invitation,
  organisation link/unlink and deletion remain unconnected. The claim controls
  currently shown in preview are explicitly local demonstrations.
- `ClubMembersManager.jsx` — add member, change role and remove member remain.
- `ClubGroupManager.jsx` and `GoogleSyncManager.jsx` remain unconnected, as does
  delegated club/organisation-owner access parity and live club metrics.

Follow-up safety findings: live coach deletion removes its photo before deleting
the row; club approval may announce success despite an owner-assignment failure;
claim approval spans several nontransactional writes. These must not be presented
as atomic successful actions when integrating them. No deletion or notifications
were executed during this audit.

## Full club profile editor

Independent current-MAIN comparison found no missing existing editable profile
section: Profile, Principal Sponsor Banner, Social Media, Courts, Café/Restaurant,
Services, Opening Hours, Gallery, Sponsors & Partners, Contacts and Federation.
Existing persisted slug, SAPA-registration and gallery-caption fields are also
exposed. Existing stats and nested untouched data are retained, not invented.
All selection dropdowns use the shared searchable control.

The new light, landscape modal uses the established admin design and Refero's
existing-product/craft guidance. About remains plain text as in the live source.
Images display thumbnails; selection stages local previews. Only referenced images
upload after confirmation to the source `profile-pics/clubs/<kind>/` paths with
unique non-overwriting filenames. Previous assets are not deleted. Failures after
an upload can leave an unused asset, but do not trigger an automatic retry.

Save checks fresh super-admin/All 4M authority, the full profile snapshot, current
group inheritance and original-field/update-time conditions. No creation, emails,
claims or membership mutations run through this form. Closing/discarding does not
write; successful saves merge into the open profile and directory without reload.

Mocked tests cover desktop/mobile sections, CSV typing, Google address/city/latitude/
longitude updates, shared group branding, staged-upload ordering, permissions,
concurrent changes, partial failure locks, discard and end-to-end directory editing.
No live club record, image, membership or email was changed during verification.

## Club creation integration

The directory now opens the existing `ClubCreateWizard`, with its seven source
steps and unchanged creation payload, in the new admin theme. Basic information,
Google location, facilities, courts, photos/logo, opening hours and review are
included. Dropdowns are searchable; Google suggestions remain interactive inside
the native modal. Successful creation merges the returned club into the directory
and opens its profile without reloading the list. Closing an unchanged form does
not reload; changed forms require discard confirmation.

The source admin flow immediately publishes and verifies a club. Its uploads
happen when selected, not at final confirmation; the new UI explicitly states
both behaviours. It does not create memberships, approve claims or send the
public application emails. Immediate uploads can leave unused assets after
discard/failure; existing files are not deleted as part of this integration.

Fresh identity and `admin_sidebar_permissions` super-admin checks run before
opening and before each upload/insert. Scope changes and switched identities are
blocked. Busy closing, duplicate submission and blind retries after uncertain
writes are prevented. A failed slug lookup now stops creation rather than being
treated as evidence that the slug is available. Source public flows retain their
existing styling; only the new-admin caller opts into the preview theme.

Reference lock: existing admin light surfaces, green action accents, native
dialogs and searchable controls; MAIN supplies all steps/options/persistence.
Refero existing-product and craft guidance informed focus, mobile sizing and
media presentation. Tests use synthetic clients only, never live club writes.

Verification: 279 unit tests, production build, existing Clubs browser regression
and the new creation browser suite pass. Creation checks cover all seven steps
at 1440px/390px, footer access, logo/gallery previews and tagging, searchable
options, mocked Google address/pin selection, publishing/success, denied/revoked
access, failed slug lookup, failed upload/insert retry locks, discard and busy
Escape handling. External requests are blocked in browser fixtures. No live
database/storage/email write or deployment was performed.

## Approval backend — approved staging-only follow-up

Atomic application and claim decision RPCs are now installed and tested in the
verified **4M Padel Staging** project, not production. Synthetic transaction tests
prove authorization/snapshot guards, nullable owner parity, retry deduplication
and rollback of membership/publication/decision/audit if outbox insertion fails.
All fixture records were rolled back; no email delivery was invoked. See
`club-write-candidate/STAGING-VERIFICATION.md` for target and verification details.
The follow-up adds staging-gated application/claim review and confirmation using
these RPCs, with fresh authority/snapshot checks, busy guards and uncertain-error
retry locks. Activation requires the exact staging URL and explicit staging flag;
the production-connected UI still shows claim decisions as local previews only.

Service-only notification reservation/acknowledgement/retry RPCs and a deployed
provider-disabled worker are installed in staging. The worker renders the existing
source email copy and records `simulated`, never `sent`; it accepts only synthetic
`.invalid` recipients. Expired leases become uncertain and are not blindly retried.
The deployed synthetic application/claim check passed and removed all its records;
all four private queue/audit tables were subsequently confirmed empty.

Verification: 292 unit tests, desktop/mobile decision browser checks, existing
club management browser regression, production build and worker Deno check pass.
Refero existing-product guidance kept controls consistent with the new admin UI.
No real email or production deployment occurred. Real provider delivery,
reconciliation, concurrent multi-session testing and production activation remain
outstanding; notification simulation is not evidence of email delivery.

## Member access review — 1 October 2026

The new club UI now includes role-change and removal reviews, preserving the
current owner/admin/staff options and email-linked members without a player row.
Roles use the shared searchable dropdown. Removal is visibly destructive and
requires review; last-owner changes warn clearly without inventing a new policy.
Refero existing-product guidance keeps the established light admin controls.

Writes require a separate, default-off MEMBERS staging flag and the exact staging
URL. Production remains a local review preview. Reviewed member identity, club,
email, player link, role and creation timestamp travel as an immutable snapshot.
Fresh authority and context checks precede submission; busy and uncertain-error
guards prevent double submission or blind retries. Successful results update the
list locally; ordinary discard/close does not trigger a reload.

The atomic SQL candidate passed synthetic staging transaction checks and was
rolled back, including its schema objects and fixtures. It has **not** been
installed or enabled. New desktop/mobile review checks, the existing club browser
regression and 296 unit tests pass. No real member access or email changed.
Adding members, invitations, live activation and concurrent multi-session testing
remain outstanding. See `club-write-candidate/STAGING-VERIFICATION.md` for details.

## Adding members and invitation review — 2 October 2026

The new club UI now searches existing players by name/email (source minimum two
characters, eight results), excludes existing member emails and offers the source
owner/admin/staff roles, defaulting to owner. Inputs are full-width; role controls
use the shared searchable dropdown. Confirmed additions would grant access
immediately, not wait for invitation acceptance. The reviewed player snapshot,
fresh authority, busy/context checks and uncertain-error locks protect submission.
Success merges the returned member/name into the current list without reloading.

The separate `VITE_ENABLE_CLUB_MEMBER_ADD=staging` plus exact staging URL gate
defaults off. `member-add.sql` is an atomic membership/audit/pending-notification
candidate, not installed. Its synthetic staging transaction tests passed and
rolled back all objects/records; no provider call occurred. Its new pending outbox
does not yet have a delivery consumer. Existing legacy direct writes are unchanged
and do not share the candidate's normalized-email/club-lock duplicate guarantee.

Claim invitation history is now available through an explicitly loaded,
club-scoped, freshly authorized metadata query that never selects bearer tokens.
Pagination and searchable status filtering preserve the recorded status: pending
is not guessed expired based on age. An email-only local review checks for an
existing player and explains the source's additional profile-setup email when
needed. It warns about a recorded pending invitation to the same address. There
is deliberately no invitation insert, email, OTP or acceptance action in this
section. The source's player-search recipient picker and actual invitation sending
remain to be integrated.

A source-flow defect was also corrected: Create Profile on the public claim page
now carries the original URL token, not `invite.token` (absent from the safe lookup
response). Acceptance/publication rules were not changed. A regression assertion
covers the corrected link; real invite acceptance was not exercised.

Verification: 307 unit tests, new member-add and invitation desktop/mobile browser
checks, existing management/member regressions and production build pass. External
requests are blocked in browser fixtures. Refero existing-product/craft guidance
kept established controls, confirmation patterns and focus/full-width inputs.
No real membership, invitation or email was created; no deployment was performed.

## Claim invitation recipient selection and creation candidate — 2 October 2026

The invitation recipient field now follows the existing ClubManager flow: search
players by name/email after two characters, show up to eight matches, select a
recipient, or review a complete email address without a player profile. Search
uses fresh authorization, quoted literal filters, debounce, cancellation and
stale-result guards. Exact profile resolution paginates candidate matches before
normalizing and comparing addresses; wildcard characters and stored whitespace
cannot select a different profile, and duplicate exact profiles fail closed.

A separate `VITE_ENABLE_CLUB_INVITATIONS=staging` plus exact staging host gate
controls creation. It remains off. The immutable club/player review, confirmation,
busy guard, bounded timeout and same-operation retry flow are connected to a new
SQL candidate. A distinct operation still permits “Send another invite”, matching
the source; a retry of one operation cannot create a second invitation. Recorded
history wins over an old pending receipt when retrying an already-created invite.

`invitations.sql` atomically records a pending claim invitation, audit and private
pending notification reference. It does not grant membership or publish a club.
Tokens are not returned to this UI, selected for history, or copied into the audit
or notification payload. There is no delivery consumer or OTP connection yet.
Missing-profile invitations explicitly report that profile setup is unconnected.
No candidate database object is installed and no live email/write flag changed.

The existing light controls and review layout remain the visual reference, using
Refero craft guidance for full-width fields, keyboard controls and async feedback.

Verification: 317 unit tests, production build and synthetic desktop/mobile
invitation QA pass. Browser checks cover default-off writes, name selection,
stale search/context, authorization/lookup errors, a never-resolving lookup timeout,
no full-page reload after creation, and a committed request with a lost response:
same operation retried twice, one invite only, accepted history preserved.
An explicitly deferred pre-creation history response also preserves the new row
when it arrives after confirmation, without an extra history fetch.
Rollback-only staging checks passed again after aligning server email validation
with the client. All fixture requests outside localhost are blocked; no real email,
OTP, ownership grant or persistent database change occurred.

## Gallery and email broadcast parallel integration — 2 October 2026

Two agents implemented the new Publish workspaces against the existing
`GalleryManager.jsx` and `EmailBroadcastManager.jsx`; root integrated navigation,
fresh shared authorization and gallery mutation tests. Source fields and
audience semantics were inspected rather than inferred from screenshots.

Gallery reads every album/photo page and respects `gallery.allowedAlbums`.
Assigned-album users can manage photos only in assigned albums, matching the
source's restriction on album creation, editing and deletion. The editor retains
all 13 live fields, with searchable event/organisation/parent selectors and actual
cover previews. The photo grid includes select-all, bulk/single removal, cover
selection, original-image access and upload previews. No tagging or manual
reordering workflow was invented: neither has handlers in the existing manager.

All gallery changes are browser-local by default. An explicit
`VITE_ENABLE_GALLERY_WRITES=staging` flag and exact staging URL enable the separate
adapter. It rechecks the authenticated actor and current grant, checks reviewed
record snapshots, uses source JPEG dimensions/quality and reports each upload's
outcome. Failed or uncertain UI operations require reloading before another
attempt. Album creation retains its reviewed UUID. Photo removal deletes records
but retains original storage objects for recovery, improving the source's
storage-first destructive ordering. Album deletion already retains storage in the
source. This is not a transactional storage/database workflow or an automatic
orphan cleanup implementation; neither production writes nor the flag were enabled.

Broadcasts retain multi-event selection, source paid/pending and partner/solo
filters, manual recipients, exclusions/restoration, subject, rich content and
test-subject suffix. Withdrawn site registrations are excluded. Rankedin
participants are included only with both filters unfiltered, as in the source;
partner-email fields identify a paired entry but are not additional recipients.
Addresses are normalized and deduplicated across sources. Any audience query
failure blocks a partial recipient list from becoming a successful review.
Review rechecks fresh authorization and audience records; refresh preserves the
composer while invalidating the review. Actual test/broadcast sending is not
connected: the existing provider endpoint checks for any admin record rather
than explicit Email Broadcast permission, and retries need durable batch
idempotency/delivery status. No provider call, queue record or email was created.

The existing light admin UI supplied the design reference; Refero craft guidance
kept full-width searchable controls, native dialog focus and responsive layouts.
Desktop/mobile browser fixtures use synthetic records and block external calls.
Verification: the prior 317-test suite plus 27 new publishing tests pass, along
with Gallery and Broadcast desktop/mobile browser checks. The production build
passes; build retains existing CSS
gradient, mixed-import and large-bundle warnings. No live gallery asset, album,
photo, recipient record or deployment was changed.
