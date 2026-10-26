# Access & Permissions — first review batch

## Gallery album assignments — review batch

Added a collapsed, lazily loaded album-access editor using the live `albums.id,title` fields and `gallery.allowedAlbums` setting. Includes assigned-only summary, title/ID search, four rows per page, unknown-assignment preservation, and confirmation before removing the final restriction. Only a super-admin operator drafting a custom account with Gallery enabled can edit. Draft review/reset/discard includes album changes; no writes or emails occur. Empty allowedAlbums means no specific restriction in GalleryManager, not denial; this legacy behaviour is unchanged. The better-ui skill guided reuse of existing picker, spacing and colour styles.

## Finance event assignments — review batch

The draft editor now exposes Finance-specific event assignments with name/ID search, four events per page, assigned-only summary, and preserved unresolved IDs. Only a super-admin operator drafting a custom account with Finance enabled can edit. Changes participate in the existing review/reset/discard flow; there are no database writes.

Verified against `FinanceManager.jsx`: nonempty Finance allowedEvents take priority; otherwise Event Manager assignments are used, then finance-managed event IDs. Empty is not an explicit denial. Creating a Finance settings object preserves the previously effective allowedTabs rather than accidentally narrowing them to transactions. Backend enforcement and empty managed-event fallback behaviour still need security review before rollout.

Review route: `/admin-preview/team-access` (System → Access & permissions).

Implemented: direct permission directory with search, role filters and pagination; existing player lookup; profile image fallback; drawer with current role, module grants, Event Manager assignments, Finance sections and direct membership records; local draft review, reset and discard confirmation. Unedited granular settings are preserved.

All data requests use SELECT. No draft is persisted, no membership is changed and no permission is granted. Account management requires an existing super-admin or admin-mgmt grant. Narrow organisation/club scope redirects the user to account context before opening this editor.

Verification: 40 Node tests passed; production build passed; focused ESLint passed. Browser synthetic QA verified drawer opening, change review and discard protection. The live route displayed the sign-in gate in the browser session used for verification; authenticated live data and membership completeness still require review.

Known boundaries: action-level permissions, reusable role templates, scoped delegation, complete effective-access calculation (including legacy ownership and hard-coded super admins), gallery album editor, Finance event-assignment editor and persisted audit history are not implemented in this batch. Existing event/album/other settings remain intact in drafts. An empty Event Manager allowedEvents list retains the existing default semantics, not an explicit denial. Selecting Finance sections while Finance is disabled shows its stored/default section values but grants no module access.

Product direction confirmed: the workspace dropdown will expose only authorised contexts and eventually switch modules, data and actions together. Event Manager currently has scope filtering; full per-workspace permission enforcement remains in progress. Do not infer backend security from client filtering.

UI follows the better-ui skill: existing design tokens, subtle watermark icons, restrained surfaces and existing accessible drawer behaviour. No feature was removed as obsolete.

## Required permission notification and email redesign

Backend preparation: the pure email renderer is now shared with `send-email`. Its new `permission_access_updated` branch requires a trusted service-role caller and explicit `ENABLE_PERMISSION_NOTIFICATIONS=true`; default is disabled. The adapter accepts one recipient, rejects BCC/lists, and reads exact persisted permission records instead of caller-supplied draft content. HTML and plain text use the same renderer as preview. The deployed function has NOT been changed and no notifications have been sent. Do not enable this branch until verified permission persistence, a durable idempotent outbox and delivery reporting are implemented. The backend currently uses stable event IDs in its summary rather than adding extra profile/event queries. Deno type-check and four adapter tests pass.

Preview implemented: the user drawer includes a collapsed notification preview with sandboxed HTML and a plain-text alternative. The template uses escaped user/event values, the deployed `/admin` URL confirmed in the existing sender, and website sign-in password-recovery instructions confirmed in AuthModal. It reflects direct draft settings, excludes unenforced action proposals, and performs no send/save/network operations. Four template regression tests cover escaping, deployed URL, super-admin scope and empty module grants. Email-client rendering, secure post-save delivery, deduplication and delivery reporting remain pending. No existing email template has been replaced.

User requirement, 8 September 2026: send the user an email after permissions are successfully granted, explaining how to log in. Design this template to match the new admin UI; roll the shared email design out to all email templates after the rebuild.

- Include the user's name when available, a concise summary of granted modules/workspaces/events, the correct deployed admin login link, instructions for existing-account sign-in and the existing password-reset route, and guidance on the workspace dropdown where applicable.
- Use a shared branded email layout with restrained accent colours, clear typography, mobile-friendly spacing and a prominent login button; provide a plain-text equivalent.
- Send only after the permission change succeeds, never when a draft is reviewed. Avoid duplicate notifications on retries and make delivery failures visible to the granting administrator.
- Never include passwords, unnecessary personal information, or localhost links. Verify the existing authentication and email workflows before implementing URLs or triggers.
- During the read-only preview, build a reviewable email preview without saving permissions or sending email. Actual delivery and the full email-template migration are pending implementation.

## Second review batch: proposed event operations

Added section 05 in the user drawer. Includes View only, Event manager and Draw operator action presets; collapsible action groups; explicit existing/allow/block choices; confirmation before replacing draft choices with a preset; review/reset/discard integration; and an event-specific proposed-policy check.

The operation inventory was traced to CalendarManager (event edits, visibility, deletion), ManualEventRegistrations (team and manual/complimentary payment changes), and NativeDrawManager (draft preparation, publication, scheduling, live status, results, completion and ranking awards).

The twelve action choices are a separate in-memory proposal, not new fields in the legacy database schema. Presets do not grant module access or change memberships/event assignments. For custom accounts, the check rejects unassigned events even when an action is proposed as allowed. Super-admin override and unknown existing-backend decisions are explicit. Organisation/club inherited authority is not simulated as verified access.

Verification: six action-policy tests and focused lint pass; production build passes. Browser synthetic workflow verified preset confirmation/application and an outside-assignment event returning blocked. Backend enforcement, action persistence, lifecycle validation and notification delivery remain pending.

Review: open a custom user's drawer → 05 Event operations → choose Event manager → Use preset in draft. Expand groups and adjust individual choices. Expand Check a proposed action and compare assigned/unassigned events. Review draft includes all proposed action rules; Reset clears them.
