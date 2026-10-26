# Payouts read-only review checkpoint

Route: `/admin-preview/payouts`, Money → Payouts.

Implemented: paginated recorded organiser payment table; event/organiser names;
search; inclusive payment-date filters; record-quality filter; loading, timeout,
retry, empty and unreadable-record states; accessible right-side details drawer;
Excel export of all matching rows and a separate unreadable-event sheet.

Source: `calendar.organiser_interim_payments`, matching the existing event
finance recorder. Amounts are positive Rand values, converted to integer cents.
Malformed values and duplicate per-event record IDs remain visible as warnings.
Null lists mean no recorded rows; malformed lists are explicitly reported.

Access: signed-in super-admin, All 4M Padel only. Minimal column projection,
abortable paginated reads, no database mutation or email calls. Parent route keys
isolate identity/scope; pending exports are cancelled on context change/unmount.

Not implemented or claimed: verified bank settlement, approval queue, payout
request sending, transfers, edits, remaining-balance calculations or delegated
access. Existing request workflow emails administrators and optionally logs an
activity; those are not reliable approval/payment statuses.

Validation: 125 Node tests passed; production build passed (existing bundle and
CSS warnings remain); synthetic browser suite checks drawer focus restoration,
Tab/Shift-Tab, Escape, mobile overflow, reduced motion, search, quality filter,
pagination, all-page export and empty/error/issue/access states. Real account
data is left for the user's review; no production mutations were performed.

Review: search an organiser/event; open a record; reset dates to see undated
records; select Needs review; export and inspect both payout and issue sheets.
