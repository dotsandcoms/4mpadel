# Event Manager parity — 22 September 2026

The preview is NOT a complete replacement for the existing Event Manager.

## Payment handoff implemented

Individual player cards now open EventPaymentDialog in the new UI for mark paid,
comp, and eligible admin-payment reversal. Shared manualEntryPayment persistence
is called by both old and new UI; the legacy-screen handoff has been removed.
The preview re-reads registration/payment state before saving. Closing after a save
attempt refreshes data; viewing or cancelling without a save does not.
Requires an authenticated super-admin, no fixture, account-wide scope. The save
boundary rechecks identity and the permission record; it never auto-confirms.
Existing RLS still governs database operations; no elevated client credentials.

Existing source requires a note, supports EFT/cash/manual/external/comp, stores a
comp as a zero-value manual ledger payment with metadata, and logs activity.
Only explicit admin-marked payments are eligible for unmark; this is not a refund.
Legacy writes are multiple requests, not transactional: registration can update
before payment/audit failure. An atomic backend operation remains necessary before
claiming hardened payment writes. No live payments were changed during testing.

## Remaining functionality audit

| Existing source capability | Preview gap |
| --- | --- |
| Add player / team | Shared provisional-entry save connected in new UI; pending status, reciprocal team rows, optional audit note, existing registration emails. Real super-admin gate only. No live-save test performed. |
| Link solo entry / invite partner | New-UI pairing and directory invitation connected through shared helpers; fresh super-admin, registration/profile/division checks, pending invitation, existing notification templates. Nontransactional writes. |
| Move individual or whole team, fee differences | Shared legacy move implementation connected to new-UI confirmation; fresh super-admin and registration checks. Team actions move the pair; solo actions move one entry. Multi-request, not transactional. |
| Withdraw/remove and refund handling | New-UI confirmation uses shared admin_remove refund service calls; explicit no-refund, refund, or offline-refund selection. Fresh super-admin/entry checks. Team requests are sequential, not atomic. No live refund tests. |
| Notes and manual payment reversal | Player cards and table remove-comp share the new-UI payment dialog and verified save boundary; eligible admin payments only |
| RankedIn mapping and sync | New-UI explicit live confirmation invokes existing edge function; current link verification, mapping/skips/partial error display. No live sync test performed. |
| Draw preparation, publishing, results | Inspection only |
| Event setup and communication | Basic event name/contact editor connected, with snapshot checks and review. Weekly/amendment workflows blocked. Full setup/publishing and broadcasts remain unconnected. |
| Interim settlement / payout actions | Demo request |

Finish and test these workflows explicitly. Do not infer parity from rendered
buttons or prototype success messages. Delegated payment permissions need verified
backend scope checks before enabling the new handoff for non-super-admin users.

## 22 September integration review

Shared move logic now preserves both player cover changes on bundled payments,
mirrors the partner's resulting pending status on higher-fee moves, and surfaces
unlink failures. Shared invitations reflect the inviter's actual payment status.
Refund results now surface needs-attention/skipped warnings even on HTTP success.

Draw draft persistence still deletes/reinserts across separate requests; a shared
transactional backend is recommended before porting full draft writes. Broadcast
audience queries and retry handling need correction before porting sending; see
EVENT-SETTINGS-INTEGRATION.md. No migrations or live mutations were performed.

## 22 September: event / division cancellation

Event options now exposes native cancellation dialogs for verified super-admins
on 4M-hosted events. Whole-event cancellation invokes the existing paystack-refund
cancel_event action. Division cancellation closes is_active first (retaining
history), then uses admin_remove for each active matching registration, including
legacy name-only division links. It does not delete division records or infer
imported participant IDs as registration IDs. Both paths require confirmation,
block repeat submission after uncertain results, and refresh only after an attempt.

Division closure and withdrawals are not one transaction. A stopped operation
leaves the division closed and reports that remaining entries/refunds need review.
An atomic server-side close-and-queue workflow is a recommended follow-up for
concurrent admin/checkout safety and resumable bulk operations. The existing
whole-event backend also warrants paginated, fail-closed registration reads before
large-event usage; its behaviour has not been rewritten or deployed in this change.
Mock browser checks cover desktop/mobile, refund warnings, settings entry points,
and no refresh on unsubmitted close. No live cancellations or refunds were run.

## 22 September: imported event participant source

Event Manager defaults to Upcoming and retains ascending event dates. Imported
events now read tournament_participants in a separate read-only participant view,
matching the list snapshot source, instead of displaying an empty manual
event_registrations ledger. Search, division filtering, loading/error recovery,
and linked-profile licences are supported. Pairings are not guessed and manual
registration write actions are not exposed against imported participant IDs.

186 unit tests pass; build passes. Browser fixture verified all 49 fixture rows,
25 filtered Open rows, and the Upcoming default. This is not verification of
the live event's 48 versus 49 discrepancy; no RankedIn sync was triggered.

## 15 September: provisional entry save

148 unit tests pass. Mock browser check verifies review before save and pending
status. No live registrations or emails created. Team rows use one insert request.
Duplicate preflight mirrors legacy checks but does not prevent simultaneous requests
from two separate admins; database uniqueness/concurrency still needs verification.
Email/activity failure returns a saved result with warnings, not a retryable insert
failure. The existing provisional-add path does not validate licence eligibility;
this behaviour is retained rather than claiming a new licence check exists.
