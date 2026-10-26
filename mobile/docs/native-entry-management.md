# Native entry management

The event's Manage partners / entry details button opens a native sheet. It shows each entry, partner, payment status and saved shirt size. Open entries offer native partner removal, solo-entry partner addition, division switching and withdrawal. Closed entries remain viewable without editing controls.

Partner removal reuses the authenticated paystack-refund remove_partner action. The confirmation explains that the partner entry is withdrawn, any applicable refund goes to its original payer, and the player's own entry remains active. Only the booking owner sees removal. The backend still enforces authorization and deadlines. Changing a partner follows removal, then addition.

Adding a partner opens the existing native registration flow for the selected solo entry. It restores the entry's shirt and sponsor details, keeps its division selected, and uses the existing checkout quote and payment confirmation services. Existing paid entry fees are not charged again. Private event access and registration deadline checks still apply.

There are no website links in this component. Higher-fee division switches now open `/events/switch-division` to review the server-calculated difference, pay through the in-app payment browser and verify the payment before completing the switch. See `native-division-switch.md`.

Validation: TypeScript and the existing test suite passed. Additional rendered-component tests cover native sheet navigation, remove_partner invocation, add-partner routing and closed-entry behavior. Registration tests cover restoring the selected solo entry; checkout tests verify only the added partner is charged when the player's own entry is paid. No real partner was removed and no payment was made during validation.

The iOS preview build was uploaded on 28 September 2026:
https://expo.dev/accounts/fourm-padel/projects/4m-padel/builds/3fd27144-0f47-4d01-bd19-39eae98fba5b
Build completion and installation are not yet verified.
