# Player groups and admin messages

This extends the existing account-scoped messaging system. Event access and private conversation boundaries remain separate.

## Product decisions

- Main inbox hides event channels with no server-visible last message. The full event directory remains available; subscriptions are retained so first messages appear normally.
- Admin Messaging has Event messages and Player messages workspaces. Player messages defaults to a separate private conversation per recipient. Shared groups require explicit selection and a group name.
- Admins choose a server-returned organisation, assigned-event audience, or explicitly authorised 4M platform scope. Organisation staff can contact eligible participants from their organisation’s events without choosing an event conversation. An unscoped sidebar permission grants no audience.
- Both the recipient search and send re-check current permissions, request opt-in, verified account eligibility and blocks. A batch fails atomically if any selected player is outside the scope. No email addresses, phone numbers or unrelated private messages are returned.
- Admin reads and sends require MFA. Losing the organisation/event/platform role denies access to its official admin conversations. Other organisation admins cannot browse them merely because they have admin navigation access.
- New private recipients receive an introduction request first. Repeated sends while that request awaits acceptance do not append messages. A declined official request cannot be recreated to bypass the decision.
- Player groups have up to 20 participants including the creator. Invitees see the creator’s introduction only. Accepting reveals discussion from joining onwards, plus that introduction. Other invitees’ identities are visible only to the creator; other members see joined players.
- Accepting a shared group requires the new client’s explicit group-consent version. Older builds must update before accepting, so a generic private-chat Accept control cannot silently join a shared group.
- Members can mute, archive, reply, report and leave. Leaving revokes message reads and notifications. Group creators have no ability to browse other private conversations or remove someone else’s message.
- Separate private sends allow up to 50 recipients per batch; shared groups allow up to 19 invitees. Per-account rate limits and stable retry keys bound fan-out and prevent duplicate requests/messages.

## Native/UI direction

### Compact event chat navigation — 11 November 2026

Pending request emphasis: the Requests control keeps its original green outlined
envelope and green label, with a red parenthesised count when requests exist.
Its icon uses the existing notification bell's 380 ms swing once on arrival,
screen return or count change. There is no repeating timer. Reviewing Requests,
zero count, an inactive/background screen and Reduce Motion stop the animation;
cleanup resets its rotation. The zero state remains a normal request link with
no `(0)`. Existing request counting, filtering and consent rules are unchanged.
TypeScript and 28 messaging regressions passed; isolated component checks cover
count/zero, onPress, active/reduced-motion gating and animation cleanup. The
simulator confirms the normal zero state. No live invitations were generated
for verification, and no native build was created.

User requested clearer separation of announcements/discussion and denser event
cards. This is a light Unslop pass inside the already approved blue/green system.
Direction: padel conversations for players and event teams; practical, sociable,
precise; quiet court-green neutrals; meaningful channel colours and real event
names; consistent megaphone versus speech-bubble disclosure cues.

Audit: callback-based Pressable styles were dropping the selector card's
structural treatment, leaving loose text. The tall dark event banner, repeated
eyebrows/actions and directory footer repeated the same information. Existing
FIP/SAPA row density and Home navigation rows are the layout reference; Unslop
spacing/copy tokens and Refero native touch/disclosure craft guide this pass.

Passes: 12-point internal spacing and 16-point page insets; semantic blue and
green surfaces/edges; matching megaphone/chat icons; one role explanation per
channel; 17-point channel titles, 15-point event names and 13-point helper copy;
horizontal compact rows; static structural styles instead of callback styles;
no generated decoration; native Android ripple with no custom looping motion.
The event header is now a compact details row. Event cards retain dates, unread
counts and event-team context, with smaller channel labels and no repeated
Open chats footer. Search and count remain visible in a shorter header.

Existing event access, organiser MFA, discussion setup/join, read counts, account
switch/race protection and routes are unchanged. No backend deployment or native
build is required. TypeScript, 28 messaging tests and four event-share tests
passed. Simulator review confirms the directory and channel selector render
with their separate card surfaces. No messages were sent during verification.

Unslop by Damir Sokolovsky, CC BY 4.0 (https://heydamir.design/unslop).

References: the user’s existing Home design and blue/green messaging system; their screenshots of the confusing event directory and oversized announcement; Unslop spacing/type tokens; Refero craft guidance on grouping, semantic actions and touch targets. Existing branding is the design lock.

Direction: padel conversations for players and event teams; practical, sociable, precise; quiet court-green neutrals; profile photos carry identity; blue denotes official announcements, green denotes player discussion.

Audit: the event directory’s Pressable callback style was failing to preserve its card layout, leaving a stacked date/title/arrow. Replaced it with static native styles, white bordered cards, aligned dates, labelled channel chips and an Open chats action. Kept permissions context, search and unread totals. Announcement sender, body and audience/time footer now form three compact rows. Accept/Join and Decline use native SwiftUI/Material buttons, explicit messaging blue versus neutral.

## Implementation and verification

- New metadata stays in RPC-only `messaging.groups`, `group_members` and `admin_batches`: RLS enabled; no client table/sequence grants or client policies; no direct service-role metadata-table grants either (workers use checked RPCs). Shared access contracts include all three tables.
- Existing checked helpers are preserved as private pre-extension helpers; group-aware wrappers route group content explicitly. No `service_role` secret is exposed to either client.
- Direct/group creation uses the existing durable push queue. Private/group sends signal only each affected own-account topic, with a maximum of 20 group members. Event channels retain shared thread subscriptions. Healthy connections do not poll.
- Pushes contain no message body or private group title; event names and official organisation names may identify their public context. Reads and queued delivery re-check current membership and eligibility.
- Existing private/group message notification preferences apply to accepted conversations; request preferences apply to invitations. Muting, quiet hours and global opt-out remain effective.
- Account erasure removes deleted Auth identifiers from group recipient arrays; batch retry metadata (content hashes, not duplicate message bodies) expires after 12 months, matching private message retention.
- Isolated PostgreSQL fixture covers group consent, hidden prior history, membership visibility, leaving, outsider IDs, retry mismatches, opt-outs, blocked group pairs, current-role revocation, cross-organisation directory/send/read checks and separate batch recipients. Existing event, worker, session, deletion and capacity suites also run.

## Activation — 10 November 2026

- Applied `messaging_player_groups_and_admin_outreach` to the existing hosted project. Read-only verification confirms all three metadata tables have RLS, no anonymous/authenticated/direct service-role table access, and no client execute access to the new internal helpers.
- `messaging.configuration.groups_enabled` is the feature rollback switch. Set it to false to hide entry points and deny group/admin conversation access, creation and queued delivery. Existing event channels and ordinary private chats continue through their original checked paths. Do not restore pre-extension read functions over group metadata: that would lose the group-specific consent boundary.
- The isolated PostgreSQL suite passed consent, tenant, session, worker and capacity checks; the shared access verifier passed 66 table contracts, four sequences and column restrictions with automatic grants disabled. Mobile typechecking, 28 messaging tests and 12 web messaging/authenticator tests passed. The website production build passed.
- Web preview verified separate-private selection, optional group review and five-item broadcast pagination with clearly labelled sample accounts; no live player messages were sent by these checks. The simulator verified empty event channels stay out of the inbox. Group invite/reply delivery still needs a device end-to-end test with consenting test accounts.
- Local admin navigation: Event management → Event messages → Player messages. Scope choices and player search come from the server. Production website publishing and a new physical-device app build are separate from this database activation; older app builds cannot accept shared groups silently.

## Broadcast history and Home destination

- Applied `push_broadcast_home_and_paginated_history` to the hosted project. `list_push_broadcasts_page(p_page)` returns five campaigns plus total/page metadata under the existing broadcast-admin permission gate. Anonymous execution is denied; the older list RPC remains compatible.
- Dashboard/Home uses the exact `/(tabs)` destination. Server and mobile routing reject arbitrary suffixes, redirect queries and traversal. The isolated broadcast fixture passed page boundaries, duplicate prevention, stale-page clamping, permissions and Home routing. Nine notification routing tests passed.
- The user confirmed their physical-phone broadcast test works after signing into the same admin account and enabling notifications. The new Home tap destination and group features need the updated app build; that earlier successful push test does not verify these new routes.

## Registration colour consistency

The existing Home design is the reference for registration: court-green actions with white labels, neutral profile-card borders, green progress/selection states and blue standalone loading feedback. Replaced the inherited neon token in registration, division and partner choices, shirt sizes, payment review, entry balance and division-switch actions. The event’s artwork, content and checkout behaviour stay intact. This is a focused colour pass using the existing Unslop/Refero reference lock, not a new visual direction.
