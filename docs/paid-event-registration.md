# Paid event registration

A new player-initiated pay-now checkout is not registration. Existing entries, staff-created entries, and events allowing register now/pay later keep their saved unpaid registrations. For new pay-now entries, the app and website state: “Your registration is only confirmed once payment is successful.”

- Checkout inventory lives in private holds, not the public registration roster. Holds expire after 30 minutes; repeated requests do not extend a live hold. Queries ignore expired holds even if cron is delayed.
- Cancelling a new pay-now attempt releases its checkout; that player starts registration again. Cancelling payment for an existing saved entry retains that entry for later payment. Checking payment status can recover a successful receipt without charging again.
- The verified payment worker locks the receipt and event inventory and confirms the covered entries atomically. An unpaid partner is not registered by naming them. Repeated callbacks cannot duplicate entries or confirmation emails.
- A payment received after its hold expired or was cancelled remains a successful financial receipt and is marked `registration_review_required`. It does not overbook the event, issue a licence or send an entry confirmation. The player is told to contact support before paying again.
- Temporary licences are purchased only as part of registration for a division requiring a licence, for that event. Annual licences remain available separately. Licence activation occurs in the same transaction as paid registration.
- Registration, partner-paid and payment confirmation emails check the actual confirmed entry before delivery. A paid first division cannot authorise confirmation of an unpaid second division. Partner invitations are sent only after the inviter is confirmed and ask the partner to register and pay.

The rule applies only going forward. Historical unpaid entries remain saved and payable. Authorised event staff can add unpaid players and teams regardless of the player checkout policy. Event setup exposes the existing `weekly_payment_policy` values for both weekly and tournament events: `pay_now` or `allow_reserve`. The separate `allow_payments_after_close` setting controls whether existing entries can start payment after their entry deadline; new registration stays closed. No historical migrations are replayed.

## Access and verification

The hold and policy tables are private, with RLS enabled and all client/service table access revoked. Authenticated state/cancel RPCs check the signed-in account. Only the service role can call paid finalisation. The public roster view exposes accepted paid and unpaid entries with sanitised fields and hashed contact identifiers. Private abandoned checkout holds remain absent.

The mobile regression fixtures and commands below live on `brad/mobile-messaging`. Run from that checkout’s `mobile` directory:

```sh
npm run test:registration:db
npm run check
node scripts/test-checkout.cjs
```

The database runner uses a disposable local PostgreSQL cluster and synthetic accounts; it never reads production credentials, charges money or sends emails. It covers access isolation, holds, capacity, cancellation/expiry, callback retries, legacy cleanup, unpaid partners and event-only licence issuance. The Data API audit also checks both migration directories with automatic grants disabled.

Run from the repository root:

```sh
node --test tests/manualEventPayment.test.mjs tests/registrationPaymentEmail.test.mjs tests/paymentProviderBinding.test.mjs
npm run test:data-api
npm run test:data-api:db
npm run build
```

## 17 November rollout

The production database migrations are `20261117101743_paid_registration_checkout_holds` and `20261117101927_checkout_hold_division_index`. The scheduled expiry job runs every minute. The initial retrospective conversion of 35 entries was corrected by `20261117105019_restore_existing_unpaid_entries_and_admin_access`: 34 original unpaid entries were restored and one newer paid replacement preserved. Other unpaid rows hidden by the paid-only roster filter are visible again. Recovery preserved payments and later player actions, suppressed new-entry announcements, and restored every trigger’s prior mode.

Deployed functions: `send-email` 78, `confirm-manual-payment` 38, `paystack-webhook` 44, `native-event-checkout` 23 and `native-license-checkout` 8. The email deployment applies only this payment guard and invitation copy to the deployed source, preserving the separately deployed payout template. Existing JWT settings were retained.

Local validation: 214 database assertions; 41 server/email/provider tests; 37 native event checkout tests; 23 licence tests; 15 registration navigation tests; the full mobile typecheck/test suite; production website compilation; and 72 Data API table contracts with four sequences and FIP column restrictions.

Mobile source is prepared for the next internal test build. No new app binary or Apple submission is part of this rollout.

Registration also loads the saved Playtomic level from the private profile RPC. A missing rating or RankedIn account does not block entry. Missing name/mobile number is explained next to Continue, and returning from the profile editor refreshes those details without resetting the registration.

The follow-up pay-later API checks the saved event policy, saves all entries atomically under the normal account/RLS/capacity/access rules, and sends no payment confirmation before payment. An accepted unpaid entry has no 30-minute expiry. Required licences are reviewed and purchased with that event’s later payment. Both website and mobile cancellation retain an existing saved entry.

The latest pay-later recovery is prospective only: no cleanup job withdraws legacy registrations. Saved entries and staff-added teams remain payable. The new event payment-policy API and UI retain that distinction independently of the allow-payments-after-close setting.
