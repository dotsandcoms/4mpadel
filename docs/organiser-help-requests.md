# Organiser help requests

**Status:** Accepted and implemented
**Date:** 13 November 2026
**Decision:** The player submits a private in-app request. Event organisers handle event enquiries; 4M handles platform enquiries and escalations. Email remains an explicit fallback.

## Player experience

Help & enquiries offers topic guidance, a request composer and a Help messages link into Messages. The native entry picker uses the system navigation/search bar. It shows dates, years and venues, groups current/upcoming and past entries, and searches individual words across the name, date and location. Past entries remain available because support issues can arise after a tournament. This is independent of Find tournaments, which excludes completed events.

Selection returns to the existing composer without losing its message. The destination appears before submission. Event/payment references are checked on the server. Event-linked payments use their canonical event; profile, licence and app enquiries go to 4M. Leaving the reference empty sends a general request to 4M.

Help conversations show Open, Awaiting your reply and Resolved requests. Players can read the conversation, reply, resolve or reopen. Staff replies mark Awaiting player; a player reply to an active request returns it to Open. Resolved requests require an explicit Reopen action before another reply. An email action on an active saved request includes its stable `4M-…` reference, event/payment reference and message, addressed to the event's organiser contact. A missing or malformed organiser email falls back to 4M and is disclosed. The composer also retains an email alternative for requests that cannot be submitted in-app. Email drafts require the user's review/send action; replies to email are not automatically imported into the in-app thread.

## Admin experience

Admin → Event management → Help requests provides a queue, event/reference search, status/team filters, request history, replies, resolution/reopening and escalation to 4M. It reuses the existing authenticator flow. Organisers see only their scoped events; verified platform Super Admins can review platform issues and all event queues. Escalated requests remain visible to the event team for coordination.

The queue and open thread refresh while the page is visible. Player lists/threads refresh in the foreground. Account changes and page disposal invalidate pending reads and writes so another account's data cannot populate the view. No test messages, support requests or emails are sent to real recipients during verification.

## Storage and access

Forward migration `mobile/supabase/migrations/20261113060150_organiser_help_requests.sql` creates `public.help_requests` and `public.help_replies`. Both have RLS and explicit revokes for public, anonymous, authenticated and service roles. There are no direct table policies or sequence grants because these UUID tables are RPC-only. Their reviewed contracts are in `tests/fixtures/data-api-access.mjs`.

The public `help_api` wrapper is security invoker. Its checked private entry point validates a confirmed, current, non-banned, non-anonymous user/session. Staff access requires MFA and the existing tenant-scoped event manager check, or platform Super Admin access. It never trusts client-supplied owners, teams or author roles. Payment/refund references must belong to the authenticated user. All private helpers are revoked from client roles.

Request/reply keys make retries idempotent. Requests are limited to 20 per account/day and replies to 100 per author/hour. Indexed owner, event/status and team/status queues return 50 rows with a stable timestamp/ID cursor. Replies return 100 with an earlier-message cursor. Stored body text is rendered as text. Player account deletion cascades their requests and replies.

No old migrations were replayed. Root and mobile migration inventories share the hosted database. The new migration was applied to the existing project; read-only verification confirmed the authenticated RPC grant, denied anonymous/direct table access, and invoker wrapper.

## Alternatives and trade-offs

Email alone needs no ticket storage but lacks a shared status/history and organiser accountability. In-app only provides that history but depends on the app/backend being available. The combined approach provides both, at the cost of email and in-app replies remaining separate channels. 4M handovers and new requests assigned to 4M now queue an email alert. Email replies are not imported automatically.

## Design record

This is a focused brand-preserving polish: 4M's existing light surfaces, system type, settings blue and native search affordances. The audit found an over-heavy sheet heading, a generic form input used as search, an oversized highlighted empty choice, and a long list without dates/locations. The new hierarchy uses a compact native title, quiet optional selection, consistent rows, date tiles and readable metadata. No generated imagery or decorative motion was needed.

References: the user's supplied screen, the app's native tournament/club search, Refero's colour/touch craft guidance, and Unslop by Damir Sokolovsky ([@heydamir](https://x.com/heydamir)), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), [original skill](https://heydamir.design/unslop).

## Verification

The isolated PostgreSQL tests exercise ownership, tenant and MFA boundaries, direct-grant denial, organiser/platform routing, payment/refund ownership, malformed email fallback, request/reply retry safety, state transitions and escalation. The Data API verifier covers 68 table contracts and four sequences with automatic grants disabled. Mobile checks include search normalisation, historical entry context and email header-injection rejection. Web and simulator Release builds are verified separately. Existing project-wide security advisory findings are outside this feature's scope.

Final results: all 748 mobile checks and TypeScript pass. Queue pagination was checked with 53 requests and reply pagination with 105 messages; stale email/session claims are rejected. The web production build passes. The real Admin component was exercised in a labelled local preview with fictional requests: opening, replying, awaiting-player status, resolution and reopening controls. The live admin route remains behind sign-in; no real requests or emails were created during QA.

The iPhone 18 Pro simulator confirms the native Choose an entry title, Done control, date/venue rows, full long titles, city search and return selection. Selecting Rockets Cup routes to ROCKETS PADEL + SOCIAL. The player's request list loads against the deployed backend. The Admin website change is implemented and built locally; publishing that web build is a separate rollout step.

The nested Help root explicitly supplies a native Back arrow because its own stack starts at the Help index and cannot inherit the parent stack's automatic arrow. Back returns to the previous screen, with Home as the direct-link fallback. Request screens retain their normal stack back navigation and the picker has a native Done control.


## Unified Messages and Admin queue (13 November)

Help tickets now appear in Messages under All and Help. Each row is a projection of `help_requests`, and both the app and Admin reply to the existing `help_replies` transcript. No private player chat or duplicate copy is created. Previous Help request URLs redirect to the same Messages conversation. A new help request starts from the Help filter’s compose action.

Replies carry a per-ticket sequence assigned under the ticket row lock. The RPC-only `help_request_reads` table stores a separate read boundary for each account. `mark_read` accepts a fetched reply ID, verifies ticket access, and advances only to that reply. Older pages cannot regress the boundary, and a reply arriving after a page was fetched stays unread. Outgoing messages do not count as unread. Counts cover the full authorised inbox, including tickets beyond its 50-row first page.

Unread counts appear on Messages, its filters, the Help entry point, the home bell and the Admin Help section. The notification sheet links to unread Help messages. Private Broadcast signals contain no transcript or sender information; the client re-fetches through the checked RPC. Personal, event and platform staff topics have restrictive read boundaries and reject client-written signals, including in the presence of older permissive policies. Foreground clients reconcile missed signals once a minute; background clients do no polling. These in-app updates are now supplemented by queued email alerts for 4M support. Remote push alerts are not part of this delivery change.

Verified organisers and Super Admins can use the app’s Help inbox to manage the same authorised event requests. An unverified organiser sees their own requests and a verification action. Staff access still requires MFA and event scope; it does not depend on player messaging consent or the private-chat feature flag. Sender email is returned only to the requester or authorised, MFA-verified staff.

The Admin queue is a semantic table with one ticket per row: reference and latest reply, requester name/email, linked event and topic, status, responsible team and last activity. Search accepts sender, event and the displayed ticket reference. Opening a row shows the full paginated history, requester/event details, reply, resolve/reopen and escalation actions. Returning to the queue preserves its filters. The design uses the existing dark Admin table conventions, with higher text contrast and restrained status colours; Unslop credit remains Damir Sokolovsky ([source](https://heydamir.design/unslop), CC BY 4.0).

Migration `mobile/supabase/migrations/20261113070555_help_messages_and_read_receipts.sql` is applied to the shared hosted database. No new message, ticket or email was sent to a real recipient during this QA; the existing user-created test ticket was opened and marked read. SQL tests cover owner/organiser/Admin scope, sender search, idempotence, receipt races, per-account unread counts, realtime boundaries and direct-grant denial. All 748 mobile tests and TypeScript pass; the access verifier passes 69 public-table contracts and four sequences with automatic grants disabled. The security advisor delta is one expected RLS-with-no-policy informational result for the new RPC-only read table; pre-existing warnings/errors are unchanged.

The simulator is reloaded with the new Messages flow. The web production bundle was verified using the unchanged Git-tracked background image through a temporary Vite configuration because macOS denies reading `src/assets/featuredbg.jpeg` in this checkout. No image permissions or source assets were changed. The Admin queue/history/reply flow was exercised in a labelled, fictional local preview; publishing the Admin website remains a separate rollout step.


## Entry shortcuts, resolved requests and support alerts

Manage entry has a full-width Support action on every division card, available after registration has closed. It opens the enquiry composer directly with only event/registration identifiers in the URL. The checked RPC verifies that the signed-in account owns or partners that registration and resolves its canonical event, division, player and partner names. The form shows that entry and the account email automatically. Failed or mismatched entry lookup blocks submission instead of silently routing a general request. The ticket stores its registration reference and includes the entry context in the staff history.

Resolved requests are read-only in the app and Admin. Reply fields, send/email actions and escalation actions stay hidden until an explicit Reopen action. The server rejects new replies and handovers while resolved, under the ticket row lock; retries of already-accepted replies remain idempotent. App actions share one 52px, full-width treatment; Admin actions use equal-sized grid columns.

`help_support_alerts` is a new RPC-only delivery queue: RLS enabled, no direct client/service-role table grants, and checked service-only claim/prepare/finish RPCs. A transition into 4M support (or a new 4M request) queues one alert per ticket. Escalation retries cannot duplicate its handover note or email job. No old tickets were backfilled. The alert goes to the fixed `info@4mpadel.co.za` inbox and includes ticket reference, event, help type and an authenticated Admin deep link. It does not copy the private message body into email.

The `deliver-help-alerts` Edge Function uses the existing scheduler credential and verified Resend configuration. Payloads are frozen before delivery and use a stable provider idempotency key. Failed sends are retried with a bounded lease/backoff; uncertain sends beyond 23 hours or eight attempts require review. This stays inside Resend’s [24-hour idempotency window](https://resend.com/docs/dashboard/emails/idempotency-keys). Queue delivery status is visible to staff. The scheduler runs every minute and new work also requests an immediate delivery run.

Migration `mobile/supabase/migrations/20261113091431_help_support_alerts_and_entry_context.sql` and worker version 1 are deployed. The authenticated, non-sending readiness request returned HTTP 200 and `{ready:true}`. The queue was empty at rollout; no real help request, reply or email was created during verification. The local CLI cannot list secret metadata (Supabase returns 403), so configuration readiness was checked through the deployed worker using the already-configured server credential without returning secret values.

Verification covers owned/partner entry routing, forged event/entry rejection, read-only resolved tickets for players and staff, handover deduplication, fixed-recipient delivery, frozen retry payloads, stale leases and retry-window expiry. Data API checks pass 70 public-table contracts and four sequences. The security-advisor delta is one expected no-policy informational result for the new RPC-only queue; pre-existing warning/error counts are unchanged. The mobile suite, worker tests/type-check, web build and simulator build pass.

The neon default is replaced with blue in the native/web theme. Untiered event controls use the app’s blue and choose contrasting icon/text colours; existing SAPA tiers remain data colours. Help keeps its plum category colour. Admin event names use soft green and help types use light plum.

## Live Admin release — 13 November 2026

The user requested publication. Admin Help is live at https://4mpadel.co.za/admin?tab=event-mgmt&section=help on Vercel deployment `dpl_3A4ztWfaXKUkNPxhZRKr3JkUkpbG`, replacing `dpl_49SmcsNpKmrGnKYzYpEiCb6A2snY`. The release was prepared from current production and changes six Help/theme files; 799 other production files are verified unchanged. The candidate's local and Vercel builds pass. Live Home, Admin, profile and calendar routes return the verified candidate asset manifest, with matching compiled Admin/Help bundle hashes and the production backend reference.

Release receipts are in `outputs/help-admin-release-20261113`. Rollback restores the preceding Vercel deployment while retaining the compatible Help data and migrations. Unfinished finance workspace edits were not deployed. Production environment secrets were not downloaded locally; Vercel's build used its existing production settings.

Personal Help archiving is added by `mobile/supabase/migrations/20261113101314_help_conversation_archive.sql`. It preserves ticket status/history and isolates each account's preference. New correspondence restores the conversation; archived items are excluded from unread counts. Mobile controls ship in the replacement test binary.
