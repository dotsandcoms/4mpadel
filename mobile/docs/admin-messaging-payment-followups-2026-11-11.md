# Admin messaging, authenticator and payment follow-ups

Website deployment: `dpl_7XMsbbb8FtVPQf49jqtJutukiyCf`, promoted to
[4mpadel.co.za](https://4mpadel.co.za) on 11 November 2026.
No mobile build or Apple submission was performed. Internal iPhone build 42 is
still the current shared build; Apple submission remains on hold.

## Authenticator setup

The website shows the signed-in email and explains that each login email needs
its own authenticator entry. A new email with no verified factor gets the
three-step setup, local QR code and same-phone setup key. Returning accounts get
instructions for their exact email, first-time guidance and recovery help.
There is no reset, factor removal or MFA bypass in this change.

Account switches clear factors, enrollment secrets, codes, verification and
event data. Delayed responses from the previous account are discarded.

## Super Admin intervention

Server-verified Super Admins can search retained event channels across
organisations and post to cancelled/closed events when intervention is needed.
Other roles keep their existing event/organisation permissions. MFA, active
account/session checks, eligibility, rollout switches, private-chat membership
and the existing 90-day event retention boundary still apply.

The UI identifies global access and explains that posts show the actual sender
with the Admin role. Event access has a server audit record (per actor/event,
at most once per hour); existing send/moderation audit records remain in place.
The private audit table and internal permission helpers remain unavailable to
clients.

Migration source: `20261111082951_messaging_super_admin_event_intervention.sql`.
Hosted migration version: `20261111084817`.

## Correcting an already-paid manual receipt

The Event Manager method selector is enabled for explicitly admin-recorded,
exactly linked, successful paid event receipts, including legacy Paystack
offline-fix classifications. The RPC checks the caller's current finance/event
permission and active session, locks the receipt and entry, and updates both
methods together. It preserves the amount, currency, reference, paid status and
other metadata; a required note and before/after values are audited server-side.
Audit failure rolls back the entire correction.

Verified provider receipts, checkout quote receipts, complimentary entries and
unlinked receipts cannot use this method correction. A manual correction cannot
create a Paystack charge. The existing historical recipient-only workflow is
retained; refunded/withdrawn entries are not reinstated.

Migration source: `20261111083129_correct_paid_manual_event_payment_method.sql`.
Hosted migration version: `20261111084835`.

## Verification

- 118 focused website/admin/checkout tests passed, including real-browser
  account switching, delayed-factor responses, paid-method correction and
  correction rejection. QR codes remain local and verification remains required.
- 186 isolated payment/permission SQL assertions passed, including cross-event,
  payer, expired-session, provider immutability, linkage and atomic-audit failure.
- Messaging SQL passed, including Super Admin cross-organisation access,
  MFA rejection, real sender role, closure override, ordinary admin scope,
  spoofed user metadata, private chat denial and retention.
- All 66 Data API table contracts, four sequences and column/role/RLS scenarios
  passed with automatic grants disabled; migration source checks passed.
- No new lint findings compared with HEAD. Existing lint findings in the
  affected legacy files remain unchanged.
- Hosted function grants/search paths, audit event column and the enabled
  financial integrity guard were verified after deployment. Security advisor
  categories and counts are unchanged; this is not a closure of the remaining
  contact-privacy/raw-table cutover documented in the main audit.

Logs: `/tmp/fourm-admin-followups-final-tests.log`,
`/tmp/fourm-payment-method-correction-db.log`,
`/tmp/fourm-super-admin-messaging-db.log`.
The website used a reviewed 800-file stage; it contains no env files, CSV exports
or native archives. Original messaging function definitions were saved with
owner-only access in `/tmp/fourm-admin-followups-pre-deploy-functions-20261111.json`.
No live player message, payment correction, provider charge or refund was made
as part of verification. Roll back via reviewed forward migrations and a
coordinated website release; do not replay historical migrations.
