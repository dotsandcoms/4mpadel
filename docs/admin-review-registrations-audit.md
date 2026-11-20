# New Admin registration actions

Compare the current Admin’s **Teams** and **Registrations List** in `ManualEventRegistrations.jsx` with the New Admin **Registrations** workspace and the selected event in **Event Manager**. This inventory follows the actual action entry points and their saved effects.

| Current action | New Admin entry point | Evidence |
| --- | --- | --- |
| Select an event | Registration event picker | The picker lists authorised events. A missing or foreign event ID makes no registration request. |
| Add a player or team | Add registration, then the Event Manager entry dialog | Choose a division, review the pending amount and save to the exact event. Checkout uses the stored player payment link. |
| Search and refine the list | Search, quick state, recorded payment, licence, division, and sort controls | The selected event supplies player and partner records. Withdrawn is a separate filter from refunded. Previous and Next use the filtered result count. |
| Select, clear, download or message | Page and individual selection, Export view, Export selected, Clear selection and Open event messages | Exports use the selected event and escape CSV formulas. Messaging requires its own workspace access. |
| Review player, partner and contact details | Open the registration drawer | The drawer shows details from this registration. The broader player directory link requires Players access. |
| Match a profile name | Match profile name | The exact email and player ID must match. The transaction updates the registration display name with an event audit entry and preserves the checkout and receipt details. |
| Replace a player, pair, split, merge, move or remove | Replace player / Change profile or Manage this entry | The registration and event are explicit. Each operation uses its own authorised service and review. Verified paid transfers must preserve the original checkout and its payment evidence. |
| Mark paid, comp, unmark or correct manual collection | Manage this entry and the event’s payment actions | The platform payment guard rechecks the exact event and record. |
| Correct a withdrawn manual receipt | Correct withdrawn receipt | One uniquely linked receipt is required. The amount and withdrawn status are preserved. Receipts with active or completed refunds use the refund workflow. |
| Review recorded funds and refunds | Recorded payment in the drawer | The verified platform workspace may read exact event receipts and refunds. Tenants can see recorded registration states for their own event. |
| Open a recorded payment link | Resolve payment | The recovery path uses a saved eligible checkout token. |
| Retry a failed refund | Retry failed refund or Record cash refund | The database reserves the reviewed amount before the provider request. Concurrent attempted reservations respect the original gateway charge and eligible ledger components. |
| Check an uncertain refund | Check Paystack status | Uses the saved refund reference. Missing exact evidence remains in review. An additional refund request is never submitted by this check. |
| Update the WhatsApp checklist | Update group record | The update checks the event, row status and previous value. It updates the checklist. |
| Handle imported RankedIn entrants | Open imported participants | The exact event opens its Dashboard or Table. Filters, roster review, payment actions and verified Excel export have their own permissions. |

`tests/adminDesignRegistrations.test.mjs` exercises the actual workspace, drawer, negative tenant cases, scoped mutations, refund hold and reconciliation. `tests/adminDesignRegistryHistory.test.mjs` and `tests/adminRegistryProfileAndReceipt.sql` cover stale snapshots and the single approved write. `tests/adminReviewedRefundRetry.sql` verifies the held refund and allowance contracts. Provider substitutes and synthetic records cover external calls and payments. This evidence does not record live refunds or customer communications.
