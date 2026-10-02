# Native tournament payment return

New native Paystack transactions use the HTTPS callback at `native-event-checkout/return?event_id=<id>` (plus `mode=pay` for existing-entry payments). The callback validates the event/reference format and returns a 302 to the fixed `fourmpadel://events/register` route. It never accepts a caller-selected redirect destination and performs no payment or registration writes.

The app listens for the exact native return route and dismisses the iOS browser sheet. It restores the checkout saved for the current account/event/mode, requires its reference to match the return hint, and calls the existing authenticated `confirm-manual-payment` endpoint before showing success. Return parameters are not proof of payment. The server confirmation endpoint checks the payer and verifies payment independently. Payment-status recovery remains available when registration has closed; the flow does not attempt a new quote on a payment return.

A cancelled browser still leaves the saved checkout/status controls available. Checkouts initialized before this change retain their old callback URL; successful payments should never be paid again merely to test the redirect.

Verification: checkout tests verify the provider callback address, fixed destination, invalid-return rejection and no writes from the public redirect. Payment-return parser tests reject unrelated links. TypeScript and existing registration navigation tests pass. A deployed read-only callback probe returned HTTP 302 to the app route with Cache-Control no-store. A real paid round trip is still a device test; no payment was made by the agent.

iOS preview build 9 (`15101d1a-1402-4306-a920-9e6092da9aa1`) finished successfully on 28 September 2026. It includes this fix and the native Players directory/profile. Installation on the phone is not verified: the Mac's CoreDevice service timed out during the device check. Install from https://expo.dev/accounts/fourm-padel/projects/4m-padel/builds/15101d1a-1402-4306-a920-9e6092da9aa1 before testing a new checkout. This build supersedes the Players-only build 7.
