# Event details and advanced workflow integration

## Current production path

AdminPreview opens AdvancedEventDetailsDialog, which loads verified snapshots then
renders EventBuilder with theme="preview". The live JSX is shared directly:
there is no second tab layout or manually regrouped field catalogue. Scoped
EventBuilderPreview.css applies the new admin presentation. Calendar retains its
existing theme. State, transformations, validation, buildPayload and handleSave
are shared too. The former NativeEventEditor was removed to prevent layout drift.

Tabs, in live order: Basics, Registration, Federation, Divisions,
Media & Branding, Review & Publish. Fields, collapsible groups, conditional
visibility and Back / Save draft / Next actions come directly from live JSX.
Weekly events skip Federation and Divisions just as on the live site.
Co-admins stay in Basics, ranking fields in Divisions, and sanctioning/rules/
points/prizes in Federation. There is no Advanced workflows tab.
The visual lock is the established new admin:
white surface, existing typography/button tokens, responsive two-column fields,
image previews, shared WYSIWYG and Google Places/club lookup. The better-ui skill
guided theme consistency; no separate dark editor is opened.

Advanced workflows connected:

- Approved organisation search/link/unlink with existing contact/logo/bank prefills.
- Co-admin player lookup and email chips using the original picker controller.
- Federation requests, SAPA tiers and formatted sanctioning content.
- Explicit save-without-publishing or publish/submit action, followed by review.
- Website visibility, featured/recent-results flags, tournament tag and league flag.
- RankedIn link editing (sync remains a separate confirmed action).
- Ranking tier/category per division, winner points and rankings-updated date.
- Prize breakdown rows and the existing match-to-divisions helper.
- Pending/rejected nonweekly amendments: proposed fields/divisions are loaded,
  changes reviewed, then the original save logic applies and clears the amendment.
- Weekly mode/policy and series-wide shared settings/date shifts with affected
  occurrences shown. Weekly saves do not persist divisions, matching source.

## Save safety and known boundaries

loadEventAdvancedSnapshot reads complete event/division/weekly records with
pagination. verifyEventAdvancedAccess checks fresh super-admin identity and
compares full originals immediately before writing; media uploads also preflight.
Imported/cancelled events cannot be edited. Any cancelled/imported weekly sibling
blocks the cascade, which otherwise could overwrite its cancellation status.
Amendment division IDs must belong to the event. New UI preserves existing
names; division cancellation/refunds remain their own confirmed workflow.

Division cancellation now uses the main checkout's dedicated `cancel_division`
action, rather than closing the division and removing registrations client-side.
The preview retains fresh permission checks and disallows blind retries after an
uncertain response. Cancellation reasons and refund-attention results are shown
in the new UI; already-cancelled divisions cannot be submitted again.
The matching refund handler, notification template, helper and
`20260914160000_division_cancellation.sql` migration were brought over from the
main checkout. These changes have not been deployed or applied to a database.
Mocked desktop (1440px) and mobile (390px) confirmation checks pass with external
requests blocked. Edge-function type checking remains unverified because its
remote Deno imports were unavailable in the offline check.

Weekly pending amendments are explicitly blocked: the original series helper
strips amendment metadata, so applying them safely needs an explicit approval
policy. No guessed metadata-clearing behaviour was introduced.

The live Review & Publish checklist gates publishing; draft saves keep the live
draft validation. Successful saves reload the optimistic baseline so the editor
can remain open as on the live site. Attempted writes refresh on close;
viewing/closing alone does not. Failed writes cannot be resubmitted blindly.

Existing saves are multiple nontransactional requests. Fresh comparison is an
optimistic preflight, not an atomic database lock. A mid-save failure can leave
partial writes. A transactional server-side save with version checks is the
recommended follow-up, not silently substituted here. Division-delete failures
now surface instead of being ignored. Existing fees/payments are not recalculated,
RankedIn is not automatically synced, and no emails are sent by this editor.

Media associations save with the event; selecting files uploads immediately as
on the live editor. Removing a draft item does not delete its stored asset.
Google suggestions use the existing loader and ZA mappings inside the native
dialog top layer. Image previews and formatted content also appear in review.

## Verification

- Unit suite includes event-advanced-guard.test.mjs: fresh role, cancellations,
  imported rows, nested amendments, division and weekly sibling conflicts.
- event-advanced-engine-qa.html/.jsx exercises the actual EventBuilder controller
  with network responses intercepted: draft, publish, sanctioning, amendments,
  weekly cascading, preflight denial, load failure and write failure.
- The browser runner compares all six tab field layouts between live and preview
  themes, verifies desktop/mobile overflow and exercises Save draft in the new theme.
- No real database writes, publish, emails, refunds or external sync in QA.

## Communications audit (not implemented)

Source: `src/components/admin/EmailBroadcastManager.jsx` and
`supabase/functions/send-email/index.ts`.

The existing broadcast workflow:

1. Reads active `event_registrations` for selected events. Optional payment and
   partner filters apply to these registrations.
2. Includes `tournament_participants` only when no payment/partner filter applies.
3. Combines manually entered addresses and explicit exclusions.
4. Shows recipient count and requests confirmation.
5. Sends chunks of 49 BCC recipients through `send-email`, `template: broadcast`.
   The function adds one To address, so batches stay at 50 total addresses.
6. Offers a separate test-email action, also a real external send.

Issues to discuss before porting/improving behaviour:

- Audience reads are unpaginated; large events can have incomplete recipients.
- Read errors currently log and continue, allowing a partial audience to be sent.
- Email deduplication is case-sensitive.
- Partial sends have no client-visible per-batch retry checkpoint/idempotency key;
  a retry can resend already delivered batches.
- Server broadcast authorization accepts an admin-permissions row, not a specific
  event scope. Do not infer that event-scoped administration grants broadcast
  authority without reviewing this policy.

These findings are evidence from source code, not proof of currently deployed
function behaviour. No broadcast, test email or deployment was triggered.
