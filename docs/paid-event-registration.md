# Paid event registration

Online checkout is not registration. The app and website state: “Your registration is only confirmed once payment is successful.”

- Checkout inventory lives in private holds, not the public registration roster. Holds expire after 30 minutes; repeated requests do not extend a live hold. Queries ignore expired holds even if cron is delayed.
- Cancelling releases the checkout. An unpaid player starts registration again. Checking payment status can recover a successful receipt without charging again.
- The verified payment worker locks the receipt and event inventory and confirms the covered entries atomically. An unpaid partner is not registered by naming them. Repeated callbacks cannot duplicate entries or confirmation emails.
- A payment received after its hold expired or was cancelled remains a successful financial receipt and is marked `registration_review_required`. It does not overbook the event, issue a licence or send an entry confirmation. The player is told to contact support before paying again.
- Temporary licences are purchased only as part of registration for a division requiring a licence, for that event. Annual licences remain available separately. Licence activation occurs in the same transaction as paid registration.
- Registration, partner-paid and payment confirmation emails check the actual confirmed entry before delivery. A paid first division cannot authorise confirmation of an unpaid second division. Partner invitations are sent only after the inviter is confirmed and ask the partner to register and pay.

The forward migration converts current/future unpaid platform checkouts with saved payment carts into holds, retaining the old registration as a withdrawn audit row. It preserves paid, complimentary, manual/EFT and historical entries. No historical migrations are replayed.

## Access and verification

The hold and policy tables are private, with RLS enabled and all client/service table access revoked. Authenticated state/cancel RPCs check the signed-in account. Only the service role can call paid finalisation. The public roster view continues to expose sanitised fields and hashed contact identifiers.

Run from `mobile`:

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

The production database migrations are `20261117101743_paid_registration_checkout_holds` and `20261117101927_checkout_hold_division_index`. The scheduled expiry job runs every minute. Thirty-five current/future abandoned online entries were converted without changing payment amounts or successful receipts.

Deployed functions: `send-email` 78, `confirm-manual-payment` 38, `paystack-webhook` 44, `native-event-checkout` 21 and `native-license-checkout` 8. The email deployment applies only this payment guard and invitation copy to the deployed source, preserving the separately deployed payout template. Existing JWT settings were retained.

Local validation: 214 database assertions; 41 server/email/provider tests; 37 native event checkout tests; 23 licence tests; 15 registration navigation tests; the full mobile typecheck/test suite; production website compilation; and 72 Data API table contracts with four sequences and FIP column restrictions.

Mobile source is prepared for the next internal test build. No new app binary or Apple submission is part of this rollout.

Registration also loads the saved Playtomic level from the private profile RPC. A missing rating or RankedIn account does not block entry. Missing name/mobile number is explained next to Continue, and returning from the profile editor refreshes those details without resetting the registration.
